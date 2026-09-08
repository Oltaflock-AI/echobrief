import { useEffect, useMemo, useState } from 'react';
import { formatIST } from '@/lib/time';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { ListSkeleton } from '@/components/dashboard/ListSkeleton';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { RecordingButton } from '@/components/dashboard/RecordingButton';
import { UploadButton } from '@/components/dashboard/UploadButton';
import { GoogleReconnectBanner } from '@/components/dashboard/GoogleReconnectBanner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Meeting, asMeetings } from '@/types/meeting';
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
import { ChevronRight, Mic, Clock, CheckCircle2, Sparkles, AlertTriangle, X } from 'lucide-react';
import { Link } from 'react-router-dom';

// Meetings that produced no content never reach the dashboard. Cancelled means
// the bot was never admitted; failed means the pipeline gave up. Both rows stay
// in the database — a failed meeting is still reachable at /meeting/:id from
// search or an alert, and can be reprocessed — but nothing lists them here.
const HIDDEN_STATUSES = new Set<string>(['cancelled', 'failed']);

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

function statusConfig(status: string) {
  switch (status) {
    case 'joining': return { label: 'Joining', color: 'hsl(var(--warning))', tint: 'color-mix(in oklch, hsl(var(--warning)) 14%, transparent)' };
    case 'in_call': return { label: 'In call', color: 'hsl(var(--warning))', tint: 'color-mix(in oklch, hsl(var(--warning)) 14%, transparent)' };
    case 'recording': return { label: 'Recording', color: 'var(--ember)', tint: 'color-mix(in oklch, var(--ember) 12%, transparent)' };
    case 'transcribing': return { label: 'Transcribing', color: 'hsl(var(--warning))', tint: 'color-mix(in oklch, hsl(var(--warning)) 14%, transparent)' };
    case 'processing': return { label: 'Processing', color: 'hsl(var(--warning))', tint: 'color-mix(in oklch, hsl(var(--warning)) 14%, transparent)' };
    case 'completed': return { label: 'Completed', color: 'hsl(var(--success))', tint: 'color-mix(in oklch, hsl(var(--success)) 14%, transparent)' };
    default: return { label: 'Scheduled', color: 'var(--ink-soft)', tint: 'color-mix(in oklch, var(--ink) 8%, transparent)' };
  }
}

function sourceLabel(source?: string) {
  switch (source) {
    case 'google_meet': return 'Google Meet';
    case 'zoom': return 'Zoom';
    case 'teams': return 'Teams';
    default: return 'Recording';
  }
}

function formatDuration(seconds?: number) {
  if (!seconds) return '';
  const mins = Math.floor(seconds / 60);
  return `${mins} min`;
}

function formatTotalHours(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export default function Dashboard() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const prefillMeeting = (location.state as { prefillMeeting?: PrefillMeeting })?.prefillMeeting;

  // Onboarding gate — independent of meetings, so it runs in parallel.
  const { data: profile } = useQuery({
    queryKey: ['profile-onboarding', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('onboarding_completed')
        .eq('user_id', user!.id)
        .maybeSingle();
      return data ?? null;
    },
  });

  useEffect(() => {
    if (profile && !profile.onboarding_completed) navigate('/onboarding');
  }, [profile, navigate]);

  const { data: meetings = [], isLoading: loading, error } = useQuery({
    queryKey: ['meetings', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('meetings')
        .select('*')
        .eq('user_id', user!.id)
        .not('status', 'in', `(${[...HIDDEN_STATUSES].join(',')})`)
        .order('start_time', { ascending: false });
      if (error) throw error;
      return asMeetings(data ?? []);
    },
  });

  const fetchError = error ? (error instanceof Error ? error.message : 'Could not load meetings') : null;

  const meetingIds = meetings.map((m) => m.id);
  const { data: insightCounts = {} } = useQuery({
    queryKey: ['meeting-insight-flags', user?.id, meetingIds],
    enabled: !!user && meetingIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from('meeting_insights')
        .select('meeting_id')
        .in('meeting_id', meetingIds);
      const counts: Record<string, boolean> = {};
      (data ?? []).forEach((i) => { counts[i.meeting_id] = true; });
      return counts;
    },
  });

  // Failed/cancelled meetings from the last 7 days. They are hidden from the
  // main list (see HIDDEN_STATUSES) but should not vanish silently — this
  // section tells the user what went wrong and lets them clear it.
  const { data: attentionMeetings = [] } = useQuery({
    queryKey: ['meetings-attention', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('meetings')
        .select('*')
        .eq('user_id', user!.id)
        .in('status', ['failed', 'cancelled'])
        .gte('start_time', since)
        .order('start_time', { ascending: false });
      if (error) throw error;
      return asMeetings(data ?? []);
    },
  });

  const [dismissingId, setDismissingId] = useState<string | null>(null);

  // Same delete path as the meeting page: children first, then the meeting
  // row scoped to the owner. Failed/cancelled meetings rarely have children
  // or audio, but the extra deletes are no-ops when they don't.
  const handleDismissAttention = async (meeting: Meeting) => {
    if (!user) return;
    setDismissingId(meeting.id);
    try {
      await supabase.from('meeting_insights').delete().eq('meeting_id', meeting.id);
      await supabase.from('transcripts').delete().eq('meeting_id', meeting.id);
      if (meeting.audio_url) {
        await supabase.storage.from('recordings').remove([meeting.audio_url]);
      }
      const { error } = await supabase.from('meetings').delete().eq('id', meeting.id).eq('user_id', user.id);
      if (error) throw error;
      queryClient.setQueryData<Meeting[]>(['meetings-attention', user.id], (prev = []) =>
        prev.filter((m) => m.id !== meeting.id)
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to remove meeting';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    } finally {
      setDismissingId(null);
    }
  };

  // Realtime: patch the cached meetings list in place instead of refetching.
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`meetings-changes-${user.id}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'meetings', filter: `user_id=eq.${user.id}` },
        (payload) => {
          queryClient.setQueryData<Meeting[]>(['meetings', user.id], (prev = []) => {
            const next = (() => {
              if (payload.eventType === 'INSERT') return [payload.new as Meeting, ...prev];
              if (payload.eventType === 'UPDATE') return prev.map((m) => (m.id === (payload.new as Meeting).id ? (payload.new as Meeting) : m));
              if (payload.eventType === 'DELETE') return prev.filter((m) => m.id !== (payload.old as Meeting).id);
              return prev;
            })();
            // Same rule as the query: a meeting that just became cancelled or
            // failed drops off the list instead of lingering with a red badge.
            return next.filter((m) => !HIDDEN_STATUSES.has(m.status));
          });
          // A meeting flipping to failed/cancelled (or being deleted) belongs
          // in / leaves the needs-attention list — refetch that small query.
          queryClient.invalidateQueries({ queryKey: ['meetings-attention', user.id] });
        })
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [user, queryClient]);

  const stats = useMemo(() => {
    const totalMeetings = meetings.length;
    const totalDuration = meetings.reduce((sum, m) => sum + (m.duration_seconds || 0), 0);
    const summarized = Object.keys(insightCounts).length;
    const timeSavedMin = Math.round((totalDuration / 60) * 0.25);
    return { totalMeetings, totalDuration, summarized, timeSavedMin };
  }, [meetings, insightCounts]);

  const firstName = user?.user_metadata?.full_name?.split(' ')[0] || user?.email?.split('@')[0] || 'there';

  const renderMeetingRow = (meeting: Meeting, first: boolean) => {
    const s = statusConfig(meeting.status || 'scheduled');
    const hasSummary = insightCounts[meeting.id];
    const lang = (meeting as any).language;
    return (
      <Link
        key={meeting.id}
        to={`/meeting/${meeting.id}`}
        className="row-hover group flex items-center gap-3 px-4 py-4 no-underline sm:gap-4 sm:px-5 md:px-6"
        style={{
          borderTop: first ? 'none' : '1px solid var(--rule-soft)',
        }}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="text-[14.5px] font-semibold truncate"
              style={{ color: 'var(--ink)' }}
            >
              {meeting.title || 'Untitled meeting'}
            </span>
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium"
              style={{ background: s.tint, color: s.color }}
            >
              {meeting.status === 'recording' && (
                <span className="status-dot recording" style={{ width: 6, height: 6 }} />
              )}
              {s.label}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12.5px]" style={{ color: 'var(--ink-soft)' }}>
            <span>{sourceLabel(meeting.source)}</span>
            <span aria-hidden>·</span>
            <span>{formatIST(new Date(meeting.start_time), 'MMM d, h:mm a')}</span>
            {meeting.duration_seconds && (
              <>
                <span aria-hidden>·</span>
                <span>{formatDuration(meeting.duration_seconds)}</span>
              </>
            )}
            {lang && (
              <>
                <span aria-hidden>·</span>
                <span>{lang}</span>
              </>
            )}
            {hasSummary && (
              <>
                <span aria-hidden>·</span>
                <span style={{ color: 'var(--ember-deep)', fontWeight: 500 }}>Summary ready</span>
              </>
            )}
          </div>
        </div>
        <ChevronRight
          size={16}
          strokeWidth={1.75}
          style={{ color: 'var(--ink-faint)' }}
          className="shrink-0 transition-transform group-hover:translate-x-0.5"
        />
      </Link>
    );
  };

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6 md:px-8 md:py-10">
        {/* Header */}
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1
              className="text-[28px] font-semibold leading-tight"
              style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}
            >
              Welcome back, {firstName}
            </h1>
            <p className="mt-1 text-[14px]" style={{ color: 'var(--ink-mid)' }}>
              Here's what's happening with your meetings.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <UploadButton onUploaded={() => queryClient.invalidateQueries({ queryKey: ['meetings', user?.id] })} />
            <RecordingButton
              prefillTitle={prefillMeeting?.title}
              calendarEventId={prefillMeeting?.calendarEventId}
              meetingLink={prefillMeeting?.meetingLink}
              attendees={prefillMeeting?.attendees}
            />
          </div>
        </div>

        <GoogleReconnectBanner />

        {fetchError && !loading && (
          <div
            role="alert"
            className="mb-6 rounded-md px-4 py-3 text-[13.5px]"
            style={{
              border: '1px solid color-mix(in oklch, hsl(var(--destructive)) 25%, transparent)',
              background: 'color-mix(in oklch, hsl(var(--destructive)) 7%, transparent)',
              color: 'hsl(var(--destructive))',
            }}
          >
            {fetchError}
          </div>
        )}

        {/* Stats */}
        {!loading && meetings.length > 0 && (
          <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
            {[
              { label: 'Meetings', value: String(stats.totalMeetings), icon: Mic },
              { label: 'Recorded', value: formatTotalHours(stats.totalDuration), icon: Clock },
              { label: 'Summarized', value: String(stats.summarized), icon: CheckCircle2 },
              { label: 'Time saved', value: `~${Math.floor(stats.timeSavedMin / 60) || stats.timeSavedMin}${stats.timeSavedMin >= 60 ? 'h' : 'm'}`, icon: Sparkles, accent: true },
            ].map((s) => (
              <div
                key={s.label}
                className="rounded-xl p-5"
                style={{
                  background: 'var(--paper-card)',
                  border: '1px solid var(--rule)',
                }}
              >
                <div className="flex items-center justify-between">
                  <p className="text-[13px]" style={{ color: 'var(--ink-mid)' }}>
                    {s.label}
                  </p>
                  <s.icon
                    className="h-[15px] w-[15px]"
                    strokeWidth={1.75}
                    style={{ color: s.accent ? 'var(--ember)' : 'var(--ink-soft)' }}
                  />
                </div>
                <p
                  className="mt-2 text-[26px] font-semibold leading-none"
                  style={{ color: s.accent ? 'var(--ember-deep)' : 'var(--ink)', letterSpacing: '-0.02em' }}
                >
                  {s.value}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Needs attention — failed/cancelled meetings from the last 7 days.
            Renders nothing when the list is empty. */}
        {attentionMeetings.length > 0 && (
          <div className="mb-8">
            <div className="mb-3 flex items-center gap-2">
              <AlertTriangle className="h-[15px] w-[15px]" strokeWidth={1.75} style={{ color: 'hsl(var(--destructive))' }} />
              <h2 className="text-[15px] font-semibold" style={{ color: 'var(--ink)', letterSpacing: '-0.01em' }}>
                Needs attention
              </h2>
            </div>
            <div
              className="overflow-hidden rounded-xl"
              style={{ border: '1px solid color-mix(in oklch, hsl(var(--destructive)) 25%, var(--rule))', background: 'var(--paper-card)' }}
            >
              {attentionMeetings.map((meeting, idx) => {
                const isCancelled = meeting.status === 'cancelled';
                const reason =
                  meeting.error_message ||
                  (isCancelled ? 'The bot was not admitted to the meeting' : 'Processing failed');
                return (
                  <div
                    key={meeting.id}
                    className="flex items-center gap-3 px-5 py-3.5 md:px-6"
                    style={{ borderTop: idx === 0 ? 'none' : '1px solid var(--rule-soft)' }}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          to={`/meeting/${meeting.id}`}
                          className="text-[13.5px] font-semibold no-underline hover:underline truncate"
                          style={{ color: 'var(--ink)' }}
                        >
                          {meeting.title || 'Untitled meeting'}
                        </Link>
                        <span
                          className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
                          style={{
                            background: 'color-mix(in oklch, hsl(var(--destructive)) 12%, transparent)',
                            color: 'hsl(var(--destructive))',
                          }}
                        >
                          {isCancelled ? 'Cancelled' : 'Failed'}
                        </span>
                        <span className="text-[12px]" style={{ color: 'var(--ink-soft)' }}>
                          {formatIST(new Date(meeting.start_time), 'MMM d, h:mm a')}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-[12.5px]" style={{ color: 'var(--ink-mid)' }} title={reason}>
                        {reason}
                      </p>
                    </div>
                    {/* Removes the meeting for good — transcript, insights and
                        archived audio included — so it asks first. */}
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <button
                          type="button"
                          disabled={dismissingId === meeting.id}
                          className="inline-flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1 text-[12.5px] font-medium transition-colors disabled:opacity-50"
                          style={{ border: '1px solid var(--rule)', background: 'transparent', color: 'var(--ink-mid)' }}
                          title="Delete this meeting"
                        >
                          <X className="h-3 w-3" strokeWidth={2} />
                          Delete
                        </button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete this meeting?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Removes “{meeting.title || 'Untitled meeting'}” along with its
                            transcript, insights and archived audio. This cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDismissAttention(meeting)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Section heading */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2
            className="text-[17px] font-semibold"
            style={{ color: 'var(--ink)', letterSpacing: '-0.01em' }}
          >
            Recent meetings
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            {!loading && meetings.length > 0 && (
              <span className="text-[13px]" style={{ color: 'var(--ink-soft)' }}>
                {meetings.length} total
              </span>
            )}
          </div>
        </div>

        {/* List */}
        {loading ? (
          <ListSkeleton rows={5} />
        ) : meetings.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center gap-4 rounded-xl px-6 py-16 text-center"
            style={{ border: '1px dashed var(--rule)', background: 'var(--paper-card)' }}
          >
            <Mic className="h-10 w-10" strokeWidth={1.5} style={{ color: 'var(--ink-faint)' }} />
            <div className="max-w-md space-y-1.5">
              <p className="text-[17px] font-semibold" style={{ color: 'var(--ink)' }}>
                No meetings yet
              </p>
              <p style={{ color: 'var(--ink-mid)', fontSize: 14, lineHeight: 1.6 }}>
                Click Record to capture your first meeting. Summaries and insights will appear here.
              </p>
            </div>
          </div>
        ) : (
          <div
            className="overflow-hidden rounded-xl"
            style={{ border: '1px solid var(--rule)', background: 'var(--paper-card)' }}
          >
            {meetings.map((meeting, idx) => renderMeetingRow(meeting, idx === 0))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
