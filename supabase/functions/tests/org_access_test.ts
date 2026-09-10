import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { isLiveOrgShare, orgShareFor } from "../_shared/org-access.ts";
import { autoShareToOrg } from "../_shared/org-share.ts";

/**
 * These two modules are the whole of "can a colleague read this?", so the cases
 * that matter are the denials: no membership, a different workspace, a revoked
 * or expired row, and a lookup that errored. Every one of them must come back
 * as no access — a bug here is a cross-tenant read, not a cosmetic defect.
 */

// --- the pure rule ----------------------------------------------------------

Deno.test("isLiveOrgShare accepts a live org row", () => {
  assertEquals(isLiveOrgShare({ scope: "org", revoked_at: null, expires_at: null }), true);
});

Deno.test("isLiveOrgShare rejects a link-scoped row", () => {
  assertEquals(isLiveOrgShare({ scope: "link", revoked_at: null }), false);
});

Deno.test("isLiveOrgShare rejects revoked and expired rows", () => {
  const now = new Date("2026-09-10T00:00:00Z");
  assertEquals(isLiveOrgShare({ scope: "org", revoked_at: "2026-09-09T00:00:00Z" }, now), false);
  assertEquals(isLiveOrgShare({ scope: "org", expires_at: "2026-09-09T00:00:00Z" }, now), false);
  assertEquals(isLiveOrgShare({ scope: "org", expires_at: "2026-09-11T00:00:00Z" }, now), true);
});

Deno.test("isLiveOrgShare rejects an unparseable expiry rather than ignoring it", () => {
  assertEquals(isLiveOrgShare({ scope: "org", expires_at: "whenever" }), false);
});

Deno.test("isLiveOrgShare rejects null", () => {
  assertEquals(isLiveOrgShare(null), false);
});

// --- the lookup -------------------------------------------------------------

// deno-lint-ignore no-explicit-any
function fakeSupabase(opts: any = {}) {
  const filters: Record<string, unknown> = {};
  return {
    _filters: filters,
    from(table: string) {
      if (table === "org_members") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: opts.membership ?? null,
                  error: opts.membershipError ?? null,
                }),
            }),
          }),
        };
      }
      if (table === "meeting_shares") {
        const chain = {
          eq: (col: string, val: unknown) => {
            filters[col] = val;
            return chain;
          },
          maybeSingle: () =>
            Promise.resolve({ data: opts.share ?? null, error: opts.shareError ?? null }),
        };
        return { select: () => chain };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

const LIVE_SHARE = {
  id: "share-1",
  org_id: "org-1",
  scope: "org",
  revoked_at: null,
  expires_at: null,
  include_transcript: true,
  include_recording: true,
};

Deno.test("orgShareFor grants a member of the sharing workspace", async () => {
  const db = fakeSupabase({ membership: { org_id: "org-1" }, share: LIVE_SHARE });
  const access = await orgShareFor(db, "meeting-1", "user-1");
  assertEquals(access?.orgId, "org-1");
  assertEquals(access?.includeTranscript, true);
  assertEquals(access?.includeRecording, true);
  // The share is looked up scoped to the caller's own org, not just the meeting.
  assertEquals(db._filters["org_id"], "org-1");
  assertEquals(db._filters["scope"], "org");
});

Deno.test("orgShareFor denies a user in no workspace", async () => {
  assertEquals(await orgShareFor(fakeSupabase({ membership: null }), "m1", "u1"), null);
});

Deno.test("orgShareFor denies when the meeting is not shared", async () => {
  const db = fakeSupabase({ membership: { org_id: "org-1" }, share: null });
  assertEquals(await orgShareFor(db, "m1", "u1"), null);
});

Deno.test("orgShareFor denies a revoked share", async () => {
  const db = fakeSupabase({
    membership: { org_id: "org-1" },
    share: { ...LIVE_SHARE, revoked_at: "2020-01-01T00:00:00Z" },
  });
  assertEquals(await orgShareFor(db, "m1", "u1"), null);
});

Deno.test("orgShareFor reports the flags separately", async () => {
  const db = fakeSupabase({
    membership: { org_id: "org-1" },
    share: { ...LIVE_SHARE, include_recording: false },
  });
  const access = await orgShareFor(db, "m1", "u1");
  assertEquals(access?.includeTranscript, true);
  assertEquals(access?.includeRecording, false);
});

Deno.test("orgShareFor denies when a lookup errors", async () => {
  assertEquals(
    await orgShareFor(fakeSupabase({ membershipError: { message: "boom" } }), "m1", "u1"),
    null,
  );
  assertEquals(
    await orgShareFor(
      fakeSupabase({ membership: { org_id: "org-1" }, shareError: { message: "boom" } }),
      "m1",
      "u1",
    ),
    null,
  );
});

Deno.test("orgShareFor denies without a meeting or user id", async () => {
  const db = fakeSupabase({ membership: { org_id: "org-1" }, share: LIVE_SHARE });
  assertEquals(await orgShareFor(db, "", "u1"), null);
  assertEquals(await orgShareFor(db, "m1", ""), null);
});

// --- the auto-share setting -------------------------------------------------

// deno-lint-ignore no-explicit-any
function fakeAutoShareDb(opts: any = {}) {
  // deno-lint-ignore no-explicit-any
  const inserts: any[] = [];
  return {
    inserts,
    from(table: string) {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({ data: opts.profile ?? null, error: opts.profileError ?? null }),
            }),
          }),
        };
      }
      if (table === "org_members") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: opts.membership ?? null, error: null }),
            }),
          }),
        };
      }
      if (table === "meeting_shares") {
        return {
          // deno-lint-ignore no-explicit-any
          insert: (row: any) => {
            inserts.push(row);
            return Promise.resolve({ error: opts.insertError ?? null });
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

const MEETING = { id: "meeting-1", user_id: "owner-1" };

Deno.test("autoShareToOrg writes a full-access org share when the setting is on", async () => {
  const db = fakeAutoShareDb({
    profile: { auto_share_to_org: true },
    membership: { org_id: "org-1" },
  });
  assertEquals(await autoShareToOrg(db, MEETING), true);
  assertEquals(db.inserts.length, 1);
  assertEquals(db.inserts[0].scope, "org");
  assertEquals(db.inserts[0].org_id, "org-1");
  assertEquals(db.inserts[0].include_transcript, true);
  assertEquals(db.inserts[0].include_recording, true);
});

Deno.test("autoShareToOrg does nothing when the setting is off", async () => {
  const db = fakeAutoShareDb({
    profile: { auto_share_to_org: false },
    membership: { org_id: "org-1" },
  });
  assertEquals(await autoShareToOrg(db, MEETING), false);
  assertEquals(db.inserts.length, 0);
});

Deno.test("autoShareToOrg does nothing when the owner is in no workspace", async () => {
  const db = fakeAutoShareDb({ profile: { auto_share_to_org: true }, membership: null });
  assertEquals(await autoShareToOrg(db, MEETING), false);
  assertEquals(db.inserts.length, 0);
});

Deno.test("autoShareToOrg treats an existing share as success, not an error", async () => {
  const db = fakeAutoShareDb({
    profile: { auto_share_to_org: true },
    membership: { org_id: "org-1" },
    insertError: { code: "23505", message: "duplicate key" },
  });
  assertEquals(await autoShareToOrg(db, MEETING), true);
});

Deno.test("autoShareToOrg never throws when the database misbehaves", async () => {
  const db = fakeAutoShareDb({ profileError: { message: "boom" } });
  assertEquals(await autoShareToOrg(db, MEETING), false);
  // A thrown error inside from() must not escape either — this runs after the
  // insights are saved, and an exception here would fail a finished meeting.
  const exploding = {
    from() {
      throw new Error("connection lost");
    },
  };
  assertEquals(await autoShareToOrg(exploding, MEETING), false);
});

Deno.test("autoShareToOrg ignores a meeting with no owner", async () => {
  const db = fakeAutoShareDb({ profile: { auto_share_to_org: true } });
  assertEquals(await autoShareToOrg(db, { id: "m1" }), false);
  assertEquals(db.inserts.length, 0);
});
