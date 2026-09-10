/**
 * What a workspace share actually grants, resolved in one place.
 *
 * A meeting reaches a colleague through exactly one row: `meeting_shares` with
 * `scope = 'org'`. Two read paths need to ask about it — the transcript
 * (`get-org-transcript`) and the recording (`get-recording-media`) — and RLS
 * cannot answer for either: it cannot filter elements inside a JSONB array, and
 * it does not run at all in a service-role function. So the question is asked
 * here, once, rather than reimplemented per call site with slightly different
 * ideas about what "revoked" means.
 *
 * `meetings` and `meeting_insights` still answer it in SQL, via the
 * `meeting_shared_to_my_org` helper from 20260901200000. The rule below is that
 * helper's twin and must stay in step with it: same scope, same revoked check,
 * same expiry check.
 */

export interface OrgShareAccess {
  shareId: string;
  orgId: string;
  /** Whether this share carries the meeting-zone transcript. */
  includeTranscript: boolean;
  /** Whether this share carries the recording — the WHOLE call, zones included. */
  includeRecording: boolean;
}

export interface OrgShareRow {
  id?: string | null;
  org_id?: string | null;
  scope?: string | null;
  revoked_at?: string | null;
  expires_at?: string | null;
  include_transcript?: boolean | null;
  include_recording?: boolean | null;
}

/**
 * Is this row a live org share? Pure, so the rule that decides whether a
 * colleague can read a transcript is testable without a database.
 */
export function isLiveOrgShare(row: OrgShareRow | null | undefined, now: Date = new Date()): boolean {
  if (!row || row.scope !== "org") return false;
  if (row.revoked_at) return false;
  if (row.expires_at) {
    const expiry = Date.parse(row.expires_at);
    // An unparseable expiry is treated as expired: when the rule cannot be
    // evaluated, the answer is no.
    if (!Number.isFinite(expiry) || expiry <= now.getTime()) return false;
  }
  return true;
}

/**
 * The access `userId` holds on `meetingId` through their workspace, or null.
 *
 * `supabase` must be a service-role client — this IS the authorisation check,
 * so it deliberately reads tables the caller cannot. Denies on any error: a
 * lookup failure must not widen access.
 */
export async function orgShareFor(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  meetingId: string,
  userId: string,
): Promise<OrgShareAccess | null> {
  if (!meetingId || !userId) return null;

  const { data: membership, error: memberError } = await supabase
    .from("org_members")
    .select("org_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (memberError) {
    console.error(`[org-access] Membership lookup failed: ${memberError.message}`);
    return null;
  }
  if (!membership?.org_id) return null;

  const { data: share, error: shareError } = await supabase
    .from("meeting_shares")
    .select("id, org_id, scope, revoked_at, expires_at, include_transcript, include_recording")
    .eq("meeting_id", meetingId)
    .eq("org_id", membership.org_id)
    .eq("scope", "org")
    .maybeSingle();
  if (shareError) {
    console.error(`[org-access] Share lookup failed: ${shareError.message}`);
    return null;
  }
  if (!isLiveOrgShare(share)) return null;

  return {
    shareId: String(share.id),
    orgId: String(share.org_id),
    includeTranscript: share.include_transcript === true,
    includeRecording: share.include_recording === true,
  };
}
