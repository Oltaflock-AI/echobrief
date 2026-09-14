/**
 * Deletes archived meeting audio once it has served its purpose.
 *
 * Why this exists: every long meeting archives a ~46 MB mp3 to the `recordings`
 * bucket, and nothing ever removed them. On 2026-08-20 the bucket hit 1073 MB
 * against the 1 GB free-tier cap, at which point EVERY new recording's storage
 * upload failed. That is not a visible error — recall-pipeline logs the upload
 * failure and carries on, but with no archived audio it cannot produce a signed
 * URL for the splitter, so long audio fell through to whole-file Sarvam (which
 * returns an empty transcript above ~6 min) and then to whole-file Whisper
 * (which rejects >25 MB). Transcription had been silently dead since 2026-08-14.
 * See errors.md `storage:bucket_full_blocks_pipeline`.
 *
 * The mp3 is an archive, not the product — the transcript and insights are. Once
 * a meeting has a non-empty transcript and is old enough that nobody is going to
 * re-listen, the audio can go. Rows are kept; only `audio_url` is cleared.
 *
 * Scheduled daily by pg_cron (see 20260820160000_prune_recordings_cron.sql).
 *
 * The same tick also runs the Cloudflare R2 audio archive
 * (`_shared/recording-archive.ts`): copy new meetings' audio out of Recall
 * before its 7-day retention ends, then sweep deleted/expired copies and keep
 * the bucket under the free tier. Riding this tick instead of adding a cron job
 * is deliberate — pg_cron write churn is what the Disk IO budget can't afford.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticate, json } from "../_shared/auth.ts";
import { runArchiveTick } from "../_shared/recording-archive.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Audio exists for transcription, not for listening: the meeting page's
// Recording tab plays Recall's mp4 (streamed from Recall, never stored here)
// and only falls back to this archived mp3 for meetings recorded before video
// was enabled. So it is kept just long enough to re-run a pipeline that failed
// late — a longer window would put the 1 GB cap back at risk for a fallback
// almost nobody hits. The candidate query below
// already refuses to delete audio for a meeting with no transcript, so a
// failed meeting keeps its recording regardless of this number.
//
// The 1 GB free-tier cap is what took the product down on 2026-08-14. Holding
// a month of write-once, read-never audio against it was the whole risk.
const RETAIN_DAYS = 3;
// Belt and braces: if the bucket is close to the cap, prune harder rather than
// let uploads start failing again.
const URGENT_RETAIN_DAYS = 1;
// Audio for a meeting that never produced a transcript is kept much longer,
// because it is the only copy of what was said and a late recovery can still
// use it. But "much longer" is not "forever": before this cap, every failure
// parked ~40 MB in the bucket permanently, so the 1 GB cap was being consumed
// by exactly the meetings that went wrong. A failure nobody recovered in a
// month is not going to be recovered.
const FAILED_RETAIN_DAYS = 30;
const CAP_BYTES = 1024 * 1024 * 1024;
const URGENT_THRESHOLD = 0.85 * CAP_BYTES;

async function bucketBytes(supabase: any): Promise<number> {
  let total = 0;
  const { data: users } = await supabase.storage.from("recordings").list("", { limit: 1000 });
  for (const u of users ?? []) {
    if (u.id) continue; // a file at the root, not a user folder
    const { data: meetings } = await supabase.storage
      .from("recordings").list(u.name, { limit: 1000 });
    for (const m of meetings ?? []) {
      if (m.id) continue;
      const { data: files } = await supabase.storage
        .from("recordings").list(`${u.name}/${m.name}`, { limit: 100 });
      for (const f of files ?? []) total += Number(f.metadata?.size ?? 0);
    }
  }
  return total;
}

serve(async (req) => {
  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // Cron-only: pg_cron sends the Vault-sourced service key (see migration
    // 20260831190000_cron_service_auth.sql). This function deletes storage
    // objects — nothing short of the service role may invoke it.
    const caller = await authenticate(req, supabase);
    if (!caller.ok) return caller.response;
    if (!caller.isService) return json({ error: "Service only" }, 403);

    // ?dry_run=1 reports exactly what would be deleted without touching storage.
    const dryRun = new URL(req.url).searchParams.get("dry_run") === "1";

    const before = await bucketBytes(supabase);
    const retainDays = before > URGENT_THRESHOLD ? URGENT_RETAIN_DAYS : RETAIN_DAYS;
    const cutoff = new Date(Date.now() - retainDays * 86_400_000).toISOString();

    // Only meetings that already have a real transcript — never delete the audio
    // for something we failed to transcribe, that is the one case where the raw
    // recording is still the only copy of the meeting.
    // Widest window we might act on: transcribed audio past `cutoff`, plus
    // untranscribed audio past the much longer failure cutoff.
    const failedCutoff = new Date(
      Date.now() - Math.max(retainDays, FAILED_RETAIN_DAYS) * 86_400_000,
    ).toISOString();
    const { data: candidates, error } = await supabase
      .from("meetings")
      .select("id, audio_url, created_at, transcripts(id, content)")
      .not("audio_url", "is", null)
      .lt("created_at", cutoff);

    if (error) throw new Error(`candidate query failed: ${error.message}`);

    const paths: string[] = [];
    const ids: string[] = [];
    for (const m of candidates ?? []) {
      const t = Array.isArray(m.transcripts) ? m.transcripts[0] : m.transcripts;
      const transcribed = String(t?.content ?? "").trim().length > 0;
      // Untranscribed audio survives until the failure cutoff, then goes too.
      if (!transcribed && m.created_at >= failedCutoff) continue;
      paths.push(String(m.audio_url).replace(/^recordings\//, ""));
      ids.push(m.id);
    }

    let removed = 0;
    if (dryRun) {
      const result = {
        dry_run: true,
        retain_days: retainDays,
        would_remove: paths.length,
        bytes_now: before,
        headroom_mb: Math.round((CAP_BYTES - before) / 1024 / 1024),
        sample: paths.slice(0, 5),
      };
      console.log("[prune-recordings] DRY RUN", JSON.stringify(result));
      return new Response(JSON.stringify(result), {
        headers: { "Content-Type": "application/json" },
      });
    }
    if (paths.length > 0) {
      const { error: rmError } = await supabase.storage.from("recordings").remove(paths);
      if (rmError) throw new Error(`storage remove failed: ${rmError.message}`);
      removed = paths.length;
      // Clear audio_url so the UI stops offering playback for a file that is gone.
      await supabase.from("meetings").update({ audio_url: null }).in("id", ids);
    }

    const after = await bucketBytes(supabase);

    // R2 archive. Its own failure is reported, never allowed to fail the prune.
    // ~100 s leaves the edge function's 150 s wall clock room to return.
    let archive: unknown;
    try {
      archive = await runArchiveTick(supabase, 100_000);
    } catch (err) {
      archive = { error: err instanceof Error ? err.message : String(err) };
    }

    const result = {
      archive,
      retain_days: retainDays,
      removed,
      bytes_before: before,
      bytes_after: after,
      freed_mb: Math.round((before - after) / 1024 / 1024),
      headroom_mb: Math.round((CAP_BYTES - after) / 1024 / 1024),
    };
    console.log("[prune-recordings]", JSON.stringify(result));
    return new Response(JSON.stringify(result), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[prune-recordings] error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
