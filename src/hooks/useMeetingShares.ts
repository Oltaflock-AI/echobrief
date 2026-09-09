/**
 * Everything the share dialog does — the one implementation.
 *
 * V1's dialog and the Console one draw different forms over the same five
 * calls into `manage-meeting-share`: list, create, revoke, update what an
 * existing link carries, and share/unshare with the workspace. Sharing is the
 * feature where a UI that disagrees with itself is most expensive, so the
 * calls live here and the dialogs only render.
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

  /** Returns the URL — the plaintext token exists only in this response. */
  const create = (opts: {
    expiresInDays: number | null;
    includeTranscript: boolean;
    includeRecording: boolean;
  }) =>
    run(async () => {
      const data = await call({
        action: 'create',
        expires_in_days: opts.expiresInDays,
        include_transcript: opts.includeTranscript,
        include_recording: opts.includeRecording,
      });
      return data.url as string;
    });

  const revoke = (shareId: string) => run(() => call({ action: 'revoke', share_id: shareId }));

  /** Change what an existing link carries. The URL keeps working either way. */
  const setCarries = (
    shareId: string,
    patch: Partial<Pick<Share, 'include_transcript' | 'include_recording'>>,
  ) => run(() => call({ action: 'update', share_id: shareId, ...patch }));

  const toggleOrgShare = (currentlyShared: boolean) =>
    run(() => call({ action: currentlyShared ? 'unshare_from_org' : 'share_to_org' }));

  /** Live = not revoked and not past its expiry. */
  const live = shares.filter(
    (s) => !s.revoked_at && (!s.expires_at || Date.parse(s.expires_at) > Date.now()),
  );

  return {
    shares,
    live,
    inWorkspace,
    sharedToOrg,
    loading,
    working,
    create,
    revoke,
    setCarries,
    toggleOrgShare,
    refresh,
  };
}
