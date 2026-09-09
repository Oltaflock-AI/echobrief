/**
 * Share this meeting — Console (UI v2), from mockup 00e.
 *
 * Presentation over `useMeetingShares`, which V1's dialog also uses: the same
 * create / revoke / update / share-with-workspace calls, so the two cannot
 * come to different conclusions about who can see what.
 *
 * The mockup puts a copy button on every active link. There is nothing to copy
 * — `meeting_shares` stores a sha256 digest of the token and the plaintext
 * exists only in the create response — so copy is offered once, on the link
 * just made, and the row list says so instead of pretending.
 */
import { useEffect, useState } from 'react';
import { Building2, Check, Copy, Link2, Loader2, Share2, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useMeetingShares, type Share } from '@/hooks/useMeetingShares';
import { formatIST } from '@/lib/time';
import { Button, Chip, ChipGroup, Dialog, DialogNote, Toggle } from '@/ui';

const EXPIRY: readonly { value: string; label: string }[] = [
  { value: '1', label: '24 hours' },
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: 'never', label: 'Never' },
];

export function ShareLinkDialogV2({
  meetingId,
  open,
  onOpenChange,
}: {
  meetingId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const shares = useMeetingShares(meetingId, open);

  const [expiry, setExpiry] = useState('7');
  // What the NEXT link will carry. Off in both cases: the summary is what a
  // forwarded link is usually for, and the two extras are somebody's words.
  const [includeTranscript, setIncludeTranscript] = useState(false);
  const [includeRecording, setIncludeRecording] = useState(false);
  const [freshUrl, setFreshUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open) return;
    setFreshUrl(null);
    setCopied(false);
  }, [open]);

  const createLink = async () => {
    try {
      const url = await shares.create({
        expiresInDays: expiry === 'never' ? null : Number(expiry),
        includeTranscript,
        includeRecording,
      });
      setFreshUrl(url);
      await navigator.clipboard.writeText(url).catch(() => {});
      setCopied(true);
      toast({ title: 'Link created and copied' });
    } catch (err) {
      toast({
        title: 'Could not create the link',
        description: err instanceof Error ? err.message : 'Something went wrong.',
        variant: 'destructive',
      });
    }
  };

  const revoke = async (shareId: string) => {
    try {
      await shares.revoke(shareId);
      toast({ title: 'Link revoked', description: 'Anyone holding it now sees an expired page.' });
    } catch (err) {
      toast({
        title: 'Could not revoke it',
        description: err instanceof Error ? err.message : 'Something went wrong.',
        variant: 'destructive',
      });
    }
  };

  const setCarries = async (
    share: Share,
    patch: Partial<Pick<Share, 'include_transcript' | 'include_recording'>>,
  ) => {
    try {
      await shares.setCarries(share.id, patch);
    } catch (err) {
      toast({
        title: 'Could not change that link',
        description: err instanceof Error ? err.message : 'Something went wrong.',
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      icon={<Share2 size={18} strokeWidth={1.75} />}
      title="Share this meeting"
      description="Anyone with the link sees the summary, decisions and action items. Add the transcript or recording per link."
      width={560}
      footer={
        <>
          <DialogNote>Links can be revoked any time</DialogNote>
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </>
      }
    >
      {freshUrl && (
        <div className="mb-4 rounded-card border border-eb-accent bg-eb-accent-soft px-3.5 py-3">
          <p className="m-0 font-dmsans text-[12.5px] font-medium text-eb-accent-text">
            Copy it now — the link cannot be shown again.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <input
              readOnly
              value={freshUrl}
              className="h-9 min-w-0 flex-1 rounded-input border border-eb-border bg-white px-3 font-mono text-[12px] text-eb-text outline-none"
            />
            <Button
              onClick={async () => {
                await navigator.clipboard.writeText(freshUrl);
                setCopied(true);
              }}
              aria-label="Copy the link"
              icon={copied ? <Check size={15} strokeWidth={2} /> : <Copy size={15} strokeWidth={1.75} />}
            />
          </div>
        </div>
      )}

      {shares.inWorkspace && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-card border border-eb-border bg-eb-card-alt px-3.5 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-tile bg-eb-sidebar text-white">
              <Building2 size={15} strokeWidth={1.75} />
            </span>
            <span className="min-w-0">
              <span className="block font-dmsans text-[13.5px] font-medium text-eb-text">
                {shares.sharedToOrg ? 'Shared with your workspace' : 'Share with your workspace'}
              </span>
              <span className="block font-dmsans text-[12.5px] text-eb-secondary">
                Colleagues see the summary, not the transcript.
              </span>
            </span>
          </div>
          <Toggle
            on={shares.sharedToOrg}
            label="Share with your workspace"
            onChange={async () => {
              try {
                await shares.toggleOrgShare(shares.sharedToOrg);
                toast({
                  title: shares.sharedToOrg ? 'Removed from workspace' : 'Shared with workspace',
                });
              } catch (err) {
                toast({
                  title: 'That did not work',
                  description: err instanceof Error ? err.message : 'Something went wrong.',
                  variant: 'destructive',
                });
              }
            }}
          />
        </div>
      )}

      <div className="font-dmsans text-[13px] font-medium text-eb-text">New link expires after</div>
      <ChipGroup
        className="mt-2"
        ariaLabel="New link expires after"
        options={EXPIRY}
        value={expiry}
        onChange={setExpiry}
      />

      <div className="mt-4 border-t border-eb-divider">
        <SwitchRow
          title="Include the transcript"
          hint="Meeting only — anything said before it started or after it ended stays out."
          on={includeTranscript}
          onChange={setIncludeTranscript}
        />
        <SwitchRow
          title="Include the recording"
          hint="The full, unedited call, including anything said while the bot was waiting."
          on={includeRecording}
          onChange={setIncludeRecording}
        />
      </div>

      <Button
        variant="dark"
        block
        className="mt-4 h-11"
        onClick={createLink}
        disabled={shares.working}
        icon={
          shares.working ? <Loader2 size={15} className="animate-spin" /> : <Link2 size={15} strokeWidth={1.75} />
        }
      >
        Create share link
      </Button>

      <div className="mt-5">
        <div className="font-dmsans text-[11px] font-semibold uppercase tracking-[.09em] text-eb-secondary">
          Active links
        </div>
        {shares.loading ? (
          <p className="mt-2 flex items-center gap-2 font-dmsans text-[13px] text-eb-secondary">
            <Loader2 size={14} className="animate-spin" /> Loading…
          </p>
        ) : shares.live.length === 0 ? (
          <p className="mt-2 font-dmsans text-[13px] text-eb-secondary">
            No active links for this meeting.
          </p>
        ) : (
          <div className="mt-2 flex flex-col divide-y divide-eb-divider overflow-hidden rounded-card border border-eb-border">
            {shares.live.map((share) => (
              <div key={share.id} className="flex items-center gap-3 px-3.5 py-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-tile border border-eb-border bg-white text-eb-secondary">
                  <Link2 size={14} strokeWidth={1.75} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-[12px] text-eb-text">
                    {share.token_prefix}…
                  </span>
                  <span className="block font-dmsans text-[12px] text-eb-secondary">
                    {share.view_count} view{share.view_count === 1 ? '' : 's'} ·{' '}
                    {share.expires_at
                      ? `expires ${formatIST(new Date(share.expires_at), 'd MMM')}`
                      : 'no expiry'}
                  </span>
                </span>
                {/* Chips, not badges: what a live link carries is changeable, and
                    `update` is a real action on this share row. */}
                <Chip
                  size="sm"
                  selected={share.include_transcript}
                  onClick={() => setCarries(share, { include_transcript: !share.include_transcript })}
                >
                  Transcript
                </Chip>
                <Chip
                  size="sm"
                  selected={share.include_recording}
                  onClick={() => setCarries(share, { include_recording: !share.include_recording })}
                >
                  Recording
                </Chip>
                <button
                  type="button"
                  onClick={() => revoke(share.id)}
                  disabled={shares.working}
                  aria-label="Revoke this link"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-pill text-eb-red transition-colors hover:bg-eb-red-bg disabled:opacity-50"
                >
                  <Trash2 size={14} strokeWidth={1.75} />
                </button>
              </div>
            ))}
          </div>
        )}
        <p className="mt-2 font-dmsans text-[12px] text-eb-secondary">
          A link is only shown once, when it is created — after that the token is stored hashed.
        </p>
      </div>
    </Dialog>
  );
}

function SwitchRow({
  title,
  hint,
  on,
  onChange,
}: {
  title: string;
  hint: string;
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-eb-divider py-3 last:border-b-0">
      <span className="min-w-0">
        <span className="block font-dmsans text-[13.5px] font-medium text-eb-text">{title}</span>
        <span className="block font-dmsans text-[12.5px] leading-[1.5] text-eb-secondary">{hint}</span>
      </span>
      <Toggle on={on} onChange={onChange} label={title} />
    </div>
  );
}
