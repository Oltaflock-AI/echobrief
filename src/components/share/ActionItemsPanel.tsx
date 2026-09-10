import { CalendarClock, CheckCircle2, UserRound } from 'lucide-react';
import { Card, CardHeader } from '@/ui';
import { actionDue, actionOwner, actionTask, type ActionItem } from './types';

/**
 * Every action item, with its owner and its date.
 *
 * Read-only on purpose: the checkbox belongs to the owner's dashboard, and a
 * link is handed to people who have no account and no claim on the meeting's
 * state. What a reader needs here is "is my name on one of these".
 */
export function ActionItemsPanel({ items }: { items: ActionItem[] }) {
  if (items.length === 0) {
    return (
      <Card className="text-center">
        <CheckCircle2 size={26} strokeWidth={1.5} className="mx-auto text-eb-muted" />
        <p className="mt-3 font-dmsans text-[13.5px] text-eb-prose">
          No action items came out of this meeting.
        </p>
      </Card>
    );
  }

  return (
    <Card padded={false}>
      <CardHeader title="Action items" count={items.length} />
      <ul className="flex list-none flex-col p-0">
        {items.map((item, i) => {
          const owner = actionOwner(item);
          const due = actionDue(item);
          return (
            <li
              key={i}
              className="flex items-start gap-3 border-b border-eb-divider px-[18px] py-[15px] last:border-0"
            >
              <span className="mt-[2px] flex h-[18px] w-[18px] flex-none items-center justify-center rounded-[6px] border border-eb-control-edge bg-white" />
              <div className="min-w-0 flex-1">
                <p className="m-0 font-dmsans text-[14px] leading-[1.5] text-eb-text">
                  {actionTask(item)}
                </p>
                {(owner || due) && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {owner && (
                      <span className="inline-flex items-center gap-1.5 rounded-pill bg-eb-chip px-2.5 py-[3px] font-dmsans text-[11.5px] text-eb-secondary">
                        <UserRound size={11} strokeWidth={1.75} />
                        {owner}
                      </span>
                    )}
                    {due && (
                      <span className="inline-flex items-center gap-1.5 rounded-pill bg-eb-accent-soft px-2.5 py-[3px] font-dmsans text-[11.5px] text-eb-accent-text">
                        <CalendarClock size={11} strokeWidth={1.75} />
                        {due}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
