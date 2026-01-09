import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPrelight } from "../_shared/cors.ts";

serve(async (req) => {
  const corsResponse = handleCorsPrelight(req);
  if (corsResponse) return corsResponse;

  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  try {
    const { meetingId, channelId } = await req.json();

    if (!meetingId || !channelId) {
      return new Response(
        JSON.stringify({ error: "Meeting ID and Channel ID are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const slackToken = Deno.env.get("SLACK_BOT_TOKEN");
    if (!slackToken) {
      return new Response(
        JSON.stringify({ error: "Slack bot token not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
      return new Response(
        JSON.stringify({ error: "Meeting not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: insights } = await supabase
      .from("meeting_insights")
      .select("*")
      .eq("meeting_id", meetingId)
      .single();

    // Format Slack message
    const actionItems = (insights?.action_items as any[] || [])
      .map((item: any) => `• ${item.task}${item.owner ? ` (@${item.owner})` : ""}`)
      .join("\n") || "None identified";

    const decisions = (insights?.decisions as string[] || [])
      .map((d: string) => `• ${d}`)
      .join("\n") || "None identified";

    const keyPoints = (insights?.key_points as string[] || [])
      .slice(0, 5)
      .map((p: string) => `• ${p}`)
      .join("\n") || "None identified";

    const durationMinutes = meeting.duration_seconds 
      ? Math.round(meeting.duration_seconds / 60) 
      : 0;

    const blocks = [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `📝 Meeting Summary: ${meeting.title}`,
          emoji: true,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Duration:* ${durationMinutes} minutes\n*Date:* ${new Date(meeting.start_time).toLocaleDateString()}`,
        },
      },
      {
        type: "divider",
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Summary*\n${insights?.summary_short || "No summary available"}`,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*🎯 Key Points*\n${keyPoints}`,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*✅ Action Items*\n${actionItems}`,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*📋 Decisions*\n${decisions}`,
        },
      },
    ];

    // Send to Slack
    const slackResponse = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${slackToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        channel: channelId,
        blocks,
        text: `Meeting Summary: ${meeting.title}`, // Fallback text
      }),
    });

    const slackResult = await slackResponse.json();

    if (!slackResult.ok) {
      // Log the message as failed
      await supabase.from("slack_messages").insert({
        meeting_id: meetingId,
        channel_id: channelId,
        status: "failed",
        error_message: slackResult.error,
      });

      return new Response(
        JSON.stringify({ error: `Slack API error: ${slackResult.error}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Log successful message
    await supabase.from("slack_messages").insert({
      meeting_id: meetingId,
      channel_id: channelId,
      status: "sent",
      message_ts: slackResult.ts,
      sent_at: new Date().toISOString(),
    });

    return new Response(
      JSON.stringify({ success: true, messageTs: slackResult.ts }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Send Slack message error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
