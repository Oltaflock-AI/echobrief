import { CircleAlert, GitBranch, Hash, MessageSquareQuote } from 'lucide-react';
import { Card, CardHeader } from '@/ui';
import { Ts } from './jump';
import type { NoteKind, TopicSection } from './notes';

/**
 * The notes, chapter by chapter: each topic the extraction pass named, when it
 * opened, its one-line note, and every number, ask, pain point and decision
 * said while it was open — each with a timestamp that jumps into the call.
 *
 * This is the reader's map of the meeting. The prose summary still exists
 * (behind "Read full summary"), but a reader scanning for "what did they say
 * about pricing" wants the chapter, not the paragraph that mentions it.
 */

const KIND: Record<NoteKind, { label: string; icon: React.ReactNode }> = {
  number: { label: 'Number', icon: <Hash size={12} strokeWidth={1.75} /> },
  pain: { label: 'Pain point', icon: <CircleAlert size={12} strokeWidth={1.75} /> },
  ask: { label: 'Ask', icon: <MessageSquareQuote size={12} strokeWidth={1.75} /> },
  decision: { label: 'Decision', icon: <GitBranch size={12} strokeWidth={1.75} /> },
};

export function NotesPanel({ sections }: { sections: TopicSection[] }) {
  if (sections.length === 0) return null;
  return (
    <Card padded={false}>
      <CardHeader title="Notes" count={sections.length} />
      <div className="flex flex-col">
        {sections.map((section, i) => (
          <section
            key={`${section.ts}-${i}`}
            className="border-b border-eb-divider px-[18px] py-4 last:border-0"
          >
            <div className="flex items-baseline gap-2.5">
              <h3 className="m-0 font-outfit text-[14.5px] font-semibold leading-snug text-eb-text">
                {section.topic}
              </h3>
              <Ts seconds={section.ts} />
            </div>
            {section.notes && (
              <p className="mb-0 mt-1.5 font-dmsans text-[13.5px] leading-[1.6] text-eb-prose">
                {section.notes}
              </p>
            )}
            {section.items.length > 0 && (
              <ul className="mb-0 mt-3 flex list-none flex-col gap-2 p-0">
                {section.items.map((item, j) => (
                  <li key={j} className="flex items-baseline gap-2.5 font-dmsans text-[13.5px] leading-[1.55]">
                    <span
                      className="inline-flex flex-none items-center gap-1 self-center text-eb-muted"
                      title={KIND[item.kind].label}
                      aria-label={KIND[item.kind].label}
                    >
                      {KIND[item.kind].icon}
                    </span>
                    <span className="flex-1 text-eb-prose">{item.text}</span>
                    <Ts seconds={item.ts} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </Card>
  );
}
