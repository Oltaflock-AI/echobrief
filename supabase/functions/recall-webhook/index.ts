import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  try {
    const event = await req.json();
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log("Recall webhook event:", event);

    // Find the meeting by recall_bot_id
    const { data: meeting, error: findError } = await supabase
      .from("meetings")
      .select("*")
      .eq("recall_bot_id", event.bot_id)
      .single();

    if (findError) {
      console.error("Meeting not found:", findError);
      return new Response(JSON.stringify({ error: "Meeting not found" }), { status: 404 });
    }

    // Update meeting with recording details
    const updateData: any = {
      status: event.status || "completed",
      recording_url: event.video_url,
      duration_seconds: event.duration_seconds,
      updated_at: new Date().toISOString(),
    };

    if (event.transcript) {
      updateData.transcript = event.transcript;
    }

    const { error: updateError } = await supabase
      .from("meetings")
      .update(updateData)
      .eq("recall_bot_id", event.bot_id);

    if (updateError) {
      console.error("Update error:", updateError);
      throw updateError;
    }

    // If recording completed, trigger summary generation
    if (event.status === "completed" && event.transcript) {
      // Call generate-meeting-summary function
      const summaryResponse = await fetch(`${supabaseUrl}/functions/v1/generate-meeting-summary`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          meeting_id: meeting.id,
          transcript: event.transcript,
          user_id: meeting.user_id,
        }),
      });

      if (!summaryResponse.ok) {
        console.error("Summary generation failed:", summaryResponse.statusText);
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error("Webhook error:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
});
