/**
 * Keep each meeting's audio in Cloudflare R2 after Recall's free 7 days.
 *
 * Recall retention is 168 h (`RECORDING_RETENTION_HOURS`), exactly its free
 * window, so after a week there is nothing left to play. Once a day, while
 * Recall still holds the media, `prune-recordings` copies the `audio_mixed`
 * mp3 (16 kHz mono 128 kbps, ~58 MB/hour) into a private R2 bucket. Playback
 * (`recording-media.ts`) falls back to a presigned URL for that copy. Video is
 * never archived: at ~1 GB/hour the 10 GB free tier would hold ten calls.
 *
 * The same tick keeps it free and keeps it honest:
 *   - objects whose meeting was deleted (row tombstoned, meeting_id null) go,
 *   - objects whose meeting passed its plan's retention (content_pruned_at) go,
 *   - then oldest-first until the total is under ARCHIVE_CAP_BYTES.
 *
 * Every function here tolerates R2 being unconfigured (returns a skipped
 * result): the archive is an extra, never a reason the pipeline fails.
 */
import { getAudioDownloadUrl, getRecallBot } from "./recall-pipeline.ts";
import { r2Delete, r2FromEnv, r2UploadStream, type R2Config } from "./r2.ts";

/** Under R2's 10 GB free tier with room for a day of new calls. */
export const ARCHIVE_CAP_BYTES = 9 * 1024 * 1024 * 1024;

/** Recall deletes media at 7 days; past this there is nothing to copy. */
const ARCHIVE_WINDOW_DAYS = 7;

export interface ArchiveRow {
  id: string;
  meeting_id: string | null;
  object_key: string;
  bytes: number;
  archived_at: string;
  content_pruned: boolean;
}

/**
 * Which archived objects to delete, in order. Pure, so the free-tier guarantee
 * is unit-tested rather than trusted.
 */
export function planSweep(rows: ArchiveRow[], capBytes = ARCHIVE_CAP_BYTES): ArchiveRow[] {
  const doomed = new Set<string>();
  for (const r of rows) {
    if (r.meeting_id === null || r.content_pruned) doomed.add(r.id);
  }
  let total = rows.filter((r) => !doomed.has(r.id)).reduce((sum, r) => sum + Number(r.bytes || 0), 0);
  const oldestFirst = rows
    .filter((r) => !doomed.has(r.id))
    .sort((a, b) => a.archived_at.localeCompare(b.archived_at));
  for (const r of oldestFirst) {
    if (total <= capBytes) break;
    doomed.add(r.id);
    total -= Number(r.bytes || 0);
  }
  return rows.filter((r) => doomed.has(r.id));
}

export function objectKeyFor(userId: string, meetingId: string): string {
  return `audio/${userId}/${meetingId}.mp3`;
}

export interface ArchiveResult {
  skipped?: string;
  archived: number;
  failed: number;
  swept: number;
  bytes_after?: number;
}

// deno-lint-ignore no-explicit-any
export async function sweepArchives(supabase: any, cfg: R2Config): Promise<{ swept: number; bytes: number }> {
  const { data, error } = await supabase
    .from("recording_archives")
    .select("id, meeting_id, object_key, bytes, archived_at, meetings(content_pruned_at)");
  if (error) throw new Error(`archive list failed: ${error.message}`);
  const rows: ArchiveRow[] = (data ?? []).map((r: any) => ({
    id: r.id,
    meeting_id: r.meeting_id,
    object_key: r.object_key,
    bytes: Number(r.bytes ?? 0),
    archived_at: r.archived_at,
    content_pruned: Boolean(r.meetings?.content_pruned_at),
  }));
  const doomed = planSweep(rows);
  let swept = 0;
  for (const r of doomed) {
    try {
      await r2Delete(cfg, r.object_key);
      await supabase.from("recording_archives").delete().eq("id", r.id);
      swept += 1;
    } catch (err) {
      console.warn(`[recording-archive] delete ${r.id} failed:`, err instanceof Error ? err.message : err);
    }
  }
  const doomedIds = new Set(doomed.map((d) => d.id));
  const bytes = rows.filter((r) => !doomedIds.has(r.id)).reduce((s, r) => s + r.bytes, 0);
  return { swept, bytes };
}

/**
 * Copy audio for completed Recall meetings that are not archived yet, stopping
 * when `deadline` (epoch ms) is near so the edge function returns in time.
 */
// deno-lint-ignore no-explicit-any
export async function archivePending(supabase: any, cfg: R2Config, deadline: number): Promise<{ archived: number; failed: number }> {
  const since = new Date(Date.now() - ARCHIVE_WINDOW_DAYS * 86_400_000).toISOString();
  const { data: candidates, error } = await supabase
    .from("meetings")
    .select("id, user_id, title, recall_bot_id, recording_archives(id)")
    .eq("status", "completed")
    .not("recall_bot_id", "is", null)
    .is("archive_attempted_at", null)
    .is("content_pruned_at", null)
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(50);
  if (error) throw new Error(`archive candidates failed: ${error.message}`);

  let archived = 0;
  let failed = 0;
  for (const m of candidates ?? []) {
    if (Date.now() > deadline) break;
    const existing = Array.isArray(m.recording_archives) ? m.recording_archives.length : m.recording_archives ? 1 : 0;
    if (existing > 0 || String(m.title ?? "").startsWith("[harness]")) continue;
    const key = objectKeyFor(m.user_id, m.id);
    try {
      const bot = await getRecallBot(m.recall_bot_id);
      const url = await getAudioDownloadUrl(bot, { allowVideoFallback: false });
      if (!url) throw new Error("Recall has no audio_mixed for this bot");
      const res = await fetch(url);
      if (!res.ok || !res.body) throw new Error(`Recall audio download ${res.status}`);
      const bytes = await r2UploadStream(cfg, key, res.body, "audio/mpeg");
      const { error: insertError } = await supabase
        .from("recording_archives")
        .insert({ meeting_id: m.id, object_key: key, bytes, content_type: "audio/mpeg" });
      if (insertError) {
        // No row means no sweep would ever find this object — remove it now.
        await r2Delete(cfg, key).catch(() => {});
        throw new Error(`archive row insert failed: ${insertError.message}`);
      }
      archived += 1;
    } catch (err) {
      failed += 1;
      console.warn(`[recording-archive] ${m.id}:`, err instanceof Error ? err.message : err);
    }
    // Stamped either way: a meeting Recall has no audio for is not retried daily.
    await supabase.from("meetings").update({ archive_attempted_at: new Date().toISOString() }).eq("id", m.id);
  }
  return { archived, failed };
}

/** The whole daily pass. `budgetMs` is how long it may run. */
// deno-lint-ignore no-explicit-any
export async function runArchiveTick(supabase: any, budgetMs: number): Promise<ArchiveResult> {
  const cfg = r2FromEnv();
  if (!cfg) return { skipped: "R2 not configured", archived: 0, failed: 0, swept: 0 };
  const deadline = Date.now() + budgetMs;
  const first = await sweepArchives(supabase, cfg);
  const { archived, failed } = await archivePending(supabase, cfg, deadline);
  // New copies can push the total over the cap; sweep again so it never stays there.
  const second = archived > 0 ? await sweepArchives(supabase, cfg) : { swept: 0, bytes: first.bytes };
  return { archived, failed, swept: first.swept + second.swept, bytes_after: second.bytes };
}
