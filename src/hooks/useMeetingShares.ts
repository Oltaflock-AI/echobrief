/**
 * Everything the share dialog does — the one implementation.
 *
 * The calls into `manage-meeting-share`: list, create (which returns the
 * meeting's existing link rather than minting a second one), rotate, revoke,
 * update what the link carries and when it expires, and share/unshare with the
 * workspace. Sharing is the feature where a UI that disagrees with itself is
 * most expensive, so the calls live here and the dialog only renders.
 *
 * Since 20260909150000 a meeting has AT MOST ONE live link and its URL comes
 * back on every list, because the token is sealed rather than only hashed.
 * `url` is null for links minted before that — those are unrecoverable and the
 * dialog offers to rotate them.
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface Share {
  id: string;
  token_prefix: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  view_count: number;
  last_viewed_at: string | null;
  created_at: string;
  include_transcript: boolean;
  include_recording: boolean;
  /** null for a pre-20260909150000 link, whose plaintext is unrecoverable. */
  url: string | null;
}

export interface ShareSettings {
  expiresInDays: number | null;
  includeTranscript: boolean;
  includeRecording: boolean;
}

export function useMeetingShares(meetingId: string, open: boolean) {
  const [shares, setShares] = useState<Share[]>([]);
  const [inWorkspace, setInWorkspace] = useState(false);
  const [sharedToOrg, setSharedToOrg] = useState(false);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);

  const call = useCallback(
    async (body: Record<string, unknown>) => {
      const { data, error } = await supabase.functions.invoke('manage-meeting-share', {
        body: { meeting_id: meetingId, ...body },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return data;
    },
    [meetingId],
  );

  const refresh = useCallback(async () => {
    try {
      const data = await call({ action: 'list' });
      setShares(data?.shares ?? []);
      setInWorkspace(Boolean(data?.in_workspace));
      setSharedToOrg(Boolean(data?.shared_to_org));
    } catch {
      // A listing failure should not blank the dialog the user just opened.
      setShares([]);
    } finally {
      setLoading(false);
    }
  }, [call]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    refresh();
  }, [open, refresh]);

  /** Wraps a mutation in the busy flag and refreshes the list after it. */
  const run = useCallback(
    async <T>(fn: () => Promise<T>): Promise<T> => {
      setWorking(true);
      try {
        const result = await fn();
        await refresh();
        return result;
      } finally {
        setWorking(false);
      }
    },
    [refresh],
  );

  /**
   * Get this meeting's link, minting it if there is none. When one already
   * exists the settings are applied to it and the same URL comes back —
   * `reused` says which happened.
   */
  const create = (opts: ShareSettings) =>
    run(async () => {
      const data = await call({
        action: 'create',
        expires_in_days: opts.expiresInDays,
        include_transcript: opts.includeTranscript,
        include_recording: opts.includeRecording,
      });
      return { url: data.url as string | null, reused: Boolean(data.reused) };
    });

  /** Kill the current link and mint a replacement. The old URL stops working. */
  const rotate = (opts: ShareSettings) =>
    run(async () => {
      const data = await call({
        action: 'rotate',
        expires_in_days: opts.expiresInDays,
        include_transcript: opts.includeTranscript,
        include_recording: opts.includeRecording,
      });
      return { url: data.url as string | null, reused: false };
    });

  const revoke = (shareId: string) => run(() => call({ action: 'revoke', share_id: shareId }));

  /**
   * Change what the link carries, or when it expires. The URL keeps working
   * either way — that is the point of editing it instead of replacing it.
   */
  const setCarries = (
    shareId: string,
    patch: Partial<Pick<Share, 'include_transcript' | 'include_recording'>> & {
      expires_in_days?: number | null;
    },
  ) => run(() => call({ action: 'update', share_id: shareId, ...patch }));

  const toggleOrgShare = (currentlyShared: boolean) =>
    run(() => call({ action: currentlyShared ? 'unshare_from_org' : 'share_to_org' }));

  /** Live = not revoked and not past its expiry. At most one, by construction. */
  const live = shares.filter(
    (s) => !s.revoked_at && (!s.expires_at || Date.parse(s.expires_at) > Date.now()),
  );
  const link = live[0] ?? null;

  return {
    shares,
    live,
    link,
    inWorkspace,
    sharedToOrg,
    loading,
    working,
    create,
    rotate,
    revoke,
    setCarries,
    toggleOrgShare,
    refresh,
  };
}
