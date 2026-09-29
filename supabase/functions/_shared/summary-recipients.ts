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
//
// "On the invite" is not the only way to be on the call. A bot started by hand
// has no attendee list at all, and someone can join without being invited, so
// an allowlisted reviewer whose profile name is among the people Recall saw
// join (`processing_config.recall_participant_events`) counts too.

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

  const present = await presentAllowlistedEmails(supabase, meeting);
  return [...new Set([...attendeeEmails, ...present])];
}

/** Case- and whitespace-insensitive, so "vineet  patel" is "Vineet Patel". */
function nameKey(name: unknown): string {
  return typeof name === "string" ? name.trim().replace(/\s+/g, " ").toLowerCase() : "";
}

/**
 * Names Recall saw on the call. The stored events are the parsed
 * `{ name, action, ts }` shape (`presence.ts`); Recall's raw
 * `{ participant: { name } }` is read too, so either source works.
 */
export function participantNames(events: unknown): Set<string> {
  const names = new Set<string>();
  if (!Array.isArray(events)) return names;
  for (const e of events) {
    const key = nameKey((e as any)?.name ?? (e as any)?.participant?.name);
    if (key) names.add(key);
  }
  return names;
}

/**
 * Allowlisted addresses whose profile's full name is exactly a participant
 * name. Exact on purpose: the fuzzy speaker matcher the zones use would mail
 * vineet@ a copy of any call with a prospect who happens to be called Vineet.
 * Pure, so the matching rule is unit-tested without a database.
 */
export function matchPresentReviewers(
  events: unknown,
  reviewers: Array<{ email: string; full_name?: string | null }>,
): string[] {
  const present = participantNames(events);
  if (present.size === 0) return [];
  return [
    ...new Set(
      reviewers
        .filter((r) => typeof r.email === "string" && present.has(nameKey(r.full_name)))
        .map((r) => r.email.trim().toLowerCase()),
    ),
  ];
}

async function presentAllowlistedEmails(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  meeting: Record<string, any>,
): Promise<string[]> {
  try {
    // The in-memory row can predate the events: post-transcription fetches
    // them from Recall and writes them back after this meeting was read.
    let events = meeting.processing_config?.recall_participant_events;
    if (!Array.isArray(events) || events.length === 0) {
      const { data } = await supabase
        .from("meetings")
        .select("events:processing_config->recall_participant_events")
        .eq("id", meeting.id)
        .maybeSingle();
      events = data?.events;
    }
    if (!Array.isArray(events) || events.length === 0) return [];

    const { data: allowed } = await supabase
      .from("summary_recipient_allowlist")
      .select("email")
      .eq("active", true);
    const emails = (allowed ?? []).map((r: AllowlistedRecipient) => r.email.trim().toLowerCase());
    if (emails.length === 0) return [];

    const { data: profiles } = await supabase
      .from("profiles")
      .select("email, full_name")
      .in("email", emails);
    return matchPresentReviewers(events, profiles ?? []);
  } catch (err) {
    console.warn(`[summary-recipients] presence lookup failed for ${meeting.id}:`, err);
    return [];
  }
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
