import { useEffect, useState, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { RecordingButton } from '@/components/dashboard/RecordingButton';
import { ExtensionStatus } from '@/components/dashboard/ExtensionStatus';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Meeting } from '@/types/meeting';
import { Clock, ChevronRight, Mic, Users, CheckCircle2, Globe, Bot, FileText, Chrome, Zap } from 'lucide-react';
import { Link } from 'react-router-dom';
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

// ─── Badge (prototype exact) ───
function Badge({ children, color, bg }: { children: React.ReactNode; color: string; bg: string }) {
  return (
    <span style={{
      padding: '3px 10px', borderRadius: 100, fontSize: 11, fontWeight: 600,
      color, background: bg, letterSpacing: '0.02em',
      display: 'inline-flex', alignItems: 'center', gap: 4,
    }}>
      {children}
    </span>
  );
}

// ─── StatusBadge (prototype exact) ───
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    completed: { bg: '#FFF7ED', color: '#C2410C', label: 'Completed' },
    processing: { bg: '#DBEAFE', color: '#1D4ED8', label: 'Processing' },
    recording: { bg: '#DCFCE7', color: '#15803D', label: 'Recording' },
    failed: { bg: '#FEE2E2', color: '#B91C1C', label: 'Failed' },
    scheduled: { bg: 'rgba(168,168,168,0.1)', color: '#A8A29E', label: 'Scheduled' },
  };
  const s = map[status] || map.scheduled;
  return (
    <Badge color={s.color} bg={s.bg}>
      {status === 'recording' && (
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: T.green, animation: 'pulse 1.5s infinite' }} />
      )}
      {s.label}
    </Badge>
  );
}

// ─── SourceBadge (prototype exact) ───
function SourceBadge({ source }: { source: string }) {
  const isBot = source === 'bot' || source === 'recall_bot';
  const label = isBot ? 'Bot' : 'Extension';
  return (
    <Badge
      color={isBot ? T.purple : T.orangeL}
      bg={isBot ? 'rgba(168,85,247,0.12)' : 'rgba(249,115,22,0.1)'}
    >
      {isBot ? <Bot size={11} /> : <Chrome size={11} />}
      {label}
    </Badge>
  );
}

// ─── GradientBar (prototype exact) ───
function GradientBar() {
  return <div style={{ height: 3, background: T.gradient, borderRadius: 2 }} />;
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

  const stats = useMemo(() => {
    const totalMeetings = meetings.length;
    const totalDuration = meetings.reduce((sum, m) => sum + (m.duration_seconds || 0), 0);
    const transcriptCount = Object.keys(insightCounts).length;
    const completedCount = meetings.filter(m => m.status === 'completed').length;
    const languages = new Set(meetings.map(m => (m as any).language || 'en').filter(Boolean));
    
    return { totalMeetings, totalDuration, transcriptCount, completedCount, languageCount: Math.max(languages.size, 1) };
  }, [meetings, insightCounts]);

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

  const getSourceLabel = (source: string) => {
    switch (source) {
      case 'google_meet': return 'Google Meet';
      case 'zoom': return 'Zoom';
      case 'teams': return 'Teams';
      default: return 'Recording';
    }
  };

  return (
    <DashboardLayout>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 32px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
          <div>
            <h1 style={{
              fontFamily: 'Outfit, sans-serif', fontSize: 26, fontWeight: 600,
              color: T.text, marginBottom: 4, letterSpacing: '-0.02em',
            }}>
              Your Meetings
            </h1>
            <p style={{ color: T.textS, fontSize: 14 }}>
              {meetings.length} meetings · {Object.keys(insightCounts).length} summaries generated
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

        {/* Quick Stats — 4 column grid, icon top-left, big number, label below (prototype exact) */}
        {!loading && meetings.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 28 }}>
            {[
              { label: 'Total Meetings', value: stats.totalMeetings.toString(), sub: 'All time', icon: <Mic size={18} color={T.orangeL} /> },
              { label: 'Action Items', value: stats.transcriptCount.toString(), sub: `${stats.completedCount} completed`, icon: <CheckCircle2 size={18} color={T.green} /> },
              { label: 'Languages Used', value: stats.languageCount.toString(), sub: 'Auto-detected', icon: <Globe size={18} color={T.purple} /> },
              { label: 'Active Bots', value: meetings.filter(m => m.status === 'recording').length.toString(), sub: meetings.filter(m => m.status === 'recording').length > 0 ? 'Recording now' : 'Idle', icon: <Bot size={18} color={T.blue} /> },
            ].map((stat, i) => (
              <div
                key={i}
                style={{
                  background: T.bgCard, border: `1px solid ${T.border}`,
                  borderRadius: 16, padding: 18, transition: 'all 0.2s',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  {stat.icon}
                </div>
                <div style={{
                  fontFamily: 'Outfit, sans-serif', fontSize: 26, fontWeight: 700,
                  color: T.text, marginBottom: 2,
                }}>
                  {stat.value}
                </div>
                <div style={{ color: T.textM, fontSize: 12 }}>{stat.label}</div>
                <div style={{ color: T.textS, fontSize: 11, marginTop: 2 }}>{stat.sub}</div>
              </div>
            ))}
          </div>
        )}

        {/* Meeting cards */}
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-[76px] rounded-2xl" />
            ))}
          </div>
        ) : meetings.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '64px 0' }}>
            <Mic style={{ width: 48, height: 48, margin: '0 auto 16px', color: T.textM }} />
            <p style={{ fontSize: 16, fontWeight: 500, color: T.text, marginBottom: 4 }}>No meetings yet</p>
            <p style={{ fontSize: 14, maxWidth: 320, margin: '0 auto', color: T.textS }}>
              Click Record to capture your first meeting. Your AI-powered summaries will appear here.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {meetings.map((meeting) => (
              <Link
                key={meeting.id}
                to={`/meeting/${meeting.id}`}
                className="block"
                style={{ textDecoration: 'none' }}
              >
                <div
                  style={{
                    background: T.bgCard,
                    border: `1px solid ${T.border}`,
                    borderRadius: 16,
                    padding: 20,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = T.bgCardH;
                    e.currentTarget.style.borderColor = T.borderL;
                    e.currentTarget.style.transform = 'translateY(-1px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = T.bgCard;
                    e.currentTarget.style.borderColor = T.border;
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: 1, minWidth: 0 }}>
                      {/* Meeting icon */}
                      <div style={{
                        width: 42, height: 42, borderRadius: 12,
                        background: meeting.status === 'processing'
                          ? 'rgba(59,130,246,0.1)'
                          : 'rgba(249,115,22,0.08)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      }}>
                        {meeting.status === 'processing' ? (
                          <div style={{ width: 10, height: 10, borderRadius: '50%', background: T.blue, animation: 'pulse 1.5s infinite' }} />
                        ) : (
                          <FileText size={18} color={T.orangeL} />
                        )}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <span style={{
                            fontFamily: 'Outfit, sans-serif', fontSize: 15, fontWeight: 600,
                            color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const,
                          }}>
                            {meeting.title}
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' as const }}>
                          <StatusBadge status={meeting.status || 'scheduled'} />
                          <SourceBadge source={meeting.source || 'manual'} />
                          {(meeting as any).language && (
                            <Badge color={T.textS} bg="rgba(168,168,168,0.08)">
                              <Globe size={10} /> {(meeting as any).language}
                            </Badge>
                          )}
                          <span style={{ color: T.textM, fontSize: 12 }}>
                            {getSourceLabel(meeting.source)} · {format(new Date(meeting.start_time), 'MMM d')} {format(new Date(meeting.start_time), 'h:mm a')}
                            {meeting.duration_seconds ? ` · ${formatDuration(meeting.duration_seconds)}` : ''}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Right side stats + chevron */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
                      {meeting.status === 'completed' && (
                        <div style={{ display: 'flex', gap: 12, color: T.textM, fontSize: 12 }}>
                          {meeting.duration_seconds && (
                            <span style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                              <Clock size={12} /> {formatDuration(meeting.duration_seconds)}
                            </span>
                          )}
                          {insightCounts[meeting.id] && (
                            <span style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                              <Zap size={12} /> Summary
                            </span>
                          )}
                        </div>
                      )}
                      <ChevronRight size={16} color={T.textM} />
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
