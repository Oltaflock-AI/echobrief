/**
 * Meeting boundary detection (privacy trim).
 *
 * A bot joins before the guest does and keeps recording after they leave, so
 * recordings capture internal pre-call chatter and the post-call debrief.
 * One shared summary and a prospect reads the pitch strategy. This module
 * splits a meeting into pre / meeting / post zones so insights, email and the
 * MCP surface can default to the external-facing window only.
 *
 * First choice is `boundariesFromPresence`: Recall's participant_events carry
 * real join/leave times, so the window is "first guest joined → last guest
 * left", with guests being anyone who is not the owner, a workspace member or
 * an owner-domain attendee (`source: "presence"`). That needs no attendee list,
 * so it covers bots started by hand.
 *
 * When there are no events (Recall media past retention, a download failure),
 * `computeBoundaries` estimates the window from when external calendar
 * attendees (email domain ≠ owner's) actually SPEAK in the Recall speaker
 * timeline, padded outward — `source: "speech_estimated"`.
 *
 * Pure and synchronous. Unit-tested in tests/zones_test.ts.
 */
import type { SpeakerSegment } from "./insights.ts";
import type { SpeakerTimelineEntry } from "./recall-pipeline.ts";

export type Zone = "pre" | "meeting" | "post";

export interface Attendee {
  email?: string;
  displayName?: string;
  organizer?: boolean;
  self?: boolean;
}

export interface Boundaries {
  /** Seconds into the recording. Null when the whole recording is `meeting`. */
  first_external_join_ts: number | null;
  last_external_leave_ts: number | null;
  source: "presence" | "speech_estimated" | "llm_estimated" | "none";
  internal_only: boolean;
}

/** One participant join or leave from Recall's participant_events (the bot is not in it). */
export interface PresenceEvent {
  action: "join" | "leave";
  name: string;
  /** Seconds into the recording. */
  ts: number;
}

/** Speech this many seconds before the first external utterance still counts as greeting. */
const JOIN_PAD_SECONDS = 45;
/** Goodbyes run a little past the last external utterance. */
const LEAVE_PAD_SECONDS = 20;

function domainOf(email: unknown): string | null {
  const at = String(email ?? "").trim().toLowerCase().split("@");
  return at.length === 2 && at[1] ? at[1] : null;
}

/**
 * The owner's domain: the `self` attendee's, else the organizer's, else the
 * most common domain among attendees. Null when attendees carry no emails.
 */
export function ownerDomain(attendees: Attendee[] | null | undefined): string | null {
  const list = Array.isArray(attendees) ? attendees : [];
  const self = list.find((a) => a.self && domainOf(a.email));
  if (self) return domainOf(self.email);
  const organizer = list.find((a) => a.organizer && domainOf(a.email));
  if (organizer) return domainOf(organizer.email);
  const counts = new Map<string, number>();
  for (const a of list) {
    const d = domainOf(a.email);
    if (d) counts.set(d, (counts.get(d) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [d, c] of counts) {
    if (c > bestCount) {
      best = d;
      bestCount = c;
    }
  }
  return best;
}

export function externalAttendees(
  attendees: Attendee[] | null | undefined,
  internalDomain: string | null,
): Attendee[] {
  if (!internalDomain) return [];
  return (Array.isArray(attendees) ? attendees : []).filter((a) => {
    const d = domainOf(a.email);
    return d !== null && d !== internalDomain;
  });
}

function nameTokens(value: unknown): string[] {
  return String(value ?? "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3);
}

/**
 * Does a timeline speaker name plausibly belong to this attendee?
 * "Mathew Ryan" ↔ mathew@ryanandcotravel.com.au matches on the "mathew" token.
 */
export function speakerMatchesAttendee(speakerName: string, attendee: Attendee): boolean {
  const speaker = nameTokens(speakerName);
  if (speaker.length === 0) return false;
  const local = String(attendee.email ?? "").split("@")[0] ?? "";
  const candidates = new Set([...nameTokens(attendee.displayName), ...nameTokens(local)]);
  // The email local part often concatenates names ("mathewryan") — also match
  // speaker tokens as substrings of it.
  const localFlat = local.toLowerCase().replace(/[^a-z0-9]/g, "");
  return speaker.some(
    (t) => candidates.has(t) || (t.length >= 4 && localFlat.length >= 4 && localFlat.includes(t)),
  );
}

/**
 * Estimate the external-facing window from when external attendees speak.
 * Returns `internal_only: true` (no trimming) when there is no identifiable
 * external attendee, and `source: "none"` when externals exist but never
 * appear in the timeline (nothing safe to trim on).
 */
export function computeBoundaries(
  attendees: Attendee[] | null | undefined,
  timeline: SpeakerTimelineEntry[] | null | undefined,
): Boundaries {
  const internalDomain = ownerDomain(attendees);
  const externals = externalAttendees(attendees, internalDomain);
  if (externals.length === 0) {
    return {
      first_external_join_ts: null,
      last_external_leave_ts: null,
      source: "none",
      internal_only: true,
    };
  }

  const entries = Array.isArray(timeline) ? timeline : [];
  const externalNames = externalSpeakerNames(attendees, entries.map((e) => e.speaker));

  let first = Infinity;
  let last = -Infinity;
  for (const entry of entries) {
    if (!externalNames.has(entry.speaker)) continue;
    if (Number.isFinite(entry.start)) first = Math.min(first, entry.start);
    if (Number.isFinite(entry.end)) last = Math.max(last, entry.end);
  }

  if (!Number.isFinite(first) || !Number.isFinite(last) || last < first) {
    // External guests exist but we never saw them speak — do not trim, or the
    // whole meeting would land in `pre`.
    return {
      first_external_join_ts: null,
      last_external_leave_ts: null,
      source: "none",
      internal_only: false,
    };
  }

  return {
    first_external_join_ts: Math.max(0, Math.round(first - JOIN_PAD_SECONDS)),
    last_external_leave_ts: Math.round(last + LEAVE_PAD_SECONDS),
    source: "speech_estimated",
    internal_only: false,
  };
}

/**
 * The window from when the guest actually JOINED to when they LEFT, read from
 * Recall's participant join/leave events rather than guessed from speech.
 *
 * Internal = a name that matches the owner or a workspace member
 * (`internalNames`), or a calendar attendee on the owner's domain. Everyone
 * else is a guest. The window opens at the first guest join and closes at the
 * last guest leave; a guest who drops and rejoins does not split it, and one
 * still present when the recording stops closes it at the end.
 *
 * Returns null — and the speech estimate runs instead — when there are no
 * events, no guest, or no way to tell who is internal: a failed profile read
 * must not turn the owner into a guest who "joined at 0".
 */
export function boundariesFromPresence(
  events: PresenceEvent[] | null | undefined,
  internalNames: string[],
  attendees: Attendee[] | null | undefined,
  recordingSeconds: number,
): Boundaries | null {
  const list = (Array.isArray(events) ? events : []).filter(
    (e) =>
      e && (e.action === "join" || e.action === "leave") &&
      typeof e.name === "string" && e.name.trim() !== "" && Number.isFinite(e.ts),
  );
  if (list.length === 0) return null;

  const domain = ownerDomain(attendees);
  const internalAttendees: Attendee[] = [
    ...internalNames.filter((n) => typeof n === "string" && n.trim()).map((n) => ({ displayName: n })),
    ...(Array.isArray(attendees) ? attendees : []).filter((a) => domain !== null && domainOf(a.email) === domain),
  ];
  if (internalAttendees.length === 0) return null;
  const isInternal = (name: string) => internalAttendees.some((a) => speakerMatchesAttendee(name, a));

  let firstJoin = Infinity;
  let lastJoin = -Infinity;
  let lastLeave = -Infinity;
  let lastEvent = 0;
  for (const e of list) {
    lastEvent = Math.max(lastEvent, e.ts);
    if (isInternal(e.name)) continue;
    if (e.action === "join") {
      firstJoin = Math.min(firstJoin, e.ts);
      lastJoin = Math.max(lastJoin, e.ts);
    } else {
      lastLeave = Math.max(lastLeave, e.ts);
    }
  }
  if (!Number.isFinite(firstJoin)) return null;

  const stillPresent = lastJoin > lastLeave;
  const recordingEnd = recordingSeconds > 0 ? recordingSeconds : lastEvent;
  const end = stillPresent ? Math.max(recordingEnd, lastJoin) : lastLeave;
  return {
    first_external_join_ts: Math.max(0, Math.round(firstJoin)),
    last_external_leave_ts: Math.round(end),
    source: "presence",
    internal_only: false,
  };
}

export function zoneOf(startSeconds: number, boundaries: Boundaries): Zone {
  if (
    boundaries.internal_only ||
    boundaries.first_external_join_ts === null ||
    boundaries.last_external_leave_ts === null
  ) {
    return "meeting";
  }
  if (startSeconds < boundaries.first_external_join_ts) return "pre";
  if (startSeconds > boundaries.last_external_leave_ts) return "post";
  return "meeting";
}

/** Tag every segment with its zone. Returns new objects; input untouched. */
export function annotateZones<T extends SpeakerSegment>(
  segments: T[],
  boundaries: Boundaries,
): (T & { zone: Zone })[] {
  return (Array.isArray(segments) ? segments : []).map((s) => ({
    ...s,
    zone: zoneOf(Number(s.start ?? 0), boundaries),
  }));
}

/** The external-facing slice — what insights, email and shares are built from. */
export function meetingZone<T extends { zone?: Zone }>(segments: T[]): T[] {
  return (Array.isArray(segments) ? segments : []).filter(
    (s) => (s.zone ?? "meeting") === "meeting",
  );
}

/**
 * Which timeline speaker names belong to guests. Direct name/email matching
 * first; when no guest matched but the INTERNAL attendees did (gm@kananwas.com
 * carries no name tokens to match "Devendra Singh"), every speaker that matched
 * no internal attendee is external by elimination.
 */
export function externalSpeakerNames(
  attendees: Attendee[] | null | undefined,
  speakerNames: string[],
): Set<string> {
  const list = Array.isArray(attendees) ? attendees : [];
  const internalDomain = ownerDomain(list);
  const externals = externalAttendees(list, internalDomain);
  const internals = list.filter((a) => !externals.includes(a));
  const names = new Set(speakerNames.filter(Boolean));

  const direct = new Set([...names].filter((n) => externals.some((a) => speakerMatchesAttendee(n, a))));
  if (direct.size > 0 || externals.length === 0) return direct;

  const internalMatched = new Set([...names].filter((n) => internals.some((a) => speakerMatchesAttendee(n, a))));
  if (internalMatched.size === 0) return direct; // nothing to eliminate against
  const byElimination = [...names].filter((n) => !internalMatched.has(n) && !/^SPEAKER_\d+$/i.test(n));
  // Only trust elimination when it leaves at most as many guests as were invited.
  return byElimination.length > 0 && byElimination.length <= externals.length
    ? new Set(byElimination)
    : direct;
}

/** Minimum share of speech an estimated window must keep to be believed. */
const MIN_MEETING_SPEECH_SHARE = 0.5;
/** Minimum absolute length (s) of an estimated window. */
const MIN_MEETING_SECONDS = 60;

/**
 * Refuse an estimated window that would throw away most of the call. On
 * 2026-08-31 an LLM estimate returned a confident 0–55 s window for a 35-min
 * discovery call; 316 of 317 segments became "post" and the summary was
 * written from one sentence. Estimates are heuristics — when one contradicts
 * the shape of the recording, keeping everything is the safe failure.
 */
export function guardBoundaries(
  boundaries: Boundaries,
  segments: SpeakerSegment[],
): Boundaries {
  // A join/leave event is observed, not estimated: a long real pre-roll must
  // not be "corrected" back to the whole recording.
  if (boundaries.source === "presence") return boundaries;
  if (boundaries.internal_only || boundaries.first_external_join_ts === null || boundaries.last_external_leave_ts === null) {
    return boundaries;
  }
  const speech = (seg: SpeakerSegment) => Math.max(0, (Number(seg.end) || 0) - (Number(seg.start) || 0));
  const total = segments.reduce((a, s) => a + speech(s), 0);
  const inside = segments
    .filter((s) => zoneOf(Number(s.start ?? 0), boundaries) === "meeting")
    .reduce((a, s) => a + speech(s), 0);
  const windowSeconds = boundaries.last_external_leave_ts - boundaries.first_external_join_ts;
  const tooShort = windowSeconds < MIN_MEETING_SECONDS && total > MIN_MEETING_SECONDS;
  const tooLittle = total > 0 && inside / total < MIN_MEETING_SPEECH_SHARE;
  if (tooShort || tooLittle) {
    console.warn(
      `[zones] Rejecting ${boundaries.source} window ${boundaries.first_external_join_ts}s–${boundaries.last_external_leave_ts}s: keeps ${Math.round((total ? inside / total : 0) * 100)}% of speech — not trimming`,
    );
    return { first_external_join_ts: null, last_external_leave_ts: null, source: "none", internal_only: false };
  }
  return boundaries;
}
