import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { rememberPostLoginRedirect } from '@/lib/postLoginRedirect';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';
import { MfaChallenge } from '@/components/MfaChallenge';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading, mfaRequired } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
      </div>
    );
  }

  if (!user) {
    return <SignInRedirect />;
  }

  // Signed in, but the second factor has not been given yet. Every protected
  // route goes through here, so there is no page that forgets to ask.
  if (mfaRequired) {
    return <MfaChallenge />;
  }

  return <>{children}</>;
}

/** Store the whole destination before leaving, including transcript timestamps. */
function SignInRedirect() {
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    rememberPostLoginRedirect(`${location.pathname}${location.search}${location.hash}`);
    navigate('/auth', { replace: true });
  }, [location.pathname, location.search, location.hash, navigate]);
  return <div role="status" className="sr-only">Opening sign in…</div>;
}
