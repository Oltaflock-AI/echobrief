import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPrelight } from "../_shared/cors.ts";

const RECALL_API_KEY = Deno.env.get("RECALL_API_KEY")!;
const RECALL_API_BASE_URL =
  Deno.env.get("RECALL_API_BASE_URL") || "https://us-east-1.recall.ai";
const RECALL_API_URL = `${RECALL_API_BASE_URL}/api/v1`;

serve(async (req) => {
  const corsResponse = handleCorsPrelight(req);
  if (corsResponse) return corsResponse;

  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  try {
    const { meeting_url, user_id, calendar_event_id, title } = await req.json();
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (!meeting_url || !user_id) {
      return new Response(JSON.stringify({ error: 'Missing meeting_url or user_id' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

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
        bot_name: 'EchoBrief Bot',
        recording_config: {
          audio_mixed_mp3: {},
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

    // Determine platform
    let platform = 'unknown';
    if (meeting_url.includes('teams.microsoft.com')) platform = 'teams';
    else if (meeting_url.includes('zoom.us')) platform = 'zoom';
    else if (meeting_url.includes('meet.google.com')) platform = 'google_meet';

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
    return new Response(
      JSON.stringify({ error: error.message || 'Failed to start recording' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
