import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RECALL_API_KEY = Deno.env.get("RECALL_API_KEY")!;
const RECALL_API_URL = "https://api.recall.ai/api/v2";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  try {
    const { meeting_url, user_id, calendar_event_id, title } = await req.json();
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (!meeting_url || !user_id) {
      return new Response(JSON.stringify({ error: 'Missing meeting_url or user_id' }), { status: 400 });
    }

    // Call Recall API to start recording
    const recallResponse = await fetch(`${RECALL_API_URL}/recordingbots`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RECALL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        meeting_url: meeting_url,
        bot_name: 'EchoBrief Bot',
        capture_video: true,
        video_codec: 'h264',
        audio_codec: 'aac',
        chunk_size: 3600,
        real_time_transcription: {
          provider: 'sarvam',
          language: 'en',
        },
        stop_real_time_transcription_on_silence: true,
        real_time_transcription_language: 'en',
        wait_for_ready: true,
      }),
    });

    if (!recallResponse.ok) {
      const error = await recallResponse.text();
      console.error('Recall API error:', error);
      throw new Error(`Recall API error: ${recallResponse.status}`);
    }

    const botData = await recallResponse.json();

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
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Start recording error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Failed to start recording' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
