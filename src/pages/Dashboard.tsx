import { useEffect, useState, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { RecordingButton } from '@/components/dashboard/RecordingButton';

import { DigestSettings } from '@/components/dashboard/DigestSettings';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Meeting } from '@/types/meeting';
import { Clock, ChevronRight, Mic, Users, CheckCircle2, Globe, Bot, FileText, Zap, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useThemeTokens } from '@/lib/theme';

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

// ─── Badge ───
function Badge({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide',
      className
    )}>
      {children}
    </span>
  );
}

// ─── StatusBadge ───
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { className: string; label: string }> = {
    completed: { className: 'bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-400', label: 'Completed' },
    processing: { className: 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400', label: 'Processing' },
    recording: { className: 'bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-400', label: 'Recording' },
    failed: { className: 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400', label: 'Failed' },
    scheduled: { className: 'bg-muted text-muted-foreground', label: 'Scheduled' },
  };
  const s = map[status] || map.scheduled;
  return (
    <Badge className={s.className}>
      {status === 'recording' && (
        <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
      )}
      {s.label}
    </Badge>
  );
}

// ─── SourceBadge ───
function SourceBadge({ source }: { source: string }) {
  return (
    <Badge className="bg-purple-500/10 text-purple-500">
      <Bot size={11} />
      Bot
    </Badge>
  );
}

// ─── GradientBar ───
function GradientBar() {
  return <div className="h-[3px] rounded-sm bg-gradient-to-r from-orange-500 to-amber-500" />;
}

export default function Dashboard() {
  const T = useThemeTokens();
  const { user, session } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [insightCounts, setInsightCounts] = useState<Record<string, boolean>>({});
  const [digestSending, setDigestSending] = useState(false);
  const [showDigestSettings, setShowDigestSettings] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const aliveRef = useRef(true);

  const prefillMeeting = (location.state as { prefillMeeting?: PrefillMeeting })?.prefillMeeting;

  const withTimeout = <T,>(promise: Promise<T>, ms: number, label: string): Promise<T> => {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      promise
        .then((v) => {
          clearTimeout(t);
          resolve(v);
        })
        .catch((e) => {
          clearTimeout(t);
          reject(e);
        });
    });
  };

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setFetchError(null);

    const checkOnboardingAndFetch = async () => {
      try {
        const { data: profile, error: profileError } = await withTimeout(
          supabase
            .from('profiles')
            .select('onboarding_completed')
            .eq('user_id', user.id)
            .maybeSingle(),
          25_000,
          'Profile load'
        );

        if (!aliveRef.current) return;

        if (profileError) {
          console.error('[Dashboard] Profile fetch:', profileError);
        }

        if (profile && !profile.onboarding_completed) {
          navigate('/onboarding');
          return;
        }

        const { data, error } = await withTimeout(
          supabase
            .from('meetings')
            .select('*')
            .eq('user_id', user.id)
            .order('start_time', { ascending: false }),
          25_000,
          'Meetings load'
        );

        if (!aliveRef.current) return;

        if (error) {
          console.error('[Dashboard] Meetings fetch:', error);
          setFetchError(error.message || 'Could not load meetings');
          setMeetings([]);
          return;
        }

        if (data) {
          setMeetings(data as Meeting[]);

          if (data.length > 0) {
            const { data: insights, error: insightsError } = await withTimeout(
              supabase
                .from('meeting_insights')
                .select('meeting_id')
                .in('meeting_id', data.map((m) => m.id)),
              25_000,
              'Insights load'
            );

            if (!aliveRef.current) return;

            if (insightsError) {
              console.error('[Dashboard] Insights fetch:', insightsError);
            } else if (insights) {
              const counts: Record<string, boolean> = {};
              insights.forEach((i) => {
                counts[i.meeting_id] = true;
              });
              setInsightCounts(counts);
            }
          }
        }
      } catch (err) {
        console.error('[Dashboard] Failed to fetch meetings:', err);
        if (aliveRef.current) {
          setFetchError(err instanceof Error ? err.message : 'Could not load meetings');
          setMeetings([]);
        }
      } finally {
        if (aliveRef.current) setLoading(false);
      }
    };

    void checkOnboardingAndFetch();

    const channel = supabase
      .channel(`meetings-changes-${user.id}`)
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
      void supabase.removeChannel(channel);
    };
  }, [user, navigate]);

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

  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

  const handleSendDigest = async () => {
    if (!user || !session?.access_token) return;
    
    setDigestSending(true);
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('email')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!profile?.email) {
        alert('No email found in profile');
        return;
      }

      const response = await fetch(`${SUPABASE_URL}/functions/v1/generate-digest-report`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${session.access_token}`, 
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify({
          user_id: user.id,
          frequency: 'manual',
          recipient_emails: [profile.email],
        }),
      });

      const data = await response.json();
      if (data.success) {
        alert(`Digest sent! (${data.meetings_count} meetings)`);
      } else {
        alert('Error: ' + (data.error || 'Failed to send'));
      }
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setDigestSending(false);
    }
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
      <div className="mx-auto max-w-[1200px] px-6 py-8 md:px-10 md:py-10">
        {/* Welcome message */}
        <p className="text-sm text-muted-foreground mb-6">
          Welcome back, {user?.email?.split('@')[0] || 'User'}
        </p>

        {/* Header: Meetings title + Record button */}
        <div className="flex items-center justify-between mb-7">
          <div>
            <h1 className="text-3xl font-semibold tracking-[-0.02em] text-foreground font-heading md:text-[2rem]">
              Meetings
            </h1>
            <p className="text-[13px] text-muted-foreground mt-1">
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


        {fetchError && !loading && (
          <div
            role="alert"
            className="mb-6 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3.5 text-sm text-destructive dark:text-red-200"
          >
            {fetchError}. Check your connection and that the app is pointed at the correct Supabase project.
          </div>
        )}

        {/* Stats Row: 3 columns */}
        {!loading && meetings.length > 0 && (
          <>
            <div className="grid grid-cols-1 gap-4 mb-6 sm:grid-cols-3">
              {/* Meetings Count */}
              <div className="rounded-[14px] border border-border bg-card p-6 shadow-sm">
                <div className="text-[2rem] font-bold text-foreground font-heading tabular-nums">
                  {meetings.length}
                </div>
                <div className="text-[13px] text-muted-foreground mt-1">
                  Meetings
                </div>
              </div>

              <div className="rounded-[14px] border border-border bg-card p-6 shadow-sm">
                <div className="text-[2rem] font-bold text-foreground font-heading tabular-nums">
                  {(() => {
                    const totalSecs = meetings.reduce((acc, m) => acc + (m.duration_seconds || 0), 0);
                    const hours = Math.floor(totalSecs / 3600);
                    const mins = Math.floor((totalSecs % 3600) / 60);
                    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
                  })()}
                </div>
                <div className="text-[13px] text-muted-foreground mt-1">
                  Recorded
                </div>
              </div>

              <div className="rounded-[14px] border border-border bg-card p-6 shadow-sm">
                <div className="text-[2rem] font-bold text-foreground font-heading tabular-nums">
                  {meetings.filter(m => m.summary).length}
                </div>
                <div className="text-[13px] text-muted-foreground mt-1">
                  Summaries
                </div>
              </div>
            </div>

            {/* Time Saved Banner */}
            <div className="mb-8 flex items-center gap-3.5 rounded-xl border border-green-500/20 bg-green-500/[0.08] px-5 py-4 dark:bg-green-500/10">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-500/15">
                <Sparkles className="h-5 w-5 shrink-0 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <div className="text-[15px] font-semibold text-foreground font-heading">
                  ~{(() => {
                    const totalSecs = meetings.reduce((acc, m) => acc + (m.duration_seconds || 0), 0);
                    const totalMins = Math.round(totalSecs / 60);
                    const saved = Math.round(totalMins * 0.25);
                    const hours = Math.floor(saved / 60);
                    const mins = saved % 60;
                    return hours > 0 ? `${hours}h ${mins}m saved` : `${mins}m saved`;
                  })()}
                </div>
                <div className="text-[13px] text-muted-foreground mt-0.5">
                  Estimated time saved on meeting summaries
                </div>
              </div>
            </div>

            {/* Recent Meetings Label */}
            <div className="mb-4 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Recent Meetings
            </div>
          </>
        )}

        {/* Meeting cards */}
        {loading ? (
          <div className="flex min-h-[280px] flex-col items-center justify-center gap-4 rounded-2xl border border-border bg-muted/20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-orange-500" />
            <p className="text-sm text-muted-foreground">Loading meetings…</p>
          </div>
        ) : meetings.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-6 py-16 text-center">
            <Mic className="mx-auto mb-4 h-12 w-12 text-muted-foreground" strokeWidth={1.5} />
            <p className="text-base font-medium text-foreground">No meetings yet</p>
            <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
              Click Record to capture your first meeting. Summaries and insights will show up here.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {meetings.map((meeting) => (
              <Link
                key={meeting.id}
                to={`/meeting/${meeting.id}`}
                className="group block no-underline"
              >
                <div className="cursor-pointer rounded-2xl border border-border bg-card p-5 shadow-sm transition-all duration-200 hover:-translate-y-px hover:border-orange-500/20 hover:bg-muted/50 hover:shadow-md dark:hover:bg-muted/30">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      {/* Meeting icon */}
                      <div className={cn(
                        'flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl',
                        meeting.status === 'processing' ? 'bg-blue-500/10' : 'bg-accent/[0.08]'
                      )}>
                        {meeting.status === 'processing' ? (
                          <div className="h-2.5 w-2.5 rounded-full bg-blue-500 animate-pulse" />
                        ) : (
                          <FileText size={18} className="text-orange-400 dark:text-orange-300" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[15px] font-semibold text-foreground font-heading truncate">
                            {meeting.title}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusBadge status={meeting.status || 'scheduled'} />
                          <SourceBadge source={meeting.source || 'manual'} />
                          {(meeting as any).language && (
                            <Badge className="bg-muted text-muted-foreground">
                              <Globe size={10} /> {(meeting as any).language}
                            </Badge>
                          )}
                          <span className="text-xs text-muted-foreground">
                            {getSourceLabel(meeting.source)} · {format(new Date(meeting.start_time), 'MMM d')} {format(new Date(meeting.start_time), 'h:mm a')}
                            {meeting.duration_seconds ? ` · ${formatDuration(meeting.duration_seconds)}` : ''}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Right side stats + chevron */}
                    <div className="flex items-center gap-4 shrink-0">
                      {meeting.status === 'completed' && (
                        <div className="hidden sm:flex gap-3 text-xs text-muted-foreground">
                          {meeting.duration_seconds && (
                            <span className="flex items-center gap-0.5">
                              <Clock size={12} /> {formatDuration(meeting.duration_seconds)}
                            </span>
                          )}
                          {insightCounts[meeting.id] && (
                            <span className="flex items-center gap-0.5">
                              <Zap size={12} /> Summary
                            </span>
                          )}
                        </div>
                      )}
                      <ChevronRight size={16} className="shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
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
