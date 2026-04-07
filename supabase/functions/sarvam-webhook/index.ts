import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://esm.sh/openai@4.20.1";
import { downloadSarvamResults } from "../_shared/sarvam.ts";
import {
  isLikelyHallucination,
  generateInsights,
  saveInsights,
  deliverResults,
  SpeakerSegment,
} from "../_shared/insights.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }

  try {
    const webhookSecret = Deno.env.get("SARVAM_WEBHOOK_SECRET");
    if (!webhookSecret) {
      console.error("SARVAM_WEBHOOK_SECRET not configured");
      return new Response("Server misconfigured", { status: 500 });
    }

    // Validate the callback token from Sarvam
    const authToken =
      req.headers.get("authorization")?.replace("Bearer ", "") ||
      req.headers.get("x-sarvam-job-callback-token") ||
      req.headers.get("auth_token");

    if (authToken !== webhookSecret) {
      console.error("Webhook auth mismatch");
      return new Response("Unauthorized", { status: 401 });
    }

    const payload = await req.json();
    const { job_id, job_state } = payload;

    if (!job_id) {
      return new Response("Missing job_id", { status: 400 });
    }

    const normalizedState = job_state?.toUpperCase();
    console.log(`Sarvam webhook: job=${job_id} state=${job_state} payload_keys=${Object.keys(payload).join(",")}`);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY")!;
    const sarvamApiKey = Deno.env.get("SARVAM_API_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const openai = new OpenAI({ apiKey: openaiApiKey });

    const { data: meeting, error: meetingError } = await supabase
      .from("meetings")
      .select("*")
      .eq("sarvam_job_id", job_id)
      .single();

    if (meetingError || !meeting) {
      console.error("No meeting found for sarvam_job_id:", job_id);
      return new Response("Meeting not found", { status: 404 });
    }

    const config = meeting.processing_config || {};

    if (normalizedState === "COMPLETED") {
      // Try to get results from webhook payload first, then download
      let result: Record<string, unknown>;
      if (payload.results?.transcripts?.[0]) {
        result = payload.results.transcripts[0];
        console.log("Using results from webhook payload");
      } else {
        const fileName = config.audio_file_name || "audio.webm";
        const resultFileName = fileName.replace(/\.[^.]+$/, ".json");
        try {
          result = await downloadSarvamResults(
            sarvamApiKey,
            job_id,
            resultFileName,
          );
          console.log("Downloaded results from Sarvam API");
        } catch (downloadErr) {
          const errMsg = downloadErr instanceof Error ? downloadErr.message : String(downloadErr);
          // Sarvam returns 400 "does not exist" when the audio had no speech to transcribe.
          // Treat this as an empty transcript and complete the meeting gracefully.
          if (errMsg.includes("does not exist") || errMsg.includes("400")) {
            console.warn(`[sarvam-webhook] No output file for job ${job_id} — treating as silent/empty recording`);
            result = { transcript: "", language_code: "unknown", diarized_transcript: { entries: [] } };
          } else {
            throw downloadErr;
          }
        }
      }

      console.log("Result keys:", Object.keys(result).join(","));

      const transcript = (result as any).transcript || "";
      const languageCode = (result as any).language_code || "unknown";
      const diarizedEntries =
        (result as any).diarized_transcript?.entries || [];

      console.log(`Diarized entries count: ${diarizedEntries.length}`);
      if (diarizedEntries.length > 0) {
        console.log("First entry keys:", Object.keys(diarizedEntries[0]).join(","));
      }

      const speakerSegments: SpeakerSegment[] = diarizedEntries.map(
        (entry: any) => ({
          speaker: `SPEAKER_${String(entry.speaker_id || "0").padStart(2, "0")}`,
          text: entry.transcript || entry.text || "",
          start: entry.start_time_seconds ?? entry.start ?? 0,
          end: entry.end_time_seconds ?? entry.end ?? 0,
          speaker_id: entry.speaker_id || "0",
        }),
      );

      const hallucinated = isLikelyHallucination(transcript);
      if (hallucinated) {
        console.warn("Hallucinated Sarvam transcript, discarding:", transcript);
      }

      const finalTranscript = hallucinated ? "" : transcript;

      // If Sarvam returned empty/hallucinated transcript, fall back to Whisper
      // instead of saving "no clear speech" — the audio may be fine but Sarvam
      // couldn't handle it.
      if (!finalTranscript) {
        console.warn(`Sarvam returned empty transcript for job ${job_id}, falling back to Whisper`);
        try {
          const fallbackUrl = `${supabaseUrl}/functions/v1/process-meeting`;
          await fetch(fallbackUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${supabaseServiceKey}`,
            },
            body: JSON.stringify({
              meetingId: meeting.id,
              slackDestination: config.slackDestination,
              sendEmail: config.sendEmail,
            }),
          });
          return new Response(JSON.stringify({ success: true, fallback: "whisper", reason: "empty_sarvam_transcript" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (fallbackError) {
          console.error("Whisper fallback failed after empty Sarvam transcript:", fallbackError);
          await supabase
            .from("meetings")
            .update({ status: "failed" })
            .eq("id", meeting.id);
          return new Response(JSON.stringify({ success: false, error: "Both Sarvam and Whisper failed" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      }

      const { data: existingTranscript } = await supabase
        .from("transcripts")
        .select("id")
        .eq("meeting_id", meeting.id)
        .single();

      if (!existingTranscript) {
        await supabase.from("transcripts").insert({
          meeting_id: meeting.id,
          content: finalTranscript,
          speakers: speakerSegments,
          word_timestamps: (result as any).timestamps || [],
          stt_provider: "sarvam",
          language_detected: languageCode,
        });
      }

      const insights = await generateInsights(
        openai,
        meeting,
        finalTranscript,
        speakerSegments,
      );
      await saveInsights(supabase, meeting.id, insights);

      const endTime = new Date();
      const startTime = new Date(meeting.start_time);
      const durationSeconds = Math.floor(
        (endTime.getTime() - startTime.getTime()) / 1000,
      );

      await supabase
        .from("meetings")
        .update({
          status: "completed",
          end_time: endTime.toISOString(),
          duration_seconds: durationSeconds,
        })
        .eq("id", meeting.id);

      await deliverResults(supabase, meeting, insights, {
        slackDestination: config.slackDestination,
        sendEmail: config.sendEmail,
        supabaseUrl,
        supabaseServiceKey,
      });

      console.log(`Meeting ${meeting.id} completed via Sarvam`);
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (normalizedState === "FAILED") {
      console.error(`Sarvam job ${job_id} failed, falling back to Whisper`);

      try {
        const fallbackUrl = `${supabaseUrl}/functions/v1/process-meeting`;
        await fetch(fallbackUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            meetingId: meeting.id,
            slackDestination: config.slackDestination,
            sendEmail: config.sendEmail,
          }),
        });
      } catch (fallbackError) {
        console.error("Whisper fallback also failed:", fallbackError);
        await supabase
          .from("meetings")
          .update({ status: "failed" })
          .eq("id", meeting.id);
      }

      return new Response(JSON.stringify({ success: true, fallback: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Other states (Accepted, Pending, Running) — acknowledge and wait
    console.log(`Sarvam job ${job_id} in state ${job_state}, no action needed`);
    return new Response(JSON.stringify({ acknowledged: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Sarvam webhook error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
});
