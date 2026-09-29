/**
 * Slack connection actions for the signed-in user.
 *
 *   status      → is a workspace connected, which one, and where do summaries go
 *   channels    → the channels this bot token can actually post to
 *   set_channel → choose the destination (validated against `channels`)
 *   disconnect  → delete the row, and revoke the token in Slack
 *   set_auto_post → post every completed meeting, or only the ones sent by hand
 *   post        → send one meeting's summary now (the meeting page's button)
 *   status + meeting_id → also says whether that meeting reached the channel
 *
 * Service-role client behind a user JWT: `slack_connections` has SELECT-only
 * RLS for `authenticated`, because a browser must never be able to UPDATE a
 * token column. Every read and write here is scoped to `caller.userId`, taken
 * from the JWT and never from the body.
 *
 * `set_channel` deliberately re-lists the channels and matches the requested id
 * against that list rather than writing whatever was posted. The integration
 * removed in 2026-08 let users paste a raw channel ID, which meant a typo was
 * indistinguishable from a working configuration until a meeting silently
 * failed to deliver weeks later.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPrelight } from "../_shared/cors.ts";
import { authenticate } from "../_shared/auth.ts";
import { checkRateLimit, createRateLimitResponse, RATE_LIMITS } from "../_shared/rate-limit.ts";
import { openConnectionTokens } from "../_shared/oauth-tokens.ts";
import { listChannels, revokeToken, SlackError, FATAL_SLACK_ERRORS } from "../_shared/slack.ts";
import { deliverToSlack } from "../_shared/slack-delivery.ts";
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

    const limit = await checkRateLimit(`slack-manage:${userId}`, RATE_LIMITS.API);
    if (!limit.allowed) return createRateLimitResponse(limit, corsHeaders);

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const action = typeof body.action === "string" ? body.action : "status";

    const { data: row } = await supabase
      .from("slack_connections")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    /** What the UI is allowed to see. Never a token, sealed or not. */
    const publicView = (r: Record<string, any> | null) =>
      r
        ? {
            connected: true,
            team_id: r.team_id,
            team_name: r.team_name,
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
        meeting_delivery: await deliveryState(supabase, "slack_deliveries", meetingId, userId, row.channel_id ?? null),
      });
    }

    if (!row) return json({ error: "Slack is not connected" }, 404);

    if (action === "set_auto_post") {
      if (typeof body.auto_post !== "boolean") return json({ error: "auto_post must be true or false" }, 400);
      const { error: updateError } = await supabase
        .from("slack_connections")
        .update({ auto_post: body.auto_post, updated_at: new Date().toISOString() })
        .eq("id", row.id)
        .eq("user_id", userId);
      if (updateError) {
        console.error("[manage-slack] auto_post update failed:", updateError);
        return json({ error: "Could not save the setting. Try again." }, 500);
      }
      return json({ auto_post: body.auto_post });
    }

    if (action === "post") {
      if (!meetingId) return json({ error: "meeting_id is required" }, 400);
      const loaded = await loadMeetingForPost(supabase, userId, meetingId);
      if (loaded.error) return json({ error: loaded.error }, loaded.status);
      if (row.channel_id) await clearFailedClaim(supabase, "slack_deliveries", meetingId, row.channel_id);

      const result = await deliverToSlack(supabase, loaded.meeting!, loaded.insights!, { manual: true });
      const delivery = await deliveryState(supabase, "slack_deliveries", meetingId, userId, row.channel_id ?? null);
      if (result.posted || result.reason === "already_posted") {
        return json({ posted: true, already: !result.posted, meeting_delivery: delivery });
      }
      return json({ error: describeReason(result.reason, "Slack"), meeting_delivery: delivery }, 409);
    }

    if (action === "disconnect") {
      // Delete first. If the revoke fails we have still disconnected, which is
      // what the user asked for; the reverse order could leave a row the user
      // believes is gone.
      const { error: delError } = await supabase
        .from("slack_connections").delete().eq("id", row.id).eq("user_id", userId);
      if (delError) {
        console.error("[manage-slack] delete failed:", delError);
        return json({ error: "Could not disconnect. Try again." }, 500);
      }
      try {
        const open = await openConnectionTokens(row);
        if (open?.access_token) await revokeToken(open.access_token);
      } catch (err) {
        console.warn("[manage-slack] token revoke failed (row already deleted):", err);
      }
      return json({ connected: false });
    }

    // Both remaining actions talk to Slack, so they need the token open.
    const conn = await openConnectionTokens(row);
    if (!conn?.access_token) return json({ error: "Slack connection is missing its token. Reconnect." }, 409);

    const withSlack = async <T>(fn: () => Promise<T>): Promise<T | Response> => {
      try {
        return await fn();
      } catch (err) {
        const code = err instanceof SlackError ? err.slackCode : "unknown";
        if (FATAL_SLACK_ERRORS.has(code)) {
          // Same rule as the delivery path: a dead grant becomes a visible
          // "reconnect" state rather than a call that quietly keeps failing.
          await supabase.from("slack_connections")
            .update({ needs_reconnect: true }).eq("id", row.id);
          return json({ error: "Slack disconnected this app. Please reconnect.", code }, 409);
        }
        console.error(`[manage-slack] ${action} failed:`, code);
        return json({ error: "Slack request failed.", code }, 502);
      }
    };

    if (action === "channels") {
      const result = await withSlack(() => listChannels(conn.access_token as string));
      if (result instanceof Response) return result;
      return json({ channels: result });
    }

    if (action === "set_channel") {
      const channelId = typeof body.channel_id === "string" ? body.channel_id.trim() : "";
      if (!channelId) return json({ error: "channel_id is required" }, 400);

      const result = await withSlack(() => listChannels(conn.access_token as string));
      if (result instanceof Response) return result;

      const match = result.find((c) => c.id === channelId);
      if (!match) {
        return json(
          { error: "That channel is not one this app can post to. Pick it from the list, or invite the app to it in Slack." },
          400,
        );
      }

      const { error: updateError } = await supabase
        .from("slack_connections")
        .update({ channel_id: match.id, channel_name: match.name, updated_at: new Date().toISOString() })
        .eq("id", row.id)
        .eq("user_id", userId);
      if (updateError) {
        console.error("[manage-slack] channel update failed:", updateError);
        return json({ error: "Could not save the channel. Try again." }, 500);
      }
      return json({ channel_id: match.id, channel_name: match.name });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    console.error("[manage-slack]", err);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
