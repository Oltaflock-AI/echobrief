/**
 * The R2 archive stays inside the free tier and forgets deleted meetings.
 */
import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { planSweep, objectKeyFor, type ArchiveRow } from "../_shared/recording-archive.ts";

const GB = 1024 * 1024 * 1024;
const row = (id: string, bytes: number, day: number, extra: Partial<ArchiveRow> = {}): ArchiveRow => ({
  id,
  meeting_id: `m-${id}`,
  object_key: `audio/u/${id}.mp3`,
  bytes,
  archived_at: `2026-09-${String(day).padStart(2, "0")}T00:00:00Z`,
  content_pruned: false,
  ...extra,
});

Deno.test("planSweep deletes nothing under the cap", () => {
  assertEquals(planSweep([row("a", GB, 1), row("b", GB, 2)], 9 * GB), []);
});

Deno.test("planSweep removes deleted and retention-pruned meetings first", () => {
  const out = planSweep([
    row("a", GB, 1),
    row("b", GB, 2, { meeting_id: null }),
    row("c", GB, 3, { content_pruned: true }),
  ], 9 * GB);
  assertEquals(out.map((r) => r.id), ["b", "c"]);
});

Deno.test("planSweep trims oldest-first until under the cap", () => {
  const out = planSweep([row("new", 4 * GB, 10), row("old", 4 * GB, 1), row("mid", 4 * GB, 5)], 9 * GB);
  assertEquals(out.map((r) => r.id), ["old"]);
});

Deno.test("objectKeyFor is per user and per meeting", () => {
  assertEquals(objectKeyFor("u1", "m1"), "audio/u1/m1.mp3");
});
