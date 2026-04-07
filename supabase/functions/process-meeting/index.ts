import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://esm.sh/openai@4.20.1";
import { getCorsHeaders, handleCorsPrelight } from "../_shared/cors.ts";
import {
  createSarvamJob,
  uploadToSarvamJob,
  startSarvamJob,
} from "../_shared/sarvam.ts";
import {
  isLikelyHallucination,
  generateInsights,
  saveInsights,
  deliverResults,
  SpeakerSegment,
} from "../_shared/insights.ts";

async function whisperTranscribe(
  openai: OpenAI,
  supabase: any,
  meeting: Record<string, any>,
  meetingId: string,
  slackDestination: any,
  sendEmail: boolean,
  supabaseUrl: string,
  supabaseServiceKey: string,
): Promise<{
  success: boolean;
  hasTranscript: boolean;
  hasInsights: boolean;
  hasSpeakerSegments: boolean;
  noAudioDetected: boolean;
  slackSent: boolean;
  emailSent: boolean;
}> {
  let transcript = "";
  let speakerSegments: SpeakerSegment[] = [];
  let wordTimestamps: any[] = [];

  if (meeting.audio_url) {
    try {
      const { data: audioData, error: downloadError } =
        await supabase.storage
          .from("recordings")
          .download(meeting.audio_url.replace("recordings/", ""));

      if (downloadError) {
        console.error("Audio download error:", downloadError);
        throw new Error("Failed to download audio file");
      }

      const audioFile = new File([audioData], "audio.webm", {
        type: "audio/webm",
      });

      const transcription = await openai.audio.transcriptions.create({
        file: audioFile,
        model: "whisper-1",
        language: "en",
        response_format: "verbose_json",
      });

      transcript = transcription.text;
      wordTimestamps = (transcription as any).words || [];

      const hallucinated = isLikelyHallucination(transcript);
      if (hallucinated) {
        console.warn(
          "Hallucinated transcript detected, discarding:",
          transcript,
        );
        transcript = "";
        wordTimestamps = [];
      }

      if (!hallucinated) {
        const segments = (transcription as any).segments || [];
        const attendeesList = (meeting.attendees || [])
          .map((a: any) => a.displayName || a.email?.split("@")[0])
          .filter(Boolean);

        if (segments.length > 0 && attendeesList.length > 0) {
          const speakerPrompt = `Given a meeting with these participants: ${attendeesList.join(", ")}

Analyze these transcript segments and identify which participant is most likely speaking in each segment based on context, speaking style, and content. If you can't confidently identify a speaker, use "Speaker 1", "Speaker 2", etc.

Segments:
${segments.map((s: any, i: number) => `[${i}] "${s.text}"`).join("\n")}

Respond with a JSON array where each element has:
- "segment_index": the segment number
- "speaker": the participant name or "Speaker N"
- "confidence": "high", "medium", or "low"

Only include segments where you can make a reasonable attribution.`;

          try {
            const speakerAttribution =
              await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                  {
                    role: "system",
                    content:
                      "You are an expert at identifying speakers in meeting transcripts. Be conservative - only attribute speakers when you're reasonably confident.",
                  },
                  { role: "user", content: speakerPrompt },
                ],
                response_format: { type: "json_object" },
              });

            const attributionText =
              speakerAttribution.choices[0]?.message?.content || "{}";
            const attributions = JSON.parse(attributionText);
            const attributionMap = new Map();

            if (Array.isArray(attributions.speakers)) {
              attributions.speakers.forEach((a: any) => {
                if (a.confidence !== "low") {
                  attributionMap.set(a.segment_index, a.speaker);
                }
              });
            }

            speakerSegments = segments.map((s: any, i: number) => ({
              speaker:
                attributionMap.get(i) || `Speaker ${(i % 2) + 1}`,
              text: s.text,
              start: s.start,
              end: s.end,
            }));
          } catch (speakerError) {
            console.error("Speaker attribution error:", speakerError);
            speakerSegments = segments.map((s: any, i: number) => ({
              speaker: `Speaker ${(i % 2) + 1}`,
              text: s.text,
              start: s.start,
              end: s.end,
            }));
          }
        }
      }

      const { data: existingTranscript } = await supabase
        .from("transcripts")
        .select("id")
        .eq("meeting_id", meetingId)
        .single();

      if (!existingTranscript) {
        await supabase.from("transcripts").insert({
          meeting_id: meetingId,
          content: hallucinated
            ? "No clear speech was detected in this recording. The audio may have been too quiet or contained only background noise. Make sure your microphone is working and that meeting participants are audible."
            : transcript,
          speakers: speakerSegments,
          word_timestamps: wordTimestamps,
          stt_provider: "whisper",
        });
      }
    } catch (transcribeError) {
      console.error("Transcription error:", transcribeError);
      transcript = "";
    }
  }

  const noUsableTranscript = !transcript || transcript.trim().length < 20;
  const insights = await generateInsights(
    openai,
    meeting,
    transcript,
    speakerSegments,
  );
  await saveInsights(supabase, meetingId, insights);

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
    .eq("id", meetingId);

  const { slackSent, emailSent } = await deliverResults(
    supabase,
    meeting,
    insights,
    { slackDestination, sendEmail, supabaseUrl, supabaseServiceKey },
  );

  return {
    success: true,
    hasTranscript: !noUsableTranscript,
    hasInsights: !noUsableTranscript,
    hasSpeakerSegments: speakerSegments.length > 0,
    noAudioDetected: noUsableTranscript,
    slackSent,
    emailSent,
  };
}

serve(async (req) => {
  const corsResponse = handleCorsPrelight(req);
  if (corsResponse) return corsResponse;

  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  try {
    const { meetingId, slackDestination, sendEmail, forceWhisper } = await req.json();

    if (!meetingId) {
      return new Response(
        JSON.stringify({ error: "Meeting ID is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
    const sarvamApiKey = Deno.env.get("SARVAM_API_KEY");
    const sarvamWebhookSecret = Deno.env.get("SARVAM_WEBHOOK_SECRET");

    if (!openaiApiKey) {
      return new Response(
        JSON.stringify({ error: "OpenAI API key not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const openai = new OpenAI({ apiKey: openaiApiKey });

    const { data: meeting, error: meetingError } = await supabase
      .from("meetings")
      .select("*")
      .eq("id", meetingId)
      .single();

    if (meetingError || !meeting) {
      return new Response(
        JSON.stringify({ error: "Meeting not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    await supabase
      .from("meetings")
      .update({ status: "processing" })
      .eq("id", meetingId);

    // --- Sarvam path (default, skipped when forceWhisper is set) ---
    if (!forceWhisper && sarvamApiKey && sarvamWebhookSecret && meeting.audio_url) {
      try {
        const { data: audioData, error: downloadError } =
          await supabase.storage
            .from("recordings")
            .download(meeting.audio_url.replace("recordings/", ""));

        if (downloadError) throw new Error("Failed to download audio file");

        const callbackUrl = `${supabaseUrl}/functions/v1/sarvam-webhook`;

        const job = await createSarvamJob(
          sarvamApiKey,
          callbackUrl,
          sarvamWebhookSecret,
        );
        console.log("Sarvam job created:", job.job_id);

        const fileName = "audio.webm";
        await uploadToSarvamJob(
          sarvamApiKey,
          job.job_id,
          fileName,
          audioData,
        );
        console.log("Audio uploaded to Sarvam job");

        await startSarvamJob(sarvamApiKey, job.job_id);
        console.log("Sarvam job started:", job.job_id);

        await supabase
          .from("meetings")
          .update({
            sarvam_job_id: job.job_id,
            processing_config: {
              slackDestination: slackDestination || null,
              sendEmail: sendEmail || false,
              audio_file_name: fileName,
            },
          })
          .eq("id", meetingId);

        return new Response(
          JSON.stringify({
            success: true,
            meetingId,
            provider: "sarvam",
            sarvamJobId: job.job_id,
            message: "Audio submitted to Sarvam for processing. Results will arrive via webhook.",
          }),
          {
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          },
        );
      } catch (sarvamError) {
        console.error(
          "Sarvam submission failed, falling back to Whisper:",
          sarvamError,
        );
      }
    }

    // --- Whisper fallback ---
    const result = await whisperTranscribe(
      openai,
      supabase,
      meeting,
      meetingId,
      slackDestination,
      sendEmail,
      supabaseUrl,
      supabaseServiceKey,
    );

    return new Response(
      JSON.stringify({ ...result, provider: "whisper", meetingId }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Process meeting error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
