/**
 * Workspace — Console (UI v2), from mockup 09-workspace.
 *
 * Every action goes through manage-organization, which is the only thing that
 * can read another member's name: profiles are not readable across users, so
 * the function resolves them with the service role. Its actions are create,
 * get, invite, revoke_invite, remove_member and leave — and that list is
 * exactly what this page offers.
 *
 * Three things in the mockup are not here, each for a missing backend:
 *  - the per-member role dropdown: there is no change_role action, so a role
 *    is shown as what it is, a fact, not a control that silently does nothing;
 *  - the sharing-defaults toggles ("share new meetings with workspace",
 *    "members can see coaching scores"): `organizations` has no such columns,
 *    and meetings are private until an explicit share row exists;
 *  - pooled hours and shared-meeting counts across the workspace: usage_events
 *    and meeting_shares are RLS-scoped per user, and `get` does not return the
 *    pooled figures, so the rail shows YOUR usage and says so rather than
 *    printing a workspace number nothing computed.
 */

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Mail, Plus, Trash2, Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { ListSkeleton } from '@/components/dashboard/ListSkeleton';
import { formatIST } from '@/lib/time';
import { fetchUsageMeter, planLabel, type UsageMeter } from '@/lib/usageMeter';
import { Avatar, Badge, Button as EbButton, Card, PageHeader, TwoColumn } from '@/ui';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface Member {
  user_id: string;
  role: 'owner' | 'admin' | 'member';
  joined_at: string;
  email: string | null;
  full_name: string | null;
  is_you: boolean;
}

interface Invite {
  id: string;
  email: string;
  role: string;
  expires_at: string;
  created_at: string;
}

interface WorkspaceState {
  organization: { id: string; name: string; created_at: string } | null;
  role?: 'owner' | 'admin' | 'member';
  members?: Member[];
  invites?: Invite[];
}

const ROLE_TONE = { owner: 'accent', admin: 'green', member: 'neutral' } as const;

export default function WorkspaceV2() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [state, setState] = useState<WorkspaceState | null>(null);
  const [meter, setMeter] = useState<UsageMeter | null>(null);
  const [paidSeats, setPaidSeats] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [newName, setNewName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'member' | 'admin'>('member');

  const call = async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke('manage-organization', { body });
    if (error) throw new Error(error.message || 'Request failed');
    if (data?.error) throw new Error(data.error);
    return data as WorkspaceState;
  };

  const load = useCallback(async () => {
    try {
      setState(await call({ action: 'get' }));
    } catch (e) {
      toast({
        title: 'Could not load the workspace',
        description: e instanceof Error ? e.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!user) return;
    void fetchUsageMeter(user.id).then(setMeter).catch(() => setMeter(null));
    // Seats are the subscription quantity on YOUR profile. A member cannot read
    // the owner's row, so this is null for anyone but whoever pays.
    void supabase
      .from('profiles')
      .select('subscription_quantity')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => setPaidSeats((data as { subscription_quantity?: number } | null)?.subscription_quantity ?? null));
  }, [user]);

  const run = async (body: Record<string, unknown>, success: string) => {
    setWorking(true);
    try {
      await call(body);
      await load();
      toast({ title: success });
      return true;
    } catch (e) {
      toast({
        title: 'That did not work',
        description: e instanceof Error ? e.message : 'Please try again.',
        variant: 'destructive',
      });
      return false;
    } finally {
      setWorking(false);
    }
  };

  const org = state?.organization ?? null;
  const members = state?.members ?? [];
  const invites = state?.invites ?? [];
  const isAdmin = state?.role === 'owner' || state?.role === 'admin';
  // Only a per-seat plan has a seat count worth printing.
  const seats = meter?.plan === 'teams' && paidSeats ? paidSeats : null;

  if (loading) {
    return (
      <DashboardLayout>
        <PageHeader title="Workspace" subtitle="Share meetings with colleagues and pool your plan's meeting hours." />
        <ListSkeleton />
      </DashboardLayout>
    );
  }

  if (!org) {
    return (
      <DashboardLayout>
        <PageHeader title="Workspace" subtitle="Share meetings with colleagues and pool your plan's meeting hours." />
        <Card className="mx-auto max-w-[560px] text-center">
          <Users size={26} strokeWidth={1.5} className="mx-auto mb-2.5 text-eb-muted" />
          <p className="font-dmsans text-sm font-medium text-eb-text">You are not in a workspace yet</p>
          <p className="mx-auto mt-1 max-w-[420px] font-dmsans text-[13px] text-eb-secondary">
            A workspace pools your plan's hours and lets you share individual meetings with
            colleagues. Your meetings stay private until you share them.
          </p>
          <form
            className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!newName.trim()) return;
              if (await run({ action: 'create', name: newName.trim() }, 'Workspace created')) setNewName('');
            }}
          >
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Workspace name"
              maxLength={80}
              className="rounded-input border border-eb-border bg-eb-card px-3 py-2 font-dmsans text-[13px] text-eb-text shadow-eb-input outline-none sm:w-[260px]"
            />
            <EbButton variant="primary" type="submit" disabled={working || !newName.trim()}>
              {working ? 'Creating…' : 'Create workspace'}
            </EbButton>
          </form>
        </Card>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <PageHeader
        title="Workspace"
        subtitle="Share meetings with colleagues and pool your plan's meeting hours."
      />

      <TwoColumn
        rail={
          <div className="flex flex-col gap-4">
            <Card>
              <h3 className="m-0 font-outfit text-[16px] font-semibold tracking-[-0.01em] text-eb-text">
                {org.name}
              </h3>
              <p className="mt-0.5 font-dmsans text-[12.5px] text-eb-secondary">Workspace</p>

              <dl className="mt-3 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <dt className="font-dmsans text-[13px] text-eb-secondary">Your role</dt>
                  <dd className="m-0 font-dmsans text-[13px] font-medium text-eb-text">
                    {state?.role ? state.role[0].toUpperCase() + state.role.slice(1) : '—'}
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="font-dmsans text-[13px] text-eb-secondary">Members</dt>
                  <dd className="m-0 font-dmsans text-[13px] font-medium text-eb-text">
                    {members.length}
                    {seats ? ` of ${seats} seats` : ''}
                  </dd>
                </div>
                {meter && (
                  <>
                    <div className="flex items-center justify-between">
                      <dt className="font-dmsans text-[13px] text-eb-secondary">Plan</dt>
                      <dd className="m-0 font-dmsans text-[13px] font-medium text-eb-text">
                        {planLabel(meter.plan)}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between">
                      <dt className="font-dmsans text-[13px] text-eb-secondary">Your usage</dt>
                      <dd className="m-0 font-dmsans text-[13px] font-medium text-eb-text">{meter.label}</dd>
                    </div>
                  </>
                )}
              </dl>

              {meter?.ratio !== null && meter?.ratio !== undefined && (
                <div className="mt-3 h-1.5 w-full overflow-hidden rounded-pill bg-eb-chip">
                  <div
                    className="h-full rounded-pill bg-gradient-to-r from-eb-accent-bar to-eb-accent"
                    style={{ width: `${Math.round(meter.ratio * 100)}%` }}
                  />
                </div>
              )}

              <p className="mt-3 font-dmsans text-[12px] leading-snug text-eb-secondary">
                Hours are pooled across the workspace and billed on the owner's plan. This card shows
                your own usage — the pooled total is enforced server-side.
              </p>
            </Card>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          <Card padded={false}>
            <div className="flex items-center justify-between border-b border-eb-divider px-[18px] py-3">
              <h3 className="m-0 font-outfit text-[15px] font-semibold leading-tight text-eb-text">Members</h3>
              <span className="font-dmsans text-[12.5px] text-eb-secondary">
                {members.length}
                {seats ? ` of ${seats} seats` : ''}
              </span>
            </div>

            {members.map((m) => (
              <div
                key={m.user_id}
                className="flex items-center gap-3 border-b border-eb-divider px-[18px] py-3 last:border-0"
              >
                <Avatar name={m.full_name || m.email || '?'} size={32} round />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-dmsans text-[13.5px] font-medium text-eb-text">
                    {m.full_name || m.email || 'Member'}
                    {m.is_you && <span className="ml-1.5 font-normal text-eb-muted">you</span>}
                  </span>
                  {m.email && (
                    <span className="block truncate font-dmsans text-[12.5px] text-eb-secondary">{m.email}</span>
                  )}
                </span>
                <Badge tone={ROLE_TONE[m.role]} className="flex-none">
                  {m.role[0].toUpperCase() + m.role.slice(1)}
                </Badge>
                {isAdmin && !m.is_you && m.role !== 'owner' && (
                  <button
                    type="button"
                    disabled={working}
                    onClick={() => run({ action: 'remove_member', user_id: m.user_id }, 'Member removed')}
                    aria-label={`Remove ${m.email || 'member'}`}
                    className="flex-none text-eb-muted hover:text-eb-red disabled:opacity-50"
                  >
                    <Trash2 size={14} strokeWidth={1.75} />
                  </button>
                )}
              </div>
            ))}

            {invites.length > 0 && (
              <>
                <div className="border-b border-eb-divider bg-eb-card-alt px-[18px] py-2 font-dmsans text-[11.5px] font-medium uppercase tracking-[.06em] text-eb-secondary">
                  Pending invites
                </div>
                {invites.map((i) => (
                  <div
                    key={i.id}
                    className="flex items-center gap-3 border-b border-eb-divider px-[18px] py-3 last:border-0"
                  >
                    <Mail size={14} strokeWidth={1.75} className="flex-none text-eb-muted" />
                    <span className="min-w-0 flex-1 truncate font-dmsans text-[13.5px] text-eb-text">
                      {i.email}
                    </span>
                    <span className="flex-none font-dmsans text-[12.5px] text-eb-secondary">
                      expires {formatIST(new Date(i.expires_at), 'MMM d')}
                    </span>
                    <button
                      type="button"
                      disabled={working}
                      onClick={() => run({ action: 'revoke_invite', invite_id: i.id }, 'Invite revoked')}
                      aria-label={`Revoke the invite for ${i.email}`}
                      className="flex-none text-eb-muted hover:text-eb-red disabled:opacity-50"
                    >
                      <Trash2 size={14} strokeWidth={1.75} />
                    </button>
                  </div>
                ))}
              </>
            )}
          </Card>

          {isAdmin && (
            <Card>
              <h3 className="m-0 font-outfit text-[15px] font-semibold tracking-[-0.01em] text-eb-text">
                Invite a colleague
              </h3>
              <p className="mt-0.5 font-dmsans text-[13px] text-eb-secondary">
                They get an email link that expires in 14 days and only works for that address.
              </p>
              <form
                className="mt-3 flex flex-col gap-2 sm:flex-row"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!inviteEmail.trim()) return;
                  if (
                    await run(
                      { action: 'invite', email: inviteEmail.trim(), role: inviteRole },
                      'Invite sent',
                    )
                  ) {
                    setInviteEmail('');
                  }
                }}
              >
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="colleague@company.com"
                  className="min-w-0 flex-1 rounded-input border border-eb-border bg-eb-card px-3 py-2 font-dmsans text-[13px] text-eb-text shadow-eb-input outline-none"
                />
                <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as 'member' | 'admin')}>
                  <SelectTrigger className="h-[38px] w-[130px] rounded-input border-eb-border bg-eb-card font-dmsans text-[13px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="member">Member</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
                <EbButton
                  variant="primary"
                  type="submit"
                  disabled={working || !inviteEmail.trim()}
                  icon={working ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} strokeWidth={2} />}
                >
                  Send invite
                </EbButton>
              </form>
            </Card>
          )}

          {state?.role !== 'owner' && (
            <div>
              <EbButton
                variant="destructive"
                size="sm"
                disabled={working}
                onClick={() => run({ action: 'leave' }, 'You left the workspace')}
              >
                Leave workspace
              </EbButton>
            </div>
          )}
        </div>
      </TwoColumn>
    </DashboardLayout>
  );
}
