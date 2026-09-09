/**
 * Coaching — Console (UI v2), from mockup 07-coaching.
 *
 * Every number is computed from the per-meeting coaching reports the pipeline
 * already writes (`meeting_insights.coaching`); the maths lives in
 * `@/lib/coachingScorecard` so this page and V1 cannot drift apart.
 *
 * The mockup's "this week, try" panel is here, but it is not written by a
 * model: `focusTip` picks whichever target is missed by the widest relative
 * margin and shows fixed copy for that specific measured failure. A coaching
 * tip invented per visit would be the sort of confident sentence nothing backs.
 */

import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CalendarCheck, MessageCircle, Percent, ShieldCheck, Sparkles } from 'lucide-react';
import { AppShell } from '@/components/shell/AppShell';
import { ListSkeleton } from '@/components/dashboard/ListSkeleton';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { formatIST } from '@/lib/time';
import {
  COACHING_WINDOW_DAYS,
  bucketByWeek,
  fmtNum,
  fmtPct,
  focusTip,
  summarize,
  toCoachedCalls,
  type CoachedCall,
  type MeetingRow,
  type WeekRow,
} from '@/lib/coachingScorecard';
import { Badge, Card, DarkPanel, PageHeader, StatTile, TwoColumn } from '@/ui';

// meeting_insights.coaching postdates the generated Database types, so the join
// is read through an untyped handle and shaped locally. RLS scopes the rows.
const db = supabase;

/** Sparkline over the weekly trend — flat line when there is nothing to plot. */
function Spark({ points, tone }: { points: (number | null)[]; tone: 'accent' | 'green' }) {
  const pts = points.filter((p): p is number => p !== null);
  if (pts.length < 2) return null;
  const w = 68;
  const h = 22;
  const pad = 2;
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = max - min || 1;
  const step = (w - pad * 2) / (pts.length - 1);
  const d = pts
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${pad + i * step} ${h - pad - ((p - min) / span) * (h - pad * 2)}`)
    .join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" className="flex-none">
      <path
        d={d}
        fill="none"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        stroke={tone === 'accent' ? 'var(--eb-accent)' : 'var(--eb-green)'}
      />
    </svg>
  );
}

function nextStepBadge(call: CoachedCall) {
  if (call.nextStepStrength === 'date_locked') return { tone: 'green' as const, label: 'Date locked' };
  if (call.nextStepStrength === 'vague') return { tone: 'amber' as const, label: 'Vague next step' };
  if (call.nextStep === false) return { tone: 'red' as const, label: 'No next step' };
  return null;
}

export default function Coaching() {
  const { user } = useAuth();

  const { data: calls = [], isLoading, error } = useQuery({
    queryKey: ['coaching-calls', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const since = new Date(Date.now() - COACHING_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
      const { data, error: err } = await db
        .from('meetings')
        .select('id, title, start_time, meeting_insights(coaching, created_at)')
        .eq('user_id', user!.id)
        .eq('status', 'completed')
        .not('title', 'like', '[harness]%')
        .gte('start_time', since)
        .order('start_time', { ascending: false });
      if (err) throw err;
      return toCoachedCalls((data ?? []) as MeetingRow[]);
    },
  });

  const overall = useMemo(() => summarize(calls), [calls]);
  const weeks = useMemo(() => bucketByWeek(calls), [calls]);
  // Sparklines read oldest → newest.
  const trend = useMemo(() => [...weeks].reverse(), [weeks]);
  const tip = useMemo(() => focusTip(overall), [overall]);

  const tiles: {
    label: string;
    value: string;
    hint: string;
    icon: React.ElementType;
    series: (number | null)[];
    tone: 'accent' | 'green';
    accent?: boolean;
  }[] = [
    {
      label: 'Talk ratio',
      value: fmtPct(overall.talkRatio),
      hint: 'your share of the talking',
      icon: Percent,
      series: trend.map((w: WeekRow) => w.talkRatio),
      tone: 'accent',
      accent: true,
    },
    {
      label: 'Hedge words',
      value: fmtNum(overall.hedge),
      hint: 'per 100 words you spoke',
      icon: MessageCircle,
      series: trend.map((w: WeekRow) => w.hedge),
      tone: 'accent',
    },
    {
      label: 'Next step secured',
      value: fmtPct(overall.nextStepRate),
      hint: 'of coached calls',
      icon: CalendarCheck,
      series: trend.map((w: WeekRow) => w.nextStepRate),
      tone: 'green',
    },
    {
      label: 'Objections handled',
      value: fmtPct(overall.objectionRate),
      hint: 'of calls with pushback',
      icon: ShieldCheck,
      series: trend.map((w: WeekRow) => w.objectionRate),
      tone: 'green',
    },
  ];

  return (
    <AppShell>
      <PageHeader
        title="Coaching"
        subtitle={`Your scorecard across the last ${COACHING_WINDOW_DAYS} days of coached external calls.`}
      />

      {error ? (
        <Card className="text-center">
          <p className="font-dmsans text-sm font-medium text-eb-red">Could not load coaching reports</p>
          <p className="mt-1 font-dmsans text-[13px] text-eb-secondary">
            {error instanceof Error ? error.message : 'Please try again.'}
          </p>
        </Card>
      ) : isLoading ? (
        <ListSkeleton />
      ) : calls.length === 0 ? (
        <Card className="text-center">
          <Sparkles size={26} strokeWidth={1.5} className="mx-auto mb-2.5 text-eb-muted" />
          <p className="font-dmsans text-sm font-medium text-eb-text">No coached calls yet</p>
          <p className="mt-1 font-dmsans text-[13px] text-eb-secondary">
            A coaching report is written for every external meeting the pipeline summarises.
          </p>
        </Card>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {tiles.map((t) => (
              <div key={t.label} className="relative">
                <StatTile
                  label={t.label}
                  value={t.value}
                  delta={t.hint}
                  icon={<t.icon size={14} />}
                  accent={t.accent}
                />
                <span className="pointer-events-none absolute bottom-[18px] right-4">
                  <Spark points={t.series} tone={t.tone} />
                </span>
              </div>
            ))}
          </div>

          <TwoColumn
            rail={
              <div className="flex flex-col gap-4">
                <Card padded={false}>
                  <div className="border-b border-eb-divider px-[18px] py-3">
                    <h3 className="m-0 font-outfit text-[15px] font-semibold leading-tight text-eb-text">
                      Week by week
                    </h3>
                  </div>
                  <table className="w-full border-collapse">
                    <thead>
                      <tr>
                        <th className="px-[18px] pb-1 pt-2.5 text-left font-dmsans text-[11px] font-medium uppercase tracking-[.06em] text-eb-secondary" />
                        {['Calls', 'Talk', 'Hedge'].map((h) => (
                          <th
                            key={h}
                            className="px-2 pb-1 pt-2.5 text-right font-dmsans text-[11px] font-medium uppercase tracking-[.06em] text-eb-secondary last:pr-[18px]"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {weeks.map((w) => (
                        <tr key={w.key} className="border-t border-eb-divider">
                          <td className="px-[18px] py-2.5 font-dmsans text-[13px] text-eb-text">{w.label}</td>
                          <td className="px-2 py-2.5 text-right font-dmsans text-[13px] text-eb-secondary">
                            {w.calls}
                          </td>
                          <td className="px-2 py-2.5 text-right font-dmsans text-[13px] text-eb-secondary">
                            {fmtPct(w.talkRatio)}
                          </td>
                          <td className="px-2 py-2.5 pr-[18px] text-right font-dmsans text-[13px] text-eb-secondary">
                            {fmtNum(w.hedge)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>

                {tip && (
                  <DarkPanel eyebrow="Work on this next">
                    <p className="m-0 font-outfit text-[16px] font-semibold tracking-[-0.01em] text-white">
                      {tip.title}
                    </p>
                    <p className="mt-2 font-dmsans text-[13px] leading-relaxed text-eb-on-dark">{tip.body}</p>
                  </DarkPanel>
                )}
              </div>
            }
          >
            <Card padded={false}>
              <div className="flex items-center justify-between border-b border-eb-divider px-[18px] py-3">
                <h3 className="m-0 font-outfit text-[15px] font-semibold leading-tight text-eb-text">
                  Recent coached calls
                </h3>
                <span className="font-dmsans text-[12.5px] text-eb-secondary">
                  {calls.length} {calls.length === 1 ? 'call' : 'calls'}
                </span>
              </div>

              {calls.map((call) => {
                const badge = nextStepBadge(call);
                return (
                  <Link
                    key={call.id}
                    to={`/meeting/${call.id}?tab=coaching`}
                    className="flex items-start gap-4 border-b border-eb-divider px-[18px] py-3.5 no-underline last:border-0 hover:bg-eb-row-hover"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block font-dmsans text-[12px] text-eb-secondary">
                        {formatIST(new Date(call.start_time), 'EEE, MMM d')}
                      </span>
                      <span className="block truncate font-dmsans text-[14px] font-medium text-eb-text">
                        {call.title || 'Untitled meeting'}
                      </span>
                      {call.coaching.summary && (
                        <span className="mt-0.5 line-clamp-2 font-dmsans text-[12.5px] leading-snug text-eb-secondary">
                          {call.coaching.summary}
                        </span>
                      )}
                    </span>

                    {call.talkRatio !== null && (
                      <span className="flex-none text-right">
                        <span className="block font-dmsans text-[11.5px] text-eb-secondary">Talk ratio</span>
                        <span className="block font-outfit text-[16px] font-semibold text-eb-accent">
                          {fmtPct(call.talkRatio)}
                        </span>
                      </span>
                    )}

                    {badge && (
                      <Badge tone={badge.tone} className="mt-3 flex-none">
                        {badge.label}
                      </Badge>
                    )}
                  </Link>
                );
              })}
            </Card>
          </TwoColumn>
        </>
      )}
    </AppShell>
  );
}
