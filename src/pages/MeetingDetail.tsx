import { useEffect, useState } from 'react';
import { formatIST } from '@/lib/time';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import { SectionTabs } from '@/components/ui/SectionTabs';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { EmailReportSelector } from '@/components/dashboard/EmailReportSelector';
import { MeetingMetrics } from '@/components/meeting/MeetingMetrics';
import { ShareLinkDialog } from '@/components/meeting/ShareLinkDialog';
import { InsightSection, InsightItem } from '@/components/meeting/InsightSection';
import { RecordingPlayer } from '@/components/meeting/RecordingPlayer';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Meeting, asMeeting, Transcript, MeetingInsights, StrategicInsight, SpeakerHighlight, ActionItem, FollowUp, TimelineEntry, MeetingFacts, CoachingReport, CoachingVerdict, CoachingFlag } from '@/types/meeting';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { 
  ArrowLeft, Calendar, Clock, Loader2, ChevronRight, Trash2, Users, 
  Lightbulb, AlertTriangle, HelpCircle, RefreshCw, Zap, CheckCircle2, 
  FileText, Globe, Mail, Languages, Bot, Video, Target, EyeOff, Eye, Hash,
  CalendarPlus, PenLine, Copy, ExternalLink, Pencil, Link2
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';

interface SpeakerSegment {
  speaker: string;
  text: string;
  start?: number;
  end?: number;
  /** Privacy zone: 'pre' | 'meeting' | 'post'. Untagged rows are 'meeting'. */
  zone?: string;
  language?: string;
}

interface Attendee {
  email: string;
  displayName?: string | null;
  responseStatus?: string | null;
  organizer?: boolean;
}

// All reads for the meeting-detail page, bundled into one cached query.
interface MeetingDetailData {
  meeting: Meeting;
  attendees: Attendee[];
  transcript: Transcript | null;
  speakerSegments: SpeakerSegment[];
  insights: MeetingInsights | null;
  emailMessages: any[];
}

// Non-terminal pipeline statuses. The backend moves a meeting through
// joining -> in_call -> recording -> processing -> (transcribing) -> completed,
// so anything in this list means "still working", not "never started".
const IN_PROGRESS_STATUSES = ['joining', 'in_call', 'recording', 'processing', 'transcribing'];

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

// ─── Clean modern badges ───
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { color: string; tint: string; label: string }> = {
    completed: { color: 'hsl(var(--success))', tint: 'color-mix(in oklch, hsl(var(--success)) 14%, transparent)', label: 'Completed' },
    processing: { color: 'hsl(var(--warning))', tint: 'color-mix(in oklch, hsl(var(--warning)) 14%, transparent)', label: 'Processing' },
    joining: { color: 'hsl(var(--warning))', tint: 'color-mix(in oklch, hsl(var(--warning)) 14%, transparent)', label: 'Joining' },
    in_call: { color: 'hsl(var(--warning))', tint: 'color-mix(in oklch, hsl(var(--warning)) 14%, transparent)', label: 'In call' },
    transcribing: { color: 'hsl(var(--warning))', tint: 'color-mix(in oklch, hsl(var(--warning)) 14%, transparent)', label: 'Transcribing' },
    recording: { color: 'var(--ember)', tint: 'color-mix(in oklch, var(--ember) 12%, transparent)', label: 'Recording' },
    failed: { color: 'hsl(var(--destructive))', tint: 'color-mix(in oklch, hsl(var(--destructive)) 12%, transparent)', label: 'Failed' },
    cancelled: { color: 'hsl(var(--destructive))', tint: 'color-mix(in oklch, hsl(var(--destructive)) 12%, transparent)', label: 'Cancelled' },
    scheduled: { color: 'var(--ink-soft)', tint: 'color-mix(in oklch, var(--ink) 8%, transparent)', label: 'Scheduled' },
  };
  const s = map[status] || map.scheduled;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11.5px] font-medium"
      style={{ color: s.color, background: s.tint }}
    >
      {status === 'recording' && <span className="status-dot recording" style={{ width: 6, height: 6 }} />}
      {s.label}
    </span>
  );
}

function SourceBadge({ source }: { source: string }) {
  const label = source === 'google_meet' ? 'Google Meet' : source === 'zoom' ? 'Zoom' : source === 'teams' ? 'Teams' : 'Recording';
  return (
    <span
      className="inline-flex items-center gap-1 text-[12.5px]"
      style={{ color: 'var(--ink-mid)' }}
    >
      <Bot size={12} strokeWidth={1.75} />
      {label}
    </span>
  );
}

function ShareButton({ icon: Icon, label, onClick }: { icon: React.ElementType; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rule-hover inline-flex h-11 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium md:h-auto md:py-1.5"
      style={{
        border: '1px solid var(--rule)',
        background: 'var(--paper-card)',
        color: 'var(--ink)',
      }}
    >
      <Icon size={13} strokeWidth={1.75} />
      {label}
    </button>
  );
}

function formatTimelineTime(seconds: number): string {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

const LANGUAGE_LABELS: Record<string, string> = { en: 'English', hi: 'Hindi' };

/** "English 88% · Hindi 12%" from meetings.languages. */
function formatLanguageMix(mix: Record<string, number>): string {
  return Object.entries(mix)
    .sort((a, b) => b[1] - a[1])
    .map(([lang, share]) => `${LANGUAGE_LABELS[lang] ?? lang} ${Math.round(share * 100)}%`)
    .join(' · ');
}

/** "Tue, Sep 1" from a resolved ISO due date. */
function formatDueDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** Clickable [m:ss] chip that jumps the recording tab to that moment. */
function TsLink({ ts, onJump }: { ts?: number | null; onJump: (ts: number) => void }) {
  if (typeof ts !== 'number' || !Number.isFinite(ts)) return null;
  return (
    <button
      type="button"
      onClick={() => onJump(ts)}
      className="font-mono text-[11px] font-semibold transition-opacity hover:opacity-70"
      style={{ color: 'var(--ember)' }}
      title="Jump to this moment in the recording"
    >
      {formatTimelineTime(ts)}
    </button>
  );
}

/** Inline sentiment-over-time sparkline (prospect side), from the coaching pass. */
function SentimentSparkline({ timeline }: { timeline: { t: number; score: number; note?: string }[] }) {
  if (!timeline || timeline.length < 2) return null;
  const w = 560;
  const h = 96;
  const pad = 8;
  const maxT = Math.max(...timeline.map((p) => p.t)) || 1;
  const x = (t: number) => pad + (t / maxT) * (w - pad * 2);
  const y = (score: number) => pad + ((1 - score) / 2) * (h - pad * 2);
  const points = timeline.map((p) => `${x(p.t).toFixed(1)},${y(p.score).toFixed(1)}`).join(' ');
  const notes = timeline.filter((p) => p.note);
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label="Sentiment over time">
        <line x1={pad} x2={w - pad} y1={y(0)} y2={y(0)} stroke="var(--rule)" strokeDasharray="3 3" />
        <polyline points={points} fill="none" stroke="var(--ember)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {notes.map((p, i) => (
          <circle key={i} cx={x(p.t)} cy={y(p.score)} r={3.5} fill="var(--ember)" />
        ))}
      </svg>
      {notes.length > 0 && (
        <ul className="mt-2 space-y-1">
          {notes.map((p, i) => (
            <li key={i} className="text-xs text-muted-foreground">
              <span className="font-mono font-semibold" style={{ color: 'var(--ember)' }}>{formatTimelineTime(p.t)}</span>
              {' — '}{p.note}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ProtoCard({ children, style, className }: { children: React.ReactNode; style?: React.CSSProperties; className?: string }) {
  return (
    <div
      className={cn('rounded-xl p-6', className)}
      style={{
        background: 'var(--paper-card)',
        border: '1px solid var(--rule)',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// Legacy — now a no-op (was the orange gradient bar)
function GradientBar() {
  return null;
}

export default function MeetingDetail() {
  const { id } = useParams<{ id: string }>();
  const { user, session } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [deleting, setDeleting] = useState(false);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [searchParams] = useSearchParams();
  const initialSeek = (() => {
    // No ?t= at all means "no deep link" — Number(null) is 0, which would read
    // as a valid seek and open every meeting on the Recording tab.
    const raw = searchParams.get('t');
    if (raw === null || raw.trim() === '') return null;
    const t = Number(raw);
    return Number.isFinite(t) && t >= 0 ? Math.floor(t) : null;
  })();
  const [activeTab, setActiveTab] = useState(initialSeek !== null ? 'recording' : 'summary');
  const [summaryLang, setSummaryLang] = useState('English');
  const [seekSeconds, setSeekSeconds] = useState<number | null>(initialSeek);
  const [showInternal, setShowInternal] = useState(false);

  // Deep link target: every timestamp on this page jumps the recording here.
  const jumpToRecording = (ts: number) => {
    setSeekSeconds(Math.max(0, Math.floor(ts)));
    setActiveTab('recording');
  };

  // Authenticated call to one of the meeting-action edge functions.
  const callFn = async (name: string, body: Record<string, unknown>) => {
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    if (!token) throw new Error('Not signed in');
    const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(json?.error || `${name} failed (${res.status})`) as Error & { code?: string };
      err.code = json?.code;
      throw err;
    }
    return json;
  };
  const [regenerating, setRegenerating] = useState(false);
  const [draftOpen, setDraftOpen] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [draft, setDraft] = useState<{ subject: string; body: string; to?: string[] } | null>(null);
  const [calendarBusy, setCalendarBusy] = useState<number | null>(null);
  const [inviteAttendees, setInviteAttendees] = useState(false);
  const [renameTarget, setRenameTarget] = useState<{ from: string; value: string } | null>(null);
  const [renaming, setRenaming] = useState(false);

  const refreshMeeting = () => queryClient.invalidateQueries({ queryKey: ['meeting-detail', id, user?.id] });

  const handleRegenerate = async () => {
    setRegenerating(true);
    try {
      await callFn('regenerate-insights', { meeting_id: id });
      await refreshMeeting();
      toast({ title: 'Insights regenerated', description: 'Facts, coaching and the summary were rebuilt from the transcript.' });
    } catch (e) {
      toast({ title: 'Could not regenerate', description: e instanceof Error ? e.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setRegenerating(false);
    }
  };

  const handleDraft = async (force = false) => {
    setDraftOpen(true);
    if (draft && !force) return;
    setDrafting(true);
    try {
      const res = await callFn('draft-followup-email', { meeting_id: id, force });
      setDraft(res.draft);
    } catch (e) {
      toast({ title: 'Could not draft the email', description: e instanceof Error ? e.message : 'Unknown error', variant: 'destructive' });
      setDraftOpen(false);
    } finally {
      setDrafting(false);
    }
  };

  const handleAddToCalendar = async (index: number, date: string) => {
    setCalendarBusy(index);
    try {
      const res = await callFn('create-followup-event', {
        meeting_id: id, date, action_index: index, invite_attendees: inviteAttendees,
      });
      await refreshMeeting();
      toast({ title: 'Follow-up added to your calendar', description: inviteAttendees ? `${res.invited} attendee(s) invited.` : 'No invitations were sent.' });
    } catch (e) {
      const code = (e as { code?: string })?.code;
      toast({
        title: code === 'NEEDS_RECONNECT' ? 'Reconnect Google Calendar' : 'Could not create the event',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
      if (code === 'NEEDS_RECONNECT') setTimeout(() => navigate('/settings'), 1800);
    } finally {
      setCalendarBusy(null);
    }
  };

  const handleRename = async () => {
    if (!renameTarget) return;
    const to = renameTarget.value.trim();
    if (!to || to === renameTarget.from) { setRenameTarget(null); return; }
    setRenaming(true);
    try {
      const res = await callFn('rename-speaker', { meeting_id: id, from: renameTarget.from, to });
      await refreshMeeting();
      toast({ title: `Renamed to ${to}`, description: `${res.segments_renamed} transcript segments and every derived view were updated.` });
      setRenameTarget(null);
    } catch (e) {
      toast({ title: 'Could not rename speaker', description: e instanceof Error ? e.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setRenaming(false);
    }
  };

  // All meeting-detail reads in one cached query, so revisiting a meeting
  // renders instantly from cache instead of refetching every mount.
  const { data, isLoading: loading } = useQuery({
    queryKey: ['meeting-detail', id, user?.id],
    enabled: !!user && !!id,
    queryFn: async (): Promise<MeetingDetailData | null> => {
      const { data: meetingData } = await supabase
        .from('meetings')
        .select('*')
        .eq('id', id!)
        .eq('user_id', user!.id)
        .single();

      if (!meetingData) return null;

      const meeting = asMeeting(meetingData);
      let attendees: Attendee[] = [];
      if (meetingData.attendees && Array.isArray(meetingData.attendees)) {
        attendees = meetingData.attendees as unknown as Attendee[];
      }

      // Bot recordings don't populate attendees, but speakers are in the transcript.
      const { data: transcriptData } = await supabase
        .from('transcripts')
        .select('*')
        .eq('meeting_id', id!)
        .single();

      let transcript: Transcript | null = null;
      let speakerSegments: SpeakerSegment[] = [];
      if (transcriptData) {
        transcript = {
          ...transcriptData,
          speakers: (transcriptData.speakers as any) || [],
          word_timestamps: (transcriptData.word_timestamps as any) || [],
        } as Transcript;

        if (transcriptData.speakers && Array.isArray(transcriptData.speakers)) {
          const segments = transcriptData.speakers as unknown as SpeakerSegment[];
          speakerSegments = segments;
          // Derive attendees from speaker names if not already set
          if (!meetingData.attendees || (meetingData.attendees as any[]).length === 0) {
            const uniqueNames = [...new Set(segments.map((s) => s.speaker).filter(Boolean))];
            attendees = uniqueNames.map((name) => ({ email: '', displayName: name }));
          }
        }
      }

      const { data: insightsRows } = await supabase
        .from('meeting_insights')
        .select('*')
        .eq('meeting_id', id!)
        .order('created_at', { ascending: false })
        .limit(1);

      const insightsData = insightsRows?.[0] || null;
      let insights: MeetingInsights | null = null;
      if (insightsData) {
        insights = {
          ...insightsData,
          key_points: (insightsData.key_points as any) || [],
          action_items: (insightsData.action_items as any) || [],
          decisions: (insightsData.decisions as any) || [],
          risks: (insightsData.risks as any) || [],
          follow_ups: (insightsData.follow_ups as any) || [],
          strategic_insights: (insightsData.strategic_insights as any) || [],
          speaker_highlights: (insightsData.speaker_highlights as any) || [],
          open_questions: (insightsData.open_questions as any) || [],
          timeline_entries: (insightsData.timeline_entries as any) || [],
          meeting_metrics: (insightsData.meeting_metrics as any) || {},
          summary_short: insightsData.summary_short || '',
          summary_detailed: insightsData.summary_detailed || '',
        } as MeetingInsights;
      }

      const { data: emailMsgs } = await supabase
        .from('email_messages')
        .select('*')
        .eq('meeting_id', id!)
        .order('created_at', { ascending: false });

      return {
        meeting,
        attendees,
        transcript,
        speakerSegments,
        insights,
        emailMessages: emailMsgs ?? [],
      };
    },
  });

  const meeting = data?.meeting ?? null;
  const attendees = data?.attendees ?? [];
  const transcript = data?.transcript ?? null;
  const speakerSegments = data?.speakerSegments ?? [];
  const insights = data?.insights ?? null;
  const emailMessages = data?.emailMessages ?? [];

  // Listen for status updates via Supabase Realtime + a single backend
  // fallback call instead of hammering check-recall-status every 5 seconds.
  const meetingStatus = meeting?.status;
  const recallBotId = meeting?.recall_bot_id;
  useEffect(() => {
    if (!user || !id || !meetingStatus) return;
    const terminalStatuses = ['completed', 'failed', 'cancelled'];
    if (terminalStatuses.includes(meetingStatus)) return;

    // Subscribe to realtime changes on this meeting row; any update refreshes
    // the cached composite (which re-pulls transcript + insights on completion).
    const channel = supabase
      .channel(`meeting-status-${id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'meetings', filter: `id=eq.${id}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ['meeting-detail', id, user.id] });
        }
      )
      .subscribe();

    // Single backend fallback: call check-recall-status once after 30s,
    // then again every 60s — just in case the webhook was missed entirely.
    let fallbackCount = 0;
    const maxFallbacks = 10; // stop after ~10 minutes
    const callFallback = async () => {
      if (!recallBotId || fallbackCount >= maxFallbacks) return;
      fallbackCount++;
      try {
        const token = (await supabase.auth.getSession()).data.session?.access_token;
        if (token) {
          await fetch(`${SUPABASE_URL}/functions/v1/check-recall-status`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ meeting_id: id }),
          });
        }
      } catch {
        // Ignore fallback errors
      }
    };

    const initialTimeout = setTimeout(callFallback, 30_000);
    const fallbackInterval = setInterval(callFallback, 60_000);

    return () => {
      supabase.removeChannel(channel);
      clearTimeout(initialTimeout);
      clearInterval(fallbackInterval);
    };
  }, [user, id, meetingStatus, recallBotId, queryClient]);

  const handleDelete = async () => {
    if (!meeting || !user) return;
    setDeleting(true);
    try {
      await supabase.from('meeting_insights').delete().eq('meeting_id', meeting.id);
      await supabase.from('transcripts').delete().eq('meeting_id', meeting.id);
      if (meeting.audio_url) {
        await supabase.storage.from('recordings').remove([meeting.audio_url]);
      }
      const { error } = await supabase.from('meetings').delete().eq('id', meeting.id).eq('user_id', user.id);
      if (error) throw error;
      queryClient.removeQueries({ queryKey: ['meeting-detail', id] });
      queryClient.invalidateQueries({ queryKey: ['meetings', user.id] });
      toast({ title: 'Meeting deleted', description: 'The meeting and all related data have been removed.' });
      navigate('/dashboard');
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to delete meeting', variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  };

  const getInitials = (name?: string | null, email?: string) => {
    if (name) return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
    if (email) return email.slice(0, 2).toUpperCase();
    return '??';
  };

  const handleSendEmail = async (emailAddress: string) => {
    if (!meeting || !user || !session?.access_token) return;
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/send-email-report`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meeting_id: meeting.id,
          recipient_email: emailAddress,
        }),
      });
      const data = await response.json();
      if (data.success) {
        toast({ title: 'Sent', description: `Report sent to ${emailAddress}` });
      } else throw new Error(data.error || 'Failed to send');
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Failed to send email', variant: 'destructive' });
    }
  };

  const getPriorityColor = (priority?: string) => {
    switch (priority) {
      case 'high': return 'bg-destructive/10 text-destructive border-destructive/20';
      case 'medium': return 'bg-warning/10 text-warning border-warning/20';
      default: return 'bg-muted text-muted-foreground border-border';
    }
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return '';
    const mins = Math.floor(seconds / 60);
    return `${mins} min`;
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="mx-auto max-w-[960px] px-4 py-8 sm:px-6 md:px-10 md:py-14">
          <Skeleton className="mb-6 h-4 w-32" />
          <Skeleton className="mb-3 h-4 w-64" />
          <Skeleton className="mb-6 h-12 w-[80%]" />
          <Skeleton className="mb-2 h-4 w-48" />
          <div className="mt-10 space-y-4">
            <Skeleton className="h-32 rounded-xl" />
            <Skeleton className="h-48 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!meeting) {
    return (
      <DashboardLayout>
        <div className="mx-auto max-w-[960px] px-4 py-16 sm:px-6 md:px-8">
          <h1 className="text-[24px] font-semibold" style={{ color: 'var(--ink)', letterSpacing: '-0.01em' }}>
            Meeting not found
          </h1>
          <p className="mt-2 text-[14.5px]" style={{ color: 'var(--ink-mid)' }}>
            The meeting may have been deleted or the link is wrong.
          </p>
          <Link
            to="/dashboard"
            className="mt-5 inline-flex items-center gap-1.5 text-[13.5px] font-medium no-underline"
            style={{ color: 'var(--ember-deep)' }}
          >
            <ArrowLeft size={14} strokeWidth={1.75} /> Back to meetings
          </Link>
        </div>
      </DashboardLayout>
    );
  }

  const actionItemCount = insights?.action_items?.length || 0;

  const tabs = [
    { id: 'summary', label: 'Summary', icon: <Zap size={14} /> },
    { id: 'actions', label: `Actions (${actionItemCount})`, icon: <CheckCircle2 size={14} /> },
    ...(insights?.coaching ? [{ id: 'coaching', label: 'Coaching', icon: <Target size={14} /> }] : []),
    { id: 'transcript', label: 'Transcript', icon: <FileText size={14} /> },
    { id: 'recording', label: 'Recording', icon: <Video size={14} /> },
    { id: 'delivery', label: 'Delivery', icon: <Mail size={14} /> },
  ];

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-[960px] px-4 py-6 sm:px-6 md:px-8 md:py-10">
        <div className="mb-8">
          <Link
            to="/dashboard"
            className="mb-5 inline-flex items-center gap-1.5 text-[13px] no-underline transition-colors"
            style={{ color: 'var(--ink-mid)' }}
          >
            <ArrowLeft size={14} strokeWidth={1.75} />
            Back to meetings
          </Link>

          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <h1
                className="text-[28px] font-semibold leading-tight"
                style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}
              >
                {meeting.title}
              </h1>
              <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px]" style={{ color: 'var(--ink-mid)' }}>
                <StatusBadge status={meeting.status || 'scheduled'} />
                <span aria-hidden>·</span>
                <SourceBadge source={meeting.source || 'manual'} />
                <span aria-hidden>·</span>
                <span>{formatIST(new Date(meeting.start_time), 'MMM d, yyyy')}</span>
                <span aria-hidden>·</span>
                <span>{formatIST(new Date(meeting.start_time), 'h:mm a')}</span>
                {meeting.duration_seconds && (
                  <>
                    <span aria-hidden>·</span>
                    <span>{formatDuration(meeting.duration_seconds)}</span>
                  </>
                )}
                {(meeting.languages && Object.keys(meeting.languages).length > 0) ? (
                  <>
                    <span aria-hidden>·</span>
                    <span>{formatLanguageMix(meeting.languages)}</span>
                  </>
                ) : meeting.language ? (
                  <>
                    <span aria-hidden>·</span>
                    <span>{meeting.language}</span>
                  </>
                ) : null}
                {insights?.facts?.meeting_type && insights.facts.meeting_type !== 'other' && (
                  <>
                    <span aria-hidden>·</span>
                    <span className="capitalize">{insights.facts.meeting_type.replace(/_/g, ' ')}</span>
                  </>
                )}
              </div>
              {(meeting.status === 'failed' || meeting.status === 'cancelled') && meeting.error_message && (
                <p className="mt-2 text-[13px]" style={{ color: 'hsl(var(--destructive))' }}>
                  {meeting.error_message}
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {insights && (
                <>
                  <ShareButton icon={Mail} label="Email" onClick={() => setEmailDialogOpen(true)} />
                  <ShareButton icon={Link2} label="Share link" onClick={() => setShareDialogOpen(true)} />
                  {insights.facts && (
                    <ShareButton icon={PenLine} label="Draft follow-up" onClick={() => handleDraft(false)} />
                  )}
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <button
                        type="button"
                        disabled={regenerating}
                        className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors disabled:opacity-60"
                        style={{ border: '1px solid var(--rule)', background: 'var(--paper-card)', color: 'var(--ink)' }}
                      >
                        {regenerating ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} strokeWidth={1.75} />}
                        {regenerating ? 'Regenerating…' : 'Regenerate'}
                      </button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Regenerate insights?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Rebuilds the summary, extracted facts, action items and coaching from the stored transcript
                          using the current pipeline (no re-transcription). Speaker renames are kept. Takes about a minute.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleRegenerate}>Regenerate</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </>
              )}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button
                    type="button"
                    className="danger-hover inline-flex h-11 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium md:h-auto md:py-1.5"
                    style={{ color: 'var(--ink-soft)' }}
                  >
                    <Trash2 size={13} strokeWidth={1.75} /> Delete
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Meeting</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete this meeting, including its transcript, insights, and audio recording. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      {deleting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </div>

        {/* Follow-up email draft (facts-grounded) */}
        <AlertDialog open={draftOpen} onOpenChange={setDraftOpen}>
          <AlertDialogContent className="max-w-2xl">
            <AlertDialogHeader>
              <AlertDialogTitle>Follow-up email draft</AlertDialogTitle>
              <AlertDialogDescription>
                Written from the extracted facts only — their own words for what they need, the commitments both ways, and the follow-up time. Edit before sending.
              </AlertDialogDescription>
            </AlertDialogHeader>
            {drafting || !draft ? (
              <div className="flex items-center justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : (
              <div className="space-y-3">
                <div className="text-sm"><span className="text-muted-foreground">To:</span> {draft.to?.join(', ') || '—'}</div>
                <div className="text-sm font-medium text-foreground">{draft.subject}</div>
                <textarea
                  readOnly
                  value={draft.body}
                  rows={12}
                  className="w-full rounded-md p-3 text-sm leading-relaxed outline-none"
                  style={{ border: '1px solid var(--rule)', background: 'var(--paper-card)', color: 'var(--ink)' }}
                />
              </div>
            )}
            <AlertDialogFooter className="flex-wrap gap-2">
              <AlertDialogCancel>Close</AlertDialogCancel>
              {draft && !drafting && (
                <>
                  <button
                    type="button"
                    onClick={() => handleDraft(true)}
                    className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium"
                    style={{ border: '1px solid var(--rule)', background: 'var(--paper-card)', color: 'var(--ink)' }}
                  >
                    <RefreshCw size={13} strokeWidth={1.75} /> Redraft
                  </button>
                  <button
                    type="button"
                    onClick={async () => { await navigator.clipboard.writeText(`Subject: ${draft.subject}\n\n${draft.body}`); toast({ title: 'Copied to clipboard' }); }}
                    className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium"
                    style={{ border: '1px solid var(--rule)', background: 'var(--paper-card)', color: 'var(--ink)' }}
                  >
                    <Copy size={13} strokeWidth={1.75} /> Copy
                  </button>
                  <a
                    href={`mailto:${encodeURIComponent((draft.to ?? []).filter((t) => t.includes('@')).join(','))}?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body)}`}
                    className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium text-white"
                    style={{ background: 'var(--ember)' }}
                  >
                    <Mail size={13} strokeWidth={1.75} /> Open in mail
                  </a>
                </>
              )}
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Email Report Selector */}
        <EmailReportSelector
          open={emailDialogOpen}
          onOpenChange={setEmailDialogOpen}
          meetingTitle={meeting.title}
          userEmail={user?.email || undefined}
          onSend={handleSendEmail}
        />

        <ShareLinkDialog
          meetingId={meeting.id}
          open={shareDialogOpen}
          onOpenChange={setShareDialogOpen}
        />
        {insights && (
          <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: 'Speakers', value: attendees.length || 0 },
              { label: 'Action items', value: actionItemCount },
              { label: 'Decisions', value: insights.decisions?.length || 0 },
              { label: 'Risks', value: insights.risks?.length || 0, alert: (insights.risks?.length || 0) > 0 },
            ].map((s) => (
              <div
                key={s.label}
                className="rounded-xl p-4"
                style={{ background: 'var(--paper-card)', border: '1px solid var(--rule)' }}
              >
                <p className="text-[12.5px]" style={{ color: 'var(--ink-mid)' }}>{s.label}</p>
                <p
                  className="mt-1 text-[22px] font-semibold leading-none"
                  style={{ color: s.alert ? 'hsl(var(--destructive))' : 'var(--ink)', letterSpacing: '-0.02em' }}
                >
                  {s.value}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Content */}
        {insights ? (
          <div>
            {/* Tabs — editorial section tabs with underline, not pills */}
            <SectionTabs
              label="Meeting sections"
              tabs={tabs}
              value={activeTab}
              onChange={setActiveTab}
              trailing={
                activeTab === 'summary' ? (
                  <div className="flex items-center gap-2">
                    <Languages size={13} strokeWidth={1.5} style={{ color: 'var(--ink-soft)' }} />
                    <label htmlFor="summary-language" className="sr-only">
                      Summary language
                    </label>
                    <select
                      id="summary-language"
                      value={summaryLang}
                      onChange={(e) => setSummaryLang(e.target.value)}
                      className="rounded-full px-3 py-1.5 text-[12px] outline-none"
                      style={{
                        fontFamily: 'var(--font-body)',
                        border: '1px solid var(--rule)',
                        background: 'var(--paper-card)',
                        color: 'var(--ink)',
                      }}
                    >
                      {['English', 'Hindi', 'Tamil', 'Telugu', 'Bengali', 'Kannada', 'Marathi', 'Malayalam', 'Gujarati', 'Punjabi'].map((l) => (
                        <option key={l} value={l}>{l}</option>
                      ))}
                    </select>
                  </div>
                ) : null
              }
            />

            {/* ═══ SUMMARY TAB ═══ */}
            {activeTab === 'summary' && (
              <div className="space-y-6">
                {/* Executive Summary */}
                <ProtoCard>
                  <GradientBar />
                  <h3 className="text-[15px] font-semibold text-foreground mb-2" style={{ fontFamily: 'var(--font-display)', letterSpacing: '-0.01em' }}>
                    Executive summary
                  </h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {insights.summary_short}
                  </p>
                  {insights.summary_detailed && (
                    <p className="mt-3 text-sm leading-relaxed text-muted-foreground/90">
                      {insights.summary_detailed}
                    </p>
                  )}
                  {(insights.facts?.validation?.unverified?.length ?? 0) > 0 && (
                    <p className="mt-3 flex items-center gap-1.5 text-xs" style={{ color: 'var(--ink-soft)' }}>
                      <AlertTriangle size={12} strokeWidth={1.75} />
                      {insights.facts!.validation!.unverified.length} claim{insights.facts!.validation!.unverified.length === 1 ? '' : 's'} could not be verified against the transcript.
                    </p>
                  )}
                </ProtoCard>

                {/* Numbers & asks — verbatim-grounded facts, each deep-linked
                    into the recording. These are what the follow-up proposal
                    is written from, so they are never summarized away. */}
                {insights.facts && ((insights.facts.numbers?.length ?? 0) > 0 || (insights.facts.explicit_asks?.length ?? 0) > 0 || (insights.facts.objections?.length ?? 0) > 0) && (
                  <InsightSection title="Numbers & asks">
                    {(insights.facts.numbers ?? []).map((n, i) => (
                      <InsightItem key={`num-${i}`} accent="var(--ember)">
                        <span className="flex items-baseline gap-2">
                          <Hash size={12} strokeWidth={1.75} className="translate-y-[1px] shrink-0" style={{ color: 'var(--ember)' }} />
                          <span className="text-[15px] font-semibold text-foreground">{n.value}</span>
                          <span className="text-sm text-muted-foreground">{n.metric}</span>
                          <TsLink ts={n.ts} onJump={jumpToRecording} />
                        </span>
                        {n.quote && (
                          <span className="mt-1 block text-xs italic text-muted-foreground">
                            “{n.quote}”{n.speaker ? ` — ${n.speaker}` : ''}
                          </span>
                        )}
                      </InsightItem>
                    ))}
                    {(insights.facts.explicit_asks ?? []).map((a, i) => (
                      <InsightItem key={`ask-${i}`} accent="var(--ember)">
                        <span className="text-sm font-medium text-foreground">They asked for: {a.statement}</span>{' '}
                        <TsLink ts={a.ts} onJump={jumpToRecording} />
                        {a.quote && <span className="mt-1 block text-xs italic text-muted-foreground">“{a.quote}”</span>}
                      </InsightItem>
                    ))}
                    {(insights.facts.objections ?? []).map((o, i) => (
                      <InsightItem key={`obj-${i}`} accent="var(--ember)">
                        <span className="text-sm font-medium text-foreground">Objection: {o.statement}</span>{' '}
                        <span
                          className="rounded-full px-2 py-0.5 text-[10.5px] font-semibold uppercase"
                          style={o.addressed
                            ? { background: 'color-mix(in oklch, var(--ember) 12%, transparent)', color: 'var(--ember-deep)' }
                            : { background: 'color-mix(in oklch, hsl(var(--destructive)) 10%, transparent)', color: 'hsl(var(--destructive))' }}
                        >
                          {o.addressed ? 'addressed' : 'unaddressed'}
                        </span>{' '}
                        <TsLink ts={o.ts} onJump={jumpToRecording} />
                        {o.quote && <span className="mt-1 block text-xs italic text-muted-foreground">“{o.quote}”</span>}
                      </InsightItem>
                    ))}
                  </InsightSection>
                )}

                {/* Conversation metrics — computed from transcript segments.
                    Hidden entirely for older rows that carry no metrics. */}
                {insights.meeting_metrics &&
                  Object.keys(insights.meeting_metrics).length > 0 && (
                    <MeetingMetrics
                      metrics={insights.meeting_metrics}
                      hideSentiment={(insights.coaching?.sentiment_timeline?.length ?? 0) >= 2}
                    />
                )}

                {/* Sections below mirror the summary email exactly — same set,
                    same order, same one-box-per-item treatment. */}
                {insights.action_items && insights.action_items.length > 0 && (
                  <InsightSection title="Action items">
                    {(insights.action_items as ActionItem[]).map((item, i) => (
                      <InsightItem key={i} accent="var(--ember)">
                        <span className="font-medium text-foreground">
                          {typeof item === 'string' ? item : item.task}
                        </span>
                        {item.priority && (
                          <span className={cn('ml-2 text-[11px] font-semibold uppercase', getPriorityColor(item.priority))}>
                            {item.priority}
                          </span>
                        )}
                        {(item.owner || item.due_date) && (
                          <span className="mt-1 block text-xs text-muted-foreground">
                            {item.owner && (
                              <>Owner: <span className="font-medium" style={{ color: 'var(--ember)' }}>{item.owner}</span></>
                            )}
                            {item.owner && item.due_date && ' · '}
                            {item.due_date && (
                              <>Due {item.due_date_resolved ? formatDueDate(item.due_date_resolved) : item.due_date}</>
                            )}
                            {typeof item.source_timestamp === 'number' && (
                              <> · <TsLink ts={item.source_timestamp} onJump={jumpToRecording} /></>
                            )}
                          </span>
                        )}
                        {item.outcome && (
                          <span className="mt-1 block text-xs text-muted-foreground">Done when: {item.outcome}</span>
                        )}
                      </InsightItem>
                    ))}
                  </InsightSection>
                )}

                {insights.decisions && insights.decisions.length > 0 && (
                  <InsightSection title="Decisions">
                    {insights.decisions.map((d: string, i: number) => (
                      <InsightItem key={i} accent="var(--gold)">
                        {typeof d === 'string' ? d : (d as { decision?: string }).decision}
                      </InsightItem>
                    ))}
                  </InsightSection>
                )}

                {insights.strategic_insights && insights.strategic_insights.length > 0 && (
                  <InsightSection title="Strategic insights">
                    {(insights.strategic_insights as StrategicInsight[]).map((item, i) => (
                      <InsightItem key={i} accent="var(--gold)">
                        <span className="flex items-start gap-3">
                          <span className="flex-1">{item.insight}</span>
                          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs capitalize text-muted-foreground">
                            {item.category || 'insight'}
                          </span>
                        </span>
                      </InsightItem>
                    ))}
                  </InsightSection>
                )}

                {insights.key_points && insights.key_points.length > 0 && (
                  <InsightSection title="Key points">
                    {insights.key_points.map((point: string, i: number) => (
                      <InsightItem key={i}>{point}</InsightItem>
                    ))}
                  </InsightSection>
                )}

                {insights.speaker_highlights && insights.speaker_highlights.length > 0 && (
                  <InsightSection title="Speaker highlights">
                    {(insights.speaker_highlights as SpeakerHighlight[]).map((item, i) => (
                      <InsightItem key={i}>
                        <span className="block text-sm font-medium text-foreground">{item.speaker}</span>
                        <span className="mt-1 block">{item.highlight}</span>
                        {item.context && (
                          <span className="mt-1 block text-xs text-muted-foreground">→ {item.context}</span>
                        )}
                      </InsightItem>
                    ))}
                  </InsightSection>
                )}

                {insights.open_questions && insights.open_questions.length > 0 && (
                  <InsightSection title="Open questions">
                    {insights.open_questions.map((q: string, i: number) => (
                      <InsightItem key={i} accent="var(--ink-faint)">{q}</InsightItem>
                    ))}
                  </InsightSection>
                )}

                {insights.risks && insights.risks.length > 0 && (
                  <InsightSection title="Risks">
                    {insights.risks.map((r: string, i: number) => (
                      <InsightItem key={i} accent="var(--stop)">{r}</InsightItem>
                    ))}
                  </InsightSection>
                )}

                {insights.follow_ups && insights.follow_ups.length > 0 && (
                  <InsightSection title="Follow-ups">
                    {(insights.follow_ups as FollowUp[]).map((item, i) => (
                      <InsightItem key={i} accent="var(--ember)">
                        <span className="block">{item.description}</span>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {item.assignee ? `${item.assignee} · ` : ''}{item.type || 'follow-up'}
                        </span>
                      </InsightItem>
                    ))}
                  </InsightSection>
                )}

                {insights.timeline_entries && insights.timeline_entries.length > 0 && (
                  <InsightSection title="Outline">
                    <div className="rounded-lg border border-border px-4 py-3" style={{ background: 'var(--paper-card)' }}>
                      {(insights.timeline_entries as TimelineEntry[]).slice(0, 8).map((e, i) => (
                        <div key={i} className="flex gap-3 py-1.5">
                          <button
                            type="button"
                            onClick={() => jumpToRecording(e.timestamp)}
                            className="w-11 shrink-0 text-left text-xs font-semibold transition-opacity hover:opacity-70"
                            style={{ color: 'var(--ember)' }}
                            title="Jump to this moment in the recording"
                          >
                            {formatTimelineTime(e.timestamp)}
                          </button>
                          <span className="flex-1 text-sm leading-relaxed text-muted-foreground">
                            {e.speaker && <span className="font-medium text-foreground">{e.speaker}</span>}
                            {e.speaker && ' — '}
                            {e.content}
                          </span>
                        </div>
                      ))}
                    </div>
                  </InsightSection>
                )}
              </div>
            )}

            {/* ═══ ACTIONS TAB ═══ */}
            {activeTab === 'actions' && (
              <div className="space-y-2">
                {insights.action_items && (insights.action_items as ActionItem[]).some((it) => it.due_date_resolved) && (
                  <label className="flex items-center gap-2 pb-1 text-xs" style={{ color: 'var(--ink-soft)' }}>
                    <Checkbox checked={inviteAttendees} onCheckedChange={(v) => setInviteAttendees(v === true)} />
                    Invite the meeting's attendees when I add a follow-up to my calendar
                  </label>
                )}
                {insights.action_items && (insights.action_items as ActionItem[]).map((item, i) => (
                  <ProtoCard key={i} style={{ padding: 16 }}>
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          'flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border-2',
                          item.done ? 'border-success bg-success' : 'border-border bg-transparent'
                        )}
                      >
                        {item.done && <CheckCircle2 size={12} className="text-white" />}
                      </div>
                      <div className="flex-1">
                        <div className={cn('text-sm text-foreground', item.done && 'text-muted-foreground line-through')}>
                          {typeof item === 'string' ? item : item.task}
                        </div>
                        {(item.owner || item.due_date) && (
                          <div className="mt-0.5 text-xs text-muted-foreground">
                            {item.owner ? `Assigned to ${item.owner}` : ''}
                            {item.owner && item.due_date ? ' · ' : ''}
                            {item.due_date ? `Due ${item.due_date}` : ''}
                          </div>
                        )}
                      </div>
                      {item.owner && (
                        <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
                          {item.owner}
                        </span>
                      )}
                      {item.priority && (
                        <Badge variant="outline" className={cn('text-xs', getPriorityColor(item.priority))}>
                          {item.priority}
                        </Badge>
                      )}
                    </div>
                    {(item.due_date_resolved || (item as ActionItem & { calendar_event_link?: string }).calendar_event_link) && (
                      <div className="mt-2 flex flex-wrap items-center gap-3 pl-8 text-xs">
                        {(item as ActionItem & { calendar_event_link?: string }).calendar_event_link ? (
                          <a
                            href={(item as ActionItem & { calendar_event_link?: string }).calendar_event_link}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 font-medium"
                            style={{ color: 'var(--ember-deep)' }}
                          >
                            <ExternalLink size={12} strokeWidth={1.75} /> Open calendar event
                          </a>
                        ) : item.due_date_resolved ? (
                          <button
                            type="button"
                            disabled={calendarBusy === i}
                            onClick={() => handleAddToCalendar(i, item.due_date_resolved!)}
                            className="inline-flex items-center gap-1 font-medium disabled:opacity-60"
                            style={{ color: 'var(--ember-deep)' }}
                          >
                            {calendarBusy === i ? <Loader2 size={12} className="animate-spin" /> : <CalendarPlus size={12} strokeWidth={1.75} />}
                            Add {formatDueDate(item.due_date_resolved)} to calendar
                          </button>
                        ) : null}
                      </div>
                    )}
                  </ProtoCard>
                ))}
                {(!insights.action_items || insights.action_items.length === 0) && (
                  <ProtoCard style={{ textAlign: 'center', padding: 40 }}>
                    <CheckCircle2 size={32} className="mx-auto mb-3 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">No action items for this meeting</p>
                  </ProtoCard>
                )}
              </div>
            )}

            {/* ═══ COACHING TAB ═══ */}
            {activeTab === 'coaching' && insights.coaching && (() => {
              const coaching = insights.coaching as CoachingReport;
              const verdictColor = (v: string) =>
                v === 'good' ? 'var(--ember-deep)' : v === 'ok' ? 'var(--ink-mid)' : 'hsl(var(--destructive))';
              const metricLabels: Record<string, string> = {
                talk_ratio: 'Talk ratio',
                longest_monologue: 'Longest monologue',
                questions: 'Questions asked',
                hedge_density: 'Hedge words / 100',
              };
              const flagLabels: Record<string, string> = {
                pitched_before_discovery_complete: 'Pitched before discovery finished',
                objection_ignored: 'Objection ignored',
                numbers_mismatch: 'Used hypothetical numbers',
              };
              const metricEntries = Object.entries(coaching.metrics ?? {}) as [string, CoachingVerdict][];
              const flagEntries = (Object.entries(coaching.flags ?? {}) as [string, CoachingFlag][])
                .filter(([k]) => k !== 'next_step_secured');
              const nextStep = coaching.flags?.next_step_secured;
              return (
                <div className="space-y-6">
                  {coaching.summary && (
                    <ProtoCard>
                      <h3 className="mb-2 text-[15px] font-semibold text-foreground" style={{ fontFamily: 'var(--font-display)', letterSpacing: '-0.01em' }}>
                        Coach's summary{coaching.rep ? ` — ${coaching.rep}` : ''}
                      </h3>
                      <p className="text-sm leading-relaxed text-muted-foreground">{coaching.summary}</p>
                    </ProtoCard>
                  )}

                  {metricEntries.length > 0 && (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {metricEntries.map(([key, m]) => (
                        <div key={key} className="rounded-xl p-4" style={{ background: 'var(--paper-card)', border: '1px solid var(--rule)' }}>
                          <p className="text-[12.5px]" style={{ color: 'var(--ink-mid)' }}>{metricLabels[key] ?? key}</p>
                          <p className="mt-1 text-[22px] font-semibold leading-none" style={{ color: verdictColor(m.verdict), letterSpacing: '-0.02em' }}>
                            {m.value}{key === 'talk_ratio' ? '%' : key === 'longest_monologue' ? 's' : ''}
                          </p>
                          <p className="mt-1.5 text-[11.5px] leading-snug" style={{ color: 'var(--ink-soft)' }}>{m.note}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {(flagEntries.some(([, f]) => f?.value) || nextStep) && (
                    <InsightSection title="Moments">
                      {flagEntries.filter(([, f]) => f?.value).map(([key, f]) => (
                        <InsightItem key={key} accent="hsl(var(--destructive))">
                          <span className="text-sm font-medium text-foreground">{flagLabels[key] ?? key}</span>{' '}
                          <TsLink ts={f.evidence_ts ?? undefined} onJump={jumpToRecording} />
                          {f.note && <span className="mt-1 block text-xs text-muted-foreground">{f.note}</span>}
                        </InsightItem>
                      ))}
                      {nextStep && (
                        <InsightItem accent={nextStep.value ? 'var(--ember)' : 'hsl(var(--destructive))'}>
                          <span className="text-sm font-medium text-foreground">
                            {nextStep.value
                              ? `Next step secured${nextStep.strength === 'date_locked' ? ' — date locked' : nextStep.strength === 'vague' ? ' — but vague' : ''}`
                              : 'No next step secured'}
                          </span>{' '}
                          <TsLink ts={nextStep.evidence_ts ?? undefined} onJump={jumpToRecording} />
                          {nextStep.note && <span className="mt-1 block text-xs text-muted-foreground">{nextStep.note}</span>}
                        </InsightItem>
                      )}
                    </InsightSection>
                  )}

                  {(coaching.sentiment_timeline?.length ?? 0) >= 2 && (
                    <ProtoCard>
                      <h3 className="mb-1 text-[15px] font-semibold text-foreground" style={{ fontFamily: 'var(--font-display)', letterSpacing: '-0.01em' }}>
                        {coaching.external_participant ? `${coaching.external_participant}'s engagement` : 'Engagement over time'}
                      </h3>
                      <p className="mb-3 text-xs" style={{ color: 'var(--ink-soft)' }}>Sentiment of the other side across the call. Dots mark inflection points.</p>
                      <SentimentSparkline timeline={coaching.sentiment_timeline!} />
                    </ProtoCard>
                  )}
                </div>
              );
            })()}

            {/* ═══ TRANSCRIPT TAB ═══ */}
            {activeTab === 'transcript' && (() => {
              const internalCount = speakerSegments.filter((s) => (s.zone ?? 'meeting') !== 'meeting').length;
              const visibleSegments = showInternal
                ? speakerSegments
                : speakerSegments.filter((s) => (s.zone ?? 'meeting') === 'meeting');
              return (
              <div>
                {internalCount > 0 && (
                  <div
                    className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg px-4 py-2.5"
                    style={{ background: 'var(--paper-card)', border: '1px solid var(--rule)' }}
                  >
                    <span className="text-[12.5px]" style={{ color: 'var(--ink-mid)' }}>
                      {internalCount} internal segment{internalCount === 1 ? '' : 's'} (pre/post-meeting chatter) {showInternal ? 'shown below' : 'hidden'} — visible only to you, never included in summaries or shares. Window {meeting.boundaries?.source === 'llm_estimated' ? 'estimated from the conversation' : 'estimated from who spoke when'}.
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowInternal((v) => !v)}
                      className="inline-flex items-center gap-1.5 text-[12.5px] font-medium"
                      style={{ color: 'var(--ember-deep)' }}
                    >
                      {showInternal ? <EyeOff size={13} strokeWidth={1.75} /> : <Eye size={13} strokeWidth={1.75} />}
                      {showInternal ? 'Hide internal audio' : 'Show internal audio'}
                    </button>
                  </div>
                )}
                {visibleSegments.length > 0 ? visibleSegments.map((seg, i) => {
                  const prevSpeaker = i > 0 ? visibleSegments[i - 1].speaker : null;
                  const prevZone = i > 0 ? (visibleSegments[i - 1].zone ?? 'meeting') : null;
                  const zone = seg.zone ?? 'meeting';
                  const isInternal = zone !== 'meeting';
                  const isNewSpeaker = seg.speaker !== prevSpeaker || zone !== prevZone;
                  return (
                    <div key={i} className={cn('flex gap-3 border-b border-border py-3', isInternal && 'opacity-60')}>
                      {isNewSpeaker ? (
                        <div 
                          className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white flex-shrink-0"
                          style={{ background: 'var(--ember)' }}
                        >
                          {seg.speaker[0]}
                        </div>
                      ) : (
                        <div className="w-8 flex-shrink-0" />
                      )}
                      <div>
                        {isNewSpeaker && (
                          <div className="flex gap-2 items-center mb-1">
                            {renameTarget && renameTarget.from === seg.speaker ? (
                              <span className="flex items-center gap-1.5">
                                <input
                                  autoFocus
                                  value={renameTarget.value}
                                  onChange={(e) => setRenameTarget({ from: seg.speaker, value: e.target.value })}
                                  onKeyDown={(e) => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') setRenameTarget(null); }}
                                  className="w-[min(180px,60vw)] rounded-md px-2 py-1.5 text-[16px] outline-none md:py-0.5 md:text-[13px]"
                                  style={{ border: '1px solid var(--rule)', background: 'var(--paper-card)', color: 'var(--ink)' }}
                                  aria-label="New speaker name"
                                />
                                <button type="button" onClick={handleRename} disabled={renaming} className="text-[12px] font-medium" style={{ color: 'var(--ember-deep)' }}>
                                  {renaming ? 'Saving…' : 'Save'}
                                </button>
                                <button type="button" onClick={() => setRenameTarget(null)} className="text-[12px]" style={{ color: 'var(--ink-soft)' }}>Cancel</button>
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setRenameTarget({ from: seg.speaker, value: seg.speaker })}
                                className="group inline-flex items-center gap-1 text-[13px] font-medium text-foreground"
                                title="Rename this speaker everywhere"
                              >
                                {seg.speaker}
                                <Pencil size={11} strokeWidth={1.75} className="opacity-0 transition-opacity group-hover:opacity-60" />
                              </button>
                            )}
                            {seg.start !== undefined && (
                              <TsLink ts={seg.start} onJump={jumpToRecording} />
                            )}
                            {isInternal && (
                              <span
                                className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                                style={{ background: 'color-mix(in oklch, var(--ink) 8%, transparent)', color: 'var(--ink-soft)' }}
                              >
                                Internal — not shared
                              </span>
                            )}
                          </div>
                        )}
                        <p className="text-sm leading-relaxed text-muted-foreground">{seg.text}</p>
                      </div>
                    </div>
                  );
                }) : transcript ? (
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                    {transcript.content}
                  </p>
                ) : (
                  <ProtoCard style={{ textAlign: 'center', padding: 40 }}>
                    <FileText size={32} className="mx-auto mb-3 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Transcript will appear here after processing</p>
                  </ProtoCard>
                )}
              </div>
              );
            })()}

            {activeTab === 'recording' && <RecordingPlayer meetingId={meeting.id} seekSeconds={seekSeconds} />}

            {/* ═══ DELIVERY TAB ═══ */}
            {activeTab === 'delivery' && (
              <div className="space-y-3">
                {/* Email Deliveries */}
                {emailMessages.length > 0 && (
                  <>
                    <h3 className="text-[15px] font-semibold text-foreground mb-3 flex items-center gap-2" style={{ fontFamily: 'var(--font-display)', letterSpacing: '-0.01em' }}>
                      <Mail size={16} style={{ color: 'var(--info)' }} /> Email Deliveries
                    </h3>
                    {emailMessages.map((msg, i) => (
                      <ProtoCard key={i} style={{ padding: 16 }}>
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="text-sm font-medium text-foreground">{msg.recipient_email}</div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {formatIST(new Date(msg.sent_at || msg.created_at), 'MMM d, yyyy h:mm a')}
                            </div>
                            {msg.error_message && (
                              <div className="mt-1 text-xs text-destructive">
                                Error: {msg.error_message}
                              </div>
                            )}
                          </div>
                          <span
                            className={cn(
                              'rounded-full px-2.5 py-1 text-[11px] font-semibold',
                              msg.status === 'sent' ? 'bg-success/15 text-success dark:text-success' : 'bg-muted text-muted-foreground'
                            )}
                          >
                            {msg.status === 'sent' ? '✓ Sent' : msg.status === 'failed' ? '✗ Failed' : 'Pending'}
                          </span>
                        </div>
                      </ProtoCard>
                    ))}
                  </>
                )}

                {emailMessages.length === 0 && (
                  <ProtoCard style={{ textAlign: 'center', padding: 40 }}>
                    <Mail size={32} className="mx-auto mb-3 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">No deliveries yet. Send this report by email above.</p>
                  </ProtoCard>
                )}
              </div>
            )}
          </div>
        ) : IN_PROGRESS_STATUSES.includes(meeting.status) ? (
          <div className="py-16 text-center">
            <Loader2 className="mx-auto mb-4 h-12 w-12 animate-spin text-muted-foreground" />
            <ol className="mx-auto mb-4 flex max-w-md items-center justify-center gap-2 text-[12px]">
              {(['Recording', 'Transcribing & analysing', 'Ready'] as const).map((label, idx) => {
                const current = ['joining', 'in_call', 'recording'].includes(meeting.status) ? 0 : 1;
                const state = idx < current ? 'done' : idx === current ? 'active' : 'todo';
                return (
                  <li key={label} className="flex items-center gap-2">
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ background: state === 'todo' ? 'var(--rule)' : 'var(--ember)', opacity: state === 'done' ? 0.5 : 1 }}
                    />
                    <span style={{ color: state === 'active' ? 'var(--ink)' : 'var(--ink-soft)', fontWeight: state === 'active' ? 600 : 400 }}>{label}</span>
                    {idx < 2 && <span aria-hidden style={{ color: 'var(--rule)' }}>—</span>}
                  </li>
                );
              })}
            </ol>
            <p className="mb-1 text-base font-medium text-foreground">
              {meeting.status === 'transcribing'
                ? 'Transcribing meeting...'
                : meeting.status === 'joining' || meeting.status === 'in_call'
                  ? 'Bot is joining the meeting...'
                  : 'Processing meeting...'}
            </p>
            <p className="mx-auto max-w-sm text-sm text-muted-foreground">
              AI is analyzing your recording. This usually takes a few minutes.
            </p>
          </div>
        ) : (
          <div className="py-10">
            <div className="mb-8 text-center">
              <p className="mb-1 text-base font-medium text-foreground">No insights available</p>
              <p className="text-sm text-muted-foreground">This meeting hasn&apos;t been processed yet.</p>
            </div>
            {/* A meeting with no insights still has a recording worth watching —
                and audio for a failed meeting is kept far longer than usual. */}
            <RecordingPlayer meetingId={meeting.id} />
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
