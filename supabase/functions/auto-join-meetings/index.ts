import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { authenticate, json } from "../_shared/auth.ts"
import { checkRecordingAllowed, recordUsage } from "../_shared/entitlements.ts"
import {
  fetchUpcomingEvents,
  getFreshAccessToken,
  listConnections,
  markNeedsReconnect,
  shouldJoin,
  upsertCalendarEvents,
  type NormalizedEvent,
} from "../_shared/calendar-connections.ts"
import { parseMeetingUrl } from "../_shared/validation.ts"
import { BOT_AVATAR_OUTPUT } from "../_shared/bot-avatar.ts"
import { captureError, withObservability } from "../_shared/observability.ts";
import { RECORDING_RETENTION_HOURS } from "../_shared/recall-pipeline.ts";

const RECALL_API_KEY = Deno.env.get('RECALL_API_KEY')
const RECALL_API_BASE_URL =
  Deno.env.get('RECALL_API_BASE_URL') || 'https://us-east-1.recall.ai'
const RECALL_BASE_URL = `${RECALL_API_BASE_URL}/api/v1`
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// Called by a pg_cron job every 5 minutes to auto-join calendar meetings.
// The look-ahead window (joinMinutes) must be >= the cron interval so no
// meeting slips between polls; the per-event dedup guard below prevents the
// wider window from sending duplicate bots on successive runs.
serve(withObservability("auto-join-meetings", async (req) => {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    // Cron-only: pg_cron sends the Vault-sourced service key (see migration
    // 20260831190000_cron_service_auth.sql). This sweep touches every
    // auto-join profile, so nothing short of the service role may run it.
    const caller = await authenticate(req, supabase)
    if (!caller.ok) return caller.response
    if (!caller.isService) return json({ error: 'Service only' }, 403)

    // Get all users with auto-join enabled from profiles table
    const { data: prefs, error: prefsError } = await supabase
      .from('profiles')
      .select('user_id, notetaker_name')
      .eq('auto_join_enabled', true)

    if (prefsError || !prefs?.length) {
      return new Response(JSON.stringify({ message: 'No users with auto-join enabled', error: prefsError }), {
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const results = []

    for (const pref of prefs) {
      // Every calendar this user has connected, whichever provider it is.
      // This is what lets a Teams meeting on an Outlook calendar be auto-joined
      // — previously auto-join could only ever see Google.
      let connections
      try {
        connections = await listConnections(supabase, pref.user_id)
      } catch (err) {
        console.error(`[auto-join] Could not read connections for ${pref.user_id}:`, err)
        continue
      }
      if (connections.length === 0) continue

      // Look for calendar events starting within the next 7 minutes.
      // Window is > the 5-min cron cadence so every meeting is caught at least
      // one poll before it starts; dedup (below) stops repeat bots.
      const now = new Date()
      const joinMinutes = 7
      // Two different windows on purpose.
      //
      // Dispatch only cares about the next `joinMinutes`. The FETCH reaches a
      // day ahead so `calendar_events` is actually kept fresh server-side —
      // previously that table was written only when a browser hit
      // sync-google-calendar, so for anyone not sitting on the dashboard it was
      // stale, and everything reading it (the Calendar page, the reviewer
      // lookup in _shared/summary-recipients.ts) was reading history.
      //
      // It costs no extra HTTP call, and the version diff in
      // upsertCalendarEvents means unchanged events are not rewritten — which
      // is what keeps this off the Disk IO Budget.
      const syncWindow = new Date(now.getTime() + 24 * 60 * 60 * 1000)

      const events: NormalizedEvent[] = []
      for (const conn of connections) {
        const token = await getFreshAccessToken(supabase, conn)
        if (!token.ok) {
          // Only a grant the user must repair gets flagged. A missing client
          // secret or a provider 5xx is our problem and must not switch off a
          // healthy integration for everyone.
          if (token.needsReconnect) await markNeedsReconnect(supabase, conn)
          else console.warn(`[auto-join] ${conn.provider} token for ${pref.user_id}: ${token.reason}`)
          continue
        }

        const fetched = await fetchUpcomingEvents(conn.provider, token.accessToken, now, syncWindow)
        if (!fetched.ok) {
          console.warn(`[auto-join] ${conn.provider} events for ${pref.user_id}: ${fetched.reason}`)
          continue
        }
        events.push(...fetched.events)

        // Keep calendar_events fresh from the server. It used to be written
        // only when a browser hit sync-google-calendar, so for anyone not
        // actively using the dashboard it was stale — which is why auto-join
        // called the provider directly instead of trusting the table.
        // Folded into this tick deliberately: a separate cron would add
        // another pg_net job, and that write churn is the binding constraint
        // on this instance's Disk IO Budget.
        const synced = await upsertCalendarEvents(supabase, pref.user_id, fetched.events)
        console.log(
          `[auto-join] ${conn.provider}: ${fetched.events.length} event(s) in the next 24h, ` +
          `${synced.written} written, ${synced.skipped} unchanged`,
        )
      }

      for (const event of events) {
        // Only process events with a link we are actually willing to join.
        const meetingUrl = event.meetingLink
        if (!meetingUrl) continue

        // Validated with the same parser start-recall-recording uses, so a
        // lookalike host pasted into a calendar description (evilzoom.us) can
        // never be handed to Recall. The old code matched a bare substring.
        const parsedUrl = parseMeetingUrl(meetingUrl)
        if (!parsedUrl.ok) {
          console.log(`[auto-join] Ignoring unjoinable link on "${event.title}": ${parsedUrl.error}`)
          continue
        }
        const platform = parsedUrl.platform

        if (!shouldJoin(event)) {
          console.log(
            `[auto-join] Skipping "${event.title}" — responseStatus=${event.responseStatus}, owner=${event.isOwner}`,
          )
          continue
        }

        // Only join if the meeting starts within the join window
        const eventStart = new Date(event.startTime)
        const minutesUntilStart = (eventStart.getTime() - now.getTime()) / 60000

        if (minutesUntilStart > joinMinutes) continue

        // Plan gate — the same ceiling the manual path enforces, so a user
        // cannot route around their quota by letting the calendar dispatch it.
        // Checked per event, not per user: each claim consumes quota, and a
        // user with two back-to-back meetings can cross the line between them.
        const entitlement = await checkRecordingAllowed(supabase, pref.user_id)
        if (!entitlement.allowed) {
          console.log(
            `[auto-join] Quota reached for ${pref.user_id} (${entitlement.code}), skipping event ${event.providerEventId}`,
          )
          results.push({
            user_id: pref.user_id,
            event: event.title,
            status: 'skipped_quota',
            code: entitlement.code,
          })
          continue
        }

        // Claim the calendar event BEFORE sending a bot. The unique index
        // meetings_autojoin_dedup (migration 20260820150000) makes the database
        // the arbiter: a concurrent invocation that lost the race gets 23505 here
        // and skips. Reading first and inserting only after the bot call is what
        // produced 88 duplicate bots, all created 1-2 s apart.
        const { data: claimed, error: claimError } = await supabase
          .from('meetings')
          .insert({
            user_id: pref.user_id,
            title: event.title || 'Untitled Meeting',
            source: 'auto-join',
            calendar_event_id: event.providerEventId,
            meeting_link: meetingUrl,
            platform,
            status: 'joining',
            start_time: eventStart.toISOString(),
            // Kept so the summary can be copied to allowlisted reviewers on the
            // invite (see _shared/summary-recipients.ts) and so insight
            // generation has real participant names to map speakers onto.
            attendees: event.attendees || [],
          })
          .select('id')
          .single()

        if (claimError || !claimed) {
          // 23505 = unique_violation: another invocation already claimed it.
          if (claimError?.code !== '23505') {
            console.error(`[auto-join] Could not claim event ${event.providerEventId}:`, claimError)
          }
          continue
        }

        // Send the bot
        const botResponse = await fetch(`${RECALL_BASE_URL}/bot/`, {
          method: 'POST',
          headers: {
            'Authorization': RECALL_API_KEY || '',
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            meeting_url: meetingUrl,
            bot_name: pref.notetaker_name || 'EchoBrief Notetaker',
            // Hard per-meeting ceiling, enforced by Recall itself. Must stay in
            // sync with start-recall-recording.
            automatic_leave: {
              in_call_recording_timeout: entitlement.limits.maxMeetingSeconds,
            },
            // Brand lockup as the bot's camera feed. Must stay in sync with
            // start-recall-recording; regenerate with `npm run brand:avatar`.
            automatic_video_output: BOT_AVATAR_OUTPUT,
            recording_config: {
              audio_mixed_mp3: {},
              // Playback-only mp4, streamed from Recall at view time and never
              // stored by us. Must stay in sync with start-recall-recording.
              video_mixed_mp4: {},
              // 168 h is Recall's free storage ceiling; past it they bill.
              // 10 days — see RECORDING_RETENTION_HOURS for the cost note. The
              // two bot-creating call sites must stay in sync.
              retention: { type: "timed", hours: RECORDING_RETENTION_HOURS },
              // Required for speaker-name resolution: without a transcript
              // provider Recall produces no transcript, so sarvam-webhook has
              // no speaker timeline to map SPEAKER_XX onto real participants.
              // Must stay in sync with start-recall-recording.
              transcript: {
                provider: {
                  recallai_streaming: {
                    mode: "prioritize_accuracy",
                  },
                },
              },
            },
          })
        })

        const botData = await botResponse.json()

        if (!botResponse.ok || !botData.id) {
          // Release the claim so a later poll can retry this event.
          console.error(
            `[auto-join] Recall bot creation failed for event ${event.providerEventId} (HTTP ${botResponse.status}):`,
            JSON.stringify(botData).substring(0, 300),
          )
          await supabase.from('meetings').delete().eq('id', claimed.id)
          continue
        }

        await supabase
          .from('meetings')
          .update({ status: 'recording', recall_bot_id: botData.id })
          .eq('id', claimed.id)

        await recordUsage(supabase, {
          userId: pref.user_id,
          meetingId: claimed.id,
          kind: 'meeting_started',
          plan: entitlement.plan,
          isOverage: entitlement.isOverage,
        })

        results.push({
          user_id: pref.user_id,
          event: event.title,
          bot_id: botData.id,
          status: 'joined'
        })
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('auto-join-meetings error:', error)
    // The console line is ephemeral; this is the one that survives to be queried.
    await captureError(error, { fn: "auto-join-meetings" });
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}))
