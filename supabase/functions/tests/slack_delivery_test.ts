/**
 * `deliverToSlack`, against a stubbed database and a stubbed Slack.
 *
 * This is the piece that runs unattended on every completed meeting, including
 * regenerations of meetings from weeks ago, so the interesting assertions are
 * all about what it declines to do: post twice, post a harness meeting, post
 * before a channel is chosen, or keep quietly failing after a grant is revoked.
 *
 * The claim row is the load-bearing part. It is inserted BEFORE the post, so a
 * replayed Sarvam callback collides on `(meeting_id, channel_id)` and returns
 * instead of posting again — a duplicate Slack message is visible to a whole
 * channel and cannot be unsent.
 */
import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { deliverToSlack } from "../_shared/slack-delivery.ts";

interface Op { op: string; table: string; row?: Record<string, unknown> }

/**
 * The narrow slice of the supabase client this module uses: one maybeSingle
 * read, one insert, and updates that are awaited after two `.eq()` calls.
 */
function fakeSupabase(conn: Record<string, unknown> | null, claimError: { code: string } | null = null) {
  const ops: Op[] = [];
  const from = (table: string) => {
    const chain: any = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: () => Promise.resolve({ data: table === "slack_connections" ? conn : null }),
      insert: (row: Record<string, unknown>) => {
        ops.push({ op: "insert", table, row });
        return Promise.resolve({ error: claimError });
      },
      update: (row: Record<string, unknown>) => {
        ops.push({ op: "update", table, row });
        return chain;
      },
      // `await supabase.from(x).update(y).eq(...).eq(...)` resolves here.
      then: (res: (v: unknown) => void) => res({ data: null, error: null }),
    };
    return chain;
  };
  return { client: { from } as any, ops };
}

/** Slack, answering `chat.postMessage` with whatever this test needs. */
function mockSlack(reply: Record<string, unknown>) {
  const calls: Array<{ url: string; body: string }> = [];
  const original = globalThis.fetch;
  globalThis.fetch = ((url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), body: String(init?.body ?? "") });
    return Promise.resolve(new Response(JSON.stringify(reply), { status: 200 }));
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = original; } };
}

const connected = {
  id: "conn-1",
  user_id: "u-1",
  access_token: "xoxb-plaintext-in-test",
  team_id: "T1",
  channel_id: "C1",
  channel_name: "meetings",
  needs_reconnect: false,
};
const meeting = { id: "m-1", user_id: "u-1", title: "Pricing review" };
const insights = { summary_short: "We agreed the new pricing.", action_items: ["Send the deck"] };

Deno.test("slack delivery: no connection posts nothing and claims nothing", async () => {
  const db = fakeSupabase(null);
  const slack = mockSlack({ ok: true, ts: "1.1" });
  try {
    assertEquals(await deliverToSlack(db.client, meeting, insights), { posted: false, reason: "not_connected" });
    assertEquals(slack.calls.length, 0);
    assertEquals(db.ops.length, 0);
  } finally { slack.restore(); }
});

Deno.test("slack delivery: a connection with no channel chosen posts nothing", async () => {
  // Connecting the workspace and choosing a destination are separate steps;
  // there is no safe default channel to fall back on.
  const db = fakeSupabase({ ...connected, channel_id: null, channel_name: null });
  const slack = mockSlack({ ok: true, ts: "1.1" });
  try {
    assertEquals(await deliverToSlack(db.client, meeting, insights), { posted: false, reason: "no_channel" });
    assertEquals(slack.calls.length, 0);
  } finally { slack.restore(); }
});

Deno.test("slack delivery: a harness meeting never reaches a real channel", async () => {
  // The same rule as summary emails. It must also not CLAIM, or a later real
  // run against that meeting id would be skipped as already posted.
  const db = fakeSupabase(connected);
  const slack = mockSlack({ ok: true, ts: "1.1" });
  try {
    const result = await deliverToSlack(db.client, { ...meeting, title: "[harness] pipeline" }, insights);
    assertEquals(result, { posted: false, reason: "harness_meeting" });
    assertEquals(slack.calls.length, 0);
    assertEquals(db.ops.filter((o) => o.op === "insert").length, 0);
  } finally { slack.restore(); }
});

Deno.test("slack delivery: the claim is inserted before the post", async () => {
  const db = fakeSupabase(connected);
  const slack = mockSlack({ ok: true, ts: "1725790000.001" });
  try {
    assertEquals(await deliverToSlack(db.client, meeting, insights), { posted: true });
    assertEquals(db.ops[0].op, "insert");
    assertEquals(db.ops[0].table, "slack_deliveries");
    assertEquals(db.ops[0].row?.channel_id, "C1");
    assertEquals(slack.calls.length, 1);
    assertEquals(slack.calls[0].url.endsWith("/chat.postMessage"), true);
    // The message timestamp is written back, which is what distinguishes a sent
    // row from a claimed-but-failed one.
    const stamped = db.ops.find((o) => o.op === "update" && "message_ts" in (o.row ?? {}));
    assertEquals(stamped?.row?.message_ts, "1725790000.001");
  } finally { slack.restore(); }
});

Deno.test("slack delivery: a replayed callback loses the claim and does not post", async () => {
  const db = fakeSupabase(connected, { code: "23505" });
  const slack = mockSlack({ ok: true, ts: "1.1" });
  try {
    assertEquals(await deliverToSlack(db.client, meeting, insights), { posted: false, reason: "already_posted" });
    assertEquals(slack.calls.length, 0);
  } finally { slack.restore(); }
});

Deno.test("slack delivery: a revoked token flags needs_reconnect and keeps the claim", async () => {
  const db = fakeSupabase(connected);
  const slack = mockSlack({ ok: false, error: "token_revoked" });
  try {
    assertEquals(await deliverToSlack(db.client, meeting, insights), { posted: false, reason: "token_revoked" });
    const flagged = db.ops.find((o) => o.table === "slack_connections" && o.row?.needs_reconnect === true);
    assertEquals(!!flagged, true);
    // The claim row records why rather than being released: releasing it would
    // let every future regeneration retry a grant that is never coming back.
    const errored = db.ops.find((o) => o.table === "slack_deliveries" && typeof o.row?.error === "string");
    assertEquals(String(errored?.row?.error).startsWith("token_revoked:"), true);
  } finally { slack.restore(); }
});

Deno.test("slack delivery: a deleted channel clears the channel, not the connection", async () => {
  // The workspace is fine, the destination is not. Clearing it turns "silently
  // not posting" into a visible "pick a channel" in Settings.
  const db = fakeSupabase(connected);
  const slack = mockSlack({ ok: false, error: "channel_not_found" });
  try {
    assertEquals(await deliverToSlack(db.client, meeting, insights), { posted: false, reason: "channel_not_found" });
    const cleared = db.ops.find((o) => o.table === "slack_connections" && o.row?.channel_id === null);
    assertEquals(!!cleared, true);
    assertEquals(db.ops.some((o) => o.row?.needs_reconnect === true), false);
  } finally { slack.restore(); }
});

Deno.test("slack delivery: a database failure is swallowed, never thrown", async () => {
  // It runs last, after the insights are already saved. Throwing here would
  // fail a meeting that actually succeeded.
  const exploding = { from: () => { throw new Error("connection terminated"); } } as any;
  const result = await deliverToSlack(exploding, meeting, insights);
  assertEquals(result, { posted: false, reason: "error" });
});

Deno.test("slack delivery: 'only when I choose' skips the pipeline, and never claims", async () => {
  // Not claiming matters: a claim here would make the owner's later "Post"
  // press read as already posted.
  const db = fakeSupabase({ ...connected, auto_post: false });
  const slack = mockSlack({ ok: true, ts: "1.1" });
  try {
    assertEquals(await deliverToSlack(db.client, meeting, insights), { posted: false, reason: "manual_mode" });
    assertEquals(slack.calls.length, 0);
    assertEquals(db.ops.length, 0);
  } finally { slack.restore(); }
});

Deno.test("slack delivery: a manual post goes through when auto-post is off, via the same claim", async () => {
  const db = fakeSupabase({ ...connected, auto_post: false });
  const slack = mockSlack({ ok: true, ts: "1.2" });
  try {
    assertEquals(await deliverToSlack(db.client, meeting, insights, { manual: true }), { posted: true });
    assertEquals(db.ops[0].op, "insert");
    assertEquals(db.ops[0].table, "slack_deliveries");
    assertEquals(slack.calls.length, 1);
  } finally { slack.restore(); }
});

Deno.test("slack delivery: a connection without the column still auto-posts", async () => {
  // Rows read before the migration lands have no auto_post key at all; only an
  // explicit false opts out.
  const { auto_post: _, ...legacy } = { ...connected, auto_post: undefined };
  const db = fakeSupabase(legacy);
  const slack = mockSlack({ ok: true, ts: "1.3" });
  try {
    assertEquals(await deliverToSlack(db.client, meeting, insights), { posted: true });
  } finally { slack.restore(); }
});
