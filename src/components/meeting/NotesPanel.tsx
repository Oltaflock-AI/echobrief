import { Card, CardHeader } from '@/ui';
import { Ts } from './jump';
import type { Chapter, Highlight } from './notes';

/**
 * What a reader scans first: the highlights, then the chapters.
 *
 * Highlights are the synthesised key points — whole sentences, one line each,
 * with a timestamp when a number in the sentence can be traced to the moment
 * it was said. Chapters are an outline of the call in time order: when each
 * topic opened and a one-line note on it. Neither shows raw extraction rows;
 * a `metric: value` fragment is data for the summary, not a note for a person.
 */
export function HighlightsPanel({ highlights }: { highlights: Highlight[] }) {
  if (highlights.length === 0) return null;
  return (
    <Card padded={false}>
      <CardHeader title="Highlights" count={highlights.length} />
      <ul className="flex list-none flex-col p-0">
        {highlights.map((item, i) => (
          <li
            key={i}
            className="flex items-baseline gap-3 border-b border-eb-divider px-[18px] py-3 font-dmsans text-[14px] leading-[1.6] text-eb-text last:border-0"
          >
            <span className="mt-[9px] h-1.5 w-1.5 flex-none self-start rounded-full bg-eb-accent" />
            <span className="flex-1">{item.text}</span>
            <Ts seconds={item.ts} />
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function ChaptersPanel({ chapters }: { chapters: Chapter[] }) {
  if (chapters.length === 0) return null;
  return (
    <Card padded={false}>
      <CardHeader title="Chapters" count={chapters.length} />
      <ol className="flex list-none flex-col p-0">
        {chapters.map((chapter, i) => (
          <li
            key={`${chapter.ts}-${i}`}
            className="grid grid-cols-[auto_1fr] items-baseline gap-x-3 border-b border-eb-divider px-[18px] py-3 last:border-0"
          >
            <Ts seconds={chapter.ts} className="min-w-[46px] justify-center" />
            <div className="min-w-0">
              <p className="m-0 font-dmsans text-[14px] font-medium leading-[1.5] text-eb-text">
                {chapter.topic}
              </p>
              {chapter.notes && (
                <p className="m-0 mt-0.5 font-dmsans text-[13px] leading-[1.55] text-eb-secondary">
                  {chapter.notes}
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}
