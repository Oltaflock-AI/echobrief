/**
 * The ClickUp client and message builder, against a mocked fetch.
 *
 * Same stakes as the Slack builder: a malformed post is seen by the whole
 * room. The client tests pin the two things that differ from Slack and would
 * fail silently if guessed — failures arrive as HTTP statuses rather than
 * `{ok:false}`, and channels are workspace-scoped with DMs mixed in.
 */
import { assertEquals, assertStringIncludes, assertRejects } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  buildSummaryMessage,
  ClickUpError,
  exchangeCode,
  isChannelGone,
  isFatal,
  listChannels,
  listWorkspaces,
  postMessage,
} from "../_shared/clickup.ts";

const APP = "https://www.echobrief.in";
const meeting = { id: "m-123", title: "Pricing review" };

function mockFetch(handler: (url: string, init?: RequestInit) => Response) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const original = globalThis.fetch;
  globalThis.fetch = ((url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return Promise.resolve(handler(String(url), init));
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = original; } };
}
const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.test("clickup: object-shaped action items render as text, never [object Object]", () => {
  const md = buildSummaryMessage(meeting, {
    summary_short: "We agreed the new pricing.",
    action_items: [
      { task: "Send the revised deck", owner: "Asha", due_date: "2026-09-12" },
      { task: "Update the pricing page", owner: "Vikram" },
    ],
  }, APP);
  assertStringIncludes(md, "**Send the revised deck**");
  assertStringIncludes(md, "Asha · 2026-09-12");
  assertEquals(md.includes("[object Object]"), false);
});

Deno.test("clickup: string-shaped action items still render", () => {
  const md = buildSummaryMessage(meeting, {
    summary_short: "Short sync.",
    action_items: ["Book the venue", "Chase the invoice"],
  }, APP);
  assertStringIncludes(md, "Book the venue");
  assertEquals(md.includes("[object Object]"), false);
});

Deno.test("clickup: a meeting with no insights still produces a valid message with the link", () => {
  const md = buildSummaryMessage(meeting, {}, APP);
  assertStringIncludes(md, "**Pricing review**");
  assertStringIncludes(md, "/meeting/m-123");
  assertEquals(md.includes("**Summary**"), false);   // empty sections omitted
  assertEquals(md.includes("Decisions"), false);
});

Deno.test("clickup: markdown control characters in insight text are escaped", () => {
  const md = buildSummaryMessage(meeting, {
    summary_short: "Margin is 40% *before* fees_and `taxes`",
  }, APP);
  assertStringIncludes(md, "\\*before\\*");
  assertStringIncludes(md, "fees\\_and");
  assertStringIncludes(md, "\\`taxes\\`");
});

Deno.test("clickup: the highlight prefers a key point with a number", () => {
  const md = buildSummaryMessage(meeting, {
    key_points: ["We liked the design", "Budget capped at ₹4 lakh"],
  }, APP);
  assertStringIncludes(md, "> Budget capped at ₹4 lakh");
});

Deno.test("clickup: never the transcript, coaching, facts or emails", () => {
  const md = buildSummaryMessage(meeting, {
    summary_short: "ok",
    coaching: { verdict: "SECRET-COACHING" },
    facts: { numbers: [{ quote: "SECRET-QUOTE" }] },
    transcript: "SECRET-TRANSCRIPT",
    attendees: ["secret@example.com"],
  }, APP);
  for (const s of ["SECRET-COACHING", "SECRET-QUOTE", "SECRET-TRANSCRIPT", "secret@example.com"]) {
    assertEquals(md.includes(s), false, s);
  }
});

Deno.test("clickup: message stays under the content cap", () => {
  const md = buildSummaryMessage(meeting, {
    summary_short: "x".repeat(20000),
    action_items: Array.from({ length: 40 }, (_, i) => `item ${i} ` + "y".repeat(300)),
  }, APP);
  assertEquals(md.length <= 12000, true);
});

Deno.test("clickup: exchangeCode posts the three params as a query string", async () => {
  const f = mockFetch(() => jsonRes({ access_token: "tok_1", token_type: "Bearer" }));
  try {
    const t = await exchangeCode("cid", "csecret", "code9");
    assertEquals(t.access_token, "tok_1");
    const url = new URL(f.calls[0].url);
    assertEquals(url.pathname, "/api/v2/oauth/token");
    assertEquals(url.searchParams.get("client_id"), "cid");
    assertEquals(url.searchParams.get("code"), "code9");
    assertEquals(f.calls[0].init?.method, "POST");
  } finally { f.restore(); }
});

Deno.test("clickup: listWorkspaces reads teams", async () => {
  const f = mockFetch(() => jsonRes({ teams: [{ id: 9001, name: "Oltaflock" }, { id: 9002, name: "Side" }] }));
  try {
    assertEquals(await listWorkspaces("tok"), [{ id: "9001", name: "Oltaflock" }, { id: "9002", name: "Side" }]);
    assertEquals(f.calls[0].init?.headers && (f.calls[0].init.headers as Record<string, string>).Authorization, "Bearer tok");
  } finally { f.restore(); }
});

Deno.test("clickup: listChannels walks every workspace, pages by cursor, drops DMs", async () => {
  const f = mockFetch((url) => {
    const u = new URL(url);
    if (u.pathname.includes("/workspaces/1/")) {
      if (!u.searchParams.get("cursor")) {
        return jsonRes({
          data: [
            { id: "c-b", name: "beta", type: "CHANNEL", visibility: "PRIVATE" },
            { id: "dm-1", name: "Asha", type: "DM" },
          ],
          next_cursor: "p2",
        });
      }
      return jsonRes({ data: [{ id: "c-a", name: "alpha", type: "CHANNEL", visibility: "PUBLIC" }], next_cursor: "" });
    }
    return jsonRes({ data: [{ id: "c-z", name: "zeta", type: "CHANNEL" }] });
  });
  try {
    const out = await listChannels("tok", [{ id: "2", name: "Side" }, { id: "1", name: "Acme" }]);
    assertEquals(out.map((c) => `${c.workspace_name}/${c.name}`), ["Acme/alpha", "Acme/beta", "Side/zeta"]);
    assertEquals(out.find((c) => c.id === "c-b")?.is_private, true);
    assertEquals(out.some((c) => c.id === "dm-1"), false);
    // Three requests: two pages for workspace 1, one for workspace 2.
    assertEquals(f.calls.length, 3);
  } finally { f.restore(); }
});

Deno.test("clickup: postMessage hits the v3 path with markdown and returns the id", async () => {
  const f = mockFetch(() => jsonRes({ id: "msg-7" }, 201));
  try {
    const r = await postMessage("tok", "9001", "c-a", "**hi**");
    assertEquals(r.id, "msg-7");
    assertEquals(new URL(f.calls[0].url).pathname, "/api/v3/workspaces/9001/chat/channels/c-a/messages");
    const body = JSON.parse(String(f.calls[0].init?.body));
    assertEquals(body, { type: "message", content: "**hi**", content_format: "text/md" });
  } finally { f.restore(); }
});

Deno.test("clickup: an HTTP failure becomes a ClickUpError carrying status and ECODE", async () => {
  const f = mockFetch(() => jsonRes({ err: "Oauth token not found", ECODE: "OAUTH_027" }, 401));
  try {
    const err = await assertRejects(() => listWorkspaces("bad"), ClickUpError);
    assertEquals(err.status, 401);
    assertEquals(err.ecode, "OAUTH_027");
    assertEquals(isFatal(err), true);
    assertEquals(isChannelGone(err), false);
  } finally { f.restore(); }
});

Deno.test("clickup: a 404 on post is a channel problem, not a grant problem", () => {
  const err = new ClickUpError(404, "", "not found");
  assertEquals(isChannelGone(err), true);
  assertEquals(isFatal(err), false);
  assertEquals(isFatal(new Error("x")), false);
});
