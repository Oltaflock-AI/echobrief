import { useEffect, useState, useMemo } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { RecordingButton } from '@/components/dashboard/RecordingButton';
import { ExtensionStatus } from '@/components/dashboard/ExtensionStatus';
import { StatusBadge, SourceBadge, LanguageBadge, Card } from '@/components/dashboard/PrototypeBadges';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Meeting } from '@/types/meeting';
import { 
  Clock, ChevronRight, Sparkles, Mic, FileText, Users, 
  Zap, CheckCircle2, Globe, Bot 
} from 'lucide-react';
import { format } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { T } from '@/lib/theme';

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

interface MeetingInsightCount {
  meeting_id: string;
  action_items_count: number;
  decisions_count: number;
}

export default function Dashboard() {
  const { user } = useAuth();
  const location = useLocation();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [insightCounts, setInsightCounts] = useState<Record<string, MeetingInsightCount>>({});
  
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
        
        // Fetch insight counts for meetings
        const { data: insights } = await supabase
          .from('meeting_insights')
          .select('meeting_id, action_items, decisions')
          .in('meeting_id', data.map(m => m.id));
        
        if (insights) {
          const counts: Record<string, MeetingInsightCount> = {};
          insights.forEach(i => {
            const actionItems = Array.isArray(i.action_items) ? i.action_items.length : 0;
            const decisions = Array.isArray(i.decisions) ? i.decisions.length : 0;
            counts[i.meeting_id] = {
              meeting_id: i.meeting_id,
              action_items_count: actionItems,
              decisions_count: decisions,
            };
          });
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
    const totalActions = Object.values(insightCounts).reduce((sum, c) => sum + c.action_items_count, 0);
    const completedActions = 0; // Would need action_item_completions table
    const languages = new Set(meetings.map(m => 'English')); // Placeholder - would come from transcripts
    const recordingNow = meetings.filter(m => m.status === 'recording').length;
    
    return { totalMeetings, totalDuration, transcriptCount, totalActions, completedActions, languageCount: languages.size, recordingNow };
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

  const getAttendeeCount = (meeting: Meeting): number => {
    if (meeting.attendees && Array.isArray(meeting.attendees)) {
      return meeting.attendees.length;
    }
    return 0;
  };

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold text-foreground" style={{ fontFamily: 'Outfit, sans-serif', letterSpacing: '-0.02em' }}>
              Your Meetings
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {meetings.length} meetings this week · {stats.totalActions} action items
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

        {/* Quick Stats - Prototype Style */}
        {!loading && meetings.length > 0 && (
          <div className="grid grid-cols-4 gap-3 mb-8">
            {[
              { label: "Total Meetings", value: stats.totalMeetings.toString(), sub: "This week", icon: <Mic size={18} color={T.orangeL} /> },
              { label: "Action Items", value: stats.totalActions.toString(), sub: `${stats.completedActions} completed`, icon: <CheckCircle2 size={18} color={T.green} /> },
              { label: "Languages Used", value: stats.languageCount.toString(), sub: "EN, HI, TA, etc.", icon: <Globe size={18} color={T.purple} /> },
              { label: "Active Bots", value: stats.recordingNow.toString(), sub: stats.recordingNow > 0 ? "Recording now" : "None active", icon: <Bot size={18} color={T.blue} /> },
            ].map((stat, i) => (
              <Card key={i} style={{ padding: 18 }}>
                <div className="flex justify-between items-start mb-3">
                  {stat.icon}
                </div>
                <div className="text-2xl font-bold text-foreground" style={{ fontFamily: 'Outfit, sans-serif' }}>
                  {stat.value}
                </div>
                <div className="text-xs text-muted-foreground">{stat.label}</div>
                <div className="text-xs mt-0.5" style={{ color: T.textS }}>{stat.sub}</div>
              </Card>
            ))}
          </div>
        )}

        {/* Time Saved Banner */}
        {!loading && timeSavedMinutes > 0 && (
          <div 
            className="mb-8 p-4 rounded-2xl flex items-center gap-3"
            style={{ 
              background: 'rgba(249, 115, 22, 0.05)',
              border: '1px solid rgba(249, 115, 22, 0.2)',
            }}
          >
            <div 
              className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(249, 115, 22, 0.1)' }}
            >
              <Sparkles className="w-5 h-5" style={{ color: T.orange }} />
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

        {/* Meetings List - Prototype Style Cards */}
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-20 rounded-2xl" />
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
          <div className="space-y-2">
            {meetings.map((meeting) => {
              const insight = insightCounts[meeting.id];
              const attendeeCount = getAttendeeCount(meeting);
              const isProcessing = meeting.status === 'processing';
              
              return (
                <Link key={meeting.id} to={`/meeting/${meeting.id}`}>
                  <Card hover className="group">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4 flex-1">
                        {/* Icon */}
                        <div 
                          className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                          style={{ 
                            background: isProcessing 
                              ? 'rgba(59, 130, 246, 0.1)' 
                              : 'rgba(249, 115, 22, 0.08)',
                          }}
                        >
                          {isProcessing ? (
                            <div 
                              className="w-2.5 h-2.5 rounded-full animate-pulse"
                              style={{ background: T.blue }} 
                            />
                          ) : (
                            <FileText size={18} style={{ color: T.orangeL }} />
                          )}
                        </div>
                        
                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span 
                              className="font-semibold text-foreground truncate"
                              style={{ fontFamily: 'Outfit, sans-serif', fontSize: 15 }}
                            >
                              {meeting.title}
                            </span>
                          </div>
                          <div className="flex gap-2 items-center flex-wrap">
                            <StatusBadge status={meeting.status || 'scheduled'} />
                            <SourceBadge source={meeting.source === 'bot' ? 'Bot' : 'Extension'} />
                            <LanguageBadge language="EN" />
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(meeting.start_time), 'MMM d')} · {formatDuration(meeting.duration_seconds)}
                            </span>
                          </div>
                        </div>
                      </div>
                      
                      {/* Right side stats */}
                      <div className="flex items-center gap-4 flex-shrink-0">
                        {meeting.status === 'completed' && insight && (
                          <div className="flex gap-3 text-xs text-muted-foreground">
                            {attendeeCount > 0 && (
                              <span className="flex items-center gap-1">
                                <Users size={12} /> {attendeeCount}
                              </span>
                            )}
                            <span className="flex items-center gap-1">
                              <CheckCircle2 size={12} /> {insight.action_items_count}
                            </span>
                            <span className="flex items-center gap-1">
                              <Zap size={12} /> {insight.decisions_count}
                            </span>
                          </div>
                        )}
                        <ChevronRight 
                          size={16} 
                          className="opacity-0 group-hover:opacity-100 transition-opacity"
                          style={{ color: T.textM }} 
                        />
                      </div>
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
