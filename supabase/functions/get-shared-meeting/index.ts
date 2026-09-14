/**
 * Serve a shared meeting to somebody with no account.
 *
 * `verify_jwt = false`: the reader is anonymous by definition. The token in the
 * URL is the entire credential, which is why this function is deliberately
 * narrow about what it returns.
 *
 * What a share link always shows: the meeting-zone summary, decisions and
 * action items. What it shows only when the owner ticked that box on this
 * particular link: the meeting-zone transcript, and a short-lived playback URL
 * for the recording. What it never shows, whatever the URL says: the pre/post
 * meeting chatter that `zones.ts` works to exclude, attendee email addresses,
 * coaching notes, the verbatim quotes and sales-read lists inside `facts` (only
 * the `publicFacts` whitelist gets out), or anything about the owner's other
 * meetings.
 *
 * The two opt-ins are not the same risk and are not treated as such. The
 * transcript is filtered to `zone = 'meeting'` here, segment by segment, so the
 * text a stranger reads is the same text the summary was written from. The
 * recording cannot be filtered — Recall's mp4 is the whole call — so it is a
 * separate switch, warned about where it is turned on.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPrelight } from "../_shared/cors.ts";
import { checkRateLimit, createRateLimitResponse, getClientIdentifier, RATE_LIMITS } from "../_shared/rate-limit.ts";
import { hashShareToken, looksLikeShareToken } from "../_shared/share-token.ts";
import { resolveRecordingMedia } from "../_shared/recording-media.ts";
import { publicFacts, publicSegments, type PublicSegment } from "../_shared/share-view.ts";
import { recordAudit } from "../_shared/audit.ts";

serve(async (req) => {
  const corsResponse = handleCorsPrelight(req);
  if (corsResponse) return corsResponse;
  const corsHeaders = getCorsHeaders(req.headers.get("origin"));
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  // Anonymous endpoint: rate limit by IP, since there is no account to key on.
  const limit = await checkRateLimit(`share-view:${getClientIdentifier(req)}`, RATE_LIMITS.PUBLIC);
  if (!limit.allowed) return createRateLimitResponse(limit, corsHeaders);

  try {
    const url = new URL(req.url);
    const body = await req.json().catch(() => ({}));
    const token = url.searchParams.get("token") || body?.token;
    // "meeting" (default) is the page; "recording" mints the playback URL, which
    // is a separate request because Recall's signed links expire in hours and
    // the page itself should stay cacheable-cheap.
    const resource = url.searchParams.get("resource") || body?.resource || "meeting";

    // Rejected before hashing: a Supabase JWT or an eb_live_ PAT pasted here
    // must not be put through a lookup built for a different credential.
    if (!looksLikeShareToken(token)) {
      return json({ error: "This link is not valid." }, 404);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: share } = await supabase
      .from("meeting_shares")
      .select("id, meeting_id, expires_at, revoked_at, view_count, include_transcript, include_recording")
      .eq("token_hash", await hashShareToken(token))
      .eq("scope", "link")
      .maybeSingle();

    // One message for "never existed", "revoked" and "expired". Distinguishing
    // them tells a stranger whether a link was ever real, which is a small
    // enumeration oracle for no user benefit.
    const gone = !share
      || share.revoked_at !== null
      || (share.expires_at !== null && Date.parse(share.expires_at) <= Date.now());
    if (gone) {
      return json({ error: "This link has expired or been revoked." }, 404);
    }

    const { data: meeting } = await supabase
      .from("meetings")
      .select("id, title, start_time, duration_seconds, languages, content_pruned_at, recall_bot_id, audio_url")
      .eq("id", share.meeting_id)
      .maybeSingle();
    if (!meeting) return json({ error: "This meeting is no longer available." }, 404);

    // Retention removed the content, but the share row survives; say so plainly
    // rather than rendering an empty page.
    if (meeting.content_pruned_at) {
      return json({ error: "This meeting's content has passed its retention window." }, 404);
    }

    // ---- the recording ----------------------------------------------------
    if (resource === "recording") {
      if (!share.include_recording) {
        // A denial is worth more than a success here: repeated attempts to pull
        // the recording off a link that does not carry it is what probing looks
        // like, and the recording is the one asset zones cannot protect.
        await recordAudit(supabase, {
          action: "recording.accessed",
          actorType: "share_token",
          actorToken: token,
          resourceType: "meeting",
          resourceId: share.meeting_id,
          result: "denied",
          metadata: { reason: "not_included_in_share", share_id: share.id },
        }, req);
        return json({ error: "The recording is not part of this link." }, 403);
      }
      const media = await resolveRecordingMedia(supabase, meeting);
      await recordAudit(supabase, {
        action: "recording.accessed",
        actorType: "share_token",
        actorToken: token,
        resourceType: "meeting",
        resourceId: share.meeting_id,
        metadata: { share_id: share.id },
      }, req);
      return json(media);
    }

    const { data: insights } = await supabase
      .from("meeting_insights")
      .select("summary_short, summary_detailed, key_points, action_items, decisions, follow_ups, timeline_entries, facts")
      .eq("meeting_id", share.meeting_id)
      .maybeSingle();

    // Only read the transcript when this link carries it — an unticked box
    // should not put the text in a service-role result set at all.
    let transcript: PublicSegment[] | null = null;
    if (share.include_transcript) {
      const { data: row } = await supabase
        .from("transcripts")
        .select("speakers")
        .eq("meeting_id", share.meeting_id)
        .maybeSingle();
      transcript = publicSegments(row?.speakers);
    }

    // Best-effort view accounting; a failure here must not cost the reader the
    // page they came for.
    await supabase
      .from("meeting_shares")
      .update({
        view_count: (share.view_count ?? 0) + 1,
        last_viewed_at: new Date().toISOString(),
      })
      .eq("id", share.id);

    // view_count above answers "how popular"; this answers "by whom, from
    // where, and which link" — the questions asked after a link leaks.
    await recordAudit(supabase, {
      action: "share.viewed",
      actorType: "share_token",
      actorToken: token,
      resourceType: "meeting",
      resourceId: share.meeting_id,
      metadata: {
        share_id: share.id,
        included_transcript: share.include_transcript,
        included_recording: share.include_recording,
      },
    }, req);

    return json({
      meeting: {
        title: meeting.title,
        start_time: meeting.start_time,
        duration_seconds: meeting.duration_seconds,
        languages: meeting.languages ?? null,
      },
      insights: {
        summary_short: insights?.summary_short ?? null,
        summary_detailed: insights?.summary_detailed ?? null,
        key_points: insights?.key_points ?? [],
        action_items: insights?.action_items ?? [],
        decisions: insights?.decisions ?? [],
        follow_ups: Array.isArray(insights?.follow_ups) ? insights.follow_ups : [],
        timeline_entries: Array.isArray(insights?.timeline_entries) ? insights.timeline_entries : [],
      },
      // Topic headings and the timestamped rows the page groups under them.
      // Null for meetings that predate the facts pass; the page then falls
      // back to the prose summary.
      facts: publicFacts(insights?.facts),
      transcript,
      // "Ask this meeting" needs the transcript the model would answer from —
      // a summary-only link offers nothing to ask.
      viewer_can_ask: Boolean(share.include_transcript && transcript && transcript.length > 0),
      // The page asks for the media separately; this only says whether it may.
      has_recording: Boolean(share.include_recording),
    });
  } catch (err) {
    console.error("[get-shared-meeting]", err);
    return json({ error: "Something went wrong loading this meeting." }, 500);
  }
});
