import { useEffect, useMemo, useRef, useState } from 'react';
import { Eye, EyeOff, Pencil, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar, Badge, Card, CardHeader, Chip } from '@/ui';
import { Ts, useJump } from './jump';
import { speakerColours } from './PlayerPanel';

/**
 * The owner's transcript, in a column beside the notes.
 *
 * Same shape as the share page's transcript — turns, search, a speaker filter,
 * a jump scrolls its own box — plus what only the owner gets: the internal
 * pre/post-meeting segments behind a toggle (never shown to anyone else),
 * renaming a speaker everywhere, and a highlight that follows the recording as
 * it plays.
 */
export interface ColumnSegment {
  speaker: string;
  text: string;
  start?: number;
  end?: number;
  zone?: string;
}

interface Turn {
  speaker: string;
  start: number | null;
  zone: string;
  lines: string[];
}

function toTurns(segments: ColumnSegment[]): Turn[] {
  const turns: Turn[] = [];
  for (const seg of segments) {
    const zone = seg.zone ?? 'meeting';
    const last = turns[turns.length - 1];
    if (last && last.speaker === seg.speaker && last.zone === zone) {
      last.lines.push(seg.text);
    } else {
      turns.push({ speaker: seg.speaker, start: typeof seg.start === 'number' ? seg.start : null, zone, lines: [seg.text] });
    }
  }
  return turns;
}

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

export function TranscriptColumn({
  segments,
  isOwner,
  currentTime,
  onRename,
  fill = false,
}: {
  /** Every segment, internal zones included; the toggle here decides what shows. */
  segments: ColumnSegment[];
  isOwner: boolean;
  /** Playback position from the player, so the open turn is highlighted. */
  currentTime: number;
  /** Rename a speaker everywhere. Resolves when the transcript has been rewritten. */
  onRename: (from: string, to: string) => Promise<void>;
  fill?: boolean;
}) {
  const { scrollTo, scrollNonce } = useJump();
  const [query, setQuery] = useState('');
  const [speaker, setSpeaker] = useState<string | null>(null);
  const [showInternal, setShowInternal] = useState(false);
  const [rename, setRename] = useState<{ from: string; value: string } | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [flash, setFlash] = useState<number | null>(null);
  const rows = useRef<Map<number, HTMLDivElement>>(new Map());
  const scroller = useRef<HTMLDivElement | null>(null);

  const internalCount = useMemo(
    () => segments.filter((s) => (s.zone ?? 'meeting') !== 'meeting').length,
    [segments],
  );
  const shown = useMemo(
    () => (showInternal ? segments : segments.filter((s) => (s.zone ?? 'meeting') === 'meeting')),
    [segments, showInternal],
  );
  const turns = useMemo(() => toTurns(shown), [shown]);
  const speakers = useMemo(() => {
    const seen: string[] = [];
    for (const t of turns) if (t.speaker && !seen.includes(t.speaker)) seen.push(t.speaker);
    return seen;
  }, [turns]);
  const colours = useMemo(() => speakerColours(shown), [shown]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return turns.filter((turn) => {
      if (speaker && turn.speaker !== speaker) return false;
      if (!needle) return true;
      return turn.lines.join(' ').toLowerCase().includes(needle);
    });
  }, [turns, query, speaker]);

  // The turn under the playhead: the last one that started at or before it.
  const activeIndex = useMemo(() => {
    let idx = -1;
    for (let i = 0; i < turns.length; i += 1) {
      if (turns[i].start != null && turns[i].start! <= currentTime) idx = i;
      else if (turns[i].start != null) break;
    }
    return idx;
  }, [turns, currentTime]);

  const scrollToRow = (index: number, behavior: ScrollBehavior) => {
    const row = rows.current.get(index);
    const box = scroller.current;
    if (!row || !box) return;
    box.scrollTo({ top: row.offsetTop - box.clientHeight / 2 + row.clientHeight / 2, behavior });
  };

  // Follow playback while the reader is not searching or filtering.
  useEffect(() => {
    if (activeIndex < 0 || query || speaker) return;
    const row = rows.current.get(activeIndex);
    const box = scroller.current;
    if (!row || !box) return;
    const top = row.offsetTop;
    if (top < box.scrollTop || top > box.scrollTop + box.clientHeight - row.clientHeight) {
      scrollToRow(activeIndex, 'smooth');
    }
  }, [activeIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  // A jump from anywhere on the page: clear filters, scroll, flash.
  useEffect(() => {
    if (scrollTo == null) return;
    setQuery('');
    setSpeaker(null);
    let target = 0;
    for (let i = 0; i < turns.length; i += 1) {
      if (turns[i].start != null && turns[i].start! <= scrollTo) target = i;
      else if (turns[i].start != null) break;
    }
    const frame = requestAnimationFrame(() => {
      scrollToRow(target, 'smooth');
      setFlash(target);
    });
    const timer = setTimeout(() => setFlash(null), 1600);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [scrollTo, scrollNonce]); // eslint-disable-line react-hooks/exhaustive-deps

  const commitRename = async () => {
    if (!rename) return;
    const to = rename.value.trim();
    if (!to || to === rename.from) {
      setRename(null);
      return;
    }
    setRenaming(true);
    try {
      await onRename(rename.from, to);
      setRename(null);
    } finally {
      setRenaming(false);
    }
  };

  return (
    <Card padded={false} className={fill ? 'flex h-full min-h-0 flex-col' : ''}>
      <CardHeader
        title="Transcript"
        count={turns.length}
        right={
          speakers.length > 1 ? (
            <div className="flex items-center gap-1.5">
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
            </div>
          ) : undefined
        }
      />

      <div className="flex items-center gap-2 border-b border-eb-divider px-[18px] py-2.5">
        <div className="relative flex-1">
          <Search size={14} strokeWidth={1.75} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-eb-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the transcript…"
            aria-label="Search the transcript"
            className="h-[36px] w-full rounded-input border border-eb-border bg-white pl-9 pr-9 font-dmsans text-[13px] text-eb-text shadow-eb-input outline-none placeholder:text-eb-muted focus:border-eb-accent"
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} aria-label="Clear search" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-eb-muted hover:text-eb-text">
              <X size={14} strokeWidth={1.75} />
            </button>
          )}
        </div>
        {internalCount > 0 && (
          <button
            type="button"
            onClick={() => setShowInternal((v) => !v)}
            title={`${internalCount} internal segment${internalCount === 1 ? '' : 's'} (pre/post-meeting) — visible only to you, never shared`}
            className="inline-flex h-[36px] flex-none items-center gap-1.5 rounded-input border border-eb-border bg-white px-2.5 font-dmsans text-[12px] font-medium text-eb-secondary hover:text-eb-text"
          >
            {showInternal ? <EyeOff size={13} strokeWidth={1.75} /> : <Eye size={13} strokeWidth={1.75} />}
            Internal
          </button>
        )}
      </div>

      {visible.length === 0 ? (
        <p className="px-[18px] py-8 text-center font-dmsans text-[13px] text-eb-secondary">
          {turns.length === 0 ? 'The transcript appears here once processing finishes.' : 'Nothing in this transcript matches that.'}
        </p>
      ) : (
        <div ref={scroller} className={`relative overflow-y-auto px-[18px] py-3 ${fill ? 'min-h-0 flex-1' : 'max-h-[72dvh]'}`}>
          {visible.map((turn) => {
            const index = turns.indexOf(turn);
            const internal = turn.zone !== 'meeting';
            const active = index === activeIndex && !query && !speaker;
            return (
              <div
                key={index}
                ref={(el) => {
                  if (el) rows.current.set(index, el);
                  else rows.current.delete(index);
                }}
                className={cn(
                  '-mx-2 mt-4 flex gap-3 rounded-card px-2 py-1.5 transition-colors duration-500 first:mt-0',
                  (flash === index || active) && 'bg-eb-accent-soft',
                  internal && 'opacity-60',
                )}
              >
                <Avatar name={turn.speaker} size={28} round className="mt-[2px]" />
                <div className="min-w-0 flex-1">
                  <p className="m-0 mb-1 flex flex-wrap items-baseline gap-2 font-dmsans text-[12.5px] font-semibold text-eb-text">
                    {rename && rename.from === turn.speaker ? (
                      <span className="flex items-center gap-1.5">
                        <input
                          autoFocus
                          value={rename.value}
                          onChange={(e) => setRename({ from: turn.speaker, value: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') void commitRename();
                            if (e.key === 'Escape') setRename(null);
                          }}
                          className="w-[min(180px,60vw)] rounded-input border border-eb-border bg-white px-2 py-1 font-dmsans text-[13px] font-normal outline-none"
                          aria-label="New speaker name"
                        />
                        <button type="button" onClick={() => void commitRename()} disabled={renaming} className="font-dmsans text-[12px] font-medium text-eb-accent">
                          {renaming ? 'Saving…' : 'Save'}
                        </button>
                        <button type="button" onClick={() => setRename(null)} className="font-dmsans text-[12px] font-normal text-eb-secondary">
                          Cancel
                        </button>
                      </span>
                    ) : isOwner ? (
                      <button
                        type="button"
                        onClick={() => setRename({ from: turn.speaker, value: turn.speaker })}
                        className="group inline-flex items-center gap-1"
                        style={{ color: colours.get(turn.speaker) }}
                        title="Rename this speaker everywhere"
                      >
                        {turn.speaker}
                        <Pencil size={11} strokeWidth={1.75} className="opacity-0 transition-opacity group-hover:opacity-60" />
                      </button>
                    ) : (
                      // Renaming rewrites the transcript for the owner too; an observer only reads.
                      <span style={{ color: colours.get(turn.speaker) }}>{turn.speaker}</span>
                    )}
                    <Ts seconds={turn.start} />
                    {internal && <Badge tone="neutral">Internal — not shared</Badge>}
                  </p>
                  <p className="m-0 font-dmsans text-[13.5px] leading-[1.65] text-eb-prose">
                    {highlight(turn.lines.join(' '), query.trim())}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
