import { useEffect, useState, useCallback } from 'react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
  ExternalLink, 
  Video, 
  Loader2, 
  RefreshCw, 
  Clock, 
  Link as LinkIcon, 
  AlertCircle,
  Mic,
  Sparkles,
  MapPin
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { format, isToday, parseISO, isTomorrow } from 'date-fns';
import { useToast } from '@/hooks/use-toast';

interface CalendarAttendee {
  email: string;
  displayName?: string | null;
  responseStatus?: string | null;
  organizer?: boolean;
}

interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  meetingLink: string | null;
  source: string;
  status: string;
  description?: string | null;
  location?: string | null;
  attendees?: CalendarAttendee[];
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

export default function CalendarPage() {
  const { user, session } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isSampleData, setIsSampleData] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectingGoogle, setConnectingGoogle] = useState(false);
  
  // Event detail modal
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [eventDialogOpen, setEventDialogOpen] = useState(false);

  // Handle success/error from backend OAuth redirect
  const handleOAuthResult = useCallback(async () => {
    const googleConnected = searchParams.get('google_connected');
    const error = searchParams.get('error');

    if (googleConnected === 'true') {
      toast({
        title: 'Connected!',
        description: 'Google Calendar is now synced.',
      });
      setIsConnected(true);
      setSearchParams({});
      await fetchCalendarEvents();
    } else if (error) {
      const errorMessages: Record<string, string> = {
        invalid_state: 'Session expired. Please try again.',
        expired_state: 'Session expired. Please try again.',
        access_denied: 'Access was denied. Please try again.',
        no_code: 'Authorization failed. Please try again.',
        server_config: 'Server configuration error. Please contact support.',
        save_failed: 'Failed to save credentials. Please try again.',
        server_error: 'Server error. Please try again.',
      };
      toast({
        title: 'Connection Failed',
        description: errorMessages[error] || `Failed to connect: ${error}`,
        variant: 'destructive',
      });
      setSearchParams({});
    }
  }, [searchParams, setSearchParams, toast]);

  const fetchCalendarEvents = async () => {
    if (!session?.access_token) return;

    setError(null);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-google-calendar`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const data = await response.json();

      if (data.error && data.error !== "Google Calendar not connected") {
        setError(data.error);
      }
      
      if (data.events) {
        setEvents(data.events);
        setIsConnected(true);
        setIsSampleData(data.isSample || false);
      } else if (data.error === "Google Calendar not connected") {
        setIsConnected(false);
      }
    } catch (err) {
      console.error('Error fetching calendar:', err);
      setError('Failed to fetch calendar events');
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    await fetchCalendarEvents();
    setSyncing(false);
    toast({
      title: 'Synced!',
      description: 'Calendar events refreshed',
    });
  };

  const initiateGoogleOAuth = async () => {
    if (!session?.access_token) {
      toast({
        title: 'Error',
        description: 'Please sign in to connect Google Calendar',
        variant: 'destructive',
      });
      return;
    }

    setConnectingGoogle(true);
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

      if (data.error) {
        throw new Error(data.error);
      }

      if (data.authUrl) {
        window.location.href = data.authUrl;
      }
    } catch (err) {
      console.error('Failed to start OAuth:', err);
      toast({
        title: 'Connection Error',
        description: err instanceof Error ? err.message : 'Failed to start Google connection',
        variant: 'destructive',
      });
      setConnectingGoogle(false);
    }
  };

  const handleEventClick = (event: CalendarEvent) => {
    setSelectedEvent(event);
    setEventDialogOpen(true);
  };

  const handleRecordMeeting = async () => {
    if (!selectedEvent) return;
    
    // Navigate to dashboard with the meeting title pre-filled
    setEventDialogOpen(false);
    navigate('/dashboard', { 
      state: { 
        prefillMeeting: {
          title: selectedEvent.title,
          calendarEventId: selectedEvent.id,
          meetingLink: selectedEvent.meetingLink,
          attendees: selectedEvent.attendees || [],
        }
      }
    });
    toast({
      title: 'Ready to Record',
      description: `Recording for "${selectedEvent.title}" is ready to start`,
    });
  };

  useEffect(() => {
    // Check for OAuth result from backend redirect
    const googleConnected = searchParams.get('google_connected');
    const error = searchParams.get('error');
    if (googleConnected || error) {
      handleOAuthResult();
      return;
    }

    // Check if Google Calendar is connected
    const checkConnection = async () => {
      if (!user) return;
      
      const { data: profile } = await supabase
        .from('profiles')
        .select('google_calendar_connected')
        .eq('user_id', user.id)
        .single();

      setIsConnected(profile?.google_calendar_connected || false);
      
      if (profile?.google_calendar_connected) {
        await fetchCalendarEvents();
      } else {
        setLoading(false);
      }
    };

    checkConnection();
  }, [user, session, searchParams, handleOAuthResult]);

  const todayEvents = events.filter(e => {
    try {
      return isToday(parseISO(e.start));
    } catch {
      return false;
    }
  });

  const upcomingEvents = events.filter(e => {
    try {
      return !isToday(parseISO(e.start));
    } catch {
      return false;
    }
  });

  const formatEventTime = (start: string, end: string) => {
    try {
      const startDate = parseISO(start);
      const endDate = parseISO(end);
      return `${format(startDate, 'h:mm a')} - ${format(endDate, 'h:mm a')}`;
    } catch {
      return 'Time unavailable';
    }
  };

  const getEventDateLabel = (start: string) => {
    try {
      const date = parseISO(start);
      if (isToday(date)) return 'Today';
      if (isTomorrow(date)) return 'Tomorrow';
      return format(date, 'EEEE, MMM d');
    } catch {
      return 'Date unavailable';
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <Loader2 className="w-10 h-10 animate-spin text-orange-500 mx-auto mb-4" />
            <p className="text-muted-foreground">Loading your calendar...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-8 mesh-gradient min-h-screen">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
              <Sparkles className="w-8 h-8 text-orange-500" />
              Calendar
            </h1>
            <p className="text-muted-foreground mt-1">
              Click any meeting to record and capture insights
            </p>
          </div>
          {isConnected && (
            <Button variant="accent" onClick={handleSync} disabled={syncing} className="gap-2">
              <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
              Sync
            </Button>
          )}
        </div>

        {error && (
          <div className="mb-6 p-4 bg-destructive/10 rounded-lg border border-destructive/20 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-destructive" />
            <p className="text-sm text-destructive">{error}</p>
            {error.includes('reconnect') && (
              <Button variant="outline" size="sm" onClick={initiateGoogleOAuth}>
                Reconnect
              </Button>
            )}
          </div>
        )}

        {!isConnected ? (
          <Card className="glass-card-liquid lg:col-span-2">
            <CardContent className="py-16 text-center">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-orange-500/20 to-orange-500/10 mx-auto mb-6 flex items-center justify-center">
                <CalendarIcon className="w-10 h-10 text-orange-500" />
              </div>
              <h3 className="text-2xl font-bold text-foreground mb-3">
                Connect Your Calendar
              </h3>
              <p className="text-muted-foreground mb-8 max-w-md mx-auto">
                Link your Google Calendar to automatically see your upcoming meetings and get reminders to start recording.
              </p>
              <Button variant="accent" size="lg" onClick={initiateGoogleOAuth} disabled={connectingGoogle} className="gap-2">
                {connectingGoogle ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <ExternalLink className="w-5 h-5" />
                )}
                {connectingGoogle ? 'Connecting...' : 'Connect Google Calendar'}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            {isSampleData && (
              <div className="mb-6 p-4 bg-orange-500/10 rounded-lg border border-orange-500/20">
                <p className="text-sm text-orange-500">
                  📅 Showing sample calendar events. Your actual Google Calendar events will appear once OAuth is configured.
                </p>
              </div>
            )}

            <div className="grid gap-6 lg:grid-cols-2">
              {/* Today's Meetings */}
              <Card className="glass-card-liquid overflow-hidden">
                <CardHeader className="relative">
                  <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-orange-500 to-amber-500" />
                  <CardTitle className="flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-recording/10">
                      <Video className="w-5 h-5 text-recording" />
                    </div>
                    Today's Meetings
                  </CardTitle>
                  <CardDescription>
                    {todayEvents.length} meeting{todayEvents.length !== 1 ? 's' : ''} scheduled for today
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {todayEvents.length === 0 ? (
                    <div className="py-12 text-center">
                      <div className="w-16 h-16 rounded-full bg-muted/50 mx-auto mb-4 flex items-center justify-center">
                        <CalendarIcon className="w-8 h-8 text-muted-foreground" />
                      </div>
                      <p className="text-muted-foreground">No meetings scheduled for today</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {todayEvents.map((event) => (
                        <div
                          key={event.id}
                          onClick={() => handleEventClick(event)}
                          className="p-4 rounded-xl border border-border bg-card hover:bg-secondary transition-all duration-150 cursor-pointer group"
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <h4 className="font-semibold text-foreground group-hover:text-orange-400 transition-colors">{event.title}</h4>
                              <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                                <Clock className="w-4 h-4" />
                                {formatEventTime(event.start, event.end)}
                              </div>
                              {event.location && (
                                <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                                  <MapPin className="w-4 h-4" />
                                  {event.location}
                                </div>
                              )}
                            </div>
                            <div className="flex flex-col items-end gap-2">
                              <Badge variant="outline" className="text-xs">
                                {event.source === 'google_calendar' ? 'Google' : 'Manual'}
                              </Badge>
                              <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                                <Mic className="w-5 h-5 text-recording" />
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* This Week */}
              <Card className="glass-card-liquid overflow-hidden">
                <CardHeader className="relative">
                  <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-orange-500 to-amber-500" />
                  <CardTitle className="flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-orange-500/10">
                      <CalendarIcon className="w-5 h-5 text-orange-500" />
                    </div>
                    This Week
                  </CardTitle>
                  <CardDescription>
                    {upcomingEvents.length} upcoming meeting{upcomingEvents.length !== 1 ? 's' : ''}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {upcomingEvents.length === 0 ? (
                    <div className="py-12 text-center">
                      <div className="w-16 h-16 rounded-full bg-muted/50 mx-auto mb-4 flex items-center justify-center">
                        <CalendarIcon className="w-8 h-8 text-muted-foreground" />
                      </div>
                      <p className="text-muted-foreground">No upcoming meetings this week</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {upcomingEvents.map((event) => (
                        <div
                          key={event.id}
                          onClick={() => handleEventClick(event)}
                          className="p-4 rounded-xl border border-border bg-card hover:bg-secondary transition-all duration-150 cursor-pointer group"
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <h4 className="font-semibold text-foreground group-hover:text-orange-400 transition-colors">{event.title}</h4>
                              <p className="text-sm text-orange-400 font-medium mt-1">
                                {getEventDateLabel(event.start)}
                              </p>
                              <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                                <Clock className="w-4 h-4" />
                                {formatEventTime(event.start, event.end)}
                              </div>
                              {event.location && (
                                <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                                  <MapPin className="w-4 h-4" />
                                  {event.location}
                                </div>
                              )}
                            </div>
                            <div className="flex flex-col items-end gap-2">
                              <Badge variant="outline" className="text-xs">
                                {event.source === 'google_calendar' ? 'Google' : 'Manual'}
                              </Badge>
                              <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                                <Mic className="w-5 h-5 text-recording" />
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>

      {/* Event Detail Dialog */}
      <Dialog open={eventDialogOpen} onOpenChange={setEventDialogOpen}>
        <DialogContent className="glass-card-liquid sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3 text-xl">
              <div className="p-2 rounded-lg bg-orange-500/10">
                <Video className="w-5 h-5 text-orange-500" />
              </div>
              {selectedEvent?.title}
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-3 pt-2">
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <span>
                    {selectedEvent && getEventDateLabel(selectedEvent.start)} • {selectedEvent && formatEventTime(selectedEvent.start, selectedEvent.end)}
                  </span>
                </div>
                {selectedEvent?.location && (
                  <div className="flex items-center gap-2 text-sm">
                    <MapPin className="w-4 h-4 text-muted-foreground" />
                    <span>{selectedEvent.location}</span>
                  </div>
                )}
                {selectedEvent?.meetingLink && (
                  <a 
                    href={selectedEvent.meetingLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-orange-400 hover:underline"
                  >
                    <LinkIcon className="w-4 h-4" />
                    Join meeting link
                  </a>
                )}
                {selectedEvent?.description && (
                  <div className="pt-3 border-t border-border">
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {selectedEvent.description}
                    </p>
                  </div>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-6 flex gap-2">
            <Button variant="outline" onClick={() => setEventDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="recording" onClick={handleRecordMeeting} className="gap-2">
              <Mic className="w-4 h-4" />
              Record This Meeting
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
