/**
 * Shared logic for downloading audio from Recall and submitting to Sarvam.
 * Used by both `recall-webhook` and `check-recall-status`.
 */
import {
  createSarvamJob,
  uploadToSarvamJob,
  startSarvamJob,
} from "./sarvam.ts";

const RECALL_API_KEY = Deno.env.get("RECALL_API_KEY")!;
const RECALL_API_BASE_URL =
  Deno.env.get("RECALL_API_BASE_URL") || "https://us-east-1.recall.ai";
const RECALL_API_URL = `${RECALL_API_BASE_URL}/api/v1`;

export async function getRecallBot(botId: string) {
  const botResponse = await fetch(`${RECALL_API_URL}/bot/${botId}/`, {
    headers: {
      Authorization: RECALL_API_KEY,
      Accept: "application/json",
    },
  });

  if (!botResponse.ok) {
    const errText = await botResponse.text();
    throw new Error(
      `Failed to fetch bot details: ${botResponse.status} ${errText}`,
    );
  }

  return botResponse.json();
}

/**
 * Fetches the Recall bot's transcript which includes real speaker names
 * from the meeting platform (Google Meet, Zoom, Teams).
 * Returns an array of utterances with participant info and timestamped words.
 */
export async function getRecallTranscript(
  botId: string,
): Promise<RecallTranscriptEntry[] | null> {
  try {
    const response = await fetch(
      `${RECALL_API_URL}/bot/${botId}/transcript/`,
      {
        headers: {
          Authorization: RECALL_API_KEY,
          Accept: "application/json",
        },
      },
    );

    if (!response.ok) {
      console.warn(
        `[recall-pipeline] Failed to fetch Recall transcript: ${response.status}`,
      );
      return null;
    }

    const data = await response.json();
    if (!Array.isArray(data) || data.length === 0) {
      console.warn("[recall-pipeline] Recall transcript is empty");
      return null;
    }

    console.log(
      `[recall-pipeline] Recall transcript fetched: ${data.length} utterances`,
    );
    return data;
  } catch (err) {
    console.warn("[recall-pipeline] Error fetching Recall transcript:", err);
    return null;
  }
}

export interface RecallTranscriptEntry {
  participant: {
    id: number;
    name: string;
    is_host?: boolean;
    platform?: string;
    extra_data?: any;
  };
  words: Array<{
    text: string;
    start_timestamp: { relative: number; absolute?: string };
    end_timestamp: { relative: number; absolute?: string };
  }>;
}

export async function getAudioDownloadUrl(botData: Record<string, any>) {
  const recordings = Array.isArray(botData.recordings)
    ? botData.recordings
    : [];

  // Per Recall docs, audio_mixed is NOT included in media_shortcuts.
  // It must be retrieved via the dedicated /audio_mixed/ API endpoint.
  // See: https://docs.recall.ai/docs/how-to-get-mixed-audio-async
  const recordingWithId = recordings.find((r: any) => r?.id);
  if (recordingWithId?.id) {
    console.log("[recall-pipeline] Fetching audio_mixed for recording:", recordingWithId.id);
    const response = await fetch(
      `${RECALL_API_URL}/audio_mixed/?recording_id=${recordingWithId.id}`,
      {
        headers: {
          Authorization: RECALL_API_KEY,
          Accept: "application/json",
        },
      },
    );

    if (response.ok) {
      const data = await response.json();
      const audioResult = data.results?.[0];
      console.log("[recall-pipeline] audio_mixed status:", audioResult?.status?.code, "has download_url:", !!audioResult?.data?.download_url);
      const url = audioResult?.data?.download_url || null;
      if (url) return url;
    } else {
      console.warn("[recall-pipeline] audio_mixed endpoint returned:", response.status);
    }
  }

  // Last resort: video_url (mp4 — will likely fail transcription but logs the issue)
  console.warn("[recall-pipeline] Falling back to video_url — audio_mixed not available");
  return botData.video_url || null;
}

/**
 * Downloads audio from Recall, uploads to Supabase Storage & Sarvam,
 * and kicks off Sarvam transcription.
 *
 * Returns the sarvam_job_id on success, or throws on failure.
 */
export async function processRecallAudio(
  supabase: any,
  meeting: Record<string, any>,
  botId: string,
): Promise<string> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const sarvamApiKey = Deno.env.get("SARVAM_API_KEY")!;
  const sarvamWebhookSecret = Deno.env.get("SARVAM_WEBHOOK_SECRET")!;

  // Mark as processing
  await supabase
    .from("meetings")
    .update({ status: "processing" })
    .eq("id", meeting.id);

  // 1. Fetch bot details and Recall transcript (in parallel)
  const [botData, recallTranscript] = await Promise.all([
    getRecallBot(botId),
    getRecallTranscript(botId),
  ]);
  console.log(
    "[recall-pipeline] Bot data keys:",
    Object.keys(botData).join(","),
  );

  // Extract participant names from Recall transcript
  const recallParticipants: Array<{ id: number; name: string }> = [];
  if (recallTranscript) {
    const seen = new Set<number>();
    for (const entry of recallTranscript) {
      if (entry.participant?.id != null && !seen.has(entry.participant.id)) {
        seen.add(entry.participant.id);
        recallParticipants.push({
          id: entry.participant.id,
          name: entry.participant.name,
        });
      }
    }
    console.log(
      `[recall-pipeline] Recall participants: ${recallParticipants.map((p) => p.name).join(", ")}`,
    );
  }

  // Also check meeting_participants from bot data
  if (
    recallParticipants.length === 0 &&
    Array.isArray(botData.meeting_participants)
  ) {
    for (const p of botData.meeting_participants) {
      if (p.name) {
        recallParticipants.push({ id: p.id, name: p.name });
      }
    }
    console.log(
      `[recall-pipeline] Participants from bot data: ${recallParticipants.map((p) => p.name).join(", ")}`,
    );
  }

  // 2. Get audio download URL
  const audioUrl = await getAudioDownloadUrl(botData);

  if (!audioUrl) {
    console.error(
      "[recall-pipeline] No audio URL found in bot data:",
      JSON.stringify(botData),
    );
    await supabase
      .from("meetings")
      .update({ status: "failed" })
      .eq("id", meeting.id);
    throw new Error("No audio URL from Recall");
  }

  console.log("[recall-pipeline] Downloading audio from Recall...");

  // 3. Download the audio file
  const audioResponse = await fetch(audioUrl);
  if (!audioResponse.ok) {
    throw new Error(`Failed to download audio: ${audioResponse.status}`);
  }
  const audioBlob = await audioResponse.blob();
  console.log(
    `[recall-pipeline] Audio downloaded: ${(audioBlob.size / 1024 / 1024).toFixed(2)} MB`,
  );

  // 4. Upload audio to Supabase Storage for archival
  const storagePath = `${meeting.user_id}/${meeting.id}/recall-audio.mp3`;
  const { error: uploadError } = await supabase.storage
    .from("recordings")
    .upload(storagePath, audioBlob, {
      contentType: "audio/mpeg",
      upsert: true,
    });

  if (uploadError) {
    console.error("[recall-pipeline] Storage upload error:", uploadError);
  } else {
    await supabase
      .from("meetings")
      .update({ audio_url: `recordings/${storagePath}` })
      .eq("id", meeting.id);
    console.log("[recall-pipeline] Audio saved to Supabase Storage");
  }

  // 5. Create Sarvam batch job
  const callbackUrl = `${supabaseUrl}/functions/v1/sarvam-webhook`;
  const job = await createSarvamJob(
    sarvamApiKey,
    callbackUrl,
    sarvamWebhookSecret,
  );
  console.log("[recall-pipeline] Sarvam job created:", job.job_id);

  // 6. Upload audio to Sarvam
  const fileName = "recall-audio.mp3";
  await uploadToSarvamJob(sarvamApiKey, job.job_id, fileName, audioBlob);
  console.log("[recall-pipeline] Audio uploaded to Sarvam job");

  // 7. Start Sarvam processing
  await startSarvamJob(sarvamApiKey, job.job_id);
  console.log("[recall-pipeline] Sarvam job started:", job.job_id);

  // 8. Build speaker timeline from Recall transcript for later mapping.
  // Each entry captures a time range → speaker name so we can map Sarvam's
  // acoustic SPEAKER_XX labels to real names after transcription.
  const recallSpeakerTimeline: Array<{
    speaker: string;
    start: number;
    end: number;
  }> = [];
  if (recallTranscript) {
    for (const entry of recallTranscript) {
      if (!entry.words || entry.words.length === 0) continue;
      const start = entry.words[0]?.start_timestamp?.relative ?? 0;
      const end =
        entry.words[entry.words.length - 1]?.end_timestamp?.relative ?? start;
      recallSpeakerTimeline.push({
        speaker: entry.participant?.name || "Unknown",
        start,
        end,
      });
    }
  }

  // 9. Save sarvam_job_id + Recall speaker data
  await supabase
    .from("meetings")
    .update({
      sarvam_job_id: job.job_id,
      processing_config: {
        source: "recall",
        recall_bot_id: botId,
        audio_file_name: fileName,
        slackDestination:
          meeting.processing_config?.slackDestination || null,
        sendEmail: meeting.processing_config?.sendEmail || false,
        recall_speaker_timeline:
          recallSpeakerTimeline.length > 0 ? recallSpeakerTimeline : null,
        recall_participants:
          recallParticipants.length > 0 ? recallParticipants : null,
      },
    })
    .eq("id", meeting.id);

  console.log(
    `[recall-pipeline] Meeting ${meeting.id} handed off to Sarvam (job: ${job.job_id})`,
  );

  return job.job_id;
}
