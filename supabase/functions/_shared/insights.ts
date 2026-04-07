import OpenAI from "https://esm.sh/openai@4.20.1";

export interface SpeakerSegment {
  speaker: string;
  text: string;
  start?: number;
  end?: number;
  speaker_id?: string;
}

export function isLikelyHallucination(text: string): boolean {
  if (!text || text.trim().length === 0) return true;

  const words = text.trim().toLowerCase().split(/\s+/);
  if (words.length === 0) return true;

  const uniqueWords = new Set(words);
  const uniqueRatio = uniqueWords.size / words.length;

  if (words.length >= 5 && uniqueRatio < 0.2) return true;

  const cleaned = text.trim().toLowerCase().replace(/[.,!?]/g, "");
  const patterns = [
    /^(\s*you\s*)+$/,
    /^(\s*thank you\s*)+$/,
    /^(\s*thanks for watching\s*)+$/,
    /^(\s*please subscribe\s*)+$/,
    /^(\s*bye\s*)+$/,
    /^(\s*so\s*)+$/,
    /^(\s*um\s*)+$/,
    /^(\s*uh\s*)+$/,
    /^(\s*oh\s*)+$/,
    /^(\s*okay\s*)+$/,
  ];
  if (patterns.some((p) => p.test(cleaned))) return true;

  return false;
}

function emptyInsights() {
  return {
    summary_short:
      "No clear speech was detected in this recording. This usually means the meeting audio was too quiet, the microphone was muted, or the recording only captured silence. Try ensuring your microphone is unmuted and meeting participants are audible.",
    summary_detailed: "",
    strategic_insights: [],
    speaker_highlights: [],
    key_points: [],
    action_items: [],
    decisions: [],
    risks: [],
    open_questions: [],
    follow_ups: [],
    timeline_entries: [],
    meeting_metrics: { engagement_score: 0, sentiment_score: 0, speaker_participation: [] },
  };
}

export async function generateInsights(
  openai: OpenAI,
  meeting: Record<string, any>,
  transcript: string,
  speakerSegments: SpeakerSegment[],
) {
  const noUsableTranscript = !transcript || transcript.trim().length < 20;
  if (noUsableTranscript) return emptyInsights();

  const attendeesList = (meeting.attendees || [])
    .map((a: any) => a.displayName || a.email)
    .filter(Boolean);
  const attendeesContext =
    attendeesList.length > 0
      ? `\n\nMEETING PARTICIPANTS:\n${attendeesList.join(", ")}`
      : "";

  const speakerLabeledTranscript =
    speakerSegments.length > 0
      ? speakerSegments.map((s) => `${s.speaker}: ${s.text}`).join("\n")
      : transcript;

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

8. TIMELINE ENTRIES (Timestamped)
   Create a chronological timeline of key moments in the meeting:
   - Topics discussed
   - Key questions raised
   - Decisions made
   - Action items identified
   - Risks mentioned
   Each entry should have an estimated timestamp (in seconds from start).

9. MEETING METRICS
   Analyze the meeting and provide:
   - Engagement score (0-100): How engaged were participants?
   - Sentiment score (-1 to 1): Overall tone of the meeting
   - Speaker participation breakdown if multiple speakers

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
      "outcome": "What success looks like",
      "source_timestamp": 0
    }
  ],
  "decisions": [
    {"decision": "Explicit decision made", "owner": "Who made/owns it or null", "context": "Brief context"}
  ],
  "risks": ["Risk/blocker with who raised it if known"],
  "open_questions": ["Unresolved concerns, dependencies, areas needing clarification"],
  "follow_ups": [
    {"description": "Follow-up action", "assignee": "Person or null", "type": "meeting|research|validation"}
  ],
  "timeline_entries": [
    {"timestamp": 0, "type": "topic|question|decision|action|risk", "content": "What happened", "speaker": "Name or null"}
  ],
  "meeting_metrics": {
    "engagement_score": 75,
    "sentiment_score": 0.5,
    "speaker_participation": [{"speaker": "Name", "percentage": 50, "duration_seconds": 300}]
  }
}`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "You are an expert meeting analyst producing decision-grade insight reports. Extract actionable insights with precision. Speaker labels (SPEAKER_00, SPEAKER_01, etc.) are acoustically verified diarization labels. Use them confidently for attribution. If participant names are available from the attendee list, map SPEAKER_XX IDs to names where context makes it clear. Be conservative with speaker attribution - only attribute when confident. Never invent information. Format decisions as objects with decision, owner, and context fields. Always respond with valid JSON.",
      },
      { role: "user", content: insightsPrompt },
    ],
    response_format: { type: "json_object" },
  });

  const insightsText = completion.choices[0]?.message?.content || "{}";

  try {
    const insights = JSON.parse(insightsText);

    if (insights.decisions && Array.isArray(insights.decisions)) {
      insights.decisions = insights.decisions.map((d: any) => {
        if (typeof d === "object" && d.decision) {
          const owner = d.owner ? ` (${d.owner})` : "";
          const context = d.context ? ` — ${d.context}` : "";
          return `${d.decision}${owner}${context}`;
        }
        return d;
      });
    }

    return insights;
  } catch {
    return {
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
      timeline_entries: [],
      meeting_metrics: {},
    };
  }
}

export async function saveInsights(
  supabase: any,
  meetingId: string,
  insights: Record<string, any>,
) {
  const { data: existingRows } = await supabase
    .from("meeting_insights")
    .select("id")
    .eq("meeting_id", meetingId)
    .limit(1);

  if (!existingRows || existingRows.length === 0) {
    const { error: insertError } = await supabase.from("meeting_insights").insert({
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
      timeline_entries: insights.timeline_entries || [],
      meeting_metrics: insights.meeting_metrics || {},
    });
    if (insertError) {
      console.error(`[saveInsights] Failed to insert insights for meeting ${meetingId}:`, insertError);
      throw new Error(`Failed to save insights: ${insertError.message}`);
    }
  }
}

export async function deliverResults(
  supabase: any,
  meeting: Record<string, any>,
  insights: Record<string, any>,
  config: {
    slackDestination?: any;
    sendEmail?: boolean;
    supabaseUrl: string;
    supabaseServiceKey: string;
  },
) {
  const slackToken = Deno.env.get("SLACK_BOT_TOKEN");
  let slackSent = false;
  let emailSent = false;

  const attendeesList = (meeting.attendees || [])
    .map((a: any) => a.displayName || a.email)
    .filter(Boolean);

  const { data: profile } = await supabase
    .from("profiles")
    .select("slack_connected, slack_channel_id")
    .eq("user_id", meeting.user_id)
    .single();

  let targetChannelId = null;
  if (config.slackDestination) {
    if (config.slackDestination.type === "dm") {
      targetChannelId = profile?.slack_channel_id;
    } else {
      targetChannelId = config.slackDestination.channelId;
    }
  } else if (profile?.slack_connected && profile?.slack_channel_id) {
    targetChannelId = profile.slack_channel_id;
  }

  if (slackToken && targetChannelId) {
    try {
      const endTime = new Date();
      const startTime = new Date(meeting.start_time);
      const durationSeconds = Math.floor(
        (endTime.getTime() - startTime.getTime()) / 1000,
      );
      const durationMinutes = Math.round(durationSeconds / 60);

      const actionItems =
        (insights.action_items || [])
          .map((item: any) => {
            const owner = item.owner ? ` → ${item.owner}` : "";
            const confidence = item.confidence ? ` [${item.confidence}]` : "";
            return `• ${item.task}${owner}${confidence}`;
          })
          .join("\n") || "None identified";

      const decisions =
        (insights.decisions || []).map((d: string) => `• ${d}`).join("\n") ||
        "None identified";

      const strategicInsights =
        (insights.strategic_insights || [])
          .slice(0, 3)
          .map((s: any) => `• ${s.insight}`)
          .join("\n") || "None identified";

      const risksAndQuestions =
        [
          ...(insights.risks || []).map((r: string) => `⚠️ ${r}`),
          ...(insights.open_questions || []).map((q: string) => `❓ ${q}`),
        ]
          .slice(0, 4)
          .join("\n") || "None identified";

      const participantsList =
        attendeesList.length > 0
          ? `*Participants:* ${attendeesList.join(", ")}\n`
          : "";

      const blocks = [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: `📋 ${meeting.title}`,
            emoji: true,
          },
        },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `📅 ${new Date(meeting.start_time).toLocaleDateString()} • ⏱️ ${durationMinutes} min${participantsList ? ` • 👥 ${attendeesList.length} participants` : ""}`,
            },
          ],
        },
        { type: "divider" },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*📝 Executive Summary*\n${insights.summary_short || "No summary available"}`,
          },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*🧠 Strategic Insights*\n${strategicInsights}`,
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
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*⚠️ Risks & Open Questions*\n${risksAndQuestions}`,
          },
        },
      ];

      const slackResponse = await fetch(
        "https://slack.com/api/chat.postMessage",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${slackToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            channel: targetChannelId,
            blocks,
            text: `Meeting Summary: ${meeting.title}`,
          }),
        },
      );

      const slackResult = await slackResponse.json();
      console.log("Slack API response:", JSON.stringify(slackResult));
      slackSent = slackResult.ok;

      await supabase.from("slack_messages").insert({
        meeting_id: meeting.id,
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

  if (config.sendEmail || meeting.source === "chrome-extension") {
    try {
      const emailUrl = `${config.supabaseUrl}/functions/v1/send-meeting-email`;
      const emailResponse = await fetch(emailUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.supabaseServiceKey}`,
        },
        body: JSON.stringify({ meetingId: meeting.id }),
      });

      const emailResult = await emailResponse.json();
      emailSent = emailResult.success === true;
      console.log("Email result:", emailResult);
    } catch (emailError) {
      console.error("Email notification error:", emailError);
    }
  }

  return { slackSent, emailSent };
}
