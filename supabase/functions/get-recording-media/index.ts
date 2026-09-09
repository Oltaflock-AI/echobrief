/**
 * Returns a short-lived playback URL for one meeting's recording, so the
 * dashboard can play it back on the meeting page.
 *
 * Two sources, in order:
 *   1. Recall's mixed mp4 (`video_mixed_mp4` in the bot's recording_config).
 *      Streamed straight from Recall — a 720p hour is 750 MB-1 GB, which the
 *      1 GB Supabase bucket cannot hold (see prune-recordings for what a full
 *      bucket did to the pipeline on 2026-08-14). Recall signs the URL and it
 *      expires in a few hours, so it is fetched per view and never stored.
 *   2. The archived mp3 in the `recordings` bucket, as a signed URL. Older
 *      meetings have no video artifact at all, and prune-recordings clears
 *      this audio a few days after transcription — hence `kind: "none"`.
 *
 * The resolution itself lives in `_shared/recording-media.ts`, because share
 * links serve the same media to anonymous readers. What stays here is the only
 * part that differs: the caller's JWT is required and the meeting is read scoped
 * to that user, so one user can never mint a playback URL for another user's
 * meeting.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPrelight } from "../_shared/cors.ts";
import { resolveRecordingMedia } from "../_shared/recording-media.ts";
import { recordAudit } from "../_shared/audit.ts";

serve(async (req) => {
  const corsResponse = handleCorsPrelight(req);
  if (corsResponse) return corsResponse;

  const corsHeaders = getCorsHeaders(req.headers.get("origin"));
  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: jsonHeaders,
      });
    }
    const { data: { user }, error: userError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: jsonHeaders,
      });
    }

    const { meeting_id } = await req.json();
    if (!meeting_id) {
      return new Response(JSON.stringify({ error: "Missing meeting_id" }), {
        status: 400,
        headers: jsonHeaders,
      });
    }

    const { data: meeting } = await supabase
      .from("meetings")
      .select("id, user_id, recall_bot_id, audio_url")
      .eq("id", meeting_id)
      .maybeSingle();

    // The client is a service-role client, so authorisation is decided here:
    // the owner, or an allowlisted reviewer who was on the invite and holds a
    // `meeting_observers` grant. Anything else is a 404, not a 403 — a
    // stranger should not learn that the meeting exists.
    let authorised = meeting?.user_id === user.id;
    if (meeting && !authorised) {
      const { data: observer } = await supabase
        .from("meeting_observers")
        .select("user_id")
        .eq("meeting_id", meeting.id)
        .eq("user_id", user.id)
        .maybeSingle();
      authorised = !!observer;
    }

    if (!meeting || !authorised) {
      return new Response(JSON.stringify({ error: "Meeting not found" }), {
        status: 404,
        headers: jsonHeaders,
      });
    }

    const media = await resolveRecordingMedia(supabase, meeting);
    // The mp4 is the whole call, waiting-room audio included — zones cannot
    // trim it. Every time a playable URL is minted, it is recorded.
    await recordAudit(supabase, {
      action: "recording.accessed",
      actorType: "user",
      actorUserId: user.id,
      resourceType: "meeting",
      resourceId: meeting.id,
      metadata: { kind: media?.kind ?? null },
    }, req);
    return new Response(JSON.stringify(media), { headers: jsonHeaders });
  } catch (error) {
    console.error("[get-recording-media] error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message || "Failed to resolve recording" }),
      { status: 500, headers: jsonHeaders },
    );
  }
});
