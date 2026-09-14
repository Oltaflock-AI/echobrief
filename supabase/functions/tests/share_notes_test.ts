/**
 * The share page's topic bucketing: a fact lands under the chapter that was
 * open when it was said.
 */
import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { bucketFacts } from "../../../src/components/share/notes.ts";

const FACTS = {
  topics: [
    { topic: "Timeline", ts: 600, notes: "March go-live." },
    { topic: "Pricing", ts: 120, notes: "Discount discussed." },
  ],
  numbers: [
    { metric: "Discount", value: "12%", ts: 130 },
    { metric: "Seats", value: "40", ts: 700 },
    { metric: "Budget", value: "₹2L", ts: 30 },
  ],
  pain_points: [{ statement: "Manual CRM entry", ts: 600 }],
  explicit_asks: [{ statement: "Send the deck", ts: 125 }],
  decisions: [{ decision: "Go annual", owner: "Ravi", ts: 599 }],
};

Deno.test("bucketFacts sorts topics and files each fact under the open chapter", () => {
  const out = bucketFacts(FACTS);
  assertEquals(out.map((s) => s.topic), ["Pricing", "Timeline"]);
  assertEquals(out[0].items.map((i) => i.text), [
    "Budget: ₹2L", // before the first topic opened → first topic
    "Send the deck",
    "Discount: 12%",
    "Go annual — Ravi", // 599 < 600: still Pricing
  ]);
  assertEquals(out[1].items.map((i) => i.text), [
    "Manual CRM entry", // ts == topic ts is inside that topic
    "Seats: 40",
  ]);
  assertEquals(out[1].items[0].kind, "pain");
});

Deno.test("bucketFacts is empty without topics", () => {
  assertEquals(bucketFacts(null), []);
  assertEquals(bucketFacts({ ...FACTS, topics: [] }), []);
});
