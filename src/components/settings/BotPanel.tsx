/**
 * Bot — Console (UI v2). Notetaker identity and joining rules.
 *
 * Same three columns the V1 BotCustomization writes (notetaker_name, bot_color,
 * auto_join_enabled) plus pre_meeting_notification_minutes, which the V1 Bot tab
 * never exposed even though PreMeetingNotification has always read it.
 *
 * Four things the mockup draws are absent, because no column or code path is
 * behind them: a join message posted in the meeting chat, an "only external
 * meetings" rule, a Join/Leave-when pair (Recall owns leave behaviour via
 * automatic_leave, not us), and a spoken-language select (preferred_languages is
 * written by onboarding and read by nothing). Summary language is real, and
 * lives on the Account tab rather than being offered twice on one page.
 */

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button, Divider, Field, Input, Section, Select, Toggle } from "@/ui";
import { cn } from "@/lib/utils";

/**
 * The bot avatar renders inside Google Meet / Zoom, outside our own CSS, so
 * these have to be literal hex rather than tokens — the same list, and the same
 * reason, as the V1 panel. Values are the legacy Warm Dispatch palette because
 * that is what is already stored on existing profiles.
 */
const COLOR_OPTIONS = [
  { name: "Ember", hex: "#D93F0B" },
  { name: "Gold", hex: "#F5C842" },
  { name: "Green", hex: "#479C4D" },
  { name: "Blue", hex: "#2B88C0" },
  { name: "Violet", hex: "#8A5FC9" },
  { name: "Red", hex: "#D7352D" },
];

const NOTICE_OPTIONS = [
  { value: 0, label: "Don't notify me" },
  { value: 5, label: "5 minutes before" },
  { value: 10, label: "10 minutes before" },
  { value: 15, label: "15 minutes before" },
  { value: 30, label: "30 minutes before" },
];

export function BotPanel({ userId }: { userId: string }) {
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [botName, setBotName] = useState("EchoBrief Notetaker");
  const [botColor, setBotColor] = useState(COLOR_OPTIONS[0].hex);
  const [autoJoin, setAutoJoin] = useState(true);
  const [noticeMinutes, setNoticeMinutes] = useState(10);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("notetaker_name, bot_color, auto_join_enabled, pre_meeting_notification_minutes")
        .eq("user_id", userId)
        .maybeSingle();
      if (cancelled) return;
      if (data) {
        if (data.notetaker_name) setBotName(data.notetaker_name);
        if (data.bot_color) setBotColor(data.bot_color);
        if (data.auto_join_enabled !== null) setAutoJoin(data.auto_join_enabled);
        if (data.pre_meeting_notification_minutes !== null) {
          setNoticeMinutes(data.pre_meeting_notification_minutes);
        }
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const handleSave = async () => {
    if (!botName.trim()) {
      toast({ title: "Error", description: "Bot name cannot be empty", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          notetaker_name: botName.trim(),
          bot_color: botColor,
          auto_join_enabled: autoJoin,
          pre_meeting_notification_minutes: noticeMinutes,
        })
        .eq("user_id", userId);
      if (error) throw error;
      toast({ title: "Saved", description: "Bot settings updated." });
    } catch (error) {
      toast({ title: "Error", description: (error as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-eb-muted" />
      </div>
    );
  }

  const initial = (botName.trim()[0] || "E").toUpperCase();

  return (
    <>
      <Section title="Notetaker identity" description="How your bot appears to other people when it joins a call.">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
          <div>
            <Field label="Bot name" hint="Shown in the participant list and in calendar invites.">
              <Input value={botName} maxLength={50} onChange={(e) => setBotName(e.target.value)} />
            </Field>

            <div className="mt-5">
              <div className="mb-2 font-dmsans text-[13px] font-medium">Icon colour</div>
              <div className="flex flex-wrap gap-2.5">
                {COLOR_OPTIONS.map((c) => {
                  const selected = c.hex.toLowerCase() === botColor.toLowerCase();
                  return (
                    <button
                      key={c.hex}
                      type="button"
                      onClick={() => setBotColor(c.hex)}
                      aria-pressed={selected}
                      className="flex flex-col items-center gap-1.5"
                      title={c.name}
                    >
                      <span
                        style={{ background: c.hex }}
                        className={cn(
                          "flex h-11 w-11 items-center justify-center rounded-input text-white",
                          selected && "ring-2 ring-eb-accent ring-offset-2 ring-offset-white",
                        )}
                      >
                        {selected && (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <path d="m5 12 5 5 9-10" />
                          </svg>
                        )}
                      </span>
                      <span className="font-dmsans text-[11.5px] text-eb-secondary">{c.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Preview — the one place the stored hex is shown doing its job. */}
          <div className="rounded-card bg-eb-sidebar p-3.5">
            <div className="mb-3 font-dmsans text-[11px] font-semibold uppercase tracking-[.09em] text-eb-accent-sidebar">
              Preview · Google Meet
            </div>
            <div className="flex items-center gap-2.5 rounded-input bg-eb-sidebar-raised p-2.5">
              <span
                style={{ background: botColor }}
                className="inline-flex h-9 w-9 flex-none items-center justify-center rounded-full font-outfit text-[15px] font-semibold text-white"
              >
                {initial}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-dmsans text-[13px] font-medium text-white">
                  {botName || "EchoBrief Notetaker"}
                </span>
                <span className="block font-dmsans text-[11.5px] text-eb-on-dark">joined · recording</span>
              </span>
              <span className="h-2 w-2 flex-none rounded-full bg-eb-live" />
            </div>
          </div>
        </div>
      </Section>

      <Section title="Joining rules">
        <div className="flex items-start justify-between gap-6 py-3">
          <div>
            <div className="font-dmsans text-sm font-medium">Auto-join meetings from calendar</div>
            <div className="mt-0.5 font-dmsans text-[12.5px] text-eb-secondary">
              Every meeting with a video link on a connected calendar.
            </div>
          </div>
          <Toggle on={autoJoin} onChange={setAutoJoin} label="Auto-join meetings from calendar" />
        </div>

        <Divider className="my-1" />

        <div className="py-3">
          <Field
            label="Heads-up before a meeting"
            hint="An in-app notice before the bot joins, so you can stop it."
          >
            <Select
              value={String(noticeMinutes)}
              onChange={(e) => setNoticeMinutes(Number(e.target.value))}
              className="w-full max-w-[260px]"
            >
              {NOTICE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="mt-4 flex justify-end">
          <Button variant="primary" onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save changes
          </Button>
        </div>
      </Section>
    </>
  );
}
