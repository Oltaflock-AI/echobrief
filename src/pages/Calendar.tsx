import { useEffect, useState } from 'react';
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

function extractMeetingUrl(event: any): string | null {
  // 1. Check conferenceData (Google Meet native)
  if (event.conferenceData?.entryPoints) {
    const videoEntry = event.conferenceData.entryPoints.find(
      (e: any) => e.entryPointType === 'video'
    );
    if (videoEntry?.uri) return videoEntry.uri;
  }

  // 2. Check hangoutLink (older Google Meet format)
  if (event.hangoutLink) return event.hangoutLink;

  // 3. Check location field
  if (event.location) {
    const urlMatch = event.location.match(
      /https?:\/\/(meet\.google\.com|zoom\.us|teams\.microsoft\.com|webex\.com)[^\s]*/i
    );
    if (urlMatch) return urlMatch[0];
  }

  // 4. Check description field
  if (event.description) {
    const urlMatch = event.description.match(
      /https?:\/\/(meet\.google\.com|zoom\.us|teams\.microsoft\.com|webex\.com)[^\s<"]*/i
    );
    if (urlMatch) return urlMatch[0];
  }

  return null;
}

interface CalendarEvent {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
  is_all_day: boolean;
  meetingUrl?: string;
  hasMeetingLink?: boolean;
}

export default function Calendar() {
  const { user } = useAuth();
  const { events, setEvents, synced, setSynced, lastSyncTime, setLastSyncTime } = useCalendar();
  const { toast } = useToast();

  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<{ count: number; visible: boolean }>({ count: 0, visible: false });
  const [upcomingExpanded, setUpcomingExpanded] = useState(false);
  const [autoFetched, setAutoFetched] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);

  const openModal = (event: CalendarEvent) => setSelectedEvent(event);
  const closeModal = () => setSelectedEvent(null);

  // Auto-fetch on mount if events are empty and user is logged in
  useEffect(() => {
    if (autoFetched || events.length > 0 || !user) return;

    const autoFetch = async () => {
      try {
        const { data: tokenData } = await supabase
          .from('user_oauth_tokens')
          .select('google_access_token')
          .eq('user_id', user.id)
          .single();

        if (!tokenData?.google_access_token) return;

        const { data: calendars } = await supabase
          .from('calendars')
          .select('id, calendar_id')
          .eq('user_id', user.id)
          .eq('is_active', true);

        if (!calendars || calendars.length === 0) return;

        const now = new Date();
        const maxDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        const allEvents: CalendarEvent[] = [];

        for (const cal of calendars) {
          try {
            const response = await fetch(
              `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal.calendar_id)}/events?timeMin=${now.toISOString()}&timeMax=${maxDate.toISOString()}&singleEvents=true&orderBy=startTime`,
              { headers: { 'Authorization': `Bearer ${tokenData.google_access_token}` } }
            );

            if (response.ok) {
              const { items } = await response.json();
              if (items) {
                allEvents.push(...items.map((e: any) => {
                  const meetingUrl = extractMeetingUrl(e);
                  return {
                    id: e.id,
                    title: e.summary || 'No title',
                    start_time: e.start?.dateTime || e.start?.date,
                    end_time: e.end?.dateTime || e.end?.date,
                    is_all_day: !e.start?.dateTime,
                    meetingUrl,
                    hasMeetingLink: !!meetingUrl,
                  };
                }));
              }
            }
          } catch (err) {
            console.error('Fetch error:', err);
          }
        }

        setEvents(allEvents);
        setSynced(true);
        setLastSyncTime(new Date());
      } catch (err) {
        console.error('Auto-fetch error:', err);
      } finally {
        setAutoFetched(true);
      }
    };

    autoFetch();
  }, [user, autoFetched, events.length, setEvents, setSynced, setLastSyncTime]);

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
      if (!user) throw new Error('Not logged in');

      const { data: tokenData } = await supabase
        .from('user_oauth_tokens')
        .select('google_access_token')
        .eq('user_id', user.id)
        .single();

      if (!tokenData?.google_access_token) {
        throw new Error('Google Calendar not connected');
      }

      const { data: calendars } = await supabase
        .from('calendars')
        .select('id, calendar_id')
        .eq('user_id', user.id)
        .eq('is_active', true);

      if (!calendars || calendars.length === 0) {
        setEvents([]);
        toast({ title: 'Info', description: 'No calendars connected' });
        setSyncing(false);
        return;
      }

      const now = new Date();
      const maxDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      const allEvents: CalendarEvent[] = [];

      for (const cal of calendars) {
        try {
          const response = await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal.calendar_id)}/events?timeMin=${now.toISOString()}&timeMax=${maxDate.toISOString()}&singleEvents=true&orderBy=startTime`,
            { headers: { 'Authorization': `Bearer ${tokenData.google_access_token}` } }
          );

          if (response.ok) {
            const { items } = await response.json();
            if (items) {
              allEvents.push(...items.map((e: any) => ({
                id: e.id,
                title: e.summary || 'No title',
                start_time: e.start?.dateTime || e.start?.date,
                end_time: e.end?.dateTime || e.end?.date,
                is_all_day: !e.start?.dateTime,
              })));
            }
          }
        } catch (err) {
          console.error('Fetch error:', err);
        }
      }

      setEvents(allEvents);
      setSynced(true);
      setLastSyncTime(new Date());

      // Show sync message
      setSyncMessage({ count: allEvents.length, visible: true });
      setTimeout(() => setSyncMessage(prev => ({ ...prev, visible: false })), 3000);
    } catch (err: any) {
      toast({ title: 'Error', description: err?.message || 'Failed to sync', variant: 'destructive' });
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
            <p style={{ fontSize: 13, color: '#78716C', margin: 0 }}>
              Make sure your Google Calendar is connected in Settings
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
