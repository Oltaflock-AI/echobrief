import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { processRecallAudio } from "../_shared/recall-pipeline.ts";

const RECALL_API_KEY = Deno.env.get("RECALL_API_KEY")!;
const RECALL_API_BASE_URL =
  Deno.env.get("RECALL_API_BASE_URL") || "https://us-east-1.recall.ai";
const RECALL_API_URL = `${RECALL_API_BASE_URL}/api/v1`;
const RECALL_WEBHOOK_SECRET = Deno.env.get("RECALL_WEBHOOK_SECRET");

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;

  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a[i] ^ b[i];
  }

  return mismatch === 0;
}

function decodeBase64(input: string): Uint8Array {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function verifyRecallWebhook(req: Request, rawBody: string) {
  if (!RECALL_WEBHOOK_SECRET) {
    throw new Error("RECALL_WEBHOOK_SECRET not configured");
  }

  const svixId = req.headers.get("svix-id") || req.headers.get("webhook-id");
  const svixTimestamp =
    req.headers.get("svix-timestamp") || req.headers.get("webhook-timestamp");
  const svixSignature =
    req.headers.get("svix-signature") || req.headers.get("webhook-signature");

  if (svixId && svixTimestamp && svixSignature) {
    const secret = RECALL_WEBHOOK_SECRET.startsWith("whsec_")
      ? RECALL_WEBHOOK_SECRET.slice("whsec_".length)
      : RECALL_WEBHOOK_SECRET;
    const key = decodeBase64(secret);
    const payload = new TextEncoder().encode(
      `${svixId}.${svixTimestamp}.${rawBody}`,
    );
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      key,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const signature = new Uint8Array(
      await crypto.subtle.sign("HMAC", cryptoKey, payload),
    );

    const candidates = svixSignature
      .split(/\s+/)
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => entry.match(/^v\d+,(.+)$/)?.[1] || null)
      .filter((entry): entry is string => Boolean(entry))
      .map((entry) => decodeBase64(entry));

    if (!candidates.some((candidate) => timingSafeEqual(signature, candidate))) {
      throw new Error("Invalid Recall webhook signature");
    }

    return;
  }

  const token = new URL(req.url).searchParams.get("token");
  if (!token || token !== RECALL_WEBHOOK_SECRET) {
    throw new Error("Invalid Recall webhook token");
  }
}

function extractBotId(event: Record<string, any>) {
  return (
    event.data?.bot?.id ||
    event.data?.bot_id ||
    event.bot?.id ||
    event.bot_id ||
    null
  );
}

// Derive a normalised status string from the webhook payload.
// Recall sends distinct event names like "bot.done", "bot.fatal",
// "audio_mixed.done", etc.  The event name is the most reliable signal.
// We also fall back to data.data.code for forward-compatibility.
function extractStatusCode(event: Record<string, any>) {
  // Primary: derive from the event name (e.g. "bot.done" → "done")
  const eventName: string | undefined = event.event;
  if (eventName) {
    const suffix = eventName.split(".").slice(1).join(".");
    if (suffix) return suffix;
  }

  // Fallback: nested code fields
  return (
    event.data?.data?.code ||
    event.data?.status?.code ||
    event.data?.code ||
    event.status ||
    null
  );
}

// Extract the sub_code from a Recall webhook event.
// Recall includes sub_codes for terminal events like call_ended to indicate
// the specific reason (e.g. bot_kicked_from_waiting_room).
function extractSubCode(event: Record<string, any>): string | null {
  return (
    event.data?.data?.sub_code ||
    event.data?.sub_code ||
    null
  );
}

// Sub-codes that indicate the bot was never admitted or never recorded.
// When we see these, the meeting should be marked as failed — not "processing".
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

// Returns the top-level event type prefix, e.g. "bot" or "audio_mixed"
function getEventCategory(event: Record<string, any>): string | null {
  const eventName: string | undefined = event.event;
  if (!eventName) return null;
  return eventName.split(".")[0] || null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  try {
    const rawBody = await req.text();
    await verifyRecallWebhook(req, rawBody);
    const event = JSON.parse(rawBody);
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log("[recall-webhook] Event received:", JSON.stringify(event));

    // Recall webhooks use distinct event names:
    //   Bot status:  bot.joining_call, bot.in_waiting_room, bot.in_call_not_recording,
    //                bot.in_call_recording, bot.call_ended, bot.done, bot.fatal
    //   Media:       audio_mixed.done, audio_mixed.failed, etc.
    // Payload: { event, data: { data: { code, sub_code }, bot: { id } } }
    const eventCategory = getEventCategory(event); // "bot", "audio_mixed", etc.
    const botId = extractBotId(event);
    const statusCode = extractStatusCode(event);

    if (!botId) {
      console.error("[recall-webhook] No bot_id in event");
      return new Response(JSON.stringify({ error: "No bot_id" }), { status: 400 });
    }

    // Find the meeting by recall_bot_id
    const { data: meeting, error: findError } = await supabase
      .from("meetings")
      .select("*")
      .eq("recall_bot_id", botId)
      .single();

    if (findError || !meeting) {
      console.error("[recall-webhook] Meeting not found for bot:", botId);
      return new Response(JSON.stringify({ error: "Meeting not found" }), { status: 404 });
    }

    console.log(
      `[recall-webhook] Meeting ${meeting.id}, bot ${botId}, event: ${event.event}, status: ${statusCode}`,
    );

    // Determine if we should trigger the audio-download → Sarvam pipeline.
    // We ONLY trigger on "audio_mixed.done" — the authoritative signal that the
    // mixed MP3 is ready for download.  "bot.done" / "status.done" fire at the
    // same time and would cause a race condition (two parallel processRecallAudio
    // calls before either writes sarvam_job_id back to the DB).
    // The check-recall-status polling fallback handles the rare case where
    // audio_mixed.done is never received.
    const isAudioReady = eventCategory === "audio_mixed" && statusCode === "done";
    const shouldProcessAudio = isAudioReady && !meeting.sarvam_job_id;

    if (!shouldProcessAudio) {
      // Handle intermediate bot status updates and terminal failures
      const statusMap: Record<string, string> = {
        joining_call: "joining",
        in_waiting_room: "joining",
        in_call_not_recording: "in_call",
        recording_permission_allowed: "recording",
        in_call_recording: "recording",
        call_ended: "processing",
        fatal: "failed",
      };

      const subCode = extractSubCode(event);
      console.log(`[recall-webhook] statusCode=${statusCode}, subCode=${subCode}, eventCategory=${eventCategory}`);

      if (statusCode === "fatal") {
        const errorMsg = subCode ? FAILURE_SUB_CODES[subCode] || `Bot error: ${subCode}` : "Recording bot encountered a fatal error";
        await supabase
          .from("meetings")
          .update({ status: "failed", error_message: errorMsg })
          .eq("id", meeting.id);
        console.error(`[recall-webhook] Bot ${botId} failed: ${errorMsg}`);
      } else if (eventCategory === "audio_mixed" && statusCode === "failed") {
        await supabase
          .from("meetings")
          .update({ status: "failed", error_message: "Audio processing failed in Recall" })
          .eq("id", meeting.id);
        console.error(`[recall-webhook] Audio processing failed for bot ${botId}`);
      } else if (statusCode === "call_ended" && subCode && FAILURE_SUB_CODES[subCode]) {
        // Bot was kicked from waiting room or otherwise never entered the call.
        // Mark as failed immediately — audio_mixed.done will never arrive.
        const errorMsg = FAILURE_SUB_CODES[subCode];
        await supabase
          .from("meetings")
          .update({ status: "failed", error_message: errorMsg })
          .eq("id", meeting.id);
        console.warn(`[recall-webhook] Bot ${botId} call_ended with failure sub_code: ${subCode}`);
      } else if (eventCategory === "bot" && statusCode === "done" && !meeting.sarvam_job_id) {
        // bot.done fired but no audio was ever processed (no sarvam_job_id).
        // This can happen when the bot was kicked before recording or audio_mixed
        // event was never received. If the meeting is already failed, leave it.
        if (meeting.status !== "failed" && meeting.status !== "completed") {
          const errorMsg = subCode && FAILURE_SUB_CODES[subCode]
            ? FAILURE_SUB_CODES[subCode]
            : "The recording bot finished without capturing any audio. The bot may not have been admitted to the meeting.";
          await supabase
            .from("meetings")
            .update({ status: "failed", error_message: errorMsg })
            .eq("id", meeting.id);
          console.warn(`[recall-webhook] Bot ${botId} done with no audio processed — marking as failed`);
        }
      } else if (statusMap[statusCode]) {
        await supabase
          .from("meetings")
          .update({ status: statusMap[statusCode] })
          .eq("id", meeting.id);
      }

      return new Response(JSON.stringify({ acknowledged: true, event: event.event, status: statusCode, sub_code: subCode }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // --- Recording is done — fetch audio from Recall and send to Sarvam ---
    const sarvamJobId = await processRecallAudio(supabase, meeting, botId);

    return new Response(
      JSON.stringify({
        success: true,
        meeting_id: meeting.id,
        sarvam_job_id: sarvamJobId,
        message: "Audio downloaded from Recall and submitted to Sarvam for transcription",
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[recall-webhook] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
