import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPrelight } from "../_shared/cors.ts";

interface EmailRequest {
  meetingId: string;
  recipientEmail?: string;
}

serve(async (req) => {
  const corsResponse = handleCorsPrelight(req);
  if (corsResponse) return corsResponse;

  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  try {
    const { meetingId, recipientEmail }: EmailRequest = await req.json();

    if (!meetingId) {
      return new Response(
        JSON.stringify({ error: "Meeting ID is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get meeting with insights
    const { data: meeting, error: meetingError } = await supabase
      .from("meetings")
      .select("*")
      .eq("id", meetingId)
      .single();

    if (meetingError || !meeting) {
      console.error("Meeting not found:", meetingError);
      return new Response(
        JSON.stringify({ error: "Meeting not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get insights
    const { data: insights } = await supabase
      .from("meeting_insights")
      .select("*")
      .eq("meeting_id", meetingId)
      .single();

    // Get user email
    const { data: profile } = await supabase
      .from("profiles")
      .select("email, full_name")
      .eq("user_id", meeting.user_id)
      .single();

    const toEmail = recipientEmail || profile?.email;
    
    if (!toEmail) {
      console.error("No recipient email found");
      return new Response(
        JSON.stringify({ error: "No recipient email" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Format meeting date
    const meetingDate = new Date(meeting.start_time).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const meetingTime = new Date(meeting.start_time).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    });

    const durationMinutes = Math.round((meeting.duration_seconds || 0) / 60);

    // Build email HTML
    const emailHtml = buildEmailHtml({
      title: meeting.title,
      date: meetingDate,
      time: meetingTime,
      duration: durationMinutes,
      insights,
      meetingId
    });

    // Send email via Resend API
    console.log("Sending email to:", toEmail);
    
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      console.error("RESEND_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Email service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: "EchoBrief <notifications@resend.dev>",
        to: [toEmail],
        subject: `[EchoBrief] Meeting Summary – ${meeting.title}`,
        html: emailHtml
      })
    });

    const emailResult = await emailResponse.json();
    console.log("Email sent:", emailResult);

    if (!emailResponse.ok) {
      console.error("Resend API error:", emailResult);
      return new Response(
        JSON.stringify({ error: emailResult.message || "Failed to send email" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, emailId: emailResult.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Email error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to send email" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

interface EmailData {
  title: string;
  date: string;
  time: string;
  duration: number;
  insights: any;
  meetingId: string;
}

function buildEmailHtml(data: EmailData): string {
  const { title, date, time, duration, insights, meetingId } = data;
  
  // Format action items
  const actionItems = (insights?.action_items || [])
    .map((item: any) => {
      const owner = item.owner ? ` → <strong>${item.owner}</strong>` : "";
      const priority = item.priority ? ` <span style="color: ${getPriorityColor(item.priority)};">[${item.priority.toUpperCase()}]</span>` : "";
      return `<li>${item.task || item}${owner}${priority}</li>`;
    })
    .join("") || "<li>No action items identified</li>";

  // Format decisions
  const decisions = (insights?.decisions || [])
    .map((d: string) => `<li>${d}</li>`)
    .join("") || "<li>No decisions recorded</li>";

  // Format timeline
  const timeline = (insights?.timeline_entries || [])
    .slice(0, 10)
    .map((entry: any) => {
      const time = formatTimestamp(entry.timestamp);
      const icon = getTimelineIcon(entry.type);
      const speaker = entry.speaker ? `<strong>${entry.speaker}:</strong> ` : "";
      return `<tr>
        <td style="padding: 8px; color: #64748b; font-size: 13px; white-space: nowrap; vertical-align: top;">${time}</td>
        <td style="padding: 8px;">${icon} ${speaker}${entry.content}</td>
      </tr>`;
    })
    .join("") || `<tr><td colspan="2" style="padding: 8px; color: #64748b;">No timeline available</td></tr>`;

  // Format risks and open questions
  const risksAndQuestions = [
    ...(insights?.risks || []).map((r: string) => `<li>⚠️ ${r}</li>`),
    ...(insights?.open_questions || []).map((q: string) => `<li>❓ ${q}</li>`)
  ].join("") || "<li>None identified</li>";

  // Format metrics
  const metrics = insights?.meeting_metrics || {};
  const engagementScore = metrics.engagement_score || "N/A";
  const sentimentScore = metrics.sentiment_score !== undefined 
    ? (metrics.sentiment_score > 0 ? "Positive" : metrics.sentiment_score < 0 ? "Negative" : "Neutral")
    : "N/A";

  const appUrl = "https://echobrief.lovable.app";

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f1f5f9;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f1f5f9; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #3b82f6 0%, #6366f1 100%); padding: 32px; text-align: center;">
              <h1 style="margin: 0; color: white; font-size: 24px; font-weight: 600;">📋 Meeting Summary</h1>
              <p style="margin: 8px 0 0; color: rgba(255,255,255,0.9); font-size: 16px;">${title}</p>
            </td>
          </tr>
          
          <!-- Meeting Info -->
          <tr>
            <td style="padding: 24px; background: #f8fafc; border-bottom: 1px solid #e2e8f0;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="color: #64748b; font-size: 14px;">
                    📅 ${date} • ⏰ ${time} • ⏱️ ${duration} min
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Executive Summary -->
          <tr>
            <td style="padding: 24px;">
              <h2 style="margin: 0 0 16px; color: #1e293b; font-size: 18px; font-weight: 600;">📝 Executive Summary</h2>
              <p style="margin: 0; color: #334155; font-size: 15px; line-height: 1.6;">
                ${insights?.summary_short || "No summary available for this meeting."}
              </p>
            </td>
          </tr>
          
          <!-- Timeline -->
          <tr>
            <td style="padding: 0 24px 24px;">
              <h2 style="margin: 0 0 16px; color: #1e293b; font-size: 18px; font-weight: 600;">⏱️ Timeline</h2>
              <table width="100%" cellpadding="0" cellspacing="0" style="background: #f8fafc; border-radius: 8px; font-size: 14px; color: #334155;">
                ${timeline}
              </table>
            </td>
          </tr>
          
          <!-- Action Items -->
          <tr>
            <td style="padding: 0 24px 24px;">
              <h2 style="margin: 0 0 16px; color: #1e293b; font-size: 18px; font-weight: 600;">✅ Action Items</h2>
              <ul style="margin: 0; padding-left: 20px; color: #334155; font-size: 14px; line-height: 1.8;">
                ${actionItems}
              </ul>
            </td>
          </tr>
          
          <!-- Decisions -->
          <tr>
            <td style="padding: 0 24px 24px;">
              <h2 style="margin: 0 0 16px; color: #1e293b; font-size: 18px; font-weight: 600;">🎯 Decisions</h2>
              <ul style="margin: 0; padding-left: 20px; color: #334155; font-size: 14px; line-height: 1.8;">
                ${decisions}
              </ul>
            </td>
          </tr>
          
          <!-- Risks & Open Questions -->
          <tr>
            <td style="padding: 0 24px 24px;">
              <h2 style="margin: 0 0 16px; color: #1e293b; font-size: 18px; font-weight: 600;">⚡ Risks & Open Questions</h2>
              <ul style="margin: 0; padding-left: 20px; color: #334155; font-size: 14px; line-height: 1.8;">
                ${risksAndQuestions}
              </ul>
            </td>
          </tr>
          
          <!-- Metrics -->
          <tr>
            <td style="padding: 0 24px 24px;">
              <h2 style="margin: 0 0 16px; color: #1e293b; font-size: 18px; font-weight: 600;">📊 Meeting Metrics</h2>
              <table cellpadding="0" cellspacing="0" style="font-size: 14px;">
                <tr>
                  <td style="padding: 4px 16px 4px 0; color: #64748b;">Engagement Score:</td>
                  <td style="padding: 4px 0; color: #334155; font-weight: 500;">${engagementScore}${typeof engagementScore === 'number' ? '/100' : ''}</td>
                </tr>
                <tr>
                  <td style="padding: 4px 16px 4px 0; color: #64748b;">Overall Sentiment:</td>
                  <td style="padding: 4px 0; color: #334155; font-weight: 500;">${sentimentScore}</td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- CTA -->
          <tr>
            <td style="padding: 0 24px 32px; text-align: center;">
              <a href="${appUrl}/meetings/${meetingId}" style="display: inline-block; background: linear-gradient(135deg, #3b82f6 0%, #6366f1 100%); color: white; text-decoration: none; padding: 12px 32px; border-radius: 8px; font-weight: 500; font-size: 14px;">
                View Full Report →
              </a>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 24px; background: #f8fafc; border-top: 1px solid #e2e8f0; text-align: center;">
              <p style="margin: 0; color: #94a3b8; font-size: 13px;">
                This meeting was recorded automatically by EchoBrief.
              </p>
              <p style="margin: 8px 0 0; color: #94a3b8; font-size: 12px;">
                <a href="${appUrl}/settings" style="color: #64748b; text-decoration: none;">Manage notification settings</a>
              </p>
            </td>
          </tr>
          
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

function getPriorityColor(priority: string): string {
  switch (priority?.toLowerCase()) {
    case 'high': return '#ef4444';
    case 'medium': return '#f59e0b';
    case 'low': return '#22c55e';
    default: return '#64748b';
  }
}

function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function getTimelineIcon(type: string): string {
  switch (type) {
    case 'topic': return '💬';
    case 'question': return '❓';
    case 'decision': return '✅';
    case 'action': return '📋';
    case 'risk': return '⚠️';
    default: return '•';
  }
}
