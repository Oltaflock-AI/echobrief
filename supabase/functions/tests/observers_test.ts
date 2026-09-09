import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { grantMeetingObservers, resolveObservers } from "../_shared/observers.ts";

/**
 * Stand-in for supabase-js covering only the chains this module uses:
 *   summary_recipient_allowlist: select().eq().eq()
 *   profiles:                    select().in()
 *   calendar_events:             select().eq().eq().maybeSingle()
 *   meeting_observers:           upsert()
 */
function fakeSupabase(opts: {
  allowlist?: Array<{ email: string }>;
  allowlistError?: { message: string };
  profiles?: Array<{ user_id: string; email: string }>;
  profilesError?: { message: string };
  calendarEvent?: { attendees: unknown } | null;
  upsertError?: { message: string };
  // deno-lint-ignore no-explicit-any
  upserts?: any[];
}) {
  return {
    from(table: string) {
      if (table === "summary_recipient_allowlist") {
        return {
          select: () => ({
            eq: () => ({
              eq: () =>
                Promise.resolve({
                  data: opts.allowlist ?? [],
                  error: opts.allowlistError ?? null,
                }),
            }),
          }),
        };
      }
      if (table === "profiles") {
        return {
          select: () => ({
            in: () =>
              Promise.resolve({
                data: opts.profiles ?? [],
                error: opts.profilesError ?? null,
              }),
          }),
        };
      }
      if (table === "calendar_events") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () =>
                  Promise.resolve({ data: opts.calendarEvent ?? null, error: null }),
              }),
            }),
          }),
        };
      }
      if (table === "meeting_observers") {
        return {
          // deno-lint-ignore no-explicit-any
          upsert: (rows: any[]) => {
            opts.upserts?.push(rows);
            return Promise.resolve({ error: opts.upsertError ?? null });
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

const ALLOWLIST = [{ email: "vineet@oltaflock.ai" }];
const PROFILES = [{ user_id: "vineet-uid", email: "vineet@oltaflock.ai" }];
const MEETING = {
  id: "m1",
  user_id: "owner-uid",
  attendees: [{ email: "owner@oltaflock.ai" }, { email: "Vineet@Oltaflock.ai" }],
};

Deno.test("an allowlisted attendee with dashboard access is granted", async () => {
  const grants = await resolveObservers(
    fakeSupabase({ allowlist: ALLOWLIST, profiles: PROFILES }),
    MEETING,
  );
  assertEquals(grants, [{ user_id: "vineet-uid", email: "vineet@oltaflock.ai" }]);
});

Deno.test("an allowlisted reviewer who was NOT on the invite is not granted", async () => {
  const grants = await resolveObservers(
    fakeSupabase({ allowlist: ALLOWLIST, profiles: PROFILES }),
    { id: "m2", user_id: "owner-uid", attendees: [{ email: "someone@else.com" }] },
  );
  assertEquals(grants, []);
});

Deno.test("an attendee who is not on the allowlist is not granted", async () => {
  const grants = await resolveObservers(
    fakeSupabase({ allowlist: [], profiles: [] }),
    MEETING,
  );
  assertEquals(grants, []);
});

Deno.test("the owner is never granted a grant on their own meeting", async () => {
  const grants = await resolveObservers(
    fakeSupabase({
      allowlist: [{ email: "owner@oltaflock.ai" }],
      profiles: [{ user_id: "owner-uid", email: "owner@oltaflock.ai" }],
    }),
    MEETING,
  );
  assertEquals(grants, []);
});

Deno.test("attendees fall back to the synced calendar event", async () => {
  const grants = await resolveObservers(
    fakeSupabase({
      allowlist: ALLOWLIST,
      profiles: PROFILES,
      calendarEvent: { attendees: JSON.stringify([{ email: "vineet@oltaflock.ai" }]) },
    }),
    { id: "m3", user_id: "owner-uid", attendees: null, calendar_event_id: "evt-1" },
  );
  assertEquals(grants, [{ user_id: "vineet-uid", email: "vineet@oltaflock.ai" }]);
});

Deno.test("an allowlisted reviewer with no account yet is skipped, not crashed on", async () => {
  const grants = await resolveObservers(
    fakeSupabase({ allowlist: ALLOWLIST, profiles: [] }),
    MEETING,
  );
  assertEquals(grants, []);
});

Deno.test("a profile whose email only differs in case still matches", async () => {
  const grants = await resolveObservers(
    fakeSupabase({
      allowlist: ALLOWLIST,
      profiles: [{ user_id: "vineet-uid", email: "Vineet@Oltaflock.AI" }],
    }),
    MEETING,
  );
  assertEquals(grants, [{ user_id: "vineet-uid", email: "vineet@oltaflock.ai" }]);
});

Deno.test("an allowlist lookup failure costs the grant, not the meeting", async () => {
  const grants = await resolveObservers(
    fakeSupabase({ allowlistError: { message: "boom" } }),
    MEETING,
  );
  assertEquals(grants, []);
});

Deno.test("grantMeetingObservers writes one row per grant", async () => {
  // deno-lint-ignore no-explicit-any
  const upserts: any[] = [];
  const granted = await grantMeetingObservers(
    fakeSupabase({ allowlist: ALLOWLIST, profiles: PROFILES, upserts }),
    MEETING,
  );
  assertEquals(granted, ["vineet@oltaflock.ai"]);
  assertEquals(upserts.length, 1);
  assertEquals(upserts[0], [{
    meeting_id: "m1",
    user_id: "vineet-uid",
    email: "vineet@oltaflock.ai",
    reason: "allowlist_attendee",
  }]);
});

Deno.test("a failed write is reported as no grants, never thrown", async () => {
  const granted = await grantMeetingObservers(
    fakeSupabase({
      allowlist: ALLOWLIST,
      profiles: PROFILES,
      upsertError: { message: "constraint" },
    }),
    MEETING,
  );
  assertEquals(granted, []);
});

Deno.test("nothing is written when there is nothing to grant", async () => {
  // deno-lint-ignore no-explicit-any
  const upserts: any[] = [];
  const granted = await grantMeetingObservers(
    fakeSupabase({ allowlist: [], profiles: [], upserts }),
    MEETING,
  );
  assertEquals(granted, []);
  assertEquals(upserts.length, 0);
});
