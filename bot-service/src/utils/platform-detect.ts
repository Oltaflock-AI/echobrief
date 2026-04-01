import { Platform } from '../types';

/**
 * Detect meeting platform from URL.
 * Returns null if the URL doesn't match any known platform.
 */
export function detectPlatform(url: string): Platform | null {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();

    if (hostname === 'meet.google.com') {
      return 'google_meet';
    }

    if (hostname === 'zoom.us' || hostname.endsWith('.zoom.us')) {
      return 'zoom';
    }

    if (
      hostname === 'teams.microsoft.com' ||
      hostname.endsWith('.teams.microsoft.com') ||
      hostname === 'teams.live.com'
    ) {
      return 'teams';
    }

    return null;
  } catch {
    return null;
  }
}

export function isValidMeetingUrl(url: string): boolean {
  return detectPlatform(url) !== null;
}
