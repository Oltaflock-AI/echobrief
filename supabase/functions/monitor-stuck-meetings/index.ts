/**
 * monitor-stuck-meetings — periodic stuck-meeting detector + auto-recovery.
 *
 * Runs every 15 minutes via pg_cron (see 20260613120000_reduce_cron_frequency.sql;
 * the cadence is deliberately low to protect the Disk IO Budget). For each meeting in a non-terminal state
 * older than the threshold (15 min), classifies the failure into a signature,
 * attempts a known recovery, logs to `monitor_events`, and emails
 * ALERT_EMAIL_TO (default admin@oltaflock.ai) when (a) recovery fails or
 * (b) the signature is new.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  downloadAllSarvamResults,
  downloadSarvamResults,
  getSarvamJobStatus,
} from "../_shared/sarvam.ts";
import { authenticate, json } from "../_shared/auth.ts";
import { notifyRecentFailures } from "../_shared/failure-notice.ts";
import { buildAlertHtml, buildAlertSubject } from "./alert-template.ts";
import { COMPLETED_WITHOUT_TRANSCRIPT, completedWithoutTranscript } from "./integrity.ts";
import { KNOWN_PATTERNS, isKnown, RecoveryAction } from "./known-patterns.ts";
import { isLongMeeting } from "../_shared/whisper-chunked.ts";
import { captureError, withObservability } from "../_shared/observability.ts";
import { buildIoAlert, checkInstanceIo, describeIo, IO_SIGNATURE } from "../_shared/instance-io.ts";

const STUCK_AFTER_MIN = 15;
const SARVAM_TAKING_TOO_LONG_MIN = 30;
// Overridable so a departure never silently orphans the alerts again. It was
// previously pinned to an individual's mailbox; after they left the company on
// 2026-08-20 every stuck-meeting alert was delivered to a mailbox nobody read.
const ALERT_TO = Deno.env.get("ALERT_EMAIL_TO") || "admin@oltaflock.ai";
const ALERT_FROM = "EchoBrief Monitor <hello@echobrief.in>";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SARVAM_KEY = Deno.env.get("SARVAM_API_KEY")!;
const RESEND_KEY = Deno.env.get("RESEND_API_KEY")!;
const SARVAM_WEBHOOK_SECRET = Deno.env.get("SARVAM_WEBHOOK_SECRET")!;

/** How far back the terminal-status integrity check looks each tick. */
const INTEGRITY_WINDOW_HOURS = 48;

// Terminal statuses we DON'T watch — anything else is potentially stuck.
// Excluding by terminal-set means a future code path that introduces a new
// status string will still be observable to the monitor without an update.
const TERMINAL_STATUSES = ["completed", "failed", "cancelled"];
// Uploads are not stuck at 15 minutes — see detectSignature.
const ABANDONED_UPLOAD_AFTER_MIN = 6 * 60;

interface Meeting {
  id: string;
  user_id: string;
  title: string;
  status: string;
  recall_bot_id: string | null;
  sarvam_job_id: string | null;
  audio_url: string | null;
  start_time: string;
  updated_at: string;
  created_at: string;
  processing_config: Record<string, unknown> | null;
  error_message: string | null;
}

interface Detection {
  signature: string;
  details: Record<string, unknown>;
  age_minutes: number;
}

async function detectSignature(meeting: Meeting): Promise<Detection | null> {
  const lastUpdate = new Date(meeting.updated_at || meeting.created_at);
  const ageMinutes = (Date.now() - lastUpdate.getTime()) / 1000 / 60;

  // An upload gets its own, much longer clock. Nothing touches the row while
  // the browser is sending bytes, so its age grows *during* a healthy upload —
  // the 15-minute rule would cancel a large file still in flight over a slow
  // connection. Six hours is past any plausible upload and still bounded.
  if (meeting.status === "uploading") {
    if (ageMinutes < ABANDONED_UPLOAD_AFTER_MIN) return null;
    return {
      signature: "stuck:uploading:never_arrived",
      details: {
        age_minutes: Math.round(ageMinutes),
        status: meeting.status,
        upload: (meeting as Record<string, any>).processing_config?.upload ?? null,
      },
      age_minutes: ageMinutes,
    };
  }

  if (ageMinutes < STUCK_AFTER_MIN) return null;

  const baseDetails: Record<string, unknown> = {
    age_minutes: Math.round(ageMinutes),
    status: meeting.status,
    has_sarvam_job: !!meeting.sarvam_job_id,
    has_recall_bot: !!meeting.recall_bot_id,
    has_audio_url: !!meeting.audio_url,
  };

  // ---- processing ----
  if (meeting.status === "processing") {
    if (!meeting.sarvam_job_id) {
      return {
        signature: "stuck:processing:no_sarvam_job",
        details: baseDetails,
        age_minutes: ageMinutes,
      };
    }

    // Has sarvam_job_id — interrogate Sarvam
    let sarvamStatus: Record<string, unknown> = {};
    try {
      sarvamStatus = await getSarvamJobStatus(SARVAM_KEY, meeting.sarvam_job_id);
    } catch (err) {
      console.warn(`[monitor] Sarvam status query failed for ${meeting.sarvam_job_id}:`, err);
      return {
        signature: "stuck:processing:sarvam_unreachable",
        details: { ...baseDetails, error: String(err) },
        age_minutes: ageMinutes,
      };
    }

    const state = String(sarvamStatus.job_state || "").toLowerCase();
    const successCount = Number(sarvamStatus.successful_files_count || 0);
    const failCount = Number(sarvamStatus.failed_files_count || 0);
    const sarvamDetails = {
      ...baseDetails,
      sarvam_state: state,
      sarvam_success_count: successCount,
      sarvam_fail_count: failCount,
    };

    if (state === "completed") {
      if (failCount > 0) {
        // Look at the actual exception
        const details = (sarvamStatus.job_details as any[]) || [];
        const exception = details[0]?.exception_name || null;
        if (exception === "KeyError") {
          return {
            signature: "stuck:processing:sarvam_keyerror",
            details: { ...sarvamDetails, exception, error: details[0]?.error_message },
            age_minutes: ageMinutes,
          };
        }
        return {
          signature: "stuck:processing:sarvam_failed_other",
          details: { ...sarvamDetails, exception, error: details[0]?.error_message },
          age_minutes: ageMinutes,
        };
      }
      if (successCount > 0) {
        // Did it actually produce content? Chunked jobs (split via the Vercel
        // splitter) have MULTIPLE output files — checking only the first one
        // would misclassify a good job whose chunk 0 happens to be silent.
        const config = meeting.processing_config || {};
        const isChunked = (config as any).split_method === "vercel-ffmpeg";
        try {
          let hasContent: boolean;
          if (isChunked) {
            const all = await downloadAllSarvamResults(SARVAM_KEY, meeting.sarvam_job_id);
            hasContent = all.some((r) => String((r as any).transcript || "").trim());
          } else {
            const fileName = (config as any).audio_file_name || "audio.webm";
            const resultFileName = fileName.replace(/\.[^.]+$/, ".json");
            const result = await downloadSarvamResults(SARVAM_KEY, meeting.sarvam_job_id, resultFileName);
            hasContent = !!String((result as any).transcript || "").trim();
          }
          if (!hasContent) {
            return {
              signature: "stuck:processing:sarvam_silent_empty",
              details: { ...sarvamDetails, chunked: isChunked },
              age_minutes: ageMinutes,
            };
          }
          return {
            signature: "stuck:processing:sarvam_webhook_lost",
            details: { ...sarvamDetails, chunked: isChunked },
            age_minutes: ageMinutes,
          };
        } catch {
          return {
            signature: "stuck:processing:sarvam_silent_empty",
            details: { ...sarvamDetails, chunked: isChunked },
            age_minutes: ageMinutes,
          };
        }
      }
    }

    if (state === "pending" || state === "running") {
      if (ageMinutes > SARVAM_TAKING_TOO_LONG_MIN) {
        return {
          signature: "stuck:processing:sarvam_taking_too_long",
          details: sarvamDetails,
          age_minutes: ageMinutes,
        };
      }
      return null; // still working, give it more time
    }

    return {
      signature: "stuck:processing:unknown_state",
      details: sarvamDetails,
      age_minutes: ageMinutes,
    };
  }

  // ---- transcribing (Whisper fallback in flight) ----
  if (meeting.status === "transcribing") {
    return {
      signature: "stuck:transcribing:whisper_died",
      details: baseDetails,
      age_minutes: ageMinutes,
    };
  }

  // ---- recall lifecycle ----
  if (["joining", "in_call", "recording"].includes(meeting.status)) {
    return {
      signature: `stuck:${meeting.status}:recall_lifecycle`,
      details: baseDetails,
      age_minutes: ageMinutes,
    };
  }

  // ---- scheduled (bot never started) ----
  if (meeting.status === "scheduled") {
    // Only flag scheduled meetings whose start_time is past, not future ones
    const start = new Date(meeting.start_time);
    if (start.getTime() < Date.now() - 10 * 60 * 1000) {
      return {
        signature: "stuck:scheduled:never_started",
        details: { ...baseDetails, start_time: meeting.start_time },
        age_minutes: ageMinutes,
      };
    }
    return null;
  }

  return {
    signature: `stuck:${meeting.status}:unknown`,
    details: baseDetails,
    age_minutes: ageMinutes,
  };
}

async function attemptRecovery(
  recovery: RecoveryAction,
  meeting: Meeting,
  detection: Detection,
): Promise<{ ok: boolean; note: string }> {
  if (recovery === "none") {
    return { ok: false, note: "no automatic recovery for this signature" };
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  if (recovery === "mark_failed") {
    const errMsg = `Auto-marked failed by monitor (${detection.signature})`;
    await supabase
      .from("meetings")
      .update({ status: "failed", error_message: errMsg })
      .eq("id", meeting.id);
    return { ok: true, note: "marked failed" };
  }

  if (recovery === "mark_cancelled") {
    // Neutral, like a bot that was never admitted: no audio was captured, so
    // this is not a failure anyone should be paged about. Recovery "succeeding"
    // is what keeps it out of the alert mail.
    await supabase
      .from("meetings")
      .update({
        status: "cancelled",
        error_message: "Upload never completed — the file was not received.",
      })
      .eq("id", meeting.id);
    return { ok: true, note: "marked cancelled" };
  }

  if (recovery === "force_whisper") {
    // Reset state in case prior attempt left things weird
    await supabase
      .from("meetings")
      .update({ status: "processing", sarvam_webhook_triggered_at: null })
      .eq("id", meeting.id);

    const res = await fetch(`${SUPABASE_URL}/functions/v1/process-meeting`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({
        meetingId: meeting.id,
        forceWhisper: true,
      }),
    });
    const text = await res.text();
    if (!res.ok) {
      // If Whisper hit OOM (WORKER_RESOURCE_LIMIT), upgrade signature so we
      // don't keep retrying it forever.
      if (text.includes("WORKER_RESOURCE_LIMIT")) {
        return { ok: false, note: "whisper OOM — needs streaming fix" };
      }
      return { ok: false, note: `process-meeting returned ${res.status}: ${text.substring(0, 200)}` };
    }
    return { ok: true, note: "whisper fallback triggered" };
  }

  if (recovery === "trigger_sarvam_webhook") {
    if (!meeting.sarvam_job_id) {
      return { ok: false, note: "no sarvam_job_id to trigger" };
    }
    // The webhook skips `failed` / `transcribing`. Stuck recoveries must
    // reopen the row and drop a stale in-flight claim or the re-fire no-ops.
    await supabase
      .from("meetings")
      .update({
        status: "processing",
        error_message: null,
        sarvam_webhook_triggered_at: null,
        sarvam_webhook_claimed_at: null,
      })
      .eq("id", meeting.id);

    const res = await fetch(`${SUPABASE_URL}/functions/v1/sarvam-webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SARVAM_WEBHOOK_SECRET}`,
      },
      body: JSON.stringify({
        job_id: meeting.sarvam_job_id,
        job_state: "COMPLETED",
      }),
    });
    if (!res.ok) {
      return { ok: false, note: `sarvam-webhook returned ${res.status}` };
    }
    return { ok: true, note: "sarvam-webhook re-fired" };
  }

  if (recovery === "check_recall_status") {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/check-recall-status`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({ meeting_id: meeting.id }),
    });
    if (!res.ok) {
      return { ok: false, note: `check-recall-status returned ${res.status}` };
    }
    return { ok: true, note: "check-recall-status invoked" };
  }

  return { ok: false, note: `unknown recovery action: ${recovery}` };
}

/**
 * Send an already-built alert. Split out of sendAlertEmail so the instance-IO
 * alert — which has no meeting behind it — reuses the same Resend call, the
 * same from-address, and the same failure handling rather than a second copy.
 * `echobrief.in` is the only verified sending domain; an oltaflock.ai
 * from-address 403s.
 */
async function sendRawAlert(subject: string, html: string): Promise<boolean> {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_KEY}`,
      },
      body: JSON.stringify({ from: ALERT_FROM, to: ALERT_TO, subject, html }),
    });
    if (!res.ok) {
      console.error("[monitor] Resend error:", res.status, await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error("[monitor] Resend exception:", err);
    return false;
  }
}

async function sendAlertEmail(
  meeting: Meeting,
  detection: Detection,
  recoveryNote: string,
  recoveryOk: boolean,
  isNewPattern: boolean,
): Promise<boolean> {
  // Harness-created test meetings are noise in the inbox on every harness run,
  // so their alert is suppressed unless HARNESS_EMAILS=true is set for a
  // delivery-verification run. The monitor_events audit row is written either
  // way — that is what the harness actually asserts.
  const isHarnessMeeting = meeting.title.startsWith("[harness]");
  if (isHarnessMeeting && Deno.env.get("HARNESS_EMAILS") !== "true") {
    console.log(`[monitor] Skipping alert email for harness meeting ${meeting.id} (HARNESS_EMAILS not enabled)`);
    return false;
  }
  const subject = buildAlertSubject({
    meeting,
    detection,
    recoveryNote,
    recoveryOk,
    isNewPattern,
    isHarnessMeeting,
  });
  const html = buildAlertHtml({
    meeting,
    detection,
    recoveryNote,
    recoveryOk,
    isNewPattern,
    isHarnessMeeting,
  });

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_KEY}`,
      },
      body: JSON.stringify({
        from: ALERT_FROM,
        to: ALERT_TO,
        subject,
        html,
      }),
    });
    if (!res.ok) {
      console.error("[monitor] Resend error:", res.status, await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error("[monitor] Resend exception:", err);
    return false;
  }
}

serve(withObservability("monitor-stuck-meetings", async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // Cron-only: pg_cron sends the Vault-sourced service key (see migration
    // 20260831190000_cron_service_auth.sql); the harness calls with the .env
    // service-role JWT. Anyone else could trigger recovery actions and alert
    // mail at will.
    const caller = await authenticate(req, supabase);
    if (!caller.ok) return caller.response;
    if (!caller.isService) return json({ error: "Service only" }, 403);

    // Find every non-terminal meeting older than the threshold
    const cutoff = new Date(Date.now() - STUCK_AFTER_MIN * 60 * 1000).toISOString();
    const { data: meetings, error } = await supabase
      .from("meetings")
      .select("*")
      .not("status", "in", `(${TERMINAL_STATUSES.join(",")})`)
      .lt("updated_at", cutoff)
      .limit(50);  // safety bound

    if (error) {
      console.error("[monitor] Query error:", error);
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }

    const summary: any[] = [];

    for (const meeting of meetings || []) {
      const detection = await detectSignature(meeting as Meeting);
      if (!detection) continue;

      const known = isKnown(detection.signature);
      let recovery: RecoveryAction = known
        ? KNOWN_PATTERNS[detection.signature].recovery
        : "none";
      // Long meetings: full-file forceWhisper rejects >25 MB (or OOMs). Re-fire
      // sarvam-webhook, which stitches chunks and runs chunk-wise Whisper.
      if (recovery === "force_whisper" && isLongMeeting(meeting.processing_config as any)) {
        recovery = "trigger_sarvam_webhook";
      }

      const recoveryResult = await attemptRecovery(recovery, meeting as Meeting, detection);

      // Insert audit row — ON CONFLICT DO NOTHING dedupes within the hour bucket.
      // Use raw SQL so we know whether this was a fresh detection (worth emailing).
      const { data: inserted } = await supabase
        .from("monitor_events")
        .insert({
          meeting_id: meeting.id,
          error_signature: detection.signature,
          is_new_pattern: !known,
          recovery_attempted: recovery,
          recovery_succeeded: recoveryResult.ok,
          email_sent: false,
          details: { ...detection.details, recovery_note: recoveryResult.note },
        })
        .select("id")
        .maybeSingle();

      const isFreshDetection = !!inserted?.id;
      let emailSent = false;

      if (isFreshDetection) {
        // Email if either: new pattern, or recovery failed, or no auto-recovery
        const shouldEmail = !known || !recoveryResult.ok || recovery === "none";
        if (shouldEmail) {
          emailSent = await sendAlertEmail(
            meeting as Meeting,
            detection,
            recoveryResult.note,
            recoveryResult.ok,
            !known,
          );
          if (emailSent) {
            await supabase
              .from("monitor_events")
              .update({ email_sent: true })
              .eq("id", inserted!.id);
          }
        }
      }

      summary.push({
        meeting_id: meeting.id,
        signature: detection.signature,
        known,
        recovery,
        recovery_ok: recoveryResult.ok,
        recovery_note: recoveryResult.note,
        fresh: isFreshDetection,
        email_sent: emailSent,
      });
    }

    // Instance telemetry. Not about meetings at all — it rides this tick because
    // the alternative is another pg_cron job, and cron write-churn is the thing
    // the low cadence exists to avoid. Two consecutive samples 15 min apart give
    // a clean rate without the function ever sleeping. See engineering-notes #25.
    const io = await checkInstanceIo(supabase, {
      supabaseUrl: SUPABASE_URL,
      serviceKey: SERVICE_KEY,
    });
    if (io.rates) {
      console.log(`[monitor] instance io: ${describeIo(io.rates)}`);
    }
    if (io.shouldAlert && io.rates) {
      const { subject, html } = buildIoAlert(io.rates, io.consecutiveBreaches ?? 0);
      const sent = await sendRawAlert(subject, html);
      // Audit row with a NULL meeting_id — this is an instance condition, not a
      // meeting one. The dedup index is per (meeting, signature, hour) and NULLs
      // are distinct there, so the cooldown in checkInstanceIo is what actually
      // stops repeats; this row is the record, not the guard.
      await supabase.from("monitor_events").insert({
        meeting_id: null,
        error_signature: IO_SIGNATURE,
        is_new_pattern: false,
        recovery_attempted: "none",
        recovery_succeeded: null,
        email_sent: sent,
        details: { ...io.rates, consecutive_breaches: io.consecutiveBreaches },
      });
    }

    // Terminal-status integrity. The sweep above only queries NON-terminal
    // statuses, so a meeting that finished with the WRONG status is invisible to
    // it — which is how nine meetings sat as `completed` with no transcript for
    // seven weeks (see integrity.ts). Bounded to a recent window: the point is
    // catching a regression as it happens, not re-reporting history every tick.
    const integritySince = new Date(Date.now() - INTEGRITY_WINDOW_HOURS * 3600 * 1000).toISOString();
    const integrityFindings: any[] = [];
    try {
      const { data: recentCompleted } = await supabase
        .from("meetings")
        .select("id,title,status,content_pruned_at,created_at")
        .eq("status", "completed")
        .gte("updated_at", integritySince)
        .limit(100);

      const candidates = recentCompleted ?? [];
      if (candidates.length > 0) {
        const { data: haveTranscripts } = await supabase
          .from("transcripts")
          .select("meeting_id")
          .in("meeting_id", candidates.map((m: any) => m.id));
        const withTranscript = new Set(
          (haveTranscripts ?? []).map((t: any) => t.meeting_id as string),
        );

        for (const m of completedWithoutTranscript(candidates, withTranscript)) {
          const details = {
            title: m.title,
            created_at: m.created_at,
            note:
              "completed with no transcripts row and content_pruned_at IS NULL — a writer marked " +
              "an empty transcription as success instead of failed",
          };
          const { data: inserted } = await supabase
            .from("monitor_events")
            .insert({
              meeting_id: m.id,
              error_signature: COMPLETED_WITHOUT_TRANSCRIPT,
              is_new_pattern: false,
              recovery_attempted: "none",
              recovery_succeeded: null,
              email_sent: false,
              details,
            })
            .select("id")
            .maybeSingle();

          let emailed = false;
          if (inserted?.id) {
            emailed = await sendAlertEmail(
              m as Meeting,
              {
                signature: COMPLETED_WITHOUT_TRANSCRIPT,
                // Age of the meeting, not of a stall — this one is not stuck, it
                // is finished and wrong.
                age_minutes: m.created_at
                  ? Math.round((Date.now() - new Date(m.created_at).getTime()) / 60000)
                  : 0,
                details,
              },
              "No automatic recovery: the audio is pruned after 30 days, so the meeting cannot be re-transcribed.",
              false,
              false,
            );
            if (emailed) {
              await supabase.from("monitor_events").update({ email_sent: true }).eq("id", inserted.id);
            }
          }
          integrityFindings.push({ meeting_id: m.id, signature: COMPLETED_WITHOUT_TRANSCRIPT, email_sent: emailed });
        }
      }
    } catch (err) {
      // A failure here must not cost the tick its stuck-meeting detection.
      console.error("[monitor] integrity check failed:", err);
    }

    // Second pass: tell users about their own failed meetings. Until now the
    // only failure email in the system went to ALERT_EMAIL_TO — us — and the
    // person whose meeting failed was never told anything. Runs here rather
    // than at the eight places that write status='failed', and is idempotent
    // through the email_deliveries claim, so a 15-minute tick is harmless.
    // Never throws; stuck-meeting detection above must not depend on it.
    const failureNotices = await notifyRecentFailures(supabase);

    return new Response(
      JSON.stringify({
        ok: true,
        integrity: integrityFindings,
        scanned: meetings?.length || 0,
        events: summary.length,
        summary,
        instance_io: io,
        failure_notices: failureNotices,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[monitor] Fatal:", err);
    // The console line is ephemeral; this is the one that survives to be queried.
    await captureError(err, { fn: "monitor-stuck-meetings" });
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}));
