import { useEffect, useState, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { RecordingButton } from '@/components/dashboard/RecordingButton';
import { DigestSettings } from '@/components/dashboard/DigestSettings';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Meeting } from '@/types/meeting';
import { Clock, ChevronRight, Mic, Users, CheckCircle2, Globe, Bot, FileText, Chrome, Zap, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
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
        .single();

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
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 40px' }}>
        {/* Welcome message */}
        <p style={{
          fontFamily: 'DM Sans, sans-serif',
          fontSize: 14,
          color: '#78716C',
          margin: '0 0 24px 0',
          fontWeight: 400,
        }}>
          Welcome back, {user?.email?.split('@')[0] || 'User'}
        </p>

        {/* Header — Meetings title + Record button */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
          <div>
            <h1 style={{
              fontFamily: 'Outfit, sans-serif',
              fontSize: 32,
              fontWeight: 600,
              color: '#FAFAF9',
              margin: 0,
              letterSpacing: '-0.02em',
            }}>
              Meetings
            </h1>
            <p style={{
              fontFamily: 'DM Sans, sans-serif',
              fontSize: 13,
              color: '#78716C',
              margin: '4px 0 0 0',
            }}>
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
            style={{
              marginBottom: 24,
              padding: '14px 18px',
              borderRadius: 12,
              border: '1px solid rgba(239,68,68,0.35)',
              background: 'rgba(239,68,68,0.08)',
              fontFamily: 'DM Sans, sans-serif',
              fontSize: 14,
              color: '#FCA5A5',
            }}
          >
            {fetchError}. Check your connection and that the app is pointed at the correct Supabase project.
          </div>
        )}

        {/* Stats Row — 3 columns */}
        {!loading && meetings.length > 0 && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
              {/* Meetings Count */}
              <div style={{
                background: '#1C1917',
                border: '1px solid #292524',
                borderRadius: 14,
                padding: 24,
              }}>
                <div style={{
                  fontFamily: 'Outfit, sans-serif',
                  fontSize: 32,
                  fontWeight: 700,
                  color: '#FAFAF9',
                  margin: 0,
                }}>
                  {meetings.length}
                </div>
                <div style={{
                  fontFamily: 'DM Sans, sans-serif',
                  fontSize: 13,
                  color: '#78716C',
                  margin: '4px 0 0 0',
                }}>
                  Meetings
                </div>
              </div>

              {/* Recorded Time */}
              <div style={{
                background: '#1C1917',
                border: '1px solid #292524',
                borderRadius: 14,
                padding: 24,
              }}>
                <div style={{
                  fontFamily: 'Outfit, sans-serif',
                  fontSize: 32,
                  fontWeight: 700,
                  color: '#FAFAF9',
                  margin: 0,
                }}>
                  {(() => {
                    const totalSecs = meetings.reduce((acc, m) => acc + (m.duration_seconds || 0), 0);
                    const hours = Math.floor(totalSecs / 3600);
                    const mins = Math.floor((totalSecs % 3600) / 60);
                    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
                  })()}
                </div>
                <div style={{
                  fontFamily: 'DM Sans, sans-serif',
                  fontSize: 13,
                  color: '#78716C',
                  margin: '4px 0 0 0',
                }}>
                  Recorded
                </div>
              </div>

              {/* Summaries Count */}
              <div style={{
                background: '#1C1917',
                border: '1px solid #292524',
                borderRadius: 14,
                padding: 24,
              }}>
                <div style={{
                  fontFamily: 'Outfit, sans-serif',
                  fontSize: 32,
                  fontWeight: 700,
                  color: '#FAFAF9',
                  margin: 0,
                }}>
                  {meetings.filter(m => m.summary).length}
                </div>
                <div style={{
                  fontFamily: 'DM Sans, sans-serif',
                  fontSize: 13,
                  color: '#78716C',
                  margin: '4px 0 0 0',
                }}>
                  Summaries
                </div>
              </div>
            </div>

            {/* Time Saved Banner */}
            <div style={{
              background: 'rgba(34, 197, 94, 0.06)',
              border: '1px solid rgba(34, 197, 94, 0.12)',
              borderRadius: 12,
              padding: '16px 20px',
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              marginBottom: 32,
            }}>
              <div style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                background: 'rgba(34, 197, 94, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <Sparkles size={20} color="#22C55E" style={{ flexShrink: 0 }} />
              </div>
              <div>
                <div style={{
                  fontFamily: 'Outfit, sans-serif',
                  fontSize: 15,
                  fontWeight: 600,
                  color: '#FAFAF9',
                  margin: 0,
                }}>
                  ~{(() => {
                    const totalSecs = meetings.reduce((acc, m) => acc + (m.duration_seconds || 0), 0);
                    const totalMins = Math.round(totalSecs / 60);
                    const saved = Math.round(totalMins * 0.25);
                    const hours = Math.floor(saved / 60);
                    const mins = saved % 60;
                    return hours > 0 ? `${hours}h ${mins}m saved` : `${mins}m saved`;
                  })()}
                </div>
                <div style={{
                  fontFamily: 'DM Sans, sans-serif',
                  fontSize: 13,
                  color: '#78716C',
                  margin: '2px 0 0 0',
                }}>
                  Time saved on meeting summaries with AI
                </div>
              </div>
            </div>

            {/* Recent Meetings Label */}
            <div style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: '#78716C',
              marginBottom: 16,
            }}>
              Recent Meetings
            </div>
          </>
        )}

        {/* Meeting cards */}
        {loading ? (
          <div style={{
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            minHeight: 300, gap: 16
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              border: '2px solid #292524',
              borderTopColor: '#F97316',
              animation: 'spin 0.8s linear infinite'
            }} />
            <p style={{ color: '#78716C', fontSize: 13, fontFamily: 'DM Sans, sans-serif' }}>
              Loading meetings...
            </p>
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
