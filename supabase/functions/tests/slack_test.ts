/**
 * The Slack message builder, which is the part that can embarrass someone.
 *
 * A Slack channel is a room full of people. An email that renders badly is seen
 * by one person; a malformed Slack post is seen by the whole team and cannot be
 * unsent. So the builder is pure and tested against the shapes the pipeline
 * actually emits — action items have been plain strings in some meetings and
 * `{task, owner, due_date}` objects in others since the two-pass rewrite, and a
 * builder that assumes one of them posts "[object Object]" into a team channel.
 */
import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { buildSummaryMessage, pickHighlight } from "../_shared/slack.ts";

const APP = "https://www.echobrief.in";
const meeting = { id: "m-123", title: "Pricing review" };

function textOf(blocks: unknown[]): string {
  return blocks.map((b) => JSON.stringify(b)).join("\n");
}

Deno.test("slack: object-shaped action items render as text, never [object Object]", () => {
  const { blocks } = buildSummaryMessage(meeting, {
    summary_short: "We agreed the new pricing.",
    action_items: [
      { task: "Send the revised deck", owner: "Asha", due_date: "2026-09-12" },
      { task: "Update the pricing page", owner: "Vikram" },
    ],
  }, APP);
  const rendered = textOf(blocks);
  // Task in bold, its metadata trailing in italics after an em dash.
  assertStringIncludes(rendered, "*Send the revised deck*");
  assertStringIncludes(rendered, "Asha · 2026-09-12");
  assertStringIncludes(rendered, "*Update the pricing page*");
  assertEquals(rendered.includes("[object Object]"), false);
});

Deno.test("slack: string-shaped action items still render", () => {
  const { blocks } = buildSummaryMessage(meeting, {
    summary_short: "Short sync.",
    action_items: ["Book the venue", "Chase the invoice"],
  }, APP);
  const rendered = textOf(blocks);
  assertStringIncludes(rendered, "Book the venue");
  assertEquals(rendered.includes("[object Object]"), false);
});

Deno.test("slack: a meeting with no insights still produces a valid message", () => {
  // saveInsights can land a row with an empty summary; posting nothing at all
  // is better than posting a broken block, but the message must still be valid.
  const { text, blocks } = buildSummaryMessage(meeting, {}, APP);
  assertEquals(typeof text, "string");
  assertEquals(text.length > 0, true);          // never an empty notification
  assertEquals(blocks.length >= 2, true);        // header + context link
  assertStringIncludes(textOf(blocks), "/meeting/m-123");
});

Deno.test("slack: no text block exceeds Slack's 3000-character limit", () => {
  const { blocks } = buildSummaryMessage(meeting, {
    summary_short: "x".repeat(9000),
    action_items: Array.from({ length: 40 }, (_, i) => `item ${i} ` + "y".repeat(300)),
    decisions: Array.from({ length: 40 }, (_, i) => `decision ${i} ` + "z".repeat(300)),
  }, APP);
  for (const b of blocks as Array<Record<string, any>>) {
    if (b.text?.text) {
      assertEquals(
        b.text.text.length <= 3000,
        true,
        `block of type ${b.type} was ${b.text.text.length} chars — Slack rejects the whole message`,
      );
    }
  }
});

Deno.test("slack: the transcript and internal-zone fields are never posted", () => {
  // The guarantee that makes Slack safe: only fields the pipeline computes from
  // the meeting zone go out. coaching and facts are derived with the internal
  // zones in scope, and the transcript is the raw call.
  const { text, blocks } = buildSummaryMessage(meeting, {
    summary_short: "Public summary.",
    action_items: ["Do the thing"],
    coaching: { note: "SECRET-COACHING-DO-NOT-POST" },
    facts: { numbers: [{ quote: "SECRET-FACT-DO-NOT-POST" }] },
    transcript: "SECRET-TRANSCRIPT-DO-NOT-POST",
  }, APP);
  const rendered = textOf(blocks) + text;
  for (const secret of ["SECRET-COACHING", "SECRET-FACT", "SECRET-TRANSCRIPT"]) {
    assertEquals(rendered.includes(secret), false, `${secret} leaked into the Slack message`);
  }
});

Deno.test("slack: the notification preview is never empty", () => {
  // A message with blocks but no top-level text shows as a blank line in the
  // Slack sidebar, which looks like a broken integration.
  for (const insights of [{}, { summary_short: "" }, { summary_short: "Real summary" }]) {
    const { text } = buildSummaryMessage(meeting, insights, APP);
    assertEquals(text.trim().length > 0, true);
  }
});

Deno.test("slack: the meeting link points at this meeting", () => {
  const { blocks } = buildSummaryMessage({ id: "abc-def", title: "T" }, {}, "https://www.echobrief.in/");
  // Trailing slash on appUrl must not produce a double slash.
  assertStringIncludes(textOf(blocks), "https://www.echobrief.in/meeting/abc-def");
});

/* ── the four sections ──────────────────────────────────────────────────── */

const full = {
  summary_short: "Barbara wants structured follow-ups before scaling.",
  key_points: [
    "Barbara prefers an organic approach to client communication.",
    "The annual subscription for Travify is about $280 for the year.",
  ],
  decisions: ["Trial Travify for one quarter"],
  action_items: [{ task: "Deep dive on Travify follow-ups", owner: "Barbara", priority: "high" }],
  meeting_metrics: { speaker_participation: { "Barbara Khan": 0.55, "Khush": 0.45 } },
};
const richMeeting = {
  id: "m-9",
  title: "Client check-in",
  start_time: "2026-09-07T14:24:46.103Z",
  duration_seconds: 3446,
};

Deno.test("slack: all four sections render, each with its label", () => {
  const { blocks } = buildSummaryMessage(richMeeting, full, APP);
  const rendered = textOf(blocks);
  for (const label of ["*Summary*", "*Highlight*", "*Decisions*", "*Action items*"]) {
    assertStringIncludes(rendered, label);
  }
  // The highlight is a blockquote so it survives a long summary above it.
  assertStringIncludes(rendered, ">The annual subscription for Travify is about $280");
});

Deno.test("slack: the highlight prefers a key point carrying a number", () => {
  // A price or a headcount is what people quote back at each other; the first
  // key point is only the fallback.
  assertEquals(
    pickHighlight({ key_points: ["A qualitative observation.", "Revenue was $2.4M."] }),
    "Revenue was $2.4M.",
  );
  assertEquals(
    pickHighlight({ key_points: ["Only this one.", "And this."] }),
    "Only this one.",
  );
  assertEquals(pickHighlight({}), "");
});

Deno.test("slack: empty sections are omitted, not printed as 'none'", () => {
  // Most meetings decide nothing. A post that says "Decisions: none" every day
  // teaches the channel to stop reading it.
  const { blocks } = buildSummaryMessage(richMeeting, {
    summary_short: "A short sync.",
    decisions: [],
    action_items: [],
    key_points: [],
  }, APP);
  const rendered = textOf(blocks);
  assertEquals(rendered.includes("*Decisions*"), false);
  assertEquals(rendered.includes("*Action items*"), false);
  assertEquals(rendered.includes("*Highlight*"), false);
  assertStringIncludes(rendered, "*Summary*");
});

Deno.test("slack: the context line reports the meeting in IST, not UTC", () => {
  // 14:24 UTC is 7:54 PM in Asia/Kolkata. Printing UTC is the bug that shipped
  // in the summary email once already — see _shared/time.ts.
  const { blocks } = buildSummaryMessage(richMeeting, full, APP);
  const rendered = textOf(blocks);
  assertStringIncludes(rendered, "7:54 PM");
  assertStringIncludes(rendered, "Sep 7");
  assertStringIncludes(rendered, "57 min");
  assertStringIncludes(rendered, "2 speakers");
});

Deno.test("slack: a meeting with no start time or duration still renders", () => {
  // Uploaded meetings have neither.
  const { blocks } = buildSummaryMessage({ id: "m-9", title: "Upload" }, full, APP);
  const rendered = textOf(blocks);
  assertEquals(rendered.includes("stopwatch"), false);
  assertEquals(rendered.includes("calendar"), false);
  assertStringIncludes(rendered, "*Summary*");
});

Deno.test("slack: a long action list is capped with a count of the rest", () => {
  const { blocks } = buildSummaryMessage(richMeeting, {
    summary_short: "s",
    action_items: Array.from({ length: 11 }, (_, i) => `Task ${i}`),
  }, APP);
  const rendered = textOf(blocks);
  assertStringIncludes(rendered, "and 5 more");
  assertEquals(rendered.includes("Task 9"), false);
});

Deno.test("slack: mrkdwn control characters in insights cannot forge markup", () => {
  // Insight text is model output about whatever was said in the meeting. An
  // unescaped < turns the rest of the block into a broken Slack link.
  const { blocks } = buildSummaryMessage(richMeeting, {
    summary_short: "We compared <https://evil.test|click me> & 5 > 3",
    action_items: [],
  }, APP);
  const rendered = textOf(blocks);
  assertEquals(rendered.includes("<https://evil.test|click me>"), false);
  assertStringIncludes(rendered, "&lt;https://evil.test|click me&gt;");
  assertStringIncludes(rendered, "5 &gt; 3");
});

Deno.test("slack: the report link is still a real Slack link, not escaped", () => {
  // The control for the escaping test above: OUR link must survive intact.
  const { blocks } = buildSummaryMessage(richMeeting, full, APP);
  assertStringIncludes(textOf(blocks), "<https://www.echobrief.in/meeting/m-9|Open the full report");
});

/* ── next steps ─────────────────────────────────────────────────────────── */

Deno.test("slack: next steps render with their assignee", () => {
  const { blocks } = buildSummaryMessage(richMeeting, {
    summary_short: "s",
    action_items: [{ task: "Send the deck", owner: "Khush" }],
    follow_ups: [
      { type: "meeting", description: "Schedule a follow-up call for Wednesday.", assignee: "Khush Mutha" },
    ],
  }, APP);
  const rendered = textOf(blocks);
  assertStringIncludes(rendered, "*Next steps*");
  assertStringIncludes(rendered, "Schedule a follow-up call for Wednesday.");
  assertStringIncludes(rendered, "Khush Mutha");
});

Deno.test("slack: a follow-up that repeats an action item is dropped", () => {
  // Measured across eight real meetings: follow_ups duplicate an action item
  // about half the time, word for word. Printing both makes a reader wonder
  // whether they are two different tasks.
  const { blocks } = buildSummaryMessage(richMeeting, {
    summary_short: "s",
    action_items: [{ task: "Look into Travify's features and offerings.", owner: "Barbara Khan" }],
    follow_ups: [
      { type: "research", description: "look into travify's features and offerings", assignee: "Barbara Khan" },
    ],
  }, APP);
  const rendered = textOf(blocks);
  // Nothing left to say, so the whole section goes rather than echoing.
  assertEquals(rendered.includes("*Next steps*"), false);
  assertStringIncludes(rendered, "*Action items*");
});

Deno.test("slack: next steps survive when only some follow-ups are duplicates", () => {
  // The control for the test above: dedup must not swallow the section whole.
  const { blocks } = buildSummaryMessage(richMeeting, {
    summary_short: "s",
    action_items: [{ task: "Send the documentation", owner: "Khush" }],
    follow_ups: [
      { description: "Send the documentation.", assignee: "Khush" },
      { description: "Prepare and present a proposal.", assignee: "Khush Mutha" },
    ],
  }, APP);
  const rendered = textOf(blocks);
  assertStringIncludes(rendered, "*Next steps*");
  assertStringIncludes(rendered, "Prepare and present a proposal.");
  // The duplicate is gone, the original stays where it belongs.
  assertEquals(rendered.split("Send the documentation").length - 1, 1);
});

Deno.test("slack: duplicate follow-ups among themselves collapse to one", () => {
  const { blocks } = buildSummaryMessage(richMeeting, {
    summary_short: "s",
    follow_ups: [
      { description: "Schedule the call." },
      { description: "Schedule the call" },
      { description: "Share the pricing." },
    ],
  }, APP);
  const rendered = textOf(blocks);
  assertEquals(rendered.split("Schedule the call").length - 1, 1);
  assertStringIncludes(rendered, "Share the pricing.");
});

Deno.test("slack: a decision's verbatim quote tail is trimmed, the decision is not", () => {
  // Real shape from prod: `Decision (Owner) — "the sentence that settled it"`.
  // The quote is evidence for the report, not for a room full of people.
  const { blocks } = buildSummaryMessage(richMeeting, {
    summary_short: "s",
    decisions: ['Schedule a follow-up call (Khush Mutha) — "can we target a follow-up call for Wednesday?"'],
  }, APP);
  const rendered = textOf(blocks);
  assertStringIncludes(rendered, "Schedule a follow-up call (Khush Mutha)");
  assertEquals(rendered.includes("can we target"), false);
});

Deno.test("slack: a decision that is mostly quote keeps its text rather than vanishing", () => {
  // The control: trimming must never leave a bullet with nothing in it.
  const { blocks } = buildSummaryMessage(richMeeting, {
    summary_short: "s",
    decisions: ['Go ahead — "we will ship on Friday, no further review"'],
  }, APP);
  assertStringIncludes(textOf(blocks), "we will ship on Friday");
});
