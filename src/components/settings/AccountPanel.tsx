/**
 * Account — Console (UI v2). Profile, custom vocabulary, preferences.
 *
 * Every handler is the V1 AccountPanel's, unchanged; only the render tree is
 * new. Two differences from the V1 panel, both deliberate:
 *
 *  - The automation webhook moved to the Developer tab, where DESIGN_SPEC §7
 *    puts it. It is the same section, rendered by WebhookSection.
 *  - Preferences shows the mockup's three toggles. The first two write the same
 *    columns the V1 Integrations and Bot tabs write, so until those tabs move to
 *    V2 the same switch appears in two places. The third writes
 *    profiles.summary_language, which post-transcription.ts reads and passes to
 *    the synthesis prompt — it was decorative until that landed, and is not now.
 */

import { useEffect, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { displayNameFromUserMetadata } from "@/lib/userDisplayName";
import { Button, Divider, Field, Input, Section, Toggle } from "@/ui";
import type { Profile } from "./types";

interface PanelProps {
  profile: Profile | null;
  setProfile: React.Dispatch<React.SetStateAction<Profile | null>>;
}

type Prefs = {
  email_summaries_enabled: boolean;
  auto_join_enabled: boolean;
  /** profiles.summary_language: 'en' | 'hi'. Held as a boolean for one switch. */
  summary_in_hindi: boolean;
};

export function AccountPanel({ profile, setProfile }: PanelProps) {
  const { user } = useAuth();
  const { toast } = useToast();

  const [fullName, setFullName] = useState("");
  const [saving, setSaving] = useState(false);

  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const [vocabulary, setVocabulary] = useState<string[]>([]);
  const [vocabInput, setVocabInput] = useState("");
  const [savingVocab, setSavingVocab] = useState(false);

  const [prefs, setPrefs] = useState<Prefs>({
    email_summaries_enabled: true,
    auto_join_enabled: false,
    summary_in_hindi: false,
  });

  useEffect(() => {
    if (!profile) return;
    setFullName((profile.full_name || "").trim());
    setVocabulary(Array.isArray(profile.custom_vocabulary) ? profile.custom_vocabulary : []);
    setAvatarUrl(profile.avatar_url ?? null);
  }, [profile]);

  // auto_join_enabled is not on the shared Profile shape (the Bot tab owns it),
  // so the toggles read their own row rather than widening that type.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("email_summaries_enabled, auto_join_enabled, summary_language")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled || !data) return;
      setPrefs({
        email_summaries_enabled: data.email_summaries_enabled !== false,
        auto_join_enabled: data.auto_join_enabled === true,
        summary_in_hindi: data.summary_language === "hi",
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  /**
   * Profile photo. The path is <user id>/avatar-<timestamp>.<ext>: the bucket is
   * public and CDN-cached, so a stable filename would keep serving the old face
   * after a replace. The previous object is removed after the profile row points
   * at the new one, so a failure mid-way leaves a working avatar, not a broken
   * link.
   */
  const handleAvatarFile = async (file: File) => {
    if (!user) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Error", description: "Choose an image file.", variant: "destructive" });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "Error", description: "Images must be under 2 MB.", variant: "destructive" });
      return;
    }

    setUploadingAvatar(true);
    const previous = avatarUrl;
    try {
      const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
      const path = `${user.id}/avatar-${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (uploadError) throw uploadError;

      const { data: publicUrl } = supabase.storage.from("avatars").getPublicUrl(path);
      const url = publicUrl.publicUrl;

      const { error } = await supabase
        .from("profiles")
        .update({ avatar_url: url })
        .eq("user_id", user.id);
      if (error) throw error;

      setAvatarUrl(url);
      setProfile((prev) => (prev ? { ...prev, avatar_url: url } : null));
      void removeStoredAvatar(previous);
      toast({ title: "Saved", description: "Your photo has been updated." });
    } catch (error) {
      toast({ title: "Error", description: (error as Error).message, variant: "destructive" });
    } finally {
      setUploadingAvatar(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  /** Deletes the object a public avatar URL points at. Best effort. */
  const removeStoredAvatar = async (url: string | null) => {
    if (!url || !user) return;
    const marker = "/avatars/";
    const at = url.indexOf(marker);
    if (at === -1) return;
    const path = url.slice(at + marker.length).split("?")[0];
    if (!path.startsWith(`${user.id}/`)) return;
    await supabase.storage.from("avatars").remove([path]);
  };

  const handleRemoveAvatar = async () => {
    if (!user || !avatarUrl) return;
    setUploadingAvatar(true);
    const previous = avatarUrl;
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ avatar_url: null })
        .eq("user_id", user.id);
      if (error) throw error;
      setAvatarUrl(null);
      setProfile((prev) => (prev ? { ...prev, avatar_url: null } : null));
      void removeStoredAvatar(previous);
      toast({ title: "Removed", description: "Your photo has been removed." });
    } catch (error) {
      toast({ title: "Error", description: (error as Error).message, variant: "destructive" });
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const trimmed = fullName.trim();
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: trimmed })
        .eq("user_id", user.id);
      if (error) throw error;

      const { error: authErr } = await supabase.auth.updateUser({
        data: { full_name: trimmed, name: trimmed },
      });
      if (authErr) {
        console.warn("[Settings] Auth display name sync:", authErr);
      }
      setProfile((prev) => (prev ? { ...prev, full_name: trimmed } : null));
      toast({ title: "Saved", description: "Your profile has been updated." });
    } catch (error) {
      toast({ title: "Error", description: (error as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const saveVocabulary = async (next: string[]) => {
    if (!user) return false;
    const previous = vocabulary;
    setSavingVocab(true);
    setVocabulary(next);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ custom_vocabulary: next })
        .eq("user_id", user.id);
      if (error) throw error;
      setProfile((prev) => (prev ? { ...prev, custom_vocabulary: next } : null));
      toast({ title: "Saved", description: "Your custom vocabulary has been updated." });
      return true;
    } catch (error) {
      setVocabulary(previous);
      toast({ title: "Error", description: (error as Error).message, variant: "destructive" });
      return false;
    } finally {
      setSavingVocab(false);
    }
  };

  const handleAddVocabularyTerm = async () => {
    const term = vocabInput.trim();
    if (term.length < 3) {
      toast({ title: "Error", description: "Terms must be at least 3 characters.", variant: "destructive" });
      return;
    }
    if (vocabulary.some((v) => v.toLowerCase() === term.toLowerCase())) {
      toast({ title: "Error", description: `"${term}" is already in your vocabulary.`, variant: "destructive" });
      return;
    }
    if (await saveVocabulary([...vocabulary, term])) setVocabInput("");
  };

  const setPreference = async (key: keyof Prefs, value: boolean) => {
    if (!user) return;
    const previous = prefs;
    setPrefs({ ...prefs, [key]: value });
    // One switch is not a boolean column: summary_language is text.
    const patch =
      key === "summary_in_hindi"
        ? { summary_language: value ? "hi" : "en" }
        : { [key]: value };
    const { error } = await supabase
      .from("profiles")
      .update(patch)
      .eq("user_id", user.id);
    if (error) {
      setPrefs(previous);
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    if (key === "email_summaries_enabled") {
      setProfile((prev) => (prev ? { ...prev, email_summaries_enabled: value } : null));
    }
  };

  const displayName = fullName || displayNameFromUserMetadata(user) || user?.email || "?";

  return (
    <>
      <Section title="Profile">
        <div className="mb-5 flex items-center gap-3">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt=""
              className="h-12 w-12 flex-none rounded-full object-cover shadow-[inset_0_0_0_1px_rgba(28,25,23,.08)]"
            />
          ) : (
            /* Accent-filled, matching the mockup and the sidebar user card —
               not the pastel Avatar set, which keys colour to the initial so
               rows of different people stay tellable apart. */
            <span className="inline-flex h-12 w-12 flex-none items-center justify-center rounded-full bg-gradient-to-b from-eb-accent-top to-eb-accent font-outfit text-[19px] font-semibold text-white">
              {(displayName[0] || "?").toUpperCase()}
            </span>
          )}
          <input
            ref={fileInput}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleAvatarFile(file);
            }}
          />
          <Button size="sm" onClick={() => fileInput.current?.click()} disabled={uploadingAvatar}>
            {uploadingAvatar && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Upload photo
          </Button>
          {avatarUrl && (
            <button
              type="button"
              onClick={handleRemoveAvatar}
              disabled={uploadingAvatar}
              className="font-dmsans text-[13px] text-eb-secondary hover:text-eb-red disabled:opacity-50"
            >
              Remove
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Full name">
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </Field>
          <Field label="Email" hint="Used for sign-in and email summaries.">
            <Input disabled value={user?.email || ""} className="bg-eb-card-alt text-eb-secondary" />
          </Field>
        </div>

        <div className="mt-5 flex justify-end">
          <Button variant="primary" onClick={handleSaveProfile} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save changes
          </Button>
        </div>
      </Section>

      <Section
        title="Custom vocabulary"
        description="Canonical spellings of company, product and client names. These exact spellings are enforced in transcripts and summaries."
      >
        <div className="flex gap-2">
          <Input
            value={vocabInput}
            onChange={(e) => setVocabInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void handleAddVocabularyTerm();
              }
            }}
            placeholder='Add a term, e.g. "Oltaflock"'
          />
          <Button onClick={handleAddVocabularyTerm} disabled={savingVocab} className="flex-none">
            {savingVocab && <Loader2 className="h-4 w-4 animate-spin" />}
            Add
          </Button>
        </div>

        {vocabulary.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {vocabulary.map((term) => (
              <span
                key={term}
                className="inline-flex h-8 items-center gap-1.5 rounded-pill border border-eb-border bg-white px-3 font-dmsans text-[13px] shadow-eb-card"
              >
                {term}
                <button
                  type="button"
                  onClick={() => saveVocabulary(vocabulary.filter((v) => v !== term))}
                  disabled={savingVocab}
                  aria-label={`Remove ${term}`}
                  className="text-eb-muted hover:text-eb-red disabled:opacity-50"
                >
                  <X size={13} strokeWidth={1.75} />
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p className="mt-4 font-dmsans text-[12.5px] text-eb-secondary">
            No terms yet. Add names the transcriber tends to misspell.
          </p>
        )}
      </Section>

      <Section title="Preferences">
        <PreferenceRow
          title="Email me the summary"
          description="When a meeting finishes processing, send the summary, decisions and action items."
          on={prefs.email_summaries_enabled}
          onChange={(v) => setPreference("email_summaries_enabled", v)}
        />
        <Divider className="my-1" />
        <PreferenceRow
          title="Auto-join meetings from calendar"
          description="The bot joins every meeting with a video link on connected calendars."
          on={prefs.auto_join_enabled}
          onChange={(v) => setPreference("auto_join_enabled", v)}
        />
        <Divider className="my-1" />
        <PreferenceRow
          title="Summaries in Hindi"
          description="Keep the transcript in the spoken language; write the summary in Hindi. Action items and decisions stay in the words they were spoken in."
          on={prefs.summary_in_hindi}
          onChange={(v) => setPreference("summary_in_hindi", v)}
        />
      </Section>
    </>
  );
}

function PreferenceRow({
  title,
  description,
  on,
  onChange,
}: {
  title: string;
  description: string;
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-6 py-3">
      <div>
        <div className="font-dmsans text-sm font-medium">{title}</div>
        <div className="mt-0.5 font-dmsans text-[12.5px] text-eb-secondary">{description}</div>
      </div>
      <Toggle on={on} onChange={onChange} label={title} />
    </div>
  );
}
