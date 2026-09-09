// Who else gets the summary for a meeting.
//
// Rule: an address on `summary_recipient_allowlist` that also appears in the
// meeting's attendee list gets the same summary mail the owner gets. Nothing
// else fans the mail out — being on the allowlist alone is not enough, and
// being an attendee alone is certainly not enough.
//
// Attendees reach us in three shapes depending on the path that created the
// meeting, so every reader here is defensive:
//   * auto-join      → `meetings.attendees` jsonb array of Google attendee objects
//   * older rows     → `meetings.attendees` NULL (written before auto-join stored them)
//   * calendar sync  → `calendar_events.attendees`, jsonb OR a JSON *string*
//                      (sync-calendar-events JSON.stringify()s it)

export interface AllowlistedRecipient {
  email: string;
}

/** Pull lowercased email addresses out of whatever an `attendees` column holds. */
export function extractAttendeeEmails(attendees: unknown): string[] {
  let list: unknown = attendees;

  // sync-calendar-events stores a JSON string, not an array.
  if (typeof list === "string") {
    try {
      list = JSON.parse(list);
    } catch {
      return [];
    }
  }

  if (!Array.isArray(list)) return [];

  const emails = list
    .map((a: any) => (typeof a === "string" ? a : a?.email))
    .filter((e: unknown): e is string => typeof e === "string" && e.includes("@"))
    .map((e) => e.trim().toLowerCase());

  return [...new Set(emails)];
}

/**
 * Every attendee address on a meeting, whichever shape it reached us in.
 *
 * Exported because `observers.ts` asks the same question the summary copy does
 * — "was this person on the invite?" — and two answers that could disagree
 * would mean a reviewer gets the mail but not the meeting, or the reverse.
 */
export async function resolveMeetingAttendeeEmails(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  meeting: Record<string, any>,
): Promise<string[]> {
  let attendeeEmails = extractAttendeeEmails(meeting.attendees);

  // Meetings created before auto-join persisted attendees (and manual
  // dashboard recordings started from a calendar event) carry only the
  // calendar_event_id — fall back to the synced event row.
  if (attendeeEmails.length === 0 && meeting.calendar_event_id) {
    const { data: event } = await supabase
      .from("calendar_events")
      .select("attendees")
      .eq("user_id", meeting.user_id)
      .eq("event_id", meeting.calendar_event_id)
      .maybeSingle();
    attendeeEmails = extractAttendeeEmails(event?.attendees);
  }

  return attendeeEmails;
}

/**
 * Allowlisted addresses that are on this meeting's invite, minus `excludeEmail`
 * (the owner — they are mailed by the normal path and the claim row would skip
 * a second send anyway).
 *
 * Never throws: a missing table or a failed lookup means "no extra recipients",
 * because losing the owner's summary over a reviewer CC would be the worse bug.
 */
export async function resolveAllowlistedRecipients(
  supabase: any,
  meeting: Record<string, any>,
  excludeEmail?: string | null,
): Promise<string[]> {
  try {
    const attendeeEmails = await resolveMeetingAttendeeEmails(supabase, meeting);

    if (attendeeEmails.length === 0) return [];

    const { data: allowed, error } = await supabase
      .from("summary_recipient_allowlist")
      .select("email")
      .eq("active", true);

    if (error) {
      console.error(`[summary-recipients] Allowlist lookup failed: ${error.message}`);
      return [];
    }

    const attendeeSet = new Set(attendeeEmails);
    const owner = excludeEmail?.trim().toLowerCase();

    const matches: string[] = (allowed || [])
      .map((r: AllowlistedRecipient) => r.email.trim().toLowerCase())
      .filter((email: string) => attendeeSet.has(email) && email !== owner);

    return [...new Set(matches)];
  } catch (err) {
    console.error("[summary-recipients] Resolution failed:", err);
    return [];
  }
}
