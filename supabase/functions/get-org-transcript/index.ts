/**
 * The transcript of a meeting shared with your workspace.
 *
 * Colleagues read `meetings` and `meeting_insights` straight from PostgREST
 * under the org policies added in 20260901200000. `transcripts` could not join
 * them: a transcript's segments carry `zone`, and the pre/post-meeting zones are
 * the internal chatter `zones.ts` spends real effort identifying — RLS cannot
 * filter elements inside a JSONB array, so a policy would hand a colleague the
 * whole recording's worth of text or nothing at all. It handed them nothing,
 * which is what made a workspace share feel like it did not work.
 *
 * This is the zone-stripping read path that comment asked for. It reuses
 * `publicSegments` — the same whitelist a public share link goes through, so
 * there is ONE implementation of "what a transcript looks like to somebody who
 * is not its owner", not two that drift.
 *
 * Not a replacement for the owner's read, which stays a direct PostgREST query
 * under RLS and returns everything. Owners and observers never reach here.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPrelight } from "../_shared/cors.ts";
import { authenticate } from "../_shared/auth.ts";
import { orgShareFor } from "../_shared/org-access.ts";
import { publicSegments } from "../_shared/share-view.ts";
import { recordAudit } from "../_shared/audit.ts";

serve(async (req) => {
  const corsResponse = handleCorsPrelight(req);
  if (corsResponse) return corsResponse;

  const corsHeaders = getCorsHeaders(req.headers.get("origin"));
  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: jsonHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const caller = await authenticate(req, supabase, corsHeaders);
    if (!caller.ok) return caller.response;
    // A service bearer has no workspace, so there is nothing this function
    // could answer for it. Say so rather than silently returning empty.
    if (caller.isService) return json({ error: "User token required" }, 403);

    const { meeting_id: meetingId } = await req.json().catch(() => ({}));
    if (!meetingId || typeof meetingId !== "string") {
      return json({ error: "meeting_id is required" }, 400);
    }

    const access = await orgShareFor(supabase, meetingId, caller.userId);
    // 404, not 403: somebody outside the workspace should not learn that this
    // meeting exists. Same reasoning as get-recording-media.
    if (!access || !access.includeTranscript) {
      return json({ error: "Transcript not found" }, 404);
    }

    const { data: transcript, error } = await supabase
      .from("transcripts")
      .select("speakers")
      .eq("meeting_id", meetingId)
      .maybeSingle();
    if (error) throw error;

    const segments = publicSegments(transcript?.speakers);

    await recordAudit(supabase, {
      action: "transcript.queried",
      actorType: "user",
      actorUserId: caller.userId,
      resourceType: "meeting",
      resourceId: meetingId,
      metadata: { via: "org_share", share_id: access.shareId, segments: segments.length },
    }, req);

    return json({
      segments,
      // Rebuilt from the same filtered segments, never from `full_text`: the
      // stored text is the whole call, zones and all.
      text: segments.map((s) => `${s.speaker}: ${s.text}`).join("\n"),
      zone_filtered: true,
    });
  } catch (error) {
    console.error("[get-org-transcript] error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message || "Failed to load transcript" }),
      { status: 500, headers: jsonHeaders },
    );
  }
});
