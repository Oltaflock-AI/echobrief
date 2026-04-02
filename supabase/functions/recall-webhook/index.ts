import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseClient = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const RECALL_API_KEY = Deno.env.get('RECALL_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

serve(async (req) => {
  try {
    const payload = await req.json()
    
    console.log('Recall webhook received:', { event: payload.event, status: payload.status, botId: payload.bot_id })
    
    // Only process completed recordings
    if (payload.event === 'bot.status_change' && payload.status === 'done') {
      const botId = payload.bot_id
      
      // Find the bot job to get meeting_id and user_id
      const { data: botJob, error: botJobError } = await supabaseClient
        .from('bot_jobs')
        .select('*')
        .eq('container_id', botId)
        .single()
      
      if (botJobError || !botJob) {
        console.error('Bot job not found:', botJobError)
        return new Response(JSON.stringify({ error: 'Bot job not found' }), { status: 404 })
      }
      
      // Fetch transcript from Recall API
      const transcriptResponse = await fetch(`https://us-west-2.recall.ai/api/v1/bot/${botId}/transcript/`, {
        headers: {
          'Authorization': `Token ${RECALL_API_KEY}`
        }
      })
      
      if (!transcriptResponse.ok) {
        throw new Error(`Recall API error: ${transcriptResponse.statusText}`)
      }
      
      const transcriptData = await transcriptResponse.json()
      const transcriptText = transcriptData.text || ''
      
      if (!transcriptText) {
        console.warn('No transcript received from Recall')
        return new Response(JSON.stringify({ warning: 'Empty transcript' }), { status: 200 })
      }
      
      // Store transcript in Supabase
      const { data: transcript, error: transcriptError } = await supabaseClient
        .from('transcripts')
        .insert({
          meeting_id: botJob.meeting_id,
          bot_id: botId,
          content: transcriptText,
          speakers: transcriptData.speakers || [],
          word_timestamps: transcriptData.word_timestamps || [],
        })
        .select()
        .single()
      
      if (transcriptError) {
        throw new Error(`Failed to save transcript: ${transcriptError.message}`)
      }
      
      console.log('Transcript stored:', { meeting_id: botJob.meeting_id, length: transcriptText.length })
      
      // Trigger insight generation asynchronously via edge function
      const generateInsightsResponse = await fetch(
        `${SUPABASE_URL}/functions/v1/generate-meeting-insights`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            meeting_id: botJob.meeting_id,
            transcript_id: transcript.id,
            transcript_content: transcriptText,
            user_id: botJob.user_id,
          }),
        }
      )
      
      if (!generateInsightsResponse.ok) {
        console.warn('Insight generation queued but may have failed:', await generateInsightsResponse.text())
      } else {
        console.log('Insight generation triggered for meeting:', botJob.meeting_id)
      }
      
      // Update bot_job status to completed
      await supabaseClient
        .from('bot_jobs')
        .update({ status: 'completed', ended_at: new Date().toISOString() })
        .eq('id', botJob.id)
      
      return new Response(JSON.stringify({ success: true, meeting_id: botJob.meeting_id }), { status: 200 })
    }
    
    return new Response('ok', { status: 200 })
  } catch (error: any) {
    console.error('Recall webhook error:', error.message)
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }
})
