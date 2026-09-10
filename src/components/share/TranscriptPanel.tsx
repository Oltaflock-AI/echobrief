import { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import { Avatar, Card, CardHeader, Chip } from '@/ui';
import { timestamp, type TranscriptSegment } from './types';

/**
 * The meeting-zone transcript, grouped into turns.
 *
 * 343 lines of "Hmm." and "Uh, yeah." is what a raw segment list looks like, so
 * consecutive lines from one speaker are merged into a single paragraph and the
 * name is printed once per turn. Search and the speaker filter exist because
 * the reason somebody opens a shared transcript is almost always "what exactly
 * did they say about X" — scrolling is the fallback, not the interface.
 *
 * The payload arrives already filtered to the meeting zone; this component has
 * no way to widen it, which is where that guarantee belongs.
 */

interface Turn {
  speaker: string;
  start: number | null;
  lines: string[];
}

function toTurns(segments: TranscriptSegment[]): Turn[] {
  const turns: Turn[] = [];
  for (const segment of segments) {
    const last = turns[turns.length - 1];
    if (last && last.speaker === segment.speaker) {
      last.lines.push(segment.text);
    } else {
      turns.push({ speaker: segment.speaker, start: segment.start, lines: [segment.text] });
    }
  }
  return turns;
}

/** Wraps every match in a mark, so a search result is visible inside a paragraph. */
function highlight(text: string, query: string) {
  if (!query) return text;
  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig'));
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase() ? (
      <mark key={i} className="rounded-[3px] bg-eb-accent-soft px-0.5 text-eb-accent-text">
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

export function TranscriptPanel({
  segments,
  speakers,
}: {
  segments: TranscriptSegment[];
  speakers: string[];
}) {
  const [query, setQuery] = useState('');
  const [speaker, setSpeaker] = useState<string | null>(null);

  const turns = useMemo(() => toTurns(segments), [segments]);
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return turns.filter((turn) => {
      if (speaker && turn.speaker !== speaker) return false;
      if (!needle) return true;
      return turn.lines.join(' ').toLowerCase().includes(needle);
    });
  }, [turns, query, speaker]);

  return (
    <Card padded={false}>
      <CardHeader
        title="Transcript"
        count={turns.length}
        right={
          <div className="flex items-center gap-1.5">
            {speakers.length > 1 && (
              <>
                <Chip size="sm" selected={speaker === null} onClick={() => setSpeaker(null)}>
                  Everyone
                </Chip>
                {speakers.map((name) => (
                  <Chip
                    key={name}
                    size="sm"
                    selected={speaker === name}
                    onClick={() => setSpeaker(speaker === name ? null : name)}
                  >
                    {name.split(' ')[0]}
                  </Chip>
                ))}
              </>
            )}
          </div>
        }
      />

      <div className="border-b border-eb-divider px-[18px] py-2.5">
        <div className="relative">
          <Search
            size={14}
            strokeWidth={1.75}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-eb-muted"
          />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search the transcript…"
            aria-label="Search the transcript"
            className="h-[38px] w-full rounded-input border border-eb-border bg-white pl-9 pr-9 font-dmsans text-[13.5px] text-eb-text shadow-eb-input outline-none placeholder:text-eb-muted focus:border-eb-accent"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-eb-muted hover:text-eb-text"
            >
              <X size={14} strokeWidth={1.75} />
            </button>
          )}
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="px-[18px] py-8 text-center font-dmsans text-[13px] text-eb-secondary">
          Nothing in this transcript matches that.
        </p>
      ) : (
        <div className="max-h-[72dvh] overflow-y-auto px-[18px] py-4">
          {visible.map((turn, i) => (
            <div key={i} className="mt-5 flex gap-3 first:mt-0">
              <Avatar name={turn.speaker} size={28} round className="mt-[2px]" />
              <div className="min-w-0 flex-1">
                <p className="m-0 mb-1 font-dmsans text-[12.5px] font-semibold text-eb-text">
                  {turn.speaker}
                  {turn.start != null && (
                    <span className="ml-2 font-mono text-[11.5px] font-normal text-eb-muted">
                      {timestamp(turn.start)}
                    </span>
                  )}
                </p>
                <p className="m-0 font-dmsans text-[14px] leading-[1.7] text-eb-prose">
                  {highlight(turn.lines.join(' '), query.trim())}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="border-t border-eb-divider px-[18px] py-2.5 font-dmsans text-[12px] text-eb-secondary">
        Anything said before the meeting started or after it ended is left out.
      </p>
    </Card>
  );
}
