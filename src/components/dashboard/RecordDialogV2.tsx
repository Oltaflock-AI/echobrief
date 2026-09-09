/**
 * Record a meeting — Console (UI v2), from mockups 00c (desktop) and 01b
 * (mobile sheet).
 *
 * The form is new; starting a bot is not. Both this and V1's dialog call
 * `useStartRecording`, so the validation, the quota refusal and the error text
 * a customer reads are identical in either UI.
 *
 * Two mockup controls are deliberately absent. `start-recall-recording` takes
 * `meeting_url`, `calendar_event_id` and `title` — there is nowhere to put a
 * per-meeting spoken language (Sarvam runs in translate mode and detects the
 * language itself) and no way to schedule a join for later. Drawing either
 * would be a control that reads as a setting and changes nothing.
 */
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Check, Loader2, Mic, Video } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useStartRecording } from '@/hooks/useStartRecording';
import { parseMeetingUrl, PLATFORM_LABELS } from '@/lib/meetingUrl';
import { fetchUsageMeter } from '@/lib/usageMeter';
import { formatIST } from '@/lib/time';
import { Avatar, Button, ChipGroup, Dialog, DialogNote } from '@/ui';
import { cn } from '@/lib/utils';

type Source = 'link' | 'calendar';

type UpcomingEvent = {
  id: string;
  title: string | null;
  start_time: string | null;
  meeting_link: string | null;
};

export function RecordDialogV2({
  open,
  onOpenChange,
  prefillTitle,
  prefillLink,
  prefillCalendarEventId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  prefillTitle?: string;
  prefillLink?: string;
  prefillCalendarEventId?: string;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { start, isStarting } = useStartRecording();

  const [source, setSource] = useState<Source>('link');
  const [meetingUrl, setMeetingUrl] = useState(prefillLink ?? '');
  const [title, setTitle] = useState(prefillTitle ?? '');
  const [calendarEventId, setCalendarEventId] = useState<string | undefined>(prefillCalendarEventId);
  const [error, setError] = useState<string | null>(null);
  const [notetaker, setNotetaker] = useState<string | null>(null);
  const [hours, setHours] = useState<string | null>(null);
  const [events, setEvents] = useState<UpcomingEvent[] | null>(null);

  // Reset to the caller's prefill each time it opens, so a dialog closed
  // mid-edit does not reopen holding the abandoned link.
  useEffect(() => {
    if (!open) return;
    setSource('link');
    setMeetingUrl(prefillLink ?? '');
    setTitle(prefillTitle ?? '');
    setCalendarEventId(prefillCalendarEventId);
    setError(null);
  }, [open, prefillLink, prefillTitle, prefillCalendarEventId]);

  useEffect(() => {
    if (!open || !user) return;
    let cancelled = false;
    supabase
      .from('profiles')
      .select('notetaker_name, full_name')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        const owner = data?.full_name?.split(' ')[0];
        setNotetaker(data?.notetaker_name || (owner ? `${owner}'s Notetaker` : 'EchoBrief Notetaker'));
      });
    fetchUsageMeter(user.id).then((m) => {
      if (!cancelled) setHours(m?.label ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [open, user]);

  // Only the meetings a bot could actually be sent to: upcoming, and carrying
  // a link. An event with no link is not a missing feature, it is a meeting
  // with nowhere to join.
  useEffect(() => {
    if (!open || source !== 'calendar' || !user || events) return;
    let cancelled = false;
    supabase
      .from('calendar_events')
      .select('id, title, start_time, meeting_link')
      .eq('user_id', user.id)
      .gte('start_time', new Date(Date.now() - 15 * 60 * 1000).toISOString())
      .order('start_time', { ascending: true })
      .limit(12)
      .then(({ data, error: readError }) => {
        if (cancelled) return;
        if (readError) {
          // A failed read and an empty calendar must not look the same.
          setError(readError.message);
          setEvents([]);
          return;
        }
        setEvents((data ?? []).filter((e) => e.meeting_link));
      });
    return () => {
      cancelled = true;
    };
  }, [open, source, user, events]);

  const check = parseMeetingUrl(meetingUrl);
  const detected = check.platform;

  const handleStart = async () => {
    if (!user) return;
    setError(null);
    const message = await start({ meetingUrl, title, calendarEventId });
    if (message) {
      setError(message);
      toast({ title: 'Could not start', description: message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Bot started', description: 'Bot is joining the meeting' });
    queryClient.invalidateQueries({ queryKey: ['meetings', user.id] });
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      icon={<Mic size={18} strokeWidth={1.75} />}
      title="Record a meeting"
      description="The notetaker joins the call and sends you the summary."
      width={520}
      mobileSheet
      footer={
        // Below md the sheet leads with a 48px full-width CTA and puts the
        // hours under it; the sheet's own close is the way back, so Cancel
        // would be a second dismiss competing with it.
        <div className="flex w-full flex-col items-stretch gap-3 md:flex-row md:items-center md:justify-between">
          <DialogNote className="order-2 text-center md:order-1 md:text-left">
            {hours ? `${hours} used this month` : ''}
          </DialogNote>
          <div className="order-1 flex items-center gap-2 md:order-2">
            <Button className="max-md:hidden" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleStart}
              disabled={isStarting || !meetingUrl}
              className="max-md:h-12 max-md:w-full"
              icon={isStarting ? <Loader2 size={15} className="animate-spin" /> : <Mic size={15} strokeWidth={2} />}
            >
              Start recording
            </Button>
          </div>
        </div>
      }
    >
      <ChipGroup
        ariaLabel="Where the link comes from"
        options={[
          { value: 'link' as Source, label: 'Paste a link' },
          { value: 'calendar' as Source, label: 'From calendar' },
        ]}
        value={source}
        onChange={(v) => {
          setSource(v);
          setError(null);
        }}
      />

      {source === 'link' ? (
        <div className="mt-4 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="font-dmsans text-[13px] font-medium text-eb-text">Meeting link</span>
            <span
              className={cn(
                'relative flex h-11 items-center gap-2.5 rounded-input-lg border bg-white pl-3.5 pr-1.5 shadow-eb-input',
                detected ? 'border-eb-accent' : 'border-eb-border',
              )}
            >
              <Mic size={15} strokeWidth={1.75} className="shrink-0 text-eb-muted" />
              <input
                value={meetingUrl}
                onChange={(e) => {
                  setMeetingUrl(e.target.value);
                  setCalendarEventId(undefined);
                }}
                placeholder="https://meet.google.com/abc-defg-hij"
                className="min-w-0 flex-1 border-0 bg-transparent p-0 font-dmsans text-[14px] text-eb-text outline-none placeholder:text-eb-muted"
              />
              {detected && (
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-eb-accent-soft text-eb-accent">
                  <Video size={15} strokeWidth={1.75} />
                </span>
              )}
            </span>
            <span className="flex items-center gap-1.5 font-dmsans text-[12.5px] text-eb-secondary">
              {detected ? (
                <>
                  <Check size={13} strokeWidth={2.5} className="text-eb-green" />
                  <span className="text-eb-green">{PLATFORM_LABELS[detected]} link detected</span>
                </>
              ) : (
                'Works with Google Meet, Zoom and Microsoft Teams.'
              )}
            </span>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="font-dmsans text-[13px] font-medium text-eb-text">
              Title <span className="font-normal text-eb-muted">optional</span>
            </span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Weekly standup, client call…"
              className="h-11 w-full rounded-input-lg border border-eb-border bg-white px-3.5 font-dmsans text-[14px] text-eb-text shadow-eb-input outline-none placeholder:text-eb-muted focus:border-eb-accent"
            />
          </label>
        </div>
      ) : (
        <div className="mt-4">
          {events === null ? (
            <p className="m-0 font-dmsans text-[13px] text-eb-secondary">Reading your calendar…</p>
          ) : events.length === 0 ? (
            <p className="m-0 font-dmsans text-[13px] text-eb-secondary">
              No upcoming meeting with a joinable link. Paste one instead.
            </p>
          ) : (
            <div className="flex flex-col divide-y divide-eb-divider overflow-hidden rounded-card border border-eb-border">
              {events.map((e) => {
                const picked = calendarEventId === e.id;
                return (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => {
                      setCalendarEventId(e.id);
                      setMeetingUrl(e.meeting_link ?? '');
                      setTitle(e.title ?? '');
                    }}
                    className={cn(
                      'flex items-center gap-3 px-3.5 py-3 text-left transition-colors',
                      picked ? 'bg-eb-accent-soft' : 'bg-white hover:bg-eb-row-hover',
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-dmsans text-[13.5px] font-medium text-eb-text">
                        {e.title || 'Untitled meeting'}
                      </span>
                      <span className="block font-dmsans text-[12.5px] text-eb-secondary">
                        {e.start_time ? formatIST(new Date(e.start_time), 'EEE, MMM d · h:mm a') : 'No time'}
                      </span>
                    </span>
                    {picked && <Check size={15} strokeWidth={2.5} className="shrink-0 text-eb-accent" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="mt-4 flex items-start gap-3 rounded-card border border-eb-border bg-eb-card-alt px-3.5 py-3">
        <Avatar name={notetaker ?? 'Notetaker'} size={30} round />
        <span className="min-w-0 flex-1">
          <span className="block font-dmsans text-[13px] font-medium text-eb-text">
            {notetaker ?? 'Your notetaker'} will join
          </span>
          <span className="block font-dmsans text-[12.5px] leading-[1.5] text-eb-secondary">
            Others will see it in the participant list. Change in Settings › Bot.
          </span>
        </span>
      </div>

      {error && (
        <p className="mt-3 rounded-input border border-eb-red-border bg-eb-red-bg px-3 py-2 font-dmsans text-[12.5px] text-eb-red">
          {error}
        </p>
      )}
    </Dialog>
  );
}
