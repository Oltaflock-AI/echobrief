import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPrelight } from "../_shared/cors.ts";
import { authenticate } from "../_shared/auth.ts";
import { parseMeetingUrl } from "../_shared/validation.ts";
import { checkRecordingAllowed, recordUsage } from "../_shared/entitlements.ts";
import { BOT_AVATAR_OUTPUT } from "../_shared/bot-avatar.ts";
import { captureError, withObservability } from "../_shared/observability.ts";
import { RECORDING_RETENTION_HOURS } from "../_shared/recall-pipeline.ts";

const RECALL_API_KEY = Deno.env.get("RECALL_API_KEY")!;
const RECALL_API_BASE_URL =
  Deno.env.get("RECALL_API_BASE_URL") || "https://us-east-1.recall.ai";
const RECALL_API_URL = `${RECALL_API_BASE_URL}/api/v1`;

// Statuses that mean a bot is (or is about to be) live for this user. Terminal
// states are completed/failed/cancelled; processing/transcribing are pipeline
// stages after the bot has left the call, so they don't count against the cap.
const IN_PROGRESS_STATUSES = ["joining", "in_call", "recording"];
const MAX_CONCURRENT_RECORDINGS = 3;
// Only recent rows count. A meeting that got stuck in `recording` because a
// webhook never arrived would otherwise consume a slot forever and lock the
// user out of their own product; no real bot outlives this window (our longest
// observed call is ~1 h).
const CAP_WINDOW_HOURS = 6;

serve(withObservability("start-recall-recording", async (req) => {
  const corsResponse = handleCorsPrelight(req);
  if (corsResponse) return corsResponse;

  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // verify_jwt = true: the gateway has verified the JWT signature.
    const caller = await authenticate(req, supabase, corsHeaders);
    if (!caller.ok) return caller.response;

    const body = await req.json().catch(() => ({}));
    const { meeting_url, calendar_event_id, title } = body;

    // The user identity comes from the JWT, never from the body. A service
    // caller (backfill, another function) may name a user explicitly; any
    // body user_id from a user-authenticated caller is ignored.
    const user_id: string | undefined = caller.isService
      ? (typeof body.user_id === "string" && body.user_id ? body.user_id : undefined)
      : caller.userId;
    if (!user_id) {
      return new Response(JSON.stringify({ error: 'Missing user_id' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const parsed = parseMeetingUrl(meeting_url);
    if (!parsed.ok) {
      return new Response(JSON.stringify({ error: parsed.error }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const platform = parsed.platform;

    // Concurrency cap: bots cost real money and a runaway caller (or a stuck
    // meeting nobody noticed) should not be able to fan out an unbounded fleet.
    const { count: inProgress, error: capError } = await supabase
      .from('meetings')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user_id)
      .in('status', IN_PROGRESS_STATUSES)
      .gte('created_at', new Date(Date.now() - CAP_WINDOW_HOURS * 3600_000).toISOString());
    if (capError) throw capError;
    if ((inProgress ?? 0) >= MAX_CONCURRENT_RECORDINGS) {
      return new Response(
        JSON.stringify({ error: `You already have ${MAX_CONCURRENT_RECORDINGS} recordings in progress` }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Plan gate. Bots, transcription and the GPT chain all cost money per
    // meeting, so entitlement is checked before Recall is ever called. Service
    // callers (backfills, internal re-dispatch) are not gated — they are us.
    const entitlement = caller.isService
      ? null
      : await checkRecordingAllowed(supabase, user_id);
    if (entitlement && !entitlement.allowed) {
      return new Response(
        JSON.stringify({
          error: entitlement.reason,
          code: entitlement.code,
          plan: entitlement.plan,
          usage: entitlement.usage,
        }),
        // 402: the request is well-formed and authenticated; it needs a plan.
        { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
    const plan = entitlement?.plan ?? 'teams';
    const limits = entitlement?.limits ?? { maxMeetingSeconds: 6 * 3600 };

    // Use the name the user set in Settings -> Bot. auto-join-meetings reads the
    // same column, so a bot is named identically however it was dispatched.
    const { data: profile } = await supabase
      .from('profiles')
      .select('notetaker_name')
      .eq('user_id', user_id)
      .maybeSingle();
    const botName = profile?.notetaker_name?.trim() || 'EchoBrief Notetaker';

    // Create a bot and request an async mixed-audio artifact.
    // Recall status webhooks should be configured in the Recall dashboard and point to recall-webhook.
    const recallResponse = await fetch(`${RECALL_API_URL}/bot/`, {
      method: 'POST',
      headers: {
        'Authorization': RECALL_API_KEY,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        meeting_url: meeting_url,
        bot_name: botName,
        // Hard per-meeting ceiling, enforced by Recall rather than by us: the
        // bot leaves by itself at the plan's limit. Without this the "45
        // minutes per meeting" on the pricing page is unenforceable, because
        // nothing on our side can stop a call that is already running.
        automatic_leave: {
          in_call_recording_timeout: limits.maxMeetingSeconds,
        },
        // The bot's camera feed once it is admitted: the EchoBrief lockup
        // instead of a blank tile, so participants can see what is in the call.
        // Regenerate the image with `npm run brand:avatar`. Must stay in sync
        // with auto-join-meetings.
        automatic_video_output: BOT_AVATAR_OUTPUT,
        recording_config: {
          audio_mixed_mp3: {},
          // The mp4 is playback-only: it is never downloaded into Supabase
          // Storage (720p costs ~750 MB-1 GB per hour, against a 1 GB bucket
          // cap). MeetingDetail streams it straight from Recall through a
          // freshly signed URL. Must stay in sync with auto-join-meetings.
          video_mixed_mp4: {},
          // 14 days, deliberately past Recall's 7-day free window. Storage past
          // that is $0.000069 per hour of media per hour stored, so the second
          // week costs ~$0.012 per recording-hour — a couple of dollars a month
          // at our volume, against share links that outlived their own video
          // and customers who open a recording the week after the call.
          // Must stay in sync with the other bot-creating call site.
          retention: { type: "timed", hours: RECORDING_RETENTION_HOURS },
          transcript: {
            provider: {
              recallai_streaming: {
                mode: "prioritize_accuracy",
              },
            },
          },
        },
      }),
    });

    if (!recallResponse.ok) {
      const recallBody = await recallResponse.text();
      console.error('[start-recall-recording] Recall API error:', recallResponse.status, recallBody);
      throw new Error(`Recall API ${recallResponse.status}: ${recallBody}`);
    }

    const botData = await recallResponse.json();
    console.log('[start-recall-recording] Bot created:', botData.id);

    // Create meeting record in Supabase
    const { data: meeting, error: createError } = await supabase
      .from('meetings')
      .insert({
        user_id,
        recall_bot_id: botData.id,
        meeting_link: meeting_url,
        calendar_event_id,
        title: title || 'Meeting',
        platform,
        status: 'recording',
        start_time: new Date().toISOString(),
      })
      .select()
      .single();

    if (createError) {
      console.error('Database error:', createError);
      throw createError;
    }

    // Ledger the start. The recorded duration is appended separately once the
    // pipeline knows it; this row is what the meeting-count cap reads.
    await recordUsage(supabase, {
      userId: user_id,
      meetingId: meeting.id,
      kind: 'meeting_started',
      plan,
      isOverage: entitlement?.allowed ? entitlement.isOverage : false,
    });

    return new Response(JSON.stringify({
      success: true,
      meeting_id: meeting.id,
      recall_bot_id: botData.id,
      status: 'recording',
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Start recording error:', error);
    // The console line is ephemeral; this is the one that survives to be queried.
    await captureError(error, { fn: "start-recall-recording" });
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Failed to start recording' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}));
