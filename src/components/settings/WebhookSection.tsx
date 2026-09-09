/**
 * Automation webhook — Console (UI v2).
 *
 * Lifted out of the V1 AccountPanel with its handlers unchanged, because
 * DESIGN_SPEC §7 files the webhook under Developer, not Account. The V1 panel
 * keeps its copy until V1 is deleted; both write the same two profile columns.
 */

import { useEffect, useState } from "react";
import { Copy, Loader2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { formatIST } from "@/lib/time";
import { Badge, Button, Field, Input, Label, Section } from "@/ui";
import type { Profile, WebhookEvent } from "./types";

/** 24 bytes → exactly 32 base64url chars, no padding. */
function generateWebhookSecret() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const base64 = btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(""));
  return `whsec_${base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`;
}

function isHttpsUrl(value: string) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

export function WebhookSection({
  profile,
  setProfile,
}: {
  profile: Profile | null;
  setProfile: React.Dispatch<React.SetStateAction<Profile | null>>;
}) {
  const { user } = useAuth();
  const { toast } = useToast();

  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookSecret, setWebhookSecret] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [events, setEvents] = useState<WebhookEvent[]>([]);

  useEffect(() => {
    if (!profile) return;
    setWebhookUrl(profile.webhook_url ?? "");
    setWebhookSecret(profile.webhook_secret ?? null);
  }, [profile]);

  useEffect(() => {
    if (!user) return;
    void (async () => {
      const { data, error } = await supabase
        .from("webhook_events")
        .select("id, event_type, status_code, error, delivered_at, created_at, meeting_id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) {
        console.warn("[Settings] webhook events fetch:", error);
      } else if (data) {
        setEvents(data);
      }
    })();
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    const trimmed = webhookUrl.trim();
    if (trimmed && !isHttpsUrl(trimmed)) {
      toast({ title: "Error", description: "Endpoint URL must start with https://", variant: "destructive" });
      return;
    }
    // The first saved endpoint mints a signing secret so delivery #1 is already verifiable.
    const mintedSecret = trimmed && !webhookSecret ? generateWebhookSecret() : null;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update(
          mintedSecret
            ? { webhook_url: trimmed || null, webhook_secret: mintedSecret }
            : { webhook_url: trimmed || null },
        )
        .eq("user_id", user.id);
      if (error) throw error;
      setWebhookUrl(trimmed);
      if (mintedSecret) setWebhookSecret(mintedSecret);
      setProfile((prev) =>
        prev
          ? { ...prev, webhook_url: trimmed || null, webhook_secret: mintedSecret ?? prev.webhook_secret }
          : null,
      );
      toast({
        title: "Saved",
        description: trimmed
          ? "Meeting insights will be posted to your endpoint."
          : "Automation webhook turned off.",
      });
    } catch (error) {
      toast({ title: "Error", description: (error as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleRegenerate = async () => {
    if (!user) return;
    setRegenerating(true);
    try {
      const next = generateWebhookSecret();
      const { error } = await supabase
        .from("profiles")
        .update({ webhook_secret: next })
        .eq("user_id", user.id);
      if (error) throw error;
      setWebhookSecret(next);
      setProfile((prev) => (prev ? { ...prev, webhook_secret: next } : null));
      toast({
        title: "Secret regenerated",
        description:
          "Update the secret on your receiver — deliveries signed with the old one will no longer verify.",
      });
    } catch (error) {
      toast({ title: "Error", description: (error as Error).message, variant: "destructive" });
    } finally {
      setRegenerating(false);
    }
  };

  const handleCopy = async () => {
    if (!webhookSecret) return;
    try {
      await navigator.clipboard.writeText(webhookSecret);
      toast({ title: "Copied to clipboard" });
    } catch (error) {
      toast({ title: "Error", description: (error as Error).message, variant: "destructive" });
    }
  };

  return (
    <Section
      title="Automation webhook"
      description="When a meeting's insights are ready, EchoBrief POSTs a JSON payload — summary, action items, extracted facts, coaching summary, never the transcript — signed with Standard Webhooks headers, so n8n, Make, Zapier or your own endpoint can verify it."
    >
      <Field label="Endpoint URL" hint="https:// only. Save an empty field to turn the webhook off.">
        <div className="flex gap-2">
          <Input
            type="url"
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void handleSave();
              }
            }}
            placeholder="https://your-n8n.example.com/webhook/echobrief"
          />
          <Button variant="primary" onClick={handleSave} disabled={saving} className="flex-none">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save
          </Button>
        </div>
      </Field>

      <div className="mt-5">
        <Label>Signing secret</Label>
        {webhookSecret ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="rounded-code bg-eb-sidebar px-3 py-1.5 font-mono text-[12.5px] text-eb-code-fg">
              {webhookSecret.slice(0, 8)}••••••••••••••••
            </code>
            <Button size="sm" onClick={handleCopy} icon={<Copy size={14} strokeWidth={1.75} />}>
              Copy
            </Button>
            <Button
              size="sm"
              onClick={handleRegenerate}
              disabled={regenerating}
              icon={
                regenerating ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <RefreshCw size={14} strokeWidth={1.75} />
                )
              }
            >
              Regenerate
            </Button>
          </div>
        ) : (
          <p className="mt-2 font-dmsans text-[12.5px] text-eb-secondary">
            A secret is generated the first time you save an endpoint URL.
          </p>
        )}
      </div>

      <div className="mt-5">
        <Label>Recent deliveries</Label>
        {events.length > 0 ? (
          <div className="mt-2 overflow-hidden rounded-input border border-eb-border">
            {events.map((ev, i) => (
              <div
                key={ev.id}
                className={`flex items-start justify-between gap-3 px-4 py-3 ${
                  i % 2 ? "bg-eb-card-alt" : "bg-white"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="m-0 font-dmsans text-[13px] font-medium">{ev.event_type}</p>
                  <p className="m-0 font-mono text-[11px] text-eb-secondary">
                    {formatIST(ev.created_at, "MMM d, yyyy h:mm a")}
                  </p>
                  {ev.error && (
                    <p className="m-0 mt-1 truncate font-dmsans text-[11px] text-eb-red" title={ev.error}>
                      {ev.error}
                    </p>
                  )}
                </div>
                <Badge tone={ev.error ? "red" : "green"} dot>
                  {ev.status_code ? `HTTP ${ev.status_code}` : ev.error ? "Failed" : "Delivered"}
                </Badge>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 font-dmsans text-[12.5px] text-eb-secondary">No deliveries yet.</p>
        )}
      </div>
    </Section>
  );
}
