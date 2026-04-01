import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Cron function - runs hourly to send due onboarding emails
serve(async (req) => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get pending emails that are due
    const { data: pendingEmails, error: fetchError } = await supabase
      .from("scheduled_emails")
      .select("*")
      .eq("status", "pending")
      .lte("send_at", new Date().toISOString())
      .limit(50);

    if (fetchError) {
      console.error("Failed to fetch pending emails:", fetchError);
      return new Response(JSON.stringify({ error: fetchError.message }), { status: 500 });
    }

    if (!pendingEmails || pendingEmails.length === 0) {
      return new Response(JSON.stringify({ success: true, sent: 0 }), { status: 200 });
    }

    let sentCount = 0;

    for (const email of pendingEmails) {
      try {
        const html = getEmailTemplate(email.template, email.email);
        
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${resendApiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            from: "EchoBrief <noreply@oltaflock.ai>",
            to: [email.email],
            subject: email.subject,
            html
          })
        });

        if (response.ok) {
          await supabase
            .from("scheduled_emails")
            .update({ status: "sent", sent_at: new Date().toISOString() })
            .eq("id", email.id);
          sentCount++;
          console.log(`Sent ${email.template} email to ${email.email}`);
        } else {
          const error = await response.json();
          console.error(`Failed to send email to ${email.email}:`, error);
          await supabase
            .from("scheduled_emails")
            .update({ status: "failed" })
            .eq("id", email.id);
        }
      } catch (err) {
        console.error(`Error sending email ${email.id}:`, err);
      }
    }

    return new Response(JSON.stringify({ success: true, sent: sentCount }), { status: 200 });

  } catch (error: any) {
    console.error("Send scheduled emails error:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
});

function getEmailTemplate(template: string, userEmail: string): string {
  const firstName = userEmail.split("@")[0].split(".")[0];
  const capitalizedName = firstName.charAt(0).toUpperCase() + firstName.slice(1);
  
  const templates: Record<string, string> = {
    welcome: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f8f8f8;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8f8f8;padding:40px 20px;">
<tr><td align="center">
<table width="520" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
<tr><td style="background:linear-gradient(135deg,#F97316,#F59E0B);padding:32px 40px;text-align:center;">
<span style="font-size:28px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">echo</span><span style="font-size:28px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;opacity:0.9;">brief</span>
</td></tr>
<tr><td style="padding:40px;">
<h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#1a1a2e;">Welcome to EchoBrief, ${capitalizedName}! 👋</h1>
<p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#4a4a68;">You just unlocked AI-powered meeting intelligence. No more frantic note-taking. No more "wait, what did we decide?"</p>
<p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#4a4a68;"><strong>Here's what EchoBrief does:</strong></p>
<ul style="margin:0 0 24px;padding-left:20px;font-size:15px;line-height:1.8;color:#4a4a68;">
<li>Records your Google Meet & Zoom meetings</li>
<li>Transcribes in 22 Indian languages (Hindi, Tamil, Telugu...)</li>
<li>Generates executive summaries with action items</li>
<li>Delivers insights to your inbox instantly</li>
</ul>
<p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#4a4a68;">Tomorrow, I'll send you a quick 2-minute setup guide. For now, just know — your meetings are about to get a lot more useful.</p>
<table cellpadding="0" cellspacing="0" style="margin:0 0 24px;"><tr><td style="background:linear-gradient(135deg,#F97316,#F59E0B);border-radius:8px;padding:14px 32px;">
<a href="https://echobrief.in/dashboard" style="color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;display:inline-block;">Go to Dashboard →</a>
</td></tr></table>
<p style="margin:0;font-size:14px;color:#8888a0;">— The EchoBrief Team</p>
</td></tr>
<tr><td style="background-color:#f8f8fa;padding:24px 40px;text-align:center;border-top:1px solid #eeeef2;">
<p style="margin:0;font-size:12px;color:#8888a0;">EchoBrief — Your meetings, finally useful.</p>
</td></tr>
</table>
</td></tr></table>
</body>
</html>`,

    setup_guide: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f8f8f8;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8f8f8;padding:40px 20px;">
<tr><td align="center">
<table width="520" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
<tr><td style="background:linear-gradient(135deg,#F97316,#F59E0B);padding:32px 40px;text-align:center;">
<span style="font-size:28px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">echo</span><span style="font-size:28px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;opacity:0.9;">brief</span>
</td></tr>
<tr><td style="padding:40px;">
<h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#1a1a2e;">2-minute setup ⏱️</h1>
<p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#4a4a68;">Let's get EchoBrief recording your meetings. Two quick steps:</p>

<div style="background:#FFF7ED;border-left:4px solid #F97316;padding:16px 20px;margin:0 0 20px;border-radius:0 8px 8px 0;">
<p style="margin:0 0 8px;font-size:14px;font-weight:600;color:#C2410C;">Step 1: Install the Chrome Extension</p>
<p style="margin:0;font-size:14px;color:#4a4a68;">Click below to add EchoBrief to Chrome. It takes 10 seconds.</p>
</div>

<div style="background:#FFF7ED;border-left:4px solid #F97316;padding:16px 20px;margin:0 0 24px;border-radius:0 8px 8px 0;">
<p style="margin:0 0 8px;font-size:14px;font-weight:600;color:#C2410C;">Step 2: Connect Google Calendar (optional)</p>
<p style="margin:0;font-size:14px;color:#4a4a68;">Go to Settings → Connect your calendar for automatic meeting detection.</p>
</div>

<table cellpadding="0" cellspacing="0" style="margin:0 0 24px;"><tr><td style="background:linear-gradient(135deg,#F97316,#F59E0B);border-radius:8px;padding:14px 32px;">
<a href="https://echobrief.in/extension" style="color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;display:inline-block;">Install Chrome Extension →</a>
</td></tr></table>

<p style="margin:0;font-size:14px;color:#8888a0;">That's it. Your next meeting is about to get a lot smarter.</p>
</td></tr>
<tr><td style="background-color:#f8f8fa;padding:24px 40px;text-align:center;border-top:1px solid #eeeef2;">
<p style="margin:0;font-size:12px;color:#8888a0;">EchoBrief — Your meetings, finally useful.</p>
</td></tr>
</table>
</td></tr></table>
</body>
</html>`,

    first_meeting: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f8f8f8;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8f8f8;padding:40px 20px;">
<tr><td align="center">
<table width="520" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
<tr><td style="background:linear-gradient(135deg,#F97316,#F59E0B);padding:32px 40px;text-align:center;">
<span style="font-size:28px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">echo</span><span style="font-size:28px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;opacity:0.9;">brief</span>
</td></tr>
<tr><td style="padding:40px;">
<h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#1a1a2e;">Ready to see the magic? ✨</h1>
<p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#4a4a68;">Your next meeting is the perfect test run. Here's what happens:</p>

<ol style="margin:0 0 24px;padding-left:20px;font-size:15px;line-height:2;color:#4a4a68;">
<li>Join a Google Meet or Zoom call</li>
<li>Click the EchoBrief extension → Start Recording</li>
<li>Have your meeting normally</li>
<li>End the call → Summary arrives in your inbox</li>
</ol>

<p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#4a4a68;"><strong>Pro tip:</strong> Even a quick 5-minute call works. Try it on your next 1:1 or standup.</p>

<table cellpadding="0" cellspacing="0" style="margin:0 0 24px;"><tr><td style="background:linear-gradient(135deg,#F97316,#F59E0B);border-radius:8px;padding:14px 32px;">
<a href="https://meet.google.com/new" style="color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;display:inline-block;">Start a Test Meeting →</a>
</td></tr></table>

<p style="margin:0;font-size:14px;color:#8888a0;">Your meetings are about to get a lot more useful.</p>
</td></tr>
<tr><td style="background-color:#f8f8fa;padding:24px 40px;text-align:center;border-top:1px solid #eeeef2;">
<p style="margin:0;font-size:12px;color:#8888a0;">EchoBrief — Your meetings, finally useful.</p>
</td></tr>
</table>
</td></tr></table>
</body>
</html>`,

    tips: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f8f8f8;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8f8f8;padding:40px 20px;">
<tr><td align="center">
<table width="520" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
<tr><td style="background:linear-gradient(135deg,#F97316,#F59E0B);padding:32px 40px;text-align:center;">
<span style="font-size:28px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">echo</span><span style="font-size:28px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;opacity:0.9;">brief</span>
</td></tr>
<tr><td style="padding:40px;">
<h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#1a1a2e;">Pro tips to level up 🚀</h1>
<p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#4a4a68;">A few features you might have missed:</p>

<div style="margin:0 0 16px;padding:16px;background:#f8f8fa;border-radius:8px;">
<p style="margin:0 0 4px;font-size:14px;font-weight:600;color:#1a1a2e;">🌐 Multilingual transcription</p>
<p style="margin:0;font-size:14px;color:#4a4a68;">Meetings in Hindi, Tamil, or Hinglish? EchoBrief handles 22 Indian languages.</p>
</div>

<div style="margin:0 0 16px;padding:16px;background:#f8f8fa;border-radius:8px;">
<p style="margin:0 0 4px;font-size:14px;font-weight:600;color:#1a1a2e;">✅ Action item tracking</p>
<p style="margin:0;font-size:14px;color:#4a4a68;">Every summary includes action items with owners. No more "who was supposed to do that?"</p>
</div>

<div style="margin:0 0 24px;padding:16px;background:#f8f8fa;border-radius:8px;">
<p style="margin:0 0 4px;font-size:14px;font-weight:600;color:#1a1a2e;">💬 Slack delivery (coming soon)</p>
<p style="margin:0;font-size:14px;color:#4a4a68;">Get summaries posted directly to your Slack channel.</p>
</div>

<table cellpadding="0" cellspacing="0" style="margin:0 0 24px;"><tr><td style="background:linear-gradient(135deg,#F97316,#F59E0B);border-radius:8px;padding:14px 32px;">
<a href="https://echobrief.in/settings" style="color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;display:inline-block;">Explore Settings →</a>
</td></tr></table>
</td></tr>
<tr><td style="background-color:#f8f8fa;padding:24px 40px;text-align:center;border-top:1px solid #eeeef2;">
<p style="margin:0;font-size:12px;color:#8888a0;">EchoBrief — Your meetings, finally useful.</p>
</td></tr>
</table>
</td></tr></table>
</body>
</html>`,

    checkin: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f8f8f8;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8f8f8;padding:40px 20px;">
<tr><td align="center">
<table width="520" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
<tr><td style="background:linear-gradient(135deg,#F97316,#F59E0B);padding:32px 40px;text-align:center;">
<span style="font-size:28px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">echo</span><span style="font-size:28px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;opacity:0.9;">brief</span>
</td></tr>
<tr><td style="padding:40px;">
<h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#1a1a2e;">How's it going? 👋</h1>
<p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#4a4a68;">You've been with EchoBrief for two weeks now. Quick check-in:</p>

<ul style="margin:0 0 24px;padding-left:20px;font-size:15px;line-height:1.8;color:#4a4a68;">
<li>Are your meeting summaries hitting the mark?</li>
<li>Any features you wish existed?</li>
<li>Running into any issues?</li>
</ul>

<p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#4a4a68;">Just reply to this email — I read every response and would love to hear what's working (and what isn't).</p>

<p style="margin:0;font-size:14px;color:#8888a0;">— Khush, Founder @ EchoBrief</p>
</td></tr>
<tr><td style="background-color:#f8f8fa;padding:24px 40px;text-align:center;border-top:1px solid #eeeef2;">
<p style="margin:0;font-size:12px;color:#8888a0;">EchoBrief — Your meetings, finally useful.</p>
</td></tr>
</table>
</td></tr></table>
</body>
</html>`
  };

  return templates[template] || templates.welcome;
}
