import { useEffect, useState } from 'react';

/**
 * The on-page sections, in reading order, and which one is in view.
 *
 * Ids are stable anchors: the rail links to them, the mobile chip row scrolls
 * to them, and `useActiveSection` watches them so the rail highlights where
 * the reader is without any scroll maths of its own.
 */
export type SectionId =
  | 'summary'
  | 'highlights'
  | 'chapters'
  | 'decisions'
  | 'next-steps'
  | 'actions'
  | 'transcript';

export interface Section {
  id: SectionId;
  label: string;
  count?: number;
}

export function scrollToSection(id: SectionId): void {
  const target = document.getElementById(`s-${id}`);
  // The transcript has a phone block and a desktop column; `offsetParent` is
  // null for whichever one the current width hides.
  const visible = target && target.offsetParent !== null ? target : document.getElementById(`s-${id}-desktop`);
  visible?.scrollIntoView({ block: 'start', behavior: 'smooth' });
}

export function useActiveSection(ids: SectionId[]): SectionId | null {
  const [active, setActive] = useState<SectionId | null>(ids[0] ?? null);
  useEffect(() => {
    const elements = ids
      .map((id) => document.getElementById(`s-${id}`))
      .filter((el): el is HTMLElement => !!el);
    if (elements.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        // The topmost section that is at least partly in the reading band wins.
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id.replace(/^s-/, '') as SectionId);
      },
      // The band is the top 40% of the viewport, below the sticky header.
      { rootMargin: '-64px 0px -60% 0px', threshold: 0 },
    );
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [ids.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps
  return active;
}
