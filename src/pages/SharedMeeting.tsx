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
    <section className="mb-2" style={{ borderTop: '1px solid var(--rule)' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center gap-2 border-none bg-transparent px-0 py-2 text-left"
      >
        {icon}
        <span className="text-[15px] font-semibold" style={{ color: 'var(--ink)' }}>{title}</span>
        {meta && (
          <span className="text-[12.5px]" style={{ color: 'var(--ink-soft)' }}>{meta}</span>
        )}
        <ChevronDown
          className="ml-auto h-[16px] w-[16px] transition-transform"
          style={{ color: 'var(--ink-soft)', transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }}
        />
      </button>
      {open && <div className="pt-2">{children}</div>}
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
    <div className="min-h-screen" style={{ background: 'var(--paper)' }}>
      <header
        className="sticky top-0 z-10 backdrop-blur"
        style={{ borderBottom: '1px solid var(--rule)', background: 'color-mix(in oklch, var(--paper) 85%, transparent)' }}
      >
        <div className="mx-auto flex max-w-[820px] items-center justify-between gap-4 px-6 py-3">
          <Logo size="sm" linkTo="/" />
          <Link
            to="/"
            className="text-[13px] font-medium no-underline"
            style={{ color: 'var(--ember)' }}
          >
            What is EchoBrief?
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-[820px] px-4 py-8 sm:px-6 sm:py-12">
        {loading ? (
          <div className="flex items-center gap-2 text-[14px]" style={{ color: 'var(--ink-mid)' }}>
            <Loader2 className="h-4 w-4 animate-spin" /> Loading meeting…
          </div>
        ) : error ? (
          <div
            className="rounded-2xl p-8 text-center"
            style={{ border: '1px solid var(--rule)', background: 'var(--paper-card)' }}
          >
            <h1 className="mb-2 text-[20px] font-semibold" style={{ color: 'var(--ink)' }}>
              This link is not available
            </h1>
            <p className="mb-6 text-[14px]" style={{ color: 'var(--ink-mid)' }}>{error}</p>
            <Link
              to="/"
              className="inline-block rounded-full px-5 py-2.5 text-[14px] font-semibold text-white no-underline"
              style={{ background: 'var(--ember)' }}
            >
              See what EchoBrief does
            </Link>
          </div>
        ) : data ? (
          <article>
            <p
              className="mb-3 text-[11.5px] font-semibold uppercase"
              style={{ color: 'var(--ember)', letterSpacing: '0.14em' }}
            >
              Shared meeting summary
            </p>
            <h1
              className="mb-4 text-[clamp(1.8rem,4vw,2.6rem)] leading-[1.1]"
              style={{ color: 'var(--ink)', fontFamily: 'var(--font-brand-serif)', fontWeight: 400 }}
            >
              {data.meeting.title}
            </h1>

            <div className="mb-10 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px]" style={{ color: 'var(--ink-soft)' }}>
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
              <Section title="Summary" icon={<FileText className="h-[15px] w-[15px]" style={{ color: 'var(--ember)' }} />}>
                <p className="whitespace-pre-line text-[15px] leading-[1.7]" style={{ color: 'var(--ink-mid)' }}>
                  {data.insights.summary_detailed || data.insights.summary_short}
                </p>
              </Section>
            )}

            {data.insights.decisions?.length > 0 && (
              <Section
                title="Decisions"
                icon={<GitBranch className="h-[15px] w-[15px]" style={{ color: 'var(--ember)' }} />}
                meta={String(data.insights.decisions.length)}
              >
                <ul className="space-y-3 p-0" style={{ listStyle: 'none' }}>
                  {data.insights.decisions.map((decision, i) => (
                    <li
                      key={i}
                      className="rounded-xl p-4 text-[14px] leading-[1.6]"
                      style={{ border: '1px solid var(--rule)', background: 'var(--paper-card)', color: 'var(--ink)' }}
                    >
                      {asText(decision.decision) || asText(decision.text)}
                      {decision.context && (
                        <span className="mt-1.5 block text-[13px]" style={{ color: 'var(--ink-soft)' }}>
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
                icon={<CheckCircle2 className="h-[15px] w-[15px]" style={{ color: 'var(--ember)' }} />}
                meta={String(data.insights.action_items.length)}
              >
                <ul className="space-y-3 p-0" style={{ listStyle: 'none' }}>
                  {data.insights.action_items.map((item, i) => {
                    const owner = asText(item.owner) || asText(item.assignee);
                    const due = asText(item.due_date) || asText(item.due);
                    return (
                      <li
                        key={i}
                        className="rounded-xl p-4"
                        style={{ border: '1px solid var(--rule)', background: 'var(--paper-card)' }}
                      >
                        <p className="m-0 text-[14px] leading-[1.6]" style={{ color: 'var(--ink)' }}>
                          {asText(item.task) || asText(item.title)}
                        </p>
                        {(owner || due) && (
                          <p className="m-0 mt-1.5 text-[12.5px]" style={{ color: 'var(--ink-soft)' }}>
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
                icon={<Video className="h-[15px] w-[15px]" style={{ color: 'var(--ember)' }} />}
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
                icon={<MessageSquare className="h-[15px] w-[15px]" style={{ color: 'var(--ember)' }} />}
                meta={`${data.transcript.length} line${data.transcript.length === 1 ? '' : 's'}`}
                defaultOpen={false}
              >
                <div
                  className="max-h-[70dvh] overflow-y-auto rounded-xl p-5"
                  style={{ border: '1px solid var(--rule)', background: 'var(--paper-card)' }}
                >
                  {data.transcript.map((seg, i) => {
                    const sameSpeaker = i > 0 && data.transcript![i - 1].speaker === seg.speaker;
                    return (
                      <div key={i} className={sameSpeaker ? 'mt-1.5' : 'mt-5 first:mt-0'}>
                        {!sameSpeaker && (
                          <p className="m-0 mb-1 text-[12.5px] font-semibold" style={{ color: 'var(--ember-deep)' }}>
                            {seg.speaker}
                            {seg.start != null && (
                              <span className="ml-2 font-normal" style={{ color: 'var(--ink-soft)' }}>
                                {timestamp(seg.start)}
                              </span>
                            )}
                          </p>
                        )}
                        <p className="m-0 text-[14px] leading-[1.7]" style={{ color: 'var(--ink-mid)' }}>
                          {seg.text}
                        </p>
                      </div>
                    );
                  })}
                </div>
                <p className="mt-2 text-[12px]" style={{ color: 'var(--ink-soft)' }}>
                  Anything said before the meeting started or after it ended is left out.
                </p>
              </Section>
            )}

            <footer
              className="mt-14 rounded-2xl p-6 text-center"
              style={{ border: '1px solid var(--rule)', background: 'var(--paper-raised)' }}
            >
              <p className="mb-1 text-[15px] font-semibold" style={{ color: 'var(--ink)' }}>
                This summary was written by EchoBrief
              </p>
              <p className="mb-5 text-[13.5px]" style={{ color: 'var(--ink-mid)' }}>
                Meeting notes for teams who work in Hindi, English and everything in between —
                with a quote and a timestamp behind every claim.
              </p>
              <Link
                to="/"
                className="inline-block rounded-full px-5 py-2.5 text-[14px] font-semibold text-white no-underline"
                style={{ background: 'var(--ember)' }}
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
