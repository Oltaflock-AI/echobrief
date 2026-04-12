import { useEffect, useState, useCallback } from 'react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { CalendarSelector } from '@/components/dashboard/CalendarSelector';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Calendar as CalendarIcon,
  Video,
  Loader2,
  RefreshCw,
  Clock,
  AlertCircle,
  Sparkles,
  MapPin,
  Users,
  ChevronRight,
  Plus,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { format, isToday, isTomorrow, parseISO } from 'date-fns';
import { useToast } from '@/hooks/use-toast';

interface CalendarRecord {
  id: string;
  provider: string;
  calendar_name: string;
  email?: string;
  is_primary: boolean;
  is_active: boolean;
}

interface CalendarEvent {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
  location?: string;
  meeting_link?: string;
  organizer_name?: string;
  attendees?: any[];
  calendar_id: string;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

export default function CalendarPolished() {
  const { user, session } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [calendars, setCalendars] = useState<CalendarRecord[]>([]);
  const [selectedCalendarIds, setSelectedCalendarIds] = useState<string[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [eventDialogOpen, setEventDialogOpen] = useState(false);

  // Fetch calendars
  useEffect(() => {
    const fetchCalendars = async () => {
      if (!user) return;

      const { data, error } = await supabase
        .from('calendars')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('is_primary', { ascending: false });

      if (error) {
        console.error('Failed to fetch calendars:', error);
        return;
      }

      setCalendars(data || []);
      // Auto-select primary calendar
      const primaryId = data?.find((c) => c.is_primary)?.id;
      if (primaryId) {
        setSelectedCalendarIds([primaryId]);
      }
      setLoading(false);
    };

    fetchCalendars();
  }, [user]);

  // Fetch events for selected calendars
  const fetchEvents = useCallback(async () => {
    if (!user || selectedCalendarIds.length === 0) return;

    setSyncing(true);
    try {
      const { data, error } = await supabase
        .from('calendar_events')
        .select('*')
        .eq('user_id', user.id)
        .in('calendar_id', selectedCalendarIds)
        .gte('start_time', new Date().toISOString())
        .order('start_time', { ascending: true });

      if (error) throw error;
      setEvents(data || []);
    } catch (err) {
      console.error('Failed to fetch events:', err);
      toast({ title: 'Error', description: 'Failed to load events', variant: 'destructive' });
    } finally {
      setSyncing(false);
    }
  }, [user, selectedCalendarIds]);

  useEffect(() => {
    if (selectedCalendarIds.length > 0) {
      fetchEvents();
    }
  }, [selectedCalendarIds, fetchEvents]);

  const handleAddCalendar = async () => {
    if (!session?.access_token) {
      toast({ title: 'Error', description: 'Please sign in', variant: 'destructive' });
      return;
    }

    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/google-oauth-start`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ returnTo: '/calendar', origin: window.location.origin }),
      });

      const data = await response.json();
      if (data.authUrl) {
        window.location.href = data.authUrl;
      }
    } catch (err) {
      toast({ title: 'Error', description: 'Failed to connect calendar', variant: 'destructive' });
    }
  };

  const handleRemoveCalendar = async (calendarId: string) => {
    try {
      await supabase
        .from('calendars')
        .update({ is_active: false })
        .eq('id', calendarId);

      setCalendars(calendars.filter((c) => c.id !== calendarId));
      setSelectedCalendarIds(selectedCalendarIds.filter((id) => id !== calendarId));
      toast({ title: 'Calendar removed' });
    } catch (err) {
      toast({ title: 'Error', description: 'Failed to remove calendar', variant: 'destructive' });
    }
  };

  const handleRecordEvent = () => {
    if (!selectedEvent) return;
    navigate('/dashboard', {
      state: {
        prefillMeeting: {
          title: selectedEvent.title,
          meetingLink: selectedEvent.meeting_link,
          attendees: selectedEvent.attendees || [],
        },
      },
    });
    toast({ title: 'Ready to Record', description: `Recording for "${selectedEvent.title}"` });
    setEventDialogOpen(false);
  };

  // Group events by date
  const groupedEvents = events.reduce(
    (acc, event) => {
      const date = format(parseISO(event.start_time), 'yyyy-MM-dd');
      if (!acc[date]) acc[date] = [];
      acc[date].push(event);
      return acc;
    },
    {} as Record<string, CalendarEvent[]>
  );

  const getDateLabel = (dateStr: string) => {
    const date = parseISO(dateStr);
    if (isToday(date)) return 'Today';
    if (isTomorrow(date)) return 'Tomorrow';
    return format(date, 'MMMM d, yyyy');
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <Loader2 size={32} className="animate-spin text-accent" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto px-4 py-8 sm:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2 font-heading">
            Calendar
          </h1>
          <p className="text-muted-foreground">Connect your calendars and record meetings directly</p>
        </div>

        {/* Calendar Selector */}
        <div className="mb-8 p-6 rounded-xl bg-card border border-border">
          <div className="mb-4">
            <label className="text-sm font-semibold text-foreground mb-3 block">Select Calendars</label>
            <CalendarSelector
              calendars={calendars}
              selectedCalendarIds={selectedCalendarIds}
              onSelectionChange={setSelectedCalendarIds}
              onAddCalendar={handleAddCalendar}
              onRemoveCalendar={handleRemoveCalendar}
            />
          </div>

          <div className="flex gap-2">
            <Button
              onClick={fetchEvents}
              disabled={syncing || selectedCalendarIds.length === 0}
              size="sm"
              className="bg-accent/10 text-accent border border-accent/30 hover:bg-accent/20"
            >
              {syncing ? <Loader2 size={14} className="mr-2 animate-spin" /> : <RefreshCw size={14} className="mr-2" />}
              Sync Events
            </Button>
          </div>
        </div>

        {/* Events List */}
        {selectedCalendarIds.length === 0 ? (
          <div className="text-center py-16 rounded-xl bg-card border border-border">
            <CalendarIcon size={48} className="mx-auto mb-4 text-muted-foreground/50" />
            <h2 className="text-lg font-semibold text-foreground mb-2">No calendars selected</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Connect your calendar to see upcoming meetings and record them.
            </p>
            <Button
              onClick={handleAddCalendar}
              className="bg-accent text-accent-foreground hover:bg-accent/90"
            >
              <Plus size={14} className="mr-2" /> Connect Calendar
            </Button>
          </div>
        ) : events.length === 0 ? (
          <div className="text-center py-16 rounded-xl bg-card border border-border">
            <Sparkles size={48} className="mx-auto mb-4 text-muted-foreground/50" />
            <h2 className="text-lg font-semibold text-foreground mb-2">No upcoming events</h2>
            <p className="text-sm text-muted-foreground">
              You have no scheduled meetings in your selected calendars.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedEvents).map(([dateStr, dateEvents]) => (
              <div key={dateStr}>
                <div className="text-sm font-semibold mb-3 px-4 py-2 rounded-lg bg-accent/[0.08] text-accent">
                  {getDateLabel(dateStr)}
                </div>

                <div className="space-y-2">
                  {dateEvents.map((event) => (
                    <div
                      key={event.id}
                      onClick={() => {
                        setSelectedEvent(event);
                        setEventDialogOpen(true);
                      }}
                      className="p-4 rounded-xl cursor-pointer transition-colors bg-card border border-border hover:bg-secondary"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <h3 className="font-semibold text-foreground mb-1">{event.title}</h3>
                          <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <Clock size={14} />
                              {format(parseISO(event.start_time), 'h:mm a')} - {format(parseISO(event.end_time || event.start_time), 'h:mm a')}
                            </div>
                            {event.location && (
                              <div className="flex items-center gap-1">
                                <MapPin size={14} />
                                {event.location}
                              </div>
                            )}
                            {event.organizer_name && (
                              <div className="flex items-center gap-1">
                                <Users size={14} />
                                {event.organizer_name}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {event.meeting_link && (
                            <Badge className="bg-blue-500/15 text-blue-500 border-0">
                              <Video size={12} className="mr-1" /> Zoom/Meet
                            </Badge>
                          )}
                          <ChevronRight size={16} className="text-muted-foreground" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Event Detail Dialog */}
        <Dialog open={eventDialogOpen} onOpenChange={setEventDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{selectedEvent?.title}</DialogTitle>
              <DialogDescription>
                {selectedEvent && format(parseISO(selectedEvent.start_time), 'MMMM d, yyyy · h:mm a')}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-4">
              {selectedEvent?.location && (
                <div className="flex items-start gap-3">
                  <MapPin size={16} className="text-accent mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Location</p>
                    <p className="text-sm text-muted-foreground">
                      {selectedEvent.location}
                    </p>
                  </div>
                </div>
              )}

              {selectedEvent?.organizer_name && (
                <div className="flex items-start gap-3">
                  <Users size={16} className="text-accent mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Organizer</p>
                    <p className="text-sm text-muted-foreground">
                      {selectedEvent.organizer_name}
                    </p>
                  </div>
                </div>
              )}

              {selectedEvent?.meeting_link && (
                <div className="flex items-start gap-3">
                  <Video size={16} className="text-accent mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Meeting Link</p>
                    <a
                      href={selectedEvent.meeting_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-500 hover:underline"
                    >
                      {selectedEvent.meeting_link}
                    </a>
                  </div>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setEventDialogOpen(false)}
              >
                Close
              </Button>
              {selectedEvent?.meeting_link && (
                <Button
                  onClick={handleRecordEvent}
                  className="bg-accent text-accent-foreground hover:bg-accent/90"
                >
                  <Sparkles size={14} className="mr-2" /> Record This Meeting
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
