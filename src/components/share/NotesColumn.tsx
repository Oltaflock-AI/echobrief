import { ChevronDown, GitBranch, ListChecks } from 'lucide-react';
import { Card, CardHeader } from '@/ui';
import { Ts } from '@/components/meeting/jump';
import type { Chapter, Highlight } from '@/components/meeting/notes';
import {
  ChaptersPanel,
  HighlightsPanel,
} from '@/components/meeting/NotesPanel';
import { ActionItemsPanel } from './ActionItemsPanel';
import {
  decisionContext,
  decisionText,
  followUpOwner,
  followUpText,
  type SharedPayload,
} from './types';

/**
 * The reading column, top to bottom: the summary paragraph, the highlights,
 * (below the rail breakpoint) the chapters, what was decided, what happens next, the action
 * items, and the long prose folded away at the end.
 *
 * Every block has a stable `s-<id>` anchor for the rail and the chip row.
 * Nothing here is a tab: a reader scrolls, and the rail says where they are.
 */
export function NotesColumn({
  insights,
  facts,
  chapters,
  highlights,
}: {
  insights: SharedPayload['insights'];
  facts: SharedPayload['facts'];
  chapters: Chapter[];
  highlights: Highlight[];
}) {
  const decisions = (insights.decisions ?? []).filter((d) => decisionText(d));
  const followUps = (insights.follow_ups ?? []).filter((f) => followUpText(f));
  const actions = insights.action_items ?? [];
  const lead = insights.summary_short || insights.summary_detailed;
  const body = insights.summary_short ? insights.summary_detailed : null;
  const hasChapters = chapters.length > 0;

  const decisionTs = (text: string): number | null => {
    const needle = text.trim().toLowerCase();
    const hit = (facts?.decisions ?? []).find(
      (d) => d.decision.trim().toLowerCase() === needle,
    );
    return hit ? hit.ts : null;
  };

  return (
    <div className="flex flex-col gap-4">
      {lead && (
        <div id="s-summary" className="scroll-mt-20">
          <Card>
            <h2 className="font-outfit text-[15px] font-semibold text-eb-text">
              Summary
            </h2>
            <p className="mt-2.5 whitespace-pre-line font-dmsans text-[15px] leading-[1.65] text-eb-text">
              {lead}
            </p>
            {body && !hasChapters && (
              <p className="mt-3.5 whitespace-pre-line border-t border-eb-divider pt-3.5 font-dmsans text-[14px] leading-[1.7] text-eb-prose">
                {body}
              </p>
            )}
          </Card>
        </div>
      )}

      <div id="s-highlights" className="scroll-mt-20">
        <HighlightsPanel highlights={highlights} />
      </div>

      {/* Below the rail breakpoint the chapters live here; above it, in the rail. */}
      <div id="s-chapters" className="scroll-mt-20 xl:hidden">
        <ChaptersPanel chapters={chapters} />
      </div>

      {decisions.length > 0 && (
        <div id="s-decisions" className="scroll-mt-20">
          <Card padded={false}>
            <CardHeader title="Decisions" count={decisions.length} />
            <ul className="flex list-none flex-col p-0">
              {decisions.map((decision, i) => {
                const text = decisionText(decision);
                const context = decisionContext(decision);
                return (
                  <li
                    key={i}
                    className="flex gap-2.5 border-b border-eb-divider px-[18px] py-3 font-dmsans text-[14px] leading-[1.55] last:border-0"
                  >
                    <GitBranch
                      size={13}
                      strokeWidth={1.75}
                      className="mt-[4px] flex-none text-eb-accent"
                    />
                    <span className="flex-1 text-eb-text">
                      {text}
                      {context && (
                        <span className="mt-0.5 block text-[12.5px] text-eb-secondary">
                          {context}
                        </span>
                      )}
                    </span>
                    <Ts seconds={decisionTs(text)} />
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>
      )}

      {followUps.length > 0 && (
        <div id="s-next-steps" className="scroll-mt-20">
          <Card padded={false}>
            <CardHeader title="Next steps" count={followUps.length} />
            <ul className="flex list-none flex-col p-0">
              {followUps.map((item, i) => {
                const owner = followUpOwner(item);
                return (
                  <li
                    key={i}
                    className="flex gap-2.5 border-b border-eb-divider px-[18px] py-3 font-dmsans text-[14px] leading-[1.55] text-eb-text last:border-0"
                  >
                    <ListChecks
                      size={13}
                      strokeWidth={1.75}
                      className="mt-[4px] flex-none text-eb-accent"
                    />
                    <span className="flex-1">
                      {followUpText(item)}
                      {owner && (
                        <span className="text-eb-secondary"> — {owner}</span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>
      )}

      {actions.length > 0 && (
        <div id="s-actions" className="scroll-mt-20">
          <ActionItemsPanel items={actions} />
        </div>
      )}

      {body && hasChapters && (
        <details className="group rounded-card border border-eb-border bg-eb-card shadow-eb-card">
          <summary className="flex cursor-pointer list-none items-center justify-between px-[18px] py-3.5 font-outfit text-[14px] font-semibold text-eb-text [&::-webkit-details-marker]:hidden">
            Read full summary
            <ChevronDown
              size={15}
              strokeWidth={1.75}
              className="text-eb-muted transition-transform group-open:rotate-180"
            />
          </summary>
          <p className="m-0 whitespace-pre-line border-t border-eb-divider px-[18px] py-4 font-dmsans text-[14px] leading-[1.7] text-eb-prose">
            {body}
          </p>
        </details>
      )}
    </div>
  );
}
