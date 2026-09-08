import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Building2, Loader2, Mail, RefreshCw, Search, Sparkles, Users } from 'lucide-react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { formatIST } from '@/lib/time';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import type { AccountBrief, Contact, FactCommitment, FactNumber, MeetingFacts } from '@/types/meeting';
import { asContacts } from '@/types/meeting';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

// contacts / meeting_contacts postdate the generated Database types, so they
// are read through an untyped handle and shaped locally. RLS scopes the rows.
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

/** One meeting with this contact, flattened to what the timeline renders. */
interface ContactMeeting {
  id: string;
  title: string;
  start_time: string;
  duration_seconds: number | null;
  summary_short: string | null;
  numbers: FactNumber[];
  commitments: FactCommitment[];
}

/** Regeneration appends insight rows; the newest one is the live copy. */
function newestInsights(rows: InsightsRow[] | InsightsRow | null): InsightsRow | null {
  if (!rows) return null;
  if (!Array.isArray(rows)) return rows;
  return [...rows].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0] ?? null;
}

function displayName(c: Contact): string {
  return c.name?.trim() || c.email;
}

function initials(c: Contact): string {
  const parts = displayName(c).split(/[\s@._-]+/).filter(Boolean);
  const two = ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase();
  return two || displayName(c).charAt(0).toUpperCase() || '?';
}

function meetingsLabel(n: number): string {
  return `${n} ${n === 1 ? 'meeting' : 'meetings'}`;
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
      const { data, error } = await db
        .from('contacts')
        .select('id, user_id, email, name, company, domain, meeting_count, first_seen_at, last_seen_at, account_brief, account_brief_at')
        .eq('user_id', user!.id)
        .order('last_seen_at', { ascending: false, nullsFirst: false });
      if (error) throw error;
      return asContacts(data ?? []);
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
      const { data, error } = await db
        .from('meeting_contacts')
        .select('meeting_id, meetings(id, title, start_time, duration_seconds, meeting_insights(summary_short, facts, created_at))')
        .eq('contact_id', selectedId!);
      if (error) throw error;
      const out: ContactMeeting[] = [];
      for (const row of (data ?? []) as LinkRow[]) {
        const m = Array.isArray(row.meetings) ? row.meetings[0] : row.meetings;
        if (!m) continue;
        const ins = newestInsights(m.meeting_insights);
        out.push({
          id: m.id,
          title: m.title,
          start_time: m.start_time,
          duration_seconds: m.duration_seconds,
          summary_short: ins?.summary_short ?? null,
          numbers: Array.isArray(ins?.facts?.numbers) ? ins!.facts!.numbers! : [],
          commitments: Array.isArray(ins?.facts?.commitments) ? ins!.facts!.commitments! : [],
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
      // Patch the cached list so the card updates without a refetch.
      queryClient.setQueryData<Contact[]>(['contacts', user?.id], (old) =>
        (old ?? []).map((c) => (c.id === contactId ? { ...c, account_brief: brief, account_brief_at: brief.generated_at } : c)),
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

  const fetchError = error ? (error instanceof Error ? error.message : 'Could not load contacts') : null;

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-[1100px] px-4 py-6 sm:px-6 md:px-8 md:py-10">
        {/* Header */}
        <div className="mb-8">
          <h1
            className="text-[28px] font-semibold leading-tight"
            style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}
          >
            Contacts
          </h1>
          <p className="mt-1 text-[14px]" style={{ color: 'var(--ink-mid)' }}>
            Every external person you have met with, and the two-minute brief to read before the next call.
          </p>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-16 rounded-lg" />
            ))}
          </div>
        ) : fetchError ? (
          <div
            role="alert"
            className="rounded-md px-4 py-3 text-[13.5px]"
            style={{
              border: '1px solid color-mix(in oklch, hsl(var(--destructive)) 25%, transparent)',
              background: 'color-mix(in oklch, hsl(var(--destructive)) 7%, transparent)',
              color: 'hsl(var(--destructive))',
            }}
          >
            {fetchError}
          </div>
        ) : contacts.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center rounded-xl px-6 py-16 text-center"
            style={{ border: '1px dashed var(--rule)', background: 'var(--paper-card)' }}
          >
            <Users className="mb-4 h-10 w-10" strokeWidth={1.5} style={{ color: 'var(--ink-faint)' }} />
            <p className="mb-1.5 text-[17px] font-semibold" style={{ color: 'var(--ink)' }}>
              No contacts yet
            </p>
            <p className="max-w-sm text-[14px]" style={{ color: 'var(--ink-mid)', lineHeight: 1.6 }}>
              Contacts appear automatically from the external attendees of your completed meetings — there is nothing to add by hand.
            </p>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
            {/* List — hidden on mobile while a contact is open */}
            <div className={cn(selected ? 'hidden lg:block' : 'block')}>
              <div className="relative mb-3">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
                  strokeWidth={1.75}
                  style={{ color: 'var(--ink-soft)' }}
                />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search name, email or company"
                  className="h-9 pl-9 text-sm"
                />
              </div>
              <div
                className="overflow-hidden rounded-xl"
                style={{ border: '1px solid var(--rule)', background: 'var(--paper-card)' }}
              >
                {filtered.length === 0 ? (
                  <p className="px-4 py-8 text-center text-[13px]" style={{ color: 'var(--ink-soft)' }}>
                    No contacts match “{search.trim()}”.
                  </p>
                ) : (
                  filtered.map((c, i) => {
                    const active = c.id === selectedId;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => select(c.id)}
                        className="nav-item flex w-full items-center gap-3 px-4 py-3 text-left"
                        data-active={active}
                        aria-current={active ? 'true' : undefined}
                        style={{
                          borderTop: i === 0 ? 'none' : '1px solid var(--rule)',
                        }}
                      >
                        <span
                          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-[12px] font-semibold"
                          style={{
                            background: 'color-mix(in oklch, var(--ember) 12%, transparent)',
                            color: 'var(--ember-deep)',
                          }}
                        >
                          {initials(c)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14px] font-medium" style={{ color: 'var(--ink)' }}>
                            {displayName(c)}
                          </span>
                          <span className="block truncate text-[12.5px]" style={{ color: 'var(--ink-soft)' }}>
                            {[c.company, c.email].filter(Boolean).join(' · ')}
                          </span>
                        </span>
                        <span className="flex-shrink-0 text-right">
                          <span className="block text-[12.5px] font-medium" style={{ color: 'var(--ink-mid)' }}>
                            {meetingsLabel(c.meeting_count)}
                          </span>
                          {c.last_seen_at && (
                            <span className="block text-[11.5px]" style={{ color: 'var(--ink-faint)' }}>
                              {formatIST(c.last_seen_at, 'MMM d, yyyy')}
                            </span>
                          )}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Detail */}
            <div className={cn(!selected ? 'hidden lg:block' : 'block')}>
              {selected ? (
                <ContactDetail
                  contact={selected}
                  meetings={meetings}
                  meetingsLoading={meetingsLoading}
                  generating={briefMutation.isPending && briefMutation.variables?.contactId === selected.id}
                  onGenerate={(force) => briefMutation.mutate({ contactId: selected.id, force })}
                  onBack={() => select(null)}
                />
              ) : (
                <div
                  className="flex min-h-[240px] items-center justify-center rounded-xl px-6 text-center text-[13.5px]"
                  style={{ border: '1px dashed var(--rule)', color: 'var(--ink-soft)' }}
                >
                  Select a contact to see their brief and meeting history.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

function ContactDetail({
  contact,
  meetings,
  meetingsLoading,
  generating,
  onGenerate,
  onBack,
}: {
  contact: Contact;
  meetings: ContactMeeting[];
  meetingsLoading: boolean;
  generating: boolean;
  onGenerate: (force: boolean) => void;
  onBack: () => void;
}) {
  const brief = contact.account_brief;
  const generatedAt = brief ? formatIST(brief.generated_at || contact.account_brief_at || '', 'MMM d, yyyy') : '';

  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-[13px] lg:hidden"
        style={{ color: 'var(--ink-mid)' }}
      >
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
        All contacts
      </button>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2
            className="truncate text-[22px] font-semibold leading-tight"
            style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}
          >
            {displayName(contact)}
          </h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]" style={{ color: 'var(--ink-mid)' }}>
            {contact.company && (
              <span className="inline-flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                {contact.company}
              </span>
            )}
            <a
              href={`mailto:${contact.email}`}
              className="inline-flex items-center gap-1.5 no-underline hover:underline"
              style={{ color: 'var(--ink-mid)' }}
            >
              <Mail className="h-3.5 w-3.5" strokeWidth={1.75} />
              {contact.email}
            </a>
            <span>{meetingsLabel(contact.meeting_count)}</span>
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onGenerate(!!brief)}
          disabled={generating}
          className="h-8 gap-1.5 text-[13px]"
        >
          {generating ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : brief ? (
            <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.75} />
          ) : (
            <Sparkles className="h-3.5 w-3.5" strokeWidth={1.75} />
          )}
          {generating ? 'Writing…' : brief ? 'Refresh brief' : 'Generate brief'}
        </Button>
      </div>

      {/* Account brief */}
      <section className="rounded-xl p-5" style={{ background: 'var(--paper-card)', border: '1px solid var(--rule)' }}>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h3 className="text-[15px] font-semibold" style={{ color: 'var(--ink)', letterSpacing: '-0.01em' }}>
            Account brief
          </h3>
          {brief && (
            <span className="text-[11.5px]" style={{ color: 'var(--ink-soft)' }}>
              Generated {generatedAt || 'recently'} from {meetingsLabel(brief.meetings_considered)}
            </span>
          )}
        </div>
        {brief ? (
          <div className="space-y-4">
            <p className="text-[14px] leading-relaxed" style={{ color: 'var(--ink)' }}>
              {brief.where_it_stands}
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <BriefList title="Our open commitments" items={brief.open_commitments_ours} />
              <BriefList title="Their open commitments" items={brief.open_commitments_theirs} />
              <BriefList title="Unresolved objections" items={brief.unresolved_objections} accent="hsl(var(--destructive))" />
              <BriefList title="Key numbers" items={brief.key_numbers} />
            </div>
            <BriefList title="Prep for the next call" items={brief.next_call_prep} accent="var(--ember)" />
          </div>
        ) : (
          <p className="text-[13.5px] leading-relaxed" style={{ color: 'var(--ink-mid)' }}>
            No brief yet. Generate one to get where the deal stands, open commitments on both sides, unresolved
            objections and what to prepare — written from the facts of every meeting with {displayName(contact)}.
          </p>
        )}
      </section>

      {/* Meetings timeline */}
      <section>
        <h3 className="mb-3 text-[15px] font-semibold" style={{ color: 'var(--ink)', letterSpacing: '-0.01em' }}>
          Meetings
        </h3>
        {meetingsLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-20 rounded-lg" />
            <Skeleton className="h-20 rounded-lg" />
          </div>
        ) : meetings.length === 0 ? (
          <p className="text-[13.5px]" style={{ color: 'var(--ink-soft)' }}>
            No completed meetings are linked to this contact yet.
          </p>
        ) : (
          <ol className="ml-1">
            {meetings.map((m) => (
              <li key={m.id} className="relative pb-6 pl-6" style={{ borderLeft: '1px solid var(--rule)' }}>
                <span
                  className="absolute -left-[5px] top-1.5 h-[9px] w-[9px] rounded-full"
                  style={{ background: 'var(--ember)' }}
                />
                <p className="text-[12px]" style={{ color: 'var(--ink-soft)' }}>
                  {formatIST(m.start_time, 'EEE, MMM d, yyyy · h:mm a')}
                  {m.duration_seconds ? ` · ${Math.max(1, Math.round(m.duration_seconds / 60))} min` : ''}
                </p>
                <Link
                  to={`/meeting/${m.id}`}
                  className="mt-0.5 block text-[15px] font-semibold no-underline hover:underline"
                  style={{ color: 'var(--ink)' }}
                >
                  {m.title}
                </Link>
                {m.summary_short && (
                  <p className="mt-1 text-[13.5px] leading-relaxed" style={{ color: 'var(--ink-mid)' }}>
                    {m.summary_short}
                  </p>
                )}
                {m.numbers.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {m.numbers.map((n, i) => (
                      <span
                        key={i}
                        className="rounded-full px-2 py-0.5 text-[11.5px] font-medium"
                        style={{ background: 'color-mix(in oklch, var(--ink) 6%, transparent)', color: 'var(--ink)' }}
                      >
                        <span style={{ color: 'var(--ink-soft)' }}>{n.metric}</span> {n.value}
                      </span>
                    ))}
                  </div>
                )}
                {m.commitments.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {m.commitments.map((c, i) => (
                      <li key={i} className="flex gap-2 text-[13px] leading-snug" style={{ color: 'var(--ink)' }}>
                        <span
                          className="mt-[7px] h-1.5 w-1.5 flex-shrink-0 rounded-full"
                          style={{ background: 'var(--ember)' }}
                        />
                        <span>
                          {c.who && <span className="font-medium">{c.who}: </span>}
                          {c.what}
                          {c.due && <span style={{ color: 'var(--ink-soft)' }}> — due {c.due}</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function BriefList({ title, items, accent }: { title: string; items: string[]; accent?: string }) {
  if (!Array.isArray(items) || items.length === 0) return null;
  return (
    <div>
      <p className="mb-1.5 text-[11.5px] font-semibold uppercase tracking-wide" style={{ color: 'var(--ink-soft)' }}>
        {title}
      </p>
      <ul className="space-y-1">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2 text-[13.5px] leading-snug" style={{ color: 'var(--ink)' }}>
            <span
              className="mt-[7px] h-1.5 w-1.5 flex-shrink-0 rounded-full"
              style={{ background: accent ?? 'var(--ink-faint)' }}
            />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
