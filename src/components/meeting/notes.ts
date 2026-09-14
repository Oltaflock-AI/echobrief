/**
 * The reading order of a shared meeting, from the whitelisted facts.
 *
 * Dependency-free on purpose: tested from the deno harness
 * (`supabase/functions/tests/share_notes_test.ts`), which imports this file
 * directly the way `meeting_url_parity_test.ts` imports `src/lib/meetingUrl.ts`.
 *
 * Two things are derived here. **Chapters** are the topics the extraction pass
 * named, in time order — an outline, not a container: the first version of
 * this page hung every raw `metric: value` row under its chapter and produced
 * "uptime reliability: 2 to 3" as a note, which nobody can read. **Highlights**
 * are the synthesised key points, which are sentences; each is stamped with a
 * time when a number inside it matches a fact the extraction pass timestamped,
 * so "Expedia pays 6%" jumps to the second "6%" was said.
 */

/**
 * What both callers can hand in: the share payload's `publicFacts` (every
 * `ts` present) and the owner page's full `MeetingFacts` (every `ts`
 * optional). Rows without a usable time are skipped, never guessed.
 */
export interface PublicFacts {
  topics?: Array<{ topic: string; ts?: number; notes?: string }>;
  numbers?: Array<{ metric: string; value: string; ts?: number }>;
  pain_points?: Array<{ statement: string; ts?: number }>;
  explicit_asks?: Array<{ statement: string; ts?: number }>;
  decisions?: Array<{ decision: string; owner?: string | null; ts?: number }>;
}

function seconds(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, v) : null;
}

export interface Chapter {
  topic: string;
  ts: number;
  notes: string;
}

export interface Highlight {
  text: string;
  ts: number | null;
}

/** Topics in time order. */
export function chaptersOf(facts: PublicFacts | null | undefined): Chapter[] {
  if (!facts || !Array.isArray(facts.topics)) return [];
  return facts.topics
    .flatMap((t) => {
      const ts = t ? seconds(t.ts) : null;
      return t && typeof t.topic === 'string' && t.topic.trim() && ts !== null
        ? [{ topic: t.topic.trim(), ts, notes: (t.notes ?? '').trim() }]
        : [];
    })
    .sort((a, b) => a.ts - b.ts);
}

/** Digits and % only: "₹2,500" and "2500" are the same number. */
function numberTokens(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/\d[\d,]*(?:\.\d+)?%?/g)) out.add(m[0].replace(/,/g, ''));
  return [...out];
}

/**
 * How much a shared numeric token proves. "2500" or "6%" almost certainly
 * name the same figure; a bare "10" is in half the sentences of any call
 * ("10 to 20 hours", "10 to 20%") and on its own proves nothing.
 */
function weight(token: string): number {
  return token.endsWith('%') || token.replace('%', '').replace('.', '').length >= 3 ? 2 : 1;
}

/**
 * Key points with a timestamp where one can be derived.
 *
 * A key point is matched to a number fact when they share numeric tokens
 * worth at least one strong match ("2500", "6%") or two weak ones ("10" and
 * "20"). The best-scoring fact wins, earliest on a tie, since a figure is
 * usually introduced before it is repeated. Text-only matching against pain
 * points and asks is deliberately not attempted — the sentences are
 * paraphrases, and a wrong timestamp is worse than none.
 */
export function highlightsOf(keyPoints: unknown, facts: PublicFacts | null | undefined): Highlight[] {
  const points = Array.isArray(keyPoints)
    ? keyPoints.filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
    : [];
  const numbers = (facts?.numbers ?? [])
    .flatMap((n) => {
      const ts = seconds(n.ts);
      return ts === null ? [] : [{ tokens: numberTokens(`${n.metric} ${n.value}`), ts }];
    })
    .filter((n) => n.tokens.length > 0)
    .sort((a, b) => a.ts - b.ts);

  return points.map((text) => {
    const tokens = numberTokens(text);
    let best: { score: number; ts: number } | null = null;
    if (tokens.length > 0) {
      for (const fact of numbers) {
        const score = fact.tokens.filter((t) => tokens.includes(t)).reduce((sum, t) => sum + weight(t), 0);
        if (score >= 2 && (!best || score > best.score)) best = { score, ts: fact.ts };
      }
    }
    return { text: text.trim(), ts: best ? best.ts : null };
  });
}
