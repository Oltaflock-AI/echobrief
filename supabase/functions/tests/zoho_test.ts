/**
 * The Zoho client, with fetch mocked.
 *
 * Two things here are worth more than the rest combined.
 *
 * The datacentre: a token minted at accounts.zoho.in only works against
 * www.zohoapis.in, and using the wrong domain fails as an ordinary auth error —
 * so a hardcoded domain would pass every test written against our own account
 * and break for every customer elsewhere.
 *
 * The 204: Zoho answers a search that matches nothing with 204 and an EMPTY
 * body. Calling .json() on that throws, which would turn the most common
 * outcome of this integration — "this attendee is not in your CRM" — into a
 * crash inside the pipeline.
 */
import { assertEquals, assertRejects, assertStringIncludes } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  buildNote,
  createNote,
  exchangeCode,
  findRecordByEmail,
  resolveApiDomain,
  ZohoError,
  ZOHO_API_DOMAINS,
} from "../_shared/zoho.ts";

interface Reply { status?: number; body?: unknown }

function mockFetch(replies: Reply[]) {
  const calls: Array<{ url: string; body: string; auth: string }> = [];
  const original = globalThis.fetch;
  let i = 0;
  globalThis.fetch = ((url: string | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers ?? {});
    calls.push({
      url: String(url),
      body: String(init?.body ?? ""),
      auth: headers.get("authorization") ?? "",
    });
    const r = replies[Math.min(i++, replies.length - 1)];
    const status = r.status ?? 200;
    return Promise.resolve(
      status === 204
        ? new Response(null, { status: 204 })
        : new Response(JSON.stringify(r.body ?? {}), { status }),
    );
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = original; } };
}

/* ── the datacentre ─────────────────────────────────────────────────────── */

Deno.test("zoho: the api domain comes from the grant, not from a constant", () => {
  assertEquals(resolveApiDomain("https://www.zohoapis.eu", "in"), "https://www.zohoapis.eu");
  // No domain in the response: fall back to the datacentre the callback named.
  assertEquals(resolveApiDomain(null, "eu"), ZOHO_API_DOMAINS.eu);
  assertEquals(resolveApiDomain(undefined, "au"), ZOHO_API_DOMAINS.au);
  // Junk in the response must not become the base URL of every later request.
  assertEquals(resolveApiDomain("not-a-url", "in"), ZOHO_API_DOMAINS.in);
  assertEquals(resolveApiDomain("", null), ZOHO_API_DOMAINS.in);
});

Deno.test("zoho: the code is exchanged against the datacentre that issued it", async () => {
  const mock = mockFetch([{
    body: {
      access_token: "1000.access", refresh_token: "1000.refresh",
      api_domain: "https://www.zohoapis.eu", expires_in: 3600, scope: "ZohoCRM.modules.contacts.READ",
    },
  }]);
  try {
    const t = await exchangeCode("cid", "csec", "code", "https://cb.test", "eu");
    assertStringIncludes(mock.calls[0].url, "accounts.zoho.eu/oauth/v2/token");
    assertEquals(t.api_domain, "https://www.zohoapis.eu");
    assertEquals(t.refresh_token, "1000.refresh");
  } finally { mock.restore(); }
});

Deno.test("zoho: a 200 carrying {error} is a failure, not a grant", async () => {
  const mock = mockFetch([{ body: { error: "invalid_code" } }]);
  try {
    const err = await assertRejects(
      () => exchangeCode("cid", "csec", "bad", "https://cb.test", "in"),
      ZohoError,
    );
    assertEquals((err as ZohoError).code, "invalid_code");
  } finally { mock.restore(); }
});

/* ── searching ──────────────────────────────────────────────────────────── */

Deno.test("zoho: a 204 with an empty body means no match, not a crash", async () => {
  // Both modules answer 204. The old failure mode would be a thrown JSON parse
  // error inside afterInsightsSaved.
  const mock = mockFetch([{ status: 204 }, { status: 204 }]);
  try {
    assertEquals(await findRecordByEmail("https://www.zohoapis.in", "tok", "nobody@example.com"), null);
    assertEquals(mock.calls.length, 2);
  } finally { mock.restore(); }
});

Deno.test("zoho: a Contact wins over a Lead and is searched first", async () => {
  const mock = mockFetch([
    { body: { data: [{ id: "111", Full_Name: "Mathew Ryan" }] } },
  ]);
  try {
    const rec = await findRecordByEmail("https://www.zohoapis.in", "tok", "Mathew@Ryan.test");
    assertEquals(rec?.module, "Contacts");
    assertEquals(rec?.id, "111");
    // Email is normalised before it is sent, or the search misses on case.
    assertStringIncludes(mock.calls[0].url, "email=mathew%40ryan.test");
    assertStringIncludes(mock.calls[0].url, "/crm/v8/Contacts/search");
    assertEquals(mock.calls[0].auth, "Zoho-oauthtoken tok");
    // Leads were never queried: one match is enough.
    assertEquals(mock.calls.length, 1);
  } finally { mock.restore(); }
});

Deno.test("zoho: a Lead is used when no Contact matches", async () => {
  const mock = mockFetch([{ status: 204 }, { body: { data: [{ id: "222", Last_Name: "Patel" }] } }]);
  try {
    const rec = await findRecordByEmail("https://www.zohoapis.in", "tok", "v@p.test");
    assertEquals(rec?.module, "Leads");
    assertEquals(rec?.id, "222");
  } finally { mock.restore(); }
});

Deno.test("zoho: an address that is not an email never reaches the API", async () => {
  const mock = mockFetch([{ body: {} }]);
  try {
    assertEquals(await findRecordByEmail("https://www.zohoapis.in", "tok", "not-an-email"), null);
    assertEquals(mock.calls.length, 0);
  } finally { mock.restore(); }
});

/* ── writing ────────────────────────────────────────────────────────────── */

Deno.test("zoho: the note is posted to the record's related list", async () => {
  const mock = mockFetch([{ body: { data: [{ status: "success", details: { id: "999" } }] } }]);
  try {
    const id = await createNote("https://www.zohoapis.in", "tok", "Contacts", "111", "T", "body");
    assertEquals(id, "999");
    assertStringIncludes(mock.calls[0].url, "/crm/v8/Contacts/111/Notes");
    assertStringIncludes(mock.calls[0].body, '"Note_Title":"T"');
  } finally { mock.restore(); }
});

Deno.test("zoho: a per-row failure inside a 200 envelope is still a failure", async () => {
  // Zoho reports record-level errors in the body with an OK status. Trusting
  // the status would record a note id of "" as a success and never retry.
  const mock = mockFetch([{
    body: { data: [{ status: "error", code: "MANDATORY_NOT_FOUND", message: "required field missing" }] },
  }]);
  try {
    const err = await assertRejects(
      () => createNote("https://www.zohoapis.in", "tok", "Contacts", "111", "T", "b"),
      ZohoError,
    );
    assertEquals((err as ZohoError).code, "MANDATORY_NOT_FOUND");
  } finally { mock.restore(); }
});

/* ── the note body ──────────────────────────────────────────────────────── */

const meeting = { id: "m-1", title: "Ryan Travels" };
const insights = {
  summary_short: "Agreed to send a revised proposal.",
  decisions: ["Move to the annual plan"],
  action_items: [{ task: "Send the proposal", owner: "Khush", due_date: "2026-09-12" }],
  follow_ups: [{ description: "Schedule a follow-up call." }],
};

Deno.test("zoho: the note carries the four sections and a link back", () => {
  const { title, content } = buildNote(meeting, insights, "https://www.echobrief.in/", "Sep 7, 2026");
  assertStringIncludes(title, "EchoBrief — Ryan Travels");
  assertStringIncludes(title, "Sep 7, 2026");
  assertStringIncludes(content, "Agreed to send a revised proposal.");
  assertStringIncludes(content, "Decisions:\n- Move to the annual plan");
  assertStringIncludes(content, "- Send the proposal (Khush, 2026-09-12)");
  assertStringIncludes(content, "Next steps:\n- Schedule a follow-up call.");
  // Trailing slash on appUrl must not double up.
  assertStringIncludes(content, "https://www.echobrief.in/meeting/m-1");
});

Deno.test("zoho: the transcript and internal-zone fields never reach the CRM", () => {
  // A CRM note outlives the deal and is read by people who were not in the
  // room, so the boundary is at least as strict as Slack's.
  const { content } = buildNote(meeting, {
    ...insights,
    coaching: { note: "SECRET-COACHING" },
    facts: { numbers: [{ quote: "SECRET-FACT" }] },
    transcript: "SECRET-TRANSCRIPT",
  }, "https://www.echobrief.in", "");
  for (const secret of ["SECRET-COACHING", "SECRET-FACT", "SECRET-TRANSCRIPT"]) {
    assertEquals(content.includes(secret), false, `${secret} reached the CRM note`);
  }
});

Deno.test("zoho: a meeting with nothing to report still produces a usable note", () => {
  const { title, content } = buildNote(meeting, {}, "https://www.echobrief.in", "");
  assertEquals(title.length > 0, true);
  assertStringIncludes(content, "/meeting/m-1");
});
