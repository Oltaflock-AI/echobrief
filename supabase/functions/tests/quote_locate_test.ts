/**
 * A citation's timestamp comes from the transcript, never from the model.
 */
import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { locateQuoteInSegments } from "../_shared/quote-locate.ts";

const SEGMENTS = [
  { speaker: "Asha", text: "Let us start with pricing.", start: 60.7 },
  { speaker: "Ravi", text: "The discount is twelve percent for annual plans.", start: 95.2 },
  { speaker: "Asha", text: "Fine. Go-live in March then.", start: 140 },
];

Deno.test("locateQuoteInSegments finds a verbatim quote, punctuation aside", () => {
  assertEquals(locateQuoteInSegments(SEGMENTS, "the discount is twelve percent"), 95);
});

Deno.test("locateQuoteInSegments survives a dropped filler word", () => {
  // "is" and "for" gone, four long words still shared with the segment.
  assertEquals(locateQuoteInSegments(SEGMENTS, "discount twelve percent annual plans"), 95);
});

Deno.test("locateQuoteInSegments refuses a coincidence", () => {
  assertEquals(locateQuoteInSegments(SEGMENTS, "pricing was never mentioned by anyone"), null);
  assertEquals(locateQuoteInSegments(SEGMENTS, ""), null);
  assertEquals(locateQuoteInSegments(null, "pricing"), null);
});
