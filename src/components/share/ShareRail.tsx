import { Avatar } from '@/ui';
import { Ts } from './jump';
import type { Chapter } from './notes';
import { scrollToSection, useActiveSection, type Section } from './sections';

/**
 * The left rail: where you are on the page, where you are in the call.
 *
 * The chapter list doubles as a scrubber — each row is the topic and the
 * second it opened, and the timestamp jumps into the recording or transcript.
 * That is the one thing a reader should remember about this page: the call
 * has a table of contents, and it is clickable.
 */
export function ShareRail({
  sections,
  chapters,
  speakers,
}: {
  sections: Section[];
  chapters: Chapter[];
  speakers: string[];
}) {
  const active = useActiveSection(sections.map((s) => s.id));

  return (
    <nav aria-label="On this page" className="flex flex-col gap-7">
      <div>
        <p className="mb-2 font-dmsans text-[11px] font-semibold uppercase tracking-[.14em] text-eb-muted">
          On this page
        </p>
        <ul className="m-0 flex list-none flex-col p-0">
          {sections.map((section) => {
            const isActive = active === section.id;
            return (
              <li key={section.id}>
                <button
                  type="button"
                  onClick={() => scrollToSection(section.id)}
                  aria-current={isActive ? 'location' : undefined}
                  className={`flex w-full items-center justify-between rounded-[7px] px-2.5 py-[7px] text-left font-dmsans text-[13px] transition-colors ${
                    isActive
                      ? 'bg-eb-accent-soft font-medium text-eb-accent-text'
                      : 'text-eb-secondary hover:bg-eb-row-hover hover:text-eb-text'
                  }`}
                >
                  {section.label}
                  {section.count != null && (
                    <span className="font-mono text-[11px] text-eb-muted">{section.count}</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {chapters.length > 0 && (
        <div>
          <p className="mb-2 font-dmsans text-[11px] font-semibold uppercase tracking-[.14em] text-eb-muted">
            Chapters
          </p>
          <ol className="m-0 flex list-none flex-col p-0">
            {chapters.map((chapter, i) => (
              <li
                key={`${chapter.ts}-${i}`}
                className="grid grid-cols-[auto_1fr] items-baseline gap-x-2 border-l-2 border-eb-border py-[5px] pl-2.5"
              >
                <Ts seconds={chapter.ts} />
                <span className="font-dmsans text-[12.5px] leading-[1.4] text-eb-prose">
                  {chapter.topic}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {speakers.length > 0 && (
        <div>
          <p className="mb-2 font-dmsans text-[11px] font-semibold uppercase tracking-[.14em] text-eb-muted">
            In the room
          </p>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {speakers.map((name) => (
              <li key={name} className="flex items-center gap-2">
                <Avatar name={name} size={22} round />
                <span className="font-dmsans text-[12.5px] text-eb-text">{name}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </nav>
  );
}
