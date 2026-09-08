import { useCallback, useEffect, useState } from 'react';
import { Building2, Check, Copy, Link2, Loader2, Trash2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { formatIST } from '@/lib/time';

// meeting_shares post-dates the generated types.
const db = supabase;

interface Share {
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

const EXPIRY_CHOICES: Array<{ label: string; days: number | null }> = [
  { label: '24 hours', days: 1 },
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
  { label: 'Never', days: null },
];

export function ShareLinkDialog({
  meetingId,
  open,
  onOpenChange,
}: {
  meetingId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const [shares, setShares] = useState<Share[]>([]);
  const [inWorkspace, setInWorkspace] = useState(false);
  const [sharedToOrg, setSharedToOrg] = useState(false);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [expiryDays, setExpiryDays] = useState<number | null>(7);
  // What the next link will carry. Off by default in both cases: the summary is
  // what a forwarded link is usually for, and the two extras are each somebody's
  // words verbatim.
  const [includeTranscript, setIncludeTranscript] = useState(false);
  const [includeRecording, setIncludeRecording] = useState(false);
  // The plaintext token exists only in this response. Held in state so the user
  // can copy it, and gone the moment the dialog closes.
  const [freshUrl, setFreshUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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
    if (!open) {
      setFreshUrl(null);
      setCopied(false);
      return;
    }
    setLoading(true);
    refresh();
  }, [open, refresh]);

  const createLink = async () => {
    setWorking(true);
    try {
      const data = await call({
        action: 'create',
        expires_in_days: expiryDays,
        include_transcript: includeTranscript,
        include_recording: includeRecording,
      });
      setFreshUrl(data.url);
      await navigator.clipboard.writeText(data.url).catch(() => {});
      setCopied(true);
      await refresh();
      toast({ title: 'Link created and copied' });
    } catch (err) {
      toast({
        title: 'Could not create the link',
        description: err instanceof Error ? err.message : 'Something went wrong.',
        variant: 'destructive',
      });
    } finally {
      setWorking(false);
    }
  };

  const revoke = async (shareId: string) => {
    setWorking(true);
    try {
      await call({ action: 'revoke', share_id: shareId });
      await refresh();
      toast({ title: 'Link revoked', description: 'Anyone holding it now sees an expired page.' });
    } catch (err) {
      toast({
        title: 'Could not revoke it',
        description: err instanceof Error ? err.message : 'Something went wrong.',
        variant: 'destructive',
      });
    } finally {
      setWorking(false);
    }
  };

  /** Change what an existing link carries. The URL keeps working either way. */
  const setCarries = async (share: Share, patch: Partial<Pick<Share, 'include_transcript' | 'include_recording'>>) => {
    setWorking(true);
    try {
      await call({ action: 'update', share_id: share.id, ...patch });
      await refresh();
    } catch (err) {
      toast({
        title: 'Could not change that link',
        description: err instanceof Error ? err.message : 'Something went wrong.',
        variant: 'destructive',
      });
    } finally {
      setWorking(false);
    }
  };

  const live = shares.filter(
    (s) => !s.revoked_at && (!s.expires_at || Date.parse(s.expires_at) > Date.now()),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Share this meeting</DialogTitle>
          <DialogDescription>
            Anyone with the link sees the summary, decisions and action items. Add the transcript
            and the recording per link if this meeting should travel in full.
          </DialogDescription>
        </DialogHeader>

        {freshUrl && (
          <div
            className="rounded-lg p-3"
            style={{ border: '1px solid var(--rule)', background: 'var(--paper-raised)' }}
          >
            <p className="mb-2 text-[12px] font-medium" style={{ color: 'var(--ink-mid)' }}>
              Copy it now — the link cannot be shown again.
            </p>
            <div className="flex items-center gap-2">
              <Input readOnly value={freshUrl} className="font-mono text-[12px]" />
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  await navigator.clipboard.writeText(freshUrl);
                  setCopied(true);
                }}
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
              </Button>
            </div>
          </div>
        )}

        {inWorkspace && (
          <div
            className="flex items-center justify-between gap-3 rounded-lg px-4 py-3"
            style={{ border: '1px solid var(--rule)', background: 'var(--paper-raised)' }}
          >
            <div className="flex min-w-0 items-center gap-2">
              <Building2 size={15} style={{ color: 'var(--ink-mid)' }} />
              <div className="min-w-0">
                <p className="m-0 text-[13px] font-medium" style={{ color: 'var(--ink)' }}>
                  Share with your workspace
                </p>
                <p className="m-0 text-[12px]" style={{ color: 'var(--ink-soft)' }}>
                  Colleagues see the summary, not the transcript.
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant={sharedToOrg ? 'outline' : 'default'}
              disabled={working}
              onClick={async () => {
                setWorking(true);
                try {
                  await call({ action: sharedToOrg ? 'unshare_from_org' : 'share_to_org' });
                  await refresh();
                  toast({ title: sharedToOrg ? 'Removed from workspace' : 'Shared with workspace' });
                } catch (err) {
                  toast({
                    title: 'That did not work',
                    description: err instanceof Error ? err.message : 'Something went wrong.',
                    variant: 'destructive',
                  });
                } finally {
                  setWorking(false);
                }
              }}
            >
              {sharedToOrg ? 'Shared' : 'Share'}
            </Button>
          </div>
        )}

        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13px]" style={{ color: 'var(--ink-mid)' }}>Expires after</span>
            {EXPIRY_CHOICES.map((choice) => (
              <button
                key={choice.label}
                type="button"
                onClick={() => setExpiryDays(choice.days)}
                className="rounded-full px-3 py-1 text-[12.5px] font-medium transition-colors"
                style={
                  expiryDays === choice.days
                    ? { background: 'var(--ember)', color: '#fff', border: '1px solid var(--ember)' }
                    : { background: 'transparent', color: 'var(--ink-mid)', border: '1px solid var(--rule)' }
                }
              >
                {choice.label}
              </button>
            ))}
          </div>
          <div className="space-y-2 rounded-lg px-3 py-2.5" style={{ border: '1px solid var(--rule)' }}>
            <label className="flex cursor-pointer items-center justify-between gap-3">
              <span className="min-w-0">
                <span className="block text-[13px] font-medium" style={{ color: 'var(--ink)' }}>
                  Include the transcript
                </span>
                <span className="block text-[12px]" style={{ color: 'var(--ink-soft)' }}>
                  Meeting only — anything said before it started or after it ended stays out.
                </span>
              </span>
              <Switch checked={includeTranscript} onCheckedChange={setIncludeTranscript} />
            </label>
            <label className="flex cursor-pointer items-center justify-between gap-3">
              <span className="min-w-0">
                <span className="block text-[13px] font-medium" style={{ color: 'var(--ink)' }}>
                  Include the recording
                </span>
                <span className="block text-[12px]" style={{ color: 'var(--ink-soft)' }}>
                  The full, unedited call — including anything said while the bot was waiting.
                </span>
              </span>
              <Switch checked={includeRecording} onCheckedChange={setIncludeRecording} />
            </label>
          </div>
          <Button onClick={createLink} disabled={working} className="w-full">
            {working ? <Loader2 size={14} className="mr-2 animate-spin" /> : <Link2 size={14} className="mr-2" />}
            Create share link
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-[13px]" style={{ color: 'var(--ink-mid)' }}>
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : live.length > 0 ? (
          <div className="space-y-2">
            <p className="text-[12px] font-semibold uppercase" style={{ color: 'var(--ink-soft)', letterSpacing: '0.08em' }}>
              Active links
            </p>
            {live.map((share) => (
              <div
                key={share.id}
                className="flex items-center justify-between gap-3 rounded-lg px-3 py-2"
                style={{ border: '1px solid var(--rule)' }}
              >
                <div className="min-w-0">
                  <p className="m-0 truncate font-mono text-[12px]" style={{ color: 'var(--ink)' }}>
                    {share.token_prefix}…
                  </p>
                  <p className="m-0 text-[11.5px]" style={{ color: 'var(--ink-soft)' }}>
                    {share.view_count} view{share.view_count === 1 ? '' : 's'}
                    {' · '}
                    {share.expires_at
                      ? `expires ${formatIST(new Date(share.expires_at), 'd MMM')}`
                      : 'no expiry'}
                  </p>
                  <p className="m-0 mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px]" style={{ color: 'var(--ink-soft)' }}>
                    <span className="inline-flex items-center gap-1.5">
                      <Switch
                        checked={share.include_transcript}
                        disabled={working}
                        onCheckedChange={(v) => setCarries(share, { include_transcript: v })}
                        aria-label="Include the transcript on this link"
                      />
                      Transcript
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Switch
                        checked={share.include_recording}
                        disabled={working}
                        onCheckedChange={(v) => setCarries(share, { include_recording: v })}
                        aria-label="Include the recording on this link"
                      />
                      Recording
                    </span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => revoke(share.id)}
                  disabled={working}
                  aria-label="Revoke this link"
                  className="cursor-pointer border-none bg-transparent p-1 text-destructive hover:opacity-90 disabled:opacity-50"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[13px]" style={{ color: 'var(--ink-soft)' }}>
            No active links for this meeting.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
