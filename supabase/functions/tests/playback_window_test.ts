/**
 * The share player's clock mapping (src/lib/playbackWindow.ts). Pure, and the
 * only thing between a share link and the chatter either side of the window.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { clockLabel, toDisplayTime, toMediaTime, windowLength } from "../../../src/lib/playbackWindow.ts";

const YDSM = { start: 559, end: 1479 };

Deno.test("page 0:00 is the guest's join", () => {
  assertEquals(toMediaTime(0, YDSM), 559);
  assertEquals(toDisplayTime(559, YDSM), 0);
  assertEquals(windowLength(YDSM), 920);
});

Deno.test("seeks cannot leave the window in either direction", () => {
  assertEquals(toMediaTime(-30, YDSM), 559);
  assertEquals(toMediaTime(5000, YDSM), 1479);
  assertEquals(toMediaTime(Number.NaN, YDSM), 559);
});

Deno.test("media time outside the window reads as its nearest edge", () => {
  assertEquals(toDisplayTime(0, YDSM), 0);
  assertEquals(toDisplayTime(1600, YDSM), 920);
  assertEquals(toDisplayTime(700, YDSM), 141);
});

Deno.test("clockLabel formats page time", () => {
  assertEquals(clockLabel(0), "0:00");
  assertEquals(clockLabel(920), "15:20");
  assertEquals(clockLabel(3940), "1:05:40");
});
