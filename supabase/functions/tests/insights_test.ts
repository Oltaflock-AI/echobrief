/**
 * Unit harness: insight transcript formatting and JSON normalisation.
 * Run: deno test -A supabase/functions/tests/insights_test.ts
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  formatClock,
  formatLabeledTranscript,
  normalizeInsights,
  coerceTimestamp,
  type SpeakerSegment,
} from "../_shared/insights.ts";

const segs: SpeakerSegment[] = [
  { speaker: "Asha", text: "We ship Friday.", start: 8.4, end: 14 },
  { speaker: "Vikram", text: "Agreed.", start: 52.5, end: 56 },
];

Deno.test("formatClock is m:ss from the start of the meeting", () => {
  assertEquals(formatClock(0), "[0:00]");
  assertEquals(formatClock(8.4), "[0:08]");
  assertEquals(formatClock(75), "[1:15]");
});

Deno.test("labeled transcript carries the real segment clock", () => {
  assertEquals(
    formatLabeledTranscript(segs, "fallback"),
    "[0:08] Asha: We ship Friday.\n[0:52] Vikram: Agreed.",
  );
  assertEquals(formatLabeledTranscript([], "plain"), "plain");
});

Deno.test("coerceTimestamp passes an anchored timestamp through and floors junk", () => {
  // It must NOT move the value: facts.ts already anchored it onto the segment
  // its quote came from, and rounding it onto a "nearby" segment is what made
  // an invented timestamp look measured.
  assertEquals(coerceTimestamp(3386), 3386);
  assertEquals(coerceTimestamp(10.6), 11);
  assertEquals(coerceTimestamp(-1), 0);
  assertEquals(coerceTimestamp("nope"), 0);
});

Deno.test("normalizeInsights drops empty rows and guessed talk-time", () => {
  const out = normalizeInsights(
    {
      summary_short: "  Ship Friday.  ",
      summary_detailed: "Asha and Vikram agreed.",
      key_points: ["Ship Friday", "  ", ""],
      action_items: [
        {
          task: "Ship the fix",
          owner: "Vikram",
          due_date: "Friday",
          priority: "high",
          confidence: "high",
          source_timestamp: 10,
        },
        { task: "   " },
        "Book interviews",
      ],
      decisions: [{ decision: "Ship Friday", owner: "Asha", context: "demo is locked" }],
      risks: [],
      open_questions: [""],
      follow_ups: [{ description: "" }],
      strategic_insights: [{ insight: "", category: "market" }],
      speaker_highlights: [{ speaker: "Asha", highlight: "We ship Friday.", context: "deadline" }],
      timeline_entries: [
        { timestamp: 50, type: "decision", content: "Ship Friday", speaker: "Asha" },
        { timestamp: 0, type: "topic", content: "" },
      ],
      meeting_metrics: { sentiment_score: 0.4, engagement_score: 80, duration_seconds: 300 },
    },
    segs,
  );

  assertEquals(out.summary_short, "Ship Friday.");
  assertEquals(out.key_points, ["Ship Friday"]);
  assertEquals((out.action_items as unknown[]).length, 2);
  // Carried through, not snapped onto the nearest segment: the value the
  // pipeline hands over is already anchored to a real utterance.
  assertEquals((out.action_items as { source_timestamp: number }[])[0].source_timestamp, 10);
  assertEquals((out.action_items as { due_date: string }[])[0].due_date, "Friday");
  assertEquals(out.decisions, ["Ship Friday (Asha) — demo is locked"]);
  assertEquals(out.open_questions, []);
  assertEquals(out.strategic_insights, []);
  assertEquals((out.timeline_entries as { timestamp: number }[])[0].timestamp, 50);
  assertEquals(out.meeting_metrics, { sentiment_score: 0.4 });
});

Deno.test("normalizeInsights clamps sentiment and drops non-numeric", () => {
  assertEquals(
    normalizeInsights({ meeting_metrics: { sentiment_score: 4 } }, []).meeting_metrics,
    { sentiment_score: 1 },
  );
  assertEquals(
    normalizeInsights({ meeting_metrics: { sentiment_score: "warm" } }, []).meeting_metrics,
    {},
  );
});
