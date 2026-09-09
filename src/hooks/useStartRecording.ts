/**
 * Starting a bot — the one implementation.
 *
 * V1's dialog (`RecordingButton`) and the Console dialog (`RecordDialogV2`)
 * draw different forms over identical behaviour: the same URL validation, the
 * same `start-recall-recording` call, and the same unwrapping of the
 * function's own error text (429 "You already have 3 recordings in progress",
 * 402 over quota, 400 for a link we do not support) instead of the generic
 * FunctionsHttpError message. Keeping that here is what stops the two dialogs
 * from disagreeing about what a failure means while both are live.
 */
import { useState } from 'react';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { formatIST } from '@/lib/time';
import { parseMeetingUrl } from '@/lib/meetingUrl';

export type StartArgs = {
  meetingUrl: string;
  title?: string;
  calendarEventId?: string;
};

export function useStartRecording() {
  const [isStarting, setIsStarting] = useState(false);

  /** Resolves to null on success, or the message to show. */
  const start = async ({ meetingUrl, title, calendarEventId }: StartArgs): Promise<string | null> => {
    setIsStarting(true);
    try {
      const parsed = parseMeetingUrl(meetingUrl);
      if (!parsed.ok) return parsed.error || 'Enter a valid meeting link.';

      const { data, error } = await supabase.functions.invoke('start-recall-recording', {
        body: {
          meeting_url: meetingUrl,
          ...(calendarEventId ? { calendar_event_id: calendarEventId } : {}),
          title: title || `Meeting ${formatIST(new Date(), 'MMM d, yyyy')}`,
        },
      });

      if (error) {
        let message = error.message || 'Failed to start recording';
        if (error instanceof FunctionsHttpError) {
          try {
            const body = await error.context.json();
            if (body?.error) message = body.error;
          } catch {
            // keep the generic message
          }
        }
        return message;
      }
      if (data?.error) return data.error as string;
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : 'Failed to start recording';
    } finally {
      setIsStarting(false);
    }
  };

  return { start, isStarting };
}
