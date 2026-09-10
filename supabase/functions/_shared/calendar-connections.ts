/**
 * Calendar grants and event fetching, without caring which provider it is.
 *
 * `auto-join-meetings` used to call the Google Calendar API directly on every
 * tick with Google-shaped token columns, so there was nowhere for a second
 * provider to plug in — Microsoft Teams calls were joinable by pasting a link
 * but invisible to auto-join, because auto-join could only see Google.
 *
 * Everything provider-specific is in this file: the token refresh, the events
 * endpoint, and the shape each returns. Callers see `CalendarConnection` and
 * `NormalizedEvent` and nothing else.
 *
 * Token-writing rule (see migration 20260902120000): Google's write path is
 * still `user_oauth_tokens`, mirrored into `calendar_connections` by trigger,
 * because a dozen existing functions upsert against that table's UNIQUE
 * (user_id) constraint. Microsoft writes `calendar_connections` directly.
 */
import { parseMeetingUrl } from "./validation.ts";
import {
  CONNECTION_TOKEN_COLUMNS,
  openRows,
  sealConnectionTokens,
  sealGoogleTokens,
} from "./oauth-tokens.ts";

export type CalendarProvider = "google" | "microsoft";

export interface CalendarConnection {
  userId: string;
  provider: CalendarProvider;
  accessToken: string | null;
  refreshToken: string | null;
  tokenExpiry: string | null;
  scopes: string | null;
}

export interface NormalizedEvent {
  provider: CalendarProvider;
  providerEventId: string;
  calendarId: string;
  title: string;
  description: string | null;
  startTime: string;
  endTime: string;
  location: string | null;
  /** Only ever a link we are actually willing to send a bot to. */
  meetingLink: string | null;
  organizerName: string | null;
  organizerEmail: string | null;
  attendees: unknown[];
  /**
   * Whether the owner actually intends to attend. Load-bearing: before this
   * filter existed the bot fired on ANY event carrying a video link — dead
   * recurring series, declined invites, invitations never answered — which was
   * where most "no audio captured" results and waiting-room timeouts came from
   * (prod analysis 2026-08-20). Computed per provider, where the raw fields are.
   */
  responseStatus: "accepted" | "declined" | "tentative" | "none";
  isOwner: boolean;
  /** Provider's own cancellation flag. */
  cancelled: boolean;
  /** The provider's own version stamp, so unchanged rows are not rewritten. */
  version: string | null;
  raw: Record<string, unknown>;
}

/**
 * The join decision, identical for both providers: the user accepted, or they
 * own the event and have not declined it. Organisers commonly show up as
 * 'accepted', but a self-created event sometimes carries no attendee entry at
 * all, which is why ownership is a separate signal.
 */
export function shouldJoin(event: NormalizedEvent): boolean {
  if (event.cancelled) return false;
  return (
    event.responseStatus === "accepted" ||
    (event.isOwner && event.responseStatus !== "declined")
  );
}

export type TokenResult =
  | { ok: true; accessToken: string }
  | { ok: false; reason: string; needsReconnect: boolean };

/** Every calendar grant this user holds. */
export async function listConnections(
  supabase: any,
  userId: string,
): Promise<CalendarConnection[]> {
  const { data, error } = await supabase
    .from("calendar_connections")
    .select("user_id, provider, access_token, refresh_token, token_expiry, scopes")
    .eq("user_id", userId);
  if (error) throw error;
  // Sealed at rest. Decrypt once here so the rest of this module — and every
  // caller — works with usable tokens and never with ciphertext.
  const rows = await openRows<Record<string, string | null>>(
    (data ?? []) as Record<string, string | null>[],
    CONNECTION_TOKEN_COLUMNS,
  );
  return rows.map((row) => ({
    userId: row.user_id as string,
    provider: row.provider as CalendarProvider,
    accessToken: row.access_token,
    refreshToken: row.refresh_token,
    tokenExpiry: row.token_expiry,
    scopes: row.scopes,
  }));
}

/** A token is treated as expired a minute early, so it cannot die mid-request. */
function isExpired(expiry: string | null): boolean {
  if (!expiry) return true;
  const at = Date.parse(expiry);
  if (!Number.isFinite(at)) return true;
  return at - 60_000 <= Date.now();
}

const REFRESH_ENDPOINTS: Record<CalendarProvider, string> = {
  google: "https://oauth2.googleapis.com/token",
  microsoft: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
};

function clientCredentials(provider: CalendarProvider): { id?: string; secret?: string } {
  return provider === "google"
    ? { id: Deno.env.get("GOOGLE_CLIENT_ID"), secret: Deno.env.get("GOOGLE_CLIENT_SECRET") }
    // Named AZURE_* because that is what the Azure portal calls them.
    : { id: Deno.env.get("AZURE_CLIENT_ID"), secret: Deno.env.get("AZURE_CLIENT_SECRET") };
}

/**
 * A usable access token, refreshing if necessary.
 *
 * `needsReconnect` separates "only the user can fix this" (the grant was
 * revoked) from "our problem" (a missing client secret, a 500 from the
 * provider). Marking a healthy grant as broken because of our own
 * misconfiguration is how a working integration gets switched off for everyone.
 */
export async function getFreshAccessToken(
  supabase: any,
  conn: CalendarConnection,
): Promise<TokenResult> {
  if (conn.accessToken && !isExpired(conn.tokenExpiry)) {
    return { ok: true, accessToken: conn.accessToken };
  }
  if (!conn.refreshToken) {
    return { ok: false, reason: "no refresh token stored", needsReconnect: true };
  }

  const { id, secret } = clientCredentials(conn.provider);
  if (!id || !secret) {
    return {
      ok: false,
      reason: `${conn.provider} client credentials are not configured`,
      needsReconnect: false,
    };
  }

  const body: Record<string, string> = {
    client_id: id,
    client_secret: secret,
    refresh_token: conn.refreshToken,
    grant_type: "refresh_token",
  };
  // Microsoft wants the scopes named again on refresh; Google does not.
  if (conn.provider === "microsoft") {
    body.scope = conn.scopes || "offline_access Calendars.Read User.Read";
  }

  let response: Response;
  try {
    response = await fetch(REFRESH_ENDPOINTS[conn.provider], {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(body),
    });
  } catch (err) {
    return { ok: false, reason: `refresh request failed: ${err}`, needsReconnect: false };
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) {
    // invalid_grant is the provider saying the user revoked us or changed
    // their password. Anything else is transient or ours.
    const revoked = payload?.error === "invalid_grant";
    return {
      ok: false,
      reason: `${response.status} ${payload?.error ?? "refresh failed"}`,
      needsReconnect: revoked,
    };
  }

  const expiry = new Date(Date.now() + (Number(payload.expires_in) || 3600) * 1000).toISOString();

  if (conn.provider === "google") {
    // Write to the legacy table; the trigger mirrors it here. Writing
    // calendar_connections directly would leave the two disagreeing about
    // which access token is current.
    await supabase
      .from("user_oauth_tokens")
      .update(await sealGoogleTokens({
        google_access_token: payload.access_token,
        google_token_expiry: expiry,
      }))
      .eq("user_id", conn.userId);
  } else {
    await supabase
      .from("calendar_connections")
      .update(await sealConnectionTokens({
        access_token: payload.access_token,
        token_expiry: expiry,
        // Microsoft rotates refresh tokens; keep the old one if none came back.
        // `conn.refreshToken` is already decrypted, so this re-seals it rather
        // than writing plaintext back over a sealed column.
        refresh_token: payload.refresh_token || conn.refreshToken,
        needs_reconnect: false,
        updated_at: new Date().toISOString(),
      }))
      .eq("user_id", conn.userId)
      .eq("provider", "microsoft");
  }

  return { ok: true, accessToken: payload.access_token };
}

/** Record that a grant needs the user's attention, on whichever table owns it. */
export async function markNeedsReconnect(
  supabase: any,
  conn: CalendarConnection,
): Promise<void> {
  await supabase
    .from("calendar_connections")
    .update({ needs_reconnect: true, updated_at: new Date().toISOString() })
    .eq("user_id", conn.userId)
    .eq("provider", conn.provider);
  if (conn.provider === "google") {
    // The existing UI banner reads these two columns.
    await supabase
      .from("profiles")
      .update({ google_calendar_connected: false, google_needs_reconnect: true })
      .eq("user_id", conn.userId);
  }
}

/**
 * Pull a meeting link out of an event.
 *
 * The result is passed through `parseMeetingUrl`, the same validator
 * `start-recall-recording` uses, so a link we would refuse to join never
 * reaches the bot dispatcher. The old regex matched on a bare `zoom.us`
 * substring, which also matches `evilzoom.us`.
 */
export function extractMeetingLink(candidates: Array<string | null | undefined>): string | null {
  const pattern =
    /https?:\/\/[^\s"'<>]*(?:meet\.google\.com|zoom\.us|teams\.microsoft\.com|teams\.live\.com)[^\s"'<>]*/gi;
  for (const text of candidates) {
    if (typeof text !== "string" || !text) continue;
    // A structured field is usually the bare URL; try it whole first.
    if (parseMeetingUrl(text.trim()).ok) return text.trim();
    for (const match of text.match(pattern) ?? []) {
      const cleaned = match.replace(/[.,;)\]]+$/, "");
      if (parseMeetingUrl(cleaned).ok) return cleaned;
    }
  }
  return null;
}

function googleResponse(event: Record<string, any>): NormalizedEvent["responseStatus"] {
  const self = (Array.isArray(event.attendees) ? event.attendees : []).find((a: any) => a?.self);
  switch (self?.responseStatus) {
    case "accepted": return "accepted";
    case "declined": return "declined";
    case "tentative": return "tentative";
    default: return "none";
  }
}

function microsoftResponse(event: Record<string, any>): NormalizedEvent["responseStatus"] {
  switch (event?.responseStatus?.response) {
    // Graph reports the organiser's own row as 'organizer', which is an
    // acceptance in every sense that matters here.
    case "organizer":
    case "accepted": return "accepted";
    case "declined": return "declined";
    case "tentativelyAccepted": return "tentative";
    default: return "none";
  }
}

// An all-day event arrives as a bare date ("2026-09-11"). calendar_events.start_time
// is timestamptz, and a bare date is read as UTC midnight — 5:30 am to an IST
// reader. Pin it to IST midnight, which is what the calendar means by that day.
// (Timed events already carry their own offset; leave those alone.)
function dayToIst(raw: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00+05:30` : raw;
}

function googleEventToNormalized(
  event: Record<string, any>,
  calendarId: string,
): NormalizedEvent | null {
  const startRaw = event.start?.dateTime || event.start?.date;
  const endRaw = event.end?.dateTime || event.end?.date;
  if (!startRaw || typeof event.id !== "string") return null;

  const conferenceUri = Array.isArray(event.conferenceData?.entryPoints)
    ? event.conferenceData.entryPoints.find((e: any) => e?.entryPointType === "video")?.uri
    : null;

  return {
    provider: "google",
    providerEventId: event.id,
    calendarId,
    title: typeof event.summary === "string" ? event.summary : "No title",
    description: typeof event.description === "string" ? event.description : null,
    startTime: dayToIst(startRaw),
    endTime: dayToIst(endRaw || startRaw),
    location: typeof event.location === "string" ? event.location : null,
    meetingLink: extractMeetingLink([
      conferenceUri,
      event.hangoutLink,
      event.location,
      event.description,
    ]),
    organizerName: event.organizer?.displayName ?? null,
    organizerEmail: event.organizer?.email ?? null,
    attendees: Array.isArray(event.attendees) ? event.attendees : [],
    responseStatus: googleResponse(event),
    isOwner: event.organizer?.self === true || event.creator?.self === true,
    cancelled: event.status === "cancelled",
    version: typeof event.updated === "string" ? event.updated : null,
    raw: event,
  };
}

function microsoftEventToNormalized(
  event: Record<string, any>,
  calendarId: string,
): NormalizedEvent | null {
  const startRaw = event.start?.dateTime;
  if (!startRaw || typeof event.id !== "string") return null;
  // Graph returns naive local times plus a separate zone name; UTC is what we
  // ask for, and a naive string would otherwise be read as the server's zone.
  const asIso = (value: string | undefined, zone: string | undefined) =>
    value ? (zone === "UTC" && !value.endsWith("Z") ? `${value}Z` : value) : null;

  const start = asIso(startRaw, event.start?.timeZone);
  const end = asIso(event.end?.dateTime, event.end?.timeZone) || start;
  if (!start) return null;

  return {
    provider: "microsoft",
    providerEventId: event.id,
    calendarId,
    title: typeof event.subject === "string" ? event.subject : "No title",
    description: typeof event.bodyPreview === "string" ? event.bodyPreview : null,
    startTime: start,
    endTime: end as string,
    location: event.location?.displayName ?? null,
    meetingLink: extractMeetingLink([
      event.onlineMeeting?.joinUrl,
      event.onlineMeetingUrl,
      event.location?.displayName,
      event.body?.content,
      event.bodyPreview,
    ]),
    organizerName: event.organizer?.emailAddress?.name ?? null,
    organizerEmail: event.organizer?.emailAddress?.address ?? null,
    attendees: Array.isArray(event.attendees)
      ? event.attendees.map((a: any) => ({
          // Normalised to the Google shape the rest of the pipeline reads.
          email: a?.emailAddress?.address ?? null,
          displayName: a?.emailAddress?.name ?? null,
          responseStatus: a?.status?.response ?? null,
        }))
      : [],
    responseStatus: microsoftResponse(event),
    isOwner: event.isOrganizer === true,
    cancelled: event.isCancelled === true,
    version: typeof event.lastModifiedDateTime === "string" ? event.lastModifiedDateTime : null,
    raw: event,
  };
}

/** Upcoming events from one grant, normalised. Never throws. */
export async function fetchUpcomingEvents(
  provider: CalendarProvider,
  accessToken: string,
  from: Date,
  to: Date,
): Promise<{ ok: true; events: NormalizedEvent[] } | { ok: false; reason: string }> {
  const url = provider === "google"
    ? `https://www.googleapis.com/calendar/v3/calendars/primary/events` +
      `?maxResults=50&orderBy=startTime&singleEvents=true` +
      `&timeMin=${encodeURIComponent(from.toISOString())}` +
      `&timeMax=${encodeURIComponent(to.toISOString())}`
    : `https://graph.microsoft.com/v1.0/me/calendarView` +
      `?startDateTime=${encodeURIComponent(from.toISOString())}` +
      `&endDateTime=${encodeURIComponent(to.toISOString())}` +
      `&$orderby=start/dateTime&$top=50`;

  const headers: Record<string, string> = { Authorization: `Bearer ${accessToken}` };
  // Ask Graph for UTC so the naive dateTime strings are unambiguous.
  if (provider === "microsoft") headers.Prefer = 'outlook.timezone="UTC"';

  let response: Response;
  try {
    response = await fetch(url, { headers });
  } catch (err) {
    return { ok: false, reason: `events request failed: ${err}` };
  }
  if (!response.ok) {
    return { ok: false, reason: `${response.status} ${(await response.text()).slice(0, 200)}` };
  }

  const payload = await response.json().catch(() => ({}));
  const items: Record<string, any>[] = provider === "google" ? payload.items ?? [] : payload.value ?? [];
  const calendarId = provider === "google" ? "primary" : "calendarView";

  const events = items
    .map((item) =>
      provider === "google"
        ? googleEventToNormalized(item, calendarId)
        : microsoftEventToNormalized(item, calendarId),
    )
    .filter((e): e is NormalizedEvent => e !== null);

  return { ok: true, events };
}

/**
 * Write events into `calendar_events`, skipping anything unchanged.
 *
 * Postgres writes a new tuple version per row whether or not a value changed,
 * so upserting a whole calendar on every tick rewrites every row: 151,000 write
 * tuples against a 507-row table when this last went wrong, on an instance
 * whose Disk IO Budget is the binding free-tier constraint. The provider's own
 * version stamp is what makes the skip possible.
 *
 * Never throws — a bookkeeping failure must not stop a bot being dispatched for
 * a meeting that is about to start.
 */
export async function upsertCalendarEvents(
  supabase: any,
  userId: string,
  events: NormalizedEvent[],
): Promise<{ written: number; skipped: number }> {
  if (events.length === 0) return { written: 0, skipped: 0 };
  try {
    const ids = events.map((e) => e.providerEventId);
    const { data: stored } = await supabase
      .from("calendar_events")
      .select("event_id, version")
      .eq("user_id", userId)
      .in("event_id", ids);

    const storedVersion = new Map<string, string | null>();
    for (const row of stored ?? []) storedVersion.set(row.event_id, row.version);

    const changed = events.filter((e) => {
      if (!storedVersion.has(e.providerEventId)) return true; // never seen
      const previous = storedVersion.get(e.providerEventId);
      // No stamp on either side means we cannot prove it is unchanged, and the
      // safe direction is to write.
      if (!previous || !e.version) return true;
      return previous !== e.version;
    });

    if (changed.length === 0) return { written: 0, skipped: events.length };

    const { error } = await supabase.from("calendar_events").upsert(
      changed.map((e) => ({
        user_id: userId,
        provider: e.provider,
        calendar_id: e.calendarId,
        event_id: e.providerEventId,
        title: e.title,
        description: e.description,
        start_time: e.startTime,
        end_time: e.endTime,
        location: e.location,
        meeting_link: e.meetingLink,
        organizer_name: e.organizerName,
        organizer_email: e.organizerEmail,
        attendees: e.attendees,
        is_recurring: false,
        version: e.version,
        raw_data: e.raw,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: "user_id,event_id" },
    );
    if (error) {
      console.error("[calendar-connections] event upsert failed:", error.message);
      return { written: 0, skipped: events.length };
    }
    return { written: changed.length, skipped: events.length - changed.length };
  } catch (err) {
    console.error("[calendar-connections] event upsert threw:", err);
    return { written: 0, skipped: events.length };
  }
}
