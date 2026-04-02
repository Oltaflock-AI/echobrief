import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar as CalendarIcon, Plus, Loader2, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { format, isToday, isTomorrow, parseISO } from 'date-fns';
import { useToast } from '@/hooks/use-toast';

interface CalendarEvent {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
  location?: string;
  meeting_link?: string;
  organizer_name?: string;
}

export default function Calendar() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  // Fetch events from Supabase
  useEffect(() => {
    if (!user) return;

    const fetchEvents = async () => {
      try {
        const { data, error } = await supabase
          .from('calendar_events')
          .select('*')
          .eq('user_id', user.id)
          .gte('start_time', new Date().toISOString())
          .order('start_time', { ascending: true })
          .limit(50);

        if (error) {
          console.error('Error fetching events:', error);
          setEvents([]);
        } else {
          setEvents(data || []);
        }
      } catch (err) {
        console.error('Unexpected error:', err);
        setEvents([]);
      } finally {
        setLoading(false);
      }
    };

    fetchEvents();
  }, [user]);

  const handleManualSync = async () => {
    setSyncing(true);
    try {
      // Get session token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast({ title: 'Error', description: 'Not authenticated', variant: 'destructive' });
        return;
      }

      // Call sync function
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-calendar-events`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error);

      toast({ title: 'Synced!', description: `${result.events_synced} events updated` });

      // Refetch events
      const { data, error } = await supabase
        .from('calendar_events')
        .select('*')
        .eq('user_id', user?.id)
        .gte('start_time', new Date().toISOString())
        .order('start_time', { ascending: true })
        .limit(50);

      if (!error) {
        setEvents(data || []);
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err?.message || 'Failed to sync calendar', variant: 'destructive' });
    } finally {
      setSyncing(false);
    }
  };

  const getEventBadgeColor = (startTime: string) => {
    const eventDate = parseISO(startTime);
    if (isToday(eventDate)) return 'bg-orange-500/20 text-orange-400';
    if (isTomorrow(eventDate)) return 'bg-blue-500/20 text-blue-400';
    return 'bg-gray-500/20 text-gray-400';
  };

  const getEventBadgeLabel = (startTime: string) => {
    const eventDate = parseISO(startTime);
    if (isToday(eventDate)) return 'Today';
    if (isTomorrow(eventDate)) return 'Tomorrow';
    return format(eventDate, 'MMM d');
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground mx-auto mb-4" />
            <p style={{ color: '#A8A29E' }}>Loading calendar events...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="px-8 py-8 max-w-4xl">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground" style={{ fontFamily: 'Outfit, sans-serif', letterSpacing: '-0.02em' }}>
              Calendar
            </h1>
            <p className="text-sm mt-2" style={{ color: '#A8A29E' }}>
              Your upcoming meetings
            </p>
          </div>
          <Button
            onClick={handleManualSync}
            disabled={syncing}
            style={{ background: '#FB923C', color: 'white' }}
          >
            {syncing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Refresh
          </Button>
        </div>

        {/* No Events State */}
        {events.length === 0 ? (
          <div
            style={{
              background: '#1C1917',
              border: '1px solid #292524',
              borderRadius: 16,
              padding: 48,
              textAlign: 'center',
            }}
          >
            <CalendarIcon className="w-12 h-12 mx-auto mb-4" style={{ color: '#78716C' }} />
            <h3 style={{ fontSize: 16, fontWeight: 600, color: '#FAFAF9', marginBottom: 8 }}>
              No upcoming meetings
            </h3>
            <p style={{ fontSize: 13, color: '#78716C', marginBottom: 24 }}>
              Connect your Google Calendar in Settings to see your upcoming meetings here.
            </p>
            <Button
              onClick={() => navigate('/settings?tab=integrations')}
              style={{ background: '#FB923C', color: 'white' }}
            >
              Go to Settings
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {events.map((event) => (
              <div
                key={event.id}
                style={{
                  background: '#1C1917',
                  border: '1px solid #292524',
                  borderRadius: 12,
                  padding: 16,
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                onClick={() => navigate(`/meeting/${event.id}`)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#404040';
                  e.currentTarget.style.background = '#252422';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#292524';
                  e.currentTarget.style.background = '#1C1917';
                }}
              >
                <div style={{ flex: 1 }}>
                  {/* Title & Badge */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <h3 style={{ fontSize: 14, fontWeight: 600, color: '#FAFAF9', margin: 0 }}>
                      {event.title}
                    </h3>
                    <Badge className={getEventBadgeColor(event.start_time)}>
                      {getEventBadgeLabel(event.start_time)}
                    </Badge>
                  </div>

                  {/* Time */}
                  <p style={{ fontSize: 12, color: '#A8A29E', margin: 0, marginBottom: 8 }}>
                    {format(parseISO(event.start_time), 'h:mm a')} – {format(parseISO(event.end_time), 'h:mm a')}
                  </p>

                  {/* Details */}
                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                    {event.organizer_name && (
                      <p style={{ fontSize: 12, color: '#78716C', margin: 0 }}>
                        👤 {event.organizer_name}
                      </p>
                    )}
                    {event.location && (
                      <p style={{ fontSize: 12, color: '#78716C', margin: 0 }}>
                        📍 {event.location}
                      </p>
                    )}
                    {event.meeting_link && (
                      <a
                        href={event.meeting_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          fontSize: 12,
                          color: '#FB923C',
                          textDecoration: 'none',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        🔗 Join meeting <ExternalLink size={10} style={{ marginLeft: 2 }} />
                      </a>
                    )}
                  </div>
                </div>

                {/* Arrow */}
                <div style={{ marginLeft: 16, paddingTop: 4, color: '#78716C' }}>
                  →
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
