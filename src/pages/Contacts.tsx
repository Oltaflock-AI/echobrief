/**
 * Contacts — Console (UI v2), from mockup 06-contacts.
 *
 * Data layer is Contacts.tsx's, unchanged: `contacts` (written by the pipeline
 * from the external attendees of completed meetings), the meetings behind one
 * contact via `meeting_contacts`, and the cached `account_brief` that the
 * account-brief function generates from the facts of every meeting with them.
 * Selection lives in the URL (`?c=<id>`) so a brief can be linked to.
 *
 * Two departures from the mockup, both for the same reason — no code path
 * behind them. The checkboxes beside the open commitments would have nothing
 * to write to (they are brief prose, not action items, which have their own
 * table and index), so they are a list. The "…" overflow menu offered no
 * actions that exist, so the only control is Refresh brief.
 *
 * One addition: unresolved objections. The brief already carries them and they
 * are the sharpest thing in it, so the card shows them when there are any.
 */

import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, ChevronRight, Loader2, Mail, RefreshCw, Search, Sparkles, Users } from 'lucide-react';
import { formatIST } from '@/lib/time';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { AppShell } from '@/components/shell/AppShell';
import { ListSkeleton } from '@/components/dashboard/ListSkeleton';
import { AccountBrief, Contact, MeetingFacts } from '@/types/meeting';
import { Avatar, Button as EbButton, Card, Label as EbLabel, PageHeader } from '@/ui';
import { cn } from '@/lib/utils';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

// `contacts` and `meeting_contacts` are missing from the checked-in generated
// types (they are ~40 tables behind the deployed schema), so these reads go
// through an untyped client the way Contacts.tsx does.
const db = supabase;

interface InsightsRow {
  summary_short: string | null;
  facts: MeetingFacts | null;
  created_at: string;
}

interface MeetingRow {
  id: string;
  title: string;
  start_time: string;
  duration_seconds: number | null;
  meeting_insights: InsightsRow[] | InsightsRow | null;
}

interface LinkRow {
  meeting_id: string;
  meetings: MeetingRow | MeetingRow[] | null;
}

interface ContactMeeting {
  id: string;
  title: string;
  start_time: string;
  duration_seconds: number | null;
}

function displayName(c: Contact): string {
  return c.name?.trim() || c.email;
}

function meetingsLabel(n: number): string {
  return `${n} ${n === 1 ? 'meeting' : 'meetings'}`;
}

function minutes(seconds: number | null): string | null {
  if (!seconds) return null;
  return `${Math.max(1, Math.round(seconds / 60))} min`;
}

export default function Contacts() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const selectedId = searchParams.get('c');

  const { data: contacts = [], isLoading, error } = useQuery({
    queryKey: ['contacts', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error: err } = await db
        .from('contacts')
        .select(
          'id, user_id, email, name, company, domain, meeting_count, first_seen_at, last_seen_at, account_brief, account_brief_at',
        )
        .eq('user_id', user!.id)
        .order('last_seen_at', { ascending: false, nullsFirst: false });
      if (err) throw err;
      return (data ?? []) as unknown as Contact[];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter((c) => [c.name, c.email, c.company].some((v) => v?.toLowerCase().includes(q)));
  }, [contacts, search]);

  const selected = contacts.find((c) => c.id === selectedId) ?? null;

  const { data: meetings = [], isLoading: meetingsLoading } = useQuery({
    queryKey: ['contact-meetings', selectedId],
    enabled: !!selectedId,
    queryFn: async () => {
      const { data, error: err } = await db
        .from('meeting_contacts')
        .select('meeting_id, meetings(id, title, start_time, duration_seconds)')
        .eq('contact_id', selectedId!);
      if (err) throw err;
      const out: ContactMeeting[] = [];
      for (const row of (data ?? []) as unknown as LinkRow[]) {
        const m = Array.isArray(row.meetings) ? row.meetings[0] : row.meetings;
        if (!m) continue;
        out.push({
          id: m.id,
          title: m.title,
          start_time: m.start_time,
          duration_seconds: m.duration_seconds,
        });
      }
      return out.sort((a, b) => String(b.start_time).localeCompare(String(a.start_time)));
    },
  });

  const briefMutation = useMutation({
    mutationFn: async ({ contactId, force }: { contactId: string; force: boolean }) => {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      if (!token) throw new Error('Your session has expired — sign in again.');
      const res = await fetch(`${SUPABASE_URL}/functions/v1/account-brief`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact_id: contactId, force }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.brief) throw new Error(body?.error || `Request failed (${res.status})`);
      return { contactId, brief: body.brief as AccountBrief };
    },
    onSuccess: ({ contactId, brief }) => {
      queryClient.setQueryData<Contact[]>(['contacts', user?.id], (old) =>
        (old ?? []).map((c) =>
          c.id === contactId ? { ...c, account_brief: brief, account_brief_at: brief.generated_at } : c,
        ),
      );
    },
    onError: (err) => {
      toast({
        title: 'Could not generate the brief',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      });
    },
  });

  const select = (id: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (id) next.set('c', id);
    else next.delete('c');
    setSearchParams(next);
  };

  const brief = selected?.account_brief ?? null;
  const busy = briefMutation.isPending;

  return (
    <AppShell>
      <PageHeader
        title="Contacts"
        subtitle="Every external person you have met with, and the two-minute brief to read before the next call."
      />

      {error ? (
        <Card className="text-center">
          <p className="font-dmsans text-sm font-medium text-eb-red">Could not load contacts</p>
          <p className="mt-1 font-dmsans text-[13px] text-eb-secondary">
            {error instanceof Error ? error.message : 'Please try again.'}
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
          {/* List rail */}
          <Card padded={false} className="flex max-h-[720px] flex-col">
            <div className="border-b border-eb-divider p-3">
              <div className="flex items-center gap-2 rounded-input border border-eb-border bg-eb-card px-3 py-2 shadow-eb-input">
                <Search size={14} strokeWidth={1.75} className="flex-none text-eb-muted" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  aria-label="Search contacts by name, email or company"
                  placeholder="Search name, email or company"
                  className="min-w-0 flex-1 border-0 bg-transparent p-0 font-dmsans text-[13px] text-eb-text outline-none placeholder:text-eb-secondary"
                />
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {isLoading ? (
                <div className="p-3">
                  <ListSkeleton />
                </div>
              ) : filtered.length === 0 ? (
                <div className="px-4 py-10 text-center">
                  <Users size={26} strokeWidth={1.5} className="mx-auto mb-2.5 text-eb-muted" />
                  <p className="font-dmsans text-[13px] text-eb-secondary">
                    {contacts.length === 0
                      ? 'External attendees appear here after a meeting is summarised.'
                      : 'No contact matches that search.'}
                  </p>
                </div>
              ) : (
                filtered.map((c) => {
                  const active = c.id === selectedId;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => select(c.id)}
                      className={cn(
                        'flex w-full items-center gap-3 border-b border-eb-divider px-3.5 py-3 text-left last:border-0',
                        active ? 'bg-eb-accent-soft' : 'hover:bg-eb-row-hover',
                      )}
                    >
                      <Avatar name={displayName(c)} size={30} round />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-dmsans text-[13.5px] font-medium text-eb-text">
                          {displayName(c)}
                        </span>
                        <span className="block truncate font-dmsans text-[12px] text-eb-secondary">
                          {c.company || c.email}
                        </span>
                      </span>
                      <span className="flex-none text-right">
                        <span className="block font-dmsans text-[12px] text-eb-secondary">
                          {meetingsLabel(c.meeting_count)}
                        </span>
                        {c.last_seen_at && (
                          <span className="block font-dmsans text-[12px] text-eb-secondary">
                            {formatIST(new Date(c.last_seen_at), 'MMM d')}
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </Card>

          {/* Detail */}
          {!selected ? (
            <Card className="flex items-center justify-center text-center">
              <div>
                <Sparkles size={26} strokeWidth={1.5} className="mx-auto mb-2.5 text-eb-muted" />
                <p className="font-dmsans text-sm font-medium text-eb-text">Pick a contact</p>
                <p className="mt-1 font-dmsans text-[13px] text-eb-secondary">
                  Their brief is built from the facts of every meeting you have had with them.
                </p>
              </div>
            </Card>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar name={displayName(selected)} size={40} round />
                  <div className="min-w-0">
                    <h2 className="m-0 truncate font-outfit text-[20px] font-semibold tracking-[-0.015em] text-eb-text">
                      {displayName(selected)}
                    </h2>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-dmsans text-[12.5px] text-eb-secondary">
                      {selected.company && (
                        <span className="inline-flex items-center gap-1.5">
                          <Building2 size={12} strokeWidth={1.75} />
                          {selected.company}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1.5">
                        <Mail size={12} strokeWidth={1.75} />
                        {selected.email}
                      </span>
                      <span>{meetingsLabel(selected.meeting_count)}</span>
                    </div>
                  </div>
                </div>

                <EbButton
                  size="sm"
                  disabled={busy}
                  onClick={() => briefMutation.mutate({ contactId: selected.id, force: !!brief })}
                  icon={busy ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} strokeWidth={1.75} />}
                  className="flex-none"
                >
                  {busy ? 'Working…' : brief ? 'Refresh brief' : 'Generate brief'}
                </EbButton>
              </div>

              <Card>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="m-0 inline-flex items-center gap-2 font-outfit text-[16px] font-semibold tracking-[-0.01em] text-eb-text">
                    <Sparkles size={15} strokeWidth={1.75} className="text-eb-accent" />
                    Account brief
                  </h3>
                  {brief?.generated_at && (
                    <span className="font-dmsans text-[12px] text-eb-secondary">
                      Generated {formatIST(new Date(brief.generated_at), 'MMM d')} from{' '}
                      {meetingsLabel(brief.meetings_considered ?? selected.meeting_count)}
                    </span>
                  )}
                </div>

                {!brief ? (
                  <p className="font-dmsans text-[13px] text-eb-secondary">
                    No brief yet. Generate one and it is written from the quoted facts of your meetings
                    with {displayName(selected)} — never invented.
                  </p>
                ) : (
                  <div className="flex flex-col gap-4">
                    <p className="m-0 font-dmsans text-[14px] leading-relaxed text-eb-prose">
                      {brief.where_it_stands}
                    </p>

                    {(brief.open_commitments_ours?.length > 0 || brief.open_commitments_theirs?.length > 0) && (
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        {[
                          ['Our open commitments', brief.open_commitments_ours] as const,
                          ['Their open commitments', brief.open_commitments_theirs] as const,
                        ].map(([label, items]) =>
                          items?.length ? (
                            <div key={label}>
                              <EbLabel className="mb-1.5">{label}</EbLabel>
                              <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                                {items.map((line, i) => (
                                  <li key={i} className="font-dmsans text-[13px] leading-snug text-eb-text">
                                    {line}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : null,
                        )}
                      </div>
                    )}

                    {brief.unresolved_objections?.length > 0 && (
                      <div>
                        <EbLabel className="mb-1.5">Unresolved objections</EbLabel>
                        <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                          {brief.unresolved_objections.map((line, i) => (
                            <li key={i} className="font-dmsans text-[13px] leading-snug text-eb-text">
                              {line}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {brief.key_numbers?.length > 0 && (
                      <div>
                        <EbLabel className="mb-1.5">Key numbers</EbLabel>
                        <div className="flex flex-wrap gap-2">
                          {brief.key_numbers.map((n, i) => (
                            <span
                              key={i}
                              className="rounded-pill border border-eb-border bg-eb-card px-3 py-1.5 font-dmsans text-[12.5px] text-eb-text"
                            >
                              {n}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {brief.next_call_prep?.length > 0 && (
                      <div>
                        <EbLabel className="mb-1.5">Prep for the next call</EbLabel>
                        <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                          {brief.next_call_prep.map((line, i) => (
                            <li
                              key={i}
                              className="flex gap-2 font-dmsans text-[13px] leading-snug text-eb-text"
                            >
                              <span className="mt-[6px] h-1.5 w-1.5 flex-none rounded-full bg-eb-accent" />
                              {line}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </Card>

              <Card padded={false}>
                <div className="flex items-center justify-between border-b border-eb-divider px-[18px] py-3">
                  <h3 className="m-0 font-outfit text-[15px] font-semibold leading-tight text-eb-text">
                    Meetings
                  </h3>
                  <span className="font-dmsans text-[12.5px] text-eb-secondary">{meetings.length}</span>
                </div>
                {meetingsLoading ? (
                  <div className="p-4">
                    <ListSkeleton />
                  </div>
                ) : meetings.length === 0 ? (
                  <p className="px-[18px] py-6 text-center font-dmsans text-[13px] text-eb-secondary">
                    No meetings linked to this contact yet.
                  </p>
                ) : (
                  meetings.map((m) => (
                    <Link
                      key={m.id}
                      to={`/meeting/${m.id}`}
                      className="flex items-center gap-3 border-b border-eb-divider px-[18px] py-3 no-underline last:border-0 hover:bg-eb-row-hover"
                    >
                      <span className="w-[110px] flex-none font-dmsans text-[12.5px] text-eb-secondary">
                        {formatIST(new Date(m.start_time), 'EEE, MMM d')}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-dmsans text-[13.5px] text-eb-text">
                        {m.title || 'Untitled meeting'}
                      </span>
                      {minutes(m.duration_seconds) && (
                        <span className="flex-none font-dmsans text-[12.5px] text-eb-secondary">
                          {minutes(m.duration_seconds)}
                        </span>
                      )}
                      <ChevronRight size={15} strokeWidth={1.75} className="flex-none text-eb-muted" />
                    </Link>
                  ))
                )}
              </Card>
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}
