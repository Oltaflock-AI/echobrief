/**
 * Share this meeting — Console (UI v2), from mockup 00e.
 *
 * Presentation over `useMeetingShares`, which holds the create / rotate /
 * revoke / update / share-with-workspace calls.
 *
 * ONE LINK PER MEETING, from here on. The dialog used to mint a new link on
 * every press, so a meeting could carry six of them and "revoke the one I sent"
 * meant guessing which. Now there is a single link with switches on it: the
 * transcript and the recording are on by default, and changing either edits the
 * link in place rather than making another. Replace is the deliberate "burn
 * this URL" action.
 *
 * Links made under the old behaviour KEEP WORKING — nothing was revoked to make
 * this true. They appear under "Older links", each with its own revoke, because
 * a link somebody is holding should be visible to the person who made it.
 *
 * The current link is shown every time the dialog is opened, not once — the
 * token is sealed in `meeting_shares.token_sealed` (20260909150000). Links from
 * before that are hash-only, so their URL cannot be shown again; they still
 * work, and the dialog says exactly that.
 */
import { useEffect, useState } from 'react';
import { Building2, Check, Copy, Link2, Loader2, RefreshCw, Share2, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useMeetingShares } from '@/hooks/useMeetingShares';
import { formatIST } from '@/lib/time';
import { Button, ChipGroup, Dialog, DialogNote, Toggle } from '@/ui';

const EXPIRY: readonly { value: string; label: string }[] = [
  { value: '1', label: '24 hours' },
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: 'never', label: 'Never' },
];

/** Days → the chip that represents them, for showing a live link's expiry. */
function expiryChipFor(expiresAt: string | null): string {
  if (!expiresAt) return 'never';
  const days = Math.round((Date.parse(expiresAt) - Date.now()) / 86_400_000);
  if (days <= 1) return '1';
  if (days <= 7) return '7';
  return '30';
}

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
  const shares = useMeetingShares(meetingId, open);
  const link = shares.link;
  // Everything else still live: the backlog from when every press minted a new
  // link. Listed so it can be retired deliberately, never revoked behind the
  // user's back.
  const olderLinks = shares.live.slice(1);

  // What a NEW link will carry. Both on: a link with neither is a summary an
  // attachment could have carried, and the two extras are what people open a
  // share for. Narrowing one link is one switch away; discovering after the
  // fact that the link you sent carried nothing is a second round trip.
  const [expiry, setExpiry] = useState('7');
  const [includeTranscript, setIncludeTranscript] = useState(true);
  const [includeRecording, setIncludeRecording] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) setCopied(false);
  }, [open]);

  const copy = async (url: string) => {
    await navigator.clipboard.writeText(url).catch(() => {});
    setCopied(true);
    toast({ title: 'Link copied' });
  };

  const failed = (title: string) => (err: unknown) =>
    toast({
      title,
      description: err instanceof Error ? err.message : 'Something went wrong.',
      variant: 'destructive',
    });

  const settings = () => ({
    expiresInDays: expiry === 'never' ? null : Number(expiry),
    includeTranscript,
    includeRecording,
  });

  const createLink = async () => {
    try {
      const { url } = await shares.create(settings());
      if (url) await copy(url);
      toast({ title: 'Link created and copied' });
    } catch (err) {
      failed('Could not create the link')(err);
    }
  };

  const rotateLink = async () => {
    try {
      const { url } = await shares.rotate({
        expiresInDays: link?.expires_at ? Number(expiryChipFor(link.expires_at)) : null,
        includeTranscript: link?.include_transcript ?? includeTranscript,
        includeRecording: link?.include_recording ?? includeRecording,
      });
      if (url) await copy(url);
      toast({ title: 'New link created', description: 'The previous link no longer works.' });
    } catch (err) {
      failed('Could not replace the link')(err);
    }
  };

  const revoke = async (shareId?: string) => {
    const id = shareId ?? link?.id;
    if (!id) return;
    try {
      await shares.revoke(id);
      toast({ title: 'Link revoked', description: 'Anyone holding it now sees an expired page.' });
    } catch (err) {
      failed('Could not revoke it')(err);
    }
  };

  /** Edit the live link in place — never a reason to mint a second one. */
  const patchLink = async (patch: {
    include_transcript?: boolean;
    include_recording?: boolean;
    expires_in_days?: number | null;
  }) => {
    if (!link) return;
    try {
      await shares.setCarries(link.id, patch);
    } catch (err) {
      failed('Could not change the link')(err);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      icon={<Share2 size={18} strokeWidth={1.75} />}
      title="Share this meeting"
      description="One link per meeting. Anyone holding it sees the summary, decisions and action items — plus whatever you switch on below."
      width={560}
      footer={
        <>
          <DialogNote>The link can be revoked any time</DialogNote>
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </>
      }
    >
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
                failed('That did not work')(err);
              }
            }}
          />
        </div>
      )}

      {shares.loading ? (
        <p className="flex items-center gap-2 font-dmsans text-[13px] text-eb-secondary">
          <Loader2 size={14} className="animate-spin" /> Loading…
        </p>
      ) : link ? (
        <>
          {link.url ? (
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={link.url}
                onFocus={(e) => e.currentTarget.select()}
                aria-label="Share link"
                className="h-9 min-w-0 flex-1 rounded-input border border-eb-border bg-white px-3 font-mono text-[12px] text-eb-text outline-none"
              />
              <Button
                onClick={() => copy(link.url!)}
                aria-label="Copy the link"
                icon={copied ? <Check size={15} strokeWidth={2} /> : <Copy size={15} strokeWidth={1.75} />}
              />
            </div>
          ) : (
            // Minted before tokens were sealed. Nothing can recover it, so the
            // only honest offer is a replacement.
            <div className="rounded-card border border-eb-border bg-eb-card-alt px-3.5 py-3">
              <p className="m-0 font-dmsans text-[12.5px] text-eb-secondary">
                This link was created before links could be shown again, so only{' '}
                <span className="font-mono text-[12px] text-eb-text">{link.token_prefix}…</span> is
                left of it. Replace it to get a link you can copy.
              </p>
            </div>
          )}

          <p className="mt-2 font-dmsans text-[12px] text-eb-secondary">
            {link.view_count} view{link.view_count === 1 ? '' : 's'} ·{' '}
            {link.expires_at
              ? `expires ${formatIST(new Date(link.expires_at), 'd MMM')}`
              : 'no expiry'}
          </p>

          <div className="mt-4 border-t border-eb-divider">
            <SwitchRow
              title="Include the transcript"
              hint="Meeting only — anything said before it started or after it ended stays out."
              on={link.include_transcript}
              disabled={shares.working}
              onChange={(v) => patchLink({ include_transcript: v })}
            />
            <SwitchRow
              title="Include the recording"
              hint="The full, unedited call, including anything said while the bot was waiting."
              on={link.include_recording}
              disabled={shares.working}
              onChange={(v) => patchLink({ include_recording: v })}
            />
          </div>

          <div className="mt-4 font-dmsans text-[13px] font-medium text-eb-text">Expires after</div>
          <ChipGroup
            className="mt-2"
            ariaLabel="Link expires after"
            options={EXPIRY}
            value={expiryChipFor(link.expires_at)}
            onChange={(value) =>
              patchLink({ expires_in_days: value === 'never' ? null : Number(value) })
            }
          />

          <div className="mt-5 flex flex-wrap gap-2">
            <Button
              onClick={rotateLink}
              disabled={shares.working}
              icon={<RefreshCw size={14} strokeWidth={1.75} />}
            >
              Replace link
            </Button>
            <Button
              onClick={() => revoke()}
              disabled={shares.working}
              icon={<Trash2 size={14} strokeWidth={1.75} />}
            >
              Revoke
            </Button>
          </div>
          <p className="mt-2 font-dmsans text-[12px] text-eb-secondary">
            Replacing makes a new URL and stops this one working. Switching something off
            narrows this link the next time it is opened.
          </p>

          {olderLinks.length > 0 && (
            <div className="mt-5">
              <div className="font-dmsans text-[11px] font-semibold uppercase tracking-[.09em] text-eb-secondary">
                Older links · still working
              </div>
              <div className="mt-2 flex flex-col divide-y divide-eb-divider overflow-hidden rounded-card border border-eb-border">
                {olderLinks.map((old) => (
                  <div key={old.id} className="flex items-center gap-3 px-3.5 py-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-tile border border-eb-border bg-white text-eb-secondary">
                      <Link2 size={14} strokeWidth={1.75} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-mono text-[12px] text-eb-text">
                        {old.token_prefix}…
                      </span>
                      <span className="block font-dmsans text-[12px] text-eb-secondary">
                        {old.view_count} view{old.view_count === 1 ? '' : 's'} ·{' '}
                        {old.expires_at
                          ? `expires ${formatIST(new Date(old.expires_at), 'd MMM')}`
                          : 'no expiry'}
                      </span>
                    </span>
                    {old.url && (
                      <Button
                        onClick={() => copy(old.url!)}
                        aria-label="Copy this older link"
                        icon={<Copy size={14} strokeWidth={1.75} />}
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => revoke(old.id)}
                      disabled={shares.working}
                      aria-label="Revoke this link"
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-pill text-eb-red transition-colors hover:bg-eb-red-bg disabled:opacity-50"
                    >
                      <Trash2 size={14} strokeWidth={1.75} />
                    </button>
                  </div>
                ))}
              </div>
              <p className="mt-2 font-dmsans text-[12px] text-eb-secondary">
                Made before a meeting was limited to one link. They keep working until you
                revoke them.
              </p>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="font-dmsans text-[13px] font-medium text-eb-text">Link expires after</div>
          <ChipGroup
            className="mt-2"
            ariaLabel="Link expires after"
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
        </>
      )}
    </Dialog>
  );
}

function SwitchRow({
  title,
  hint,
  on,
  onChange,
  disabled,
}: {
  title: string;
  hint: string;
  on: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-eb-divider py-3 last:border-b-0">
      <span className="min-w-0">
        <span className="block font-dmsans text-[13.5px] font-medium text-eb-text">{title}</span>
        <span className="block font-dmsans text-[12.5px] leading-[1.5] text-eb-secondary">{hint}</span>
      </span>
      <Toggle on={on} onChange={disabled ? () => {} : onChange} label={title} />
    </div>
  );
}
