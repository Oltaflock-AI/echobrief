/**
 * The post-transcription sequence, shared by sarvam-webhook, process-meeting
 * and regenerate-insights so the three cannot drift:
 *
 *   speaker overrides → language tags + mix → leaked-Devanagari translation →
 *   entity correction → boundary zones (speech-estimated, LLM fallback) →
 *   two-pass insights on the meeting zone → metrics (zone-shifted) →
 *   validation ∥ coaching
 *
 * Persistence stays at the call sites (they differ: insert vs update), but the
 * `meetingPatch` helper builds the meetings-row update for all of them, and
 * `afterInsightsSaved` runs the shared hooks (contacts, observers, workspace
 * auto-share, automation webhook, Slack, Zoho).
 */
import OpenAI from "https://esm.sh/openai@4.20.1";
import { generateInsights, SpeakerSegment, formatLabeledTranscript } from "./insights.ts";
import { validateInsights } from "./facts.ts";
import { computeConversationMetrics, mergeMeetingMetrics } from "./metrics.ts";
import { annotateZones, Boundaries, computeBoundaries, externalAttendees, guardBoundaries, meetingZone, ownerDomain } from "./zones.ts";
import { annotateLanguages, languageMix } from "./language.ts";
import { translateLeakedSegments } from "./translate-leaks.ts";
import { buildVocabulary, correctEntities, EntityCorrection } from "./vocab.ts";
import { generateCoaching } from "./coaching.ts";
import { applySpeakerOverrides } from "./rename.ts";
import { estimateBoundariesWithLLM } from "./boundary-llm.ts";
import { upsertMeetingContacts } from "./contacts.ts";
import { grantMeetingObservers } from "./observers.ts";
import { autoShareToOrg } from "./org-share.ts";
import { notifyInsightsReady } from "./webhooks.ts";
import { deliverToSlack } from "./slack-delivery.ts";
import { deliverToZoho } from "./zoho-delivery.ts";
import { recordRecordedSeconds } from "./entitlements.ts";
import type { SpeakerTimelineEntry } from "./recall-pipeline.ts";
import { meterOpenAI, newCostMeter, saveCosts } from "./cost.ts";

export interface PostTranscriptionInput {
  supabase: any;
  openai: OpenAI;
  meeting: Record<string, any>;
  /** Raw transcript text (used only when there are no segments). */
  transcript: string;
  segments: SpeakerSegment[];
  recallTimeline: SpeakerTimelineEntry[];
  durationSeconds: number;
  /**
   * True when this run is rebuilding insights from a STORED transcript. It pays
   * the LLM chain again but no audio cost, and conflating the two would make
   * regenerations look like ordinary meetings in the margin numbers.
   */
  regenerated?: boolean;
}

export interface PostTranscriptionResult {
  zonedSegments: Array<SpeakerSegment & { zone: string; language: string }>;
  correctedTranscript: string;
  languages: Record<string, number>;
  boundaries: Boundaries;
  entityCorrections: EntityCorrection[];
  insights: Record<string, any>;
}

export async function runPostTranscription(
  input: PostTranscriptionInput,
): Promise<PostTranscriptionResult> {
  const { supabase, meeting, durationSeconds } = input;
  const config = meeting.processing_config || {};

  // Every LLM call below — leak translation, facts, synthesis, validation,
  // coaching, boundary estimation — goes through this wrapper, so token counts
  // are captured without any of those modules knowing about cost. The meter is
  // per-call, not module-level: isolates serve concurrent requests and a shared
  // accumulator would bill one meeting's tokens to another.
  const meter = newCostMeter(meeting.id);
  const openai = meterOpenAI(input.openai, meter);

  const { data: ownerProfile } = await supabase
    .from("profiles")
    .select("custom_vocabulary, summary_language")
    .eq("user_id", meeting.user_id)
    .maybeSingle();
  const vocabulary = buildVocabulary(meeting.attendees ?? [], ownerProfile?.custom_vocabulary ?? []);

  // 0. Manual speaker re-labels survive a regeneration.
  const withOverrides = applySpeakerOverrides(input.segments, config.speaker_overrides);

  // 1. Language tags + mix reflect what was SPOKEN (before translation).
  const languageTagged = annotateLanguages(withOverrides);
  const languages = languageMix(languageTagged);
  const translated = await translateLeakedSegments(openai, languageTagged);

  // 2. Entity correction, logged.
  const entityCorrections: EntityCorrection[] = [];
  const corrected = translated.map((seg) => {
    const fixed = correctEntities(seg.text, vocabulary);
    entityCorrections.push(...fixed.corrections);
    return { ...seg, text: fixed.text };
  });
  if (entityCorrections.length > 0) {
    console.log(
      `[post-transcription] Entity corrections: ${entityCorrections.slice(0, 10).map((c) => `${c.from}→${c.to}`).join(", ")}${entityCorrections.length > 10 ? ` (+${entityCorrections.length - 10} more)` : ""}`,
    );
  }

  // 3. Boundary zones — speech-estimated from the Recall timeline, LLM fallback
  //    when guests exist but never matched the timeline.
  let boundaries = computeBoundaries(meeting.attendees ?? [], input.recallTimeline);
  if (boundaries.source === "none" && !boundaries.internal_only && corrected.length > 0) {
    const guests = externalAttendees(meeting.attendees ?? [], ownerDomain(meeting.attendees ?? []))
      .map((a) => a.displayName || a.email)
      .filter(Boolean)
      .join(", ");
    const lastEnd = corrected.reduce((m, s) => Math.max(m, Number(s.end) || 0), 0);
    const llm = await estimateBoundariesWithLLM(
      openai,
      formatLabeledTranscript(corrected, ""),
      guests || "the external participant",
      lastEnd,
    );
    if (llm) boundaries = llm;
  }
  boundaries = guardBoundaries(boundaries, corrected);
  const zonedSegments = annotateZones(corrected, boundaries);
  const insightSegments = meetingZone(zonedSegments);
  const trimmed = zonedSegments.length - insightSegments.length;
  if (trimmed > 0) {
    console.log(
      `[post-transcription] Boundary trim (${boundaries.source}): ${trimmed} of ${zonedSegments.length} segments are internal pre/post chatter (window ${boundaries.first_external_join_ts}s–${boundaries.last_external_leave_ts}s)`,
    );
  }
  const correctedTranscript = zonedSegments.length > 0
    ? zonedSegments.map((s) => s.text).join(" ")
    : correctEntities(input.transcript, vocabulary).text;
  const insightTranscript = insightSegments.length > 0
    ? insightSegments.map((s) => s.text).join(" ")
    : correctedTranscript;
  const analysisSegments = insightSegments.length > 0 ? insightSegments : withOverrides;

  // 4. Two-pass insights on the meeting zone (validation deferred to run ∥ coaching).
  const insights = await generateInsights(openai, meeting, insightTranscript, analysisSegments, {
    vocabulary,
    skipValidation: true,
    summaryLanguage: ownerProfile?.summary_language === "hi" ? "hi" : "en",
  });

  // 5. Metrics against the external-facing window.
  const zoneStart = boundaries.first_external_join_ts ?? 0;
  const zoneEnd = boundaries.last_external_leave_ts !== null
    ? Math.min(boundaries.last_external_leave_ts, durationSeconds || Infinity)
    : durationSeconds;
  const metricsDuration = Math.max(0, Math.round((zoneEnd || durationSeconds) - zoneStart)) || durationSeconds;
  const metricsSegments = analysisSegments.map((s) => ({
    ...s,
    start: Math.max(0, Number(s.start ?? 0) - zoneStart),
    end: Math.max(0, Number(s.end ?? 0) - zoneStart),
  }));
  insights.meeting_metrics = mergeMeetingMetrics(
    insights.meeting_metrics,
    computeConversationMetrics(metricsSegments, metricsDuration),
  );

  // 6. Validation and coaching are independent — run them together.
  const [validation, coaching] = await Promise.all([
    insights.facts
      ? validateInsights(openai, insights.facts, insights).catch((err) => {
        console.warn("[post-transcription] validation failed (non-fatal):", err);
        return null;
      })
      : Promise.resolve(null),
    generateCoaching(openai, meeting, insights.facts ?? null, insights.meeting_metrics, analysisSegments),
  ]);
  if (validation && insights.facts) {
    insights.facts.validation = validation;
    if (validation.unverified.length > 0) {
      console.warn(`[post-transcription] ${validation.unverified.length} claim(s) failed grounding (rate ${validation.grounding_rate})`);
    }
  }
  insights.coaching = coaching;

  // Recorded after the work, so a run that failed halfway does not claim the
  // cost of one that finished. Never throws: losing a cost row must not fail a
  // meeting that otherwise succeeded.
  await saveCosts(supabase, meter, {
    recallSeconds: durationSeconds,
    sttSeconds: input.regenerated ? 0 : durationSeconds,
    sttProvider: (config.transcription_provider as string) ?? (config.used_whisper ? "whisper" : "sarvam"),
    regenerated: input.regenerated === true,
  });

  return { zonedSegments, correctedTranscript, languages, boundaries, entityCorrections, insights };
}

/** The meetings-row patch every call site writes after the passes. */
export function meetingPatch(
  result: PostTranscriptionResult,
  baseConfig: Record<string, unknown>,
  extraConfig: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    languages: Object.keys(result.languages).length > 0 ? result.languages : null,
    boundaries: result.boundaries,
    processing_config: {
      ...baseConfig,
      ...extraConfig,
      ...(result.entityCorrections.length > 0
        ? { entity_corrections: result.entityCorrections.slice(0, 50) }
        : {}),
    },
  };
}

/** Contacts + automation webhook. Runs after the insights row exists. */
export async function afterInsightsSaved(
  supabase: any,
  meeting: Record<string, any>,
  insights: Record<string, any>,
  eventType = "meeting.insights_ready",
  /**
   * Recorded duration, for the usage ledger. Pass it from the completion path
   * that just computed it; regeneration omits it because the meeting was
   * already ledgered when it first completed.
   */
  durationSeconds?: number,
): Promise<void> {
  await upsertMeetingContacts(supabase, meeting);
  // Allowlisted reviewers who were on the invite get the meeting in their own
  // dashboard, not just the summary mail. Idempotent and non-throwing, and it
  // runs on regeneration too so a meeting reprocessed after a reviewer was
  // added still reaches them.
  await grantMeetingObservers(supabase, meeting);
  // "Share my meetings with my workspace automatically." Only on first
  // completion: a regeneration must not resurrect a share the owner had
  // deliberately removed. Never throws.
  if (eventType === "meeting.insights_ready") {
    await autoShareToOrg(supabase, meeting);
  }
  await notifyInsightsReady(supabase, meeting, insights, eventType);
  // Slack posts on regeneration too, which is why `deliverToSlack` claims a row
  // in `slack_deliveries` before it posts: the claim, not this call site, is
  // what stops a three-week-old meeting reappearing in a team channel. It never
  // throws — the insights are already saved and a Slack outage must not undo
  // that.
  await deliverToSlack(supabase, meeting, insights);
  // Zoho writes ONE note per matched CRM record, claimed in zoho_deliveries
  // first for the same reason as Slack — and a sharper one: a Contact carrying
  // four identical notes discredits every other thing the product writes.
  // Never throws.
  await deliverToZoho(supabase, meeting, insights);
  if (durationSeconds !== undefined) {
    await recordRecordedSeconds(supabase, meeting.user_id, meeting.id, durationSeconds);
  }
}
