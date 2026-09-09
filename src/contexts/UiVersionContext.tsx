import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { consumeUiOverride, resolveUiVersion, type UiVersion } from "@/lib/uiVersion";

type Ctx = {
  ui: UiVersion;
  /** True while the profile flag is still being read. Callers render V1 meanwhile. */
  loading: boolean;
};

const UiVersionContext = createContext<Ctx>({ ui: "v1", loading: false });

/**
 * Resolves the Console (UI v2) flag once per session. Reading it does not block
 * the app: until the profile row arrives the session renders V1, which is what
 * an unflagged user sees anyway.
 *
 * Phase 0 only publishes the value — no route or shell reads it yet.
 */
export function UiVersionProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  // Read the ?ui= override before anything else so a preview link works even
  // for a signed-out visitor landing straight on a protected route.
  const [override] = useState<UiVersion | null>(() => consumeUiOverride());
  const [profileFlag, setProfileFlag] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) {
      setProfileFlag(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    supabase
      .from("profiles")
      .select("ui_v2")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setProfileFlag(data?.ui_v2 ?? false);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const value = useMemo<Ctx>(
    () => ({ ui: override ?? resolveUiVersion(profileFlag), loading: loading && !override }),
    [override, profileFlag, loading],
  );

  /**
   * Mark the document while the Console is on.
   *
   * The Console palette is light-only — every `--eb-*` token is declared once,
   * on `:root`, and there is no dark set yet. `ThemeProvider` meanwhile puts
   * `.dark` on the same element when the OS asks for dark, which flips the V1
   * `--foreground` to bone. Anything that did not carry an explicit `text-eb-*`
   * class then rendered bone-on-paper: every bare `<h1>`/`<h2>` (the base
   * stylesheet colours them `hsl(var(--foreground))`) and every shadcn
   * primitive using `text-foreground`. On a phone defaulting to dark that made
   * page titles all but invisible — reported 2026-09-09 with screenshots.
   *
   * `.ui-v2` in index.css restates the V1 shadcn tokens in Console values and
   * sits after `.dark`, so it wins. It goes on the root element rather than the
   * shell because dialogs and sheets render in a portal outside it.
   */
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("ui-v2", value.ui === "v2");
    return () => root.classList.remove("ui-v2");
  }, [value.ui]);

  return <UiVersionContext.Provider value={value}>{children}</UiVersionContext.Provider>;
}

export function useUiVersion() {
  return useContext(UiVersionContext);
}
