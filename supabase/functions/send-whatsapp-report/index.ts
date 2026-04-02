import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseClient = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const GUPSHUP_API_KEY = Deno.env.get('GUPSHUP_API_KEY')
const GUPSHUP_PHONE = Deno.env.get('GUPSHUP_PHONE_NUMBER') || '1234567890'

interface WhatsAppReportRequest {
  meeting_id: string
  user_id: string
  phone_number: string
  language?: string
}

function formatMeetingReport(insights: any): string {
  const title = insights.meeting_title || 'Meeting Report'
  const summary = insights.summary_short || ''
  const decisions = Array.isArray(insights.decisions) ? insights.decisions.slice(0, 3) : []
  const actionItems = Array.isArray(insights.action_items) ? insights.action_items.slice(0, 3) : []
  const risks = Array.isArray(insights.risks) ? insights.risks.slice(0, 2) : []

  let report = `📋 *${title}*\n\n`

  if (summary) {
    report += `*Summary:*\n${summary}\n\n`
  }

  if (decisions.length > 0) {
    report += `*Key Decisions:*\n`
    decisions.forEach((d, i) => {
      report += `${i + 1}. ${d}\n`
    })
    report += '\n'
  }

  if (actionItems.length > 0) {
    report += `*Action Items:*\n`
    actionItems.forEach((item: any, i: number) => {
      const task = typeof item === 'string' ? item : item.task || ''
      const owner = typeof item === 'object' && item.owner ? ` (${item.owner})` : ''
      report += `${i + 1}. ${task}${owner}\n`
    })
    report += '\n'
  }

  if (risks.length > 0) {
    report += `*⚠️ Risks:*\n`
    risks.forEach((r, i) => {
      report += `${i + 1}. ${r}\n`
    })
    report += '\n'
  }

  report += `_Powered by EchoBrief_`

  return report
}

async function sendViaGupshup(
  phoneNumber: string,
  message: string,
  language: string = 'en'
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!GUPSHUP_API_KEY) {
    throw new Error('GUPSHUP_API_KEY not configured')
  }

  const url = 'https://api.gupshup.io/wa/api/v1/msg'
  
  const formData = new URLSearchParams()
  formData.append('phone', phoneNumber)
  formData.append('message', message)
  formData.append('linkPreviewUrl', 'false')

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `apikey ${GUPSHUP_API_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formData.toString(),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Gupshup API error: ${response.status} ${error}`)
  }

  const data = await response.json()

  if (data.status === 'submitted' || data.status === 'success') {
    return {
      success: true,
      messageId: data.messageId,
    }
  } else {
    return {
      success: false,
      error: data.message || 'Unknown error',
    }
  }
}

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  try {
    const { meeting_id, user_id, phone_number, language = 'en' }: WhatsAppReportRequest = await req.json()

    if (!meeting_id || !phone_number) {
      return new Response(JSON.stringify({ error: 'Missing required fields: meeting_id, phone_number' }), { status: 400 })
    }

    console.log(`Sending WhatsApp report for meeting ${meeting_id} to ${phone_number}`)

    // Fetch meeting and insights
    const { data: meeting, error: meetingError } = await supabaseClient
      .from('meetings')
      .select('*')
      .eq('id', meeting_id)
      .single()

    if (meetingError || !meeting) {
      throw new Error('Meeting not found')
    }

    const { data: insights, error: insightsError } = await supabaseClient
      .from('meeting_insights')
      .select('*')
      .eq('meeting_id', meeting_id)
      .single()

    if (insightsError || !insights) {
      throw new Error('No insights found for this meeting')
    }

    // Format report
    const report = formatMeetingReport({
      meeting_title: meeting.title,
      ...insights,
    })

    // Send via Gupshup
    const sendResult = await sendViaGupshup(phone_number, report, language)

    if (!sendResult.success) {
      throw new Error(sendResult.error || 'Failed to send message')
    }

    // Log to whatsapp_messages table
    const { error: logError } = await supabaseClient
      .from('whatsapp_messages')
      .insert({
        user_id: user_id || meeting.user_id,
        meeting_id,
        phone_number,
        template_name: 'meeting_report',
        language,
        status: 'sent',
        provider: 'gupshup',
        provider_message_id: sendResult.messageId,
        sent_at: new Date().toISOString(),
      })

    if (logError) {
      console.warn('Failed to log message:', logError)
    }

    return new Response(
      JSON.stringify({
        success: true,
        meeting_id,
        message_id: sendResult.messageId,
        phone_number,
        status: 'sent',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error: any) {
    console.error('WhatsApp delivery error:', error.message)

    // Log failure
    const req_body = await req.json().catch(() => ({}))
    if (req_body.meeting_id) {
      await supabaseClient
        .from('whatsapp_messages')
        .insert({
          user_id: req_body.user_id,
          meeting_id: req_body.meeting_id,
          phone_number: req_body.phone_number,
          status: 'failed',
          provider: 'gupshup',
          error_message: error.message,
        })
        .catch(console.warn)
    }

    return new Response(
      JSON.stringify({
        error: error.message,
        success: false,
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})
