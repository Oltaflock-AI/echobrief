/**
 * Dashboard access for allowlisted reviewers who were on the invite.
 *
 * The rule is the one `summary-recipients.ts` already uses for the reviewer
 * email copy, narrowed by one flag:
 *
 *     on `summary_recipient_allowlist` with dashboard_access = true
 *   ∩ on this meeting's attendee list
 *   − the owner (they already own it)
 *
 * The result is materialised into `meeting_observers`, so RLS is a
 * primary-key lookup instead of re-deriving attendee shapes on every row of
 * every query (migration 20260909140000 explains that trade in full).
 *
 * Never throws. A reviewer silently not gaining access is a support ticket; an
 * exception here would happen AFTER the insights are saved and would fail a
 * meeting that had already succeeded.
 */
import { resolveMeetingAttendeeEmails } from "./summary-recipients.ts";

export interface ObserverGrant {
  user_id: string;
  email: string;
}

/**
 * Which accounts should observe this meeting. Split out from the write so it
 * can be unit-tested without a database.
 */
export async function resolveObservers(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  meeting: Record<string, any>,
  ownerEmail?: string | null,
): Promise<ObserverGrant[]> {
  const attendeeEmails = await resolveMeetingAttendeeEmails(supabase, meeting);
  if (attendeeEmails.length === 0) return [];

  const { data: allowed, error } = await supabase
    .from("summary_recipient_allowlist")
    .select("email")
    .eq("active", true)
    .eq("dashboard_access", true);

  if (error) {
    console.error(`[observers] Allowlist lookup failed: ${error.message}`);
    return [];
  }

  const attendeeSet = new Set(attendeeEmails);
  const owner = ownerEmail?.trim().toLowerCase();

  const emails = [
    ...new Set(
      (allowed || [])
        .map((r: { email: string }) => r.email.trim().toLowerCase())
        .filter((email: string) => attendeeSet.has(email) && email !== owner),
    ),
  ] as string[];

  if (emails.length === 0) return [];

  // An allowlisted reviewer without an account yet gets nothing today; the
  // backfill script picks them up once they sign up, which is why the grant is
  // re-resolvable rather than one-shot.
  const { data: profiles, error: profileError } = await supabase
    .from("profiles")
    .select("user_id, email")
    .in("email", emails);

  if (profileError) {
    console.error(`[observers] Profile lookup failed: ${profileError.message}`);
    return [];
  }

  const grants: ObserverGrant[] = [];
  const seen = new Set<string>();
  for (const row of profiles || []) {
    const email = String(row.email ?? "").trim().toLowerCase();
    // `profiles.email` is not stored lowercased everywhere, and `.in()` is
    // case-sensitive — re-check rather than trust the filter.
    if (!emails.includes(email)) continue;
    if (row.user_id === meeting.user_id || seen.has(row.user_id)) continue;
    seen.add(row.user_id);
    grants.push({ user_id: row.user_id, email });
  }

  return grants;
}

/**
 * Grant read access to every reviewer this meeting qualifies. Idempotent: the
 * primary key is (meeting_id, user_id), so a regeneration or a replayed Sarvam
 * callback re-grants the same rows instead of duplicating them.
 */
export async function grantMeetingObservers(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  meeting: Record<string, any>,
  ownerEmail?: string | null,
): Promise<string[]> {
  try {
    const grants = await resolveObservers(supabase, meeting, ownerEmail);
    if (grants.length === 0) return [];

    const { error } = await supabase
      .from("meeting_observers")
      .upsert(
        grants.map((g) => ({
          meeting_id: meeting.id,
          user_id: g.user_id,
          email: g.email,
          reason: "allowlist_attendee",
        })),
        { onConflict: "meeting_id,user_id", ignoreDuplicates: true },
      );

    if (error) {
      console.error(`[observers] Grant failed for ${meeting.id}: ${error.message}`);
      return [];
    }

    console.log(`[observers] ${meeting.id} → ${grants.map((g) => g.email).join(", ")}`);
    return grants.map((g) => g.email);
  } catch (err) {
    console.error("[observers] Grant resolution failed:", err);
    return [];
  }
}
