import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  extractAttendeeEmails,
  matchPresentReviewers,
  resolveAllowlistedRecipients,
} from "../_shared/summary-recipients.ts";

/**
 * Stand-in for supabase-js covering only the two chains this module uses:
 *   calendar_events: select().eq().eq().maybeSingle()
 *   summary_recipient_allowlist: select().eq()
 */
function fakeSupabase(opts: {
  allowlist?: Array<{ email: string }>;
  allowlistError?: { message: string };
  calendarEvent?: { attendees: unknown } | null;
  profiles?: Array<{ email: string; full_name: string | null }>;
}) {
  return {
    from(table: string) {
      if (table === "summary_recipient_allowlist") {
        return {
          select: () => ({
            eq: () =>
              Promise.resolve({
                data: opts.allowlist ?? [],
                error: opts.allowlistError ?? null,
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
      if (table === "profiles") {
        return {
          select: () => ({
            in: (_col: string, emails: string[]) =>
              Promise.resolve({
                data: (opts.profiles ?? []).filter((p) => emails.includes(p.email)),
                error: null,
              }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

const ALLOWLIST = [
  { email: "vineet@oltaflock.ai" },
  { email: "adnanbarwaniwala7@gmail.com" },
  { email: "admin@oltaflock.ai" },
];

Deno.test("extractAttendeeEmails reads Google attendee objects", () => {
  assertEquals(
    extractAttendeeEmails([
      { email: "A@Example.com", displayName: "A" },
      { email: "b@example.com" },
    ]),
    ["a@example.com", "b@example.com"],
  );
});

Deno.test("extractAttendeeEmails parses the JSON string calendar sync writes", () => {
  assertEquals(
    extractAttendeeEmails(JSON.stringify([{ email: "vineet@oltaflock.ai" }])),
    ["vineet@oltaflock.ai"],
  );
});

Deno.test("extractAttendeeEmails survives null, junk and non-arrays", () => {
  assertEquals(extractAttendeeEmails(null), []);
  assertEquals(extractAttendeeEmails("not json"), []);
  assertEquals(extractAttendeeEmails({ email: "x@y.com" }), []);
  assertEquals(extractAttendeeEmails([{ displayName: "no email" }, 42]), []);
});

Deno.test("allowlisted attendee gets a copy; other attendees do not", async () => {
  const recipients = await resolveAllowlistedRecipients(
    fakeSupabase({ allowlist: ALLOWLIST }),
    {
      user_id: "u1",
      attendees: [
        { email: "owner@company.com" },
        { email: "Vineet@Oltaflock.ai" },
        { email: "stranger@elsewhere.com" },
      ],
    },
    "owner@company.com",
  );
  assertEquals(recipients, ["vineet@oltaflock.ai"]);
});

Deno.test("the owner is never double-mailed even when allowlisted", async () => {
  const recipients = await resolveAllowlistedRecipients(
    fakeSupabase({ allowlist: ALLOWLIST }),
    { user_id: "u1", attendees: [{ email: "admin@oltaflock.ai" }] },
    "Admin@Oltaflock.ai",
  );
  assertEquals(recipients, []);
});

Deno.test("allowlisted user not on the invite gets nothing", async () => {
  const recipients = await resolveAllowlistedRecipients(
    fakeSupabase({ allowlist: ALLOWLIST }),
    { user_id: "u1", attendees: [{ email: "someone@else.com" }] },
    "owner@company.com",
  );
  assertEquals(recipients, []);
});

Deno.test("falls back to calendar_events when the meeting row has no attendees", async () => {
  const recipients = await resolveAllowlistedRecipients(
    fakeSupabase({
      allowlist: ALLOWLIST,
      calendarEvent: {
        attendees: JSON.stringify([
          { email: "owner@company.com" },
          { email: "adnanbarwaniwala7@gmail.com" },
        ]),
      },
    }),
    { user_id: "u1", attendees: null, calendar_event_id: "evt-1" },
    "owner@company.com",
  );
  assertEquals(recipients, ["adnanbarwaniwala7@gmail.com"]);
});

Deno.test("no attendees anywhere → no extra recipients, no lookup crash", async () => {
  const recipients = await resolveAllowlistedRecipients(
    fakeSupabase({ allowlist: ALLOWLIST, calendarEvent: null }),
    { user_id: "u1", attendees: [], calendar_event_id: "evt-missing" },
    "owner@company.com",
  );
  assertEquals(recipients, []);
});

Deno.test("a broken allowlist lookup fails closed on the copy, not on the summary", async () => {
  const recipients = await resolveAllowlistedRecipients(
    fakeSupabase({ allowlistError: { message: "relation does not exist" } }),
    { user_id: "u1", attendees: [{ email: "vineet@oltaflock.ai" }] },
    "owner@company.com",
  );
  assertEquals(recipients, []);
});

Deno.test("duplicate allowlist rows collapse to one send", async () => {
  const recipients = await resolveAllowlistedRecipients(
    fakeSupabase({
      allowlist: [{ email: "vineet@oltaflock.ai" }, { email: "VINEET@oltaflock.ai" }],
    }),
    { user_id: "u1", attendees: [{ email: "vineet@oltaflock.ai" }] },
    "owner@company.com",
  );
  assertEquals(recipients, ["vineet@oltaflock.ai"]);
});

// ── Present on the call, not on the invite ────────────────────────────────
// A bot started by hand has no attendee list. Recall still records who joined,
// and a reviewer whose profile name is among them gets the copy.

// The shape actually stored in processing_config (checked against a prod row).
const joined = (...names: string[]) => names.map((name, i) => ({ ts: i * 10, name, action: "join" }));

const PROFILES = [
  { email: "vineet@oltaflock.ai", full_name: "Vineet Patel" },
  { email: "admin@oltaflock.ai", full_name: "admin" },
];

Deno.test("presence: a hand-started call with Vineet on it copies Vineet", async () => {
  const supabase = fakeSupabase({ allowlist: ALLOWLIST, profiles: PROFILES });
  const meeting = {
    id: "m1",
    user_id: "u1",
    attendees: null,
    processing_config: { recall_participant_events: joined("Khush Mutha", "Vineet Patel", "Grant Williams") },
  };
  assertEquals(await resolveAllowlistedRecipients(supabase, meeting, "khush@oltaflock.ai"), ["vineet@oltaflock.ai"]);
});

Deno.test("presence: a call Vineet was not on copies nobody", async () => {
  const supabase = fakeSupabase({ allowlist: ALLOWLIST, profiles: PROFILES });
  const meeting = {
    id: "m2",
    user_id: "u1",
    attendees: null,
    processing_config: { recall_participant_events: joined("Khush Mutha", "Grant Williams") },
  };
  assertEquals(await resolveAllowlistedRecipients(supabase, meeting, "khush@oltaflock.ai"), []);
});

Deno.test("presence: joining uninvited still counts, alongside the invite", async () => {
  const supabase = fakeSupabase({ allowlist: ALLOWLIST, profiles: PROFILES });
  const meeting = {
    id: "m3",
    user_id: "u1",
    attendees: [{ email: "admin@oltaflock.ai" }, { email: "client@acme.com" }],
    processing_config: { recall_participant_events: joined("Vineet Patel", "Client") },
  };
  const got = await resolveAllowlistedRecipients(supabase, meeting, "khush@oltaflock.ai");
  assertEquals(got.sort(), ["admin@oltaflock.ai", "vineet@oltaflock.ai"]);
});

Deno.test("presence: the name must match exactly, not by first name", () => {
  // A prospect called Vineet must not send vineet@ a copy of the call.
  assertEquals(matchPresentReviewers(joined("Vineet Sharma", "Vineet"), PROFILES), []);
  assertEquals(matchPresentReviewers(joined("  vineet   PATEL "), PROFILES), ["vineet@oltaflock.ai"]);
});

Deno.test("presence: Recall's raw participant shape is read too", () => {
  const raw = [{ action: "join", participant: { name: "Vineet Patel" }, timestamp: { relative: 3 } }];
  assertEquals(matchPresentReviewers(raw, PROFILES), ["vineet@oltaflock.ai"]);
});

Deno.test("presence: junk events and missing names match nobody", () => {
  assertEquals(matchPresentReviewers(null, PROFILES), []);
  assertEquals(matchPresentReviewers([{}, { participant: {} }, "x"], PROFILES), []);
  assertEquals(matchPresentReviewers(joined("Vineet Patel"), [{ email: "a@b.c", full_name: null }]), []);
});
