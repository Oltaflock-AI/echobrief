import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPrelight } from "../_shared/cors.ts";

serve(async (req) => {
  const corsResponse = handleCorsPrelight(req);
  if (corsResponse) return corsResponse;

  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  try {
    // Verify user authorization
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Authorization required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid user token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { channelId } = await req.json();

    if (!channelId) {
      return new Response(
        JSON.stringify({ error: "Channel ID is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify user owns this Slack channel configuration
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("slack_channel_id")
      .eq("user_id", user.id)
      .single();

    if (profileError || !profile || profile.slack_channel_id !== channelId) {
      return new Response(
        JSON.stringify({ error: "You can only test your own Slack channel" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const slackToken = Deno.env.get("SLACK_BOT_TOKEN");
    if (!slackToken) {
      return new Response(
        JSON.stringify({ error: "Slack bot token not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Send test message to Slack
    const blocks = [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "🎉 EchoBrief Connected!",
          emoji: true,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "Your Slack integration is working perfectly! Meeting summaries will be sent to this channel.",
        },
      },
      {
        type: "divider",
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*What happens next?*\nAfter each meeting recording, you'll receive:\n• 📝 Meeting summary\n• 🎯 Key points\n• ✅ Action items with owners\n• 📋 Decisions made",
        },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `Sent from EchoBrief • ${new Date().toLocaleString()}`,
          },
        ],
      },
    ];

    const slackResponse = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${slackToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        channel: channelId,
        blocks,
        text: "EchoBrief is now connected! Meeting summaries will be sent here.",
      }),
    });

    const slackResult = await slackResponse.json();

    if (!slackResult.ok) {
      return new Response(
        JSON.stringify({ error: `Slack error: ${slackResult.error}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, message: "Test message sent successfully!" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Test Slack connection error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
