import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Called when a new user signs up (via database trigger or direct call)
serve(async (req) => {
  try {
    const { user_id, email, full_name } = await req.json();
    
    if (!user_id || !email) {
      return new Response(JSON.stringify({ error: "user_id and email required" }), { status: 400 });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const now = new Date();
    const firstName = full_name?.split(" ")[0] || "there";

    // Onboarding email schedule
    const emails = [
      {
        template: "welcome",
        subject: "Welcome to EchoBrief — Your meetings, finally useful",
        delay_hours: 0
      },
      {
        template: "setup_guide",
        subject: "2-minute setup: Get EchoBrief recording your meetings",
        delay_hours: 24
      },
      {
        template: "first_meeting",
        subject: "Ready for your first AI-powered meeting summary?",
        delay_hours: 72
      },
      {
        template: "tips",
        subject: "Pro tips: Get more from EchoBrief",
        delay_hours: 168 // 7 days
      },
      {
        template: "checkin",
        subject: "How's EchoBrief working for you?",
        delay_hours: 336 // 14 days
      }
    ];

    const scheduledEmails = emails.map((e) => ({
      user_id,
      email,
      template: e.template,
      subject: e.subject,
      send_at: new Date(now.getTime() + e.delay_hours * 60 * 60 * 1000).toISOString(),
      status: "pending"
    }));

    const { error } = await supabase.from("scheduled_emails").insert(scheduledEmails);

    if (error) {
      console.error("Failed to queue emails:", error);
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }

    console.log(`Queued ${emails.length} onboarding emails for ${email}`);
    return new Response(JSON.stringify({ success: true, queued: emails.length }), { status: 200 });

  } catch (error: any) {
    console.error("Queue onboarding error:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
});
