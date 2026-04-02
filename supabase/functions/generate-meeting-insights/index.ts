import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseClient = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')

interface InsightRequest {
  meeting_id: string
  transcript_id: string
  transcript_content: string
  user_id: string
}

async function generateInsightsWithGPT(transcript: string): Promise<any> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.7,
      max_tokens: 3000,
      messages: [
        {
          role: 'system',
          content: `You are an expert meeting analyst. Analyze the following meeting transcript and provide structured insights.
          
Return a JSON object with:
- summary_short: (2-3 sentence executive summary)
- summary_detailed: (5-7 sentence detailed summary)
- key_points: (array of 3-5 key discussion points)
- decisions: (array of decisions made, if any)
- action_items: (array of {task, owner, priority} objects)
- risks: (array of identified risks or concerns)
- open_questions: (array of unresolved questions)
- strategic_insights: (array of {insight, category} objects)

Keep language clear and professional. Focus on business value.`,
        },
        {
          role: 'user',
          content: `Analyze this meeting transcript:\n\n${transcript.substring(0, 12000)}`,
        },
      ],
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`OpenAI API error: ${response.status} ${error}`)
  }

  const data = await response.json()
  const content = data.choices?.[0]?.message?.content

  if (!content) {
    throw new Error('No content in OpenAI response')
  }

  try {
    // Try to parse JSON from the response
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error('No JSON found in response')
    }
    return JSON.parse(jsonMatch[0])
  } catch (parseError) {
    console.warn('Failed to parse insights JSON, using fallback structure')
    return {
      summary_short: 'Meeting summary pending analysis.',
      summary_detailed: content.substring(0, 500),
      key_points: ['Meeting recorded and stored successfully.'],
      decisions: [],
      action_items: [],
      risks: [],
      open_questions: [],
      strategic_insights: [],
    }
  }
}

async function generateInsightsWithAnthropic(transcript: string): Promise<any> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-5',
      max_tokens: 3000,
      messages: [
        {
          role: 'user',
          content: `Analyze this meeting transcript and provide structured insights as JSON:

${transcript.substring(0, 12000)}

Return a JSON object with:
- summary_short: (2-3 sentence executive summary)
- summary_detailed: (5-7 sentence detailed summary)
- key_points: (array of 3-5 key discussion points)
- decisions: (array of decisions made)
- action_items: (array of {task, owner, priority} objects)
- risks: (array of risks or concerns)
- open_questions: (array of unresolved questions)
- strategic_insights: (array of {insight, category} objects)`,
        },
      ],
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Anthropic API error: ${response.status} ${error}`)
  }

  const data = await response.json()
  const content = data.content?.[0]?.text

  if (!content) {
    throw new Error('No content in Anthropic response')
  }

  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error('No JSON found in response')
    }
    return JSON.parse(jsonMatch[0])
  } catch (parseError) {
    console.warn('Failed to parse insights JSON from Anthropic')
    return {
      summary_short: 'Meeting analyzed.',
      summary_detailed: content.substring(0, 500),
      key_points: [],
      decisions: [],
      action_items: [],
      risks: [],
      open_questions: [],
      strategic_insights: [],
    }
  }
}

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  try {
    const { meeting_id, transcript_id, transcript_content, user_id }: InsightRequest = await req.json()

    if (!meeting_id || !transcript_content) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400 })
    }

    console.log(`Generating insights for meeting ${meeting_id}`)

    // Try GPT first, fall back to Anthropic if needed
    let insights: any
    try {
      insights = await generateInsightsWithGPT(transcript_content)
    } catch (gptError) {
      console.warn('GPT generation failed, trying Anthropic:', gptError)
      insights = await generateInsightsWithAnthropic(transcript_content)
    }

    // Normalize insights structure
    const normalizedInsights = {
      meeting_id,
      summary_short: insights.summary_short || 'Meeting recorded.',
      summary_detailed: insights.summary_detailed || '',
      key_points: Array.isArray(insights.key_points) ? insights.key_points : [],
      decisions: Array.isArray(insights.decisions) ? insights.decisions : [],
      action_items: Array.isArray(insights.action_items) ? insights.action_items : [],
      risks: Array.isArray(insights.risks) ? insights.risks : [],
      open_questions: Array.isArray(insights.open_questions) ? insights.open_questions : [],
      strategic_insights: Array.isArray(insights.strategic_insights) ? insights.strategic_insights : [],
      follow_ups: Array.isArray(insights.follow_ups) ? insights.follow_ups : [],
      speaker_highlights: Array.isArray(insights.speaker_highlights) ? insights.speaker_highlights : [],
      meeting_metrics: insights.meeting_metrics || {},
      processing_completed_at: new Date().toISOString(),
    }

    // Save insights to database
    const { error: saveError } = await supabaseClient
      .from('meeting_insights')
      .upsert(
        {
          meeting_id,
          ...normalizedInsights,
        },
        { onConflict: 'meeting_id' }
      )

    if (saveError) {
      throw new Error(`Failed to save insights: ${saveError.message}`)
    }

    // Update meeting status to completed
    await supabaseClient
      .from('meetings')
      .update({ status: 'completed' })
      .eq('id', meeting_id)

    console.log(`Insights saved for meeting ${meeting_id}`)

    return new Response(
      JSON.stringify({
        success: true,
        meeting_id,
        insights_generated: true,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error: any) {
    console.error('Insight generation error:', error.message)
    return new Response(
      JSON.stringify({
        error: error.message,
        success: false,
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})
