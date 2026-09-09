import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { CalendarProvider } from "@/contexts/CalendarContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PreMeetingNotification } from "@/components/dashboard/PreMeetingNotification";

// Eager: the three routes a signed-out visitor can land on. Everything else is
// lazy — previously every page was a static import, so a first-time visitor to
// the marketing site downloaded the whole dashboard (Chat, Coaching, Contacts,
// the meeting detail page and the charting library) before anything rendered.
import Landing from "./pages/Landing";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";

const Onboarding = lazy(() => import("./pages/Onboarding"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Recordings = lazy(() => import("./pages/Recordings"));
const MeetingDetail = lazy(() => import("./pages/MeetingDetail"));
const Settings = lazy(() => import("./pages/Settings"));
const Calendar = lazy(() => import("./pages/Calendar"));
const ActionItems = lazy(() => import("./pages/ActionItems"));
const Contacts = lazy(() => import("./pages/Contacts"));
const Coaching = lazy(() => import("./pages/Coaching"));
const Chat = lazy(() => import("./pages/Chat"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const Terms = lazy(() => import("./pages/Terms"));
const Docs = lazy(() => import("./pages/Docs"));
const OAuthConsent = lazy(() => import("./pages/OAuthConsent"));
const SharedMeeting = lazy(() => import("./pages/SharedMeeting"));
const Workspace = lazy(() => import("./pages/Workspace"));
const More = lazy(() => import("./pages/More"));
const AcceptInvite = lazy(() => import("./pages/AcceptInvite"));

// Cache server reads so revisiting a page renders instantly from cache and
// revalidates in the background, instead of refetching from scratch every mount.
// refetchOnWindowFocus is disabled to avoid a refetch storm on every tab focus.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000, // 1 min — treat data as fresh; no refetch on remount within this window
      gcTime: 5 * 60_000, // keep unused cache 5 min before garbage-collecting
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function RouteFallback() {
  return (
    <div role="status" className="min-h-screen flex items-center justify-center bg-background">
      <span className="sr-only">Loading EchoBrief…</span>
      <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function AppRoutes() {
  const { user, loading, isPasswordRecovery } = useAuth();

  if (loading) return <RouteFallback />;

  // If recovery flow, always show Auth page regardless of user state
  if (isPasswordRecovery) {
    return (
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="*" element={<Auth />} />
        </Routes>
      </Suspense>
    );
  }

  return (
    <>
      <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/" element={user ? <Navigate to="/dashboard" /> : <Landing />} />
        <Route path="/auth" element={<Auth />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/privacy-policy" element={<PrivacyPolicy />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/docs" element={<Docs />} />
        <Route path="/oauth/consent" element={<OAuthConsent />} />
        {/* Public: the reader has no account, and the token in the URL is the
            credential. Must stay outside ProtectedRoute. */}
        <Route path="/share/:token" element={<SharedMeeting />} />
        {/* Needs a session — the invite names an email, the membership row
            names a user id — so the page itself redirects to /auth. */}
        <Route path="/invite/:token" element={<AcceptInvite />} />
        <Route
          path="/onboarding"
          element={
            <ProtectedRoute>
              <Onboarding />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/recordings"
          element={
            <ProtectedRoute>
              <Recordings />
            </ProtectedRoute>
          }
        />
        <Route
          path="/meeting/:id"
          element={
            <ProtectedRoute>
              <MeetingDetail />
            </ProtectedRoute>
          }
        />
        <Route
          path="/more"
          element={
            <ProtectedRoute>
              <More />
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <Settings />
            </ProtectedRoute>
          }
        />
        <Route
          path="/calendar"
          element={
            <ProtectedRoute>
              <Calendar />
            </ProtectedRoute>
          }
        />
        <Route
          path="/action-items"
          element={
            <ProtectedRoute>
              <ActionItems />
            </ProtectedRoute>
          }
        />
        <Route
          path="/contacts"
          element={
            <ProtectedRoute>
              <Contacts />
            </ProtectedRoute>
          }
        />
        <Route
          path="/coaching"
          element={
            <ProtectedRoute>
              <Coaching />
            </ProtectedRoute>
          }
        />
        <Route
          path="/chat"
          element={
            <ProtectedRoute>
              <Chat />
            </ProtectedRoute>
          }
        />
        <Route
          path="/workspace"
          element={
            <ProtectedRoute>
              <Workspace />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<NotFound />} />
      </Routes>
      </Suspense>
      {/* Pre-meeting notifications */}
      {user && <PreMeetingNotification />}
    </>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <ErrorBoundary>
          <BrowserRouter>
            <AuthProvider>
                      <CalendarProvider>
                  <AppRoutes />
                </CalendarProvider>
                  </AuthProvider>
          </BrowserRouter>
        </ErrorBoundary>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
