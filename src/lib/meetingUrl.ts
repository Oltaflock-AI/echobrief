/**
 * Which platform a meeting URL belongs to, decided in the browser.
 *
 * A deliberate mirror of `parseMeetingUrl` in
 * `supabase/functions/_shared/validation.ts`, which is the authority — the
 * server re-validates every URL and is what actually refuses one. This copy
 * exists so the Record dialog can name the platform as you type and reject a
 * bad link without a round trip. Keep the two in step.
 */

export type MeetingPlatform = 'google_meet' | 'zoom' | 'teams';

export const PLATFORM_LABELS: Record<MeetingPlatform, string> = {
  google_meet: 'Google Meet',
  zoom: 'Zoom',
  teams: 'Microsoft Teams',
};

/**
 * One flat shape rather than a discriminated union: this project compiles with
 * `strict: false`, so `strictNullChecks` is off and TypeScript will not narrow
 * `{ok: true} | {ok: false}` on the `ok` field. A union here type-checks at the
 * definition and fails at every call site.
 */
export interface MeetingUrlResult {
  ok: boolean;
  platform: MeetingPlatform | null;
  error: string | null;
}

export function parseMeetingUrl(raw: string): MeetingUrlResult {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) {
    return { ok: false, platform: null, error: 'Paste the meeting link to record.' };
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return {
      ok: false,
      platform: null,
      error: "That is not a link. It should start with 'https://'.",
    };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { ok: false, platform: null, error: "The link should start with 'https://'." };
  }

  const host = url.hostname.toLowerCase();
  // Subdomains count: Zoom tenants live on hosts like us02web.zoom.us.
  const matches = (domain: string) => host === domain || host.endsWith(`.${domain}`);

  if (matches('meet.google.com')) return { ok: true, platform: 'google_meet', error: null };
  if (matches('zoom.us')) return { ok: true, platform: 'zoom', error: null };
  if (matches('teams.microsoft.com') || matches('teams.live.com')) {
    return { ok: true, platform: 'teams', error: null };
  }
  return {
    ok: false,
    platform: null,
    error: 'That link is not one we can join. Use a Google Meet, Zoom or Microsoft Teams link.',
  };
}

/**
 * What a calendar row should say about a meeting, from its link alone.
 *
 * The point of `joinable` is that it is decided by `parseMeetingUrl` — the same
 * check the server runs before it will create a bot — and not by a substring
 * test. A calendar can carry any link at all (Webex, a booking page, a
 * lookalike host), and a row that offered "Record now" for one of those was
 * promising something the API would refuse.
 */
export interface MeetingLinkDescription {
  /** Null when there is no link, or the link is one we cannot join. */
  platform: MeetingPlatform | null;
  /** What to print: 'Google Meet', 'Zoom', 'Teams', 'In person', 'Video link'. */
  label: string;
  /** True only when a bot can actually be sent to this link. */
  joinable: boolean;
  /** True when the event carries a link at all, joinable or not. */
  hasLink: boolean;
}

export function describeMeetingLink(link: string | null | undefined): MeetingLinkDescription {
  if (!link) return { platform: null, label: 'In person', joinable: false, hasLink: false };
  const parsed = parseMeetingUrl(link);
  if (parsed.ok && parsed.platform) {
    return {
      platform: parsed.platform,
      label: parsed.platform === 'teams' ? 'Teams' : PLATFORM_LABELS[parsed.platform],
      joinable: true,
      hasLink: true,
    };
  }
  return { platform: null, label: 'Video link', joinable: false, hasLink: true };
}
