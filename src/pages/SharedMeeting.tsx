import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Card, ChipGroup } from '@/ui';
import { RecordingPlayer } from '@/components/meeting/RecordingPlayer';
import {
  PrivacyNote,
  ShareError,
  ShareFooter,
  ShareHeader,
  ShareSkeleton,
} from '@/components/share/ShareChrome';
import { MeetingHero } from '@/components/share/MeetingHero';
import { SummaryPanel } from '@/components/share/SummaryPanel';
import { ActionItemsPanel } from '@/components/share/ActionItemsPanel';
import { TranscriptPanel } from '@/components/share/TranscriptPanel';
import { speakersOf, type SharedPayload } from '@/components/share/types';

/**
 * A shared meeting, read by somebody who may have no account.
 *
 * Deliberately not wrapped in AppShell: this page is a public surface and the
 * most common way a stranger meets the product, so it carries the brand and a
 * way in, not the app chrome. It renders exactly what `get-shared-meeting`
 * returns and asks for nothing the payload has not already offered: the
 * summary, decisions, key points and action items always; the transcript and
 * the recording only when the link that was sent carries them.
 *
 * It is drawn in the **Console** palette, in the same tabs-over-cards shape as
 * the owner's meeting page — a reader who is sent a link and later signs up
 * should recognise the product. The `bg-eb-bg` class on the root is
 * load-bearing: it is what `:root:has(.bg-eb-bg)` in index.css keys the
 * light-lock off (see the note there).
 *
 * The tab set is built from what the payload actually contains, so a
 * summary-only link shows one tab rather than three empty ones.
 */

const FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-shared-meeting`;

export default function SharedMeeting() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<SharedPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('summary');

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

  const transcript = data?.transcript ?? null;
  const speakers = useMemo(() => speakersOf(transcript), [transcript]);
  const actionItems = data?.insights?.action_items ?? [];

  const tabs = useMemo(() => {
    if (!data) return [];
    const options: Array<{ value: string; label: string }> = [{ value: 'summary', label: 'Summary' }];
    if (actionItems.length > 0) {
      options.push({ value: 'actions', label: `Actions (${actionItems.length})` });
    }
    if (data.has_recording) options.push({ value: 'recording', label: 'Recording' });
    if (transcript && transcript.length > 0) options.push({ value: 'transcript', label: 'Transcript' });
    return options;
  }, [data, actionItems.length, transcript]);

  // A link that stops carrying the recording must not strand the reader on a
  // tab that no longer exists.
  const activeTab = tabs.some((option) => option.value === tab) ? tab : 'summary';

  return (
    <div className="min-h-screen bg-eb-bg font-dmsans text-eb-text" data-clarity-mask="true">
      <ShareHeader />

      <main className="mx-auto max-w-[1080px] px-4 py-8 sm:px-6 sm:py-10">
        {loading ? (
          <ShareSkeleton />
        ) : error ? (
          <ShareError message={error} />
        ) : data ? (
          <article>
            <MeetingHero meeting={data.meeting} speakers={speakers} />

            {tabs.length > 1 && (
              <div className="scroll-x sticky top-[57px] z-10 -mx-4 mt-7 bg-eb-bg px-4 py-2.5 sm:-mx-6 sm:px-6">
                <ChipGroup
                  ariaLabel="Meeting sections"
                  value={activeTab}
                  onChange={setTab}
                  options={tabs}
                  className="flex-nowrap"
                />
              </div>
            )}

            <div className={tabs.length > 1 ? 'mt-4' : 'mt-7'}>
              {activeTab === 'summary' && (
                <SummaryPanel
                  insights={data.insights}
                  speakers={speakers}
                  hasRecording={data.has_recording}
                  onOpenTab={setTab}
                />
              )}

              {activeTab === 'actions' && <ActionItemsPanel items={actionItems} />}

              {activeTab === 'recording' && (
                <Card padded={false} className="overflow-hidden border-0 bg-transparent shadow-none">
                  <RecordingPlayer meetingId="shared" shareToken={token} />
                </Card>
              )}

              {activeTab === 'transcript' && transcript && (
                <TranscriptPanel segments={transcript} speakers={speakers} />
              )}
            </div>

            <PrivacyNote hasTranscript={!!transcript && transcript.length > 0} />
            <ShareFooter />
          </article>
        ) : null}
      </main>
    </div>
  );
}
