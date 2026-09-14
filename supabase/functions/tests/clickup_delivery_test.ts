/**
 * `deliverToClickUp`, against a stubbed database and a stubbed ClickUp.
 *
 * The interesting assertions are all about what it declines to do: post
 * twice, post a harness meeting, post before a channel is chosen, or keep
 * quietly failing after a grant is revoked. The claim row is inserted BEFORE
 * the post, so a replayed Sarvam callback collides on (meeting_id, channel_id)
 * and returns instead of posting again.
 */
import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { deliverToClickUp } from "../_shared/clickup-delivery.ts";

interface Op { op: string; table: string; row?: Record<string, unknown> }

function fakeSupabase(conn: Record<string, unknown> | null, claimError: { code: string } | null = null) {
  const ops: Op[] = [];
  const from = (table: string) => {
    const chain: any = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: () => Promise.resolve({ data: table === "clickup_connections" ? conn : null }),
      insert: (row: Record<string, unknown>) => {
        ops.push({ op: "insert", table, row });
        return Promise.resolve({ error: claimError });
      },
      update: (row: Record<string, unknown>) => {
        ops.push({ op: "update", table, row });
        return chain;
      },
      then: (res: (v: unknown) => void) => res({ data: null, error: null }),
    };
    return chain;
  };
  return { client: { from } as any, ops };
}

function mockClickUp(body: unknown, status = 201) {
  const calls: Array<{ url: string; body: string }> = [];
  const original = globalThis.fetch;
  globalThis.fetch = ((url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), body: String(init?.body ?? "") });
    return Promise.resolve(new Response(JSON.stringify(body), { status }));
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = original; } };
}

const connected = {
  id: "conn-1",
  user_id: "u-1",
  access_token: "plaintext-in-test",
  workspaces: [{ id: "9001", name: "Acme" }],
  workspace_id: "9001",
  workspace_name: "Acme",
  channel_id: "c-1",
  channel_name: "meetings",
  needs_reconnect: false,
};
const meeting = { id: "m-1", user_id: "u-1", title: "Pricing review" };
const insights = { summary_short: "We agreed the new pricing.", action_items: ["Send the deck"] };

Deno.test("clickup delivery: no connection posts nothing and claims nothing", async () => {
  const db = fakeSupabase(null);
  const cu = mockClickUp({ id: "msg" });
  try {
    assertEquals(await deliverToClickUp(db.client, meeting, insights), { posted: false, reason: "not_connected" });
    assertEquals(cu.calls.length, 0);
    assertEquals(db.ops.length, 0);
  } finally { cu.restore(); }
});

Deno.test("clickup delivery: a connection with no channel chosen posts nothing", async () => {
  const db = fakeSupabase({ ...connected, channel_id: null, channel_name: null });
  const cu = mockClickUp({ id: "msg" });
  try {
    assertEquals(await deliverToClickUp(db.client, meeting, insights), { posted: false, reason: "no_channel" });
    assertEquals(cu.calls.length, 0);
  } finally { cu.restore(); }
});

Deno.test("clickup delivery: needs_reconnect posts nothing", async () => {
  const db = fakeSupabase({ ...connected, needs_reconnect: true });
  const cu = mockClickUp({ id: "msg" });
  try {
    assertEquals(await deliverToClickUp(db.client, meeting, insights), { posted: false, reason: "needs_reconnect" });
    assertEquals(cu.calls.length, 0);
  } finally { cu.restore(); }
});

Deno.test("clickup delivery: a harness meeting never reaches a real channel, and never claims", async () => {
  const db = fakeSupabase(connected);
  const cu = mockClickUp({ id: "msg" });
  try {
    const result = await deliverToClickUp(db.client, { ...meeting, title: "[harness] pipeline" }, insights);
    assertEquals(result, { posted: false, reason: "harness_meeting" });
    assertEquals(cu.calls.length, 0);
    assertEquals(db.ops.filter((o) => o.op === "insert").length, 0);
  } finally { cu.restore(); }
});

Deno.test("clickup delivery: the claim is inserted before the post, and the id written back", async () => {
  const db = fakeSupabase(connected);
  const cu = mockClickUp({ id: "msg-42" });
  try {
    assertEquals(await deliverToClickUp(db.client, meeting, insights), { posted: true });
    assertEquals(db.ops[0].op, "insert");
    assertEquals(db.ops[0].table, "clickup_deliveries");
    assertEquals(db.ops[0].row?.channel_id, "c-1");
    assertEquals(cu.calls.length, 1);
    assertEquals(cu.calls[0].url.endsWith("/workspaces/9001/chat/channels/c-1/messages"), true);
    const stamped = db.ops.find((o) => o.op === "update" && "message_id" in (o.row ?? {}));
    assertEquals(stamped?.row?.message_id, "msg-42");
  } finally { cu.restore(); }
});

Deno.test("clickup delivery: a replayed callback loses the claim and does not post", async () => {
  const db = fakeSupabase(connected, { code: "23505" });
  const cu = mockClickUp({ id: "msg" });
  try {
    assertEquals(await deliverToClickUp(db.client, meeting, insights), { posted: false, reason: "already_posted" });
    assertEquals(cu.calls.length, 0);
  } finally { cu.restore(); }
});

Deno.test("clickup delivery: a revoked grant flags needs_reconnect and keeps the claim", async () => {
  const db = fakeSupabase(connected);
  const cu = mockClickUp({ err: "Oauth token not found", ECODE: "OAUTH_027" }, 401);
  try {
    assertEquals(await deliverToClickUp(db.client, meeting, insights), { posted: false, reason: "OAUTH_027" });
    assertEquals(!!db.ops.find((o) => o.table === "clickup_connections" && o.row?.needs_reconnect === true), true);
    const errored = db.ops.find((o) => o.table === "clickup_deliveries" && typeof o.row?.error === "string");
    assertEquals(String(errored?.row?.error).startsWith("OAUTH_027:"), true);
  } finally { cu.restore(); }
});

Deno.test("clickup delivery: a deleted channel clears the channel, not the connection", async () => {
  const db = fakeSupabase(connected);
  const cu = mockClickUp({ message: "Channel not found" }, 404);
  try {
    assertEquals(await deliverToClickUp(db.client, meeting, insights), { posted: false, reason: "http_404" });
    assertEquals(!!db.ops.find((o) => o.table === "clickup_connections" && o.row?.channel_id === null), true);
    assertEquals(db.ops.some((o) => o.row?.needs_reconnect === true), false);
  } finally { cu.restore(); }
});

Deno.test("clickup delivery: a database failure is swallowed, never thrown", async () => {
  const exploding = { from: () => { throw new Error("connection terminated"); } } as any;
  assertEquals(await deliverToClickUp(exploding, meeting, insights), { posted: false, reason: "error" });
});
