/**
 * Meeting detail — Console (UI v2).
 *
 * The data layer is MeetingDetail.tsx's, moved across untouched: the one query
 * that fetches meeting + transcript + insights + email messages, the realtime
 * subscription with its single check-recall-status fallback, and every handler
 * (regenerate, draft follow-up, add to calendar, rename speaker, delete, send
 * email). Only the render is new.
 *
 * One control did not come across. V1's summary-language dropdown set a piece
 * of state that nothing ever read — ten languages that changed nothing. The
 * real control now lives in Settings -> Account and is read by the pipeline, so
 * this page does not offer a second, fake one.
 */

import { useEffect, useState } from 'react';
import { formatIST } from '@/lib/time';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { EmailReportDialogV2 } from '@/components/meeting/EmailReportDialogV2';
import { MeetingMetrics } from '@/components/meeting/MeetingMetrics';
import { ShareLinkDialogV2 } from '@/components/meeting/ShareLinkDialogV2';
import { InsightSection, InsightItem } from '@/components/meeting/InsightSection';
import { RecordingPlayer } from '@/components/meeting/RecordingPlayer';
import { RecordingPanelV2, PanelTopic } from '@/components/meeting/RecordingPanelV2';
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

import {
  Avatar as EbAvatar,
  Badge as EbBadge,
  Button as EbButton,
  Card as EbCard,
  CardHeader as EbCardHeader,
  ChipGroup as EbChipGroup,
  DarkPanel as EbDarkPanel,
  Label as EbLabel,
  TwoColumn as EbTwoColumn,
  Dialog as EbDialog,
  DialogNote,
} from '@/ui';
import { Flag } from 'lucide-react';
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

// Console dialog surface. shadcn's AlertDialogContent paints `bg-background`,
// which is still the V1 theme value — these dialogs sit on eb paper instead.
const EB_DIALOG = 'bg-eb-bg border-eb-border text-eb-text';

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


const SOURCE_LABELS: Record<string, string> = {
  google_meet: 'Google Meet',
  zoom: 'Zoom',
  teams: 'Teams',
  manual: 'Recording',
};

const COACH_METRIC_LABELS: Record<string, string> = {
  talk_ratio: 'Talk ratio',
  longest_monologue: 'Longest monologue',
  questions: 'Questions asked',
  hedge_density: 'Hedge words / 100',
};

const COACH_FLAG_LABELS: Record<string, string> = {
  pitched_before_discovery_complete: 'Pitched before discovery finished',
  objection_ignored: 'Objection ignored',
  numbers_mismatch: 'Used hypothetical numbers',
};

/** The quoted extraction object, rendered group by group. */
const FACT_GROUPS: Array<{ key: string; title: string; primary: string; secondary?: string }> = [
  { key: 'numbers', title: 'Numbers', primary: 'metric', secondary: 'value' },
  { key: 'explicit_asks', title: 'Explicit asks', primary: 'ask' },
  { key: 'objections', title: 'Objections', primary: 'objection' },
  { key: 'commitments', title: 'Commitments', primary: 'what', secondary: 'who' },
  { key: 'decisions', title: 'Decisions', primary: 'decision' },
  { key: 'topics', title: 'Topics', primary: 'topic' },
];

export default function MeetingDetailV2() {
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
  const [regenOpen, setRegenOpen] = useState(false);

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
      if (!data.success) throw new Error(data.error || 'Failed to send');
      toast({ title: 'Sent', description: `Report sent to ${emailAddress}` });
    } catch (error: unknown) {
      // Rethrown so the dialog stays open on failure: swallowing it here left
      // the dialog closing on a send that never happened.
      throw error instanceof Error ? error : new Error('Failed to send email');
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
        <Skeleton className="mb-4 h-4 w-32" />
        <Skeleton className="mb-3 h-9 w-[60%]" />
        <Skeleton className="mb-6 h-4 w-72" />
        <Skeleton className="h-64 rounded-card" />
      </DashboardLayout>
    );
  }

  if (!meeting) {
    return (
      <DashboardLayout>
        <h1 className="font-outfit text-[26px] font-semibold tracking-[-.02em] text-eb-text">Meeting not found</h1>
        <p className="mt-2 font-dmsans text-sm text-eb-secondary">
          The meeting may have been deleted, or the link is wrong.
        </p>
        <Link to="/dashboard" className="mt-5 inline-flex items-center gap-1.5 font-dmsans text-[13.5px] font-medium text-eb-accent no-underline">
          <ArrowLeft size={14} strokeWidth={1.75} /> Back to meetings
        </Link>
      </DashboardLayout>
    );
  }

  const actionItemCount = insights?.action_items?.length || 0;
  const facts = insights?.facts;
  const coaching = insights?.coaching as CoachingReport | undefined;

  const tabs: Array<{ value: string; label: string }> = [
    { value: 'summary', label: 'Summary' },
    { value: 'actions', label: `Actions${actionItemCount ? ` (${actionItemCount})` : ''}` },
    { value: 'recording', label: 'Recording' },
    { value: 'transcript', label: 'Transcript' },
    ...(coaching ? [{ value: 'coaching', label: 'Coaching' }] : []),
    ...(facts ? [{ value: 'facts', label: 'Facts' }] : []),
    { value: 'delivery', label: 'Delivery' },
  ];

  const inProgress = IN_PROGRESS_STATUSES.includes(meeting.status);
  const internalCount = speakerSegments.filter((s) => (s.zone ?? 'meeting') !== 'meeting').length;
  const visibleSegments = showInternal
    ? speakerSegments
    : speakerSegments.filter((s) => (s.zone ?? 'meeting') === 'meeting');

  const summaryRail = (
    <div className="flex flex-col gap-4">
      <EbCard padded={false}>
        <EbCardHeader title="Action items" count={actionItemCount || undefined} />
        {actionItemCount === 0 ? (
          <p className="px-[18px] py-4 font-dmsans text-[12.5px] text-eb-secondary">None from this meeting.</p>
        ) : (
          <div className="py-1">
            {(insights!.action_items as ActionItem[]).slice(0, 5).map((item, i) => (
              <div key={i} className="flex items-baseline gap-2.5 px-[18px] py-2">
                <span className="mt-1.5 h-1.5 w-1.5 flex-none rounded-full bg-eb-accent" />
                <span className="flex-1 font-dmsans text-[13px] leading-[1.45]">
                  {typeof item === 'string' ? item : item.task}
                  {item.owner && <span className="text-eb-secondary"> — {item.owner}</span>}
                </span>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setActiveTab('actions')}
              className="px-[18px] pb-3 pt-1 font-dmsans text-[12.5px] text-eb-accent hover:underline"
            >
              All action items →
            </button>
          </div>
        )}
      </EbCard>

      {(facts?.numbers?.length ?? 0) > 0 && (
        <EbCard padded={false}>
          <EbCardHeader title="Numbers mentioned" count={facts!.numbers!.length} />
          <div className="flex flex-wrap gap-1.5 p-[18px] pt-3">
            {facts!.numbers!.slice(0, 8).map((n, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1.5 rounded-pill bg-eb-accent-soft px-2.5 py-1 font-mono text-[11.5px] text-eb-accent-text"
                title={n.quote}
              >
                {n.metric}: {n.value}
              </span>
            ))}
          </div>
        </EbCard>
      )}

      {coaching?.metrics && Object.keys(coaching.metrics).length > 0 && (
        <EbCard padded={false}>
          <EbCardHeader title="Coaching" right={
            <button type="button" onClick={() => setActiveTab('coaching')} className="pr-2 font-dmsans text-[12.5px] text-eb-accent hover:underline">
              Open →
            </button>
          } />
          <div className="grid grid-cols-2 gap-px bg-eb-divider">
            {(Object.entries(coaching.metrics) as [string, CoachingVerdict][]).slice(0, 4).map(([key, m]) => (
              <div key={key} className="bg-white p-3">
                <div className="font-dmsans text-[11.5px] text-eb-secondary">{COACH_METRIC_LABELS[key] ?? key}</div>
                <div className={cn('font-outfit text-[18px] font-semibold', m.verdict === 'good' ? 'text-eb-green' : m.verdict === 'ok' ? 'text-eb-text' : 'text-eb-red')}>
                  {m.value}{key === 'talk_ratio' ? '%' : key === 'longest_monologue' ? 's' : ''}
                </div>
              </div>
            ))}
          </div>
        </EbCard>
      )}

      <button
        type="button"
        onClick={() => setActiveTab('recording')}
        className="flex items-center gap-3 rounded-card border border-eb-border bg-eb-card p-4 text-left shadow-eb-card hover:bg-eb-row-hover"
      >
        <span className="inline-flex h-10 w-10 flex-none items-center justify-center rounded-tile bg-eb-sidebar text-eb-accent-sidebar">
          <Video size={17} strokeWidth={1.75} />
        </span>
        <span>
          <span className="block font-dmsans text-sm font-medium">Recording</span>
          <span className="block font-dmsans text-[12.5px] text-eb-secondary">
            {meeting.duration_seconds ? formatDuration(meeting.duration_seconds) : 'Watch the call'}
          </span>
        </span>
      </button>
    </div>
  );

  const summaryTab = insights && (
    <div className="flex flex-col gap-4">
      <EbCard>
        <h2 className="font-outfit text-[15px] font-semibold text-eb-text">Summary</h2>
        <p className="mt-2 font-dmsans text-sm leading-[1.6] text-eb-prose">{insights.summary_short}</p>
        {insights.summary_detailed && (
          <p className="mt-3 whitespace-pre-wrap font-dmsans text-sm leading-[1.6] text-eb-prose">
            {insights.summary_detailed}
          </p>
        )}
        {(facts?.validation?.unverified?.length ?? 0) > 0 && (
          <p className="mt-3 flex items-center gap-1.5 font-dmsans text-xs text-eb-secondary">
            <AlertTriangle size={12} strokeWidth={1.75} />
            {facts!.validation!.unverified.length} claim
            {facts!.validation!.unverified.length === 1 ? '' : 's'} could not be verified against the transcript.
          </p>
        )}

        {(insights.decisions?.length ?? 0) > 0 && (
          <div className="mt-5 border-t border-eb-divider pt-4">
            <EbLabel>Decisions</EbLabel>
            <ul className="mt-2 flex flex-col gap-1.5">
              {insights.decisions.map((d, i) => (
                <li key={i} className="flex gap-2.5 font-dmsans text-[13.5px] leading-[1.5] text-eb-prose">
                  <span className="mt-[7px] h-1.5 w-1.5 flex-none rounded-full bg-eb-accent" />
                  {typeof d === 'string' ? d : (d as { decision?: string }).decision}
                </li>
              ))}
            </ul>
          </div>
        )}

        {(insights.risks?.length ?? 0) > 0 && (
          <div className="mt-4 rounded-input bg-eb-amber-bg p-4">
            <EbLabel className="text-eb-amber-text">Risks flagged</EbLabel>
            <ul className="mt-2 flex flex-col gap-1.5">
              {insights.risks.map((r, i) => (
                <li key={i} className="flex gap-2.5 font-dmsans text-[13.5px] leading-[1.5] text-eb-amber-text">
                  <Flag size={12} strokeWidth={1.75} className="mt-1 flex-none" />
                  {typeof r === 'string' ? r : (r as { risk?: string }).risk}
                </li>
              ))}
            </ul>
          </div>
        )}
      </EbCard>

      {(insights.timeline_entries?.length ?? 0) > 0 && (
        <EbCard padded={false}>
          <EbCardHeader title="Key moments" count={insights.timeline_entries.length} />
          {(insights.timeline_entries as TimelineEntry[]).map((entry, i) => (
            <button
              key={i}
              type="button"
              onClick={() => jumpToRecording(entry.timestamp)}
              className="flex w-full items-baseline gap-3 border-b border-eb-divider px-[18px] py-3 text-left last:border-0 hover:bg-eb-row-hover"
            >
              <span className="w-12 flex-none font-mono text-[11.5px] text-eb-accent">
                {formatTimelineTime(entry.timestamp)}
              </span>
              <span className="flex-1">
                <span className="block font-dmsans text-[13.5px] font-medium">{entry.content}</span>
                {entry.speaker && (
                  <span className="mt-0.5 block font-dmsans text-[12.5px] text-eb-secondary">{entry.speaker}</span>
                )}
              </span>
            </button>
          ))}
        </EbCard>
      )}

      {(insights.key_points?.length ?? 0) > 0 && (
        <EbCard>
          <EbLabel>Key points</EbLabel>
          <ul className="mt-2 flex flex-col gap-2">
            {insights.key_points.map((point, i) => (
              <li key={i} className="flex gap-2.5 font-dmsans text-[13.5px] leading-[1.5] text-eb-prose">
                <span className="mt-[7px] h-1.5 w-1.5 flex-none rounded-full bg-eb-chip" />
                {point}
              </li>
            ))}
          </ul>
        </EbCard>
      )}
    </div>
  );

  return (
    <DashboardLayout>
      <Link
        to="/dashboard"
        className="tap-44 mb-3 inline-flex items-center gap-1.5 font-dmsans text-[13px] text-eb-secondary no-underline hover:text-eb-text"
      >
        <ArrowLeft size={14} strokeWidth={1.75} /> Back to meetings
      </Link>

      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="font-outfit text-[26px] font-semibold leading-[1.15] tracking-[-.02em] text-eb-text">
            {meeting.title}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 font-dmsans text-[13px] text-eb-secondary">
            <span>{formatIST(new Date(meeting.start_time), 'MMM d, yyyy · h:mm a')}</span>
            {meeting.duration_seconds ? (
              <>
                <span aria-hidden>·</span>
                <span>{formatDuration(meeting.duration_seconds)}</span>
              </>
            ) : null}
            <span aria-hidden>·</span>
            <span>{SOURCE_LABELS[meeting.source ?? 'manual'] ?? 'Recording'}</span>
            {attendees.length > 0 && (
              <span className="flex items-center -space-x-1.5 pl-1">
                {attendees.slice(0, 4).map((a, i) => (
                  <EbAvatar
                    key={i}
                    name={a.displayName || a.email || '?'}
                    size={20}
                    round
                    className="ring-2 ring-eb-bg"
                  />
                ))}
                {attendees.length > 4 && (
                  <span className="pl-3 font-dmsans text-[12.5px]">+{attendees.length - 4}</span>
                )}
              </span>
            )}
            {meeting.languages && Object.keys(meeting.languages).length > 0 ? (
              <EbBadge tone="neutral">{formatLanguageMix(meeting.languages)}</EbBadge>
            ) : meeting.language ? (
              <EbBadge tone="neutral">{meeting.language}</EbBadge>
            ) : null}
            {inProgress && <EbBadge tone="amber" dot>{meeting.status.replace(/_/g, ' ')}</EbBadge>}
          </div>
          {(meeting.status === 'failed' || meeting.status === 'cancelled') && meeting.error_message && (
            <p className="mt-2 font-dmsans text-[13px] text-eb-red">{meeting.error_message}</p>
          )}
        </div>

        {insights && (
          <div className="flex flex-wrap items-center gap-2">
            <EbButton size="sm" onClick={() => setEmailDialogOpen(true)} icon={<Mail size={14} strokeWidth={1.75} />}>
              Email
            </EbButton>
            <EbButton size="sm" onClick={() => setShareDialogOpen(true)} icon={<Link2 size={14} strokeWidth={1.75} />}>
              Share
            </EbButton>
            {facts && (
              <EbButton size="sm" onClick={() => handleDraft(false)} icon={<PenLine size={14} strokeWidth={1.75} />}>
                Draft follow-up
              </EbButton>
            )}
            <EbButton
              size="sm"
              disabled={regenerating}
              onClick={() => setRegenOpen(true)}
              icon={regenerating ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} strokeWidth={1.75} />}
            >
              {regenerating ? 'Regenerating…' : 'Regenerate'}
            </EbButton>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <EbButton size="sm" variant="destructive" icon={<Trash2 size={14} strokeWidth={1.75} />}>
                  Delete
                </EbButton>
              </AlertDialogTrigger>
              <AlertDialogContent className={EB_DIALOG}>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this meeting?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Permanently removes the meeting with its transcript, insights and archived
                    audio. This cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDelete}
                    disabled={deleting}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </div>

      <EmailReportDialogV2
        open={emailDialogOpen}
        onOpenChange={setEmailDialogOpen}
        meetingTitle={meeting.title}
        meetingDate={meeting.start_time ? formatIST(new Date(meeting.start_time), 'EEE, MMM d') : undefined}
        userEmail={user?.email || undefined}
        attendees={attendees}
        onSend={handleSendEmail}
      />
      <ShareLinkDialogV2 meetingId={meeting.id} open={shareDialogOpen} onOpenChange={setShareDialogOpen} />

      {/* Mockup 00g. Dark button, not red: this replaces generated text and is
          repeatable — red is reserved for the delete that is not. */}
      <EbDialog
        open={regenOpen}
        onOpenChange={setRegenOpen}
        icon={<RefreshCw size={18} strokeWidth={1.75} />}
        title="Regenerate insights?"
        description="Rebuilds the summary, extracted facts, action items and coaching from the stored transcript with the current pipeline. No re-transcription. Speaker renames are kept."
        width={480}
        footer={
          <>
            <DialogNote>Takes about a minute</DialogNote>
            <div className="flex items-center gap-2">
              <EbButton onClick={() => setRegenOpen(false)}>Cancel</EbButton>
              <EbButton
                variant="dark"
                disabled={regenerating}
                onClick={() => {
                  setRegenOpen(false);
                  handleRegenerate();
                }}
                icon={<RefreshCw size={15} strokeWidth={1.75} />}
              >
                Regenerate
              </EbButton>
            </div>
          </>
        }
      >
        <div className="flex items-start gap-2.5 rounded-card border border-eb-border bg-eb-amber-bg px-3.5 py-3">
          <Flag size={15} strokeWidth={1.75} className="mt-px shrink-0 text-eb-amber" />
          <p className="m-0 font-dmsans text-[13px] leading-[1.55] text-eb-amber-text">
            Any edits you made to the summary or action items will be replaced. Ticked action items
            stay ticked.
          </p>
        </div>
      </EbDialog>

      <AlertDialog open={draftOpen} onOpenChange={setDraftOpen}>
        <AlertDialogContent className={cn('max-w-2xl', EB_DIALOG)}>
          <AlertDialogHeader>
            <AlertDialogTitle>Follow-up email draft</AlertDialogTitle>
            <AlertDialogDescription>
              Written from the extracted facts only — their own words for what they need, the
              commitments both ways, and the follow-up time. Edit before sending.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {drafting || !draft ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-eb-secondary" />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="font-dmsans text-[13px] text-eb-secondary">
                To: <span className="text-eb-text">{draft.to?.join(', ') || '—'}</span>
              </div>
              <div className="font-dmsans text-sm font-medium text-eb-text">{draft.subject}</div>
              <textarea
                readOnly
                value={draft.body}
                rows={12}
                className="w-full rounded-input border border-eb-border bg-eb-paper p-3 font-dmsans text-sm leading-relaxed text-eb-text outline-none"
              />
            </div>
          )}
          <AlertDialogFooter className="flex-wrap gap-2">
            <AlertDialogCancel>Close</AlertDialogCancel>
            {draft && !drafting && (
              <>
                <EbButton size="sm" onClick={() => handleDraft(true)} icon={<RefreshCw size={13} strokeWidth={1.75} />}>
                  Redraft
                </EbButton>
                <EbButton
                  size="sm"
                  onClick={async () => {
                    await navigator.clipboard.writeText(`Subject: ${draft.subject}\n\n${draft.body}`);
                    toast({ title: 'Copied to clipboard' });
                  }}
                  icon={<Copy size={13} strokeWidth={1.75} />}
                >
                  Copy
                </EbButton>
                <a
                  href={`mailto:${encodeURIComponent((draft.to ?? []).filter((t) => t.includes('@')).join(','))}?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body)}`}
                  className="inline-flex items-center gap-2 rounded-pill bg-gradient-to-b from-eb-accent-top to-eb-accent px-3 py-1.5 font-dmsans text-[13px] font-medium text-white shadow-eb-primary hover:to-eb-accent-hover"
                >
                  <Mail size={13} strokeWidth={1.75} /> Open in mail
                </a>
              </>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {insights ? (
        <>
          <div className="mb-5">
            <EbChipGroup ariaLabel="Meeting sections" value={activeTab} onChange={setActiveTab} options={tabs} />
          </div>

          {activeTab === 'summary' && (
            <EbTwoColumn rail={summaryRail}>{summaryTab}</EbTwoColumn>
          )}

          {activeTab === 'actions' && (
            <div className="flex flex-col gap-3">
              {(insights.action_items as ActionItem[]).some((it) => it.due_date_resolved) && (
                <label className="flex items-center gap-2 font-dmsans text-[12.5px] text-eb-secondary">
                  <Checkbox checked={inviteAttendees} onCheckedChange={(v) => setInviteAttendees(v === true)} />
                  Invite the meeting&apos;s attendees when I add a follow-up to my calendar
                </label>
              )}
              {actionItemCount === 0 ? (
                <EbCard className="py-10 text-center">
                  <CheckCircle2 size={28} className="mx-auto mb-3 text-eb-muted" strokeWidth={1.5} />
                  <p className="font-dmsans text-[13px] text-eb-secondary">No action items for this meeting.</p>
                </EbCard>
              ) : (
                <EbCard padded={false}>
                  {(insights.action_items as ActionItem[]).map((item, i) => {
                    const link = (item as ActionItem & { calendar_event_link?: string }).calendar_event_link;
                    return (
                      <div key={i} className="border-b border-eb-divider px-[18px] py-3.5 last:border-0">
                        <div className="flex items-start gap-3">
                          <span className={cn(
                            'mt-0.5 flex h-[18px] w-[18px] flex-none items-center justify-center rounded-md border-[1.5px]',
                            item.done ? 'border-0 bg-eb-green text-white' : 'border-eb-control-edge bg-white',
                          )}>
                            {item.done && <CheckCircle2 size={11} strokeWidth={3} />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className={cn('block font-dmsans text-sm', item.done && 'text-eb-secondary line-through')}>
                              {typeof item === 'string' ? item : item.task}
                            </span>
                            {(item.owner || item.due_date) && (
                              <span className="mt-0.5 block font-dmsans text-[12.5px] text-eb-secondary">
                                {item.owner ? `Assigned to ${item.owner}` : ''}
                                {item.owner && item.due_date ? ' · ' : ''}
                                {item.due_date ? `Due ${item.due_date}` : ''}
                              </span>
                            )}
                          </span>
                          {item.priority && (
                            <EbBadge tone={item.priority === 'high' ? 'red' : item.priority === 'medium' ? 'amber' : 'neutral'}>
                              {item.priority}
                            </EbBadge>
                          )}
                        </div>
                        {(item.due_date_resolved || link) && (
                          <div className="mt-2 pl-[30px] font-dmsans text-[12.5px]">
                            {link ? (
                              <a href={link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-eb-accent no-underline hover:underline">
                                <ExternalLink size={12} strokeWidth={1.75} /> Open calendar event
                              </a>
                            ) : (
                              <button
                                type="button"
                                disabled={calendarBusy === i}
                                onClick={() => handleAddToCalendar(i, item.due_date_resolved!)}
                                className="inline-flex items-center gap-1 font-medium text-eb-accent disabled:opacity-60 hover:underline"
                              >
                                {calendarBusy === i ? <Loader2 size={12} className="animate-spin" /> : <CalendarPlus size={12} strokeWidth={1.75} />}
                                Add {formatDueDate(item.due_date_resolved!)} to calendar
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </EbCard>
              )}
            </div>
          )}

          {activeTab === 'recording' && (
            <RecordingPanelV2
              meetingId={meeting.id}
              segments={visibleSegments}
              topics={(facts?.topics as PanelTopic[] | undefined) ?? []}
              seekSeconds={seekSeconds}
              onSeek={setSeekSeconds}
            />
          )}

          {activeTab === 'transcript' && (
            <div className="flex flex-col gap-3">
              {internalCount > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-input border border-eb-border bg-eb-card px-4 py-2.5">
                  <span className="font-dmsans text-[12.5px] text-eb-secondary">
                    {internalCount} internal segment{internalCount === 1 ? '' : 's'} (pre/post-meeting chatter){' '}
                    {showInternal ? 'shown below' : 'hidden'} — visible only to you, never included in
                    summaries or shares.
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowInternal((v) => !v)}
                    className="inline-flex items-center gap-1.5 font-dmsans text-[12.5px] font-medium text-eb-accent"
                  >
                    {showInternal ? <EyeOff size={13} strokeWidth={1.75} /> : <Eye size={13} strokeWidth={1.75} />}
                    {showInternal ? 'Hide internal audio' : 'Show internal audio'}
                  </button>
                </div>
              )}

              {visibleSegments.length > 0 ? (
                <EbCard padded={false}>
                  {visibleSegments.map((seg, i) => {
                    const prev = i > 0 ? visibleSegments[i - 1] : null;
                    const zone = seg.zone ?? 'meeting';
                    const isInternal = zone !== 'meeting';
                    const isNewSpeaker = seg.speaker !== prev?.speaker || zone !== (prev?.zone ?? 'meeting');
                    return (
                      <div key={i} className={cn('flex gap-3 px-[18px]', isNewSpeaker ? 'pt-3.5' : 'pt-0', 'pb-1.5', isInternal && 'opacity-60')}>
                        <span className="w-8 flex-none">
                          {isNewSpeaker && <EbAvatar name={seg.speaker} size={30} round />}
                        </span>
                        <div className="min-w-0 flex-1">
                          {isNewSpeaker && (
                            <div className="mb-1 flex flex-wrap items-center gap-2">
                              {renameTarget && renameTarget.from === seg.speaker ? (
                                <span className="flex items-center gap-1.5">
                                  <input
                                    autoFocus
                                    value={renameTarget.value}
                                    onChange={(e) => setRenameTarget({ from: seg.speaker, value: e.target.value })}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') handleRename();
                                      if (e.key === 'Escape') setRenameTarget(null);
                                    }}
                                    className="w-[min(180px,60vw)] rounded-input border border-eb-border bg-white px-2 py-1 font-dmsans text-[13px] outline-none"
                                    aria-label="New speaker name"
                                  />
                                  <button type="button" onClick={handleRename} disabled={renaming} className="font-dmsans text-[12px] font-medium text-eb-accent">
                                    {renaming ? 'Saving…' : 'Save'}
                                  </button>
                                  <button type="button" onClick={() => setRenameTarget(null)} className="font-dmsans text-[12px] text-eb-secondary">
                                    Cancel
                                  </button>
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setRenameTarget({ from: seg.speaker, value: seg.speaker })}
                                  className="group inline-flex items-center gap-1 font-dmsans text-[13px] font-medium"
                                  title="Rename this speaker everywhere"
                                >
                                  {seg.speaker}
                                  <Pencil size={11} strokeWidth={1.75} className="opacity-0 transition-opacity group-hover:opacity-60" />
                                </button>
                              )}
                              {seg.start !== undefined && (
                                <button
                                  type="button"
                                  onClick={() => jumpToRecording(seg.start!)}
                                  className="font-mono text-[11.5px] text-eb-accent hover:underline"
                                >
                                  {formatTimelineTime(seg.start)}
                                </button>
                              )}
                              {isInternal && <EbBadge tone="neutral">Internal — not shared</EbBadge>}
                            </div>
                          )}
                          <p className="font-dmsans text-[13.5px] leading-[1.6] text-eb-prose">{seg.text}</p>
                        </div>
                      </div>
                    );
                  })}
                  <div className="h-3" />
                </EbCard>
              ) : transcript ? (
                <EbCard>
                  <p className="whitespace-pre-wrap font-dmsans text-[13.5px] leading-[1.6] text-eb-prose">
                    {transcript.content}
                  </p>
                </EbCard>
              ) : (
                <EbCard className="py-10 text-center">
                  <FileText size={28} className="mx-auto mb-3 text-eb-muted" strokeWidth={1.5} />
                  <p className="font-dmsans text-[13px] text-eb-secondary">
                    The transcript appears here once processing finishes.
                  </p>
                </EbCard>
              )}
            </div>
          )}

          {activeTab === 'coaching' && coaching && (
            <div className="flex flex-col gap-4">
              {coaching.summary && (
                <EbDarkPanel eyebrow={`Coach's summary${coaching.rep ? ` · ${coaching.rep}` : ''}`}>
                  <p className="font-dmsans text-sm leading-[1.6]">{coaching.summary}</p>
                </EbDarkPanel>
              )}

              {Object.keys(coaching.metrics ?? {}).length > 0 && (
                <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                  {(Object.entries(coaching.metrics!) as [string, CoachingVerdict][]).map(([key, m]) => (
                    <div key={key} className="rounded-card border border-eb-border bg-eb-card p-4 shadow-eb-card">
                      <div className="font-dmsans text-[12.5px] text-eb-secondary">{COACH_METRIC_LABELS[key] ?? key}</div>
                      <div className={cn('mt-1.5 font-outfit text-[26px] font-semibold leading-none tracking-[-.02em]', m.verdict === 'good' ? 'text-eb-green' : m.verdict === 'ok' ? 'text-eb-text' : 'text-eb-red')}>
                        {m.value}{key === 'talk_ratio' ? '%' : key === 'longest_monologue' ? 's' : ''}
                      </div>
                      <div className="mt-1.5 font-dmsans text-[11.5px] leading-snug text-eb-secondary">{m.note}</div>
                    </div>
                  ))}
                </div>
              )}

              {(() => {
                const flagEntries = (Object.entries(coaching.flags ?? {}) as [string, CoachingFlag][])
                  .filter(([k]) => k !== 'next_step_secured');
                const nextStep = coaching.flags?.next_step_secured;
                if (!flagEntries.some(([, f]) => f?.value) && !nextStep) return null;
                return (
                  <EbCard padded={false}>
                    <EbCardHeader title="Moments" />
                    {flagEntries.filter(([, f]) => f?.value).map(([key, f]) => (
                      <div key={key} className="border-b border-eb-divider px-[18px] py-3 last:border-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Flag size={13} strokeWidth={1.75} className="text-eb-red" />
                          <span className="font-dmsans text-[13.5px] font-medium">{COACH_FLAG_LABELS[key] ?? key}</span>
                          {f.evidence_ts != null && (
                            <button type="button" onClick={() => jumpToRecording(f.evidence_ts!)} className="font-mono text-[11.5px] text-eb-accent hover:underline">
                              {formatTimelineTime(f.evidence_ts)}
                            </button>
                          )}
                        </div>
                        {f.note && <p className="mt-1 font-dmsans text-[12.5px] text-eb-secondary">{f.note}</p>}
                      </div>
                    ))}
                    {nextStep && (
                      <div className="px-[18px] py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <EbBadge tone={nextStep.value ? 'green' : 'red'} dot>
                            {nextStep.value ? 'Next step secured' : 'No next step'}
                          </EbBadge>
                          {nextStep.value && nextStep.strength === 'date_locked' && <span className="font-dmsans text-[12.5px] text-eb-secondary">date locked</span>}
                          {nextStep.value && nextStep.strength === 'vague' && <span className="font-dmsans text-[12.5px] text-eb-secondary">but vague</span>}
                          {nextStep.evidence_ts != null && (
                            <button type="button" onClick={() => jumpToRecording(nextStep.evidence_ts!)} className="font-mono text-[11.5px] text-eb-accent hover:underline">
                              {formatTimelineTime(nextStep.evidence_ts)}
                            </button>
                          )}
                        </div>
                        {nextStep.note && <p className="mt-1 font-dmsans text-[12.5px] text-eb-secondary">{nextStep.note}</p>}
                      </div>
                    )}
                  </EbCard>
                );
              })()}

              {(coaching.sentiment_timeline?.length ?? 0) >= 2 && (
                <EbCard>
                  <h3 className="font-outfit text-[15px] font-semibold text-eb-text">
                    {coaching.external_participant ? `${coaching.external_participant}'s engagement` : 'Engagement over time'}
                  </h3>
                  <p className="mb-3 mt-0.5 font-dmsans text-[12.5px] text-eb-secondary">
                    Sentiment of the other side across the call. Dots mark inflection points.
                  </p>
                  <SentimentSparkline timeline={coaching.sentiment_timeline!} />
                </EbCard>
              )}
            </div>
          )}

          {activeTab === 'facts' && facts && (
            <div className="flex flex-col gap-4">
              {FACT_GROUPS.map(({ key, title, primary, secondary }) => {
                const rows = (facts as unknown as Record<string, Array<Record<string, unknown>>>)[key];
                if (!Array.isArray(rows) || rows.length === 0) return null;
                return (
                  <EbCard key={key} padded={false}>
                    <EbCardHeader title={title} count={rows.length} />
                    {rows.map((row, i) => (
                      <div key={i} className="border-b border-eb-divider px-[18px] py-3 last:border-0">
                        <div className="flex flex-wrap items-baseline gap-2">
                          <span className="font-dmsans text-[13.5px] font-medium">
                            {String(row[primary] ?? '')}
                            {secondary && row[secondary] ? `: ${String(row[secondary])}` : ''}
                          </span>
                          {typeof row.ts === 'number' && (
                            <button type="button" onClick={() => jumpToRecording(row.ts as number)} className="font-mono text-[11.5px] text-eb-accent hover:underline">
                              {formatTimelineTime(row.ts as number)}
                            </button>
                          )}
                        </div>
                        {typeof row.quote === 'string' && (
                          <p className="mt-1 border-l-2 border-eb-border pl-2.5 font-dmsans text-[12.5px] italic leading-[1.5] text-eb-secondary">
                            “{row.quote}”
                          </p>
                        )}
                      </div>
                    ))}
                  </EbCard>
                );
              })}
              {(facts.validation?.unverified?.length ?? 0) > 0 && (
                <EbCard>
                  <EbLabel className="text-eb-amber-text">Unverified claims</EbLabel>
                  <ul className="mt-2 flex flex-col gap-1.5">
                    {facts.validation!.unverified.map((claim, i) => (
                      <li key={i} className="font-dmsans text-[13px] leading-[1.5] text-eb-prose">{claim}</li>
                    ))}
                  </ul>
                </EbCard>
              )}
            </div>
          )}

          {activeTab === 'delivery' && (
            <EbCard padded={false}>
              <EbCardHeader title="Email deliveries" count={emailMessages.length || undefined} />
              {emailMessages.length === 0 ? (
                <p className="px-[18px] py-8 text-center font-dmsans text-[13px] text-eb-secondary">
                  Nothing sent yet. Use Email above to send this report.
                </p>
              ) : (
                emailMessages.map((msg, i) => (
                  <div key={i} className="flex items-center gap-3 border-b border-eb-divider px-[18px] py-3 last:border-0">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-dmsans text-[13.5px] font-medium">{msg.recipient_email}</div>
                      <div className="font-mono text-[11.5px] text-eb-secondary">
                        {formatIST(new Date(msg.sent_at || msg.created_at), 'MMM d, yyyy h:mm a')}
                      </div>
                      {msg.error_message && (
                        <div className="font-dmsans text-[12px] text-eb-red">{msg.error_message}</div>
                      )}
                    </div>
                    <EbBadge tone={msg.status === 'sent' ? 'green' : msg.status === 'failed' ? 'red' : 'neutral'} dot>
                      {msg.status === 'sent' ? 'Sent' : msg.status === 'failed' ? 'Failed' : 'Pending'}
                    </EbBadge>
                  </div>
                ))
              )}
            </EbCard>
          )}
        </>
      ) : inProgress ? (
        <EbCard className="py-14 text-center">
          <Loader2 className="mx-auto mb-4 h-8 w-8 animate-spin text-eb-muted" />
          <div className="mx-auto mb-4 flex max-w-md items-center justify-center gap-2 font-dmsans text-[12px]">
            {(['Recording', 'Transcribing & analysing', 'Ready'] as const).map((label, idx) => {
              const current = ['joining', 'in_call', 'recording'].includes(meeting.status) ? 0 : 1;
              const state = idx < current ? 'done' : idx === current ? 'active' : 'todo';
              return (
                <span key={label} className="flex items-center gap-2">
                  <span className={cn('inline-block h-2 w-2 rounded-full', state === 'todo' ? 'bg-eb-chip' : 'bg-eb-accent', state === 'done' && 'opacity-50')} />
                  <span className={state === 'active' ? 'font-semibold text-eb-text' : 'text-eb-secondary'}>{label}</span>
                  {idx < 2 && <span aria-hidden className="text-eb-chip">—</span>}
                </span>
              );
            })}
          </div>
          <p className="font-dmsans text-sm font-medium">
            {meeting.status === 'transcribing'
              ? 'Transcribing the meeting…'
              : meeting.status === 'joining' || meeting.status === 'in_call'
                ? 'The bot is joining the meeting…'
                : 'Processing the meeting…'}
          </p>
          <p className="mx-auto mt-1 max-w-sm font-dmsans text-[13px] text-eb-secondary">
            This usually takes a few minutes.
          </p>
        </EbCard>
      ) : (
        <div className="flex flex-col gap-4">
          <EbCard className="text-center">
            <p className="font-dmsans text-sm font-medium">No insights for this meeting</p>
            <p className="mt-1 font-dmsans text-[13px] text-eb-secondary">It has not been processed yet.</p>
          </EbCard>
          {/* A meeting with no insights still has a recording worth watching, and
              audio for a failed meeting is kept far longer than usual. */}
          <RecordingPlayer meetingId={meeting.id} />
        </div>
      )}
    </DashboardLayout>
  );
}
