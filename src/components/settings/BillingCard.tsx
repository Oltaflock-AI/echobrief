import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Check, CreditCard, ExternalLink, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  formatHours,
  formatINR,
  PLAN_COPY,
  PLAN_PRICES,
  PLANS,
  periodStart,
  planForProfile,
  SELLABLE_PLANS,
  PER_SEAT_PLANS,
} from '@/lib/plans';
import type { BillingPeriod, PlanKey } from '@/lib/plans';

interface BillingProfile {
  subscription_status: string;
  subscription_renews_at: string | null;
  dodo_customer_id: string | null;
  plan_override: string | null;
  plan_override_expires_at: string | null;
}

interface Usage {
  meetings: number;
  seconds: number;
}

// `usage_events` and `profiles.plan_override` post-date the generated types in
// src/integrations/supabase/types.ts. Same escape hatch Contacts.tsx uses for
// `contacts`; regenerating the types is a separate chore.
const db = supabase;

const STATUS_LABELS: Record<string, string> = {
  none: 'No subscription',
  active: 'Active',
  on_hold: 'On hold — payment failed',
  paused: 'Paused',
  cancelled: 'Cancelled',
  expired: 'Expired',
  failed: 'Payment failed',
};

export function BillingCard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [profile, setProfile] = useState<BillingProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [usage, setUsage] = useState<Usage | null>(null);
  // The server's answer to "which plan am I on". planForProfile here is only a
  // floor — it has no Dodo product map, so an annual Pro would read as Starter.
  const [serverPlan, setServerPlan] = useState<PlanKey | null>(null);
  // A pricing-page CTA lands here as ?plan=pro&billing=annual; the toggle
  // starts on what the customer clicked, and they can still change it.
  const [period, setPeriod] = useState<BillingPeriod>(
    searchParams.get('billing') === 'annual' ? 'annual' : 'monthly',
  );

  const refresh = useCallback(async () => {
    if (!user) return;
    // Profile and usage in parallel — the meter should not delay the card.
    const [profileResult, usageResult] = await Promise.all([
      db
        .from('profiles')
        .select('subscription_status, subscription_renews_at, dodo_customer_id, plan_override, plan_override_expires_at')
        .eq('user_id', user.id)
        .maybeSingle(),
      // RLS scopes this to the caller; the ledger is service-write, user-read.
      db
        .from('usage_events')
        .select('kind, seconds')
        .eq('user_id', user.id)
        .gte('occurred_at', periodStart()),
    ]);
    if (profileResult.data) setProfile(profileResult.data as BillingProfile);
    // Best-effort: if this fails the card falls back to the local floor rather
    // than showing nothing.
    supabase.functions
      .invoke('manage-billing', { body: { action: 'plan' } })
      .then(({ data }) => {
        if (data?.plan) setServerPlan(data.plan as PlanKey);
      })
      .catch(() => undefined);
    const rows = (usageResult.data ?? []) as Array<{ kind: string; seconds: number }>;
    setUsage({
      meetings: rows.filter((r) => r.kind === 'meeting_started').length,
      seconds: rows
        .filter((r) => r.kind === 'meeting_recorded')
        .reduce((total, r) => total + (r.seconds || 0), 0),
    });
    setLoading(false);
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (searchParams.get('checkout') === 'success') {
      toast({
        title: 'Payment received',
        description: 'Your subscription will activate in a moment.',
      });
      searchParams.delete('checkout');
      setSearchParams(searchParams, { replace: true });
      // The webhook lands async; give it a beat, then re-read.
      const timer = setTimeout(refresh, 4000);
      return () => clearTimeout(timer);
    }
  }, [searchParams, setSearchParams, toast, refresh]);

  // Seats for the one per-seat plan. Two by default because a workspace of one
  // is not a team; the server raises this to the workspace's real size anyway,
  // so it can never sell fewer seats than the account already uses.
  const [seats, setSeats] = useState(2);

  const invoke = useCallback(async (action: 'checkout' | 'portal', plan?: PlanKey) => {
    setWorking(true);
    try {
      const { data, error } = await supabase.functions.invoke('manage-billing', {
        body: { action, plan, billing: period, ...(plan === 'teams' ? { seats } : {}) },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      if (data?.url) window.location.href = data.url;
    } catch (err) {
      toast({
        title: 'Billing error',
        description: err instanceof Error ? err.message : 'Something went wrong',
        variant: 'destructive',
      });
      setWorking(false);
    }
  }, [toast, period, seats]);

  const [code, setCode] = useState('');
  const [redeeming, setRedeeming] = useState(false);

  const redeem = useCallback(async () => {
    const entered = code.trim().toUpperCase();
    if (!entered) return;
    setRedeeming(true);
    try {
      const { data, error } = await supabase.functions.invoke('redeem-access-code', {
        body: { code: entered },
      });
      // A refused code comes back as a non-2xx, which surfaces here as an
      // error; the function's JSON body carries the human-readable reason.
      if (error) {
        const detail = await (error as { context?: Response }).context
          ?.json()
          .catch(() => null);
        throw new Error(detail?.error ?? 'That code could not be redeemed.');
      }
      const until = data?.granted_until
        ? new Date(data.granted_until).toLocaleDateString(undefined, {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })
        : null;
      toast({
        title: data?.already_redeemed ? 'Code already active' : 'Code redeemed',
        description: data?.superseded
          ? 'Your account already has broader access, so nothing changed.'
          : `${PLANS[data.plan as PlanKey]?.label ?? data.plan} access${until ? ` until ${until}` : ''}.`,
      });
      setCode('');
      await refresh();
    } catch (err) {
      toast({
        title: 'Could not redeem that code',
        description: err instanceof Error ? err.message : 'Something went wrong',
        variant: 'destructive',
      });
    } finally {
      setRedeeming(false);
    }
  }, [code, toast, refresh]);

  const overrideEndsAt = profile?.plan_override_expires_at
    ? new Date(profile.plan_override_expires_at)
    : null;
  const onEarlyAccess =
    !!profile?.plan_override && !!overrideEndsAt && overrideEndsAt.getTime() > Date.now();

  const requested = searchParams.get('plan');
  const highlighted = SELLABLE_PLANS.includes(requested as PlanKey) ? requested : 'pro';
  const status = profile?.subscription_status ?? 'none';
  const isActive = status === 'active';
  const currentPlan = serverPlan ?? planForProfile(profile);
  const limits = PLANS[currentPlan];
  // Count-metered plans (only the no-subscription state today) vs hour-metered
  // paid plans. A zero allowance must not divide by zero.
  const usedFraction = limits.meetingsPerPeriod !== null
    ? (limits.meetingsPerPeriod > 0
        ? (usage?.meetings ?? 0) / limits.meetingsPerPeriod
        : 1)
    : (usage?.seconds ?? 0) / (limits.includedSeconds || 1);
  const allowanceLabel = limits.meetingsPerPeriod !== null
    ? (limits.meetingsPerPeriod > 0
        ? `${usage?.meetings ?? 0} of ${limits.meetingsPerPeriod} meetings`
        : 'No meetings included — choose a plan to start recording')
    : `${formatHours(usage?.seconds ?? 0)} of ${formatHours(limits.includedSeconds || 0)} hours`;
  const renewsAt = profile?.subscription_renews_at
    ? new Date(profile.subscription_renews_at).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-card p-6 text-card-foreground shadow-sm">
        <div className="mb-1 flex items-center gap-2">
          <CreditCard className="h-4 w-4" style={{ color: 'var(--ink-mid)' }} />
          <h2 className="text-base font-semibold text-foreground">Subscription</h2>
        </div>
        <p className="mb-5 text-[13px]" style={{ color: 'var(--ink-mid)' }}>
          Meeting bots, transcription in 22 Indian languages, and AI summaries.
        </p>

        {loading ? (
          <div className="flex items-center gap-2 text-[13px]" style={{ color: 'var(--ink-mid)' }}>
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-[14px] font-medium text-foreground">
                {STATUS_LABELS[status] ?? status}
              </p>
              {isActive && renewsAt && (
                <p className="text-[12.5px]" style={{ color: 'var(--ink-soft)' }}>
                  Renews on {renewsAt}
                </p>
              )}
              {status === 'cancelled' && renewsAt && (
                <p className="text-[12.5px]" style={{ color: 'var(--ink-soft)' }}>
                  Access until {renewsAt}
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {profile?.dodo_customer_id && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={working}
                  onClick={() => invoke('portal')}
                >
                  <ExternalLink className="mr-1.5 h-4 w-4" />
                  Manage billing
                </Button>
              )}
            </div>
          </div>
        )}

        {!loading && usage && (
          <div className="mt-5 border-t border-border pt-5">
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <span className="text-[13px] font-medium text-foreground">
                {limits.label} plan — this month
              </span>
              <span className="text-[12.5px]" style={{ color: 'var(--ink-soft)' }}>
                {allowanceLabel}
              </span>
            </div>
            <div
              className="h-1.5 w-full overflow-hidden rounded-full"
              style={{ background: 'var(--paper-deep)' }}
              role="progressbar"
              aria-valuenow={Math.round(usedFraction * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Plan usage this month"
            >
              <div
                className="h-full rounded-full transition-[width]"
                style={{
                  width: `${Math.min(100, usedFraction * 100)}%`,
                  background: usedFraction >= 1 ? 'var(--stop)' : 'var(--ember)',
                }}
              />
            </div>
            <p className="mt-2 text-[12.5px]" style={{ color: 'var(--ink-soft)' }}>
              Meetings are capped at {Math.round(limits.maxMeetingSeconds / 60)} minutes each,
              and content is kept for {limits.retentionDays} days.
            </p>
          </div>
        )}
      </div>

      {!loading && (
        <div className="rounded-2xl border border-border bg-card p-6 text-card-foreground shadow-sm">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-foreground">
                {isActive ? 'Your plan' : 'Choose a plan'}
              </h2>
              <p className="mt-1 text-[13px]" style={{ color: 'var(--ink-mid)' }}>
                {isActive
                  ? 'Switch plans or cancel from Manage billing above.'
                  : 'A plan is what lets the bot join and record. Prices include tax; cancel anytime.'}
              </p>
            </div>
            <div
              className="inline-flex shrink-0 rounded-md p-0.5"
              style={{ background: 'var(--paper-deep)' }}
              role="group"
              aria-label="Billing period"
            >
              {(['monthly', 'annual'] as BillingPeriod[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setPeriod(option)}
                  aria-pressed={period === option}
                  className="rounded-[5px] px-3 py-1 text-[12.5px] font-medium capitalize transition-colors"
                  style={
                    period === option
                      ? { background: 'var(--paper-card)', color: 'var(--ink)' }
                      : { color: 'var(--ink-soft)' }
                  }
                >
                  {option === 'annual' ? 'Yearly · 2 months free' : 'Monthly'}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {SELLABLE_PLANS.map((key) => {
              const plan = key as 'starter' | 'pro' | 'teams';
              const perSeat = PER_SEAT_PLANS.includes(plan);
              const copy = PLAN_COPY[plan];
              const price = PLAN_PRICES[plan][period];
              const isCurrent = isActive && currentPlan === plan;
              const isRecommended = !isActive && plan === highlighted;
              return (
                <div
                  key={plan}
                  className="flex flex-col rounded-xl border p-5"
                  style={{
                    borderColor: isCurrent || isRecommended ? 'var(--ember)' : 'var(--rule)',
                    background: 'var(--paper-card)',
                  }}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="text-[15px] font-semibold text-foreground">
                      {PLANS[plan].label}
                    </h3>
                    {(isCurrent || isRecommended) && (
                      <span
                        className="rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide"
                        style={{
                          background: 'color-mix(in oklch, var(--ember) 14%, transparent)',
                          color: 'var(--ember-deep)',
                        }}
                      >
                        {isCurrent ? 'Current' : 'Recommended'}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[12.5px]" style={{ color: 'var(--ink-soft)' }}>
                    {copy.tagline}
                  </p>

                  <p className="mt-3 text-[24px] font-semibold leading-none text-foreground">
                    ₹{formatINR(price)}
                    <span className="text-[13px] font-normal" style={{ color: 'var(--ink-soft)' }}>
                      {perSeat
                        ? period === 'annual' ? '/user/year' : '/user/month'
                        : period === 'annual' ? '/year' : '/month'}
                    </span>
                  </p>
                  <p className="mt-1 text-[12px]" style={{ color: 'var(--ink-soft)' }}>
                    {perSeat
                      ? `${seats} seats — ₹${formatINR(price * seats)} ${period === 'annual' ? 'a year' : 'a month'} in total`
                      : period === 'annual'
                      ? `Works out to ₹${formatINR(Math.round(price / 12))}/month, billed yearly`
                      : 'Billed monthly'}
                  </p>

                  {perSeat && !isCurrent && (
                    <label className="mt-3 flex items-center gap-2 text-[12.5px]" style={{ color: 'var(--ink-mid)' }}>
                      Seats
                      <input
                        type="number"
                        min={1}
                        max={200}
                        value={seats}
                        onChange={(e) => setSeats(Math.min(200, Math.max(1, Number(e.target.value) || 1)))}
                        className="h-8 w-20 rounded-md border border-border bg-background px-2 text-[13px] text-foreground"
                        aria-label="Number of seats"
                      />
                      <span style={{ color: 'var(--ink-soft)' }}>
                        × {Math.round((PLANS.teams.includedSeconds ?? 0) / 3600)} hrs each
                      </span>
                    </label>
                  )}

                  <ul className="mt-4 flex-1 space-y-2">
                    {[...copy.features, copy.overage].map((feature) => (
                      <li
                        key={feature}
                        className="flex items-start gap-2 text-[13px] leading-[1.5]"
                        style={{ color: 'var(--ink-mid)' }}
                      >
                        <Check
                          className="mt-[3px] h-3.5 w-3.5 shrink-0"
                          style={{ color: 'var(--ember)' }}
                          strokeWidth={2.5}
                        />
                        {feature}
                      </li>
                    ))}
                    <li
                      className="flex items-start gap-2 text-[13px] leading-[1.5]"
                      style={{ color: 'var(--ink-mid)' }}
                    >
                      <Check
                        className="mt-[3px] h-3.5 w-3.5 shrink-0"
                        style={{ color: 'var(--ember)' }}
                        strokeWidth={2.5}
                      />
                      Up to {Math.round(PLANS[plan].maxMeetingSeconds / 3600)} hours per meeting
                    </li>
                  </ul>

                  <Button
                    className="mt-5 w-full"
                    variant={isRecommended ? 'default' : 'outline'}
                    disabled={working || isCurrent}
                    onClick={() => invoke('checkout', plan)}
                  >
                    {working && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                    {isCurrent
                      ? 'Current plan'
                      : isActive
                      ? `Switch to ${PLANS[plan].label}`
                      : `Choose ${PLANS[plan].label}`}
                  </Button>
                </div>
              );
            })}
          </div>

          <div className="mt-6 rounded-xl border border-border p-4">
            <p className="text-[13px] font-medium text-foreground">
              Have an early-access code?
            </p>
            <p className="mt-0.5 text-[12.5px]" style={{ color: 'var(--ink-mid)' }}>
              {onEarlyAccess
                ? `Early access is active until ${overrideEndsAt!.toLocaleDateString(undefined, {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}.`
                : 'Redeem it here and your plan switches on straight away.'}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') redeem();
                }}
                placeholder="EB-XXXX-XXXX"
                maxLength={32}
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                className="h-9 w-full max-w-[220px] font-mono text-[13px] uppercase"
              />
              <Button
                size="sm"
                variant="outline"
                disabled={redeeming || !code.trim()}
                onClick={redeem}
              >
                {redeeming && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Redeem
              </Button>
            </div>
          </div>

          <p className="mt-5 text-[12.5px]" style={{ color: 'var(--ink-soft)' }}>
            Need a shared workspace, pooled hours or SSO?{' '}
            <a
              href="mailto:hello@echobrief.in?subject=EchoBrief%20for%20teams"
              className="font-medium no-underline"
              style={{ color: 'var(--ember-deep)' }}
            >
              Talk to us about Teams
            </a>
            .
          </p>
        </div>
      )}
    </div>
  );
}
