/**
 * The share page's reading order: chapters as an outline, key points stamped
 * with the second a matching number was said.
 */
import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { chaptersOf, highlightsOf } from "../../../src/components/share/notes.ts";

const FACTS = {
  topics: [
    { topic: "Timeline", ts: 600, notes: "March go-live." },
    { topic: "Pricing", ts: 120, notes: " Discount discussed. " },
    { topic: "  ", ts: 5, notes: "" },
  ],
  numbers: [
    { metric: "Discount", value: "12%", ts: 130 },
    { metric: "independent agents", value: "2500", ts: 700 },
    { metric: "commission percentage", value: "6%", ts: 1036 },
    { metric: "commission percentage", value: "6%", ts: 2000 },
  ],
  pain_points: [],
  explicit_asks: [],
  decisions: [],
};

Deno.test("chaptersOf sorts topics by time and drops blank ones", () => {
  assertEquals(chaptersOf(FACTS), [
    { topic: "Pricing", ts: 120, notes: "Discount discussed." },
    { topic: "Timeline", ts: 600, notes: "March go-live." },
  ]);
  assertEquals(chaptersOf(null), []);
});

Deno.test("highlightsOf stamps a key point with the earliest matching number", () => {
  const out = highlightsOf(
    [
      "Dream Vacations has 2,500 independent agents.",
      "Expedia pays a 6% commission, direct bookings 10 to 20%.",
      "Richard prefers a personal touch.",
      "",
    ],
    FACTS,
  );
  assertEquals(out, [
    { text: "Dream Vacations has 2,500 independent agents.", ts: 700 },
    { text: "Expedia pays a 6% commission, direct bookings 10 to 20%.", ts: 1036 },
    { text: "Richard prefers a personal touch.", ts: null },
  ]);
});

Deno.test("highlightsOf needs a strong number or two weak ones", () => {
  const facts = {
    ...FACTS,
    numbers: [
      { metric: "options", value: "3", ts: 50 },
      { metric: "commission percentage", value: "10 to 20%", ts: 1036 },
      { metric: "time to plan a trip", value: "10 to 20 hours", ts: 1528 },
    ],
  };
  // A lone "3" proves nothing.
  assertEquals(highlightsOf(["Two of the 3 options were rejected."], facts)[0].ts, null);
  // "10" and "20" together beat the commission fact's lone "10" (its "20%" is a different token).
  assertEquals(highlightsOf(["Planning a trip takes 10 to 20 hours."], facts)[0].ts, 1528);
  // "20%" is strong on its own.
  assertEquals(highlightsOf(["Direct bookings yield up to 20%."], facts)[0].ts, 1036);
});
