import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPrelight } from "../_shared/cors.ts";
import { processRecallAudio } from "../_shared/recall-pipeline.ts";

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

    // If no recall bot, or already completed/failed, just return current status
    if (
      !meeting.recall_bot_id ||
      meeting.status === "completed" ||
      meeting.status === "failed"
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

    const mappedStatus = RECALL_STATUS_MAP[latestStatus] || meeting.status;

    // If Recall is "done" and we haven't started Sarvam yet, trigger the pipeline
    if (mappedStatus === "done" && !meeting.sarvam_job_id) {
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

    // If Recall is "done" but Sarvam is already running, report as processing
    if (mappedStatus === "done" && meeting.sarvam_job_id) {
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
