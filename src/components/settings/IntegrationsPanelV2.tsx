/**
 * Integrations — Console (UI v2). Calendars, delivery, CRM.
 *
 * Every call is the V1 panel's: the same OAuth start endpoints, the same
 * disconnect functions, the same manage-slack / manage-zoho actions. Three
 * differences, all of them consequences of the mockup's layout:
 *
 *  - Calendars are one list, not a card per provider. Google calendars and the
 *    Outlook connection are rows of the same shape, which is how auto-join
 *    already treats them (_shared/calendar-connections.ts).
 *  - The per-calendar control is a real toggle over `calendars.is_active`. V1
 *    listed only active calendars and offered a one-way X, so turning a calendar
 *    back on was impossible from the UI. This lists all of them and writes both
 *    directions.
 *  - Slack and Zoho are rows inside Delivery and CRM rather than cards of their
 *    own, because a card inside a card is the one thing DESIGN_SPEC §5 forbids.
 *
 * Below md the page follows mockup 13: an Accounts group above Calendars, and
 * every account-level action as a 30px chip on a second line under its row
 * rather than a full-width button stacked inside it. Desktop keeps the button
 * row it already had.
 */

import { useCallback, useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Badge, BrandTile, Button, EmailTile, Section, Select, Toggle } from "@/ui";
import { cn } from "@/lib/utils";
import type { Profile } from "./types";

interface PanelProps {
  profile: Profile | null;
  setProfile: React.Dispatch<React.SetStateAction<Profile | null>>;
}

type CalendarRow = {
  id: string;
  name: string;
  email: string;
  is_active: boolean;
  is_primary: boolean;
  provider: string;
};

type SlackStatus = {
  connected: boolean;
  team_name?: string | null;
  channel_id?: string | null;
  channel_name?: string | null;
  needs_reconnect?: boolean;
};

type ZohoStatus = { connected: boolean; needs_reconnect?: boolean };

export function IntegrationsPanelV2({ profile, setProfile }: PanelProps) {
  const { user, session } = useAuth();
  const { toast } = useToast();
  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

  const [calendars, setCalendars] = useState<CalendarRow[]>([]);
  const [microsoft, setMicrosoft] = useState<{ connected: boolean; needsReconnect: boolean } | null>(null);
  const [connectingGoogle, setConnectingGoogle] = useState(false);
  const [connectingMicrosoft, setConnectingMicrosoft] = useState(false);
  const [savingEmailPref, setSavingEmailPref] = useState(false);

  const [slack, setSlack] = useState<SlackStatus | null>(null);
  const [slackChannels, setSlackChannels] = useState<Array<{ id: string; name: string; is_private: boolean }> | null>(null);
  const [connectingSlack, setConnectingSlack] = useState(false);

  const [zoho, setZoho] = useState<ZohoStatus | null>(null);
  const [connectingZoho, setConnectingZoho] = useState(false);

  /* ── calendars ─────────────────────────────────────────────────────────── */

  const loadCalendars = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("calendars")
      .select("id, email, calendar_name, is_primary, is_active, provider")
      .eq("user_id", user.id)
      .order("is_primary", { ascending: false });
    if (error || !data) return;
    setCalendars(
      data.map((cal: Record<string, unknown>) => ({
        id: String(cal.id),
        name: String(cal.calendar_name || "Unnamed calendar"),
        email: String(cal.email || ""),
        is_active: cal.is_active !== false,
        is_primary: !!cal.is_primary,
        provider: String(cal.provider || "google"),
      })),
    );
  }, [user]);

  const loadMicrosoft = useCallback(async () => {
    if (!user) return;
    // RLS scopes this to the caller; tokens are never selected.
    const { data } = await supabase
      .from("calendar_connections")
      .select("provider, needs_reconnect")
      .eq("user_id", user.id)
      .eq("provider", "microsoft")
      .maybeSingle();
    setMicrosoft(data ? { connected: true, needsReconnect: !!data.needs_reconnect } : null);
  }, [user]);

  useEffect(() => {
    void loadCalendars();
    void loadMicrosoft();
  }, [loadCalendars, loadMicrosoft]);

  // The Google redirect lands back here; the callback writes the calendars, so
  // give the write a beat before reading them.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("google_connected") !== "true") return;
    const timer = setTimeout(() => void loadCalendars(), 500);
    return () => clearTimeout(timer);
  }, [loadCalendars]);

  const startOAuth = async (fn: string, setBusy: (v: boolean) => void, label: string) => {
    if (!session?.access_token) {
      toast({ title: "Sign in first", description: `Please sign in to connect ${label}.`, variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ returnTo: "/settings?tab=integrations", origin: window.location.origin }),
      });
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      if (data.authUrl) window.location.href = data.authUrl;
    } catch (error) {
      toast({ title: `Could not connect ${label}`, description: (error as Error).message, variant: "destructive" });
      setBusy(false);
    }
  };

  const toggleCalendar = async (row: CalendarRow, active: boolean) => {
    const previous = calendars;
    setCalendars((prev) => prev.map((c) => (c.id === row.id ? { ...c, is_active: active } : c)));
    const { error } = await supabase
      .from("calendars")
      .update({ is_active: active })
      .eq("id", row.id)
      .eq("user_id", user?.id ?? "");
    if (error) {
      setCalendars(previous);
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const disconnectGoogle = async () => {
    if (!session?.access_token) return;
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/disconnect-google`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
      });
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      setProfile((prev) =>
        prev ? { ...prev, google_calendar_connected: false, google_needs_reconnect: false } : null,
      );
      setCalendars([]);
      toast({ title: "Disconnected", description: "Google Calendar access has been revoked." });
    } catch (error) {
      toast({ title: "Error", description: (error as Error).message, variant: "destructive" });
    }
  };

  const disconnectMicrosoft = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("disconnect-calendar", {
        body: { provider: "microsoft" },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      await loadMicrosoft();
      toast({ title: "Outlook disconnected" });
    } catch (error) {
      toast({ title: "Could not disconnect", description: (error as Error).message, variant: "destructive" });
    }
  };

  /* ── delivery ──────────────────────────────────────────────────────────── */

  // Backs deliverResults() in _shared/insights.ts, which treats a missing or
  // true value as "send the summary".
  const toggleEmailSummaries = async (enabled: boolean) => {
    if (!user) return;
    setSavingEmailPref(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ email_summaries_enabled: enabled })
        .eq("user_id", user.id);
      if (error) throw error;
      setProfile((prev) => (prev ? { ...prev, email_summaries_enabled: enabled } : null));
    } catch (error) {
      toast({ title: "Error", description: (error as Error).message, variant: "destructive" });
    } finally {
      setSavingEmailPref(false);
    }
  };

  const callSlack = useCallback(async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("manage-slack", { body });
    if (error) {
      // The function returns its reason in the body even on a 4xx, and that
      // reason ("invite the app to the channel") is the only actionable part.
      const detail = (data as { error?: string } | null)?.error;
      throw new Error(detail || error.message);
    }
    if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
    return data as Record<string, string>;
  }, []);

  const loadSlack = useCallback(async () => {
    try {
      setSlack((await callSlack({ action: "status" })) as unknown as SlackStatus);
    } catch {
      // A status read that fails must not break the rest of the tab.
      setSlack({ connected: false });
    }
  }, [callSlack]);

  const loadSlackChannels = useCallback(async () => {
    try {
      const data = await callSlack({ action: "channels" });
      setSlackChannels((data as unknown as { channels: Array<{ id: string; name: string; is_private: boolean }> }).channels ?? []);
    } catch (error) {
      toast({ title: "Could not list channels", description: (error as Error).message, variant: "destructive" });
      void loadSlack();
    }
  }, [callSlack, loadSlack, toast]);

  const callZoho = useCallback(async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("manage-zoho", { body });
    if (error) throw new Error((data as { error?: string } | null)?.error || error.message);
    if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
    return data as Record<string, unknown>;
  }, []);

  const loadZoho = useCallback(async () => {
    try {
      setZoho((await callZoho({ action: "status" })) as unknown as ZohoStatus);
    } catch {
      setZoho({ connected: false });
    }
  }, [callZoho]);

  useEffect(() => {
    void loadSlack();
    void loadZoho();
  }, [loadSlack, loadZoho]);

  // The Slack redirect lands with slack_connected=1: the workspace is connected
  // but no channel is chosen, and until one is, nothing posts.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("slack_connected") === "1") {
      toast({ title: "Slack connected", description: "Pick the channel summaries should go to." });
      void loadSlackChannels();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const disconnectSlack = () => {
    void callSlack({ action: "disconnect" })
      .then(() => {
        setSlack({ connected: false });
        setSlackChannels(null);
        toast({ title: "Slack disconnected" });
      })
      .catch((error: Error) =>
        toast({ title: "Could not disconnect", description: error.message, variant: "destructive" }),
      );
  };

  const googleConnected = !!profile?.google_calendar_connected || calendars.length > 0;
  const googleAccount = calendars.find((c) => c.provider === "google" && c.is_primary) ?? calendars[0];
  const accountEmails = new Set(calendars.map((c) => c.email).filter(Boolean));

  /**
   * Provider, then what kind of calendar it is — never the raw id.
   *
   * Google encodes that in the address it gives a calendar: a public feed you
   * subscribed to (holidays, sports) lives at `@group.v.calendar.google.com`,
   * a calendar someone shared with you at `@group.calendar.google.com`, and
   * your own calendars carry an actual account address. That is why the first
   * version of this row printed
   * `c_9d2520a97bb284e18607cd1467def241748a222abf73139ba6509da7d7f13def@group.calendar.google.com`
   * at a reader: the id was being shown where the answer already was.
   */
  const calendarSubtitle = (cal: CalendarRow) => {
    const provider = cal.provider === "microsoft" ? "Outlook" : "Google";
    const address = cal.email ?? "";
    // Any address Google generated for a calendar rather than for a person.
    const generated = /\.calendar\.google\.com$/.test(address);
    const parts = [provider];
    if (/@(group\.v|import)\.calendar\.google\.com$/.test(address)) parts.push("subscribed");
    else if (address.endsWith("@group.calendar.google.com")) parts.push("shared");
    else if (cal.is_primary) parts.push("primary");
    // Name the account only when more than one is connected, and never with an
    // id: an address the reader cannot recognise says less than nothing.
    else if (accountEmails.size > 1 && address && !generated) parts.push(address);
    return parts.join(" · ");
  };

  return (
    <>
      {/* Mockup 13, below md only: the accounts themselves, then their calendars. */}
      {(googleConnected || microsoft?.connected) && (
        <Section title="Accounts" className="md:hidden">
          <div className="-mx-5 -mt-2">
            {googleConnected && (
              <div className="border-b border-eb-divider px-5 py-3 last:border-0">
                <div className="flex items-center gap-3">
                  <BrandTile brand="gcal" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-dmsans text-sm font-medium">Google</span>
                      <Badge tone={profile?.google_needs_reconnect ? "amber" : "green"} dot>
                        {profile?.google_needs_reconnect ? "Reconnect" : "Connected"}
                      </Badge>
                    </div>
                    <div className="truncate font-dmsans text-[12.5px] text-eb-secondary">
                      {googleAccount?.email || profile?.email || user?.email}
                      {calendars.length > 0 &&
                        ` · ${calendars.length} calendar${calendars.length === 1 ? "" : "s"}`}
                    </div>
                  </div>
                </div>
                <div className="mt-2.5 flex flex-wrap gap-2 pl-[48px]">
                  <ChipButton
                    onClick={() => startOAuth("google-oauth-start", setConnectingGoogle, "Google")}
                    disabled={connectingGoogle}
                  >
                    {profile?.google_needs_reconnect ? "Reconnect" : "Add calendar"}
                  </ChipButton>
                  <ChipButton danger onClick={disconnectGoogle}>
                    Revoke access
                  </ChipButton>
                </div>
              </div>
            )}

            {microsoft?.connected && (
              <div className="px-5 py-3">
                <div className="flex items-center gap-3">
                  <BrandTile brand="outlook" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-dmsans text-sm font-medium">Outlook</span>
                      <Badge tone={microsoft.needsReconnect ? "amber" : "green"} dot>
                        {microsoft.needsReconnect ? "Reconnect" : "Connected"}
                      </Badge>
                    </div>
                    <div className="truncate font-dmsans text-[12.5px] text-eb-secondary">
                      Microsoft 365
                    </div>
                  </div>
                </div>
                <div className="mt-2.5 flex flex-wrap gap-2 pl-[48px]">
                  <ChipButton
                    onClick={() => startOAuth("microsoft-oauth-start", setConnectingMicrosoft, "Outlook")}
                    disabled={connectingMicrosoft}
                  >
                    Reconnect
                  </ChipButton>
                  <ChipButton danger onClick={disconnectMicrosoft}>
                    Disconnect
                  </ChipButton>
                </div>
              </div>
            )}
          </div>
        </Section>
      )}

      <Section
        title="Calendars"
        description="EchoBrief watches these calendars and sends the bot to meetings with a video link."
      >
        {calendars.length === 0 && !microsoft?.connected ? (
          <p className="font-dmsans text-[12.5px] text-eb-muted">
            No calendars connected yet. Add one below and the bot will start joining scheduled calls.
          </p>
        ) : (
          <div className="-mx-5 -mt-2">
            {calendars.map((cal) => (
              <div key={cal.id} className="flex items-center gap-3 border-b border-eb-divider px-5 py-3 last:border-0">
                <BrandTile brand="gcal" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-dmsans text-sm font-medium">{cal.name}</span>
                    <Badge tone="green" dot>Connected</Badge>
                  </div>
                  <div className="truncate font-dmsans text-[12.5px] text-eb-secondary">
                    {calendarSubtitle(cal)}
                  </div>
                </div>
                <Toggle
                  on={cal.is_active}
                  onChange={(v) => toggleCalendar(cal, v)}
                  label={`Watch ${cal.name}`}
                />
              </div>
            ))}

            {microsoft?.connected && (
              <div className="hidden items-center gap-3 border-b border-eb-divider px-5 py-3 last:border-0 md:flex">
                <BrandTile brand="outlook" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-dmsans text-sm font-medium">Outlook</span>
                    <Badge tone={microsoft.needsReconnect ? "amber" : "green"} dot>
                      {microsoft.needsReconnect ? "Needs reconnect" : "Connected"}
                    </Badge>
                  </div>
                  <div className="truncate font-dmsans text-[12.5px] text-eb-secondary">Microsoft 365</div>
                </div>
                <button
                  type="button"
                  onClick={disconnectMicrosoft}
                  aria-label="Disconnect Outlook"
                  className="text-eb-muted hover:text-eb-red"
                >
                  <X size={16} strokeWidth={1.75} />
                </button>
              </div>
            )}
          </div>
        )}

        {profile?.google_needs_reconnect && (
          <div
            role="alert"
            className="mt-4 rounded-input border border-[color-mix(in_srgb,var(--eb-amber)_40%,transparent)] bg-eb-amber-bg px-4 py-3 font-dmsans text-[13px] text-eb-amber-text"
          >
            Google Calendar stopped refreshing — reconnect to keep auto-join working.
          </div>
        )}

        <div className="mt-4 hidden flex-wrap gap-2 md:flex">
          <Button
            onClick={() => startOAuth("google-oauth-start", setConnectingGoogle, "Google")}
            disabled={connectingGoogle}
            icon={connectingGoogle ? <Loader2 size={15} className="animate-spin" /> : <BrandTile brand="gcal" size={18} className="border-0 bg-transparent shadow-none" />}
          >
            {profile?.google_needs_reconnect ? "Reconnect Google" : "Add Google Calendar"}
          </Button>
          <Button
            onClick={() => startOAuth("microsoft-oauth-start", setConnectingMicrosoft, "Outlook")}
            disabled={connectingMicrosoft}
            icon={connectingMicrosoft ? <Loader2 size={15} className="animate-spin" /> : <BrandTile brand="outlook" size={18} className="border-0 bg-transparent shadow-none" />}
          >
            {microsoft?.connected ? "Reconnect Outlook" : "Add Outlook"}
          </Button>
          {googleConnected && (
            <Button variant="destructive" onClick={disconnectGoogle}>
              Revoke Google access
            </Button>
          )}
        </div>
      </Section>

      <Section title="Delivery" description="Where summaries go when a meeting finishes processing.">
        <div className="-mx-5 -mt-2">
          <div className="flex items-center gap-3 border-b border-eb-divider px-5 py-3">
            <EmailTile />
            <div className="min-w-0 flex-1">
              <div className="font-dmsans text-sm font-medium">Email</div>
              <div className="truncate font-dmsans text-[12.5px] text-eb-secondary">
                {profile?.email || user?.email} · sent when processing finishes
              </div>
            </div>
            {savingEmailPref ? (
              <Loader2 className="h-4 w-4 animate-spin text-eb-muted" />
            ) : (
              <Toggle
                on={profile?.email_summaries_enabled !== false}
                onChange={toggleEmailSummaries}
                label="Email me the summary"
              />
            )}
          </div>

          <div className="px-5 py-3">
            <div className="flex items-center gap-3">
              <BrandTile brand="slack" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-dmsans text-sm font-medium">Slack</span>
                  {slack?.connected && (
                    <Badge tone={slack.needs_reconnect ? "amber" : "green"} dot>
                      {slack.needs_reconnect ? "Needs reconnect" : "Connected"}
                    </Badge>
                  )}
                </div>
                <div className="truncate font-dmsans text-[12.5px] text-eb-secondary">
                  {slack?.connected
                    ? slack.channel_name
                      ? `${slack.team_name ?? "Workspace"} · #${slack.channel_name}`
                      : `${slack.team_name ?? "Workspace"} · no channel chosen — nothing is posted`
                    : "Not connected"}
                </div>
              </div>
              <div className="hidden flex-none items-center gap-2 md:flex">
                {slack?.connected && (
                  <Button
                    size="sm"
                    onClick={disconnectSlack}
                  >
                    Disconnect
                  </Button>
                )}
                <Button
                  variant={slack?.connected ? "secondary" : "primary"}
                  size="sm"
                  disabled={connectingSlack}
                  onClick={() => startOAuth("slack-oauth-start", setConnectingSlack, "Slack")}
                >
                  {connectingSlack && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {slack?.connected ? "Reconnect" : "Connect"}
                </Button>
              </div>
            </div>

            {slack?.connected && (
              <div className="mt-2.5 flex flex-wrap gap-2 pl-[48px] md:hidden">
                <ChipButton onClick={loadSlackChannels}>
                  {slack.channel_name ? "Change channel" : "Choose a channel"}
                </ChipButton>
                <ChipButton danger onClick={disconnectSlack}>
                  Disconnect
                </ChipButton>
              </div>
            )}

            {slack?.connected && (
              <div className="mt-3 flex items-center gap-2 pl-[48px]">
                {slackChannels ? (
                  <Select
                    value={slack.channel_id ?? ""}
                    onChange={(e) => {
                      const channelId = e.target.value;
                      if (!channelId) return;
                      void callSlack({ action: "set_channel", channel_id: channelId })
                        .then((data) => {
                          setSlack((prev) =>
                            prev ? { ...prev, channel_id: data.channel_id, channel_name: data.channel_name } : prev,
                          );
                          toast({ title: "Channel saved", description: `Summaries will post to #${data.channel_name}.` });
                        })
                        .catch((error: Error) =>
                          toast({ title: "Could not save the channel", description: error.message, variant: "destructive" }),
                        );
                    }}
                    className="max-w-[320px]"
                  >
                    <option value="">Choose a channel…</option>
                    {slackChannels.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.is_private ? "🔒 " : "# "}
                        {c.name}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <Button size="sm" className="hidden md:inline-flex" onClick={loadSlackChannels}>
                    {slack.channel_name ? "Change channel" : "Choose a channel"}
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </Section>

      <Section
        title="CRM"
        description="Log every external meeting against the matching contact, with the summary and next steps attached."
      >
        <div className="flex items-center gap-3">
          <BrandTile brand="zoho" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-dmsans text-sm font-medium">Zoho CRM</span>
              <Badge tone={zoho?.connected ? (zoho.needs_reconnect ? "amber" : "green") : "neutral"} dot={!!zoho?.connected}>
                {zoho?.connected ? (zoho.needs_reconnect ? "Needs reconnect" : "Connected") : "Not connected"}
              </Badge>
            </div>
            <div className="font-dmsans text-[12.5px] text-eb-secondary max-md:hidden">
              Matches attendees by email. Attaches a note when insights are ready — never creates or edits a record.
            </div>
            <div className="font-dmsans text-[12.5px] leading-[1.45] text-eb-secondary md:hidden">
              Logs meetings to contacts and deals
            </div>
          </div>
          <div className="hidden flex-none items-center gap-2 md:flex">
            {zoho?.connected && (
              <>
                <Button
                  size="sm"
                  onClick={() => {
                    void callZoho({ action: "test" })
                      .then(() => toast({ title: "Zoho connection is healthy" }))
                      .catch((error: Error) =>
                        toast({ title: "Zoho check failed", description: error.message, variant: "destructive" }),
                      );
                  }}
                >
                  Test
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    void callZoho({ action: "disconnect" })
                      .then(() => {
                        setZoho({ connected: false });
                        toast({ title: "Zoho CRM disconnected" });
                      })
                      .catch((error: Error) =>
                        toast({ title: "Could not disconnect", description: error.message, variant: "destructive" }),
                      );
                  }}
                >
                  Disconnect
                </Button>
              </>
            )}
            <Button
              variant={zoho?.connected ? "secondary" : "primary"}
              size="sm"
              disabled={connectingZoho}
              onClick={() => startOAuth("zoho-oauth-start", setConnectingZoho, "Zoho")}
            >
              {connectingZoho && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {zoho?.connected ? "Reconnect" : "Connect"}
            </Button>
          </div>

          {/* Below md: a 34px Connect on the row, and the rest as chips under it. */}
          <Button
            variant={zoho?.connected ? "secondary" : "primary"}
            size="sm"
            disabled={connectingZoho}
            className="h-[34px] flex-none md:hidden"
            onClick={() => startOAuth("zoho-oauth-start", setConnectingZoho, "Zoho")}
          >
            {connectingZoho && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {zoho?.connected ? "Reconnect" : "Connect"}
          </Button>
        </div>

        {zoho?.connected && (
          <div className="mt-2.5 flex flex-wrap gap-2 pl-[48px] md:hidden">
            <ChipButton
              onClick={() => {
                void callZoho({ action: "test" })
                  .then(() => toast({ title: "Zoho connection is healthy" }))
                  .catch((error: Error) =>
                    toast({ title: "Zoho check failed", description: error.message, variant: "destructive" }),
                  );
              }}
            >
              Test
            </ChipButton>
            <ChipButton
              danger
              onClick={() => {
                void callZoho({ action: "disconnect" })
                  .then(() => {
                    setZoho({ connected: false });
                    toast({ title: "Zoho CRM disconnected" });
                  })
                  .catch((error: Error) =>
                    toast({ title: "Could not disconnect", description: error.message, variant: "destructive" }),
                  );
              }}
            >
              Disconnect
            </ChipButton>
          </div>
        )}
      </Section>
    </>
  );
}

/**
 * A 30px account-level action — mockup 13. These sit on a second line under
 * the account they act on: three full-width buttons stacked inside a list row
 * read as three separate settings rather than as one account's options.
 */
function ChipButton({
  children,
  onClick,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex h-[30px] items-center gap-1.5 rounded-pill border bg-white px-3",
        "font-dmsans text-[12.5px] font-medium shadow-eb-btn transition-colors",
        "disabled:opacity-50 disabled:pointer-events-none",
        danger
          ? "border-eb-red-border text-eb-red hover:bg-eb-red-bg"
          : "border-eb-border text-eb-text hover:bg-eb-row-hover",
      )}
    >
      {children}
    </button>
  );
}
