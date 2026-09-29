/**
 * Client-side mirror of the plan limits.
 *
 * The authority is `supabase/functions/_shared/entitlements.ts` — that is what
 * actually refuses a recording. This copy exists so the usage meter can render
 * without a round trip, and the numbers must match it exactly. The pricing page
 * (`src/components/landing/Pricing.tsx`) is the third copy; all three change
 * together or none of them do.
 */

export type PlanKey = 'free' | 'trial' | 'starter' | 'pro' | 'teams' | 'admin';

export interface PlanLimits {
  label: string;
  meetingsPerPeriod: number | null;
  includedSeconds: number | null;
  overageSeconds: number;
  maxMeetingSeconds: number;
  retentionDays: number;
}

const HOUR = 3600;

/** Hours a single Teams seat buys. Mirrors entitlements.ts. */
export const TEAM_SEAT_HOURS = 20;

export const PLANS: Record<PlanKey, PlanLimits> = {
  // Mirrors entitlements.ts: `free` is "no live subscription", not a tier we
  // sell. Zero meetings included.
  free: {
    label: 'No plan',
    meetingsPerPeriod: 0,
    includedSeconds: null,
    overageSeconds: 0,
    maxMeetingSeconds: 45 * 60,
    retentionDays: 14,
  },
  // Mirrors entitlements.ts: granted by an early-access code, hard-capped at
  // 10 hours with no overage band.
  trial: {
    label: 'Early access',
    meetingsPerPeriod: null,
    includedSeconds: 10 * HOUR,
    overageSeconds: 0,
    maxMeetingSeconds: 2 * HOUR,
    retentionDays: 30,
  },
  starter: {
    label: 'Starter',
    meetingsPerPeriod: null,
    includedSeconds: 10 * HOUR,
    overageSeconds: 10 * HOUR,
    maxMeetingSeconds: 4 * HOUR,
    retentionDays: 30,
  },
  pro: {
    label: 'Pro',
    meetingsPerPeriod: null,
    includedSeconds: 25 * HOUR,
    overageSeconds: 25 * HOUR,
    maxMeetingSeconds: 4 * HOUR,
    retentionDays: 90,
  },
  // Per seat. These are the ONE-SEAT numbers; the workspace ceiling is this
  // times the paid seat count. Mirrors TEAM_SEAT_HOUR_ALLOWANCE and limitsFor()
  // in supabase/functions/_shared/entitlements.ts.
  teams: {
    label: 'Teams',
    meetingsPerPeriod: null,
    includedSeconds: TEAM_SEAT_HOURS * HOUR,
    overageSeconds: TEAM_SEAT_HOURS * HOUR,
    maxMeetingSeconds: 6 * HOUR,
    retentionDays: 365,
  },
  // Mirrors entitlements.ts: internal super-admin accounts, granted only by a
  // service-role write to plan_override. Unmetered.
  admin: {
    label: 'Super admin',
    meetingsPerPeriod: null,
    includedSeconds: null,
    overageSeconds: 0,
    maxMeetingSeconds: 6 * HOUR,
    retentionDays: 3650,
  },
};

/** Hours one Teams seat buys, pooled across the workspace. */
export function teamLimits(seats: number): PlanLimits {
  const n = Math.max(1, Math.floor(seats));
  const base = PLANS.teams;
  return {
    ...base,
    includedSeconds: (base.includedSeconds ?? 0) * n,
    overageSeconds: base.overageSeconds * n,
  };
}

/** Mirrors SELLABLE_PLANS in entitlements.ts — the plans checkout can sell. */
export const SELLABLE_PLANS: PlanKey[] = ['starter', 'pro', 'teams'];

/** Mirrors BillingPeriod in entitlements.ts. */
export type BillingPeriod = 'monthly' | 'annual';

/**
 * What each sellable plan costs, as the pricing page prints it. Mirrors
 * src/components/landing/Pricing.tsx and the live Dodo products; the server
 * still decides which product a checkout actually uses.
 */
export const PLAN_PRICES: Record<'starter' | 'pro' | 'teams', Record<BillingPeriod, number>> = {
  starter: { monthly: 799, annual: 7990 },
  pro: { monthly: 1999, annual: 19990 },
  // PER SEAT, not per workspace. Annual is ten months, matching the others.
  teams: { monthly: 999, annual: 9990 },
};

/** Plans whose price is multiplied by the number of seats bought. */
export const PER_SEAT_PLANS: PlanKey[] = ['teams'];

export interface PlanCopy {
  tagline: string;
  /** What the plan includes, in the customer's words. */
  features: string[];
  /** What a meeting-hour past the included allowance costs. */
  overage: string;
}

/**
 * The sales copy for each sellable plan. One source for the pricing page and
 * the Settings → Billing plan chooser, so a customer comparing the two never
 * reads two different promises.
 */
export const PLAN_COPY: Record<'starter' | 'pro' | 'teams', PlanCopy> = {
  starter: {
    tagline: 'For individuals',
    features: [
      '10 meeting-hours / month',
      'Email delivery and Google Calendar follow-ups',
      'Full AI insights',
      'Speaker identification',
      '30-day retention',
    ],
    overage: '₹129/hr overage, capped at +10 hrs',
  },
  pro: {
    tagline: 'For power users',
    features: [
      '25 meeting-hours / month',
      'Everything in Starter',
      'Custom vocabulary and priority processing',
      '90-day retention',
    ],
    overage: '₹99/hr after that',
  },
  teams: {
    tagline: 'For teams of five or more',
    features: [
      '20 meeting-hours per seat, pooled across the team',
      'Everything in Pro',
      'Shared workspace: invite colleagues, share meetings internally',
      '365-day retention',
    ],
    overage: '₹99/hr after that',
  },
};

export function formatINR(amount: number): string {
  return new Intl.NumberFormat('en-IN').format(amount);
}

const ENTITLED_STATUSES = new Set(['active', 'cancelled']);

/** Mirrors `planForProfile` in entitlements.ts, minus the Dodo product map. */
export function planForProfile(profile: {
  subscription_status?: string | null;
  subscription_renews_at?: string | null;
  plan_override?: string | null;
  plan_override_expires_at?: string | null;
} | null): PlanKey {
  if (!profile) return 'free';
  // Mirrors entitlements.ts: an override with an expiry in the past is spent.
  // A NULL expiry is permanent, and an unparseable one is treated as permanent
  // rather than as expired.
  const override = profile.plan_override;
  const overrideEnds = profile.plan_override_expires_at
    ? Date.parse(profile.plan_override_expires_at)
    : NaN;
  const overrideExpired = Number.isFinite(overrideEnds) && overrideEnds <= Date.now();
  if (override && override in PLANS && !overrideExpired) return override as PlanKey;

  const status = (profile.subscription_status || '').toLowerCase();
  if (!ENTITLED_STATUSES.has(status)) return 'free';
  if (status === 'cancelled') {
    const renews = profile.subscription_renews_at
      ? Date.parse(profile.subscription_renews_at)
      : NaN;
    if (!Number.isFinite(renews) || renews <= Date.now()) return 'free';
  }
  // The server may resolve a paid subscription to a higher plan via the Dodo
  // product map; showing Starter here is the conservative floor.
  return 'starter';
}

/** Start of the current billing period — the IST calendar month, as ISO. */
export function periodStart(now: Date = new Date()): string {
  const ist = new Date(now.getTime() + 5.5 * HOUR * 1000);
  return new Date(
    Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), 1) - 5.5 * HOUR * 1000,
  ).toISOString();
}

export function formatHours(seconds: number): string {
  const hours = seconds / HOUR;
  return hours >= 10 ? `${Math.round(hours)}` : hours.toFixed(1).replace(/\.0$/, '');
}
