import { ArrowRight, GitBranch, Sparkles, Video } from 'lucide-react';
import { Avatar, Card, CardHeader, Label, TwoColumn } from '@/ui';
import {
  actionDue,
  actionOwner,
  actionTask,
  decisionContext,
  decisionText,
  type SharedPayload,
} from './types';

/**
 * The tab a shared link opens on: what happened, what was decided, and a rail
 * with what a reader most often came to check — the action items, who spoke,
 * and whether there is a recording to watch.
 *
 * The rail is a preview that hands off to the full tab rather than a second
 * copy of it; two renderings of the same list is how the V1 page ended up
 * scrolling for a page and a half before the summary.
 */
export function SummaryPanel({
  insights,
  speakers,
  hasRecording,
  onOpenTab,
}: {
  insights: SharedPayload['insights'];
  speakers: string[];
  hasRecording: boolean;
  onOpenTab: (tab: string) => void;
}) {
  const decisions = (insights.decisions ?? []).filter((d) => decisionText(d));
  const keyPoints = (insights.key_points ?? []).filter(Boolean);
  const actions = insights.action_items ?? [];
  const lead = insights.summary_short || insights.summary_detailed;
  const body = insights.summary_short ? insights.summary_detailed : null;

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
            {body && (
              <p className="mt-3.5 whitespace-pre-line border-t border-eb-divider pt-3.5 font-dmsans text-[14px] leading-[1.7] text-eb-prose">
                {body}
              </p>
            )}

            {decisions.length > 0 && (
              <div className="mt-5 border-t border-eb-divider pt-4">
                <Label className="flex items-center gap-1.5">
                  <GitBranch size={12} strokeWidth={1.75} /> Decisions
                </Label>
                <ul className="mt-2.5 flex list-none flex-col gap-2 p-0">
                  {decisions.map((decision, i) => {
                    const context = decisionContext(decision);
                    return (
                      <li key={i} className="flex gap-2.5 font-dmsans text-[13.5px] leading-[1.55]">
                        <span className="mt-[7px] h-1.5 w-1.5 flex-none rounded-full bg-eb-accent" />
                        <span className="text-eb-prose">
                          {decisionText(decision)}
                          {context && (
                            <span className="mt-0.5 block text-[12.5px] text-eb-secondary">
                              {context}
                            </span>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </Card>
        )}

        {keyPoints.length > 0 && (
          <Card padded={false}>
            <CardHeader title="Key points" count={keyPoints.length} />
            <ul className="flex list-none flex-col p-0">
              {keyPoints.map((point, i) => (
                <li
                  key={i}
                  className="flex gap-2.5 border-b border-eb-divider px-[18px] py-3 font-dmsans text-[13.5px] leading-[1.55] text-eb-prose last:border-0"
                >
                  <Sparkles size={13} strokeWidth={1.75} className="mt-[3px] flex-none text-eb-accent" />
                  {point}
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </TwoColumn>
  );
}
