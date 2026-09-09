/**
 * Shared logic for downloading audio from Recall and submitting to Sarvam.
 * Used by both `recall-webhook` and `check-recall-status`.
 */

/**
 * How long Recall keeps the mp4, in hours.
 *
 * 10 days. Recall stores media free for 7 and then bills $0.000069 per hour of
 * media per hour stored, so the extra 72 hours cost about $0.005 per
 * recording-hour — cents a month at our volume. 30 days was considered and
 * dropped: it is 552 billable hours, ~$0.038 per recording-hour, a real line
 * item for reach almost nobody uses.
 *
 * It still buys the thing 168 h did not: a share link that outlives its own
 * video. Links default to a 7-day expiry, so at 168 h the page and the player
 * died the same week and the four links sent on 2026-09-09 outlived their
 * recordings by two days.
 *
 * Both bot-creating call sites read this constant, because two literals is how
 * they drifted the first time.
 */
export const RECORDING_RETENTION_HOURS = 240;
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
 *
 * Uses the v1 transcript API: first queries by recording_id to find the
 * transcript artifact, then downloads it via the download_url.
 * The old /bot/{id}/transcript/ endpoint is deprecated.
 */
export async function getRecallTranscript(
  botId: string,
  botData?: Record<string, any>,
): Promise<RecallTranscriptEntry[] | null> {
  try {
    // 1. Try to get transcript download URL from bot's media_shortcuts
    const recordings = Array.isArray(botData?.recordings) ? botData.recordings : [];
    let downloadUrl: string | null = null;

    for (const rec of recordings) {
      const transcriptUrl = rec?.media_shortcuts?.transcript?.data?.download_url;
      if (transcriptUrl) {
        downloadUrl = transcriptUrl;
        break;
      }
    }

    // 2. If no media_shortcuts, query the transcript endpoint by recording_id
    if (!downloadUrl) {
      for (const rec of recordings) {
        if (!rec?.id) continue;
        try {
          const res = await fetch(
            `${RECALL_API_URL}/transcript/?recording_id=${rec.id}&status_code=done`,
            {
              headers: {
                Authorization: RECALL_API_KEY,
                Accept: "application/json",
              },
            },
          );
          if (res.ok) {
            const data = await res.json();
            const results = data?.results || (Array.isArray(data) ? data : []);
            if (results.length > 0 && results[0]?.data?.download_url) {
              downloadUrl = results[0].data.download_url;
              console.log(`[recall-pipeline] Found transcript via recording_id ${rec.id}`);
              break;
            }
          } else {
            const errBody = await res.text().catch(() => "");
            console.warn(`[recall-pipeline] Transcript query for recording ${rec.id}: ${res.status} ${errBody.substring(0, 200)}`);
          }
        } catch (err) {
          console.warn(`[recall-pipeline] Error querying transcript for recording ${rec.id}:`, err);
        }
      }
    }

    if (!downloadUrl) {
      console.warn("[recall-pipeline] No transcript download URL found");
      return null;
    }

    // 3. Download the transcript
    console.log("[recall-pipeline] Downloading transcript from:", downloadUrl.substring(0, 80));
    const response = await fetch(downloadUrl);
    if (!response.ok) {
      console.warn(`[recall-pipeline] Transcript download failed: ${response.status}`);
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

/**
 * Returns the current status code of Recall's audio_mixed resource for a bot,
 * or "missing" if no audio_mixed exists yet. Used to decide whether a bot.done
 * event should be treated as a failure or whether audio_mixed.done is still
 * in flight / about to fire.
 *
 * Known codes from Recall: "processing", "done", "failed".
 */
export async function getAudioMixedStatus(
  botData: Record<string, any>,
): Promise<"done" | "processing" | "failed" | "missing" | "unknown"> {
  const recordings = Array.isArray(botData.recordings)
    ? botData.recordings
    : [];
  const recordingWithId = recordings.find((r: any) => r?.id);
  if (!recordingWithId?.id) return "missing";

  try {
    const response = await fetch(
      `${RECALL_API_URL}/audio_mixed/?recording_id=${recordingWithId.id}`,
      {
        headers: {
          Authorization: RECALL_API_KEY,
          Accept: "application/json",
        },
      },
    );
    if (!response.ok) return "unknown";
    const data = await response.json();
    const audioResult = data.results?.[0];
    if (!audioResult) return "missing";
    const code = audioResult?.status?.code;
    if (code === "done" || code === "processing" || code === "failed") {
      return code;
    }
    return "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * Resolves a fresh playback URL for the bot's mixed video (mp4), plus the
 * artifact's status so the caller can tell "still rendering" from "never
 * recorded". Recall signs these URLs and they expire (~5 h), so this is
 * called at play time and the URL is never persisted anywhere.
 *
 * Video is requested via `video_mixed_mp4: {}` in the bot's recording_config.
 * Meetings recorded before that config existed have no video artifact at all
 * and come back as "missing" — callers fall back to the archived audio.
 */
export async function getVideoDownloadUrl(
  botData: Record<string, any>,
): Promise<{
  url: string | null;
  status: "done" | "processing" | "failed" | "missing" | "unknown";
}> {
  const recordings = Array.isArray(botData.recordings) ? botData.recordings : [];

  // Unlike audio_mixed, video_mixed IS exposed through media_shortcuts.
  for (const rec of recordings) {
    const shortcut = rec?.media_shortcuts?.video_mixed;
    const url = shortcut?.data?.download_url;
    if (url) return { url, status: "done" };
    const code = shortcut?.status?.code;
    if (code === "processing" || code === "failed") return { url: null, status: code };
  }

  // Fall back to the dedicated endpoint, same shape as audio_mixed.
  const recordingWithId = recordings.find((r: any) => r?.id);
  if (!recordingWithId?.id) return { url: null, status: "missing" };

  try {
    const response = await fetch(
      `${RECALL_API_URL}/video_mixed/?recording_id=${recordingWithId.id}`,
      {
        headers: {
          Authorization: RECALL_API_KEY,
          Accept: "application/json",
        },
      },
    );
    if (!response.ok) return { url: null, status: "unknown" };
    const data = await response.json();
    const result = data.results?.[0];
    if (!result) return { url: null, status: "missing" };
    const code = result?.status?.code;
    const status = code === "done" || code === "processing" || code === "failed"
      ? code
      : "unknown";
    return { url: result?.data?.download_url || null, status };
  } catch {
    return { url: null, status: "unknown" };
  }
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

export interface SpeakerTimelineEntry {
  speaker: string;
  start: number;
  end: number;
}

/**
 * Turns a Recall transcript into a speaker timeline: one entry per utterance
 * capturing "this name spoke between these two times". sarvam-webhook maps
 * Sarvam's acoustic SPEAKER_XX labels onto real names by overlapping against it.
 */
export function buildSpeakerTimeline(
  transcript: RecallTranscriptEntry[] | null,
): SpeakerTimelineEntry[] {
  const timeline: SpeakerTimelineEntry[] = [];
  if (!transcript) return timeline;
  for (const entry of transcript) {
    if (!entry.words || entry.words.length === 0) continue;
    const start = entry.words[0]?.start_timestamp?.relative ?? 0;
    const end =
      entry.words[entry.words.length - 1]?.end_timestamp?.relative ?? start;
    timeline.push({
      speaker: entry.participant?.name || "Unknown",
      start,
      end,
    });
  }
  return timeline;
}

/**
 * Fetches the Recall transcript for a bot and derives both the speaker timeline
 * and the participant list.
 *
 * Why this is called a second time from sarvam-webhook: bots are created with
 * `recallai_streaming` in `prioritize_accuracy` mode, which Recall documents as
 * "typically delayed by 3-10 minutes". processRecallAudio runs the moment
 * audio_mixed.done fires — a minute or two after the meeting ends — so the
 * transcript usually does not exist yet and the timeline comes back empty.
 * Measured 2026-08-20: only 1 of the last 25 recall meetings had captured one,
 * which is why essentially every multi-speaker meeting showed SPEAKER_00/01.
 * By the time Sarvam calls back, minutes have passed and it is normally ready.
 */
export async function fetchSpeakerContext(botId: string): Promise<{
  timeline: SpeakerTimelineEntry[];
  participants: Array<{ id: number; name: string }>;
}> {
  const botData = await getRecallBot(botId);
  const transcript = await getRecallTranscript(botId, botData);
  const timeline = buildSpeakerTimeline(transcript);
  const participants: Array<{ id: number; name: string }> = [];
  const seen = new Set<number>();
  for (const entry of transcript ?? []) {
    const id = entry.participant?.id;
    if (id != null && !seen.has(id)) {
      seen.add(id);
      participants.push({ id, name: entry.participant.name });
    }
  }
  return { timeline, participants };
}

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

  // 1. Fetch bot details first, then transcript (needs bot data for recording IDs)
  const botData = await getRecallBot(botId);
  console.log(
    "[recall-pipeline] Bot data keys:",
    Object.keys(botData).join(","),
  );
  const recallTranscript = await getRecallTranscript(botId, botData);

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

  // Fallback: fetch participants from Recall's meeting_participants endpoint
  if (recallParticipants.length === 0) {
    try {
      const partRes = await fetch(
        `${RECALL_API_URL}/bot/${botId}/meeting_participants/`,
        {
          headers: {
            Authorization: RECALL_API_KEY,
            Accept: "application/json",
          },
        },
      );
      if (partRes.ok) {
        const partData = await partRes.json();
        const participants = Array.isArray(partData) ? partData : partData?.results || [];
        for (const p of participants) {
          if (p.name) {
            recallParticipants.push({ id: p.id, name: p.name });
          }
        }
        if (recallParticipants.length > 0) {
          console.log(
            `[recall-pipeline] Participants from meeting_participants endpoint: ${recallParticipants.map((p) => p.name).join(", ")}`,
          );
        }
      } else {
        console.warn(`[recall-pipeline] meeting_participants endpoint returned: ${partRes.status}`);
      }
    } catch (err) {
      console.warn("[recall-pipeline] Error fetching meeting_participants:", err);
    }
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

  console.log("[recall-pipeline] Downloading audio from Recall...", audioUrl.substring(0, 100));

  // 3. Download the audio file
  const audioResponse = await fetch(audioUrl);
  if (!audioResponse.ok) {
    const errText = await audioResponse.text().catch(() => "");
    console.error(`[recall-pipeline] Audio download failed: ${audioResponse.status} ${errText.substring(0, 200)}`);
    await supabase
      .from("meetings")
      .update({ status: "failed", error_message: `Failed to download audio from Recall (HTTP ${audioResponse.status})` })
      .eq("id", meeting.id);
    throw new Error(`Failed to download audio: ${audioResponse.status}`);
  }
  const audioBlob = await audioResponse.blob();
  const audioSizeMB = audioBlob.size / 1024 / 1024;
  console.log(
    `[recall-pipeline] Audio downloaded: ${audioSizeMB.toFixed(2)} MB (${audioBlob.size} bytes)`,
  );

  if (audioBlob.size < 1000) {
    console.error(`[recall-pipeline] Audio file suspiciously small (${audioBlob.size} bytes) — may be empty or corrupted`);
  }

  // 4. Upload audio to Supabase Storage for archival
  const storagePath = `${meeting.user_id}/${meeting.id}/recall-audio.mp3`;
  const { error: uploadError } = await supabase.storage
    .from("recordings")
    .upload(storagePath, audioBlob, {
      contentType: "audio/mpeg",
      upsert: true,
    });

  // Kept in processing_config so a meeting with no audio_url explains itself.
  const archiveError = uploadError
    ? String((uploadError as { message?: string }).message || uploadError)
    : null;
  if (uploadError) {
    console.error("[recall-pipeline] Storage upload error:", uploadError);
  } else {
    await supabase
      .from("meetings")
      .update({ audio_url: `recordings/${storagePath}` })
      .eq("id", meeting.id);
    console.log("[recall-pipeline] Audio saved to Supabase Storage");
  }

  // 5-7. Submit to Sarvam. Preferred path: the Vercel split-audio function,
  // which ffmpeg-splits long audio into ~5-min chunks (Sarvam's saaras:v3
  // silently returns EMPTY transcripts for long files — empirically 47 min
  // fails while 5-6 min chunks of the same audio succeed). Falls back to the
  // legacy direct single-file submission if the splitter is unavailable.
  const callbackUrl = `${supabaseUrl}/functions/v1/sarvam-webhook`;
  const fileName = "recall-audio.mp3";
  const splitUrl = Deno.env.get("SPLIT_AUDIO_URL");
  const splitSecret = Deno.env.get("SPLIT_AUDIO_SECRET");

  let jobId: string | null = null;
  let chunkMeta: Record<string, unknown> | null = null;
  let splitError: string | null = null;

  if (splitUrl && splitSecret) {
    try {
      // Hand the splitter the archived copy when there is one, otherwise
      // Recall's own download URL — we fetched the bytes from it seconds ago.
      // Storage rejects anything over the project's 50 MiB cap (a ~55-minute
      // call at 128 kbps), so the long meetings that need chunking most are
      // exactly the ones with no archive. Until 2026-08-31 a failed archive
      // silently forced the whole-file path: a 60-minute call went to Sarvam
      // as one unchunked job and every Whisper fallback was skipped as well.
      let sourceUrl = audioUrl;
      let splitSource: "storage" | "recall" = "recall";
      if (!uploadError) {
        const { data: signed, error: signError } = await supabase.storage
          .from("recordings")
          .createSignedUrl(storagePath, 3600);
        if (signed?.signedUrl) {
          sourceUrl = signed.signedUrl;
          splitSource = "storage";
        } else {
          console.warn(
            `[recall-pipeline] Could not sign archived audio (${signError?.message}) — splitter will download from Recall instead`,
          );
        }
      } else {
        console.warn(
          "[recall-pipeline] Audio was not archived — splitter will download from Recall directly",
        );
      }
      const splitRes = await fetch(splitUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${splitSecret}`,
        },
        body: JSON.stringify({
          audioUrl: sourceUrl,
          callbackUrl,
          callbackToken: sarvamWebhookSecret,
        }),
      });
      if (!splitRes.ok) {
        throw new Error(
          `split-audio returned ${splitRes.status}: ${(await splitRes.text()).substring(0, 300)}`,
        );
      }
      const splitData = await splitRes.json();
      jobId = splitData.job_id;
      chunkMeta = {
        split_method: "vercel-ffmpeg",
        split_source: splitSource,
        ...(archiveError ? { archive_error: archiveError } : {}),
        chunk_count: splitData.chunk_count,
        chunk_seconds: splitData.chunk_seconds,
        audio_duration_seconds: splitData.duration_seconds,
      };
      console.log(
        `[recall-pipeline] Split path: job=${jobId}, ${splitData.chunk_count} chunk(s) x ${splitData.chunk_seconds}s (duration ${splitData.duration_seconds}s)`,
      );
    } catch (err) {
      splitError = err instanceof Error ? err.message : String(err);
      console.warn(
        "[recall-pipeline] split-audio failed, falling back to direct single-file Sarvam submission:",
        splitError,
      );
      jobId = null;
      chunkMeta = null;
    }
  } else {
    splitError = "SPLIT_AUDIO_URL / SPLIT_AUDIO_SECRET not configured";
  }

  if (!jobId) {
    // Whole-file submission. This path CANNOT work for long audio — Sarvam's
    // saaras:v3 silently returns an empty transcript above ~6 min — so record why
    // we ended up here. Without this the failure was invisible: the job came back
    // "COMPLETED" with nothing in it and there was no trace of the splitter ever
    // having been attempted.
    chunkMeta = {
      split_method: "direct-fallback",
      split_error: splitError,
      ...(archiveError ? { archive_error: archiveError } : {}),
    };
    console.warn(
      `[recall-pipeline] Falling back to whole-file Sarvam for ${audioSizeMB.toFixed(1)} MB of audio — reason: ${splitError}`,
    );
    const job = await createSarvamJob(
      sarvamApiKey,
      callbackUrl,
      sarvamWebhookSecret,
    );
    console.log("[recall-pipeline] Sarvam job created (direct):", job.job_id);
    await uploadToSarvamJob(sarvamApiKey, job.job_id, fileName, audioBlob);
    console.log("[recall-pipeline] Audio uploaded to Sarvam job");
    await startSarvamJob(sarvamApiKey, job.job_id);
    console.log("[recall-pipeline] Sarvam job started:", job.job_id);
    jobId = job.job_id;
  }

  // 8. Build speaker timeline from Recall transcript for later mapping.
  const recallSpeakerTimeline = buildSpeakerTimeline(recallTranscript);

  // 9. Save sarvam_job_id + Recall speaker data (+ chunk metadata when split)
  await supabase
    .from("meetings")
    .update({
      sarvam_job_id: jobId,
      processing_config: {
        source: "recall",
        recall_bot_id: botId,
        audio_file_name: fileName,
        sendEmail: meeting.processing_config?.sendEmail || false,
        recall_speaker_timeline:
          recallSpeakerTimeline.length > 0 ? recallSpeakerTimeline : null,
        recall_participants:
          recallParticipants.length > 0 ? recallParticipants : null,
        ...(chunkMeta || {}),
      },
    })
    .eq("id", meeting.id);

  console.log(
    `[recall-pipeline] Meeting ${meeting.id} handed off to Sarvam (job: ${jobId})`,
  );

  return jobId;
}
