import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPrelight } from "../_shared/cors.ts";
import { processRecallAudio } from "../_shared/recall-pipeline.ts";
import { getSarvamJobStatus } from "../_shared/sarvam.ts";

const RECALL_API_KEY = Deno.env.get("RECALL_API_KEY")!;
const RECALL_API_BASE_URL =
  Deno.env.get("RECALL_API_BASE_URL") || "https://us-east-1.recall.ai";
const RECALL_API_URL = `${RECALL_API_BASE_URL}/api/v1`;

// Map Recall status codes to our DB statuses
const RECALL_STATUS_MAP: Record<string, string> = {
  joining_call: "joining",
  in_waiting_room: "joining",
  in_call_not_recording: "in_call",
  recording_permission_allowed: "recording",
  in_call_recording: "recording",
  call_ended: "processing",
  recording_done: "processing",
  done: "done", // special handling below
  fatal: "failed",
};

// Sub-codes that indicate the bot never recorded anything useful
const FAILURE_SUB_CODES: Record<string, string> = {
  bot_kicked_from_waiting_room:
    "The recording bot was removed from the waiting room before it could join the meeting. Ask the meeting host to admit the bot.",
  bot_removed_from_waiting_room:
    "The recording bot was removed from the waiting room. Ask the meeting host to admit the bot.",
  cannot_join_meeting:
    "The recording bot could not join the meeting. The meeting link may be invalid or the meeting may have ended.",
  meeting_not_found:
    "The meeting was not found. Please check the meeting link and try again.",
  bot_not_accepted:
    "The recording bot was not accepted into the meeting. Ask the meeting host to admit the bot.",
  timeout_exceeded_waiting_room:
    "The recording bot timed out waiting to be admitted to the meeting. Ask the meeting host to admit the bot sooner.",
};

serve(async (req) => {
  const corsResponse = handleCorsPrelight(req);
  if (corsResponse) return corsResponse;

  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);
  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

  try {
    const { meeting_id } = await req.json();
    if (!meeting_id) {
      return new Response(JSON.stringify({ error: "Missing meeting_id" }), {
        status: 400,
        headers: jsonHeaders,
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch the meeting
    const { data: meeting, error } = await supabase
      .from("meetings")
      .select("*")
      .eq("id", meeting_id)
      .single();

    if (error || !meeting) {
      return new Response(JSON.stringify({ error: "Meeting not found" }), {
        status: 404,
        headers: jsonHeaders,
      });
    }

    // If no recall bot, or already completed/failed/transcribing, just return current status
    if (
      !meeting.recall_bot_id ||
      meeting.status === "completed" ||
      meeting.status === "failed" ||
      meeting.status === "transcribing"
    ) {
      return new Response(JSON.stringify({ status: meeting.status }), {
        headers: jsonHeaders,
      });
    }

    // Query Recall API for the bot's current status
    const botResponse = await fetch(
      `${RECALL_API_URL}/bot/${meeting.recall_bot_id}/`,
      {
        headers: {
          Authorization: RECALL_API_KEY,
          Accept: "application/json",
        },
      },
    );

    if (!botResponse.ok) {
      console.error(
        "[check-recall-status] Recall API error:",
        botResponse.status,
      );
      return new Response(JSON.stringify({ status: meeting.status }), {
        headers: jsonHeaders,
      });
    }

    const botData = await botResponse.json();
    const statusChanges = botData.status_changes || [];
    const latestStatus =
      statusChanges.length > 0
        ? statusChanges[statusChanges.length - 1].code
        : null;

    if (!latestStatus) {
      return new Response(JSON.stringify({ status: meeting.status }), {
        headers: jsonHeaders,
      });
    }

    // Check if any status change has a failure sub_code (e.g. bot_kicked_from_waiting_room).
    // This catches cases where the webhook event was missed.
    const latestEntry = statusChanges[statusChanges.length - 1];
    const latestSubCode = latestEntry?.sub_code || null;

    // Check for call_ended or done with a failure sub_code
    const hasFailureSubCode = statusChanges.some(
      (sc: any) => sc.sub_code && FAILURE_SUB_CODES[sc.sub_code],
    );

    if (hasFailureSubCode && meeting.status !== "failed" && meeting.status !== "completed") {
      const failedEntry = statusChanges.find(
        (sc: any) => sc.sub_code && FAILURE_SUB_CODES[sc.sub_code],
      );
      const errorMsg = FAILURE_SUB_CODES[failedEntry.sub_code];
      console.log(
        `[check-recall-status] Bot has failure sub_code: ${failedEntry.sub_code} — marking meeting ${meeting.id} as failed`,
      );
      await supabase
        .from("meetings")
        .update({ status: "failed", error_message: errorMsg })
        .eq("id", meeting.id);
      return new Response(
        JSON.stringify({ status: "failed", recall_status: latestStatus, sub_code: failedEntry.sub_code }),
        { headers: jsonHeaders },
      );
    }

    const mappedStatus = RECALL_STATUS_MAP[latestStatus] || meeting.status;

    // If Recall is "done" and we haven't started Sarvam yet, trigger the pipeline.
    // But first check if the bot actually has recordings — if not, it never captured audio.
    if (mappedStatus === "done" && !meeting.sarvam_job_id) {
      const hasRecordings = Array.isArray(botData.recordings) && botData.recordings.length > 0;
      if (!hasRecordings) {
        console.warn(
          `[check-recall-status] Recall bot done but has no recordings for meeting ${meeting.id} — marking as failed`,
        );
        await supabase
          .from("meetings")
          .update({
            status: "failed",
            error_message: "The recording bot finished without capturing any audio. The bot may not have been admitted to the meeting.",
          })
          .eq("id", meeting.id);
        return new Response(
          JSON.stringify({ status: "failed", recall_status: latestStatus, reason: "no_recordings" }),
          { headers: jsonHeaders },
        );
      }

      console.log(
        `[check-recall-status] Recall bot done for meeting ${meeting.id}, triggering Sarvam pipeline...`,
      );
      try {
        const sarvamJobId = await processRecallAudio(
          supabase,
          meeting,
          meeting.recall_bot_id,
        );
        return new Response(
          JSON.stringify({
            status: "processing",
            recall_status: latestStatus,
            sarvam_job_id: sarvamJobId,
          }),
          { headers: jsonHeaders },
        );
      } catch (pipelineErr) {
        console.error(
          "[check-recall-status] Pipeline error:",
          pipelineErr,
        );
        return new Response(
          JSON.stringify({
            status: "failed",
            recall_status: latestStatus,
            error:
              pipelineErr instanceof Error
                ? pipelineErr.message
                : "Pipeline failed",
          }),
          { headers: jsonHeaders },
        );
      }
    }

    // If Recall is "done" and Sarvam is already running, poll Sarvam for completion.
    // This acts as a fallback if the Sarvam webhook callback never arrives.
    if (mappedStatus === "done" && meeting.sarvam_job_id) {
      try {
        const sarvamApiKey = Deno.env.get("SARVAM_API_KEY")!;
        const sarvamStatus = await getSarvamJobStatus(sarvamApiKey, meeting.sarvam_job_id);
        const sarvamState = sarvamStatus.job_state?.toUpperCase();

        if (sarvamState === "COMPLETED" || sarvamState === "FAILED") {
          // Sarvam is done but the webhook was never processed — trigger it now
          const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
          const webhookSecret = Deno.env.get("SARVAM_WEBHOOK_SECRET")!;

          console.log(
            `[check-recall-status] Sarvam job ${meeting.sarvam_job_id} is ${sarvamState} but webhook was not received — triggering now`,
          );

          await fetch(`${supabaseUrl}/functions/v1/sarvam-webhook`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${webhookSecret}`,
            },
            body: JSON.stringify({
              job_id: meeting.sarvam_job_id,
              job_state: sarvamState,
            }),
          });
        }
      } catch (sarvamPollErr) {
        console.error("[check-recall-status] Sarvam status poll error:", sarvamPollErr);
      }

      return new Response(
        JSON.stringify({
          status: "processing",
          recall_status: latestStatus,
        }),
        { headers: jsonHeaders },
      );
    }

    // Update DB if the status has changed (for non-"done" statuses)
    if (mappedStatus !== meeting.status) {
      await supabase
        .from("meetings")
        .update({ status: mappedStatus })
        .eq("id", meeting.id);
      console.log(
        `[check-recall-status] Updated meeting ${meeting.id}: ${meeting.status} -> ${mappedStatus} (recall: ${latestStatus})`,
      );
    }

    return new Response(
      JSON.stringify({
        status: mappedStatus,
        recall_status: latestStatus,
      }),
      { headers: jsonHeaders },
    );
  } catch (err) {
    console.error("[check-recall-status] Error:", err);
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "Unknown error",
      }),
      { status: 500, headers: jsonHeaders },
    );
  }
});
