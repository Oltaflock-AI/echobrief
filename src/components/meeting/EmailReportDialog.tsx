/**
 * Email this report — Console (UI v2), from mockup 00f.
 *
 * `send-email-report` takes one `recipient_email`, so this sends to one
 * person. The mockup's recipient chips, its Include checklist and its Note
 * field are all absent for the same reason: the function has no parameter for
 * any of them. (`include_transcript` is declared in its body type and then
 * never read — a control bound to it would do nothing at all.)
 *
 * What the attendee chips do instead is fill the single field. That is honest
 * — one click, one recipient — and it is the part of the mockup that was
 * actually saving the reader work.
 */
import { useEffect, useState } from 'react';
import { Loader2, Mail, Send } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Avatar, Button, Dialog, DialogNote } from '@/ui';
import { cn } from '@/lib/utils';

export type EmailAttendee = { email: string; displayName?: string | null };

const VALID = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function EmailReportDialog({
  open,
  onOpenChange,
  meetingTitle,
  meetingDate,
  userEmail,
  attendees = [],
  onSend,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meetingTitle: string;
  meetingDate?: string;
  userEmail?: string;
  attendees?: EmailAttendee[];
  onSend: (email: string) => Promise<void>;
}) {
  const { toast } = useToast();
  const [email, setEmail] = useState(userEmail || '');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (open) setEmail(userEmail || '');
  }, [open, userEmail]);

  // Anyone on the invite who is not already in the field.
  const suggestions = attendees
    .filter((a) => a.email && a.email.toLowerCase() !== email.trim().toLowerCase())
    .slice(0, 4);

  const handleSend = async () => {
    const to = email.trim();
    if (!to) {
      toast({ title: 'Who should it go to?', description: 'Enter an email address.', variant: 'destructive' });
      return;
    }
    if (!VALID.test(to)) {
      toast({ title: 'That is not an email address', description: to, variant: 'destructive' });
      return;
    }
    setSending(true);
    try {
      await onSend(to);
      onOpenChange(false);
    } catch (error) {
      toast({
        title: 'Could not send it',
        description: error instanceof Error ? error.message : 'Something went wrong.',
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      icon={<Mail size={18} strokeWidth={1.75} />}
      title="Email this report"
      description={[meetingTitle, meetingDate].filter(Boolean).join(' · ')}
      width={520}
      footer={
        <>
          <DialogNote>Sent from EchoBrief on your behalf</DialogNote>
          <div className="flex items-center gap-2">
            <Button onClick={() => onOpenChange(false)} disabled={sending}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleSend}
              disabled={sending}
              icon={sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} strokeWidth={1.75} />}
            >
              Send report
            </Button>
          </div>
        </>
      }
    >
      <label className="flex flex-col gap-1.5">
        <span className="font-dmsans text-[13px] font-medium text-eb-text">Send to</span>
        <span
          className={cn(
            'flex h-11 items-center gap-2.5 rounded-input-lg border bg-white px-3.5 shadow-eb-input',
            VALID.test(email.trim()) ? 'border-eb-accent' : 'border-eb-border',
          )}
        >
          <Mail size={15} strokeWidth={1.75} className="shrink-0 text-eb-muted" />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSend();
            }}
            disabled={sending}
            placeholder="name@company.com"
            className="min-w-0 flex-1 border-0 bg-transparent p-0 font-dmsans text-[14px] text-eb-text outline-none placeholder:text-eb-secondary"
          />
        </span>
      </label>

      {suggestions.length > 0 && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {suggestions.map((a) => (
            <button
              key={a.email}
              type="button"
              onClick={() => setEmail(a.email)}
              title={a.email}
              className="inline-flex h-8 max-w-[220px] items-center gap-2 rounded-pill border border-dashed border-eb-border bg-white pl-1 pr-3 font-dmsans text-[12.5px] text-eb-secondary transition-colors hover:bg-eb-row-hover"
            >
              <Avatar name={a.displayName || a.email} size={22} round />
              <span className="truncate">{a.displayName || a.email}</span>
            </button>
          ))}
          <span className="font-dmsans text-[12px] text-eb-secondary">attendees · sends to one</span>
        </div>
      )}

      {/* Stated, not offered: the report's contents are fixed by the function. */}
      <div className="mt-4 rounded-card border border-eb-border bg-eb-card-alt px-3.5 py-3">
        <div className="font-dmsans text-[13px] font-medium text-eb-text">What they will get</div>
        <p className="m-0 mt-1 font-dmsans text-[12.5px] leading-[1.55] text-eb-secondary">
          The summary, key points, decisions and action items — meeting-zone only. Never the
          transcript, the recording or the coaching report.
        </p>
      </div>
    </Dialog>
  );
}
