/**
 * Post a finished meeting's summary to the owner's ClickUp Chat channel.
 *
 * Called from `afterInsightsSaved`, which runs on EVERY completion path —
 * Sarvam, the Whisper fallback, and regeneration — which is why this claims a
 * row in `clickup_deliveries` before posting: regenerating a meeting from
 * three weeks ago must not re-post it, and Sarvam has replayed one callback
 * three times. A duplicate message in a channel cannot be unsent.
 *
 * NEVER THROWS. Delivery is the last step of a meeting that has already
 * succeeded; a ClickUp outage or a revoked grant must not fail the meeting.
 */
import {
  buildSummaryMessage,
  ClickUpError,
  isChannelGone,
  isFatal,
  postMessage,
} from "./clickup.ts";
import { openConnectionTokens } from "./oauth-tokens.ts";

export async function deliverToClickUp(
  supabase: any,
  meeting: Record<string, any>,
  insights: Record<string, any>,
): Promise<{ posted: boolean; reason?: string }> {
  try {
    const { data: rawConn } = await supabase
      .from("clickup_connections")
      .select("*")
      .eq("user_id", meeting.user_id)
      .maybeSingle();

    if (!rawConn) return { posted: false, reason: "not_connected" };
    // Connecting and choosing a channel are separate steps; until one is
    // picked there is no safe default.
    if (!rawConn.channel_id || !rawConn.workspace_id) return { posted: false, reason: "no_channel" };
    if (rawConn.needs_reconnect) return { posted: false, reason: "needs_reconnect" };

    // Harness meetings must not post into a real channel, for the same reason
    // their summary emails are suppressed.
    if (String(meeting.title || "").startsWith("[harness]")) {
      return { posted: false, reason: "harness_meeting" };
    }

    const conn = await openConnectionTokens(rawConn);
    if (!conn?.access_token) return { posted: false, reason: "no_token" };

    // Claim BEFORE posting. A racing or replayed caller collides on the unique
    // (meeting_id, channel_id) index and returns here instead of posting again.
    const { error: claimError } = await supabase.from("clickup_deliveries").insert({
      meeting_id: meeting.id,
      user_id: meeting.user_id,
      channel_id: conn.channel_id,
    });
    if (claimError) {
      if (claimError.code === "23505") return { posted: false, reason: "already_posted" };
      console.error("[clickup] could not claim delivery:", claimError);
      return { posted: false, reason: "claim_failed" };
    }

    const appUrl = Deno.env.get("APP_URL") ?? "https://www.echobrief.in";
    const content = buildSummaryMessage(
      {
        id: String(meeting.id),
        title: meeting.title ?? null,
        start_time: meeting.start_time ?? null,
        duration_seconds: meeting.duration_seconds ?? null,
      },
      insights,
      appUrl,
    );

    try {
      const { id } = await postMessage(conn.access_token, conn.workspace_id, conn.channel_id, content);
      await supabase.from("clickup_deliveries")
        .update({ message_id: id })
        .eq("meeting_id", meeting.id)
        .eq("channel_id", conn.channel_id);
      await supabase.from("clickup_connections")
        .update({ last_posted_at: new Date().toISOString() })
        .eq("id", conn.id);
      return { posted: true };
    } catch (err) {
      const code = err instanceof ClickUpError
        ? (err.ecode || `http_${err.status}`)
        : "unknown";
      // Record why on the claim row rather than releasing it: releasing would
      // let every regeneration retry forever against a channel that is never
      // coming back. Reconnecting or re-picking is a deliberate user action.
      await supabase.from("clickup_deliveries")
        .update({ error: `${code}: ${String(err).slice(0, 200)}` })
        .eq("meeting_id", meeting.id)
        .eq("channel_id", conn.channel_id);

      if (isFatal(err)) {
        await supabase.from("clickup_connections")
          .update({ needs_reconnect: true })
          .eq("id", conn.id);
      } else if (isChannelGone(err)) {
        // Turns "silently not posting" into a visible "pick a channel" state.
        await supabase.from("clickup_connections")
          .update({ channel_id: null, channel_name: null })
          .eq("id", conn.id);
      }
      console.error(`[clickup] post failed for meeting ${meeting.id}: ${code}`);
      return { posted: false, reason: code };
    }
  } catch (err) {
    console.error("[clickup] delivery error:", err);
    return { posted: false, reason: "error" };
  }
}
