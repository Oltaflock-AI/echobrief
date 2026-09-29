/**
 * Unit tests for the plan gate. Pure parts only — plan resolution, the IST
 * billing period, and the allow/refuse decision against a stubbed supabase.
 */
import { assert, assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  BILLING_PERIODS,
  checkRecordingAllowed,
  periodStart,
  PLANS,
  planForProfile,
  productForPlan,
  readUsage,
  SELLABLE_PLANS,
  seatsForProfile,
  limitsFor,
} from "../_shared/entitlements.ts";

const noEnv = () => undefined;

const billingEnv = (k: string) =>
  k === "DODO_PLAN_PRODUCTS"
    ? JSON.stringify({ pdt_starter: "starter", pdt_pro: "pro", pdt_teams: "teams" })
    : k === "DODO_PLAN_PRODUCTS_ANNUAL"
    ? JSON.stringify({ pdt_starter_yr: "starter", pdt_pro_yr: "pro", pdt_teams_yr: "teams" })
    : undefined;

Deno.test("productForPlan: picks the product for the plan and billing period", () => {
  assertEquals(productForPlan("starter", "monthly", billingEnv), "pdt_starter");
  assertEquals(productForPlan("pro", "monthly", billingEnv), "pdt_pro");
  assertEquals(productForPlan("starter", "annual", billingEnv), "pdt_starter_yr");
  assertEquals(productForPlan("pro", "annual", billingEnv), "pdt_pro_yr");
  // Monthly is the default so an old caller that names no period is unchanged.
  assertEquals(productForPlan("pro", undefined, billingEnv), "pdt_pro");
});

Deno.test("productForPlan: falls back to DODO_PRODUCT_ID for the default plan, monthly only", () => {
  const env = (k: string) => (k === "DODO_PRODUCT_ID" ? "pdt_only" : undefined);
  assertEquals(productForPlan("starter", "monthly", env), "pdt_only");
  assertEquals(productForPlan("pro", "monthly", env), null);
  // No annual product configured must not silently sell the monthly one.
  assertEquals(productForPlan("starter", "annual", env), null);
});

Deno.test("productForPlan: a malformed map still yields the fallback product", () => {
  const env = (k: string) =>
    k === "DODO_PLAN_PRODUCTS" ? "{not json" : k === "DODO_PRODUCT_ID" ? "pdt_only" : undefined;
  assertEquals(productForPlan("starter", "monthly", env), "pdt_only");
});

Deno.test("productForPlan: refuses plans that are not for sale", () => {
  // Teams JOINED this list on 2026-09-08 when it became self-serve and
  // per-seat. `free` and `trial` never can: one is the absence of a
  // subscription, the other is granted by code.
  const env = (k: string) =>
    k === "DODO_PLAN_PRODUCTS"
      ? JSON.stringify({ pdt_free: "free", pdt_trial: "trial", pdt_teams: "teams" })
      : undefined;
  assertEquals(productForPlan("free", "monthly", env), null);
  assertEquals(productForPlan("trial", "monthly", env), null);
  assertEquals(productForPlan("teams", "monthly", env), "pdt_teams");
  assertEquals(SELLABLE_PLANS, ["starter", "pro", "teams"]);
});

Deno.test("productForPlan and planForProfile agree, on both billing periods", () => {
  for (const period of BILLING_PERIODS) {
    for (const plan of SELLABLE_PLANS) {
      const productId = productForPlan(plan, period, billingEnv)!;
      assert(productId, `${plan}/${period} has no product`);
      assertEquals(
        planForProfile(
          { subscription_status: "active", subscription_product_id: productId },
          billingEnv,
        ),
        plan,
        `${plan}/${period}`,
      );
    }
  }
});

Deno.test("planForProfile: no profile or no subscription is free", () => {
  assertEquals(planForProfile(null, noEnv), "free");
  assertEquals(planForProfile({}, noEnv), "free");
  assertEquals(planForProfile({ subscription_status: "none" }, noEnv), "free");
});

Deno.test("planForProfile: non-entitling statuses stay free", () => {
  for (const status of ["paused", "on_hold", "expired", "failed"]) {
    assertEquals(planForProfile({ subscription_status: status }, noEnv), "free", status);
  }
});

Deno.test("planForProfile: active subscription falls back to starter", () => {
  assertEquals(planForProfile({ subscription_status: "active" }, noEnv), "starter");
});

Deno.test("planForProfile: DODO_DEFAULT_PAID_PLAN overrides the fallback", () => {
  const env = (k: string) => (k === "DODO_DEFAULT_PAID_PLAN" ? "pro" : undefined);
  assertEquals(planForProfile({ subscription_status: "active" }, env), "pro");
});

Deno.test("planForProfile: an unknown fallback plan degrades to starter, not a crash", () => {
  const env = (k: string) => (k === "DODO_DEFAULT_PAID_PLAN" ? "enterprise" : undefined);
  assertEquals(planForProfile({ subscription_status: "active" }, env), "starter");
});

Deno.test("planForProfile: product id map wins over the fallback", () => {
  const env = (k: string) =>
    k === "DODO_PLAN_PRODUCTS" ? '{"prod_abc":"pro"}' : undefined;
  assertEquals(
    planForProfile({ subscription_status: "active", subscription_product_id: "prod_abc" }, env),
    "pro",
  );
  // An id not in the map falls through to the default paid plan.
  assertEquals(
    planForProfile({ subscription_status: "active", subscription_product_id: "prod_zzz" }, env),
    "starter",
  );
});

Deno.test("planForProfile: malformed DODO_PLAN_PRODUCTS does not downgrade a payer", () => {
  const env = (k: string) => (k === "DODO_PLAN_PRODUCTS" ? "{not json" : undefined);
  assertEquals(
    planForProfile({ subscription_status: "active", subscription_product_id: "prod_abc" }, env),
    "starter",
  );
});

Deno.test("planForProfile: cancelled keeps the plan until the period ends", () => {
  const now = new Date("2026-09-01T00:00:00Z");
  assertEquals(
    planForProfile(
      { subscription_status: "cancelled", subscription_renews_at: "2026-09-20T00:00:00Z" },
      noEnv,
      now,
    ),
    "starter",
  );
  assertEquals(
    planForProfile(
      { subscription_status: "cancelled", subscription_renews_at: "2026-08-20T00:00:00Z" },
      noEnv,
      now,
    ),
    "free",
  );
  // No renewal date at all is not a licence to keep recording.
  assertEquals(planForProfile({ subscription_status: "cancelled" }, noEnv, now), "free");
});

Deno.test("planForProfile: an expired override is spent, a future one still applies", () => {
  const now = new Date("2026-09-01T00:00:00Z");
  // Code still running.
  assertEquals(
    planForProfile(
      { plan_override: "pro", plan_override_expires_at: "2026-12-01T00:00:00Z" },
      noEnv,
      now,
    ),
    "pro",
  );
  // Code ran out and there is no subscription behind it.
  assertEquals(
    planForProfile(
      { plan_override: "pro", plan_override_expires_at: "2026-08-01T00:00:00Z" },
      noEnv,
      now,
    ),
    "free",
  );
  // Ran out, but they since subscribed — they keep what they pay for.
  assertEquals(
    planForProfile(
      {
        plan_override: "pro",
        plan_override_expires_at: "2026-08-01T00:00:00Z",
        subscription_status: "active",
      },
      noEnv,
      now,
    ),
    "starter",
  );
});

Deno.test("planForProfile: no expiry means permanent, and junk never revokes", () => {
  const now = new Date("2026-09-01T00:00:00Z");
  assertEquals(planForProfile({ plan_override: "teams" }, noEnv, now), "teams");
  assertEquals(
    planForProfile(
      { plan_override: "teams", plan_override_expires_at: null },
      noEnv,
      now,
    ),
    "teams",
  );
  // An unparseable date must not silently strip a partner's access.
  assertEquals(
    planForProfile(
      { plan_override: "teams", plan_override_expires_at: "not-a-date" },
      noEnv,
      now,
    ),
    "teams",
  );
});

Deno.test("planForProfile: plan_override beats everything", () => {
  assertEquals(planForProfile({ plan_override: "pro" }, noEnv), "pro");
  assertEquals(
    planForProfile({ plan_override: "teams", subscription_status: "expired" }, noEnv),
    "teams",
  );
  // A junk override is ignored rather than trusted.
  assertEquals(planForProfile({ plan_override: "unlimited" }, noEnv), "free");
});

Deno.test("periodStart: the IST calendar month, expressed in UTC", () => {
  // 2026-09-01 02:00 IST is still inside September in IST.
  assertEquals(
    periodStart(new Date("2026-08-31T20:30:00Z")),
    "2026-08-31T18:30:00.000Z",
  );
  // 2026-08-31 23:00 IST -> August's period.
  assertEquals(
    periodStart(new Date("2026-08-31T17:30:00Z")),
    "2026-07-31T18:30:00.000Z",
  );
});

/**
 * Minimal supabase stub: profiles, usage_events and org_members.
 *
 * `orgMembers` is null for the common case of somebody who is not in a
 * workspace; pass rows to exercise pooled billing, where the plan comes from
 * the owner's profile and usage is summed across every member.
 */
function stubSupabase(
  profile: unknown,
  usageRows: Array<{ kind: string; seconds: number }>,
  orgMembers: Array<{ user_id: string; role: string }> | null = null,
  ownerProfile: unknown = undefined,
) {
  const usageQuery = () => Promise.resolve({ data: usageRows, error: null });
  return {
    from(table: string) {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: (_col: string, value: string) => ({
              maybeSingle: () =>
                Promise.resolve({
                  // When a workspace exists the gate reads the OWNER's profile.
                  data: ownerProfile !== undefined && value === "owner-user"
                    ? ownerProfile
                    : profile,
                }),
            }),
          }),
        };
      }
      if (table === "usage_events") {
        // readUsageFor uses .in(); the old single-user path used .eq().
        return {
          select: () => ({
            in: () => ({ gte: usageQuery }),
            eq: () => ({ gte: usageQuery }),
          }),
        };
      }
      if (table === "org_members") {
        // Two shapes are used against this table: `.eq().maybeSingle()` asks
        // "which org am I in", and `.eq()` awaited directly returns the member
        // list. The returned object is therefore both thenable and chainable.
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({ data: orgMembers ? { org_id: "org-1" } : null }),
              then: (resolve: (v: unknown) => unknown) =>
                resolve({ data: orgMembers ?? [], error: null }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

Deno.test("readUsage sums meetings and seconds separately", async () => {
  const sb = stubSupabase(null, [
    { kind: "meeting_started", seconds: 0 },
    { kind: "meeting_started", seconds: 0 },
    { kind: "meeting_recorded", seconds: 900 },
    { kind: "meeting_recorded", seconds: 1800 },
  ]);
  assertEquals(await readUsage(sb, "u1"), { meetingsStarted: 2, recordedSeconds: 2700 });
});

Deno.test("no subscription: refuses the first meeting — there is no free tier", async () => {
  const decision = await checkRecordingAllowed(stubSupabase(null, []), "u1");
  assert(!decision.allowed);
  assertEquals(decision.plan, "free");
  assertEquals(decision.code, "meeting_limit");
  assert(decision.reason.includes("no active subscription"));
});

Deno.test("no subscription: a usage read error still refuses, it does not fail open", async () => {
  const sb = {
    from(table: string) {
      if (table === "profiles") {
        return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }) };
      }
      return {
        select: () => ({
          eq: () => ({ gte: () => Promise.resolve({ data: null, error: { message: "boom" } }) }),
        }),
      };
    },
  };
  const decision = await checkRecordingAllowed(sb, "u1");
  assert(!decision.allowed);
  assertEquals(decision.code, "meeting_limit");
});

Deno.test("admin override: unmetered, still allowed far past every paid ceiling", async () => {
  const decision = await checkRecordingAllowed(
    stubSupabase({ plan_override: "admin" }, [
      { kind: "meeting_started", seconds: 0 },
      { kind: "meeting_recorded", seconds: 500 * 3600 },
    ]),
    "u1",
  );
  assert(decision.allowed);
  assertEquals(decision.plan, "admin");
  assertEquals(decision.limits.includedSeconds, null);
  assertEquals(decision.limits.meetingsPerPeriod, null);
});

Deno.test("admin is never sellable", () => {
  assert(!SELLABLE_PLANS.includes("admin"));
  assertEquals(productForPlan("admin", "monthly", billingEnv), null);
});

Deno.test("plan_override still lets an internal account record", async () => {
  const decision = await checkRecordingAllowed(
    stubSupabase({ plan_override: "pro" }, []),
    "u1",
  );
  assert(decision.allowed);
  assertEquals(decision.plan, "pro");
});

Deno.test("trial plan: 10 hours hard, with no overage band to fall into", async () => {
  const included = PLANS.trial.includedSeconds!;
  assertEquals(PLANS.trial.overageSeconds, 0);

  const under = await checkRecordingAllowed(
    stubSupabase({ plan_override: "trial" }, [
      { kind: "meeting_recorded", seconds: included - 600 },
    ]),
    "u1",
  );
  assert(under.allowed);
  assertEquals(under.isOverage, false);

  const at = await checkRecordingAllowed(
    stubSupabase({ plan_override: "trial" }, [
      { kind: "meeting_recorded", seconds: included },
    ]),
    "u1",
  );
  assert(!at.allowed);
  assertEquals(at.code, "hour_limit");
});

Deno.test("trial plan: one runaway bot cannot eat the whole allowance", () => {
  // 2 h per meeting against a 10 h allowance — a bot left in an empty room
  // costs a fifth of the trial, not half of it.
  assert(PLANS.trial.maxMeetingSeconds < PLANS.starter.maxMeetingSeconds);
  assertEquals(PLANS.trial.maxMeetingSeconds, 2 * 3600);
});

Deno.test("trial is never sellable — a code grants it, checkout cannot", () => {
  assert(!SELLABLE_PLANS.includes("trial"));
});

Deno.test("paid plan: included hours allow, overage band allows and is flagged", async () => {
  const profile = { subscription_status: "active" };
  const included = PLANS.starter.includedSeconds!;

  const under = await checkRecordingAllowed(
    stubSupabase(profile, [{ kind: "meeting_recorded", seconds: included - 60 }]),
    "u1",
  );
  assert(under.allowed);
  assertEquals(under.isOverage, false);

  const over = await checkRecordingAllowed(
    stubSupabase(profile, [{ kind: "meeting_recorded", seconds: included + 60 }]),
    "u1",
  );
  assert(over.allowed);
  assertEquals(over.isOverage, true);
});

Deno.test("paid plan: refuses past included + overage ceiling", async () => {
  const ceiling = PLANS.starter.includedSeconds! + PLANS.starter.overageSeconds;
  const decision = await checkRecordingAllowed(
    stubSupabase({ subscription_status: "active" }, [
      { kind: "meeting_recorded", seconds: ceiling },
    ]),
    "u1",
  );
  assert(!decision.allowed);
  assertEquals(decision.code, "hour_limit");
});

Deno.test("a usage read failure fails OPEN for a subscriber — a DB blip must not stop recording", async () => {
  const sb = {
    from(table: string) {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: { subscription_status: "active" } }),
            }),
          }),
        };
      }
      return {
        select: () => ({
          eq: () => ({ gte: () => Promise.resolve({ data: null, error: { message: "boom" } }) }),
        }),
      };
    },
  };
  const decision = await checkRecordingAllowed(sb, "u1");
  assert(decision.allowed);
});

Deno.test("every plan has a per-meeting ceiling Recall can enforce", () => {
  for (const [key, limits] of Object.entries(PLANS)) {
    assert(limits.maxMeetingSeconds > 0, `${key} has no per-meeting cap`);
    assert(limits.retentionDays > 0, `${key} has no retention window`);
  }
});


Deno.test("a workspace bills on the owner's plan, not the member's", async () => {
  // Bob has no subscription of his own. Without pooled billing he could never
  // record, even though his workspace owner pays.
  const members = [
    { user_id: "owner-user", role: "owner" },
    { user_id: "bob", role: "member" },
  ];
  const decision = await checkRecordingAllowed(
    stubSupabase(
      null, // bob's own profile: nothing
      [],
      members,
      { subscription_status: "active", plan_override: "teams" }, // the owner's
    ),
    "bob",
  );
  assert(decision.allowed);
  assertEquals(decision.plan, "teams");
});

Deno.test("workspace hours are pooled, not per head", async () => {
  const members = [
    { user_id: "owner-user", role: "owner" },
    { user_id: "bob", role: "member" },
  ];
  const ceiling = PLANS.teams.includedSeconds! + PLANS.teams.overageSeconds;
  // One colleague has already burned the whole workspace allowance. The next
  // member must be refused — counting per user would hand them a fresh 100 hrs.
  const decision = await checkRecordingAllowed(
    stubSupabase(
      null,
      [{ kind: "meeting_recorded", seconds: ceiling }],
      members,
      { plan_override: "teams" },
    ),
    "bob",
  );
  assert(!decision.allowed);
  assertEquals(decision.code, "hour_limit");
});

Deno.test("a workspace lookup failure bills the caller as an individual", async () => {
  // org_members is unreachable; a solo user must still be able to record.
  const sb = {
    from(table: string) {
      if (table === "org_members") throw new Error("boom");
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: () => Promise.resolve({ data: { plan_override: "pro" } }) }),
          }),
        };
      }
      return {
        select: () => ({
          in: () => ({ gte: () => Promise.resolve({ data: [], error: null }) }),
        }),
      };
    },
  };
  const decision = await checkRecordingAllowed(sb, "solo");
  assert(decision.allowed);
  assertEquals(decision.plan, "pro");
});

/* ── per-seat Teams ─────────────────────────────────────────────────────── */

Deno.test("seats: a missing quantity is one seat, never unlimited", () => {
  // Under-serving a customer is a support ticket; over-serving one silently is
  // a bill we cannot send. So the fallback is the smallest plausible number.
  assertEquals(seatsForProfile(null), 1);
  assertEquals(seatsForProfile({}), 1);
  assertEquals(seatsForProfile({ subscription_quantity: null }), 1);
  assertEquals(seatsForProfile({ subscription_quantity: 0 }), 1);
  assertEquals(seatsForProfile({ subscription_quantity: -4 }), 1);
  assertEquals(seatsForProfile({ subscription_quantity: 5 }), 5);
  // Whatever Dodo sends, seats are whole people.
  assertEquals(seatsForProfile({ subscription_quantity: 3.9 } as never), 3);
});

Deno.test("seats: only the volume allowances scale, not the product limits", () => {
  const one = limitsFor("teams", 1);
  const five = limitsFor("teams", 5);
  assertEquals(five.includedSeconds, (one.includedSeconds ?? 0) * 5);
  assertEquals(five.overageSeconds, one.overageSeconds * 5);
  // Buying a sixth seat must not extend how long anyone's recordings are kept,
  // nor how long a single meeting may run.
  assertEquals(five.retentionDays, one.retentionDays);
  assertEquals(five.maxMeetingSeconds, one.maxMeetingSeconds);
});

Deno.test("seats: five seats reproduce the flat Teams allowance it replaced", () => {
  // Teams was flat-priced at 100 hours and the page has always said "for teams
  // of five or more". If this drifts, the plan quietly became a different offer.
  assertEquals(limitsFor("teams", 5).includedSeconds, 100 * 3600);
});

Deno.test("seats: flat-priced plans ignore the seat count entirely", () => {
  // A stray subscription_quantity on a Starter account must not multiply it.
  for (const plan of ["free", "trial", "starter", "pro"] as const) {
    assertEquals(limitsFor(plan, 9), PLANS[plan]);
  }
});

Deno.test("seats: Teams is sellable and resolves from its own product id", () => {
  assertEquals(SELLABLE_PLANS.includes("teams"), true);
  const env = (k: string) =>
    k === "DODO_PLAN_PRODUCTS" ? '{"prod_teams_m":"teams","prod_pro_m":"pro"}' : undefined;
  assertEquals(
    planForProfile({ subscription_status: "active", subscription_product_id: "prod_teams_m" }, env),
    "teams",
  );
});
