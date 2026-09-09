/**
 * Meetings home — Console (UI v2).
 *
 * The data layer is Dashboard.tsx's, unchanged: the same onboarding gate, the
 * same meetings query with HIDDEN_STATUSES, the same needs-attention query and
 * dismissal path, and the same realtime subscription that patches the cache in
 * place rather than refetching.
 *
 * What is new is the right rail the mockup calls for, and it reads only tables
 * that already exist — today's calendar_events, action items due this week from
 * meeting_insights, and the account brief on a contacts row. The prep card
 * renders ONLY when there is a real brief to read; an empty dark panel promising
 * a briefing that does not exist is worse than no panel.
 *
 * The insight query is keyed separately from V1's because it returns a
 * different shape (action-item counts, not just a boolean). Sharing the key
 * while both UIs exist would let one fill the other's cache with the wrong
 * thing.
 */

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2, ChevronRight, Clock, Mic, Sparkles, X,
} from "lucide-react";
import { formatIST } from "@/lib/time";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { AppShell } from "@/components/shell/AppShell";
import { GoogleReconnectBanner } from "@/components/dashboard/GoogleReconnectBanner";
import { ListSkeleton } from "@/components/dashboard/ListSkeleton";
import { Meeting, asMeetings } from "@/types/meeting";
import {
  Avatar, Badge, Button, Card, CardHeader, Chip, DarkPanel, Divider, PageHeader, StatTile, TwoColumn,
} from "@/ui";
import { cn } from "@/lib/utils";
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
} from "@/components/ui/alert-dialog";

/** Same rule as V1: a meeting that produced no content is not listed here. */
const HIDDEN_STATUSES = new Set<string>(["cancelled", "failed"]);

type FilterKey = "all" | "week" | "external" | "actions";

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: "all", label: "All" },
  { key: "week", label: "Last 7 days" },
  { key: "external", label: "External" },
  { key: "actions", label: "With action items" },
];

type Attendee = { email?: string; displayName?: string | null; organizer?: boolean };

function statusTone(status: string): { tone: "green" | "amber" | "accent" | "neutral"; label: string } {
  switch (status) {
    case "completed": return { tone: "green", label: "Summarized" };
    case "recording": return { tone: "accent", label: "Recording" };
    case "joining": return { tone: "amber", label: "Joining" };
    case "in_call": return { tone: "amber", label: "In call" };
    case "transcribing": return { tone: "amber", label: "Transcribing" };
    case "processing": return { tone: "amber", label: "Processing" };
    default: return { tone: "neutral", label: "Scheduled" };
  }
}

function sourceLabel(source?: string) {
  switch (source) {
    case "google_meet": return "Google Meet";
    case "zoom": return "Zoom";
    case "teams": return "Teams";
    default: return "Recording";
  }
}

function formatTotalHours(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
}

/** The owner's domain, from whichever attendee is flagged organizer. */
function ownerDomain(attendees: Attendee[], fallbackEmail?: string): string | null {
  const organizer = attendees.find((a) => a.organizer)?.email ?? fallbackEmail;
  const at = organizer?.indexOf("@") ?? -1;
  return at > -1 ? organizer!.slice(at + 1).toLowerCase() : null;
}

function hasExternal(attendees: Attendee[], fallbackEmail?: string): boolean {
  const domain = ownerDomain(attendees, fallbackEmail);
  if (!domain) return false;
  return attendees.some((a) => {
    const at = a.email?.indexOf("@") ?? -1;
    return at > -1 && a.email!.slice(at + 1).toLowerCase() !== domain;
  });
}

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [filter, setFilter] = useState<FilterKey>("all");

  /* ── the V1 data layer, unchanged ──────────────────────────────────────── */

  const { data: profile } = useQuery({
    queryKey: ["profile-onboarding", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("onboarding_completed")
        .eq("user_id", user!.id)
        .maybeSingle();
      return data ?? null;
    },
  });

  useEffect(() => {
    if (profile && !profile.onboarding_completed) navigate("/onboarding");
  }, [profile, navigate]);

  const { data: meetings = [], isLoading: loading, error, refetch, isFetching } = useQuery({
    queryKey: ["meetings", user?.id],
    enabled: !!user,
    queryFn: async () => {
      // No `user_id` filter: RLS returns the caller's meetings plus any they
      // hold an observer grant on (an allowlisted reviewer who was on the
      // invite). `attention` and `due this week` below stay owner-scoped on
      // purpose — someone else's failed meeting is not this user's to fix, and
      // their action items are not this user's to do.
      const { data, error } = await supabase
        .from("meetings")
        .select("*")
        .not("status", "in", `(${[...HIDDEN_STATUSES].join(",")})`)
        .order("start_time", { ascending: false });
      if (error) throw error;
      return asMeetings(data ?? []);
    },
  });

  const fetchError = error ? (error instanceof Error ? error.message : "Could not load meetings") : null;

  const meetingIds = meetings.map((m) => m.id);
  const { data: insights = {} } = useQuery({
    queryKey: ["meeting-insight-flags-v2", user?.id, meetingIds],
    enabled: !!user && meetingIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("meeting_insights")
        .select("meeting_id, action_items")
        .in("meeting_id", meetingIds);
      const out: Record<string, { summarized: boolean; actions: number }> = {};
      (data ?? []).forEach((row) => {
        const items = Array.isArray(row.action_items) ? row.action_items : [];
        out[row.meeting_id] = { summarized: true, actions: items.length };
      });
      return out;
    },
  });

  const { data: attentionMeetings = [] } = useQuery({
    queryKey: ["meetings-attention", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("meetings")
        .select("*")
        .eq("user_id", user!.id)
        .in("status", ["failed", "cancelled"])
        .gte("start_time", since)
        .order("start_time", { ascending: false });
      if (error) throw error;
      return asMeetings(data ?? []);
    },
  });

  const [dismissingId, setDismissingId] = useState<string | null>(null);

  // Same delete path as the meeting page: children first, then the meeting row
  // scoped to the owner.
  const handleDismissAttention = async (meeting: Meeting) => {
    if (!user) return;
    setDismissingId(meeting.id);
    try {
      await supabase.from("meeting_insights").delete().eq("meeting_id", meeting.id);
      await supabase.from("transcripts").delete().eq("meeting_id", meeting.id);
      if (meeting.audio_url) {
        await supabase.storage.from("recordings").remove([meeting.audio_url]);
      }
      const { error } = await supabase.from("meetings").delete().eq("id", meeting.id).eq("user_id", user.id);
      if (error) throw error;
      queryClient.setQueryData<Meeting[]>(["meetings-attention", user.id], (prev = []) =>
        prev.filter((m) => m.id !== meeting.id),
      );
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to remove meeting",
        variant: "destructive",
      });
    } finally {
      setDismissingId(null);
    }
  };

  // Realtime: patch the cached list in place instead of refetching.
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`meetings-changes-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "meetings", filter: `user_id=eq.${user.id}` },
        (payload) => {
          queryClient.setQueryData<Meeting[]>(["meetings", user.id], (prev = []) => {
            const next = (() => {
              if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
                const changed = payload.new as Meeting;
                return [changed, ...prev.filter((m) => m.id !== changed.id)]
                  .sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime());
              }
              if (payload.eventType === "DELETE") return prev.filter((m) => m.id !== (payload.old as Meeting).id);
              return prev;
            })();
            return next.filter((m) => !HIDDEN_STATUSES.has(m.status));
          });
          queryClient.invalidateQueries({ queryKey: ["meetings-attention", user.id] });
          queryClient.invalidateQueries({ queryKey: ["meeting-insight-flags-v2", user.id] });
          queryClient.invalidateQueries({ queryKey: ["due-this-week", user.id] });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user, queryClient]);

  /* ── the rail ──────────────────────────────────────────────────────────── */

  const { data: todayEvents = [] } = useQuery({
    queryKey: ["today-events", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const now = new Date();
      const endOfDay = new Date(`${formatIST(now, "yyyy-MM-dd")}T23:59:59.999+05:30`);
      const { data } = await supabase
        .from("calendar_events")
        .select("event_id, title, start_time, end_time, meeting_link, attendees")
        .eq("user_id", user!.id)
        .gte("start_time", now.toISOString())
        .lte("start_time", endOfDay.toISOString())
        .order("start_time", { ascending: true });
      return data ?? [];
    },
  });

  const { data: dueThisWeek = [] } = useQuery({
    queryKey: ["due-this-week", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data: rows } = await supabase
        .from("meetings")
        .select("id, title, meeting_insights (action_items)")
        .eq("user_id", user!.id)
        .order("start_time", { ascending: false })
        .limit(40);
      const { data: completions } = await supabase
        .from("action_item_completions")
        .select("meeting_id, action_item_index, completed")
        .eq("user_id", user!.id);
      const done = new Set(
        (completions ?? [])
          .filter((c) => c.completed)
          .map((c) => `${c.meeting_id}-${c.action_item_index}`),
      );

      const weekEnd = new Date();
      weekEnd.setDate(weekEnd.getDate() + 7);

      const out: Array<{ key: string; task: string; due: string; meetingId: string }> = [];
      (rows ?? []).forEach((row: Record<string, unknown>) => {
        const insight = (row.meeting_insights as Array<{ action_items?: unknown }> | null)?.[0];
        const items = Array.isArray(insight?.action_items) ? insight!.action_items : [];
        items.forEach((raw, index) => {
          if (!raw || typeof raw !== "object") return;
          const item = raw as { task?: string; due_date_resolved?: string };
          const key = `${row.id}-${index}`;
          if (done.has(key) || !item.due_date_resolved || !item.task) return;
          const due = new Date(item.due_date_resolved);
          if (Number.isNaN(due.getTime()) || due > weekEnd) return;
          out.push({ key, task: item.task, due: item.due_date_resolved, meetingId: String(row.id) });
        });
      });
      return out.sort((a, b) => a.due.localeCompare(b.due)).slice(0, 5);
    },
  });

  // The prep card is only drawn when there is a brief to read. It looks up the
  // first external attendee of the next event against contacts.account_brief.
  const nextExternalEmail = useMemo(() => {
    for (const event of todayEvents as Array<{ attendees?: Attendee[] }>) {
      const attendees = Array.isArray(event.attendees) ? event.attendees : [];
      const domain = ownerDomain(attendees, user?.email ?? undefined);
      const guest = attendees.find((a) => {
        const at = a.email?.indexOf("@") ?? -1;
        return at > -1 && a.email!.slice(at + 1).toLowerCase() !== domain;
      });
      if (guest?.email) return guest.email.toLowerCase();
    }
    return null;
  }, [todayEvents, user?.email]);

  const { data: prepContact } = useQuery({
    queryKey: ["prep-contact", user?.id, nextExternalEmail],
    enabled: !!user && !!nextExternalEmail,
    queryFn: async () => {
      const { data } = await supabase
        .from("contacts" as never)
        .select("email, name, company, account_brief")
        .eq("user_id", user!.id)
        .eq("email", nextExternalEmail!)
        .maybeSingle();
      return (data ?? null) as { name?: string; company?: string; account_brief?: string } | null;
    },
  });

  /* ── derived ───────────────────────────────────────────────────────────── */

  // Stats count what this user recorded. Observed meetings belong to someone
  // else's totals and would inflate "time saved" for everybody on the reviewer
  // list.
  const ownMeetings = useMemo(
    () => meetings.filter((m) => (m as unknown as { user_id?: string }).user_id === user?.id),
    [meetings, user?.id],
  );

  const stats = useMemo(() => {
    const totalDuration = ownMeetings.reduce((sum, m) => sum + (m.duration_seconds || 0), 0);
    return {
      totalMeetings: ownMeetings.length,
      totalDuration,
      summarized: ownMeetings.filter((m) => insights[m.id]?.summarized).length,
      timeSavedMin: Math.round((totalDuration / 60) * 0.25),
    };
  }, [ownMeetings, insights]);

  const visible = useMemo(() => {
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return meetings.filter((m) => {
      if (filter === "week") return new Date(m.start_time).getTime() >= weekAgo;
      if (filter === "external")
        return hasExternal(((m as unknown as { attendees?: Attendee[] }).attendees) ?? [], user?.email ?? undefined);
      if (filter === "actions") return (insights[m.id]?.actions ?? 0) > 0;
      return true;
    });
  }, [meetings, filter, insights, user?.email]);

  return (
    <AppShell>
      <PageHeader
        title="Meetings"
        subtitle="Everything EchoBrief recorded and summarized for you."
      />

      <GoogleReconnectBanner />

      {fetchError && (
        <Card className="mb-5 border-eb-red-border bg-eb-red-bg">
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-dmsans text-sm font-semibold text-eb-red">Couldn’t load your meetings</p>
              <p className="mt-1 text-[13px] text-eb-secondary">Check your connection and try again.</p>
            </div>
            <Button onClick={() => void refetch()} disabled={isFetching}>{isFetching ? "Retrying…" : "Try again"}</Button>
          </div>
        </Card>
      )}

      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Meetings" value={loading || fetchError ? "—" : String(stats.totalMeetings)} icon={<Mic size={15} strokeWidth={1.75} />} />
        <StatTile label="Recorded" value={loading || fetchError ? "—" : formatTotalHours(stats.totalDuration)} icon={<Clock size={15} strokeWidth={1.75} />} />
        <StatTile
          label="Summarized"
          value={loading || fetchError ? "—" : String(stats.summarized)}
          delta={stats.totalMeetings > 0 && stats.summarized === stats.totalMeetings ? "all caught up" : undefined}
          icon={<CheckCircle2 size={15} strokeWidth={1.75} />}
        />
        <StatTile
          label="Time saved"
          value={loading || fetchError ? "—" : `~${formatTotalHours(stats.timeSavedMin * 60)}`}
          delta="vs. manual notes"
          icon={<Sparkles size={15} strokeWidth={1.75} />}
          accent
        />
      </div>

      <TwoColumn
        rail={
          <div className="flex flex-col gap-4">
            <Card padded={false}>
              <CardHeader
                title="Today"
                right={
                  <span className="pr-2 font-dmsans text-[12.5px] text-eb-secondary">
                    {formatIST(new Date(), "EEE, MMM d")}
                  </span>
                }
              />
              {todayEvents.length === 0 ? (
                <p className="px-[18px] py-4 font-dmsans text-[12.5px] text-eb-secondary">
                  Nothing else on the calendar today.
                </p>
              ) : (
                <div className="py-1">
                  {(todayEvents as Array<Record<string, string>>).map((event) => (
                    <div key={event.event_id} className="flex gap-3 px-[18px] py-2.5">
                      <span className="w-[62px] flex-none pt-0.5 font-mono text-[11.5px] text-eb-secondary">
                        {formatIST(new Date(event.start_time), "h:mm a")}
                      </span>
                      <span className="border-l-2 border-eb-accent pl-3">
                        <span className="block font-dmsans text-[13px] font-medium">{event.title}</span>
                        {event.meeting_link && (
                          <span className="block font-dmsans text-[12px] text-eb-secondary">Bot will join</span>
                        )}
                      </span>
                    </div>
                  ))}
                  <div className="px-[18px] pb-3 pt-1">
                    <Link to="/calendar" className="font-dmsans text-[12.5px] text-eb-accent no-underline hover:underline">
                      Open calendar →
                    </Link>
                  </div>
                </div>
              )}
            </Card>

            {prepContact?.account_brief && (
              <DarkPanel eyebrow="Prep">
                <div className="font-outfit text-[15px] font-semibold text-white">
                  {prepContact.name || nextExternalEmail}
                  {prepContact.company ? `, ${prepContact.company}` : ""}
                </div>
                <p className="mt-1.5 line-clamp-4 font-dmsans text-[13px] leading-[1.55]">
                  {prepContact.account_brief}
                </p>
                <Link
                  to="/contacts"
                  className="mt-3 inline-block font-dmsans text-[12.5px] text-eb-accent-sidebar no-underline hover:underline"
                >
                  Read the brief →
                </Link>
              </DarkPanel>
            )}

            <Card padded={false}>
              <CardHeader title="Due soon & overdue" count={dueThisWeek.length || undefined} />
              {dueThisWeek.length === 0 ? (
                <p className="px-[18px] py-4 font-dmsans text-[12.5px] text-eb-secondary">
                  Nothing due in the next seven days.
                </p>
              ) : (
                <div className="py-1">
                  {dueThisWeek.map((item) => (
                    <Link
                      key={item.key}
                      to={`/meeting/${item.meetingId}`}
                      className="flex items-baseline gap-3 px-[18px] py-2.5 no-underline hover:bg-eb-row-hover"
                    >
                      <span className="flex-1 font-dmsans text-[13px] text-eb-text">{item.task}</span>
                      <span className="flex-none font-mono text-[11.5px] text-eb-secondary">
                        {item.due < formatIST(new Date(), "yyyy-MM-dd") ? "Overdue" : formatIST(new Date(item.due), "MMM d")}
                      </span>
                    </Link>
                  ))}
                  <div className="px-[18px] pb-3 pt-1">
                    <Link to="/action-items" className="font-dmsans text-[12.5px] text-eb-accent no-underline hover:underline">
                      All action items →
                    </Link>
                  </div>
                </div>
              )}
            </Card>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          {attentionMeetings.length > 0 && (
            <Card padded={false}>
              <CardHeader title="Needs attention" count={attentionMeetings.length} />
              {attentionMeetings.map((meeting) => (
                <div key={meeting.id} className="flex items-center gap-3 border-b border-eb-divider px-[18px] py-3 last:border-0">
                  <div className="min-w-0 flex-1">
                    <Link to={`/meeting/${meeting.id}`} className="block truncate font-dmsans text-sm font-medium text-eb-text no-underline hover:underline">
                      {meeting.title || "Untitled meeting"}
                    </Link>
                    <div className="font-dmsans text-[12.5px] text-eb-secondary">
                      {meeting.status === "cancelled" ? "The bot was never admitted" : "Processing failed"}
                      {" · "}
                      {formatIST(new Date(meeting.start_time), "MMM d")}
                    </div>
                  </div>
                  <Badge tone={meeting.status === "cancelled" ? "neutral" : "red"} dot>
                    {meeting.status === "cancelled" ? "Cancelled" : "Failed"}
                  </Badge>
                  {/* This removes the meeting for good — transcript, insights and
                      archived audio included — so it asks first. */}
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <button
                        type="button"
                        disabled={dismissingId === meeting.id}
                        aria-label={`Delete ${meeting.title || "meeting"}`}
                        title="Delete this meeting"
                        className="flex-none text-eb-muted hover:text-eb-red disabled:opacity-50"
                      >
                        <X size={16} strokeWidth={1.75} />
                      </button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="bg-eb-bg border-eb-border text-eb-text">
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete this meeting?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Removes “{meeting.title || "Untitled meeting"}” along with its
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
              ))}
            </Card>
          )}

          <Card padded={false}>
            <CardHeader
              title="Recent meetings"
              count={visible.length}
              right={
                <div className="flex gap-1.5 pr-1">
                  {FILTERS.map((f) => (
                    <Chip
                      key={f.key}
                      size="sm"
                      selected={filter === f.key && f.key !== "all"}
                      active={filter === f.key && f.key === "all"}
                      onClick={() => setFilter(f.key)}
                    >
                      {f.label}
                    </Chip>
                  ))}
                </div>
              }
            />

            {loading ? (
              <div className="p-4">
                <ListSkeleton />
              </div>
            ) : fetchError && meetings.length === 0 ? (
              <p className="px-[18px] py-8 text-center text-[13px] text-eb-secondary">Your meetings will appear here when the connection is restored.</p>
            ) : visible.length === 0 ? (
              <div className="flex flex-col items-center px-6 py-10 text-center">
                <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-pill bg-eb-accent-soft text-eb-accent"><Mic size={22} strokeWidth={1.75} /></span>
                <h2 className="text-base font-semibold text-eb-text">{meetings.length === 0 ? "Your next meeting, already briefed" : "No meetings match this filter"}</h2>
                <p className="mt-2 max-w-sm text-[13px] leading-relaxed text-eb-secondary">
                  {meetings.length === 0 ? "Use Record above to add a Google Meet, Zoom or Teams link, or upload an existing recording. Your summary and action items will appear here." : "Try another filter to find the meeting you’re looking for."}
                </p>
                <div className="mt-5">
                  {meetings.length === 0 ? <Link to="/calendar" className="text-sm font-medium text-eb-accent-text hover:underline">View your calendar →</Link> : <Button onClick={() => setFilter("all")}>Show all meetings</Button>}
                </div>
              </div>
            ) : (
              visible.map((meeting) => {
                const status = statusTone(meeting.status || "scheduled");
                const summarized = insights[meeting.id]?.summarized;
                const attendees = (((meeting as unknown as { attendees?: Attendee[] }).attendees) ?? [])
                  .map((a) => a.displayName || a.email)
                  .filter(Boolean) as string[];
                const shared = (meeting as unknown as { user_id?: string }).user_id !== user?.id;
                return (
                  <Link
                    key={meeting.id}
                    to={`/meeting/${meeting.id}`}
                    className="group flex items-center gap-3 border-b border-eb-divider px-[18px] py-[13px] no-underline last:border-0 hover:bg-eb-row-hover"
                  >
                    <Avatar name={meeting.title || "Untitled"} size={34} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-dmsans text-sm font-medium text-eb-text">
                        {meeting.title || "Untitled meeting"}
                      </div>
                      <div className="truncate font-dmsans text-[12.5px] text-eb-secondary">
                        {attendees.length > 0 ? attendees.slice(0, 3).join(", ") : sourceLabel(meeting.source)}
                      </div>
                      <div className="mt-1 truncate text-[11.5px] text-eb-secondary sm:hidden">{shared && "Shared · "}{formatIST(meeting.start_time, "MMM d, h:mm a")}</div>
                    </div>
                    <span className="hidden flex-none font-dmsans text-[12.5px] text-eb-secondary sm:block">
                      {formatIST(new Date(meeting.start_time), "MMM d, h:mm a")}
                    </span>
                    <span className="hidden w-14 flex-none text-right font-dmsans text-[12.5px] text-eb-secondary md:block">
                      {meeting.duration_seconds ? `${Math.floor(meeting.duration_seconds / 60)} min` : ""}
                    </span>
                    {shared && <span className="hidden sm:inline-flex"><Badge tone="neutral">Shared</Badge></span>}
                    <Badge tone={status.tone} dot={status.tone !== "neutral"}>
                      {summarized ? "Summarized" : status.label}
                    </Badge>
                    <ChevronRight
                      size={16}
                      strokeWidth={1.75}
                      className={cn("flex-none text-eb-muted transition-transform group-hover:translate-x-0.5")}
                    />
                  </Link>
                );
              })
            )}
          </Card>
        </div>
      </TwoColumn>
    </AppShell>
  );
}
