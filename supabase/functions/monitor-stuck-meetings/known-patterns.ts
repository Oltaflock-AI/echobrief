/**
 * Known error signatures the monitor recognizes.
 *
 * Source of truth for the human-readable runbook is `/errors.md`. This file is
 * the programmatic mirror — when adding a new entry to errors.md, also add the
 * signature here with the appropriate recovery action.
 *
 * If the monitor encounters a signature NOT in this set, it logs to
 * `monitor_events` with `is_new_pattern = true` and emails ALERT_EMAIL_TO (default admin@oltaflock.ai)
 * so the new pattern can be investigated and added.
 */

export type RecoveryAction =
  | "force_whisper"          // POST process-meeting with forceWhisper:true
  | "trigger_sarvam_webhook" // POST sarvam-webhook with COMPLETED
  | "check_recall_status"    // POST check-recall-status
  | "mark_failed"            // set status=failed with error_message
  | "mark_cancelled"         // set status=cancelled — neutral, nothing was captured
  | "none";                  // log only, manual intervention required

export interface KnownPattern {
  signature: string;
  recovery: RecoveryAction;
  description: string;
}

export const KNOWN_PATTERNS: Record<string, KnownPattern> = {
  // -- Data-integrity patterns --
  // Not a stuck meeting: a TERMINAL one that lies. The monitor's main sweep only
  // looks at non-terminal statuses, so this state was invisible for months.
  "data:completed_without_transcript": {
    signature: "data:completed_without_transcript",
    recovery: "none",
    description:
      "A meeting is status=completed but has no row in `transcripts`, and prune-content did not " +
      "remove it (content_pruned_at IS NULL). Nine of these were found on 2026-09-09, all dated " +
      "2026-07-22 to 08-19: Sarvam returned an empty transcript, the pipeline wrote the " +
      "'No clear speech was detected' placeholder insights and marked the meeting completed. It then " +
      "looked successful on the dashboard, consumed quota, and could not be regenerated. Both writers " +
      "have since been fixed to mark such a run FAILED (sarvam-webhook's empty-transcript branch, " +
      "process-meeting's noUsableTranscript branch), so a fresh occurrence means one of those guards " +
      "has regressed or a new writer skipped them. The meeting itself is usually unrecoverable — the " +
      "archived audio is pruned after 30 days and Recall drops its copy after 7.",
  },

  // -- Instance / platform patterns --
  // Not a meeting signature: the monitor raises this from instance telemetry,
  // with a NULL meeting_id. Listed here so it is never reported as a NEW
  // pattern, and so errors.md and this file stay mirrored.
  "instance:disk_io_above_baseline": {
    signature: "instance:disk_io_above_baseline",
    recovery: "none",
    description:
      "Sustained disk IO over the compute tier's baseline for two consecutive 15-minute windows. " +
      "Usually NOT the database: check the per-device split first (scripts/disk-io-probe.sh) — if the " +
      "pgdata volume is a small share, it is swap on the root volume and no query or cron change helps. " +
      "The 2026-09-08 fix was restarting the instance, not upgrading the plan.",
  },

  // -- Upload patterns --
  "stuck:uploading:never_arrived": {
    signature: "stuck:uploading:never_arrived",
    recovery: "mark_cancelled",
    description:
      "An upload was authorised but the bytes never landed — the user closed the tab or lost connection. " +
      "Nothing was captured and nothing was spent, so this is CANCELLED, not failed, and must not alert: " +
      "it is a person changing their mind, not the pipeline breaking.",
  },

  // -- Sarvam patterns --
  "stuck:processing:sarvam_keyerror": {
    signature: "stuck:processing:sarvam_keyerror",
    recovery: "trigger_sarvam_webhook",
    description: "Sarvam returned KeyError on long audio. Re-fire webhook (chunk-wise Whisper fallback).",
  },
  "stuck:processing:sarvam_silent_empty": {
    signature: "stuck:processing:sarvam_silent_empty",
    recovery: "trigger_sarvam_webhook",
    description: "Sarvam returned successful job with empty transcript. Re-fire webhook (chunk-wise Whisper fallback).",
  },
  "stuck:processing:sarvam_webhook_lost": {
    signature: "stuck:processing:sarvam_webhook_lost",
    recovery: "trigger_sarvam_webhook",
    description: "Sarvam job is COMPLETED but our webhook never received the callback. Re-firing.",
  },
  "stuck:processing:sarvam_taking_too_long": {
    signature: "stuck:processing:sarvam_taking_too_long",
    recovery: "none",
    description: "Sarvam job still Pending/Running > 30 min. Likely stuck on their side. Manual investigation.",
  },

  // -- Recall lifecycle patterns --
  "stuck:processing:no_sarvam_job": {
    signature: "stuck:processing:no_sarvam_job",
    recovery: "check_recall_status",
    description: "Meeting in processing but no Sarvam job. Recall pipeline likely never ran. Re-trigger via check-recall-status.",
  },
  "stuck:joining:recall_lifecycle": {
    signature: "stuck:joining:recall_lifecycle",
    recovery: "check_recall_status",
    description: "Bot stuck in joining for too long. Check Recall API for actual state.",
  },
  "stuck:in_call:recall_lifecycle": {
    signature: "stuck:in_call:recall_lifecycle",
    recovery: "check_recall_status",
    description: "Bot stuck in_call for too long without recording event. Check Recall.",
  },
  "stuck:recording:recall_lifecycle": {
    signature: "stuck:recording:recall_lifecycle",
    recovery: "check_recall_status",
    description: "Bot stuck recording for too long without call_ended event. Check Recall.",
  },

  // -- Whisper patterns --
  "stuck:transcribing:whisper_died": {
    signature: "stuck:transcribing:whisper_died",
    recovery: "force_whisper",
    description: "process-meeting was triggered but appears to have died (likely OOM on long audio). Retrying once.",
  },
  "stuck:transcribing:whisper_oom_retry_failed": {
    signature: "stuck:transcribing:whisper_oom_retry_failed",
    recovery: "none",
    description: "Whisper has been retried but keeps OOMing. Needs the streaming-Whisper code change. Manual recovery via /tmp/recover_meeting.py.",
  },

  // -- Generic catch-all known states --
  "stuck:processing:unknown_state": {
    signature: "stuck:processing:unknown_state",
    recovery: "none",
    description: "Meeting in processing but doesn't match any known pattern. Investigate.",
  },

  // Terminal failures the monitor cannot observe (it only inspects non-terminal
  // statuses) are documented in errors.md without a signature here, so the two
  // files stay in step: `storage:file_size_limit_skips_splitter` and
  // `pipeline:hallucination_detector_discards_long_transcript` (both 2026-08-31)
  // end as status=failed within minutes and never look like a stuck meeting.
};

export function isKnown(signature: string): boolean {
  return signature in KNOWN_PATTERNS;
}
