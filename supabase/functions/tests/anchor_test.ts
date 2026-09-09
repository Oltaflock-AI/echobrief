/**
 * Quote anchoring and windowed extraction.
 *
 * The bug these cover, measured on two real meetings on 2026-09-09: gpt-4o-mini
 * stamped a fact from minute 88 of a 90-minute call as `ts: 13`, and every
 * number on that call came back with a minute-scale timestamp. Anchoring puts
 * the fact back on the segment its quote came from; windowing stops one call
 * from having to hold ninety minutes of speech in attention at all.
 */
import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  anchorFacts,
  anchorQuote,
  anchorTopic,
  buildAnchorIndex,
  formatLabeledTranscript,
  normalizeForMatch,
} from "../_shared/anchor.ts";
import { evenSample, mergeFacts, normalizeFacts, windowSegments } from "../_shared/facts.ts";

const SEGMENTS = [
  { speaker: "Khush", text: "Good morning everyone, thanks for joining today.", start: 0, end: 6 },
  { speaker: "Mathew", text: "We booked about four hundred clients last quarter.", start: 620, end: 627 },
  { speaker: "Khush", text: "So the annual TTV lands somewhere near five million dollars.", start: 3600, end: 3608 },
  { speaker: "Mathew", text: "I will send the revised proposal over on Tuesday.", start: 5284, end: 5290 },
];

Deno.test("anchorQuote finds a verbatim quote from the end of a long meeting", () => {
  const index = buildAnchorIndex(SEGMENTS);
  assertEquals(anchorQuote("I will send the revised proposal over on Tuesday", index), 5284);
  assertEquals(anchorQuote("the annual TTV lands somewhere near five million", index), 3600);
});

Deno.test("anchorQuote tolerates punctuation and casing drift", () => {
  const index = buildAnchorIndex(SEGMENTS);
  assertEquals(anchorQuote("we booked about FOUR HUNDRED clients, last quarter!", index), 620);
});

Deno.test("anchorQuote matches a quote split across consecutive segments", () => {
  const index = buildAnchorIndex([
    { speaker: "A", text: "What I do need is", start: 100 },
    { speaker: "A", text: "someone to handle the inbound calls for me", start: 104 },
  ]);
  assertEquals(anchorQuote("What I do need is someone to handle the inbound calls", index), 100);
});

Deno.test("anchorQuote refuses to guess on a short or absent quote", () => {
  const index = buildAnchorIndex(SEGMENTS);
  assertEquals(anchorQuote("yes exactly", index), null);
  assertEquals(anchorQuote("", index), null);
  assertEquals(anchorQuote("we discussed the migration of the warehouse in Ohio", index), null);
});

Deno.test("anchorQuote will not reach outside its extraction window", () => {
  const index = buildAnchorIndex(SEGMENTS);
  const quote = "I will send the revised proposal over on Tuesday";
  assertEquals(anchorQuote(quote, index, { from: 4800, to: 5400 }), 5284);
  assertEquals(anchorQuote(quote, index, { from: 0, to: 600 }), null);
});

Deno.test("anchorFacts replaces the model's invented timestamps", () => {
  const facts = normalizeFacts({
    meeting_type: "sales_proposal",
    numbers: [
      { metric: "annual TTV", value: "$5M", speaker: "Khush", quote: "the annual TTV lands somewhere near five million dollars", ts: 41 },
      { metric: "clients", value: "400", speaker: "Mathew", quote: "We booked about four hundred clients last quarter", ts: 13 },
    ],
    commitments: [
      { who: "Mathew", what: "send the revised proposal", due: "Tuesday", quote: "I will send the revised proposal over on Tuesday", ts: 13 },
    ],
  });
  const anchored = anchorFacts(facts, SEGMENTS);
  assertEquals(anchored.numbers.map((n) => n.ts), [3600, 620]);
  assertEquals(anchored.commitments[0].ts, 5284);
});

Deno.test("anchorFacts keeps the model's ts when the quote cannot be located", () => {
  const facts = normalizeFacts({
    numbers: [{ metric: "headcount", value: "12", quote: "we are twelve people in the Pune office", ts: 900 }],
  });
  assertEquals(anchorFacts(facts, SEGMENTS).numbers[0].ts, 900);
});

Deno.test("anchorFacts clamps an unlocatable fact into its own window", () => {
  const facts = normalizeFacts({
    numbers: [{ metric: "headcount", value: "12", quote: "we are twelve people in the Pune office", ts: 13 }],
    topics: [{ topic: "Pricing", ts: 7, notes: "Nothing quotable." }],
  });
  const anchored = anchorFacts(facts, SEGMENTS, { from: 3600, to: 4200 });
  assertEquals(anchored.numbers[0].ts, 3600);
  assertEquals(anchored.topics[0].ts, 3600);
});

Deno.test("anchorFacts is a no-op without segments to anchor against", () => {
  const facts = normalizeFacts({ numbers: [{ metric: "x", value: "1", quote: "some quote here at all", ts: 42 }] });
  assertEquals(anchorFacts(facts, []).numbers[0].ts, 42);
});

Deno.test("windowSegments cuts the meeting into ten-minute windows", () => {
  const windows = windowSegments(SEGMENTS);
  assertEquals(windows.map((w) => [w.from, w.to]), [[0, 600], [600, 1200], [3600, 4200], [4800, 5400]]);
  assertEquals(windows[2].segments.length, 1);
});

Deno.test("windowSegments skips stretches with no speech and survives no input", () => {
  assertEquals(windowSegments([]), []);
  assertEquals(windowSegments([{ speaker: "A", text: "hi" }]), []);
});

Deno.test("mergeFacts concatenates windows, dedupes and orders by time", () => {
  const a = normalizeFacts({
    meeting_type: "sales_proposal",
    numbers: [{ metric: "clients", value: "400", quote: "four hundred clients", ts: 620 }],
    topics: [{ topic: "Intro", ts: 0, notes: "Hellos." }],
    open_questions: ["Who signs the contract?"],
  });
  const b = normalizeFacts({
    meeting_type: "other",
    numbers: [
      { metric: "clients", value: "400", quote: "four hundred clients again", ts: 3000 },
      { metric: "annual TTV", value: "$5M", quote: "five million", ts: 3600 },
    ],
    topics: [{ topic: "Pricing", ts: 3600, notes: "Rates." }],
    open_questions: ["Who signs the contract?", "When do we start?"],
  });
  const merged = mergeFacts([a, b]);
  assertEquals(merged.meeting_type, "sales_proposal");
  assertEquals(merged.numbers.map((n) => [n.metric, n.ts]), [["clients", 620], ["annual TTV", 3600]]);
  assertEquals(merged.topics.map((t) => t.topic), ["Intro", "Pricing"]);
  assertEquals(merged.open_questions, ["Who signs the contract?", "When do we start?"]);
});

Deno.test("mergeFacts passes a single window through untouched", () => {
  const only = normalizeFacts({ topics: [{ topic: "Intro", ts: 0, notes: "" }] });
  assertEquals(mergeFacts([only]), only);
  assertEquals(mergeFacts([]).topics, []);
});

Deno.test("normalizeForMatch and the labeled transcript still agree on segment text", () => {
  assertEquals(normalizeForMatch("It's  $5M — really?"), "it s 5m really");
  assertEquals(
    formatLabeledTranscript([{ speaker: "A", text: "hi", start: 75 }], "fallback"),
    "[1:15] A: hi",
  );
});

Deno.test("anchorTopic places a chapter on the utterance it describes", () => {
  const index = buildAnchorIndex([
    { speaker: "A", text: "Let us start with introductions and the agenda.", start: 10 },
    { speaker: "B", text: "Our commission structure charges fifteen percent on every booking.", start: 4200 },
  ]);
  assertEquals(anchorTopic("Commission structure", "How bookings are charged.", index), 4200);
  assertEquals(anchorTopic("Pricing", "", index), null);
});

Deno.test("evenSample keeps items spanning the meeting, not the first N", () => {
  const rows = Array.from({ length: 30 }, (_, i) => ({ ts: i * 100 }));
  const kept = evenSample(rows, 5).map((r) => r.ts);
  assertEquals(kept, [0, 600, 1200, 1800, 2400]);
  assertEquals(evenSample(rows.slice(0, 3), 5).length, 3);
});
