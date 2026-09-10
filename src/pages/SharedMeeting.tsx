import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CalendarDays, CheckCircle2, ChevronDown, Clock, FileText, GitBranch, Loader2, MessageSquare, Video } from 'lucide-react';
import { Logo } from '@/components/ui/Logo';
import { RecordingPlayer } from '@/components/meeting/RecordingPlayer';
import { formatIST } from '@/lib/time';

/**
 * A shared meeting, read by somebody who may have no account.
 *
 * Deliberately not wrapped in AppShell: this page is a public surface
 * and the most common way a stranger meets the product, so it carries the brand
 * and a way in, not the app chrome. It renders exactly what
 * `get-shared-meeting` returns and asks for nothing the payload has not already
 * offered: the summary, decisions and action items always; the transcript and
 * the recording only when the link that was sent carries them. The transcript
 * arrives already filtered to the meeting zone — the page has no way to widen
 * what it was given, which is where that guarantee belongs.
 *
 * It is drawn in the **Console** palette, not Warm Dispatch: what a reader sees
 * here is meeting content, the same content the app shows, and a link that
 * looked like a different product from the dashboard it was sent from was the
 * last V1 surface left after the 2026-09-09 migration. The `bg-eb-bg` class on
 * the root is load-bearing — it is what `:root:has(.bg-eb-bg)` in index.css
 * keys the light-lock off (see the note there). The header and footer still
 * point at the Warm Dispatch landing page; that surface migrates separately.
 */

interface ActionItem {
  task?: string;
  title?: string;
  owner?: string;
  assignee?: string;
  due_date?: string;
  due?: string;
}

interface Decision {
  decision?: string;
  text?: string;
  context?: string;
}

interface TranscriptSegment {
  speaker: string;
  text: string;
  start: number | null;
}

interface SharedPayload {
  meeting: {
    title: string;
    start_time: string | null;
    duration_seconds: number | null;
    languages: Record<string, number> | null;
  };
  insights: {
    summary_short: string | null;
    summary_detailed: string | null;
    key_points: string[];
    action_items: ActionItem[];
    decisions: Decision[];
  };
  /** Null when this link does not carry the transcript. */
  transcript: TranscriptSegment[] | null;
  has_recording: boolean;
}

function timestamp(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds)) return '';
  const total = Math.max(0, Math.round(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * One collapsible block of the shared page.
 *
 * Everything is foldable rather than only the transcript, so the page has one
 * behaviour instead of two — and so a reader who was sent the link for the
 * action items can fold the rest away. The transcript is the section that
 * arrives closed: a real meeting is hundreds of lines, and leaving it open
 * buries the summary the link was mostly sent for.
 */
function Section({
  title,
  icon,
  meta,
  defaultOpen = true,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  /** Small count or hint shown beside the title, e.g. "142 lines". */
  meta?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="mb-2 border-t border-eb-divider">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center gap-2 border-none bg-transparent px-0 py-3 text-left"
      >
        {icon}
        <span className="font-outfit text-[15px] font-semibold text-eb-text">{title}</span>
        {meta && <span className="font-dmsans text-[12.5px] text-eb-secondary">{meta}</span>}
        <ChevronDown
          className="ml-auto h-4 w-4 text-eb-muted transition-transform"
          style={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }}
        />
      </button>
      {open && <div className="pb-1 pt-1">{children}</div>}
    </section>
  );
}

const FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-shared-meeting`;

function asText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export default function SharedMeeting() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<SharedPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`${FUNCTIONS_URL}?token=${encodeURIComponent(token ?? '')}`, {
          headers: {
            // The anon key is a public value; the share token is what actually
            // authorises this read.
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
        });
        const body = await response.json();
        if (cancelled) return;
        if (!response.ok) {
          setError(body?.error || 'This link is not valid.');
        } else {
          setData(body);
        }
      } catch {
        if (!cancelled) setError('Could not load this meeting. Check your connection and try again.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const durationMinutes = data?.meeting.duration_seconds
    ? Math.round(data.meeting.duration_seconds / 60)
    : null;

  return (
    <div className="min-h-screen bg-eb-bg font-dmsans text-eb-text">
      <header className="sticky top-0 z-10 border-b border-eb-border bg-eb-bg">
        <div className="mx-auto flex max-w-[820px] items-center justify-between gap-4 px-6 py-3">
          <Logo size="sm" linkTo="/" variant="console" />
          <Link to="/" className="text-[13px] font-medium text-eb-accent-text no-underline hover:text-eb-accent">
            What is EchoBrief?
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-[820px] px-4 py-8 sm:px-6 sm:py-12">
        {loading ? (
          <div className="flex items-center gap-2 text-[14px] text-eb-prose">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading meeting…
          </div>
        ) : error ? (
          <div className="rounded-card border border-eb-border bg-eb-card p-8 text-center shadow-eb-card">
            <h1 className="mb-2 font-outfit text-[20px] font-semibold text-eb-text">
              This link is not available
            </h1>
            <p className="mb-6 text-[14px] text-eb-prose">{error}</p>
            <Link
              to="/"
              className="inline-block rounded-pill bg-gradient-to-b from-eb-accent-top to-eb-accent px-5 py-2.5 text-[14px] font-medium text-white no-underline shadow-eb-primary"
            >
              See what EchoBrief does
            </Link>
          </div>
        ) : data ? (
          <article>
            <p className="mb-3 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-eb-accent-text">
              Shared meeting summary
            </p>
            <h1 className="mb-4 font-outfit text-[clamp(1.7rem,4vw,2.4rem)] font-semibold leading-[1.15] tracking-[-0.02em] text-eb-text">
              {data.meeting.title}
            </h1>

            <div className="mb-10 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-eb-secondary">
              {data.meeting.start_time && (
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays className="h-[14px] w-[14px]" />
                  {formatIST(new Date(data.meeting.start_time), 'd MMM yyyy')}
                </span>
              )}
              {durationMinutes !== null && (
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="h-[14px] w-[14px]" />
                  {durationMinutes} min
                </span>
              )}
            </div>

            {(data.insights.summary_detailed || data.insights.summary_short) && (
              <Section title="Summary" icon={<FileText className="h-[15px] w-[15px] text-eb-accent" />}>
                <p className="whitespace-pre-line text-[15px] leading-[1.7] text-eb-prose">
                  {data.insights.summary_detailed || data.insights.summary_short}
                </p>
              </Section>
            )}

            {data.insights.decisions?.length > 0 && (
              <Section
                title="Decisions"
                icon={<GitBranch className="h-[15px] w-[15px] text-eb-accent" />}
                meta={String(data.insights.decisions.length)}
              >
                <ul className="list-none space-y-3 p-0">
                  {data.insights.decisions.map((decision, i) => (
                    <li
                      key={i}
                      className="rounded-card border border-eb-border bg-eb-card p-4 text-[14px] leading-[1.6] text-eb-text shadow-eb-card"
                    >
                      {asText(decision.decision) || asText(decision.text)}
                      {decision.context && (
                        <span className="mt-1.5 block text-[13px] text-eb-secondary">
                          {decision.context}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {data.insights.action_items?.length > 0 && (
              <Section
                title="Action items"
                icon={<CheckCircle2 className="h-[15px] w-[15px] text-eb-accent" />}
                meta={String(data.insights.action_items.length)}
              >
                <ul className="list-none space-y-3 p-0">
                  {data.insights.action_items.map((item, i) => {
                    const owner = asText(item.owner) || asText(item.assignee);
                    const due = asText(item.due_date) || asText(item.due);
                    return (
                      <li key={i} className="rounded-card border border-eb-border bg-eb-card p-4 shadow-eb-card">
                        <p className="m-0 text-[14px] leading-[1.6] text-eb-text">
                          {asText(item.task) || asText(item.title)}
                        </p>
                        {(owner || due) && (
                          <p className="m-0 mt-1.5 text-[12.5px] text-eb-secondary">
                            {owner}
                            {owner && due ? ' · ' : ''}
                            {due}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </Section>
            )}

            {data.has_recording && (
              <Section
                title="Recording"
                icon={<Video className="h-[15px] w-[15px] text-eb-accent" />}
                // Closed by default: opening it asks the edge function for a
                // signed URL and starts the browser fetching metadata, which a
                // reader who came for the summary never asked for.
                defaultOpen={false}
              >
                <RecordingPlayer meetingId="shared" shareToken={token} />
              </Section>
            )}

            {data.transcript && data.transcript.length > 0 && (
              <Section
                title="Transcript"
                icon={<MessageSquare className="h-[15px] w-[15px] text-eb-accent" />}
                meta={`${data.transcript.length} line${data.transcript.length === 1 ? '' : 's'}`}
                defaultOpen={false}
              >
                <div className="max-h-[70dvh] overflow-y-auto rounded-card border border-eb-border bg-eb-card p-5 shadow-eb-card">
                  {data.transcript.map((seg, i) => {
                    const sameSpeaker = i > 0 && data.transcript![i - 1].speaker === seg.speaker;
                    return (
                      <div key={i} className={sameSpeaker ? 'mt-1.5' : 'mt-5 first:mt-0'}>
                        {!sameSpeaker && (
                          <p className="m-0 mb-1 text-[12.5px] font-semibold text-eb-accent-text">
                            {seg.speaker}
                            {seg.start != null && (
                              <span className="ml-2 font-mono text-[11.5px] font-normal text-eb-muted">
                                {timestamp(seg.start)}
                              </span>
                            )}
                          </p>
                        )}
                        <p className="m-0 text-[14px] leading-[1.7] text-eb-prose">{seg.text}</p>
                      </div>
                    );
                  })}
                </div>
                <p className="mt-2 text-[12px] text-eb-secondary">
                  Anything said before the meeting started or after it ended is left out.
                </p>
              </Section>
            )}

            <footer className="mt-14 rounded-card border border-eb-border bg-eb-card-alt p-6 text-center">
              <p className="mb-1 font-outfit text-[15px] font-semibold text-eb-text">
                This summary was written by EchoBrief
              </p>
              <p className="mb-5 text-[13.5px] text-eb-prose">
                Meeting notes for teams who work in Hindi, English and everything in between —
                with a quote and a timestamp behind every claim.
              </p>
              <Link
                to="/"
                className="inline-block rounded-pill bg-gradient-to-b from-eb-accent-top to-eb-accent px-5 py-2.5 text-[14px] font-medium text-white no-underline shadow-eb-primary"
              >
                Try EchoBrief
              </Link>
            </footer>
          </article>
        ) : null}
      </main>
    </div>
  );
}
