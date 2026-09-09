/**
 * The coaching scorecard maths, shared by the Coaching page.
 *
 * These are the pure parts of Coaching.tsx — reading one meeting's coaching
 * report into a row, averaging rows into a scorecard, and bucketing them by ISO
 * week. Extracted so every caller computes the same numbers rather than a
 * second copy of them that can drift.
 */
import { formatIST } from '@/lib/time';
import type { CoachingReport } from '@/types/meeting';

export const COACHING_WINDOW_DAYS = 90;

export interface InsightsRow {
  coaching: CoachingReport | null;
  created_at: string;
}

export interface MeetingRow {
  id: string;
  title: string;
  start_time: string;
  meeting_insights: InsightsRow[] | InsightsRow | null;
}

export type NextStepStrength = 'date_locked' | 'vague' | 'none';

/** One coached call, with the scorecard fields pulled out (null = not measured). */
export interface CoachedCall {
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

export interface Scorecard {
  calls: number;
  talkRatio: number | null;
  hedge: number | null;
  nextStepRate: number | null;
  objectionRate: number | null;
}

export interface WeekRow extends Scorecard {
  key: string;
  label: string;
}

/** Regeneration appends insight rows; the newest one is the live copy. */
export function newestInsights(rows: InsightsRow[] | InsightsRow | null): InsightsRow | null {
  if (!rows) return null;
  if (!Array.isArray(rows)) return rows;
  return [...rows].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0] ?? null;
}

function finite(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

export function toCoachedCalls(rows: MeetingRow[]): CoachedCall[] {
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
      nextStepStrength: (nextStep?.strength as NextStepStrength | undefined) ?? null,
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

export function summarize(calls: CoachedCall[]): Scorecard {
  const talk = calls.map((c) => c.talkRatio).filter((v): v is number => v !== null);
  const hedge = calls.map((c) => c.hedge).filter((v): v is number => v !== null);
  const withObjectionFlag = calls.filter((c) => c.objectionHandled !== null);
  return {
    calls: calls.length,
    talkRatio: avg(talk),
    hedge: avg(hedge),
    nextStepRate: rate(calls.filter((c) => c.nextStep === true).length, calls.length),
    objectionRate: rate(
      withObjectionFlag.filter((c) => c.objectionHandled).length,
      withObjectionFlag.length,
    ),
  };
}

/** ISO week (Monday start) of the call's IST calendar date, as "yyyy-MM-dd". */
export function isoWeekStart(startTime: string): string | null {
  const day = formatIST(startTime, 'yyyy-MM-dd');
  if (!day) return null;
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

export function bucketByWeek(calls: CoachedCall[]): WeekRow[] {
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

export const fmtPct = (v: number | null, digits = 0) => (v === null ? '—' : `${v.toFixed(digits)}%`);
export const fmtNum = (v: number | null, digits = 1) => (v === null ? '—' : v.toFixed(digits));

/**
 * The one thing to work on next, chosen from the numbers rather than written by
 * a model: whichever target is missed by the widest relative margin. Every line
 * here is fixed text tied to a specific measured failure — nothing is inferred
 * about what was said. Returns null when nothing is off target.
 */
export function focusTip(s: Scorecard): { title: string; body: string } | null {
  if (!s.calls) return null;
  const candidates: { gap: number; title: string; body: string }[] = [];

  if (s.talkRatio !== null && s.talkRatio > 45) {
    candidates.push({
      gap: (s.talkRatio - 45) / 45,
      title: 'Talk less than half the call.',
      body: `You spoke ${Math.round(s.talkRatio)}% of the time across these calls. Strong discovery calls keep the rep under 45% — ask, then stop talking.`,
    });
  }
  if (s.hedge !== null && s.hedge > 3) {
    candidates.push({
      gap: (s.hedge - 3) / 3,
      title: 'Cut the hedging.',
      body: `${s.hedge.toFixed(1)} hedge words per 100 you spoke ("maybe", "I think", "sort of"). Say the number, then stop.`,
    });
  }
  if (s.nextStepRate !== null && s.nextStepRate < 100) {
    candidates.push({
      gap: (100 - s.nextStepRate) / 100,
      title: 'Lock a date before you hang up.',
      body: `${Math.round(s.nextStepRate)}% of these calls ended with a secured next step. A date on the calendar beats "we'll be in touch".`,
    });
  }
  if (s.objectionRate !== null && s.objectionRate < 100) {
    candidates.push({
      gap: (100 - s.objectionRate) / 100,
      title: 'Answer the pushback in the room.',
      body: `${Math.round(s.objectionRate)}% of the calls with pushback had it addressed. An objection left hanging is the one that kills the deal later.`,
    });
  }

  return candidates.sort((a, b) => b.gap - a.gap)[0] ?? null;
}
