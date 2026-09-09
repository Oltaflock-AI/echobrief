/**
 * Sign in / sign up — Console (UI v2), from mockups 00a and 00b.
 *
 * Presentation only. Every handler, guard and side effect below is the one
 * `Auth.tsx` runs — same Supabase calls, same password rules, same recovery
 * flow, same plan-hint link handling — so the two pages cannot drift in
 * behaviour while both are live.
 *
 *
 * The left panel's preview card is fixed copy from the mockup. It illustrates
 * the product to someone who has not signed in yet — it is never anyone's
 * data, and must not be wired to any.
 */
import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { consumePostLoginRedirect, rememberPostLoginRedirect } from '@/lib/postLoginRedirect';
import { billingPath } from '@/lib/signupLink';
import { SELLABLE_PLANS, type BillingPeriod, type PlanKey } from '@/lib/plans';
import { checkPwnedPassword } from '@/lib/pwned';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, ArrowRight, Languages, Loader2, Lock, Mail, User, Video, type LucideIcon } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Logo } from '@/components/ui/Logo';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Badge } from '@/ui';
import { cn } from '@/lib/utils';

// Registration is open (2026-09-01). The Supabase auth server's
// `disable_signup` was flipped to false at the same time — flipping this
// constant alone would only re-open the form, not the auth server.
const SIGNUPS_ENABLED = true;

// Google sign-in is live: the Supabase Auth Google provider was repointed at
// a fresh OAuth client on 2026-08-31. The env gate stays so the button can be
// pulled without a code change if the provider breaks again.
const GOOGLE_SIGNIN_ENABLED = import.meta.env.VITE_GOOGLE_SIGNIN === 'true';

const BENEFITS = [
  { icon: Languages, text: '22 Indian languages, Hinglish included' },
  { icon: Video, text: 'Auto-joins Google Meet, Zoom and Teams' },
  { icon: Mail, text: 'Summary, decisions and action items by email' },
];

/**
 * Four segments, filled by the rules the submit handler actually enforces —
 * ten characters, letters, numbers — plus length past sixteen for the fourth.
 * A bar that promised more than the server checks would be a lie told in
 * colour.
 */
function strengthOf(pw: string): number {
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= 10) score += 1;
  if (/[a-zA-Z]/.test(pw)) score += 1;
  if (/[0-9]/.test(pw)) score += 1;
  if (pw.length >= 16 || /[^a-zA-Z0-9]/.test(pw)) score += 1;
  return score;
}

export default function Auth() {
  const [searchParams] = useSearchParams();
  // A pricing-page CTA arrives as /auth?signup=1&plan=pro&billing=annual. The
  // plan is only a hint about where to land after sign-up — entitlements come
  // from the subscription Dodo confirms, never from this link.
  const [isSignUp, setIsSignUp] = useState(
    SIGNUPS_ENABLED && searchParams.get('signup') === '1',
  );
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const { user, signIn, signUp, isPasswordRecovery, clearPasswordRecovery } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const isResetPassword = isPasswordRecovery;

  useEffect(() => {
    const plan = searchParams.get('plan');
    if (!plan || !SELLABLE_PLANS.includes(plan as PlanKey)) return;
    const billing = searchParams.get('billing');
    const period: BillingPeriod = billing === 'annual' ? 'annual' : 'monthly';
    rememberPostLoginRedirect(`${billingPath(plan as PlanKey)}&billing=${period}`);
  }, [searchParams]);

  useEffect(() => {
    if (user && !isResetPassword) navigate(consumePostLoginRedirect() ?? '/dashboard');
  }, [user, isResetPassword, navigate]);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast({ title: 'Passwords do not match', variant: 'destructive' });
      return;
    }
    if (password.length < 10) {
      toast({ title: 'Password too short', description: 'Use at least 10 characters with letters and numbers.', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const pwned = await checkPwnedPassword(password);
      if (pwned.breached) {
        toast({
          title: 'Choose a different password',
          description: `This password has appeared in ${pwned.count.toLocaleString()} known data breaches. Please choose a different one.`,
          variant: 'destructive',
        });
        return;
      }
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast({ title: 'Password updated' });
      clearPasswordRecovery();
      navigate(consumePostLoginRedirect() ?? '/dashboard');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin + '/dashboard' },
      });
      if (error) throw error;
      // On success the browser navigates away to Google — no state reset needed.
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong';
      toast({ title: 'Error', description: message, variant: 'destructive' });
      setGoogleLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast({ title: 'Enter your email', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth?type=recovery`,
      });
      if (error) throw error;
      toast({ title: 'Reset link sent', description: 'Check your email.' });
      setIsForgotPassword(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isSignUp && SIGNUPS_ENABLED) {
        if (password.length < 10) {
          toast({ title: 'Password too short', description: 'Use at least 10 characters with letters and numbers.', variant: 'destructive' });
          return;
        }
        const pwned = await checkPwnedPassword(password);
        if (pwned.breached) {
          toast({
            title: 'Choose a different password',
            description: `This password has appeared in ${pwned.count.toLocaleString()} known data breaches. Please choose a different one.`,
            variant: 'destructive',
          });
          return;
        }
        const { error } = await signUp(email, password, fullName);
        if (error) throw error;
        setEmailSent(true);
        return;
      } else {
        const { error } = await signIn(email, password);
        if (error) throw error;
      }
      navigate(consumePostLoginRedirect() ?? '/dashboard');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const title = isResetPassword
    ? 'Set a new password'
    : isForgotPassword
    ? 'Reset your password'
    : isSignUp
    ? 'Create your account'
    : 'Welcome back';

  const subtitle = isResetPassword
    ? 'Enter a new password below.'
    : isForgotPassword
    ? "We'll email you a reset link."
    : isSignUp
    ? 'Free to start. Your first 3 meetings are on us.'
    : 'Sign in to continue to your meetings.';

  return (
    <div className="relative flex min-h-screen bg-eb-bg text-eb-text">
      {/* Left — the pitch. Hidden below lg, where the form is the whole page. */}
      <div className="relative hidden w-[46%] shrink-0 flex-col overflow-hidden px-14 pb-10 pt-8 lg:flex bg-[linear-gradient(160deg,var(--eb-auth-panel-1)_0%,var(--eb-auth-panel-2)_55%,var(--eb-auth-panel-3)_100%)]">
        <div aria-hidden className="pointer-events-none absolute -right-[180px] -top-[120px] h-[520px] w-[520px] rounded-full border border-[color-mix(in_srgb,var(--eb-accent)_10%,transparent)]" />
        <div aria-hidden className="pointer-events-none absolute -right-[60px] top-0 h-[280px] w-[280px] rounded-full border border-[color-mix(in_srgb,var(--eb-accent)_14%,transparent)]" />
        <div aria-hidden className="pointer-events-none absolute right-10 top-[100px] h-20 w-20 rounded-full bg-[color-mix(in_srgb,var(--eb-accent)_8%,transparent)]" />

        <div className="relative flex items-center justify-between">
          <Logo variant="console" size="md" linkTo="/" />
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 font-dmsans text-[13px] text-eb-secondary no-underline hover:text-eb-text"
          >
            <ArrowLeft size={14} strokeWidth={1.75} />
            Back to home
          </Link>
        </div>

        <div className="relative my-auto max-w-[480px]">
          <div className="font-dmsans text-[11.5px] font-semibold uppercase tracking-[.12em] text-eb-accent">
            Built for India
          </div>
          <h1 className="mt-3 font-outfit text-[40px] font-semibold leading-[1.1] tracking-[-.025em] text-eb-text">
            Meeting summaries that actually make sense.
          </h1>
          <p className="mt-4 max-w-[42ch] font-dmsans text-[14.5px] leading-[1.65] text-eb-secondary">
            Auto-join your calls, transcribe accurately in 22 Indian languages, and get a
            summary you can act on — in your inbox before you're back at your desk.
          </p>

          <div className="mt-8 flex flex-col gap-4">
            {BENEFITS.map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-3 font-dmsans text-[14px] text-eb-text">
                <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-pill border border-eb-border bg-white text-eb-accent shadow-eb-btn">
                  <Icon size={15} strokeWidth={1.75} />
                </span>
                {text}
              </div>
            ))}
          </div>

          {/* Fixed illustrative copy — see the note at the top of this file. */}
          <div className="mt-9 rounded-card border border-eb-border bg-white/75 px-4 py-3.5 shadow-eb-card">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2 font-dmsans text-[12.5px] font-medium text-eb-text">
                <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[6px] bg-eb-green-bg font-outfit text-[8px] font-semibold text-eb-green">
                  R
                </span>
                <span className="truncate">Ryan Travels Proposal Decision</span>
              </div>
              <Badge tone="green" dot>Summary ready</Badge>
            </div>
            <p className="mt-2.5 font-dmsans text-[12.5px] leading-[1.55] text-eb-secondary">
              Technical review locked for 18 September. NDA before platform access. Vineet to
              send the consolidated change list by tomorrow.
            </p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              <Badge>3 decisions</Badge>
              <Badge tone="accent">2 action items</Badge>
              <Badge>Hinglish → English</Badge>
            </div>
          </div>
        </div>

        <p className="relative font-dmsans text-[12px] text-eb-secondary">
          Made in India · Transcription runs in India
        </p>
      </div>

      {/* Right — the form. */}
      <div className="relative flex flex-1 items-center justify-center px-6 py-20">
        <div className="absolute right-8 top-7">
          <ThemeToggle />
        </div>

        <div className="w-full max-w-[400px]">
          <div className="mb-8 flex justify-center lg:hidden">
            <Logo variant="console" size="md" linkTo="/" />
          </div>

          {emailSent ? (
            <div>
              <h2 className="m-0 font-outfit text-[26px] font-semibold leading-[1.15] tracking-[-.02em] text-eb-text">
                Check your email
              </h2>
              <p className="mt-3 font-dmsans text-[14px] leading-[1.6] text-eb-secondary">
                We sent a verification link to{' '}
                <span className="font-medium text-eb-text">{email}</span>. Click it to
                activate your account.
              </p>
              <button
                type="button"
                onClick={() => {
                  setEmailSent(false);
                  setIsSignUp(false);
                }}
                className="mt-6 inline-flex items-center gap-1.5 font-dmsans text-[13.5px] font-medium text-eb-accent"
              >
                <ArrowLeft size={14} strokeWidth={1.75} />
                Back to sign in
              </button>
            </div>
          ) : (
            <>
              <h2 className="m-0 font-outfit text-[27px] font-semibold leading-[1.15] tracking-[-.02em] text-eb-text">
                {title}
              </h2>
              <p className="mt-2 font-dmsans text-[14px] text-eb-secondary">{subtitle}</p>

              {isResetPassword ? (
                <form onSubmit={handleResetPassword} className="mt-7 flex flex-col gap-4">
                  <AuthField label="New password" icon={Lock}>
                    <input
                      type="password"
                      placeholder="At least 10 characters"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className={fieldInput}
                      required
                      minLength={10}
                    />
                  </AuthField>
                  <AuthField label="Confirm password" icon={Lock}>
                    <input
                      type="password"
                      placeholder="Type it again"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className={fieldInput}
                      required
                      minLength={10}
                    />
                  </AuthField>
                  <SubmitButton loading={loading}>Update password</SubmitButton>
                </form>
              ) : isForgotPassword ? (
                <form onSubmit={handleForgotPassword} className="mt-7 flex flex-col gap-4">
                  <AuthField label="Email" icon={Mail}>
                    <input
                      type="email"
                      placeholder="you@company.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className={fieldInput}
                      required
                    />
                  </AuthField>
                  <SubmitButton loading={loading}>Send reset link</SubmitButton>
                  <button
                    type="button"
                    onClick={() => setIsForgotPassword(false)}
                    className="inline-flex items-center gap-1.5 font-dmsans text-[13.5px] text-eb-secondary"
                  >
                    <ArrowLeft size={14} strokeWidth={1.75} />
                    Back to sign in
                  </button>
                </form>
              ) : (
                <>
                  {GOOGLE_SIGNIN_ENABLED && (
                    <>
                      <button
                        type="button"
                        onClick={handleGoogleSignIn}
                        disabled={googleLoading}
                        className="mt-7 flex h-11 w-full items-center justify-center gap-2.5 rounded-pill border border-eb-border bg-gradient-to-b from-white to-eb-btn-bottom font-dmsans text-[14px] font-medium text-eb-text shadow-eb-btn transition-colors hover:to-eb-row-hover disabled:opacity-60"
                      >
                        {googleLoading ? <Loader2 size={16} className="animate-spin" /> : <GoogleGIcon />}
                        Continue with Google
                      </button>
                      <div className="my-6 flex items-center gap-3" aria-hidden>
                        <span className="h-px flex-1 bg-eb-border" />
                        <span className="font-dmsans text-[12px] text-eb-secondary">or</span>
                        <span className="h-px flex-1 bg-eb-border" />
                      </div>
                    </>
                  )}

                  <form
                    onSubmit={handleSubmit}
                    className={cn('flex flex-col gap-4', !GOOGLE_SIGNIN_ENABLED && 'mt-7')}
                  >
                    {isSignUp && (
                      <AuthField label="Full name" icon={User}>
                        <input
                          type="text"
                          placeholder="Priya Kumar"
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          className={fieldInput}
                          required
                        />
                      </AuthField>
                    )}

                    <AuthField label={isSignUp ? 'Work email' : 'Email'} icon={Mail}>
                      <input
                        type="email"
                        placeholder="you@company.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className={fieldInput}
                        required
                      />
                    </AuthField>

                    <AuthField
                      label="Password"
                      icon={Lock}
                      action={
                        !isSignUp && (
                          <button
                            type="button"
                            onClick={() => setIsForgotPassword(true)}
                            className="font-dmsans text-[12.5px] font-medium text-eb-accent"
                          >
                            Forgot password?
                          </button>
                        )
                      }
                    >
                      <input
                        type="password"
                        placeholder={isSignUp ? 'At least 10 characters' : '••••••••••'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className={fieldInput}
                        required
                        minLength={isSignUp ? 10 : 6}
                      />
                    </AuthField>

                    {isSignUp && <StrengthBar score={strengthOf(password)} />}

                    <SubmitButton loading={loading}>
                      {isSignUp ? 'Create account' : 'Sign in'}
                    </SubmitButton>
                  </form>

                  {SIGNUPS_ENABLED ? (
                    <p className="mt-5 text-center font-dmsans text-[13.5px] text-eb-secondary">
                      {isSignUp ? 'Already have an account? ' : 'New to EchoBrief? '}
                      <button
                        type="button"
                        onClick={() => setIsSignUp(!isSignUp)}
                        className="font-semibold text-eb-accent"
                      >
                        {isSignUp ? 'Sign in' : 'Create an account'}
                      </button>
                    </p>
                  ) : (
                    <p className="mt-5 text-center font-dmsans text-[13.5px] text-eb-secondary">
                      New signups are closed right now.{' '}
                      <Link to="/#waitlist" className="font-semibold text-eb-accent no-underline">
                        Talk to us
                      </Link>
                    </p>
                  )}
                </>
              )}
            </>
          )}

          <p className="mt-7 text-center font-dmsans text-[12px] text-eb-secondary">
            By continuing you agree to our{' '}
            <Link to="/terms" className="text-eb-secondary underline-offset-2">Terms</Link> and{' '}
            <Link to="/privacy" className="text-eb-secondary underline-offset-2">Privacy Policy</Link>.
          </p>
        </div>
      </div>
    </div>
  );
}

/** 44px, 12px radius, leading icon — the dialog/auth input, not the 38px page one. */
const fieldInput =
  'h-11 w-full rounded-input-lg border border-eb-border bg-white pl-[38px] pr-3.5 ' +
  'font-dmsans text-[14px] text-eb-text shadow-eb-input outline-none ' +
  'placeholder:text-eb-secondary focus:border-eb-accent';

function AuthField({
  label,
  icon: Icon,
  action,
  children,
}: {
  label: string;
  icon: LucideIcon;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-center justify-between">
        <span className="font-dmsans text-[13px] font-medium text-eb-text">{label}</span>
        {action}
      </span>
      <span className="relative block">
        <Icon size={15} strokeWidth={1.75} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-eb-muted" />
        {children}
      </span>
    </label>
  );
}

function StrengthBar({ score }: { score: number }) {
  const tone = score >= 4 ? 'bg-eb-green' : score >= 2 ? 'bg-eb-amber' : 'bg-eb-accent';
  return (
    <div className="-mt-1">
      <div className="flex gap-1.5" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={cn('h-[3px] flex-1 rounded-pill', i < score ? tone : 'bg-eb-toggle-track')}
          />
        ))}
      </div>
      <p className="mt-1.5 font-dmsans text-[12px] text-eb-secondary">
        Letters and numbers, 10 or more characters.
      </p>
    </div>
  );
}

function SubmitButton({ loading, children }: { loading: boolean; children: React.ReactNode }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="mt-1 flex h-[46px] w-full items-center justify-center gap-2 rounded-pill bg-gradient-to-b from-eb-accent-top to-eb-accent font-dmsans text-[14.5px] font-medium text-white shadow-eb-primary transition-colors hover:to-eb-accent-hover disabled:opacity-60"
    >
      {loading ? (
        <Loader2 size={16} className="animate-spin" />
      ) : (
        <>
          {children}
          <ArrowRight size={16} strokeWidth={2} />
        </>
      )}
    </button>
  );
}

/** Official multicolour Google "G" — third-party brand mark, colours fixed by Google. */
function GoogleGIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path fill="#4285F4" d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z" />
      <path fill="#34A853" d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z" />{/* brand-check-ignore */}
      <path fill="#FBBC05" d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z" />{/* brand-check-ignore */}
      <path fill="#EA4335" d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z" />{/* brand-check-ignore */}
    </svg>
  );
}
