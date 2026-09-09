/**
 * Settings.
 *
 * A 200px chip rail beside a 760px column of Sections, per DESIGN_SPEC §1 and
 * §7. Tab routing, the profile fetch (including the write-on-load repair of a
 * missing or empty profile row) and the local state predate the Console and
 * are unchanged. The webhook section sits under Developer rather than Account
 * because that is where the spec files it.
 *
 * Settings deliberately stays on local `useState` rather than TanStack Query:
 * it is a form page with write-on-load side effects and user-mutated lists, a
 * poor fit for read-caching.
 */

import { useEffect, useState } from "react";
import {
  Bot, CreditCard, Code2, Loader2, Lock, Plug, User, type LucideIcon,
} from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { displayNameFromUserMetadata } from "@/lib/userDisplayName";
import { ApiTokensCard } from "@/components/settings/ApiTokensCard";
import { BillingCard } from "@/components/settings/BillingCard";
import { IntegrationsPanel } from "@/components/settings/IntegrationsPanel";
import { SecurityPanel } from "@/components/settings/SecurityPanel";
import { BotPanel } from "@/components/settings/BotPanel";
import { AccountPanel } from "@/components/settings/AccountPanel";
import { WebhookSection } from "@/components/settings/WebhookSection";
import { PageHeader, SettingsLayout } from "@/ui";
import { cn } from "@/lib/utils";
import type { Profile } from "@/components/settings/types";

type SettingsTab = "account" | "bot" | "integrations" | "billing" | "security" | "developer";

const TABS: Array<{ id: SettingsTab; label: string; icon: LucideIcon }> = [
  { id: "account", label: "Account", icon: User },
  { id: "bot", label: "Bot", icon: Bot },
  { id: "integrations", label: "Integrations", icon: Plug },
  { id: "billing", label: "Billing", icon: CreditCard },
  { id: "security", label: "Security", icon: Lock },
  { id: "developer", label: "Developer", icon: Code2 },
];

export default function Settings() {
  const { user } = useAuth();

  const getInitialTab = (): SettingsTab => {
    const tabParam = new URLSearchParams(window.location.search).get("tab");
    return TABS.some((t) => t.id === tabParam) ? (tabParam as SettingsTab) : "account";
  };

  const [activeTab, setActiveTab] = useState<SettingsTab>(getInitialTab());
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const fetchProfile = async () => {
      // Fresh user from the Auth API: the JWT in memory can lag behind a display
      // name edited on the Dashboard.
      const { data: authData, error: authErr } = await supabase.auth.getUser();
      const authUser = authData?.user ?? user;
      if (authErr) {
        console.warn("[Settings] getUser:", authErr);
      }

      const fromAuthMeta = displayNameFromUserMetadata(authUser);

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (profileError) {
        console.error("[Settings] profile fetch:", profileError);
        setProfile(null);
      } else if (profileData) {
        const fromProfile = (profileData.full_name || "").trim();
        const resolvedName = fromProfile || fromAuthMeta;
        setProfile({ ...(profileData as Profile), full_name: resolvedName || null });

        if (!fromProfile && resolvedName) {
          await supabase.from("profiles").update({ full_name: resolvedName }).eq("user_id", user.id);
        }
      } else {
        setProfile(null);
        if (fromAuthMeta || authUser.email) {
          const { error: insertErr } = await supabase.from("profiles").insert({
            user_id: user.id,
            email: authUser.email ?? null,
            full_name: fromAuthMeta || null,
          });
          if (insertErr?.code === "23505") {
            await supabase
              .from("profiles")
              .update({ full_name: fromAuthMeta || null })
              .eq("user_id", user.id);
          }
        }
      }

      setLoading(false);
    };

    fetchProfile();
  }, [user]);

  if (loading) {
    return (
      <AppShell>
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-eb-muted" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader title="Settings" subtitle="Manage your account, integrations and preferences." />

      <SettingsLayout
        rail={
          <nav aria-label="Settings sections" className="flex flex-row gap-1.5 overflow-x-auto md:flex-col">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const active = tab.id === activeTab;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "tap-44 inline-flex h-9 flex-none items-center gap-2.5 rounded-pill border px-3.5",
                    "font-dmsans text-[13.5px] font-medium whitespace-nowrap md:w-full",
                    active
                      ? "border-eb-sidebar bg-eb-sidebar text-white"
                      : "border-transparent text-eb-secondary hover:bg-eb-row-hover",
                  )}
                >
                  <Icon size={15} strokeWidth={1.75} className={active ? "text-eb-accent-sidebar" : "text-eb-muted"} />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        }
      >
        {activeTab === "account" && <AccountPanel profile={profile} setProfile={setProfile} />}

        {activeTab === "bot" && user && <BotPanel userId={user.id} />}

        {activeTab === "integrations" && (
          <IntegrationsPanel profile={profile} setProfile={setProfile} />
        )}

        {activeTab === "billing" && <BillingCard />}

        {activeTab === "security" && <SecurityPanel />}

        {activeTab === "developer" && (
          <>
            <ApiTokensCard />
            <WebhookSection profile={profile} setProfile={setProfile} />
          </>
        )}
      </SettingsLayout>
    </AppShell>
  );
}
