/**
 * Meeting duration resolution.
 *
 * The bug: `end_time` is written when the PIPELINE finishes, not when the call
 * did, so a meeting recovered days later took the whole gap as its duration.
 * Two "Daily Sync Meeting" rows carried 197.6 h and 269.7 h — eight and eleven
 * days for a half-hour standup (found 2026-09-09).
 */
import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  MAX_PLAUSIBLE_DURATION_SECONDS,
  resolveDurationSeconds,
} from "../_shared/duration.ts";

const START = "2026-09-09T05:30:00Z";

Deno.test("the audio's own duration wins over everything else", () => {
  assertEquals(
    resolveDurationSeconds({
      audioDurationSeconds: 1847.4,
      lastSegmentEnd: 1200,
      startTime: START,
      endTime: "2026-09-09T06:30:00Z",
    }),
    1847,
  );
});

Deno.test("without audio, the last segment end is real speech and is trusted", () => {
  assertEquals(
    resolveDurationSeconds({ lastSegmentEnd: 3435.51, startTime: START, endTime: "2026-09-09T06:30:00Z" }),
    3436,
  );
});

Deno.test("wall clock is used when it is plausible", () => {
  // A 30-minute standup processed promptly.
  assertEquals(
    resolveDurationSeconds({ startTime: START, endTime: "2026-09-09T06:00:00Z" }),
    1800,
  );
});

Deno.test("an implausible wall clock is refused, not clamped", () => {
  // The real 269.7 h row: recovered eleven days after the call.
  const elevenDays = resolveDurationSeconds({
    startTime: "2026-04-08T15:30:00Z",
    endTime: "2026-04-19T17:09:51Z",
  });
  assertEquals(elevenDays, null);

  // Clamping would hand back a believable 7 h that nobody measured. Null means
  // "unknown", and the UI renders nothing.
  assertEquals(
    resolveDurationSeconds({ startTime: START, endTime: "2026-09-09T13:30:01Z" }),
    null,
  );
});

Deno.test("the plausibility ceiling is the most generous plan's per-meeting cap, plus headroom", () => {
  assertEquals(MAX_PLAUSIBLE_DURATION_SECONDS, 7 * 3600);
  // Exactly at the ceiling is still accepted.
  assertEquals(
    resolveDurationSeconds({ startTime: START, endTime: "2026-09-09T12:30:00Z" }),
    7 * 3600,
  );
});

Deno.test("a real duration survives even when the pipeline ran days late", () => {
  // This is the point: the audio duration is unaffected by when we processed it.
  assertEquals(
    resolveDurationSeconds({
      audioDurationSeconds: 1801,
      startTime: "2026-04-08T15:30:00Z",
      endTime: "2026-04-19T17:09:51Z",
    }),
    1801,
  );
});

Deno.test("zero and negative are missing measurements, not durations", () => {
  assertEquals(resolveDurationSeconds({ audioDurationSeconds: 0, lastSegmentEnd: 0, startTime: START, endTime: START }), null);
  assertEquals(resolveDurationSeconds({ startTime: "2026-09-09T06:00:00Z", endTime: START }), null);
  assertEquals(resolveDurationSeconds({ audioDurationSeconds: -5, lastSegmentEnd: 900 }), 900);
});

Deno.test("missing or unparseable timestamps give null rather than NaN", () => {
  assertEquals(resolveDurationSeconds({}), null);
  assertEquals(resolveDurationSeconds({ startTime: "not a date", endTime: START }), null);
  assertEquals(resolveDurationSeconds({ startTime: START, endTime: null }), null);
});
