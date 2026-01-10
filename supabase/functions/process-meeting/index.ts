import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://esm.sh/openai@4.20.1";
import { getCorsHeaders, handleCorsPrelight } from "../_shared/cors.ts";

interface SpeakerSegment {
  speaker: string;
  text: string;
  start?: number;
  end?: number;
}

serve(async (req) => {
  const corsResponse = handleCorsPrelight(req);
  if (corsResponse) return corsResponse;

  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  try {
    const { meetingId, slackDestination } = await req.json();
    
    if (!meetingId) {
      return new Response(
        JSON.stringify({ error: "Meeting ID is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");

    if (!openaiApiKey) {
      return new Response(
        JSON.stringify({ error: "OpenAI API key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const openai = new OpenAI({ apiKey: openaiApiKey });

    // Get meeting details
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

    // Update status to processing
    await supabase
      .from("meetings")
      .update({ status: "processing" })
      .eq("id", meetingId);

    let transcript = "";
    let speakerSegments: SpeakerSegment[] = [];
    let wordTimestamps: any[] = [];

    // If there's an audio file, transcribe it with speaker detection
    if (meeting.audio_url) {
      try {
        // Download the audio file
        const { data: audioData, error: downloadError } = await supabase.storage
          .from("recordings")
          .download(meeting.audio_url.replace("recordings/", ""));

        if (downloadError) {
          console.error("Audio download error:", downloadError);
          throw new Error("Failed to download audio file");
        }

        // Convert to File for OpenAI
        const audioFile = new File([audioData], "audio.webm", { type: "audio/webm" });

        // Transcribe with Whisper - using verbose_json for timestamps
        const transcription = await openai.audio.transcriptions.create({
          file: audioFile,
          model: "whisper-1",
          language: "en",
          response_format: "verbose_json",
        });

        transcript = transcription.text;
        wordTimestamps = (transcription as any).words || [];

        // Extract segments for speaker attribution
        const segments = (transcription as any).segments || [];
        
        // Format attendees for speaker matching
        const attendeesList = (meeting.attendees || [])
          .map((a: any) => a.displayName || a.email?.split('@')[0])
          .filter(Boolean);

        // Use AI to attribute speakers to segments
        if (segments.length > 0 && attendeesList.length > 0) {
          const speakerPrompt = `Given a meeting with these participants: ${attendeesList.join(', ')}

Analyze these transcript segments and identify which participant is most likely speaking in each segment based on context, speaking style, and content. If you can't confidently identify a speaker, use "Speaker 1", "Speaker 2", etc.

Segments:
${segments.map((s: any, i: number) => `[${i}] "${s.text}"`).join('\n')}

Respond with a JSON array where each element has:
- "segment_index": the segment number
- "speaker": the participant name or "Speaker N"
- "confidence": "high", "medium", or "low"

Only include segments where you can make a reasonable attribution.`;

          try {
            const speakerAttribution = await openai.chat.completions.create({
              model: "gpt-4o-mini",
              messages: [
                {
                  role: "system",
                  content: "You are an expert at identifying speakers in meeting transcripts. Be conservative - only attribute speakers when you're reasonably confident."
                },
                { role: "user", content: speakerPrompt }
              ],
              response_format: { type: "json_object" },
            });

            const attributionText = speakerAttribution.choices[0]?.message?.content || "{}";
            const attributions = JSON.parse(attributionText);
            const attributionMap = new Map();
            
            if (Array.isArray(attributions.speakers)) {
              attributions.speakers.forEach((a: any) => {
                if (a.confidence !== "low") {
                  attributionMap.set(a.segment_index, a.speaker);
                }
              });
            }

            // Build speaker segments with attribution
            speakerSegments = segments.map((s: any, i: number) => ({
              speaker: attributionMap.get(i) || `Speaker ${(i % 2) + 1}`,
              text: s.text,
              start: s.start,
              end: s.end,
            }));
          } catch (speakerError) {
            console.error("Speaker attribution error:", speakerError);
            // Fallback to alternating speakers
            speakerSegments = segments.map((s: any, i: number) => ({
              speaker: `Speaker ${(i % 2) + 1}`,
              text: s.text,
              start: s.start,
              end: s.end,
            }));
          }
        }

        // Check if transcript already exists for this meeting
        const { data: existingTranscript } = await supabase
          .from("transcripts")
          .select("id")
          .eq("meeting_id", meetingId)
          .single();

        if (!existingTranscript) {
          // Save transcript with speaker segments
          await supabase.from("transcripts").insert({
            meeting_id: meetingId,
            content: transcript,
            speakers: speakerSegments,
            word_timestamps: wordTimestamps,
          });
        }
      } catch (transcribeError) {
        console.error("Transcription error:", transcribeError);
        transcript = "Transcription failed. Please check the audio file.";
      }
    }

    // Format attendees for the AI prompt
    const attendeesList = (meeting.attendees || [])
      .map((a: any) => a.displayName || a.email)
      .filter(Boolean);
    const attendeesContext = attendeesList.length > 0 
      ? `\n\nMEETING PARTICIPANTS:\n${attendeesList.join(', ')}`
      : '';

    // Build transcript with speaker labels for better AI analysis
    const speakerLabeledTranscript = speakerSegments.length > 0
      ? speakerSegments.map(s => `${s.speaker}: ${s.text}`).join('\n')
      : transcript;

    // Generate decision-grade AI insights with enhanced prompt
    const insightsPrompt = `You are an intelligent chief-of-staff analyzing a meeting transcript. Your goal is to produce a decision-grade insight report that provides clarity, ownership, risk awareness, and next steps — not just meeting notes.

MEETING TITLE: ${meeting.title}${attendeesContext}

TRANSCRIPT (with speaker labels where available):
${speakerLabeledTranscript || "No transcript available"}

---

CRITICAL ACCURACY RULES:
- Do NOT invent insights or add information not in the transcript
- Do NOT assign ownership unless explicitly stated or strongly implied
- Prefer "Open Question" over speculation
- Accuracy > completeness
- Only list EXPLICIT decisions where consensus was clearly stated

---

Provide a comprehensive analysis with the following structure:

1. EXECUTIVE SUMMARY (3-5 sentences)
   Focus on: Why the meeting happened, what materially changed, what happens next.
   Do NOT repeat the agenda.

2. STRATEGIC INSIGHTS
   Key implications for the business, signals about market direction/risk/opportunity, non-obvious takeaways inferred from discussion.
   This requires reasoning, not transcription.

3. SPEAKER-ATTRIBUTED HIGHLIGHTS
   Clean speaker-attributed insights with short context for why it matters.
   Format: "Speaker Name: [What they said/emphasized] — [Why it matters]"

4. ACTION ITEMS (Execution-Ready)
   Each must have:
   - Clear task description
   - Owner (only if explicitly stated or strongly implied, otherwise null)
   - Priority (high/medium/low)
   - Confidence level (high/medium/low) - only assign when discussion was clear
   - Outcome expected (what success looks like)
   Avoid guessing deadlines.

5. DECISIONS & COMMITMENTS (Strict)
   Only list explicit decisions where consensus was clearly stated.
   Include decision owner if applicable.

6. RISKS, OPEN QUESTIONS & BLOCKERS
   - Unresolved concerns
   - Dependencies
   - Areas needing clarification
   This helps prevent false alignment.

7. FOLLOW-UPS & NEXT TOUCHPOINTS
   Only include if justified by the conversation:
   - Follow-up meetings
   - Research tasks
   - Decisions that need validation

---

Format your response as JSON with this exact structure:
{
  "summary_short": "3-5 sentence executive brief focusing on why the meeting happened, what changed, and what happens next",
  "summary_detailed": "Detailed summary with speaker attribution where relevant",
  "strategic_insights": [
    {"insight": "Key business implication or non-obvious takeaway", "category": "market|risk|opportunity|process"}
  ],
  "speaker_highlights": [
    {"speaker": "Name", "highlight": "What they said/emphasized", "context": "Why it matters"}
  ],
  "key_points": ["Main discussion points with speaker attribution where clear"],
  "action_items": [
    {
      "task": "Clear task description with expected outcome",
      "owner": "Person name or null",
      "priority": "high|medium|low",
      "confidence": "high|medium|low",
      "outcome": "What success looks like"
    }
  ],
  "decisions": [
    {"decision": "Explicit decision made", "owner": "Who made/owns it or null", "context": "Brief context"}
  ],
  "risks": ["Risk/blocker with who raised it if known"],
  "open_questions": ["Unresolved concerns, dependencies, areas needing clarification"],
  "follow_ups": [
    {"description": "Follow-up action", "assignee": "Person or null", "type": "meeting|research|validation"}
  ]
}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are an expert meeting analyst producing decision-grade insight reports. Extract actionable insights with precision. Be conservative with speaker attribution - only attribute when confident. Never invent information. Format decisions as objects with decision, owner, and context fields. Always respond with valid JSON.",
        },
        { role: "user", content: insightsPrompt },
      ],
      response_format: { type: "json_object" },
    });

    const insightsText = completion.choices[0]?.message?.content || "{}";
    let insights;
    
    try {
      insights = JSON.parse(insightsText);
      
      // Normalize decisions to string format for backward compatibility
      if (insights.decisions && Array.isArray(insights.decisions)) {
        insights.decisions = insights.decisions.map((d: any) => {
          if (typeof d === 'object' && d.decision) {
            const owner = d.owner ? ` (${d.owner})` : '';
            const context = d.context ? ` — ${d.context}` : '';
            return `${d.decision}${owner}${context}`;
          }
          return d;
        });
      }
    } catch {
      insights = {
        summary_short: "Unable to generate summary",
        summary_detailed: "",
        strategic_insights: [],
        speaker_highlights: [],
        key_points: [],
        action_items: [],
        decisions: [],
        risks: [],
        open_questions: [],
        follow_ups: [],
      };
    }

    // Check if insights already exist for this meeting
    const { data: existingInsights } = await supabase
      .from("meeting_insights")
      .select("id")
      .eq("meeting_id", meetingId)
      .single();

    if (!existingInsights) {
      // Save insights only if they don't exist
      await supabase.from("meeting_insights").insert({
        meeting_id: meetingId,
        summary_short: insights.summary_short || "",
        summary_detailed: insights.summary_detailed || "",
        key_points: insights.key_points || [],
        action_items: insights.action_items || [],
        decisions: insights.decisions || [],
        risks: insights.risks || [],
        follow_ups: insights.follow_ups || [],
        strategic_insights: insights.strategic_insights || [],
        open_questions: insights.open_questions || [],
        speaker_highlights: insights.speaker_highlights || [],
      });
    }

    // Calculate duration if we have end_time
    const endTime = new Date();
    const startTime = new Date(meeting.start_time);
    const durationSeconds = Math.floor((endTime.getTime() - startTime.getTime()) / 1000);

    // Update meeting status to completed
    await supabase
      .from("meetings")
      .update({
        status: "completed",
        end_time: endTime.toISOString(),
        duration_seconds: durationSeconds,
      })
      .eq("id", meetingId);

    // Handle Slack delivery based on user choice
    let slackSent = false;
    const slackToken = Deno.env.get("SLACK_BOT_TOKEN");
    
    // Get user profile for Slack settings
    const { data: profile } = await supabase
      .from("profiles")
      .select("slack_connected, slack_channel_id")
      .eq("user_id", meeting.user_id)
      .single();

    // Determine target channel
    let targetChannelId = null;
    if (slackDestination) {
      // User chose where to send
      if (slackDestination.type === 'dm') {
        // For DM, we'd need the user's Slack ID - use default channel for now
        targetChannelId = profile?.slack_channel_id;
      } else {
        targetChannelId = slackDestination.channelId;
      }
    } else if (profile?.slack_connected && profile?.slack_channel_id) {
      // Default to saved channel
      targetChannelId = profile.slack_channel_id;
    }

    console.log("Slack delivery:", { targetChannelId, slackDestination, hasToken: !!slackToken });
    
    if (slackToken && targetChannelId) {
      try {
        // Format enhanced Slack message
        const actionItems = (insights.action_items || [])
          .map((item: any) => {
            const owner = item.owner ? ` → ${item.owner}` : "";
            const confidence = item.confidence ? ` [${item.confidence}]` : "";
            return `• ${item.task}${owner}${confidence}`;
          })
          .join("\n") || "None identified";

        const decisions = (insights.decisions || [])
          .map((d: string) => `• ${d}`)
          .join("\n") || "None identified";

        const strategicInsights = (insights.strategic_insights || [])
          .slice(0, 3)
          .map((s: any) => `• ${s.insight}`)
          .join("\n") || "None identified";

        const risksAndQuestions = [
          ...(insights.risks || []).map((r: string) => `⚠️ ${r}`),
          ...(insights.open_questions || []).map((q: string) => `❓ ${q}`),
        ].slice(0, 4).join("\n") || "None identified";

        const durationMinutes = Math.round(durationSeconds / 60);
        const participantsList = attendeesList.length > 0 
          ? `*Participants:* ${attendeesList.join(', ')}\n` 
          : '';

        const blocks = [
          {
            type: "header",
            text: { type: "plain_text", text: `📋 ${meeting.title}`, emoji: true },
          },
          {
            type: "context",
            elements: [
              { type: "mrkdwn", text: `📅 ${new Date(meeting.start_time).toLocaleDateString()} • ⏱️ ${durationMinutes} min${participantsList ? ` • 👥 ${attendeesList.length} participants` : ''}` }
            ],
          },
          { type: "divider" },
          {
            type: "section",
            text: { type: "mrkdwn", text: `*📝 Executive Summary*\n${insights.summary_short || "No summary available"}` }
          },
          {
            type: "section",
            text: { type: "mrkdwn", text: `*🧠 Strategic Insights*\n${strategicInsights}` }
          },
          {
            type: "section",
            text: { type: "mrkdwn", text: `*✅ Action Items*\n${actionItems}` }
          },
          {
            type: "section",
            text: { type: "mrkdwn", text: `*📋 Decisions*\n${decisions}` }
          },
          {
            type: "section",
            text: { type: "mrkdwn", text: `*⚠️ Risks & Open Questions*\n${risksAndQuestions}` }
          },
        ];

        const slackResponse = await fetch("https://slack.com/api/chat.postMessage", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${slackToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            channel: targetChannelId,
            blocks,
            text: `Meeting Summary: ${meeting.title}`,
          }),
        });

        const slackResult = await slackResponse.json();
        console.log("Slack API response:", JSON.stringify(slackResult));
        slackSent = slackResult.ok;

        // Log Slack message
        await supabase.from("slack_messages").insert({
          meeting_id: meetingId,
          channel_id: targetChannelId,
          status: slackResult.ok ? "sent" : "failed",
          message_ts: slackResult.ts || null,
          sent_at: slackResult.ok ? new Date().toISOString() : null,
          error_message: slackResult.ok ? null : slackResult.error,
        });
      } catch (slackError) {
        console.error("Slack notification error:", slackError);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        meetingId,
        hasTranscript: !!transcript,
        hasInsights: true,
        hasSpeakerSegments: speakerSegments.length > 0,
        slackSent,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Process meeting error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
