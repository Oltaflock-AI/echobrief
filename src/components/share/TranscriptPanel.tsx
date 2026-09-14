import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { Avatar, Card, CardHeader, Chip } from '@/ui';
import { Ts, useJump } from './jump';
import type { TranscriptSegment } from './types';

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
 *
 * A timestamp click elsewhere on the page (a note, an action item, a cited
 * answer) lands here when the link has no recording: the turn open at that
 * second scrolls into view and flashes once.
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
  fill = false,
}: {
  segments: TranscriptSegment[];
  speakers: string[];
  /** Fill the parent's height (the sticky desktop column) instead of capping at 72dvh. */
  fill?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [speaker, setSpeaker] = useState<string | null>(null);
  const { scrollTo, scrollNonce } = useJump();
  const [flash, setFlash] = useState<number | null>(null);
  const rows = useRef<Map<number, HTMLDivElement>>(new Map());

  const turns = useMemo(() => toTurns(segments), [segments]);
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return turns.filter((turn) => {
      if (speaker && turn.speaker !== speaker) return false;
      if (!needle) return true;
      return turn.lines.join(' ').toLowerCase().includes(needle);
    });
  }, [turns, query, speaker]);

  // The turn open at the requested second: the last one that starts at or
  // before it. Filters are cleared first so the target is actually rendered.
  useEffect(() => {
    if (scrollTo == null) return;
    setQuery('');
    setSpeaker(null);
    let target = 0;
    for (let i = 0; i < turns.length; i += 1) {
      if (turns[i].start != null && turns[i].start! <= scrollTo) target = i;
      else if (turns[i].start != null) break;
    }
    // Wait a frame so the unfiltered list is in the DOM before measuring.
    const frame = requestAnimationFrame(() => {
      const row = rows.current.get(target);
      const scroller = row?.parentElement;
      if (row && scroller) {
        // Scroll the transcript's own box, not the page — on desktop the page
        // is meant to stay where the reader was.
        scroller.scrollTo({
          // The scroller is `relative`, so offsetTop is measured from it.
          top: row.offsetTop - scroller.clientHeight / 2 + row.clientHeight / 2,
          behavior: 'smooth',
        });
      }
      setFlash(target);
    });
    const timer = setTimeout(() => setFlash(null), 1600);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [scrollTo, scrollNonce, turns]);

  return (
    <Card padded={false} className={fill ? 'flex h-full min-h-0 flex-col' : ''}>
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
        <div className={`relative overflow-y-auto px-[18px] py-4 ${fill ? 'min-h-0 flex-1' : 'max-h-[72dvh]'}`}>
          {visible.map((turn) => {
            const index = turns.indexOf(turn);
            return (
            <div
              key={index}
              ref={(el) => {
                if (el) rows.current.set(index, el);
                else rows.current.delete(index);
              }}
              className={`-mx-2 mt-5 flex gap-3 rounded-card px-2 py-1 transition-colors duration-700 first:mt-0 ${
                flash === index ? 'bg-eb-accent-soft' : ''
              }`}
            >
              <Avatar name={turn.speaker} size={28} round className="mt-[2px]" />
              <div className="min-w-0 flex-1">
                <p className="m-0 mb-1 flex items-baseline gap-2 font-dmsans text-[12.5px] font-semibold text-eb-text">
                  {turn.speaker}
                  <Ts seconds={turn.start} />
                </p>
                <p className="m-0 font-dmsans text-[14px] leading-[1.7] text-eb-prose">
                  {highlight(turn.lines.join(' '), query.trim())}
                </p>
              </div>
            </div>
            );
          })}
        </div>
      )}

      <p className="m-0 border-t border-eb-divider px-[18px] py-2 font-dmsans text-[11.5px] text-eb-secondary">
        Anything said before the meeting started or after it ended is left out.
      </p>
    </Card>
  );
}
