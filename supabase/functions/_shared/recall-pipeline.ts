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

export async function getAudioDownloadUrl(botData: Record<string, any>) {
  const recordings = Array.isArray(botData.recordings)
    ? botData.recordings
    : [];

  // Primary path: use the /audio_mixed/ API with the recording ID.
  const recordingWithId = recordings.find((r: any) => r?.id);
  if (recordingWithId?.id) {
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
      const url =
        data.results?.[0]?.data?.download_url ||
        data.results?.[0]?.url ||
        null;
      if (url) return url;
    }
  }

  // Fallback: check if any recording object itself has a direct URL
  for (const recording of recordings) {
    if (recording.url) return recording.url;
  }

  // Last resort: video_url
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

  // 1. Fetch bot details
  const botData = await getRecallBot(botId);
  console.log(
    "[recall-pipeline] Bot data keys:",
    Object.keys(botData).join(","),
  );

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

  // 8. Save sarvam_job_id
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
      },
    })
    .eq("id", meeting.id);

  console.log(
    `[recall-pipeline] Meeting ${meeting.id} handed off to Sarvam (job: ${job.job_id})`,
  );

  return job.job_id;
}
