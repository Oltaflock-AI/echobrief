import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CalendarCheck, MessageCircle, Percent, ShieldCheck, Target } from 'lucide-react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { formatIST } from '@/lib/time';
import { Skeleton } from '@/components/ui/skeleton';
import type { CoachingReport } from '@/types/meeting';

// meeting_insights.coaching postdates the generated Database types, so the
// join is read through an untyped handle and shaped locally. RLS scopes rows.
const db = supabase;

const WINDOW_DAYS = 90;

interface InsightsRow {
  coaching: CoachingReport | null;
  created_at: string;
}
interface MeetingRow {
  id: string;
  title: string;
  start_time: string;
  meeting_insights: InsightsRow[] | InsightsRow | null;
}

type NextStepStrength = 'date_locked' | 'vague' | 'none';

/** One coached call, with the scorecard fields pulled out (null = not measured). */
interface CoachedCall {
  id: string;
  title: string;
  start_time: string;
  coaching: CoachingReport;
  talkRatio: number | null;
  talkVerdict: string | null;
  hedge: number | null;
  nextStep: boolean | null;
  nextStepStrength: NextStepStrength | null;
  /** true = there was pushback and it was handled; null = flag absent. */
  objectionHandled: boolean | null;
}

interface Scorecard {
  calls: number;
  talkRatio: number | null;
  hedge: number | null;
  nextStepRate: number | null;
  objectionRate: number | null;
}

interface WeekRow extends Scorecard {
  key: string;
  label: string;
}

/** Regeneration appends insight rows; the newest one is the live copy. */
function newestInsights(rows: InsightsRow[] | InsightsRow | null): InsightsRow | null {
  if (!rows) return null;
  if (!Array.isArray(rows)) return rows;
  return [...rows].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0] ?? null;
}

function finite(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function toCoachedCalls(rows: MeetingRow[]): CoachedCall[] {
  const out: CoachedCall[] = [];
  for (const m of rows) {
    const coaching = newestInsights(m.meeting_insights)?.coaching;
    if (!coaching || typeof coaching !== 'object') continue;
    const talk = coaching.metrics?.talk_ratio;
    const nextStep = coaching.flags?.next_step_secured;
    const objection = coaching.flags?.objection_ignored;
    out.push({
      id: m.id,
      title: m.title,
      start_time: m.start_time,
      coaching,
      talkRatio: finite(talk?.value),
      talkVerdict: talk?.verdict ?? null,
      hedge: finite(coaching.metrics?.hedge_density?.value),
      nextStep: nextStep ? !!nextStep.value : null,
      nextStepStrength: nextStep?.strength ?? null,
      objectionHandled: objection ? !objection.value : null,
    });
  }
  return out;
}

function avg(xs: number[]): number | null {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

function rate(hits: number, total: number): number | null {
  return total ? (hits / total) * 100 : null;
}

function summarize(calls: CoachedCall[]): Scorecard {
  const talk = calls.map((c) => c.talkRatio).filter((v): v is number => v !== null);
  const hedge = calls.map((c) => c.hedge).filter((v): v is number => v !== null);
  const withObjectionFlag = calls.filter((c) => c.objectionHandled !== null);
  return {
    calls: calls.length,
    talkRatio: avg(talk),
    hedge: avg(hedge),
    nextStepRate: rate(calls.filter((c) => c.nextStep === true).length, calls.length),
    objectionRate: rate(withObjectionFlag.filter((c) => c.objectionHandled).length, withObjectionFlag.length),
  };
}

/** ISO week (Monday start) of the call's IST calendar date, as "yyyy-MM-dd". */
function isoWeekStart(startTime: string): string | null {
  const day = formatIST(startTime, 'yyyy-MM-dd');
  if (!day) return null;
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

function bucketByWeek(calls: CoachedCall[]): WeekRow[] {
  const groups = new Map<string, CoachedCall[]>();
  for (const c of calls) {
    const key = isoWeekStart(c.start_time);
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([key, group]) => ({
      key,
      // Noon UTC is the same calendar day in IST, so formatIST renders the key's own date.
      label: `Week of ${formatIST(new Date(`${key}T12:00:00Z`), 'MMM d')}`,
      ...summarize(group),
    }));
}

const fmtPct = (v: number | null, digits = 0) => (v === null ? '—' : `${v.toFixed(digits)}%`);
const fmtNum = (v: number | null, digits = 1) => (v === null ? '—' : v.toFixed(digits));

function verdictColor(verdict: string | null): string {
  if (verdict === 'good') return 'var(--ember-deep)';
  if (verdict === 'ok') return 'var(--ink-mid)';
  if (verdict === 'high' || verdict === 'low') return 'hsl(var(--destructive))';
  return 'var(--ink-soft)';
}

function firstSentence(text?: string): string {
  if (!text) return '';
  const match = text.match(/^.*?[.!?](?=\s|$)/);
  return (match ? match[0] : text).trim();
}

/** Tiny trend line, oldest → newest. Renders nothing with fewer than two points. */
function Sparkline({ values }: { values: (number | null)[] }) {
  const pts = values.filter((v): v is number => v !== null);
  if (pts.length < 2) return null;
  const w = 64;
  const h = 18;
  const pad = 2;
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = max - min || 1;
  const step = (w - pad * 2) / (pts.length - 1);
  const points = pts
    .map((v, i) => `${(pad + i * step).toFixed(1)},${(h - pad - ((v - min) / span) * (h - pad * 2)).toFixed(1)}`)
    .join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" className="mt-1 block">
      <polyline
        points={points}
        fill="none"
        stroke="var(--ember)"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function NextStepBadge({ secured, strength }: { secured: boolean | null; strength: NextStepStrength | null }) {
  if (secured === null) return null;
  const cfg = secured && strength === 'date_locked'
    ? { label: 'Date locked', color: 'var(--ember-deep)', tint: 'color-mix(in oklch, var(--ember) 12%, transparent)' }
    : secured
      ? { label: 'Vague next step', color: 'hsl(var(--warning))', tint: 'color-mix(in oklch, hsl(var(--warning)) 14%, transparent)' }
      : { label: 'No next step', color: 'hsl(var(--destructive))', tint: 'color-mix(in oklch, hsl(var(--destructive)) 12%, transparent)' };
  return (
    <span
      className="inline-flex flex-shrink-0 items-center rounded-full px-2 py-0.5 text-[11.5px] font-medium"
      style={{ background: cfg.tint, color: cfg.color }}
    >
      {cfg.label}
    </span>
  );
}

export default function Coaching() {
  const { user } = useAuth();

  const { data: calls = [], isLoading, error } = useQuery({
    queryKey: ['coaching-calls', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await db
        .from('meetings')
        .select('id, title, start_time, meeting_insights(coaching, created_at)')
        .eq('user_id', user!.id)
        .eq('status', 'completed')
        .not('title', 'like', '[harness]%')
        .gte('start_time', since)
        .order('start_time', { ascending: false });
      if (error) throw error;
      return toCoachedCalls((data ?? []) as MeetingRow[]);
    },
  });

  const overall = useMemo(() => summarize(calls), [calls]);
  const weeks = useMemo(() => bucketByWeek(calls), [calls]);
  // Sparklines read oldest → newest.
  const trend = useMemo(() => [...weeks].reverse(), [weeks]);

  const fetchError = error ? (error instanceof Error ? error.message : 'Could not load coaching reports') : null;

  const tiles = [
    { label: 'Avg talk ratio', value: fmtPct(overall.talkRatio), hint: 'your side’s share of the talking', icon: Percent },
    { label: 'Avg hedge words', value: fmtNum(overall.hedge), hint: 'per 100 words you spoke', icon: MessageCircle },
    { label: 'Next step secured', value: fmtPct(overall.nextStepRate), hint: 'of coached calls', icon: CalendarCheck, accent: true },
    { label: 'Objections handled', value: fmtPct(overall.objectionRate), hint: 'of calls with pushback', icon: ShieldCheck },
  ];

  const columns: { label: string; values: (number | null)[] }[] = [
    { label: 'Talk ratio', values: trend.map((w) => w.talkRatio) },
    { label: 'Hedge / 100', values: trend.map((w) => w.hedge) },
    { label: 'Next-step rate', values: trend.map((w) => w.nextStepRate) },
    { label: 'Objection-handled rate', values: trend.map((w) => w.objectionRate) },
  ];

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-[960px] px-4 py-6 sm:px-6 md:px-8 md:py-10">
        {/* Header */}
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1
              className="text-[28px] font-semibold leading-tight"
              style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}
            >
              Coaching
            </h1>
            <p className="mt-1 text-[14px]" style={{ color: 'var(--ink-mid)' }}>
              Your scorecard across the last {WINDOW_DAYS} days of coached external calls.
            </p>
          </div>
          {!isLoading && calls.length > 0 && (
            <div>
              <p className="text-[12.5px]" style={{ color: 'var(--ink-mid)' }}>Coached calls</p>
              <p
                className="mt-0.5 text-[22px] font-semibold leading-none"
                style={{ color: 'var(--ember-deep)', letterSpacing: '-0.02em' }}
              >
                {calls.length}
              </p>
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-24 rounded-xl" />
              ))}
            </div>
            <Skeleton className="h-40 rounded-xl" />
            <Skeleton className="h-14 rounded-lg" />
            <Skeleton className="h-14 rounded-lg" />
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
        ) : calls.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center rounded-xl px-6 py-16 text-center"
            style={{ border: '1px dashed var(--rule)', background: 'var(--paper-card)' }}
          >
            <Target className="mb-4 h-10 w-10" strokeWidth={1.5} style={{ color: 'var(--ink-faint)' }} />
            <p className="mb-1.5 text-[17px] font-semibold" style={{ color: 'var(--ink)' }}>
              No coached calls yet
            </p>
            <p className="max-w-md text-[14px]" style={{ color: 'var(--ink-mid)', lineHeight: 1.6 }}>
              Coaching reports appear for external calls processed after Aug 31, 2026 — open an older meeting and
              use Regenerate insights to backfill.
            </p>
          </div>
        ) : (
          <>
            {/* Stat tiles */}
            <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
              {tiles.map((t) => (
                <div
                  key={t.label}
                  className="rounded-xl p-5"
                  style={{ background: 'var(--paper-card)', border: '1px solid var(--rule)' }}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-[13px]" style={{ color: 'var(--ink-mid)' }}>
                      {t.label}
                    </p>
                    <t.icon
                      className="h-[15px] w-[15px]"
                      strokeWidth={1.75}
                      style={{ color: t.accent ? 'var(--ember)' : 'var(--ink-soft)' }}
                    />
                  </div>
                  <p
                    className="mt-2 text-[26px] font-semibold leading-none"
                    style={{ color: t.accent ? 'var(--ember-deep)' : 'var(--ink)', letterSpacing: '-0.02em' }}
                  >
                    {t.value}
                  </p>
                  <p className="mt-1.5 text-[11.5px]" style={{ color: 'var(--ink-soft)' }}>
                    {t.hint}
                  </p>
                </div>
              ))}
            </div>

            {/* Weekly trend */}
            <h2
              className="mb-3 text-[17px] font-semibold"
              style={{ color: 'var(--ink)', letterSpacing: '-0.01em' }}
            >
              Week by week
            </h2>
            <div
              className="scroll-x mb-8 rounded-xl"
              style={{ border: '1px solid var(--rule)', background: 'var(--paper-card)' }}
            >
              <table className="w-full min-w-[640px] text-left text-[13.5px]">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--rule)' }}>
                    <th className="px-4 py-3 text-[12px] font-semibold uppercase tracking-wide" style={{ color: 'var(--ink-soft)' }}>
                      Week
                    </th>
                    <th className="px-4 py-3 text-right text-[12px] font-semibold uppercase tracking-wide" style={{ color: 'var(--ink-soft)' }}>
                      Calls
                    </th>
                    {columns.map((col) => (
                      <th key={col.label} className="px-4 py-3 text-right align-top text-[12px] font-semibold uppercase tracking-wide" style={{ color: 'var(--ink-soft)' }}>
                        <span className="inline-flex flex-col items-end">
                          {col.label}
                          <Sparkline values={col.values} />
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {weeks.map((w, i) => (
                    <tr key={w.key} style={{ borderTop: i === 0 ? 'none' : '1px solid var(--rule)' }}>
                      <td className="px-4 py-3 font-medium" style={{ color: 'var(--ink)' }}>{w.label}</td>
                      <td className="px-4 py-3 text-right tabular-nums" style={{ color: 'var(--ink-mid)' }}>{w.calls}</td>
                      <td className="px-4 py-3 text-right tabular-nums" style={{ color: 'var(--ink)' }}>{fmtPct(w.talkRatio)}</td>
                      <td className="px-4 py-3 text-right tabular-nums" style={{ color: 'var(--ink)' }}>{fmtNum(w.hedge)}</td>
                      <td className="px-4 py-3 text-right tabular-nums" style={{ color: 'var(--ink)' }}>{fmtPct(w.nextStepRate)}</td>
                      <td className="px-4 py-3 text-right tabular-nums" style={{ color: 'var(--ink)' }}>{fmtPct(w.objectionRate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Recent coached calls */}
            <h2
              className="mb-1 text-[17px] font-semibold"
              style={{ color: 'var(--ink)', letterSpacing: '-0.01em' }}
            >
              Recent coached calls
            </h2>
            <div>
              {calls.map((c) => (
                <div
                  key={c.id}
                  className="flex flex-wrap items-start gap-x-4 gap-y-2 py-3.5"
                  style={{ borderTop: '1px solid var(--rule)' }}
                >
                  <div className="min-w-0 flex-1 basis-[260px]">
                    <p className="text-[12px]" style={{ color: 'var(--ink-soft)' }}>
                      {formatIST(c.start_time, 'EEE, MMM d, yyyy')}
                    </p>
                    <Link
                      to={`/meeting/${c.id}`}
                      className="mt-0.5 block truncate text-[15px] font-semibold no-underline hover:underline"
                      style={{ color: 'var(--ink)' }}
                    >
                      {c.title}
                    </Link>
                    {firstSentence(c.coaching.summary) && (
                      <p className="mt-1 text-[13px] leading-snug" style={{ color: 'var(--ink-mid)' }}>
                        {firstSentence(c.coaching.summary)}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-[11.5px]" style={{ color: 'var(--ink-soft)' }}>Talk ratio</p>
                      <p
                        className="text-[18px] font-semibold leading-none tabular-nums"
                        style={{ color: c.talkRatio === null ? 'var(--ink-soft)' : verdictColor(c.talkVerdict), letterSpacing: '-0.02em' }}
                      >
                        {fmtPct(c.talkRatio)}
                      </p>
                    </div>
                    <NextStepBadge secured={c.nextStep} strength={c.nextStepStrength} />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
