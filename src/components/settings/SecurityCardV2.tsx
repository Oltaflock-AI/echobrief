/**
 * Two-factor enrolment — Console (UI v2).
 *
 * Every call is the V1 card's, against supabase.auth.mfa on the caller's own
 * session: there is no server code here and nothing new to secure. The one
 * behaviour worth keeping in sight is the filter — only VERIFIED factors are
 * listed, because an abandoned enrolment leaves an unverified row behind and
 * must never read as "you are protected".
 */

import { useCallback, useEffect, useState } from "react";
import { KeyRound, Loader2, ShieldCheck, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Badge, Button, Input, Section } from "@/ui";

interface Factor {
  id: string;
  friendly_name?: string;
  status: string;
}

export function SecurityCardV2() {
  const { toast } = useToast();
  const [factors, setFactors] = useState<Factor[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);

  // Enrolment in progress: the pending factor and its QR, held until the user
  // proves they can produce a code from it.
  const [pending, setPending] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");

  const refresh = useCallback(async () => {
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (!error && data) {
      setFactors((data.totp ?? []).filter((f) => f.status === "verified"));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const startEnrolment = async () => {
    setWorking(true);
    try {
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });
      if (error) throw error;
      setPending({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
    } catch (err) {
      toast({
        title: "Could not start setup",
        description: err instanceof Error ? err.message : "Something went wrong.",
        variant: "destructive",
      });
    } finally {
      setWorking(false);
    }
  };

  const confirmEnrolment = async () => {
    if (!pending || code.trim().length < 6) {
      toast({ title: "Enter the 6-digit code", variant: "destructive" });
      return;
    }
    setWorking(true);
    try {
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId: pending.id,
      });
      if (challengeError) throw challengeError;

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: pending.id,
        challengeId: challenge.id,
        code: code.trim(),
      });
      if (verifyError) throw verifyError;

      setPending(null);
      setCode("");
      await refresh();
      toast({
        title: "Two-factor authentication is on",
        description: "You will be asked for a code the next time you sign in.",
      });
    } catch (err) {
      toast({
        title: "That code was not accepted",
        description:
          err instanceof Error ? err.message : "Check your authenticator app and try again.",
        variant: "destructive",
      });
    } finally {
      setWorking(false);
    }
  };

  const cancelEnrolment = async () => {
    if (!pending) return;
    // Remove the half-finished factor rather than leaving an unverified row.
    await supabase.auth.mfa.unenroll({ factorId: pending.id });
    setPending(null);
    setCode("");
  };

  const removeFactor = async (factorId: string) => {
    setWorking(true);
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId });
      if (error) throw error;
      await refresh();
      toast({ title: "Two-factor authentication removed" });
    } catch (err) {
      toast({
        title: "Could not remove it",
        description: err instanceof Error ? err.message : "Something went wrong.",
        variant: "destructive",
      });
    } finally {
      setWorking(false);
    }
  };

  return (
    <Section
      title="Two-factor authentication"
      description="Require a code from your authenticator app as well as your password. Your meeting recordings are worth protecting with more than one factor."
    >
      {loading ? (
        <div className="flex items-center gap-2 font-dmsans text-[13px] text-eb-secondary">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : pending ? (
        <div className="flex flex-col gap-4">
          <p className="font-dmsans text-[13px] text-eb-secondary">
            Scan this with Google Authenticator, 1Password, or any TOTP app, then enter the code it
            shows.
          </p>
          {/* Supabase returns the QR as an SVG data URI. */}
          <div className="inline-block w-fit rounded-input border border-eb-border bg-white p-3">
            <img src={pending.qr} alt="Two-factor setup QR code" width={180} height={180} />
          </div>
          <p className="font-dmsans text-[12px] text-eb-secondary">
            Cannot scan? Enter this key manually:{" "}
            <code className="rounded bg-eb-chip px-1.5 py-0.5 font-mono text-[11.5px] text-eb-text">
              {pending.secret}
            </code>
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
              inputMode="numeric"
              autoComplete="one-time-code"
              className="w-32 text-center font-mono tracking-[.3em]"
            />
            <Button variant="primary" size="sm" onClick={confirmEnrolment} disabled={working}>
              {working && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Turn on
            </Button>
            <Button size="sm" onClick={cancelEnrolment} disabled={working}>
              Cancel
            </Button>
          </div>
        </div>
      ) : factors.length > 0 ? (
        <div className="flex flex-col gap-2">
          {factors.map((factor) => (
            <div
              key={factor.id}
              className="flex items-center gap-3 rounded-input border border-eb-border bg-eb-card-alt px-4 py-3"
            >
              <KeyRound size={16} strokeWidth={1.75} className="flex-none text-eb-green" />
              <span className="flex-1 font-dmsans text-[13px] font-medium">
                {factor.friendly_name || "Authenticator app"}
              </span>
              <Badge tone="green" dot>On</Badge>
              <button
                type="button"
                onClick={() => removeFactor(factor.id)}
                disabled={working}
                className="flex-none text-eb-muted hover:text-eb-red disabled:opacity-50"
                aria-label="Remove two-factor authentication"
              >
                <Trash2 size={16} strokeWidth={1.75} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <Button
          onClick={startEnrolment}
          disabled={working}
          icon={
            working ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <ShieldCheck size={15} strokeWidth={1.75} />
            )
          }
        >
          Set up two-factor
        </Button>
      )}
    </Section>
  );
}
