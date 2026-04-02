import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
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
    const { meeting_id, transcript, user_id } = await req.json();
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Generate summary using GPT-4o-mini
    const summaryPrompt = `You are a meeting summarization expert. Analyze this meeting transcript and provide:
1. A brief executive summary (2-3 sentences)
2. Key decisions made
3. Action items with owners
4. Key metrics or numbers mentioned
5. Next steps

Transcript:
${transcript}

Respond in JSON format with keys: summary, decisions, action_items, key_metrics, next_steps`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'user', content: summaryPrompt },
        ],
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      throw new Error('OpenAI API error');
    }

    const aiResult = await response.json();
    const aiContent = aiResult.choices[0].message.content;
    let parsedSummary;

    try {
      parsedSummary = JSON.parse(aiContent);
    } catch {
      parsedSummary = { summary: aiContent };
    }

    // Update meeting with summary
    const { error: updateError } = await supabase
      .from('meetings')
      .update({
        summary: parsedSummary.summary,
        action_items: parsedSummary.action_items,
        status: 'completed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', meeting_id);

    if (updateError) throw updateError;

    // Get user email
    const { data: profile } = await supabase
      .from('profiles')
      .select('email')
      .eq('user_id', user_id)
      .single();

    // Get meeting details
    const { data: meeting } = await supabase
      .from('meetings')
      .select('*')
      .eq('id', meeting_id)
      .single();

    // Send email with summary
    if (profile?.email) {
      await fetch(`${supabaseUrl}/functions/v1/send-meeting-summary-email`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: profile.email,
          meeting_title: meeting?.title || 'Meeting Summary',
          summary: parsedSummary.summary,
          action_items: parsedSummary.action_items,
          recording_url: meeting?.recording_url,
        }),
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error("Summary generation error:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
});
