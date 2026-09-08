/**
 * More — the mobile hub, from mockup 10-more.
 *
 * The tab bar carries five destinations; everything else in the product is
 * reached from here. Each row's subtitle is read from the same rows the
 * destination writes — the notetaker's name, how many calendars are connected,
 * the summary language, the plan — so the hub reports state rather than
 * decorating a list of links.
 *
 * Desktop keeps the sidebar, so this page is only reachable from the tab bar;
 * visiting it on a wide screen is harmless and shows the same list.
 */

import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Bot,
  ChevronRight,
  Code2,
  CreditCard,
  Building2,
  Languages,
  LogOut,
  Lock,
  Plug,
  Target,
  Users,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { formatIST } from '@/lib/time';
import { fetchUsageMeter, planLabel, type UsageMeter } from '@/lib/usageMeter';
import { Avatar, Badge, Card, Label as EbLabel } from '@/ui';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';

const db = supabase;

interface HubState {
  fullName: string | null;
  notetakerName: string | null;
  autoJoin: boolean;
  summaryLanguage: string | null;
  emailSummaries: boolean;
  calendars: number;
  orgName: string | null;
  orgMembers: number | null;
}

function Row({
  icon: Icon,
  label,
  detail,
  to,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  detail?: string | null;
  to?: string;
  onClick?: () => void;
}) {
  const inner = (
    <>
      <span className="flex h-9 w-9 flex-none items-center justify-center rounded-input border border-eb-border bg-eb-card-alt text-eb-secondary">
        <Icon size={16} strokeWidth={1.75} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-dmsans text-[14px] font-medium text-eb-text">{label}</span>
        {detail && (
          <span className="block truncate font-dmsans text-[12.5px] text-eb-secondary">{detail}</span>
        )}
      </span>
      <ChevronRight size={16} strokeWidth={1.75} className="flex-none text-eb-muted" />
    </>
  );

  const className =
    'flex min-h-[56px] w-full items-center gap-3 border-b border-eb-divider px-4 py-3 text-left no-underline last:border-0 hover:bg-eb-row-hover';

  return to ? (
    <Link to={to} className={className}>
      {inner}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={className}>
      {inner}
    </button>
  );
}

export default function MoreV2() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [meter, setMeter] = useState<UsageMeter | null>(null);
  const [state, setState] = useState<HubState | null>(null);

  useEffect(() => {
    if (!user) return;
    void fetchUsageMeter(user.id).then(setMeter).catch(() => setMeter(null));

    void (async () => {
      const [{ data: profile }, { data: calendars }, orgRes] = await Promise.all([
        db
          .from('profiles')
          .select('full_name, notetaker_name, auto_join_enabled, summary_language, email_summaries_enabled')
          .eq('user_id', user.id)
          .maybeSingle(),
        db.from('calendars').select('id').eq('user_id', user.id).eq('is_active', true),
        supabase.functions.invoke('manage-organization', { body: { action: 'get' } }),
      ]);

      const p = (profile ?? {}) as Record<string, unknown>;
      const org = (orgRes?.data as { organization?: { name: string }; members?: unknown[] } | null) ?? null;
      setState({
        fullName: (p.full_name as string) ?? null,
        notetakerName: (p.notetaker_name as string) ?? null,
        autoJoin: !!p.auto_join_enabled,
        summaryLanguage: (p.summary_language as string) ?? null,
        emailSummaries: p.email_summaries_enabled !== false,
        calendars: (calendars ?? []).length,
        orgName: org?.organization?.name ?? null,
        orgMembers: Array.isArray(org?.members) ? org.members.length : null,
      });
    })();
  }, [user]);

  const name = state?.fullName || user?.email || 'Your account';

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-5">
      <h1 className="m-0 font-outfit text-[26px] font-semibold leading-[1.15] tracking-[-.02em] text-eb-text">
        More
      </h1>

      <Card>
        <div className="flex items-center gap-3">
          <Avatar name={name} size={48} round />
          <div className="min-w-0 flex-1">
            <div className="truncate font-dmsans text-[15px] font-medium text-eb-text">{name}</div>
            <div className="truncate font-dmsans text-[12.5px] text-eb-secondary">{user?.email}</div>
          </div>
          {meter && (
            <Badge tone="accent" className="flex-none">
              {planLabel(meter.plan)}
            </Badge>
          )}
        </div>

        {meter && (
          <>
            <div className="mt-4 flex items-center justify-between font-dmsans text-[12.5px]">
              <span className="text-eb-secondary">Meeting hours</span>
              <span className="font-medium text-eb-text">{meter.label}</span>
            </div>
            {meter.ratio !== null && (
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-pill bg-eb-chip">
                <div
                  className="h-full rounded-pill bg-gradient-to-r from-eb-accent-bar to-eb-accent"
                  style={{ width: `${Math.round(meter.ratio * 100)}%` }}
                />
              </div>
            )}
            {meter.renewsAt && (
              <p className="mt-1.5 font-dmsans text-[12px] text-eb-muted">
                Renews {formatIST(new Date(meter.renewsAt), 'd MMM')}
              </p>
            )}
          </>
        )}
      </Card>

      <div>
        <EbLabel className="mb-1.5 px-1">Capture</EbLabel>
        <Card padded={false}>
          <Row
            icon={Bot}
            label="Bot"
            detail={
              state
                ? `${state.notetakerName || 'Notetaker'}${state.autoJoin ? ' · auto-joins' : ' · auto-join off'}`
                : null
            }
            to="/settings?tab=bot"
          />
          <Row
            icon={Plug}
            label="Integrations"
            detail={
              state
                ? `${state.calendars} calendar${state.calendars === 1 ? '' : 's'}${state.emailSummaries ? ' · email summaries on' : ''}`
                : null
            }
            to="/settings?tab=integrations"
          />
          <Row
            icon={Languages}
            label="Language"
            detail={state ? (state.summaryLanguage === 'hi' ? 'Summaries in Hindi' : 'Summaries in English') : null}
            to="/settings?tab=account"
          />
        </Card>
      </div>

      <div>
        <EbLabel className="mb-1.5 px-1">Understand</EbLabel>
        <Card padded={false}>
          <Row icon={Users} label="Contacts" to="/contacts" />
          <Row icon={Target} label="Coaching" to="/coaching" />
          <Row
            icon={Building2}
            label="Workspace"
            detail={
              state?.orgName
                ? `${state.orgName}${state.orgMembers ? ` · ${state.orgMembers} member${state.orgMembers === 1 ? '' : 's'}` : ''}`
                : 'Not in a workspace'
            }
            to="/workspace"
          />
        </Card>
      </div>

      <div>
        <EbLabel className="mb-1.5 px-1">Account</EbLabel>
        <Card padded={false}>
          <Row
            icon={CreditCard}
            label="Billing"
            detail={meter ? planLabel(meter.plan) : null}
            to="/settings?tab=billing"
          />
          <Row icon={Lock} label="Security" to="/settings?tab=security" />
          <Row icon={Code2} label="Developer" to="/settings?tab=developer" />
          <Row
            icon={LogOut}
            label="Sign out"
            onClick={async () => {
              await signOut();
              navigate('/auth');
            }}
          />
        </Card>
      </div>
      </div>
    </DashboardLayout>
  );
}
