/**
 * Create, list, update and revoke share links for a meeting.
 *
 * Service-role client behind a user JWT: only this function can mint a valid
 * token hash, which is why `meeting_shares` has no INSERT policy. Every read
 * and write is scoped to a meeting the caller actually owns — checked here
 * explicitly rather than trusted from the body.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPrelight } from "../_shared/cors.ts";
import { authenticate } from "../_shared/auth.ts";
import { checkRateLimit, createRateLimitResponse, RATE_LIMITS } from "../_shared/rate-limit.ts";
import { generateShareToken } from "../_shared/share-token.ts";
import { openMaybe, sealMaybe } from "../_shared/crypto.ts";
import { recordAudit } from "../_shared/audit.ts";
import { ORG_SHARE_DEFAULTS } from "../_shared/org-share.ts";

const APP_URL = Deno.env.get("APP_URL") || "https://www.echobrief.in";

/** Expiry choices offered in the UI. `null` means the link does not expire. */
const ALLOWED_EXPIRY_DAYS = [1, 7, 30, 90, null] as const;

const SHARE_COLUMNS =
  "id, scope, org_id, token_prefix, token_sealed, expires_at, revoked_at, view_count, last_viewed_at, created_at, include_transcript, include_recording";

/**
 * The URL for a link whose token we can still open, or null for one minted
 * before 20260909150000 (hash-only — unrecoverable, and the dialog says so
 * rather than pretending). Those links still work; only their URL is lost.
 *
 * A failure to open is not an error the caller should see: the link still
 * works, it just cannot be displayed, and that is exactly the null case.
 */
async function shareUrl(row: Record<string, unknown>): Promise<string | null> {
  try {
    const token = await openMaybe(row.token_sealed as string | null);
    return token ? `${APP_URL}/share/${token}` : null;
  } catch (err) {
    console.warn("[manage-meeting-share] Could not open a sealed share token:", err);
    return null;
  }
}

/** A link row is live when it is neither revoked nor past its expiry. */
function isLive(row: Record<string, unknown>): boolean {
  if (row.scope !== "link" || row.revoked_at) return false;
  const expires = row.expires_at as string | null;
  return !expires || Date.parse(expires) > Date.now();
}

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

    const limit = await checkRateLimit(`share-manage:${userId}`, RATE_LIMITS.API);
    if (!limit.allowed) return createRateLimitResponse(limit, corsHeaders);

    const body = await req.json().catch(() => ({}));
    const action = body.action || "list";
    const meetingId = body.meeting_id;
    if (typeof meetingId !== "string" || !meetingId) {
      return json({ error: "meeting_id is required" }, 400);
    }

    // Ownership is established here, from the JWT, and never from the body.
    const { data: meeting } = await supabase
      .from("meetings")
      .select("id, title")
      .eq("id", meetingId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!meeting) return json({ error: "Meeting not found" }, 404);

    /** Every share row for this meeting, newest first. */
    const loadShares = async () => {
      const { data, error } = await supabase
        .from("meeting_shares")
        .select(SHARE_COLUMNS)
        .eq("meeting_id", meetingId)
        .eq("created_by", userId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Record<string, unknown>[];
    };

    /** The row as the browser should see it: no sealed token, plus the URL. */
    const present = async (row: Record<string, unknown>) => {
      const { token_sealed: _sealed, ...rest } = row;
      return { ...rest, url: await shareUrl(row) };
    };

    const expiryFromBody = () => {
      const days = body.expires_in_days === null || body.expires_in_days === undefined
        ? 7
        : Number(body.expires_in_days);
      const choice = ALLOWED_EXPIRY_DAYS.includes(days as never) ? days : 7;
      return choice === null
        ? null
        : new Date(Date.now() + Number(choice) * 86_400_000).toISOString();
    };

    /**
     * Seal the token for redisplay, or store nothing if sealing is impossible
     * (no TOKEN_ENCRYPTION_KEY). A key problem must cost the ability to show
     * the link again, never the ability to share the meeting at all.
     */
    const sealForRedisplay = async (token: string) => {
      try {
        return await sealMaybe(token);
      } catch (err) {
        console.warn("[manage-meeting-share] Could not seal the share token:", err);
        return null;
      }
    };

    /** Mint a link. `create` and `rotate` decide when that is the right move. */
    const mintLink = async () => {
      const { token, hash, prefix } = await generateShareToken();
      const { data, error } = await supabase
        .from("meeting_shares")
        .insert({
          meeting_id: meetingId,
          created_by: userId,
          scope: "link",
          token_hash: hash,
          token_prefix: prefix,
          // Sealed so the owner can be shown their own link again. The digest
          // above is still what the public path matches on; this copy is read
          // only for the owner's dialog.
          token_sealed: await sealForRedisplay(token),
          expires_at: expiryFromBody(),
          // What this link carries. An omitted flag narrows rather than widens:
          // the dialog always sends both explicitly.
          include_transcript: body.include_transcript === true,
          include_recording: body.include_recording === true,
        })
        .select(SHARE_COLUMNS)
        .single();
      if (error) throw error;

      // Hashed into the trail so a later share.viewed row can be tied back to
      // the moment this link was minted, and by whom.
      await recordAudit(supabase, {
        action: "share.created",
        actorType: "user",
        actorUserId: userId,
        actorToken: token,
        resourceType: "meeting",
        resourceId: meetingId,
        metadata: {
          share_id: data?.id,
          include_transcript: data?.include_transcript ?? false,
          include_recording: data?.include_recording ?? false,
        },
      }, req);

      return json({ share: await present(data), url: `${APP_URL}/share/${token}`, reused: false });
    };

    if (action === "list") {
      const rows = await loadShares();

      const { data: membership } = await supabase
        .from("org_members").select("org_id").eq("user_id", userId).maybeSingle();

      const links = await Promise.all(
        rows.filter((row) => row.scope === "link").map(present),
      );

      return json({
        shares: links,
        in_workspace: Boolean(membership),
        shared_to_org: rows.some(
          (row) => row.scope === "org" && row.org_id === membership?.org_id && !row.revoked_at,
        ),
      });
    }

    // A meeting gets ONE link from here on. Pressing "create" when it already
    // has a live one hands back the same URL with the requested settings
    // applied, instead of minting a second link nobody can tell apart from the
    // first. Links minted before this rule stay live and are listed separately.
    if (action === "create") {
      const rows = await loadShares();
      // Newest first, so this is the link the dialog is showing.
      const existing = rows.find(isLive);

      if (existing) {
        const patch: Record<string, unknown> = {};
        if (typeof body.include_transcript === "boolean") patch.include_transcript = body.include_transcript;
        if (typeof body.include_recording === "boolean") patch.include_recording = body.include_recording;
        if (body.expires_in_days !== undefined) patch.expires_at = expiryFromBody();

        let row = existing;
        if (Object.keys(patch).length > 0) {
          const { data, error } = await supabase
            .from("meeting_shares")
            .update(patch)
            .eq("id", existing.id as string)
            .select(SHARE_COLUMNS)
            .single();
          if (error) throw error;
          row = data as Record<string, unknown>;
        }
        const presented = await present(row);
        return json({ share: presented, url: presented.url, reused: true });
      }

      return await mintLink();
    }

    // Replace the link: the old URL stops working, a new one is minted. This is
    // the answer to "I lost the link" for a row that predates sealed tokens,
    // and to "that link got forwarded further than I meant".
    if (action === "rotate") {
      const rows = await loadShares();
      // Only the link being replaced. Older links from before this function
      // enforced one-per-meeting keep working until they are revoked
      // individually — rotating must not silently kill a URL somebody is
      // already holding and did not ask about.
      const current = rows.find(isLive);
      if (current) {
        await supabase
          .from("meeting_shares")
          .update({ revoked_at: new Date().toISOString() })
          .eq("id", current.id as string);
        await recordAudit(supabase, {
          action: "share.revoked",
          actorType: "user",
          actorUserId: userId,
          resourceType: "meeting",
          resourceId: meetingId,
          metadata: { share_id: current.id, reason: "rotate" },
        }, req);
      }
      return await mintLink();
    }

    // ---- share to / unshare from the caller's workspace --------------------
    // Same table, scope='org'. Grants colleagues everything the owner sees bar
    // the internal zones: summary and insights via the RLS policies from
    // 20260901200000, the meeting-zone transcript via `get-org-transcript`, and
    // the recording via `get-recording-media`. Both of those read the flags set
    // below through `_shared/org-access.ts` — a workspace share carries them on
    // by default, because a colleague is not a stranger with a link.
    if (action === "share_to_org" || action === "unshare_from_org") {
      const { data: membership } = await supabase
        .from("org_members").select("org_id").eq("user_id", userId).maybeSingle();
      if (!membership) return json({ error: "You are not in a workspace." }, 409);

      if (action === "unshare_from_org") {
        const { error } = await supabase
          .from("meeting_shares")
          .delete()
          .eq("meeting_id", meetingId)
          .eq("org_id", membership.org_id)
          .eq("scope", "org");
        if (error) throw error;
        return json({ shared_to_org: false });
      }

      const { error } = await supabase.from("meeting_shares").insert({
        meeting_id: meetingId,
        created_by: userId,
        scope: "org",
        org_id: membership.org_id,
        ...ORG_SHARE_DEFAULTS,
      });
      // 23505 = already shared to this workspace, which is the desired state.
      if (error && error.code !== "23505") throw error;
      return json({ shared_to_org: true });
    }

    // Change what an existing link carries, without invalidating it. Narrowing
    // takes effect on the next page view; widening one already in a stranger's
    // inbox is a real decision, which is why the dialog states it plainly.
    if (action === "update") {
      const shareId = body.share_id;
      if (typeof shareId !== "string" || !shareId) {
        return json({ error: "share_id is required" }, 400);
      }
      const patch: Record<string, unknown> = {};
      if (typeof body.include_transcript === "boolean") patch.include_transcript = body.include_transcript;
      if (typeof body.include_recording === "boolean") patch.include_recording = body.include_recording;
      // Expiry is editable on the live link too — otherwise "make this one last
      // longer" would mean minting a second link, which is the thing this
      // dialog no longer does.
      if (body.expires_in_days !== undefined) patch.expires_at = expiryFromBody();
      if (Object.keys(patch).length === 0) {
        return json({ error: "Nothing to update" }, 400);
      }
      const { data, error } = await supabase
        .from("meeting_shares")
        .update(patch)
        .eq("id", shareId)
        .eq("meeting_id", meetingId)
        .eq("created_by", userId)
        .eq("scope", "link")
        .select(SHARE_COLUMNS)
        .maybeSingle();
      if (error) throw error;
      if (!data) return json({ error: "Link not found" }, 404);
      await recordAudit(supabase, {
        action: "share.updated",
        actorType: "user",
        actorUserId: userId,
        resourceType: "meeting",
        resourceId: meetingId,
        metadata: {
          share_id: data.id,
          include_transcript: data.include_transcript,
          include_recording: data.include_recording,
          expires_at: data.expires_at,
        },
      }, req);
      return json({ share: await present(data as Record<string, unknown>) });
    }

    if (action === "revoke") {
      const shareId = body.share_id;
      if (typeof shareId !== "string" || !shareId) {
        return json({ error: "share_id is required" }, 400);
      }
      const { error } = await supabase
        .from("meeting_shares")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", shareId)
        .eq("meeting_id", meetingId)
        .eq("created_by", userId);
      if (error) throw error;
      await recordAudit(supabase, {
        action: "share.revoked",
        actorType: "user",
        actorUserId: userId,
        resourceType: "meeting",
        resourceId: meetingId,
        metadata: { share_id: shareId },
      }, req);
      return json({ revoked: true });
    }

    return json({ error: `Unknown action "${action}"` }, 400);
  } catch (err) {
    console.error("[manage-meeting-share]", err);
    return json({ error: err instanceof Error ? err.message : "Something went wrong" }, 500);
  }
});
