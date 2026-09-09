/**
 * Action items — Console (UI v2), from mockup 04-action-items.
 *
 * The data layer is ActionItems.tsx's, unchanged: items are elements of the
 * `meeting_insights.action_items` JSONB array (a bare string on older meetings,
 * an object with owner/priority/due dates since the two-pass pipeline), and
 * completion lives in `action_item_completions` keyed by
 * (user_id, meeting_id, action_item_index). Editing an item read-modify-writes
 * that single array element and preserves how it was stored.
 *
 * The mockup's "+ Add item" button is deliberately absent. Action items are
 * extracted from a meeting; there is no path that creates a free-standing one,
 * and no column to put it in.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, CalendarClock, ListTodo, Pencil, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { formatIST } from '@/lib/time';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { ListSkeleton } from '@/components/dashboard/ListSkeleton';
import {
  Avatar,
  Badge,
  Card,
  Chip,
  PageHeader,
  StatTile,
  Checkbox as EbCheckbox,
} from '@/ui';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { Json } from '@/integrations/supabase/types';

interface DueDateRange {
  start?: string;
  end?: string;
}

interface ActionItemData {
  task: string;
  owner?: string;
  priority?: 'low' | 'medium' | 'high';
  /** Raw spoken due date, e.g. "Tuesday" */
  due_date?: string;
  /** ISO "YYYY-MM-DD" when the pipeline could resolve the spoken date */
  due_date_resolved?: string;
  /** ISO date range when only a window (e.g. "next week") was resolvable */
  due_date_range?: DueDateRange;
}

interface Item {
  id: string;
  index: number;
  task: string;
  owner?: string;
  priority?: 'low' | 'medium' | 'high';
  due_date?: string;
  due_date_resolved?: string;
  due_date_range?: DueDateRange;
}

interface Group {
  id: string;
  insightsId: string;
  title: string;
  date: string;
  items: Item[];
}

type StatusFilter = 'all' | 'open' | 'completed';
type SortOption = 'due' | 'priority' | 'date';

const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2, undefined: 3 };
const PRIORITY_TONE = { high: 'red', medium: 'amber', low: 'neutral' } as const;

/** Human label for an item's due info, or null when it carries none. */
function dueLabel(item: Item): string | null {
  if (item.due_date_resolved) {
    const d = new Date(item.due_date_resolved);
    if (!Number.isNaN(d.getTime())) return formatIST(d, 'EEE, MMM d');
  }
  if (item.due_date_range?.start) {
    const d = new Date(item.due_date_range.start);
    if (!Number.isNaN(d.getTime())) return `Week of ${formatIST(d, 'MMM d')}`;
  }
  return item.due_date ?? null;
}

/** Overdue = resolved due date strictly before today (IST) on an open item. */
function isOverdue(item: Item, completed: boolean): boolean {
  if (completed || !item.due_date_resolved) return false;
  return item.due_date_resolved < formatIST(new Date(), 'yyyy-MM-dd');
}

/** "Today" / "Fri, Sep 4" for the group header, the way the mockup reads. */
function groupDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const today = formatIST(new Date(), 'yyyy-MM-dd');
  const that = formatIST(d, 'yyyy-MM-dd');
  if (that === today) return 'Today';
  return formatIST(d, 'EEE, MMM d');
}

export default function ActionItemsV2() {
  const { user } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  const [status, setStatus] = useState<StatusFilter>('open');
  const [meetingFilter, setMeetingFilter] = useState('all');
  const [ownerFilter, setOwnerFilter] = useState('all');
  const [sortBy, setSortBy] = useState<SortOption>('due');

  const fetchItems = useCallback(async () => {
    if (!user) return;
    try {
      const [{ data: meetings }, { data: completions }] = await Promise.all([
        supabase
          .from('meetings')
          .select('id, title, start_time, meeting_insights (id, action_items)')
          .eq('user_id', user.id)
          .order('start_time', { ascending: false }),
        supabase
          .from('action_item_completions')
          .select('meeting_id, action_item_index, completed')
          .eq('user_id', user.id),
      ]);

      setCompleted(
        new Set(
          (completions || [])
            .filter((c) => c.completed)
            .map((c) => `${c.meeting_id}-${c.action_item_index}`),
        ),
      );

      const next: Group[] = [];
      meetings?.forEach((meeting) => {
        const insights = meeting.meeting_insights?.[0];
        if (!insights?.action_items || !Array.isArray(insights.action_items)) return;
        const items: Item[] = (insights.action_items as (string | ActionItemData)[]).map(
          (raw, index) => {
            const data = typeof raw === 'object' && raw !== null ? (raw as ActionItemData) : undefined;
            return {
              id: `${meeting.id}-${index}`,
              index,
              task: data ? data.task : (raw as string),
              owner: data?.owner,
              priority: data?.priority,
              due_date: data?.due_date,
              due_date_resolved: data?.due_date_resolved,
              due_date_range: data?.due_date_range,
            };
          },
        );
        if (items.length > 0) {
          next.push({
            id: meeting.id,
            insightsId: insights.id,
            title: meeting.title,
            date: meeting.start_time,
            items,
          });
        }
      });
      setGroups(next);
    } catch (error) {
      console.error('Error fetching action items:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) fetchItems();
  }, [user, fetchItems]);

  const toggleComplete = async (item: Item, meetingId: string) => {
    if (!user) return;
    const next = !completed.has(item.id);

    // Optimistic, rolled back if the write fails.
    setCompleted((prev) => {
      const s = new Set(prev);
      if (next) s.add(item.id);
      else s.delete(item.id);
      return s;
    });

    const { error } = await supabase.from('action_item_completions').upsert(
      {
        user_id: user.id,
        meeting_id: meetingId,
        action_item_index: item.index,
        completed: next,
        completed_at: next ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,meeting_id,action_item_index' },
    );

    if (error) {
      console.error('[ActionItemsV2] completion save failed:', error);
      setCompleted((prev) => {
        const s = new Set(prev);
        if (next) s.delete(item.id);
        else s.add(item.id);
        return s;
      });
      toast.error('Could not save — please try again');
      return;
    }
    if (next) toast.success('Task marked complete');
  };

  const saveEdit = async (group: Group, item: Item) => {
    const text = editText.trim();
    setEditingId(null);
    if (!text || text === item.task) return;

    const previous = item.task;
    setGroups((prev) =>
      prev.map((g) =>
        g.id !== group.id
          ? g
          : { ...g, items: g.items.map((i) => (i.id === item.id ? { ...i, task: text } : i)) },
      ),
    );

    // The array element is rewritten in place, keeping whether it was stored as
    // a bare string or an object with metadata.
    const { data: row, error: readError } = await supabase
      .from('meeting_insights')
      .select('action_items')
      .eq('id', group.insightsId)
      .single();

    const revert = () =>
      setGroups((prev) =>
        prev.map((g) =>
          g.id !== group.id
            ? g
            : { ...g, items: g.items.map((i) => (i.id === item.id ? { ...i, task: previous } : i)) },
        ),
      );

    if (readError || !row || !Array.isArray(row.action_items)) {
      revert();
      toast.error('Could not save the change');
      return;
    }

    const updated = [...(row.action_items as (string | ActionItemData)[])];
    const existing = updated[item.index];
    updated[item.index] =
      typeof existing === 'object' && existing !== null ? { ...existing, task: text } : text;

    const { error: writeError } = await supabase
      .from('meeting_insights')
      .update({ action_items: updated as unknown as Json })
      .eq('id', group.insightsId);

    if (writeError) {
      revert();
      toast.error('Could not save the change');
    }
  };

  const owners = useMemo(() => {
    const set = new Set<string>();
    groups.forEach((g) => g.items.forEach((i) => i.owner && set.add(i.owner)));
    return [...set].sort();
  }, [groups]);

  const stats = useMemo(() => {
    const weekEnd = new Date();
    weekEnd.setDate(weekEnd.getDate() + 7);
    const weekEndIso = formatIST(weekEnd, 'yyyy-MM-dd');
    const today = formatIST(new Date(), 'yyyy-MM-dd');
    let open = 0;
    let dueThisWeek = 0;
    let done = 0;
    groups.forEach((g) =>
      g.items.forEach((i) => {
        if (completed.has(i.id)) {
          done += 1;
          return;
        }
        open += 1;
        const due = i.due_date_resolved ?? i.due_date_range?.start;
        if (due && due >= today && due <= weekEndIso) dueThisWeek += 1;
      }),
    );
    return { open, dueThisWeek, done };
  }, [groups, completed]);

  const visible = useMemo(() => {
    const out: Group[] = [];
    groups.forEach((g) => {
      if (meetingFilter !== 'all' && g.id !== meetingFilter) return;
      let items = g.items.filter((i) => {
        const done = completed.has(i.id);
        if (status === 'open' && done) return false;
        if (status === 'completed' && !done) return false;
        if (ownerFilter !== 'all' && (i.owner ?? '') !== ownerFilter) return false;
        return true;
      });
      if (items.length === 0) return;
      items = [...items].sort((a, b) => {
        if (sortBy === 'priority') {
          return PRIORITY_ORDER[a.priority ?? 'undefined'] - PRIORITY_ORDER[b.priority ?? 'undefined'];
        }
        if (sortBy === 'due') {
          const av = a.due_date_resolved ?? a.due_date_range?.start ?? '9999-12-31';
          const bv = b.due_date_resolved ?? b.due_date_range?.start ?? '9999-12-31';
          return av.localeCompare(bv);
        }
        return a.index - b.index;
      });
      out.push({ ...g, items });
    });
    return out;
  }, [groups, meetingFilter, ownerFilter, status, sortBy, completed]);

  const totalShown = visible.reduce((n, g) => n + g.items.length, 0);

  return (
    <DashboardLayout>
      <PageHeader
        title="Action items"
        subtitle="Tasks extracted from your meetings."
        actions={
          <div className="hidden gap-2.5 sm:flex">
            <StatTile label="Open" value={String(stats.open)} icon={<ListTodo size={14} />} accent className="min-w-[124px]" />
            <StatTile label="Due this week" value={String(stats.dueThisWeek)} icon={<CalendarClock size={14} />} className="min-w-[124px]" />
            <StatTile label="Completed" value={String(stats.done)} icon={<CheckCircle2 size={14} />} className="min-w-[124px]" />
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {(['all', 'open', 'completed'] as StatusFilter[]).map((s) => (
            <Chip
              key={s}
              size="sm"
              active={status === s && s === 'all'}
              selected={status === s && s !== 'all'}
              onClick={() => setStatus(s)}
            >
              {s === 'all' ? 'All' : s === 'open' ? 'Open' : 'Completed'}
            </Chip>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <Select value={meetingFilter} onValueChange={setMeetingFilter}>
            <SelectTrigger className="h-8 w-[180px] rounded-pill border-eb-border bg-eb-card font-dmsans text-[12.5px]">
              <SelectValue placeholder="All meetings" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All meetings</SelectItem>
              {groups.map((g) => (
                <SelectItem key={g.id} value={g.id}>
                  {g.title || 'Untitled meeting'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={ownerFilter} onValueChange={setOwnerFilter}>
            <SelectTrigger className="h-8 w-[150px] rounded-pill border-eb-border bg-eb-card font-dmsans text-[12.5px]">
              <SelectValue placeholder="Anyone" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Anyone</SelectItem>
              {owners.map((o) => (
                <SelectItem key={o} value={o}>
                  {o}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
            <SelectTrigger className="h-8 w-[160px] rounded-pill border-eb-border bg-eb-card font-dmsans text-[12.5px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="due">By due date</SelectItem>
              <SelectItem value="priority">By priority</SelectItem>
              <SelectItem value="date">By meeting order</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <ListSkeleton />
      ) : totalShown === 0 ? (
        <Card className="text-center">
          <p className="font-dmsans text-sm font-medium text-eb-text">
            {groups.length === 0 ? 'No action items yet' : 'Nothing matches these filters'}
          </p>
          <p className="mt-1 font-dmsans text-[13px] text-eb-secondary">
            {groups.length === 0
              ? 'Items appear here once a recorded meeting has been summarised.'
              : 'Try All, or clear the meeting and owner filters.'}
          </p>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {visible.map((group) => {
            const isCollapsed = collapsed.has(group.id);
            const openCount = group.items.filter((i) => !completed.has(i.id)).length;
            return (
              <Card key={group.id} padded={false}>
                <div className="flex items-center gap-2 border-b border-eb-divider py-3 pl-[18px] pr-[18px]">
                  <button
                    type="button"
                    onClick={() =>
                      setCollapsed((prev) => {
                        const s = new Set(prev);
                        if (s.has(group.id)) s.delete(group.id);
                        else s.add(group.id);
                        return s;
                      })
                    }
                    aria-label={isCollapsed ? `Expand ${group.title}` : `Collapse ${group.title}`}
                    className="flex-none text-eb-muted"
                  >
                    <ChevronDown
                      size={15}
                      strokeWidth={1.75}
                      className={cn('transition-transform', isCollapsed && '-rotate-90')}
                    />
                  </button>
                  <Link
                    to={`/meeting/${group.id}`}
                    className="truncate font-outfit text-[15px] font-semibold leading-tight text-eb-text no-underline hover:underline"
                  >
                    {group.title || 'Untitled meeting'}
                  </Link>
                  <span className="flex-none font-dmsans text-[12.5px] text-eb-secondary">
                    {groupDate(group.date)}
                  </span>
                  <span className="ml-auto flex-none font-dmsans text-[12.5px] text-eb-secondary">
                    {openCount} open
                  </span>
                </div>

                {!isCollapsed &&
                  group.items.map((item) => {
                    const done = completed.has(item.id);
                    const due = dueLabel(item);
                    const overdue = isOverdue(item, done);
                    return (
                      <div
                        key={item.id}
                        className="group flex items-center gap-3 border-t border-eb-divider px-[18px] py-[13px] hover:bg-eb-row-hover"
                      >
                        <EbCheckbox
                          checked={done}
                          onChange={() => toggleComplete(item, group.id)}
                          label={item.task}
                        />

                        {editingId === item.id ? (
                          <input
                            autoFocus
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            onBlur={() => saveEdit(group, item)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveEdit(group, item);
                              if (e.key === 'Escape') setEditingId(null);
                            }}
                            className="min-w-0 flex-1 rounded-input border border-eb-border bg-eb-card px-2 py-1 font-dmsans text-[13.5px] text-eb-text outline-none"
                          />
                        ) : (
                          <span
                            className={cn(
                              'min-w-0 flex-1 font-dmsans text-[13.5px] text-eb-text',
                              done && 'text-eb-secondary line-through',
                            )}
                          >
                            {item.task}
                          </span>
                        )}

                        {editingId !== item.id && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(item.id);
                              setEditText(item.task);
                            }}
                            aria-label={`Edit: ${item.task}`}
                            className="flex-none text-eb-muted opacity-0 transition-opacity group-hover:opacity-100"
                          >
                            <Pencil size={13} strokeWidth={1.75} />
                          </button>
                        )}

                        {item.owner && (
                          <span className="hidden flex-none items-center gap-1.5 font-dmsans text-[12.5px] text-eb-secondary sm:flex">
                            <Avatar name={item.owner} size={20} round />
                            {item.owner}
                          </span>
                        )}

                        {item.priority && (
                          <Badge tone={PRIORITY_TONE[item.priority]} className="flex-none">
                            {item.priority}
                          </Badge>
                        )}

                        {due && (
                          <span
                            className={cn(
                              'hidden flex-none items-center gap-1.5 font-dmsans text-[12.5px] sm:flex',
                              overdue ? 'text-eb-red' : done ? 'text-eb-muted' : 'text-eb-secondary',
                            )}
                          >
                            <CalendarClock size={13} strokeWidth={1.75} />
                            {due}
                          </span>
                        )}
                      </div>
                    );
                  })}
              </Card>
            );
          })}
        </div>
      )}
    </DashboardLayout>
  );
}
