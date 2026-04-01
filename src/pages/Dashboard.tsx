import { useEffect, useState, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { RecordingButton } from '@/components/dashboard/RecordingButton';
import { ExtensionStatus } from '@/components/dashboard/ExtensionStatus';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Meeting } from '@/types/meeting';
import { Clock, ChevronRight, Sparkles, Mic } from 'lucide-react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { MeetingStatusBadge } from '@/components/dashboard/MeetingStatusBadge';

interface CalendarAttendee {
  email: string;
  displayName?: string | null;
  responseStatus?: string | null;
  organizer?: boolean;
}

interface PrefillMeeting {
  title: string;
  calendarEventId?: string;
  meetingLink?: string;
  attendees?: CalendarAttendee[];
}

export default function Dashboard() {
  const { user } = useAuth();
  const location = useLocation();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [insightCounts, setInsightCounts] = useState<Record<string, boolean>>({});
  
  const prefillMeeting = (location.state as { prefillMeeting?: PrefillMeeting })?.prefillMeeting;

  useEffect(() => {
    if (!user) return;

    const fetchMeetings = async () => {
      const { data, error } = await supabase
        .from('meetings')
        .select('*')
        .eq('user_id', user.id)
        .order('start_time', { ascending: false });

      if (!error && data) {
        setMeetings(data as Meeting[]);
        
        // Fetch which meetings have insights
        const { data: insights } = await supabase
          .from('meeting_insights')
          .select('meeting_id')
          .in('meeting_id', data.map(m => m.id));
        
        if (insights) {
          const counts: Record<string, boolean> = {};
          insights.forEach(i => { counts[i.meeting_id] = true; });
          setInsightCounts(counts);
        }
      }
      setLoading(false);
    };

    fetchMeetings();

    const channel = supabase
      .channel('meetings-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'meetings',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setMeetings((prev) => [payload.new as Meeting, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            setMeetings((prev) =>
              prev.map((m) => (m.id === payload.new.id ? (payload.new as Meeting) : m))
            );
          } else if (payload.eventType === 'DELETE') {
            setMeetings((prev) => prev.filter((m) => m.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  // Calculate stats
  const stats = useMemo(() => {
    const totalMeetings = meetings.length;
    const totalDuration = meetings.reduce((sum, m) => sum + (m.duration_seconds || 0), 0);
    const transcriptCount = Object.keys(insightCounts).length;
    
    return { totalMeetings, totalDuration, transcriptCount };
  }, [meetings, insightCounts]);

  // Estimate time saved (avg 15 min per meeting summary)
  const timeSavedMinutes = stats.transcriptCount * 15;

  const formatDuration = (seconds?: number) => {
    if (!seconds) return '';
    const mins = Math.floor(seconds / 60);
    return `${mins}m`;
  };

  const formatTotalDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  };

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Meetings</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Your meeting intelligence hub
            </p>
          </div>
          <RecordingButton 
            prefillTitle={prefillMeeting?.title}
            calendarEventId={prefillMeeting?.calendarEventId}
            meetingLink={prefillMeeting?.meetingLink}
            attendees={prefillMeeting?.attendees}
          />
        </div>

        {/* Extension Status Banner */}
        <ExtensionStatus className="mb-6" />

        {/* Stats Row - Compact */}
        {!loading && meetings.length > 0 && (
          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="p-4 rounded-lg bg-card border border-border overflow-hidden relative">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-orange-500 to-amber-500" />
              <p className="text-2xl font-semibold text-foreground" style={{ fontFamily: 'Outfit, sans-serif' }}>{stats.totalMeetings}</p>
              <p className="text-xs text-muted-foreground">Meetings</p>
            </div>
            <div className="p-4 rounded-lg bg-card border border-border overflow-hidden relative">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-orange-500 to-amber-500" />
              <p className="text-2xl font-semibold text-foreground" style={{ fontFamily: 'Outfit, sans-serif' }}>{formatTotalDuration(stats.totalDuration)}</p>
              <p className="text-xs text-muted-foreground">Recorded</p>
            </div>
            <div className="p-4 rounded-lg bg-card border border-border overflow-hidden relative">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-orange-500 to-amber-500" />
              <p className="text-2xl font-semibold text-foreground" style={{ fontFamily: 'Outfit, sans-serif' }}>{stats.transcriptCount}</p>
              <p className="text-xs text-muted-foreground">Summaries</p>
            </div>
          </div>
        )}

        {/* Time Saved Banner */}
        {!loading && timeSavedMinutes > 0 && (
          <div className="mb-8 p-4 rounded-lg bg-orange-500/5 border border-orange-500/20 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-orange-500/10 flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-5 h-5 text-orange-500" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">
                ~{Math.floor(timeSavedMinutes / 60)}h {timeSavedMinutes % 60}m saved
              </p>
              <p className="text-xs text-muted-foreground">
                Time saved on meeting summaries with AI
              </p>
            </div>
          </div>
        )}

        {/* Section Title */}
        <h2 className="section-header mb-3">Recent Meetings</h2>

        {/* Meetings List */}
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-16 rounded-lg" />
            ))}
          </div>
        ) : meetings.length === 0 ? (
          <div className="empty-state">
            <Mic className="empty-state-icon" />
            <p className="empty-state-title">No meetings yet</p>
            <p className="empty-state-description">
              Click Record to capture your first meeting. Your AI-powered summaries will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {meetings.map((meeting) => (
              <Link
                key={meeting.id}
                to={`/meeting/${meeting.id}`}
                className="list-row group"
              >
                {/* Status dot */}
                <MeetingStatusBadge status={meeting.status || 'scheduled'} />
                
                {/* Content */}
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-foreground truncate block">
                    {meeting.title}
                  </span>
                </div>

                {/* Insights badge - AI/insights → purple-500 per brand spec */}
                {insightCounts[meeting.id] && (
                  <span className="tag" style={{ backgroundColor: 'rgba(168,85,247,0.1)', color: '#A855F7' }}>Summary</span>
                )}

                {/* Metadata */}
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  {meeting.duration_seconds && (
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      {formatDuration(meeting.duration_seconds)}
                    </span>
                  )}
                  <span>{format(new Date(meeting.start_time), 'MMM d')}</span>
                  <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
