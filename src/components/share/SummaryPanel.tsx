import { useMemo } from 'react';
import { ArrowRight, ChevronDown, GitBranch, ListChecks, Video } from 'lucide-react';
import { Avatar, Card, CardHeader, TwoColumn } from '@/ui';
import { Ts } from './jump';
import { chaptersOf, highlightsOf } from './notes';
import { ChaptersPanel, HighlightsPanel } from './NotesPanel';
import { AskPanel } from './AskPanel';
import {
  actionDue,
  actionOwner,
  actionTask,
  decisionContext,
  decisionText,
  followUpOwner,
  followUpText,
  type SharedPayload,
} from './types';

/**
 * The tab a shared link opens on, in the order a reader wants it: the summary
 * paragraph, the highlights (sentences, timestamped where a number in them can
 * be traced), the chapters (an outline of the call), what was decided, what
 * happens next — and a rail with the action items, who spoke, and the
 * recording. The long prose sits behind "Read full summary" when chapters
 * exist; meetings from before the facts pass have no chapters and keep the
 * prose open.
 *
 * The rail is a preview that hands off to the full tab rather than a second
 * copy of it; two renderings of the same list is how the V1 page ended up
 * scrolling for a page and a half before the summary.
 */
export function SummaryPanel({
  insights,
  facts,
  speakers,
  hasRecording,
  canAsk,
  token,
  onOpenTab,
}: {
  insights: SharedPayload['insights'];
  facts: SharedPayload['facts'];
  speakers: string[];
  hasRecording: boolean;
  canAsk: boolean;
  token: string;
  onOpenTab: (tab: 'actions' | 'recording') => void;
}) {
  const decisions = (insights.decisions ?? []).filter((d) => decisionText(d));
  const actions = insights.action_items ?? [];
  const followUps = (insights.follow_ups ?? []).filter((f) => followUpText(f));
  const chapters = useMemo(() => chaptersOf(facts), [facts]);
  const highlights = useMemo(() => highlightsOf(insights.key_points, facts), [insights.key_points, facts]);
  const hasNotes = chapters.length > 0;
  const lead = insights.summary_short || insights.summary_detailed;
  // With topic notes on the page the long prose is a second reading, folded
  // away; without them it is the only reading and stays open.
  const body = insights.summary_short ? insights.summary_detailed : null;
  const decisionTs = (text: string): number | null => {
    const needle = text.trim().toLowerCase();
    const hit = (facts?.decisions ?? []).find((d) => d.decision.trim().toLowerCase() === needle);
    return hit ? hit.ts : null;
  };

  return (
    <TwoColumn
      rail={
        <div className="flex flex-col gap-4">
          <Card padded={false}>
            <CardHeader title="Action items" count={actions.length || undefined} />
            {actions.length === 0 ? (
              <p className="px-[18px] py-4 font-dmsans text-[12.5px] text-eb-secondary">
                None came out of this meeting.
              </p>
            ) : (
              <div className="py-1">
                {actions.slice(0, 4).map((item, i) => {
                  const owner = actionOwner(item);
                  const due = actionDue(item);
                  return (
                    <div key={i} className="flex items-baseline gap-2.5 px-[18px] py-2">
                      <span className="mt-1.5 h-1.5 w-1.5 flex-none rounded-full bg-eb-accent" />
                      <span className="flex-1 font-dmsans text-[13px] leading-[1.45] text-eb-text">
                        {actionTask(item)}
                        {(owner || due) && (
                          <span className="text-eb-secondary">
                            {' — '}
                            {[owner, due].filter(Boolean).join(', ')}
                          </span>
                        )}
                      </span>
                      <Ts seconds={item.source_timestamp} />
                    </div>
                  );
                })}
                {actions.length > 4 && (
                  <button
                    type="button"
                    onClick={() => onOpenTab('actions')}
                    className="px-[18px] pb-3 pt-1 font-dmsans text-[12.5px] text-eb-accent hover:underline"
                  >
                    All {actions.length} action items →
                  </button>
                )}
              </div>
            )}
          </Card>

          {speakers.length > 0 && (
            <Card padded={false}>
              <CardHeader title="In the room" count={speakers.length} />
              <div className="flex flex-col gap-2.5 p-[18px] pt-3">
                {speakers.map((name) => (
                  <div key={name} className="flex items-center gap-2.5">
                    <Avatar name={name} size={28} round />
                    <span className="font-dmsans text-[13px] text-eb-text">{name}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {hasRecording && (
            <button
              type="button"
              onClick={() => onOpenTab('recording')}
              className="flex items-center gap-3 rounded-card border border-eb-border bg-eb-card p-4 text-left shadow-eb-card hover:bg-eb-row-hover"
            >
              <span className="inline-flex h-10 w-10 flex-none items-center justify-center rounded-tile bg-eb-sidebar text-eb-accent-sidebar">
                <Video size={17} strokeWidth={1.75} />
              </span>
              <span className="flex-1">
                <span className="block font-dmsans text-sm font-medium text-eb-text">Recording</span>
                <span className="block font-dmsans text-[12.5px] text-eb-secondary">
                  Watch the call
                </span>
              </span>
              <ArrowRight size={15} strokeWidth={1.75} className="flex-none text-eb-muted" />
            </button>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {lead && (
          <Card>
            <h2 className="font-outfit text-[15px] font-semibold text-eb-text">Summary</h2>
            <p className="mt-2.5 whitespace-pre-line font-dmsans text-[15px] leading-[1.65] text-eb-text">
              {lead}
            </p>
            {body && !hasNotes && (
              <p className="mt-3.5 whitespace-pre-line border-t border-eb-divider pt-3.5 font-dmsans text-[14px] leading-[1.7] text-eb-prose">
                {body}
              </p>
            )}
          </Card>
        )}

        <HighlightsPanel highlights={highlights} />

        <ChaptersPanel chapters={chapters} />

        {decisions.length > 0 && (
          <Card padded={false}>
            <CardHeader title="Decisions" count={decisions.length} />
            <ul className="flex list-none flex-col p-0">
              {decisions.map((decision, i) => {
                const text = decisionText(decision);
                const context = decisionContext(decision);
                return (
                  <li
                    key={i}
                    className="flex gap-2.5 border-b border-eb-divider px-[18px] py-3 font-dmsans text-[13.5px] leading-[1.55] last:border-0"
                  >
                    <GitBranch size={13} strokeWidth={1.75} className="mt-[3px] flex-none text-eb-accent" />
                    <span className="flex-1 text-eb-prose">
                      {text}
                      {context && (
                        <span className="mt-0.5 block text-[12.5px] text-eb-secondary">{context}</span>
                      )}
                    </span>
                    <Ts seconds={decisionTs(text)} />
                  </li>
                );
              })}
            </ul>
          </Card>
        )}

        {followUps.length > 0 && (
          <Card padded={false}>
            <CardHeader title="Next steps" count={followUps.length} />
            <ul className="flex list-none flex-col p-0">
              {followUps.map((item, i) => {
                const owner = followUpOwner(item);
                return (
                  <li
                    key={i}
                    className="flex gap-2.5 border-b border-eb-divider px-[18px] py-3 font-dmsans text-[13.5px] leading-[1.55] text-eb-prose last:border-0"
                  >
                    <ListChecks size={13} strokeWidth={1.75} className="mt-[3px] flex-none text-eb-accent" />
                    <span className="flex-1">
                      {followUpText(item)}
                      {owner && <span className="text-eb-secondary"> — {owner}</span>}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}

        {body && hasNotes && (
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

        {canAsk && <AskPanel token={token} />}
      </div>
    </TwoColumn>
  );
}
