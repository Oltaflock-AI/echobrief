import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Calendar as CalendarIcon, RefreshCw, ChevronDown, ChevronRight, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCalendar } from '@/contexts/CalendarContext';
import { format, isToday, isTomorrow, parseISO } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { MeetingDetailModal } from '@/components/dashboard/MeetingDetailModal';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

function mapServerEventsToCalendar(raw: unknown[]): CalendarEvent[] {
  return raw
    .filter((e): e is Record<string, unknown> => !!e && typeof e === 'object')
    .map((e) => ({
      id: String(e.id ?? ''),
      title: String(e.title ?? 'No title'),
      start_time: String(e.start_time ?? e.start ?? ''),
      end_time: String(e.end_time ?? e.end ?? ''),
      is_all_day: Boolean(e.is_all_day),
      meetingUrl: typeof e.meetingUrl === 'string' ? e.meetingUrl : undefined,
      hasMeetingLink: Boolean(e.hasMeetingLink),
      attendees: Array.isArray(e.attendees)
        ? (e.attendees as CalendarEvent['attendees'])
        : undefined,
    }))
    .filter((e) => e.id && e.start_time);
}

async function syncCalendarViaEdgeFunction(accessToken: string): Promise<{
  events: CalendarEvent[];
  error?: string;
  hint?: string;
}> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/sync-google-calendar`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });
  const data = (await res.json()) as {
    error?: string;
    hint?: string;
    upcomingEvents?: unknown[];
  };
  if (!res.ok) {
    return {
      events: [],
      error: data.error || 'Calendar sync failed',
      hint: data.hint,
    };
  }
  const raw = Array.isArray(data.upcomingEvents) ? data.upcomingEvents : [];
  return { events: mapServerEventsToCalendar(raw) };
}

interface CalendarEvent {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
  is_all_day: boolean;
  meetingUrl?: string;
  hasMeetingLink?: boolean;
  attendees?: Array<{ email: string; displayName?: string; responseStatus?: string; organizer?: boolean }>;
}

export default function Calendar() {
  const { user, session } = useAuth();
  const { events, setEvents, synced, setSynced, lastSyncTime, setLastSyncTime } = useCalendar();
  const { toast } = useToast();

  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<{ count: number; visible: boolean }>({ count: 0, visible: false });
  const [upcomingExpanded, setUpcomingExpanded] = useState(false);
  const [autoFetched, setAutoFetched] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);

  const openModal = (event: CalendarEvent) => setSelectedEvent(event);
  const closeModal = () => setSelectedEvent(null);

  // Auto-fetch via Edge Function (OAuth tokens are not readable from the browser when RLS blocks user_oauth_tokens)
  useEffect(() => {
    if (autoFetched || events.length > 0 || !user || !session?.access_token) return;

    const autoFetch = async () => {
      try {
        const { events: ev, error } = await syncCalendarViaEdgeFunction(session.access_token);
        if (error) return;
        setEvents(ev);
        if (ev.length > 0) {
          setSynced(true);
          setLastSyncTime(new Date());
        }
      } catch (err) {
        console.error('Auto-fetch error:', err);
      } finally {
        setAutoFetched(true);
      }
    };

    void autoFetch();
  }, [user, session?.access_token, autoFetched, events.length, setEvents, setSynced, setLastSyncTime]);

  // Group events by date
  const groupedEvents = {
    today: events.filter(e => isToday(parseISO(e.start_time))).sort((a, b) => a.start_time.localeCompare(b.start_time)),
    tomorrow: events.filter(e => isTomorrow(parseISO(e.start_time))).sort((a, b) => a.start_time.localeCompare(b.start_time)),
    upcoming: events.filter(e => {
      const eventDate = parseISO(e.start_time);
      return !isToday(eventDate) && !isTomorrow(eventDate);
    }).sort((a, b) => a.start_time.localeCompare(b.start_time)),
  };

  const upcomingByDate = groupedEvents.upcoming.reduce((acc, event) => {
    const dateKey = format(parseISO(event.start_time), 'yyyy-MM-dd');
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(event);
    return acc;
  }, {} as Record<string, CalendarEvent[]>);

  const handleRecordWithBot = async (event: CalendarEvent) => {
    if (!user || !event.hasMeetingLink || !event.meetingUrl) return;

    const { data: session } = await supabase.auth.getSession();
    if (!session?.session?.access_token) throw new Error('Not authenticated');

    const response = await fetch(`${SUPABASE_URL}/functions/v1/start-recall-recording`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        meeting_url: event.meetingUrl,
        user_id: user.id,
        calendar_event_id: event.id,
        title: event.title,
      }),
    });

    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Failed to start recording');
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      if (!user || !session?.access_token) throw new Error('Not logged in');

      const { events: ev, error, hint } = await syncCalendarViaEdgeFunction(session.access_token);

      if (error) {
        toast({
          title: 'Calendar',
          description: hint || error,
          variant: 'destructive',
        });
        return;
      }

      setEvents(ev);
      setSynced(true);
      setLastSyncTime(new Date());

      setSyncMessage({ count: ev.length, visible: true });
      setTimeout(() => setSyncMessage((prev) => ({ ...prev, visible: false })), 3000);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to sync';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    } finally {
      setSyncing(false);
    }
  };

  const EventCard = ({ event }: { event: CalendarEvent }) => {
    const isEventToday = isToday(parseISO(event.start_time));
    const borderColor = isEventToday ? '#F97316' : '#78716C';

    return (
      <div
        onClick={() => openModal(event)}
        style={{
          background: '#1C1917',
          border: '1px solid #292524',
          borderRadius: 12,
          padding: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          transition: 'all 0.2s',
          borderLeft: `3px solid ${borderColor}`,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = '#44403C';
          e.currentTarget.style.background = '#292524';
          e.currentTarget.style.transform = 'translateY(-1px)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = '#292524';
          e.currentTarget.style.background = '#1C1917';
          e.currentTarget.style.transform = 'translateY(0)';
        }}
      >
        <div style={{ flex: 1 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: '#FAFAF9', margin: 0, marginBottom: 8, fontFamily: 'Outfit, sans-serif' }}>
            {event.title}
          </h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <p style={{ fontSize: 13, color: '#A8A29E', margin: 0, fontFamily: 'DM Sans, sans-serif' }}>
              {!event.is_all_day
                ? `${format(parseISO(event.start_time), 'h:mm a')} – ${format(parseISO(event.end_time), 'h:mm a')}`
                : 'All day'}
            </p>
            {!event.hasMeetingLink && (
              <p style={{ fontSize: 11, color: '#78716C', margin: 0, fontFamily: 'DM Sans, sans-serif' }}>
                No meeting link
              </p>
            )}
          </div>
        </div>
        <ChevronRight size={20} style={{ color: '#78716C' }} />
      </div>
    );
  };

  const SectionHeader = ({ label, color }: { label: string; color: string }) => (
    <h2
      style={{
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color,
        marginBottom: 16,
        marginTop: 24,
      }}
    >
      {label}
    </h2>
  );

  return (
    <DashboardLayout>
      <div style={{ padding: '32px', maxWidth: '56rem' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}>
          <div>
            <h1 style={{ fontSize: 30, fontWeight: 'bold', color: '#FAFAF9', margin: 0, fontFamily: 'Outfit, sans-serif', letterSpacing: '-0.02em' }}>
              Calendar
            </h1>
            <p style={{ fontSize: 14, color: '#A8A29E', marginTop: 8, margin: 0, fontFamily: 'DM Sans, sans-serif' }}>
              Your upcoming meetings
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {syncMessage.visible && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#22c55e', fontSize: 13 }}>
                <CheckCircle2 size={16} />
                <span>Synced · {syncMessage.count} events</span>
              </div>
            )}
            <Button
              onClick={handleSync}
              disabled={syncing}
              style={{
                background: syncing ? '#9d6b3c' : '#FB923C',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <RefreshCw size={16} style={{ animation: syncing ? 'spin 1s linear infinite' : 'none' }} />
              Sync Now
            </Button>
          </div>
        </div>

        {/* Events or Empty State */}
        {events.length === 0 ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '64px 32px',
              textAlign: 'center',
            }}
          >
            <CalendarIcon style={{ width: 36, height: 36, marginBottom: 16, color: '#78716C' }} />
            <h3 style={{ fontSize: 14, fontWeight: 600, color: '#A8A29E', margin: 0, marginBottom: 8 }}>
              No upcoming meetings found
            </h3>
            <p style={{ fontSize: 13, color: '#78716C', margin: 0, maxWidth: 360 }}>
              Add Calendar in{' '}
              <Link to="/settings?tab=integrations" style={{ color: '#FB923C', textDecoration: 'underline' }}>
                Settings → Integrations
              </Link>{' '}
              to run Google OAuth for this EchoBrief account. Project secrets alone do not connect your calendar.
            </p>
          </div>
        ) : (
          <div>
            {/* TODAY */}
            <SectionHeader label={`Today · ${format(new Date(), 'EEEE, MMMM d')}`} color="#FB923C" />
            {groupedEvents.today.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
                {groupedEvents.today.map(event => (
                  <EventCard key={event.id} event={event} />
                ))}
              </div>
            ) : (
              <p style={{ color: '#78716C', fontSize: 13, marginBottom: 24 }}>No meetings scheduled for today</p>
            )}

            {/* TOMORROW */}
            <SectionHeader label={`Tomorrow · ${format(new Date(Date.now() + 86400000), 'EEEE, MMMM d')}`} color="#78716C" />
            {groupedEvents.tomorrow.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
                {groupedEvents.tomorrow.map(event => (
                  <EventCard key={event.id} event={event} />
                ))}
              </div>
            ) : (
              <p style={{ color: '#78716C', fontSize: 13, marginBottom: 24 }}>No meetings scheduled for tomorrow</p>
            )}

            {/* UPCOMING */}
            {Object.keys(upcomingByDate).length > 0 && (
              <div>
                <button
                  onClick={() => setUpcomingExpanded(!upcomingExpanded)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: 0,
                    marginTop: 24,
                    marginBottom: 16,
                  }}
                >
                  <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#A8A29E' }}>
                    Upcoming
                  </span>
                  <ChevronDown
                    size={16}
                    style={{
                      color: '#78716C',
                      transform: upcomingExpanded ? 'rotate(0deg)' : 'rotate(-90deg)',
                      transition: 'transform 0.2s',
                    }}
                  />
                </button>

                {upcomingExpanded && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                    {Object.entries(upcomingByDate).map(([dateKey, dateEvents]) => (
                      <div key={dateKey}>
                        <h4 style={{ fontSize: 12, color: '#78716C', marginBottom: 12, margin: 0, fontFamily: 'DM Sans, sans-serif' }}>
                          {format(parseISO(dateKey), 'EEEE, MMMM d')}
                        </h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                          {dateEvents.map(event => (
                            <EventCard key={event.id} event={event} />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <style>{`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>

      {/* Meeting Detail Modal */}
      <MeetingDetailModal
        event={selectedEvent}
        onClose={closeModal}
        onRecordWithBot={handleRecordWithBot}
      />
    </DashboardLayout>
  );
}
