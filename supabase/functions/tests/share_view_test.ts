/**
 * What a public share link is allowed to show of a transcript.
 *
 * The zone filter here is the whole privacy guarantee of a shared transcript:
 * the summary a stranger reads is written from the meeting zone only, and the
 * transcript beside it has to match. A regression would publish pre-call
 * chatter to a URL anyone can forward, silently.
 */
import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { publicSegments } from "../_shared/share-view.ts";

Deno.test("publicSegments keeps only meeting-zone speech", () => {
  const out = publicSegments([
    { speaker: "Asha", text: "waiting for them to join", zone: "pre", start: 1 },
    { speaker: "Asha", text: "Let us start with pricing.", zone: "meeting", start: 60 },
    { speaker: "Ravi", text: "did you see the match", zone: "post", start: 3000 },
  ]);
  assertEquals(out, [{ speaker: "Asha", text: "Let us start with pricing.", start: 60 }]);
});

Deno.test("publicSegments treats an untagged segment as meeting", () => {
  // Pre-2026-08-31 meetings have no zone tags at all; dropping them would blank
  // the transcript rather than protect anything.
  const out = publicSegments([{ speaker: "Asha", text: "Hello.", start: 0 }]);
  assertEquals(out.length, 1);
  assertEquals(out[0].start, 0);
});

Deno.test("publicSegments drops every field it was not asked for", () => {
  const out = publicSegments([
    {
      speaker: "Asha",
      text: "Discount is twelve percent.",
      zone: "meeting",
      start: 12,
      // Neither of these may reach a public page.
      original_text: "डिस्काउंट बारह प्रतिशत है।",
      email: "asha@example.com",
    },
  ]);
  assertEquals(Object.keys(out[0]).sort(), ["speaker", "start", "text"]);
});

Deno.test("publicSegments survives junk and empty speech", () => {
  assertEquals(publicSegments(null), []);
  assertEquals(publicSegments("not an array"), []);
  assertEquals(publicSegments([null, 7, { text: "   ", zone: "meeting" }]), []);
});

Deno.test("publicSegments names an unnamed speaker rather than leaking undefined", () => {
  const out = publicSegments([{ text: "Right.", zone: "meeting", start: "9" }]);
  assertEquals(out, [{ speaker: "Speaker", text: "Right.", start: null }]);
});

// ---- publicFacts -----------------------------------------------------------
import { publicFacts } from "../_shared/share-view.ts";

const RAW_FACTS = {
  meeting_type: "sales",
  topics: [
    { topic: "Pricing", ts: 120, notes: "Discount discussed." },
    { topic: "Timeline", ts: "600", notes: "Go-live in March." },
  ],
  numbers: [{ metric: "Discount", value: "12%", speaker: "Asha", quote: "twelve percent off", ts: 130 }],
  pain_points: [{ statement: "Manual CRM entry", speaker: "Ravi", quote: "I type it all by hand", ts: 140 }],
  explicit_asks: [{ statement: "Send the deck", quote: "can you send the deck", ts: 150 }],
  decisions: [{ decision: "Go with annual", owner: "Ravi", quote: "let us do annual", ts: 160 }],
  entities: [{ type: "company", name: "Acme", context: "their client", ts: 1 }],
  objections: [{ statement: "Too expensive", quote: "too expensive", ts: 2 }],
  buying_signals: [{ statement: "Ready to buy", quote: "ready", ts: 3 }],
  notable_quotes: [{ speaker: "Asha", quote: "wow", ts: 4, why: "excitement" }],
  validation: { unverified: ["x"] },
};

Deno.test("publicFacts keeps only the five timestamped lists, without quotes or speakers", () => {
  const out = publicFacts(RAW_FACTS);
  assertEquals(out, {
    topics: [
      { topic: "Pricing", ts: 120, notes: "Discount discussed." },
      { topic: "Timeline", ts: 600, notes: "Go-live in March." },
    ],
    numbers: [{ metric: "Discount", value: "12%", ts: 130 }],
    pain_points: [{ statement: "Manual CRM entry", ts: 140 }],
    explicit_asks: [{ statement: "Send the deck", ts: 150 }],
    decisions: [{ decision: "Go with annual", owner: "Ravi", ts: 160 }],
  });
  // Nothing else leaks, whatever the object carries.
  assertEquals(Object.keys(out!).sort(), ["decisions", "explicit_asks", "numbers", "pain_points", "topics"]);
  assertEquals(JSON.stringify(out).includes("quote"), false);
  assertEquals(JSON.stringify(out).includes("Asha"), false);
});

Deno.test("publicFacts is null when there is nothing to group by", () => {
  assertEquals(publicFacts(null), null);
  assertEquals(publicFacts("facts"), null);
  assertEquals(publicFacts({ numbers: RAW_FACTS.numbers }), null);
  assertEquals(publicFacts({ topics: [] }), null);
});

Deno.test("publicFacts drops rows with no text or a bad timestamp", () => {
  const out = publicFacts({
    topics: [{ topic: "A", ts: 0, notes: "" }, { topic: "", ts: 5, notes: "x" }, { topic: "B", ts: "nope", notes: "" }],
    numbers: [{ metric: "", value: "1", ts: 1 }, { metric: "M", value: "", ts: 1 }],
    decisions: [{ decision: "D", owner: null, ts: -3 }],
  });
  assertEquals(out!.topics, [{ topic: "A", ts: 0, notes: "" }]);
  assertEquals(out!.numbers, []);
  assertEquals(out!.decisions, [{ decision: "D", owner: null, ts: 0 }]);
});
