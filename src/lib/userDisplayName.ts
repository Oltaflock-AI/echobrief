import type { User } from '@supabase/supabase-js';

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/**
 * Display name from Supabase Auth `user_metadata` (and optional given/family).
 * Dashboard "Display name" may be stored as `name`, `full_name`, or `display_name`.
 */
export function displayNameFromUserMetadata(user: User | null): string {
  if (!user?.user_metadata) return '';
  const m = user.user_metadata as Record<string, unknown>;
  const full = str(m.full_name);
  const name = str(m.name);
  const display = str(m.display_name);
  const given = str(m.given_name);
  const family = str(m.family_name);
  const combined = [given, family].filter(Boolean).join(' ').trim();
  return full || name || display || combined || '';
}
