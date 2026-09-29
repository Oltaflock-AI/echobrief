/**
 * Unit harness: Recall participant events + the owner's team names.
 * Mocked fetch and a stub Supabase client — no network, no prod.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { fetchParticipantEvents, internalNamesFor, parseParticipantEvents } from "../_shared/presence.ts";
import { jsonResponse, mockFetch } from "./helpers.ts";

// The shape Recall's participant_events download returns (trimmed).
const RAW = [
  { action: "join", participant: { id: 1, name: "Vineet Patel", is_host: false }, timestamp: { absolute: "x", relative: 0.4 } },
  { action: "speech_on", participant: { id: 1, name: "Vineet Patel" }, timestamp: { relative: 3 } },
  { action: "join", participant: { id: 2, name: "Mathew Ryan" }, timestamp: { relative: 559.2 } },
  { action: "leave", participant: { id: 2, name: "Mathew Ryan" }, timestamp: { relative: 1479 } },
  { action: "join", participant: { id: 3, name: "" }, timestamp: { relative: 5 } },
  { action: "leave", participant: { id: 4, name: "No Time" }, timestamp: {} },
];

Deno.test("parseParticipantEvents keeps named join/leave rows only", () => {
  assertEquals(parseParticipantEvents(RAW), [
    { action: "join", name: "Vineet Patel", ts: 0.4 },
    { action: "join", name: "Mathew Ryan", ts: 559.2 },
    { action: "leave", name: "Mathew Ryan", ts: 1479 },
  ]);
  assertEquals(parseParticipantEvents(null), []);
  assertEquals(parseParticipantEvents({ not: "a list" }), []);
});

const BOT = {
  recordings: [{
    media_shortcuts: {
      participant_events: { data: { participant_events_download_url: "https://cdn.example/pe" } },
    },
  }],
};

Deno.test("fetchParticipantEvents follows the bot's download URL", async () => {
  const restore = mockFetch((url) => {
    if (url.includes("/bot/bot-1/")) return jsonResponse(BOT);
    if (url === "https://cdn.example/pe") return jsonResponse(RAW);
    throw new Error(`unexpected fetch: ${url}`);
  });
  try {
    const events = await fetchParticipantEvents("bot-1");
    assertEquals(events.length, 3);
    assertEquals(events[1], { action: "join", name: "Mathew Ryan", ts: 559.2 });
  } finally {
    restore();
  }
});

Deno.test("fetchParticipantEvents: no download URL → []", async () => {
  const restore = mockFetch(() => jsonResponse({ recordings: [{ media_shortcuts: {} }] }));
  try {
    assertEquals(await fetchParticipantEvents("bot-1"), []);
  } finally {
    restore();
  }
});

Deno.test("fetchParticipantEvents: download failure → [] (never throws)", async () => {
  const restore = mockFetch((url) =>
    url.includes("/bot/") ? jsonResponse(BOT) : new Response("boom", { status: 500 })
  );
  try {
    assertEquals(await fetchParticipantEvents("bot-1"), []);
  } finally {
    restore();
  }
});

/** A tiny stand-in for the supabase-js query builder, keyed by table. */
function stubSupabase(tables: Record<string, Array<Record<string, unknown>>>, fail = false) {
  return {
    from(table: string) {
      let rows = tables[table] ?? [];
      const q = {
        select: () => q,
        eq: (col: string, val: unknown) => {
          rows = rows.filter((r) => r[col] === val);
          return q;
        },
        in: (col: string, vals: unknown[]) => {
          rows = rows.filter((r) => vals.includes(r[col]));
          return q;
        },
        maybeSingle: () => Promise.resolve(fail ? { data: null, error: { message: "down" } } : { data: rows[0] ?? null, error: null }),
        then: (resolve: (v: unknown) => void) =>
          resolve(fail ? { data: null, error: { message: "down" } } : { data: rows, error: null }),
      };
      return q;
    },
  };
}

const TABLES = {
  profiles: [
    { user_id: "khush", full_name: "Khush Mutha" },
    { user_id: "vineet", full_name: "Vineet Patel" },
    { user_id: "stranger", full_name: "Someone Else" },
  ],
  org_members: [
    { org_id: "olta", user_id: "khush" },
    { org_id: "olta", user_id: "vineet" },
    { org_id: "other", user_id: "stranger" },
  ],
};

Deno.test("internalNamesFor: the owner plus their workspace, nobody else", async () => {
  const names = await internalNamesFor(stubSupabase(TABLES), "khush");
  assertEquals(names.sort(), ["Khush Mutha", "Vineet Patel"]);
});

Deno.test("internalNamesFor: no workspace → just the owner", async () => {
  const names = await internalNamesFor(stubSupabase({ ...TABLES, org_members: [] }), "khush");
  assertEquals(names, ["Khush Mutha"]);
});

Deno.test("internalNamesFor: read failure → [] (never throws)", async () => {
  assertEquals(await internalNamesFor(stubSupabase(TABLES, true), "khush"), []);
});
