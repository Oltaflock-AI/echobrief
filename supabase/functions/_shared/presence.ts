/**
 * Who was in the call, and when — the inputs `boundariesFromPresence` needs.
 *
 * Recall records every participant join and leave (the bot excluded) and
 * serves it as `media_shortcuts.participant_events`, downloadable while the
 * recording is inside retention (7 days). Measured 2026-09-29 on the YDSM
 * call: the guest joined at 559 s and left at 1479 s, where the speech
 * estimate had guessed 523–1492.
 *
 * "Internal" names come from our own tables, not the calendar, so a bot
 * started by hand — which has no attendee list — still knows who the team is.
 *
 * Nothing here throws: a missing event file or a failed profile read means the
 * speech estimate runs instead, never a failed meeting.
 */
import { getRecallBot } from "./recall-pipeline.ts";
import type { PresenceEvent } from "./zones.ts";

/** Keep named join/leave rows with a numeric `timestamp.relative`. */
export function parseParticipantEvents(raw: unknown): PresenceEvent[] {
  if (!Array.isArray(raw)) return [];
  const out: PresenceEvent[] = [];
  for (const e of raw) {
    const action = e?.action;
    if (action !== "join" && action !== "leave") continue;
    const name = typeof e?.participant?.name === "string" ? e.participant.name.trim() : "";
    const ts = Number(e?.timestamp?.relative);
    if (!name || e?.timestamp?.relative == null || !Number.isFinite(ts)) continue;
    out.push({ action, name, ts });
  }
  return out;
}

/** The bot's join/leave events, or [] when Recall has none to give. */
export async function fetchParticipantEvents(botId: string): Promise<PresenceEvent[]> {
  try {
    const bot = await getRecallBot(botId);
    const url = bot?.recordings?.[0]?.media_shortcuts?.participant_events?.data
      ?.participant_events_download_url;
    if (typeof url !== "string" || !url) return [];
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[presence] participant_events download returned ${res.status} for bot ${botId}`);
      return [];
    }
    return parseParticipantEvents(await res.json());
  } catch (err) {
    console.warn(`[presence] participant_events unavailable for bot ${botId}:`, err);
    return [];
  }
}

/**
 * The owner's name plus every member of the owner's workspace — the people a
 * share recipient should never have to sit through chatting among themselves.
 */
export async function internalNamesFor(supabase: any, userId: string): Promise<string[]> {
  try {
    const { data: membership, error: memberError } = await supabase
      .from("org_members")
      .select("org_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (memberError) throw memberError;

    let userIds = [userId];
    if (membership?.org_id) {
      const { data: members, error } = await supabase
        .from("org_members")
        .select("user_id")
        .eq("org_id", membership.org_id);
      if (error) throw error;
      userIds = [...new Set([userId, ...(members ?? []).map((m: { user_id: string }) => m.user_id)])];
    }

    const { data: profiles, error } = await supabase
      .from("profiles")
      .select("user_id, full_name")
      .in("user_id", userIds);
    if (error) throw error;
    return (profiles ?? [])
      .map((p: { full_name?: string | null }) => (p.full_name ?? "").trim())
      .filter(Boolean);
  } catch (err) {
    console.warn(`[presence] could not read the team for ${userId}:`, err);
    return [];
  }
}
