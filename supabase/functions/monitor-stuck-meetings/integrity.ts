/**
 * Terminal-status integrity checks.
 *
 * The monitor's main sweep asks "which meetings are stuck?" — it queries only
 * NON-terminal statuses, because a terminal status means the pipeline has
 * finished having an opinion. That leaves one blind spot: a meeting that
 * finished with the wrong opinion.
 *
 * Found 2026-09-09 while backfilling insights. Nine meetings were
 * `status = completed` with no row in `transcripts` at all. Sarvam had returned
 * an empty transcript, the pipeline saved the "No clear speech was detected"
 * placeholder insights, and marked the meeting complete. On the dashboard they
 * were indistinguishable from real meetings: they consumed quota, they could
 * not be regenerated (there is nothing to regenerate from), and because
 * `completed` is terminal, the monitor never looked at them. Nobody was told,
 * for seven weeks.
 *
 * Both writers now mark that case failed — `sarvam-webhook`'s empty-transcript
 * branch and `process-meeting`'s `noUsableTranscript` branch — so this check is
 * a regression detector, not a workaround for a live bug.
 */

export interface IntegrityMeeting {
  id: string;
  title?: string | null;
  status?: string | null;
  /** Set by prune-content when it removes expired content — an EXPECTED absence. */
  content_pruned_at?: string | null;
  created_at?: string | null;
}

export const COMPLETED_WITHOUT_TRANSCRIPT = "data:completed_without_transcript";

/**
 * Completed meetings that have no transcript and no legitimate reason to lack
 * one.
 *
 * `transcriptMeetingIds` is the set of meeting ids that DO have a transcript
 * row; the caller fetches it for the same window, so this stays a pure set
 * difference and can be tested without a database.
 *
 * Two absences are legitimate and must not alert:
 *   - `content_pruned_at` is set — retention removed it on purpose.
 *   - the meeting is not `completed` — a failed or cancelled meeting is
 *     supposed to have nothing, and a still-running one is the main sweep's job.
 */
export function completedWithoutTranscript(
  meetings: IntegrityMeeting[],
  transcriptMeetingIds: Set<string>,
): IntegrityMeeting[] {
  return (Array.isArray(meetings) ? meetings : []).filter(
    (m) =>
      !!m &&
      m.status === "completed" &&
      !m.content_pruned_at &&
      !transcriptMeetingIds.has(m.id),
  );
}
