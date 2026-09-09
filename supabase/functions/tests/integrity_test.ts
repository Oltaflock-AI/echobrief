/**
 * Terminal-status integrity detection.
 *
 * The bug behind it: nine meetings sat as `status = completed` with no
 * transcript row for seven weeks (2026-07-22 to 08-19, found 2026-09-09).
 * Sarvam returned an empty transcript, the pipeline wrote placeholder insights
 * and called it complete, and because `completed` is terminal the monitor's
 * stuck-meeting sweep never looked at them.
 */
import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  COMPLETED_WITHOUT_TRANSCRIPT,
  completedWithoutTranscript,
} from "../monitor-stuck-meetings/integrity.ts";
import { KNOWN_PATTERNS } from "../monitor-stuck-meetings/known-patterns.ts";

const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

Deno.test("completedWithoutTranscript catches a completed meeting with no transcript", () => {
  const meetings = [
    { id: "a", status: "completed" },
    { id: "b", status: "completed" },
  ];
  // Only "a" produced a transcript.
  assertEquals(ids(completedWithoutTranscript(meetings, new Set(["a"]))), ["b"]);
});

Deno.test("a pruned meeting is an EXPECTED absence, not a finding", () => {
  // prune-content removes the transcript on purpose and stamps the meeting.
  const meetings = [{ id: "b", status: "completed", content_pruned_at: "2026-09-01T00:00:00Z" }];
  assertEquals(completedWithoutTranscript(meetings, new Set()), []);
});

Deno.test("non-completed meetings are the stuck sweep's job, not this one", () => {
  const meetings = [
    { id: "f", status: "failed" },
    { id: "c", status: "cancelled" },
    { id: "p", status: "processing" },
    { id: "t", status: "transcribing" },
  ];
  assertEquals(completedWithoutTranscript(meetings, new Set()), []);
});

Deno.test("a healthy window produces no findings (the check can stay quiet)", () => {
  const meetings = [
    { id: "a", status: "completed" },
    { id: "b", status: "completed" },
    { id: "c", status: "completed" },
  ];
  assertEquals(completedWithoutTranscript(meetings, new Set(["a", "b", "c"])), []);
});

Deno.test("the real 2026-09-09 shape: two bots on one call, neither transcribed", () => {
  // Both users on the invite got their own bot; Sarvam returned empty for both,
  // and both meetings were marked completed with placeholder insights.
  const meetings = [
    { id: "khush-bot", status: "completed", content_pruned_at: null, created_at: "2026-08-19T05:25:06Z" },
    { id: "vineet-bot", status: "completed", content_pruned_at: null, created_at: "2026-08-19T05:25:04Z" },
    { id: "healthy", status: "completed", content_pruned_at: null, created_at: "2026-08-19T06:55:05Z" },
  ];
  assertEquals(ids(completedWithoutTranscript(meetings, new Set(["healthy"]))), [
    "khush-bot",
    "vineet-bot",
  ]);
});

Deno.test("bad input does not throw — the monitor tick must survive it", () => {
  assertEquals(completedWithoutTranscript([], new Set()), []);
  // deno-lint-ignore no-explicit-any
  assertEquals(completedWithoutTranscript(null as any, new Set()), []);
});

Deno.test("the signature is in KNOWN_PATTERNS, so it never alerts as a NEW pattern", () => {
  // errors.md and known-patterns.ts are mirrors; a signature missing here would
  // email [ECHOBRIEF NEW ERROR] on every occurrence.
  const known = KNOWN_PATTERNS[COMPLETED_WITHOUT_TRANSCRIPT];
  assertEquals(known?.signature, COMPLETED_WITHOUT_TRANSCRIPT);
  assertEquals(known?.recovery, "none");
});
