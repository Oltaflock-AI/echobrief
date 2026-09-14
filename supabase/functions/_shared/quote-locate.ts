/**
 * Where in a meeting a quoted line was said.
 *
 * The model supplies the words; the timestamp is derived here from the stored
 * speaker segments, so a citation can never point at a moment that was
 * invented. Exact-ish match first, then the longest run of words shared with a
 * segment — which is what survives a model dropping a filler word. Unmatched
 * quotes get no timestamp rather than a guessed one.
 *
 * Shared by `chat-transcripts` (many meetings) and `ask-shared-meeting` (one).
 */

/** Whitespace, case and punctuation folded — quotes come back lightly reworded. */
export function normalizeQuote(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

/** A word run this short is a coincidence, not a citation. */
const MIN_SHARED_WORDS = 4;

export interface LocatableSegment {
  text?: unknown;
  start?: unknown;
}

/** Seconds into the meeting, or null when nothing matches well enough. */
export function locateQuoteInSegments(segments: unknown, rawQuote: string): number | null {
  const quote = normalizeQuote(rawQuote ?? "");
  if (!quote || !Array.isArray(segments)) return null;

  let best: { score: number; start: number } | null = null;
  const quoteWords = quote.split(" ");
  for (const seg of segments as LocatableSegment[]) {
    if (typeof seg?.start !== "number" || typeof seg?.text !== "string") continue;
    const text = normalizeQuote(seg.text);
    if (!text) continue;
    let score = 0;
    if (text.includes(quote) || quote.includes(text)) {
      score = 1000 + Math.min(text.length, quote.length);
    } else {
      let run = 0;
      for (const w of quoteWords) {
        if (w.length > 3 && text.includes(w)) run += 1;
      }
      score = run;
    }
    if (score > 0 && (!best || score > best.score)) best = { score, start: seg.start };
  }
  return best && best.score >= MIN_SHARED_WORDS ? Math.max(0, Math.floor(best.start)) : null;
}

/**
 * One timestamp per cited meeting. `quotes` maps meeting id → the quote the
 * model cited for it.
 */
export async function locateQuotes(
  supabase: any,
  meetingIds: string[],
  quotes: Map<string, string>,
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const wanted = meetingIds.filter((id) => quotes.has(id));
  if (wanted.length === 0) return out;

  const { data } = await supabase
    .from("transcripts")
    .select("meeting_id, speakers")
    .in("meeting_id", wanted);

  for (const row of (data ?? []) as Array<{ meeting_id: string; speakers: unknown }>) {
    const at = locateQuoteInSegments(row.speakers, quotes.get(row.meeting_id) ?? "");
    if (at !== null) out.set(row.meeting_id, at);
  }
  return out;
}
