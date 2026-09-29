import { supabase } from "@/integrations/supabase/client";
import {
  PLANS,
  formatHours,
  periodStart,
  planForProfile,
  teamLimits,
  type PlanKey,
  type PlanLimits,
} from "@/lib/plans";

export type UsageMeter = {
  plan: PlanKey;
  limits: PlanLimits;
  /** 0–1, clamped. Null when the plan has no metered ceiling. */
  ratio: number | null;
  /** "5.4 / 25h" or "3 of 5 meetings" — what the sidebar bar is labelled with. */
  label: string;
  renewsAt: string | null;
};

type BillingRow = {
  subscription_status: string | null;
  subscription_renews_at: string | null;
  subscription_quantity: number | null;
  plan_override: string | null;
  plan_override_expires_at: string | null;
};

/**
 * The sidebar plan card. Deliberately a local floor, not the truth: it reads
 * profiles + usage_events directly and resolves the plan with planForProfile,
 * which has no Dodo product map — so an annual Pro reads as its monthly twin.
 * Good enough for a usage bar; anything that decides entitlement asks the
 * server (manage-billing `plan`), the way Settings → Billing does.
 */
export async function fetchUsageMeter(userId: string): Promise<UsageMeter | null> {
  const db = supabase as unknown as {
    from: (t: string) => {
      select: (c: string) => {
        eq: (k: string, v: string) => { maybeSingle: () => Promise<{ data: BillingRow | null }> };
        gte: (k: string, v: string) => Promise<{ data: Array<{ kind: string; seconds: number }> | null }>;
      };
    };
  };

  const [profileResult, usageResult] = await Promise.all([
    db
      .from("profiles")
      .select(
        "subscription_status, subscription_renews_at, subscription_quantity, plan_override, plan_override_expires_at",
      )
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("usage_events" as never)
      .select("kind, seconds")
      .eq("user_id", userId)
      .gte("occurred_at", periodStart()),
  ]);

  const profile = profileResult.data;
  if (!profile) return null;

  const plan = planForProfile(profile);
  const seats = profile.subscription_quantity ?? 0;
  const limits = plan === "teams" && seats > 0 ? teamLimits(seats) : PLANS[plan];

  const rows = ((usageResult as { data: Array<{ kind: string; seconds: number }> | null }).data ??
    []) as Array<{ kind: string; seconds: number }>;
  const meetings = rows.filter((r) => r.kind === "meeting_started").length;
  const seconds = rows
    .filter((r) => r.kind === "meeting_recorded")
    .reduce((total, r) => total + (r.seconds || 0), 0);

  let ratio: number | null = null;
  let label: string;
  if (limits.meetingsPerPeriod !== null) {
    ratio = limits.meetingsPerPeriod ? meetings / limits.meetingsPerPeriod : null;
    label = `${meetings} / ${limits.meetingsPerPeriod} meetings`;
  } else if (limits.includedSeconds) {
    ratio = seconds / limits.includedSeconds;
    label = `${formatHours(seconds)} / ${formatHours(limits.includedSeconds)}`;
  } else {
    label = `${formatHours(seconds)}h used`;
  }

  return {
    plan,
    limits,
    ratio: ratio === null ? null : Math.max(0, Math.min(1, ratio)),
    label,
    renewsAt: profile.subscription_renews_at,
  };
}

export function planLabel(plan: PlanKey): string {
  if (plan === "admin") return "Super admin";
  return plan === "free" ? "Free plan" : `${plan[0].toUpperCase()}${plan.slice(1)} plan`;
}
