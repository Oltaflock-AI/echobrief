import { CalendarDays, Clock, Languages, Users } from 'lucide-react';
import { formatIST } from '@/lib/time';
import { languageMix, type SharedPayload } from './types';

/**
 * The identity block: what meeting this is, when it happened, how long it ran,
 * who was in it and which languages were spoken.
 *
 * The facts sit in one wrapping row of pills rather than a stat grid — a shared
 * link is read on a phone as often as a laptop, and four tiles at 390px become
 * a column of near-empty boxes above the summary the link was sent for.
 */
export function MeetingHero({
  meeting,
  speakers,
}: {
  meeting: SharedPayload['meeting'];
  speakers: string[];
}) {
  const minutes = meeting.duration_seconds ? Math.round(meeting.duration_seconds / 60) : null;
  const languages = languageMix(meeting.languages);

  const facts: Array<{ icon: React.ReactNode; label: string }> = [];
  if (meeting.start_time) {
    facts.push({
      icon: <CalendarDays size={13} strokeWidth={1.75} />,
      label: formatIST(new Date(meeting.start_time), 'd MMM yyyy, h:mm a'),
    });
  }
  if (minutes !== null) {
    facts.push({
      icon: <Clock size={13} strokeWidth={1.75} />,
      label: minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes} min`,
    });
  }
  if (speakers.length > 0) {
    facts.push({
      icon: <Users size={13} strokeWidth={1.75} />,
      label: `${speakers.length} speaker${speakers.length === 1 ? '' : 's'}`,
    });
  }
  if (languages.length > 0) {
    facts.push({ icon: <Languages size={13} strokeWidth={1.75} />, label: languages.join(' · ') });
  }

  return (
    <div>
      <p className="font-dmsans text-[11px] font-semibold uppercase tracking-[.14em] text-eb-accent-text">
        Shared meeting
      </p>
      <h1 className="mt-2.5 font-outfit text-[clamp(1.55rem,3.6vw,2.15rem)] font-semibold leading-[1.15] tracking-[-.02em] text-eb-text">
        {meeting.title}
      </h1>
      {facts.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          {facts.map((fact) => (
            <span
              key={fact.label}
              className="inline-flex items-center gap-1.5 rounded-pill border border-eb-border bg-eb-card px-2.5 py-1 font-dmsans text-[12.5px] text-eb-secondary shadow-eb-card"
            >
              <span className="text-eb-muted">{fact.icon}</span>
              {fact.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
