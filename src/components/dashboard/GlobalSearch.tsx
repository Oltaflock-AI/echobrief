/**
 * ⌘K search — Console (UI v2), from mockup 00d.
 *
 * The reads: meeting titles, transcript bodies, the action items inside
 * meeting_insights, and contacts. Nothing here is separately indexed and no
 * endpoint backs it — it is four filtered selects run together.
 *
 * What is new is that a group only appears when it has something in it, the
 * matched term is marked in the row, and a transcript hit resolves to the
 * segment that contains it — so it opens the recording at that moment rather
 * than at the top of the meeting.
 *
 * The Ask row is always last and always present: it is the answer to "none of
 * these", and it hands the question to /chat rather than pretending to answer.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckSquare, Mic, Quote, Search, Sparkles, User, X } from 'lucide-react';
import { Dialog as ShadDialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { formatIST } from '@/lib/time';
import { ChipGroup } from '@/ui';
import { cn } from '@/lib/utils';

type Group = 'meetings' | 'transcripts' | 'actions' | 'contacts';
type Scope = 'all' | Group;

type Row = {
  id: string;
  group: Group;
  title: string;
  subtitle: string;
  /** Right-hand marker: a timestamp, a status, a priority. */
  meta?: string;
  to: string;
};

const GROUP_LABEL: Record<Group, string> = {
  meetings: 'Meetings',
  transcripts: 'In transcripts',
  actions: 'Action items',
  contacts: 'Contacts',
};

const GROUP_ICON: Record<Group, typeof Mic> = {
  meetings: Mic,
  transcripts: Quote,
  actions: CheckSquare,
  contacts: User,
};

const SCOPES: readonly { value: Scope; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'meetings', label: 'Meetings' },
  { value: 'transcripts', label: 'Transcripts' },
  { value: 'actions', label: 'Action items' },
  { value: 'contacts', label: 'Contacts' },
];

type Segment = { speaker?: string; text?: string; start?: number };

/** m:ss, and h:mm:ss once a meeting passes an hour. */
function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    : `${m}:${String(sec).padStart(2, '0')}`;
}

export function GlobalSearch({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<Scope>('all');
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [cursor, setCursor] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) return;
    setQuery('');
    setRows([]);
    setScope('all');
    setCursor(0);
  }, [open]);

  useEffect(() => {
    const term = query.trim();
    if (!open || !term || !user) {
      setLoading(false);
      setSearchError(false);
      setRows([]);
      return;
    }
    let cancelled = false;
    setRows([]);
    setCursor(0);
    setLoading(true);
    setSearchError(false);
    const like = `%${term.replace(/[\\%_]/g, '\\$&')}%`;
    const lower = term.toLowerCase();

    const run = async () => {
      setLoading(true);
      const found: Row[] = [];
      const jobs: Promise<void>[] = [];
      try {
        if (scope === 'all' || scope === 'meetings') jobs.push((async () => {
          const { data } = await supabase
            .from('meetings')
            // Unfiltered by user_id: RLS covers own meetings and observer
            // grants, and search must find what the user can actually open.
            .select('id, title, start_time, status')
            .ilike('title', like)
            .order('start_time', { ascending: false })
            .limit(5).throwOnError();
          (data ?? []).forEach((m) => {
            found.push({
              id: `meeting-${m.id}`,
              group: 'meetings',
              title: m.title || 'Untitled meeting',
              subtitle: m.start_time ? formatIST(new Date(m.start_time), 'EEE, MMM d · h:mm a') : '',
              meta: m.status === 'completed' ? 'Summarized' : m.status,
              to: `/meeting/${m.id}`,
            });
          });
        })());

        if (scope === 'all' || scope === 'transcripts') jobs.push((async () => {
          const { data } = await supabase
            .from('transcripts')
            .select('id, content, speakers, meeting_id, meetings!inner(title, user_id)')
            .ilike('content', like)
            .limit(4).throwOnError();
          (data ?? []).forEach((t: Record<string, unknown>) => {
            const meeting = t.meetings as { title?: string };
            // Prefer the segment carrying the term: it names who said it and
            // when, which is what makes the row worth opening.
            const segments = Array.isArray(t.speakers) ? (t.speakers as Segment[]) : [];
            const hit = segments.find((s) => s?.text?.toLowerCase().includes(lower));
            const content = String(t.content ?? '');
            const at = content.toLowerCase().indexOf(lower);
            const snippet = hit?.text
              ? hit.text
              : at >= 0
                ? `…${content.slice(Math.max(0, at - 40), at + term.length + 60)}…`
                : 'Transcript match';
            const stamp = typeof hit?.start === 'number' ? clock(hit.start) : undefined;
            found.push({
              id: `transcript-${t.id}`,
              group: 'transcripts',
              title: hit?.speaker ? `${hit.speaker} · "${snippet}"` : snippet,
              subtitle: [meeting?.title, stamp].filter(Boolean).join(' · '),
              meta: stamp,
              to: stamp
                ? `/meeting/${t.meeting_id}?t=${Math.floor(hit!.start!)}`
                : `/meeting/${t.meeting_id}`,
            });
          });
        })());

        if (scope === 'all' || scope === 'actions') jobs.push((async () => {
          const { data } = await supabase
            .from('meeting_insights')
            .select('id, action_items, meeting_id, meetings!inner(title, user_id)')
            .order('created_at', { ascending: false })
            .limit(100).throwOnError();
          (data ?? []).forEach((row: Record<string, unknown>) => {
            const meeting = row.meetings as { title?: string };
            const items = Array.isArray(row.action_items) ? row.action_items : [];
            items.forEach((item: unknown, idx: number) => {
              const task = typeof item === 'string' ? item : (item as { task?: string })?.task;
              if (!task?.toLowerCase().includes(lower)) return;
              const owner = typeof item === 'object' ? (item as { owner?: string })?.owner : undefined;
              const priority = typeof item === 'object' ? (item as { priority?: string })?.priority : undefined;
              found.push({
                id: `action-${row.id}-${idx}`,
                group: 'actions',
                title: task,
                subtitle: [meeting?.title, owner].filter(Boolean).join(' · '),
                meta: priority,
                to: `/meeting/${row.meeting_id}`,
              });
            });
          });
        })());

        if (scope === 'all' || scope === 'contacts') jobs.push((async () => {
          // Separate filters keep punctuation in a name out of PostgREST's
          // raw `or` grammar. Deduplicate contacts that match both fields.
          const matches = await Promise.all(['name', 'email'].map((field) =>
            supabase.from('contacts')
              .select('id, name, email, company, meeting_count')
              .eq('user_id', user.id)
              .ilike(field, like)
              .order('name')
              .limit(4).throwOnError(),
          ));
          const data = [...new Map(matches.flatMap((m) => m.data ?? []).map((c) => [c.id, c])).values()].slice(0, 4);
          (data ?? []).forEach((c) => {
            found.push({
              id: `contact-${c.id}`,
              group: 'contacts',
              title: c.name || c.email,
              subtitle: [c.company, c.meeting_count ? `${c.meeting_count} meetings` : null]
                .filter(Boolean)
                .join(' · '),
              to: `/contacts?c=${encodeURIComponent(c.id)}`,
            });
          });
        })());

        const results = await Promise.allSettled(jobs);
        if (!cancelled) setSearchError(results.some((result) => result.status === 'rejected'));
      } finally {
        if (!cancelled) {
          const order: Group[] = ['meetings', 'transcripts', 'actions', 'contacts'];
          setRows(found.sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group)));
          setCursor(0);
          setLoading(false);
        }
      }
    };

    const debounce = setTimeout(run, 200);
    return () => {
      cancelled = true;
      clearTimeout(debounce);
    };
  }, [open, query, user, scope, attempt]);

  const askTo = `/chat?q=${encodeURIComponent(query.trim())}`;

  // The Ask row is the last navigable row, so ↓ walks into it.
  const navigable = useMemo(() => (query.trim() ? [...rows, { id: 'ask', to: askTo } as Row] : []), [rows, query, askTo]);

  const go = useCallback(
    (to: string) => {
      onOpenChange(false);
      navigate(to);
    },
    [navigate, onOpenChange],
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((c) => Math.max(0, Math.min(c + 1, navigable.length - 1)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if ((e.metaKey || e.ctrlKey) && query.trim()) return go(askTo);
      const target = navigable[cursor];
      if (target) go(target.to);
    }
  };

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  const grouped = useMemo(() => {
    const order: Group[] = ['meetings', 'transcripts', 'actions', 'contacts'];
    return order
      .map((g) => ({ group: g, items: rows.filter((r) => r.group === g) }))
      .filter((g) => g.items.length > 0);
  }, [rows]);

  let flatIndex = -1;

  return (
    <ShadDialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        style={{ maxWidth: 640 }}
        className="flex flex-col top-[max(1rem,env(safe-area-inset-top))] max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] translate-y-0 sm:top-[100px] gap-0 overflow-hidden rounded-[18px] border-eb-border bg-eb-card p-0 shadow-eb-card [&>button:last-child]:hidden"
      >
        <DialogTitle className="sr-only">Search</DialogTitle>
        <DialogDescription className="sr-only">
          Search meetings, transcripts, action items and contacts
        </DialogDescription>

        <div className="flex items-center gap-3 border-b border-eb-divider px-4 py-3.5">
          <Search size={17} strokeWidth={1.75} className="shrink-0 text-eb-accent" />
          <input
            autoFocus
            aria-label="Search meetings, transcripts, action items and contacts"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={!!query.trim()}
            aria-controls="global-search-results"
            aria-activedescendant={navigable[cursor] ? `search-${navigable[cursor].id}` : undefined}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search meetings, transcripts, action items…"
            className="min-w-0 flex-1 border-0 bg-transparent p-0 font-dmsans text-[15px] text-eb-text outline-none placeholder:text-eb-secondary"
          />
          <button type="button" onClick={() => onOpenChange(false)} aria-label="Close search" className="tap-44 flex h-9 w-9 shrink-0 items-center justify-center rounded-pill text-eb-secondary hover:bg-eb-row-hover">
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-eb-divider px-4 py-2.5">
          <ChipGroup<Scope>
            ariaLabel="Search scope"
            size="sm"
            options={SCOPES}
            value={scope}
            onChange={setScope}
          />
          {query.trim() && (
            <span role="status" className="shrink-0 font-dmsans text-[12.5px] text-eb-secondary">
              {loading ? 'Searching…' : `${rows.length} result${rows.length === 1 ? '' : 's'}`}
            </span>
          )}
        </div>

        {searchError && (
          <div role="alert" className="flex items-center justify-between gap-3 border-b border-eb-divider px-4 py-3 text-[13px] text-eb-red">
            <span>Some results couldn’t load. Try searching again.</span>
            <button type="button" className="tap-44 shrink-0 font-semibold underline" onClick={() => setAttempt((n) => n + 1)}>Retry</button>
          </div>
        )}
        {query.trim() && (scope === 'all' || scope === 'actions') && (
          <p className="border-b border-eb-divider px-4 py-2 text-[11.5px] text-eb-secondary">Action item matches cover your 100 most recent accessible summaries.</p>
        )}
        <div id="global-search-results" role="listbox" aria-label="Search results" aria-busy={loading} ref={listRef} className="min-h-0 max-h-[46vh] overflow-y-auto px-2 py-2">
          {!query.trim() ? (
            <p className="px-2 py-8 text-center font-dmsans text-[13px] text-eb-secondary">
              Search across every meeting — titles, what was said, and what was promised.
            </p>
          ) : (
            <>
              {grouped.map(({ group, items }) => (
                <div key={group} className="mb-1">
                  <div className="px-3 pb-1 pt-2 font-dmsans text-[11px] font-semibold uppercase tracking-[.09em] text-eb-secondary">
                    {GROUP_LABEL[group]}
                  </div>
                  {items.map((row) => {
                    flatIndex += 1;
                    const index = flatIndex;
                    const Icon = GROUP_ICON[row.group];
                    return (
                      <button
                        key={row.id}
                        id={`search-${row.id}`}
                        role="option"
                        aria-selected={index === cursor}
                        tabIndex={-1}
                        type="button"
                        data-active={index === cursor}
                        onMouseEnter={() => setCursor(index)}
                        onClick={() => go(row.to)}
                        className={cn(
                          'flex w-full items-center gap-3 rounded-input px-3 py-2.5 text-left transition-colors',
                          index === cursor ? 'bg-eb-accent-soft' : 'hover:bg-eb-row-hover',
                        )}
                      >
                        <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-pill border border-eb-border bg-white text-eb-secondary">
                          <Icon size={14} strokeWidth={1.75} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-dmsans text-[13.5px] text-eb-text">
                            <Mark text={row.title} term={query.trim()} />
                          </span>
                          {row.subtitle && (
                            <span className="block truncate font-dmsans text-[12.5px] text-eb-secondary">
                              {row.subtitle}
                            </span>
                          )}
                        </span>
                        {row.meta && (
                          <span className="hidden shrink-0 font-mono text-[11.5px] text-eb-secondary sm:inline">{row.meta}</span>
                        )}
                        {index === cursor && <Kbd>↵</Kbd>}
                      </button>
                    );
                  })}
                </div>
              ))}

              {!loading && !searchError && rows.length === 0 && (
                <p className="px-3 pb-1 pt-3 font-dmsans text-[13px] text-eb-secondary">
                  Nothing matched “{query.trim()}”.
                </p>
              )}

              <div className="mb-1">
                <div className="px-3 pb-1 pt-2 font-dmsans text-[11px] font-semibold uppercase tracking-[.09em] text-eb-secondary">
                  Ask
                </div>
                <button
                  type="button"
                  id="search-ask"
                  role="option"
                  aria-selected={rows.length === cursor}
                  tabIndex={-1}
                  data-active={rows.length === cursor}
                  onMouseEnter={() => setCursor(rows.length)}
                  onClick={() => go(askTo)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-input px-3 py-2.5 text-left transition-colors',
                    rows.length === cursor ? 'bg-eb-accent-soft' : 'hover:bg-eb-row-hover',
                  )}
                >
                  <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-pill border border-eb-border bg-white text-eb-accent">
                    <Sparkles size={14} strokeWidth={1.75} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-dmsans text-[13.5px] text-eb-text">
                      Ask: “{query.trim()}”
                    </span>
                    <span className="block font-dmsans text-[12.5px] text-eb-secondary">
                      Answer from your transcripts, with citations
                    </span>
                  </span>
                  {rows.length === cursor && <Kbd>↵</Kbd>}
                </button>
              </div>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-4 border-t border-eb-divider bg-eb-card-alt px-4 py-2.5">
          <Hint keys="↑↓">Navigate</Hint>
          <Hint keys="↵">Open</Hint>
          <Hint keys="⌘↵">Open in Ask</Hint>
          <span className="ml-auto">
            <Hint keys="Esc">Close</Hint>
          </span>
        </div>
      </DialogContent>
    </ShadDialog>
  );
}

/** Marks the matched term. Case-insensitive, first occurrence only. */
function Mark({ text, term }: { text: string; term: string }) {
  if (!term) return <>{text}</>;
  const at = text.toLowerCase().indexOf(term.toLowerCase());
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <span className="rounded-[3px] bg-eb-accent-soft px-0.5 text-eb-accent-text">
        {text.slice(at, at + term.length)}
      </span>
      {text.slice(at + term.length)}
    </>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <span className="shrink-0 rounded-[6px] border border-eb-border bg-white px-1.5 py-0.5 font-mono text-[11px] text-eb-secondary">
      {children}
    </span>
  );
}

function Hint({ keys, children }: { keys: string; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5 font-dmsans text-[12px] text-eb-secondary">
      <Kbd>{keys}</Kbd>
      {children}
    </span>
  );
}
