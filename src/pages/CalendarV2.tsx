/**
 * Calendar — Console (UI v2), from mockup 05-calendar.
 *
 * The list is read from `calendar_events` joined to `calendars`, not from the
 * sync response V1 uses. Two reasons: the server keeps that table fresh on its
 * own (auto-join-meetings folds a 24 h sync into its 5-minute tick), and the
 * row carries the calendar it came from, which is what makes the "All
 * calendars" filter and the per-row calendar name real rather than decorative.
 * "Sync now" still calls sync-google-calendar, then re-reads.
 *
 * The mockup's per-row bot toggle is NOT here. Auto-join is a single per-user
 * flag (`profiles.auto_join_enabled`) and `calendar_events` has no per-event
 * opt-out column, so a switch per row would be a picture of a control. The row
 * states what is actually true — the bot will join, or there is no link to join
 * — and offers the one action that does exist: record this meeting now.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { isToday, isTomorrow, parseISO } from 'date-fns';
import { CalendarDays, Loader2, RefreshCw, Video, Mic } from 'lucide-react';
import { GoogleMeetIcon } from '@/components/icons/GoogleMeetIcon';
import { useNavigate } from 'react-router-dom';
import { formatIST } from '@/lib/time';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { ListSkeleton } from '@/components/dashboard/ListSkeleton';
import { Badge, Button as EbButton, Card, PageHeader } from '@/ui';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

interface Row {
  id: string;
  eventId: string;
  title: string;
  start: string;
  end: string | null;
  meetingLink: string | null;
  calendarId: string;
  calendarName: string;
}

/** Google Meet / Zoom / Teams from the link itself — no icon pack needed. */
function isGoogleMeet(link: string | null): boolean {
  return !!link && link.includes('meet.google');
}

function platformOf(link: string | null): string {
  if (!link) return 'In person';
  if (isGoogleMeet(link)) return 'Google Meet';
  if (link.includes('zoom.')) return 'Zoom';
  if (link.includes('teams.microsoft') || link.includes('teams.live')) return 'Teams';
  return 'Video call';
}

function durationLabel(start: string, end: string | null): string | null {
  if (!end) return null;
  const mins = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000);
  if (!Number.isFinite(mins) || mins <= 0) return null;
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}

function dayLabel(iso: string): { label: string; sub: string } {
  const d = parseISO(iso);
  if (isToday(d)) return { label: 'Today', sub: formatIST(d, 'EEE, MMM d') };
  if (isTomorrow(d)) return { label: 'Tomorrow', sub: formatIST(d, 'EEE, MMM d') };
  return { label: formatIST(d, 'EEEE'), sub: formatIST(d, 'MMM d') };
}

export default function CalendarV2() {
  const { user, session } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [calendarFilter, setCalendarFilter] = useState('all');
  const [autoJoin, setAutoJoin] = useState(false);
  const [starting, setStarting] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    const nowIso = new Date().toISOString();

    // calendar_events.calendar_id holds the PROVIDER's calendar id (an email),
    // not a foreign key to calendars.id — the deployed schema differs from the
    // migration, and PostgREST has no relationship to embed. So: two reads,
    // joined here on that provider id.
    const [eventsRes, calendarsRes, profileRes] = await Promise.all([
      supabase
        .from('calendar_events')
        .select('id, event_id, title, start_time, end_time, meeting_link, calendar_id')
        .eq('user_id', user.id)
        .gte('start_time', nowIso)
        .order('start_time', { ascending: true })
        .limit(60),
      supabase.from('calendars').select('calendar_id, calendar_name').eq('user_id', user.id),
      supabase.from('profiles').select('auto_join_enabled').eq('user_id', user.id).maybeSingle(),
    ]);

    if (eventsRes.error) {
      // An empty calendar and a failed read look identical to a reader, so say
      // which one this is.
      console.error('[CalendarV2] could not read calendar_events:', eventsRes.error);
      setLoadError(eventsRes.error.message);
      setLoading(false);
      return;
    }

    const names = new Map<string, string>();
    (calendarsRes.data ?? []).forEach((c) => {
      if (c.calendar_id) names.set(c.calendar_id, c.calendar_name || 'Calendar');
    });

    setLoadError(null);
    setAutoJoin(Boolean(profileRes.data?.auto_join_enabled));
    setRows(
      (eventsRes.data ?? []).map((e) => ({
        id: e.id,
        eventId: e.event_id,
        title: e.title || 'No title',
        start: e.start_time,
        end: e.end_time,
        meetingLink: e.meeting_link,
        calendarId: e.calendar_id ?? '',
        calendarName: names.get(e.calendar_id ?? '') || 'Calendar',
      })),
    );
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSync = async () => {
    if (!session?.access_token) return;
    setSyncing(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/sync-google-calendar`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({
          title: 'Calendar',
          description: body?.hint || body?.error || 'Calendar sync failed',
          variant: 'destructive',
        });
        return;
      }
      await load();
      toast({ title: 'Calendar synced', description: `${body?.events ?? 0} upcoming meetings.` });
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to sync',
        variant: 'destructive',
      });
    } finally {
      setSyncing(false);
    }
  };

  const recordNow = async (row: Row) => {
    if (!row.meetingLink || !session?.access_token) return;
    setStarting(row.id);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/start-recall-recording`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meeting_url: row.meetingLink,
          calendar_event_id: row.eventId,
          title: row.title,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || 'Failed to start recording');
      toast({ title: 'Bot is joining', description: 'It will appear in the meeting shortly.' });
      if (body?.meeting_id) navigate(`/meeting/${body.meeting_id}`);
    } catch (err) {
      toast({
        title: 'Could not start the bot',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setStarting(null);
    }
  };

  const calendars = useMemo(() => {
    const map = new Map<string, string>();
    rows.forEach((r) => map.set(r.calendarId, r.calendarName));
    return [...map.entries()];
  }, [rows]);

  const visible = useMemo(
    () => (calendarFilter === 'all' ? rows : rows.filter((r) => r.calendarId === calendarFilter)),
    [rows, calendarFilter],
  );

  /** One entry per day, in order, each with that day's meetings. */
  const days = useMemo(() => {
    const out: { key: string; label: string; sub: string; items: Row[] }[] = [];
    visible.forEach((row) => {
      const key = formatIST(parseISO(row.start), 'yyyy-MM-dd');
      const last = out[out.length - 1];
      if (last?.key === key) last.items.push(row);
      else out.push({ key, ...dayLabel(row.start), items: [row] });
    });
    return out;
  }, [visible]);

  return (
    <DashboardLayout>
      <PageHeader
        title="Calendar"
        subtitle={
          calendars.length > 0
            ? `Upcoming meetings from your ${calendars.length} connected calendar${calendars.length === 1 ? '' : 's'}.`
            : 'Upcoming meetings from your connected calendars.'
        }
        actions={
          <div className="flex items-center gap-2">
            {calendars.length > 1 && (
              <Select value={calendarFilter} onValueChange={setCalendarFilter}>
                <SelectTrigger className="h-9 w-[190px] rounded-pill border-eb-border bg-eb-card font-dmsans text-[12.5px]">
                  <SelectValue placeholder="All calendars" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All calendars</SelectItem>
                  {calendars.map(([id, name]) => (
                    <SelectItem key={id} value={id}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <EbButton
              size="md"
              onClick={handleSync}
              disabled={syncing}
              icon={syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} strokeWidth={1.75} />}
            >
              {syncing ? 'Syncing…' : 'Sync now'}
            </EbButton>
          </div>
        }
      />

      {loading ? (
        <ListSkeleton />
      ) : loadError ? (
        <Card className="text-center">
          <p className="font-dmsans text-sm font-medium text-eb-red">Could not load your calendar</p>
          <p className="mt-1 font-dmsans text-[13px] text-eb-secondary">{loadError}</p>
        </Card>
      ) : days.length === 0 ? (
        <Card className="text-center">
          <CalendarDays size={28} strokeWidth={1.5} className="mx-auto mb-3 text-eb-muted" />
          <p className="font-dmsans text-sm font-medium text-eb-text">No upcoming meetings</p>
          <p className="mt-1 font-dmsans text-[13px] text-eb-secondary">
            Connect a calendar in Settings → Integrations, or use Sync now if you just added one.
          </p>
        </Card>
      ) : (
        <Card padded={false} className="px-[18px] py-2">
          {days.map((day) => (
            <div key={day.key} className="flex flex-col gap-2 py-3 sm:flex-row sm:gap-4">
              <div className="w-[150px] flex-none pt-3">
                <div className="font-outfit text-[15px] font-semibold leading-tight text-eb-text">
                  {day.label}
                </div>
                <div className="font-dmsans text-[12.5px] text-eb-secondary">{day.sub}</div>
              </div>

              <div className="flex min-w-0 flex-1 flex-col gap-2">
                {day.items.map((row) => {
                  const willJoin = autoJoin && !!row.meetingLink;
                  const duration = durationLabel(row.start, row.end);
                  return (
                    <div
                      key={row.id}
                      /* At 390px the fixed columns (time, icon, the badge, and
                         a "Record now" button that is invisible at opacity-0
                         but still occupies ~110px) left the title column no
                         room, so every event WITH a meeting link rendered with
                         no title at all — the one thing the row exists to say.
                         On a phone the row is a grid and the actions drop to
                         their own line; `sm:contents` hands the children back
                         to the flex row from sm up, where it always fitted. */
                      className="group grid grid-cols-[auto_auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 rounded-card border border-eb-border bg-eb-card px-3.5 py-3 shadow-eb-card sm:flex"
                    >
                      <span className="w-[74px] flex-none font-dmsans text-[12.5px] font-medium text-eb-secondary">
                        {formatIST(parseISO(row.start), 'h:mm a')}
                      </span>

                      <span
                        className={cn(
                          'flex h-8 w-8 flex-none items-center justify-center rounded-input border border-eb-border',
                          row.meetingLink ? 'text-eb-accent' : 'text-eb-muted',
                        )}
                      >
                        {isGoogleMeet(row.meetingLink) ? (
                          <GoogleMeetIcon size={16} />
                        ) : (
                          <Video size={15} strokeWidth={1.75} />
                        )}
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-dmsans text-sm font-medium text-eb-text">
                          {row.title}
                        </span>
                        <span className="block truncate font-dmsans text-[12.5px] text-eb-secondary">
                          {[duration, platformOf(row.meetingLink), row.calendarName]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </span>

                      {/* Second line on a phone, part of the flex row from sm up. */}
                      <div className="col-span-3 flex items-center justify-between gap-2 sm:contents">
                        {row.meetingLink && (
                          <EbButton
                            size="sm"
                            onClick={() => recordNow(row)}
                            disabled={starting === row.id}
                            /* Revealed on hover only where a pointer can hover;
                               on touch there is no hover, so the button was
                               permanently invisible and permanently in the way. */
                            className="flex-none sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 sm:focus:opacity-100"
                            icon={
                              starting === row.id ? (
                                <Loader2 size={13} className="animate-spin" />
                              ) : (
                                <Mic size={13} strokeWidth={1.75} />
                              )
                            }
                          >
                            Record now
                          </EbButton>
                        )}

                        <Badge tone={willJoin ? 'green' : 'neutral'} dot={willJoin} className="flex-none">
                          {row.meetingLink ? (willJoin ? 'Bot will join' : 'Auto-join off') : 'No video link'}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </Card>
      )}
    </DashboardLayout>
  );
}
