/**
 * Notes grouped by topic, from the whitelisted facts a share link carries.
 *
 * Dependency-free on purpose: the bucketing is tested from the deno harness
 * (`supabase/functions/tests/share_notes_test.ts`), which imports this file
 * directly the way `meeting_url_parity_test.ts` imports `src/lib/meetingUrl.ts`.
 *
 * A topic owns everything said from its timestamp until the next topic's. The
 * extraction pass emits topics in order with the time each one opened, so
 * "which chapter was this number said in" is a range lookup, not a second LLM
 * call — and a number the model placed at 14:02 lands under the chapter that
 * started at 12:30, exactly where a reader scrubbing the recording finds it.
 */

export interface PublicFacts {
  topics: Array<{ topic: string; ts: number; notes: string }>;
  numbers: Array<{ metric: string; value: string; ts: number }>;
  pain_points: Array<{ statement: string; ts: number }>;
  explicit_asks: Array<{ statement: string; ts: number }>;
  decisions: Array<{ decision: string; owner: string | null; ts: number }>;
}

export type NoteKind = 'number' | 'pain' | 'ask' | 'decision';

export interface NoteItem {
  kind: NoteKind;
  text: string;
  ts: number;
}

export interface TopicSection {
  topic: string;
  ts: number;
  notes: string;
  items: NoteItem[];
}

function flatten(facts: PublicFacts): NoteItem[] {
  const out: NoteItem[] = [];
  for (const n of facts.numbers ?? []) out.push({ kind: 'number', text: `${n.metric}: ${n.value}`, ts: n.ts });
  for (const p of facts.pain_points ?? []) out.push({ kind: 'pain', text: p.statement, ts: p.ts });
  for (const a of facts.explicit_asks ?? []) out.push({ kind: 'ask', text: a.statement, ts: a.ts });
  for (const d of facts.decisions ?? []) {
    out.push({ kind: 'decision', text: d.owner ? `${d.decision} — ${d.owner}` : d.decision, ts: d.ts });
  }
  return out;
}

/**
 * Topics in time order, each carrying the facts that fall inside its window.
 * Anything said before the first topic opened belongs to it: the extraction
 * timestamps a topic where it is named, which is often a beat after the first
 * number in it was spoken.
 */
export function bucketFacts(facts: PublicFacts | null | undefined): TopicSection[] {
  if (!facts || !Array.isArray(facts.topics) || facts.topics.length === 0) return [];
  const sections: TopicSection[] = [...facts.topics]
    .sort((a, b) => a.ts - b.ts)
    .map((t) => ({ topic: t.topic, ts: t.ts, notes: t.notes ?? '', items: [] }));

  for (const item of flatten(facts)) {
    let index = 0;
    for (let i = 0; i < sections.length; i += 1) {
      if (sections[i].ts <= item.ts) index = i;
      else break;
    }
    sections[index].items.push(item);
  }
  for (const section of sections) section.items.sort((a, b) => a.ts - b.ts);
  return sections;
}
