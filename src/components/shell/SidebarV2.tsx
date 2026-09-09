import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Mic, Calendar, SquareCheck, Users, Target, MessageCircle, Building2, Settings,
  ChevronDown, Ellipsis, type LucideIcon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { displayNameFromUserMetadata } from "@/lib/userDisplayName";
import { fetchUsageMeter, planLabel, type UsageMeter } from "@/lib/usageMeter";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/ui/Logo";

type NavItem = { icon: LucideIcon; label: string; path: string };

/**
 * Three labelled groups, per DESIGN_SPEC §1. The labels are also what
 * PageHeader's eyebrow shows, so they must match src/ui/Layout.tsx.
 */
export const NAV_GROUPS: Array<{ label: string; items: NavItem[] }> = [
  {
    label: "Capture",
    items: [
      { icon: Mic, label: "Meetings", path: "/dashboard" },
      { icon: Calendar, label: "Calendar", path: "/calendar" },
      { icon: SquareCheck, label: "Action items", path: "/action-items" },
    ],
  },
  {
    label: "Understand",
    items: [
      { icon: Users, label: "Contacts", path: "/contacts" },
      { icon: Target, label: "Coaching", path: "/coaching" },
      { icon: MessageCircle, label: "Ask", path: "/chat" },
    ],
  },
  {
    label: "Manage",
    items: [
      { icon: Building2, label: "Workspace", path: "/workspace" },
      { icon: Settings, label: "Settings", path: "/settings" },
    ],
  },
];

/** Meeting detail lives under /meeting/:id but belongs to Meetings. */
export function isNavItemActive(itemPath: string, pathname: string) {
  if (itemPath === "/dashboard") {
    return pathname === "/dashboard" || pathname.startsWith("/meeting");
  }
  return pathname === itemPath;
}

function NavRow({ item, active, onNavigate }: { item: NavItem; active: boolean; onNavigate?: () => void }) {
  const Icon = item.icon;
  return (
    <Link
      to={item.path}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex h-[34px] items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] no-underline",
        active
          ? "bg-white/[.07] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,.06)]"
          : "text-eb-on-dark hover:bg-white/[.04]",
      )}
    >
      {active && (
        <span className="absolute -left-4 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r bg-eb-accent-bar" />
      )}
      <Icon size={16} strokeWidth={1.75} className={active ? "text-eb-accent-sidebar" : "text-eb-nav-icon"} />
      {item.label}
    </Link>
  );
}

function PlanCard() {
  const { user } = useAuth();
  const [meter, setMeter] = useState<UsageMeter | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    // Best-effort: the card simply does not render if this fails. A usage read
    // must never be able to take the navigation down with it.
    fetchUsageMeter(user.id)
      .then((m) => !cancelled && setMeter(m))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (!meter) return null;

  const renews = meter.renewsAt
    ? new Date(meter.renewsAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
    : null;

  return (
    <div className="rounded-xl bg-gradient-to-b from-white/[.08] to-white/[.03] p-3 shadow-[inset_0_0_0_1px_rgba(255,255,255,.06)]">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[12.5px] font-medium text-white">{planLabel(meter.plan)}</span>
        <span className="font-mono text-[11px] text-eb-on-dark">{meter.label}</span>
      </div>
      {meter.ratio !== null && (
        <div className="mt-2 h-1 overflow-hidden rounded-pill bg-white/10">
          <div
            className="h-full rounded-pill bg-gradient-to-r from-eb-accent-bar to-eb-accent-sidebar"
            style={{ width: `${Math.round(meter.ratio * 100)}%` }}
          />
        </div>
      )}
      <div className="mt-2 text-[11.5px] text-eb-on-dark">
        {renews && <>Renews {renews} · </>}
        <Link to="/settings?tab=billing" className="text-eb-accent-sidebar no-underline hover:underline">
          Upgrade
        </Link>
      </div>
    </div>
  );
}

function UserCard() {
  const { user } = useAuth();
  const name = displayNameFromUserMetadata(user) || user?.email?.split("@")[0] || "User";
  const initial = (name[0] || "?").toUpperCase();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  // Settings can set a profile photo; without this the sidebar would keep the
  // initial and uploading one would look like it did nothing outside Settings.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void supabase
      .from("profiles")
      .select("avatar_url")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setAvatarUrl(data?.avatar_url ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);
  return (
    <Link
      to="/settings"
      className="flex items-center gap-2.5 rounded-xl px-1.5 py-1.5 no-underline hover:bg-white/[.04]"
    >
      {avatarUrl ? (
        <img src={avatarUrl} alt="" className="h-[30px] w-[30px] flex-none rounded-full object-cover" />
      ) : (
        <span className="inline-flex h-[30px] w-[30px] flex-none items-center justify-center rounded-full bg-gradient-to-b from-eb-accent-top to-eb-accent font-outfit text-[13px] font-semibold text-white">
          {initial}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] font-medium text-white">{name}</span>
        <span className="block truncate text-[11.5px] text-eb-on-dark">{user?.email}</span>
      </span>
      <Ellipsis size={15} strokeWidth={1.75} className="flex-none text-eb-nav-icon" />
    </Link>
  );
}

export function SidebarV2({ onNavigate }: { onNavigate?: () => void }) {
  const location = useLocation();
  return (
    <div className="flex h-full w-[232px] flex-col bg-eb-sidebar">
      <div className="flex h-[60px] flex-none items-center justify-between px-4">
        <Logo variant="console" tone="dark" size="md" linkTo="/dashboard" />
        <ChevronDown size={15} strokeWidth={1.75} className="text-eb-nav-icon" />
      </div>

      <nav aria-label="Main" className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-2">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="flex flex-col gap-0.5">
            <div className="mb-1 px-2.5 text-[10.5px] font-semibold uppercase tracking-[.09em] text-eb-group-label">
              {group.label}
            </div>
            {group.items.map((item) => (
              <NavRow
                key={item.path}
                item={item}
                active={isNavItemActive(item.path, location.pathname)}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        ))}
      </nav>

      <div className="flex flex-none flex-col gap-2 p-3">
        <PlanCard />
        <UserCard />
      </div>
    </div>
  );
}
