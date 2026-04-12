import { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Mail, Lock, User, ArrowRight, ArrowLeft, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Logo } from '@/components/ui/Logo';
import { ThemeToggle } from '@/components/ThemeToggle';

const inputClassName =
  'w-full rounded-lg border border-border bg-background py-2.5 pl-10 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/20';

export default function Auth() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const { user, signIn, signUp, isPasswordRecovery, clearPasswordRecovery } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();

  // Use the centralized recovery flag from AuthContext
  const isResetPassword = isPasswordRecovery;

  useEffect(() => {
    if (user && !isResetPassword) {
      navigate('/dashboard');
    }
  }, [user, isResetPassword, navigate]);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast({ title: 'Error', description: 'Passwords do not match.', variant: 'destructive' });
      return;
    }
    if (password.length < 6) {
      toast({ title: 'Error', description: 'Password must be at least 6 characters.', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast({ title: 'Password updated!', description: 'You can now sign in with your new password.' });
      clearPasswordRecovery();
      navigate('/dashboard');
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Something went wrong', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast({ title: 'Error', description: 'Please enter your email address.', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth?type=recovery`,
      });
      if (error) throw error;
      toast({ title: 'Reset link sent!', description: 'Check your email for a password reset link.' });
      setIsForgotPassword(false);
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Something went wrong', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isSignUp) {
        const { error } = await signUp(email, password, fullName);
        if (error) throw error;
        setEmailSent(true);
        return;
      } else {
        const { error } = await signIn(email, password);
        if (error) throw error;
      }
      navigate('/dashboard');
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Something went wrong', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-background">
      {/* Left Panel - Branding */}
      <div className="relative hidden overflow-hidden lg:flex lg:w-1/2 lg:bg-gradient-to-br lg:from-stone-100 lg:via-background lg:to-stone-200 dark:lg:from-stone-900 dark:lg:via-background dark:lg:to-stone-950">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/4 top-1/4 h-72 w-72 rounded-full bg-orange-500/15 blur-[100px] dark:bg-orange-500/20" />
          <div className="absolute bottom-1/3 right-1/4 h-56 w-56 rounded-full bg-amber-500/10 blur-[80px]" />
        </div>

        <div className="relative z-10 flex flex-col justify-center p-16">
          <div className="mb-16">
            <Logo size="lg" linkTo="/" />
          </div>

          <h1
            className="mb-5 text-4xl font-semibold leading-tight tracking-[-0.02em] text-foreground font-heading"
          >
            Transform your meetings
            <br />
            into actionable insights
          </h1>
          <p className="max-w-md text-lg leading-relaxed text-muted-foreground">
            Record, transcribe, and get AI-powered summaries in 22 Indian languages. Delivered to WhatsApp, Slack, or
            email.
          </p>

          <div className="mt-10 flex flex-wrap gap-2">
            {['22 Languages', 'Hinglish Support', 'WhatsApp Delivery', 'DPDP Compliant'].map((f) => (
              <span
                key={f}
                className="rounded-full border border-orange-500/20 bg-orange-500/[0.08] px-3 py-1.5 text-xs font-medium text-orange-700 dark:text-orange-300"
              >
                {f}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Right Panel - Auth Form */}
      <div className="relative flex flex-1 items-center justify-center p-8">
        <div className="absolute left-6 top-6 z-10">
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-lg px-1 py-1 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
            Back to home
          </Link>
        </div>
        <div className="absolute right-6 top-6 z-10">
          <ThemeToggle />
        </div>
        <div className="w-full max-w-md">
          <div className="mb-10 flex justify-center lg:hidden">
            <Logo size="lg" linkTo="/" />
          </div>

          <div className="rounded-2xl border border-border bg-card p-8 shadow-sm dark:shadow-none">
            {emailSent ? (
              <div className="py-4 text-center">
                <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full border border-orange-500/20 bg-orange-500/[0.08]">
                  <Mail className="h-8 w-8 text-orange-600 dark:text-orange-400" />
                </div>
                <h2 className="mb-2 text-xl font-semibold text-foreground font-heading">
                  Check your email
                </h2>
                <p className="mb-6 text-sm text-muted-foreground">
                  We sent a verification link to <span className="font-medium text-foreground">{email}</span>. Click the
                  link to activate your account.
                </p>
                <p className="mb-6 text-xs text-muted-foreground">Didn't receive it? Check your spam folder or try again.</p>
                <button
                  onClick={() => {
                    setEmailSent(false);
                    setIsSignUp(false);
                  }}
                  className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back to sign in
                </button>
              </div>
            ) : (
              <>
                <div className="mb-8 text-center">
                  <h2
                    className="mb-2 text-2xl font-semibold tracking-[-0.02em] text-foreground font-heading"
                  >
                    {isResetPassword ? 'Set new password' : isForgotPassword ? 'Reset your password' : isSignUp ? 'Create your account' : 'Welcome back'}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {isResetPassword
                      ? 'Enter your new password below'
                      : isForgotPassword
                        ? "Enter your email and we'll send you a reset link"
                        : isSignUp 
                          ? 'Start recording smarter meetings today' 
                          : 'Sign in to continue to your dashboard'}
                  </p>
                </div>

                {isResetPassword ? (
                  <form onSubmit={handleResetPassword} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="new-password" className="text-[13px] text-muted-foreground">
                        New Password
                      </Label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <input
                          id="new-password"
                          type="password"
                          placeholder="••••••••"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className={inputClassName}
                          required
                          minLength={6}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="confirm-password" className="text-[13px] text-muted-foreground">
                        Confirm Password
                      </Label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <input
                          id="confirm-password"
                          type="password"
                          placeholder="••••••••"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          className={inputClassName}
                          required
                          minLength={6}
                        />
                      </div>
                    </div>
                    <button
                      type="submit"
                      disabled={loading}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 py-3 text-[15px] font-semibold text-white shadow-md shadow-orange-500/25 transition-opacity disabled:opacity-50"
                    >
                      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Update Password <ArrowRight className="w-4 h-4" /></>}
                    </button>
                  </form>
                ) : isForgotPassword ? (
                  <form onSubmit={handleForgotPassword} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="email" className="text-[13px] text-muted-foreground">
                        Email
                      </Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <input
                          id="email"
                          type="email"
                          placeholder="you@example.com"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className={inputClassName}
                          required
                        />
                      </div>
                    </div>
                    <button
                      type="submit"
                      disabled={loading}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 py-3 text-[15px] font-semibold text-white shadow-md shadow-orange-500/25 transition-opacity disabled:opacity-50"
                    >
                      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Send Reset Link <ArrowRight className="w-4 h-4" /></>}
                    </button>
                    <div className="text-center mt-4">
                      <button
                        type="button"
                        onClick={() => setIsForgotPassword(false)}
                        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
                      >
                        <ArrowLeft className="w-3 h-3" /> Back to sign in
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <form onSubmit={handleSubmit} className="space-y-4">
                      {isSignUp && (
                        <div className="space-y-2">
                          <Label htmlFor="name" className="text-[13px] text-muted-foreground">
                            Full Name
                          </Label>
                          <div className="relative">
                            <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <input
                              id="name"
                              type="text"
                              placeholder="John Doe"
                              value={fullName}
                              onChange={(e) => setFullName(e.target.value)}
                              className={inputClassName}
                              required={isSignUp}
                            />
                          </div>
                        </div>
                      )}

                      <div className="space-y-2">
                        <Label htmlFor="email" className="text-[13px] text-muted-foreground">
                          Email
                        </Label>
                        <div className="relative">
                          <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <input
                            id="email"
                            type="email"
                            placeholder="you@example.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className={inputClassName}
                            required
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label htmlFor="password" className="text-[13px] text-muted-foreground">
                            Password
                          </Label>
                          {!isSignUp && (
                            <button
                              type="button"
                              onClick={() => setIsForgotPassword(true)}
                              className="text-xs font-medium text-orange-600 transition-colors hover:text-orange-500 dark:text-orange-400"
                            >
                              Forgot password?
                            </button>
                          )}
                        </div>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <input
                            id="password"
                            type="password"
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className={inputClassName}
                            required
                            minLength={6}
                          />
                        </div>
                      </div>

                      <button
                        type="submit"
                        disabled={loading}
                        className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 py-3 text-[15px] font-semibold text-white shadow-md shadow-orange-500/25 transition-opacity disabled:opacity-50"
                      >
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                          <>{isSignUp ? 'Create Account' : 'Sign In'} <ArrowRight className="w-4 h-4" /></>
                        )}
                      </button>
                    </form>

                    <div className="mt-6 text-center">
                      <button
                        type="button"
                        onClick={() => setIsSignUp(!isSignUp)}
                        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {isSignUp ? (
                          <>
                            Already have an account?{' '}
                            <span className="text-orange-600 dark:text-orange-400">Sign in</span>
                          </>
                        ) : (
                          <>
                            Don't have an account? <span className="text-orange-600 dark:text-orange-400">Sign up</span>
                          </>
                        )}
                      </button>
                    </div>
                  </>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          <p className="mt-6 text-center text-xs text-muted-foreground">
            By signing in, you agree to our Terms of Service and Privacy Policy
          </p>
        </div>
      </div>
    </div>
  );
}
