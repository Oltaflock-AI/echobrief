import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ChipGroup } from '@/ui';
import { RecordingPlayer } from '@/components/meeting/RecordingPlayer';
import {
  PrivacyNote,
  ShareError,
  ShareFooter,
  ShareHeader,
  ShareSkeleton,
} from '@/components/share/ShareChrome';
import { MeetingHero } from '@/components/share/MeetingHero';
import { NotesColumn } from '@/components/share/NotesColumn';
import { TranscriptPanel } from '@/components/share/TranscriptPanel';
import { AskPanel } from '@/components/share/AskPanel';
import { ShareRail } from '@/components/share/ShareRail';
import { JumpProvider, useJump } from '@/components/meeting/jump';
import { chaptersOf, highlightsOf } from '@/components/meeting/notes';
import { scrollToSection, type Section, type SectionId } from '@/components/meeting/sections';
import { decisionText, followUpText, speakersOf, type SharedPayload } from '@/components/share/types';

/**
 * A shared meeting, read by somebody who may have no account.
 *
 * Deliberately not wrapped in AppShell: this page is a public surface and the
 * most common way a stranger meets the product, so it carries the brand and a
 * way in, not the app chrome. It renders exactly what `get-shared-meeting`
 * returns and asks for nothing the payload has not already offered: the
 * summary, highlights, chapters, decisions, next steps and action items
 * always; the transcript and the recording only when the link carries them.
 *
 * It is a reading desk, not a tabbed app: on a laptop the whole width is used
 * — a rail on the left (where you are on the page, the chapters as a
 * clickable table of contents, who was in the room), the notes in the middle
 * on one scroll, and the transcript on the right, sticky, full height, with
 * the "ask this meeting" box docked under it. On a phone the same blocks
 * stack, with a chip row that scrolls to each. Every timestamp on the page
 * seeks the player and scrolls the transcript at once (`JumpProvider`).
 *
 * The `bg-eb-bg` class on the root is load-bearing: it is what
 * `:root:has(.bg-eb-bg)` in index.css keys the light-lock off (see the note
 * there).
 */

const FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-shared-meeting`;

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

  useEffect(() => {
    if (!data?.meeting?.title) return;
    const previous = document.title;
    document.title = `${data.meeting.title} — EchoBrief`;
    return () => {
      document.title = previous;
    };
  }, [data?.meeting?.title]);

  const transcript = data?.transcript ?? null;

  return (
    <div className="min-h-screen bg-eb-bg font-dmsans text-eb-text" data-clarity-mask="true">
      <ShareHeader title={data?.meeting?.title} />

      {loading ? (
        <main className="mx-auto max-w-[1080px] px-4 py-8 sm:px-6 sm:py-10">
          <ShareSkeleton />
        </main>
      ) : error ? (
        <main className="mx-auto max-w-[1080px] px-4 py-8 sm:px-6 sm:py-10">
          <ShareError message={error} />
        </main>
      ) : data ? (
        <JumpProvider
          hasRecording={data.has_recording}
          hasTranscript={!!transcript && transcript.length > 0}
        >
          <SharedMeetingBody data={data} token={token ?? ''} />
        </JumpProvider>
      ) : null}
    </div>
  );
}

/**
 * The sticky columns: they start under the header plus the page's top padding
 * (57 + 28 px) and end one padding above the viewport bottom, so the docked
 * "ask" box is never cut off.
 */
const STICKY_COLUMN = 'sticky top-[85px] lg:h-[calc(100dvh-113px)]';

function SharedMeetingBody({ data, token }: { data: SharedPayload; token: string }) {
  const { seekSeconds, seekNonce } = useJump();
  const transcript = data.transcript ?? null;
  const hasTranscript = !!transcript && transcript.length > 0;
  const speakers = useMemo(() => speakersOf(transcript), [transcript]);
  const chapters = useMemo(() => chaptersOf(data.facts), [data.facts]);
  const highlights = useMemo(
    () => highlightsOf(data.insights?.key_points, data.facts),
    [data.insights?.key_points, data.facts],
  );
  const actionItems = data.insights?.action_items ?? [];
  const decisions = (data.insights?.decisions ?? []).filter((d) => decisionText(d));
  const followUps = (data.insights?.follow_ups ?? []).filter((f) => followUpText(f));
  const canAsk = Boolean(data.viewer_can_ask);

  // Only sections that exist on this page — a summary-only link does not
  // offer a "Transcript" entry that scrolls nowhere.
  const sections = useMemo(() => {
    const list: Section[] = [{ id: 'summary', label: 'Summary' }];
    if (highlights.length) list.push({ id: 'highlights', label: 'Highlights', count: highlights.length });
    if (chapters.length) list.push({ id: 'chapters', label: 'Chapters', count: chapters.length });
    if (decisions.length) list.push({ id: 'decisions', label: 'Decisions', count: decisions.length });
    if (followUps.length) list.push({ id: 'next-steps', label: 'Next steps', count: followUps.length });
    if (actionItems.length) list.push({ id: 'actions', label: 'Action items', count: actionItems.length });
    if (hasTranscript) list.push({ id: 'transcript', label: 'Transcript' });
    return list;
  }, [highlights.length, chapters.length, decisions.length, followUps.length, actionItems.length, hasTranscript]);

  // The rail lists chapters itself, and the transcript is beside the notes on
  // any screen wide enough to have a rail — neither needs a "jump to" entry.
  const railSections = sections.filter((s) => s.id !== 'chapters' && s.id !== 'transcript');

  // A seek from the notes brings the player back into view — it sits at the
  // top of the column and the reader may be a screen below it.
  useEffect(() => {
    if (seekSeconds == null) return;
    document.getElementById('share-player')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [seekSeconds, seekNonce]);

  return (
    <main className="mx-auto max-w-[1760px] px-4 py-6 sm:px-6 lg:py-7">
      <div
        className={
          hasTranscript
            ? 'grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(360px,38%)] lg:items-start xl:grid-cols-[224px_minmax(0,1fr)_minmax(400px,36%)]'
            : 'grid gap-6 lg:items-start xl:grid-cols-[224px_minmax(0,1fr)]'
        }
      >
        {/* Left rail — desktop only */}
        <aside className={`hidden xl:block ${STICKY_COLUMN} overflow-y-auto pr-1 pt-1`}>
          <ShareRail sections={railSections} chapters={chapters} speakers={speakers} />
        </aside>

        {/* Middle — the notes */}
        <div className="min-w-0">
          <MeetingHero meeting={data.meeting} speakers={speakers} />

          {/* Phones and laptops without the rail: a chip row that scrolls to a section */}
          <div className="scroll-x sticky top-[57px] z-10 -mx-4 mt-5 bg-eb-bg px-4 py-2 sm:-mx-6 sm:px-6 xl:hidden">
            <ChipGroup
              ariaLabel="Jump to section"
              value=""
              onChange={(value) => scrollToSection(value as SectionId)}
              options={sections.map((s) => ({
                value: s.id,
                label: s.count != null ? `${s.label} (${s.count})` : s.label,
              }))}
              className="flex-nowrap"
            />
          </div>

          {data.has_recording && (
            <div id="share-player" className="mt-5 scroll-mt-16 overflow-hidden rounded-card">
              <RecordingPlayer
                meetingId="shared"
                shareToken={token}
                seekSeconds={seekSeconds}
                seekNonce={seekNonce}
              />
            </div>
          )}

          <div className="mt-5">
            <NotesColumn
              insights={data.insights}
              facts={data.facts ?? null}
              chapters={chapters}
              highlights={highlights}
            />
          </div>

          {/* Phones: transcript + ask below the notes */}
          {hasTranscript && (
            <div id="s-transcript" className="mt-4 flex scroll-mt-20 flex-col gap-4 lg:hidden">
              <TranscriptPanel segments={transcript!} speakers={speakers} />
              {canAsk && <AskPanel token={token} />}
            </div>
          )}

          <PrivacyNote hasTranscript={hasTranscript} />
          <ShareFooter />
        </div>

        {/* Right — the transcript, sticky and full height */}
        {hasTranscript && (
          <aside
            id="s-transcript-desktop"
            className={`hidden lg:flex ${STICKY_COLUMN} min-h-0 flex-col gap-3`}
          >
            <div className="min-h-0 flex-1">
              <TranscriptPanel segments={transcript!} speakers={speakers} fill />
            </div>
            {canAsk && <AskPanel token={token} docked />}
          </aside>
        )}
      </div>
    </main>
  );
}
