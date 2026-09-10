/**
 * "Share my meetings with my workspace automatically."
 *
 * Sharing a meeting was always possible; doing it per meeting, from a dialog,
 * after the fact, is what made a workspace feel pointless. This is the setting
 * that closes that gap: when the owner has `profiles.auto_share_to_org` on and
 * belongs to a workspace, the share row is written by the pipeline as the
 * insights land, so colleagues see the meeting without anybody remembering to
 * press anything.
 *
 * Deliberately forward-only. Turning the setting on does NOT reach back and
 * share the meetings you already had — widening access to past meetings is a
 * decision somebody has to make on purpose, not a side effect of ticking a box.
 *
 * Never throws, for the same reason as `observers.ts`: it runs AFTER the
 * insights are saved, and a failure here must not fail a meeting that already
 * succeeded.
 */

/** What a workspace share carries. Colleagues are internal, so: everything. */
export const ORG_SHARE_DEFAULTS = {
  include_transcript: true,
  include_recording: true,
} as const;

export async function autoShareToOrg(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  meeting: Record<string, any>,
): Promise<boolean> {
  try {
    const ownerId = meeting?.user_id;
    const meetingId = meeting?.id;
    if (!ownerId || !meetingId) return false;

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("auto_share_to_org")
      .eq("user_id", ownerId)
      .maybeSingle();
    if (profileError) {
      console.error(`[org-share] Profile lookup failed: ${profileError.message}`);
      return false;
    }
    if (profile?.auto_share_to_org !== true) return false;

    const { data: membership, error: memberError } = await supabase
      .from("org_members")
      .select("org_id")
      .eq("user_id", ownerId)
      .maybeSingle();
    if (memberError) {
      console.error(`[org-share] Membership lookup failed: ${memberError.message}`);
      return false;
    }
    // The setting outliving the membership is normal — somebody leaves a
    // workspace without visiting settings — and means nothing to share to.
    if (!membership?.org_id) return false;

    const { error } = await supabase.from("meeting_shares").insert({
      meeting_id: meetingId,
      created_by: ownerId,
      scope: "org",
      org_id: membership.org_id,
      ...ORG_SHARE_DEFAULTS,
    });
    // 23505 = already shared to this workspace, which is the desired state.
    // This runs on regeneration too, so it is the common case, not an error.
    if (error && error.code !== "23505") {
      console.error(`[org-share] Share insert failed: ${error.message}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[org-share] Unexpected failure:", err);
    return false;
  }
}
