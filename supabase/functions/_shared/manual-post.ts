/**
 * The owner-initiated half of channel delivery: "Post to Slack / ClickUp" on a
 * meeting page. Shared by manage-slack and manage-clickup so the two cannot
 * disagree about which meetings may be posted or what "already posted" means.
 *
 * The post itself still goes through `deliverToSlack` / `deliverToClickUp` with
 * `{ manual: true }`, so the claim row, the error handling and the message
 * builder are the pipeline's own — there is no second way to post.
 */

export type DeliveryTable = "slack_deliveries" | "clickup_deliveries";

/** The column each ledger uses for the provider's message id. */
const MESSAGE_COLUMN: Record<DeliveryTable, string> = {
  slack_deliveries: "message_ts",
  clickup_deliveries: "message_id",
};

/**
 * The meeting and its saved insights, scoped to the caller. One flat shape:
 * `error` is set (with an HTTP status) when the meeting cannot be posted.
 */
export async function loadMeetingForPost(
  supabase: any,
  userId: string,
  meetingId: string,
): Promise<{
  meeting: Record<string, any> | null;
  insights: Record<string, any> | null;
  error: string | null;
  status: number;
}> {
  const { data: meeting } = await supabase
    .from("meetings")
    .select("id, user_id, title, start_time, duration_seconds, status")
    .eq("id", meetingId)
    .eq("user_id", userId)
    .maybeSingle();
  // Scoped by user_id, so an observer or org member gets the same 404 as a
  // meeting that does not exist: only the owner decides what reaches a channel.
  if (!meeting) return { meeting: null, insights: null, error: "Meeting not found", status: 404 };
  if (meeting.status !== "completed") {
    return { meeting: null, insights: null, error: "This meeting has not finished processing yet.", status: 409 };
  }

  const { data: insights } = await supabase
    .from("meeting_insights")
    .select("*")
    .eq("meeting_id", meetingId)
    .maybeSingle();
  if (!insights) return { meeting: null, insights: null, error: "This meeting has no summary to post.", status: 409 };

  return { meeting, insights, error: null, status: 200 };
}

/**
 * A pressed "Post" is a deliberate retry, so a claim that FAILED (error set,
 * no message id) is cleared first; otherwise it would read as already posted
 * forever. A claim with neither error nor message id is a post in flight and
 * is left alone — deleting it could post twice.
 */
export async function clearFailedClaim(
  supabase: any,
  table: DeliveryTable,
  meetingId: string,
  channelId: string,
): Promise<void> {
  await supabase
    .from(table)
    .delete()
    .eq("meeting_id", meetingId)
    .eq("channel_id", channelId)
    .is(MESSAGE_COLUMN[table], null)
    .not("error", "is", null);
}

/**
 * What the meeting page shows next to the button: has this meeting been
 * posted to the channel currently chosen, and if the last try failed, why.
 */
export async function deliveryState(
  supabase: any,
  table: DeliveryTable,
  meetingId: string,
  userId: string,
  channelId: string | null,
): Promise<{ posted: boolean; posted_at: string | null; error: string | null }> {
  if (!channelId) return { posted: false, posted_at: null, error: null };
  const { data } = await supabase
    .from(table)
    .select(`${MESSAGE_COLUMN[table]}, error, created_at`)
    .eq("meeting_id", meetingId)
    .eq("user_id", userId)
    .eq("channel_id", channelId)
    .maybeSingle();
  if (!data) return { posted: false, posted_at: null, error: null };
  const posted = !!data[MESSAGE_COLUMN[table]];
  return { posted, posted_at: posted ? data.created_at : null, error: posted ? null : data.error ?? null };
}

/** The reasons a manual post returns, in words the owner can act on. */
export function describeReason(reason: string | undefined, provider: "Slack" | "ClickUp"): string {
  switch (reason) {
    case "not_connected": return `${provider} is not connected.`;
    case "no_channel": return `Choose a ${provider} channel in Settings first.`;
    case "needs_reconnect": return `${provider} needs reconnecting in Settings.`;
    case "already_posted": return "Already posted to this channel.";
    case "harness_meeting": return "Test meetings are never posted.";
    default: return `${provider} did not accept the post${reason ? ` (${reason})` : ""}.`;
  }
}
