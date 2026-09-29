/**
 * ClickUp connection actions for the signed-in user.
 *
 *   status      → is an account connected, which workspaces, and where summaries go
 *   channels    → the Chat channels this grant can post to, across its workspaces
 *   set_channel → choose the destination (validated against `channels`)
 *   disconnect  → delete the row
 *   set_auto_post → post every completed meeting, or only the ones sent by hand
 *   post        → send one meeting's summary now (the meeting page's button)
 *   status + meeting_id → also says whether that meeting reached the channel
 *
 * Service-role client behind a user JWT: `clickup_connections` has SELECT-only
 * RLS for `authenticated`, because a browser must never be able to UPDATE a
 * token column. Every read and write here is scoped to `caller.userId`.
 *
 * `set_channel` re-lists the channels and matches the requested id against
 * that list rather than writing whatever was posted — the same rule as Slack,
 * for the same reason: a pasted id is indistinguishable from a working
 * configuration until a meeting silently fails to deliver.
 *
 * There is no revoke: ClickUp has no token-revocation endpoint. Disconnect
 * deletes our row (that row's existence IS "connected"); removing the app from
 * ClickUp itself is a step the docs describe.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPrelight } from "../_shared/cors.ts";
import { authenticate } from "../_shared/auth.ts";
import { checkRateLimit, createRateLimitResponse, RATE_LIMITS } from "../_shared/rate-limit.ts";
import { openConnectionTokens } from "../_shared/oauth-tokens.ts";
import { ClickUpError, isFatal, listChannels, type ClickUpWorkspace } from "../_shared/clickup.ts";
import { deliverToClickUp } from "../_shared/clickup-delivery.ts";
import { clearFailedClaim, deliveryState, describeReason, loadMeetingForPost } from "../_shared/manual-post.ts";

serve(async (req) => {
  const corsResponse = handleCorsPrelight(req);
  if (corsResponse) return corsResponse;
  const corsHeaders = getCorsHeaders(req.headers.get("origin"));
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const caller = await authenticate(req, supabase, corsHeaders);
    if (!caller.ok) return caller.response;
    const userId = caller.userId;
    if (!userId) return json({ error: "User token required" }, 403);

    const limit = await checkRateLimit(`clickup-manage:${userId}`, RATE_LIMITS.API);
    if (!limit.allowed) return createRateLimitResponse(limit, corsHeaders);

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const action = typeof body.action === "string" ? body.action : "status";

    const { data: row } = await supabase
      .from("clickup_connections")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    /** What the UI is allowed to see. Never a token, sealed or not. */
    const publicView = (r: Record<string, any> | null) =>
      r
        ? {
            connected: true,
            authed_email: r.authed_email,
            workspaces: Array.isArray(r.workspaces) ? r.workspaces : [],
            workspace_id: r.workspace_id,
            workspace_name: r.workspace_name,
            channel_id: r.channel_id,
            channel_name: r.channel_name,
            needs_reconnect: !!r.needs_reconnect,
            auto_post: r.auto_post !== false,
            last_posted_at: r.last_posted_at,
            connected_at: r.created_at,
          }
        : { connected: false };

    const meetingId = typeof body.meeting_id === "string" ? body.meeting_id : "";

    if (action === "status") {
      if (!meetingId || !row) return json(publicView(row));
      return json({
        ...publicView(row),
        meeting_delivery: await deliveryState(supabase, "clickup_deliveries", meetingId, userId, row.channel_id ?? null),
      });
    }

    if (!row) return json({ error: "ClickUp is not connected" }, 404);

    if (action === "set_auto_post") {
      if (typeof body.auto_post !== "boolean") return json({ error: "auto_post must be true or false" }, 400);
      const { error: updateError } = await supabase
        .from("clickup_connections")
        .update({ auto_post: body.auto_post, updated_at: new Date().toISOString() })
        .eq("id", row.id)
        .eq("user_id", userId);
      if (updateError) {
        console.error("[manage-clickup] auto_post update failed:", updateError);
        return json({ error: "Could not save the setting. Try again." }, 500);
      }
      return json({ auto_post: body.auto_post });
    }

    if (action === "post") {
      if (!meetingId) return json({ error: "meeting_id is required" }, 400);
      const loaded = await loadMeetingForPost(supabase, userId, meetingId);
      if (loaded.error) return json({ error: loaded.error }, loaded.status);
      if (row.channel_id) await clearFailedClaim(supabase, "clickup_deliveries", meetingId, row.channel_id);

      const result = await deliverToClickUp(supabase, loaded.meeting!, loaded.insights!, { manual: true });
      const delivery = await deliveryState(supabase, "clickup_deliveries", meetingId, userId, row.channel_id ?? null);
      if (result.posted || result.reason === "already_posted") {
        return json({ posted: true, already: !result.posted, meeting_delivery: delivery });
      }
      return json({ error: describeReason(result.reason, "ClickUp"), meeting_delivery: delivery }, 409);
    }

    if (action === "disconnect") {
      const { error: delError } = await supabase
        .from("clickup_connections").delete().eq("id", row.id).eq("user_id", userId);
      if (delError) {
        console.error("[manage-clickup] delete failed:", delError);
        return json({ error: "Could not disconnect. Try again." }, 500);
      }
      return json({ connected: false });
    }

    const conn = await openConnectionTokens(row);
    if (!conn?.access_token) return json({ error: "ClickUp connection is missing its token. Reconnect." }, 409);
    const workspaces: ClickUpWorkspace[] = Array.isArray(row.workspaces) ? row.workspaces : [];

    const withClickUp = async <T>(fn: () => Promise<T>): Promise<T | Response> => {
      try {
        return await fn();
      } catch (err) {
        const code = err instanceof ClickUpError ? (err.ecode || `http_${err.status}`) : "unknown";
        if (isFatal(err)) {
          // A dead grant becomes a visible "reconnect" state rather than a
          // call that quietly keeps failing.
          await supabase.from("clickup_connections")
            .update({ needs_reconnect: true }).eq("id", row.id);
          return json({ error: "ClickUp disconnected this app. Please reconnect.", code }, 409);
        }
        console.error(`[manage-clickup] ${action} failed:`, code);
        return json({ error: "ClickUp request failed.", code }, 502);
      }
    };

    if (action === "channels") {
      const result = await withClickUp(() => listChannels(conn.access_token as string, workspaces));
      if (result instanceof Response) return result;
      return json({ channels: result });
    }

    if (action === "set_channel") {
      const channelId = typeof body.channel_id === "string" ? body.channel_id.trim() : "";
      if (!channelId) return json({ error: "channel_id is required" }, 400);

      const result = await withClickUp(() => listChannels(conn.access_token as string, workspaces));
      if (result instanceof Response) return result;

      const match = result.find((c) => c.id === channelId);
      if (!match) {
        return json(
          { error: "That channel is not one this app can post to. Pick it from the list." },
          400,
        );
      }

      const { error: updateError } = await supabase
        .from("clickup_connections")
        .update({
          workspace_id: match.workspace_id,
          workspace_name: match.workspace_name,
          channel_id: match.id,
          channel_name: match.name,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id)
        .eq("user_id", userId);
      if (updateError) {
        console.error("[manage-clickup] channel update failed:", updateError);
        return json({ error: "Could not save the channel. Try again." }, 500);
      }
      return json({
        workspace_id: match.workspace_id,
        workspace_name: match.workspace_name,
        channel_id: match.id,
        channel_name: match.name,
      });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    console.error("[manage-clickup]", err);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
