import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { CalendarProvider } from "@/contexts/CalendarContext";
import { UiVersionProvider, useUiVersion } from "@/contexts/UiVersionContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PreMeetingNotification } from "@/components/dashboard/PreMeetingNotification";

// Eager: the three routes a signed-out visitor can land on. Everything else is
// lazy — previously every page was a static import, so a first-time visitor to
// the marketing site downloaded the whole dashboard (Chat, Coaching, Contacts,
// the meeting detail page and the charting library) before anything rendered.
import Landing from "./pages/Landing";
import Auth from "./pages/Auth";
import AuthV2 from "./pages/AuthV2";
import NotFound from "./pages/NotFound";

const Onboarding = lazy(() => import("./pages/Onboarding"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const DashboardV2 = lazy(() => import("./pages/DashboardV2"));
const Recordings = lazy(() => import("./pages/Recordings"));
const MeetingDetail = lazy(() => import("./pages/MeetingDetail"));
const MeetingDetailV2 = lazy(() => import("./pages/MeetingDetailV2"));
const Settings = lazy(() => import("./pages/Settings"));
const SettingsV2 = lazy(() => import("./pages/SettingsV2"));
const Calendar = lazy(() => import("./pages/Calendar"));
const CalendarV2 = lazy(() => import("./pages/CalendarV2"));
const ActionItems = lazy(() => import("./pages/ActionItems"));
const ActionItemsV2 = lazy(() => import("./pages/ActionItemsV2"));
const Contacts = lazy(() => import("./pages/Contacts"));
const ContactsV2 = lazy(() => import("./pages/ContactsV2"));
const Coaching = lazy(() => import("./pages/Coaching"));
const CoachingV2 = lazy(() => import("./pages/CoachingV2"));
const Chat = lazy(() => import("./pages/Chat"));
const ChatV2 = lazy(() => import("./pages/ChatV2"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const Terms = lazy(() => import("./pages/Terms"));
const Docs = lazy(() => import("./pages/Docs"));
const OAuthConsent = lazy(() => import("./pages/OAuthConsent"));
const SharedMeeting = lazy(() => import("./pages/SharedMeeting"));
const Workspace = lazy(() => import("./pages/Workspace"));
const MoreV2 = lazy(() => import("./pages/MoreV2"));
const WorkspaceV2 = lazy(() => import("./pages/WorkspaceV2"));
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
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

/**
 * Picks the V1 or V2 render of one page. Phase 2 adds a pair here per page; when
 * V1 is deleted the wrapper goes with it and the V2 file takes the plain name.
 */
function V2Route({ v1, v2 }: { v1: React.ReactNode; v2: React.ReactNode }) {
  const { ui } = useUiVersion();
  return <>{ui === "v2" ? v2 : v1}</>;
}

function AppRoutes() {
  const { user, loading, isPasswordRecovery } = useAuth();

  if (loading) return <RouteFallback />;

  // If recovery flow, always show Auth page regardless of user state
  if (isPasswordRecovery) {
    return (
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="*" element={<V2Route v1={<Auth />} v2={<AuthV2 />} />} />
        </Routes>
      </Suspense>
    );
  }

  return (
    <>
      <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/" element={user ? <Navigate to="/dashboard" /> : <Landing />} />
        <Route path="/auth" element={<V2Route v1={<Auth />} v2={<AuthV2 />} />} />
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
              <V2Route v1={<Dashboard />} v2={<DashboardV2 />} />
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
              <V2Route v1={<MeetingDetail />} v2={<MeetingDetailV2 />} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/more"
          element={
            <ProtectedRoute>
              <V2Route v1={<Settings />} v2={<MoreV2 />} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <V2Route v1={<Settings />} v2={<SettingsV2 />} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/calendar"
          element={
            <ProtectedRoute>
              <V2Route v1={<Calendar />} v2={<CalendarV2 />} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/action-items"
          element={
            <ProtectedRoute>
              <V2Route v1={<ActionItems />} v2={<ActionItemsV2 />} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/contacts"
          element={
            <ProtectedRoute>
              <V2Route v1={<Contacts />} v2={<ContactsV2 />} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/coaching"
          element={
            <ProtectedRoute>
              <V2Route v1={<Coaching />} v2={<CoachingV2 />} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/chat"
          element={
            <ProtectedRoute>
              <V2Route v1={<Chat />} v2={<ChatV2 />} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/workspace"
          element={
            <ProtectedRoute>
              <V2Route v1={<Workspace />} v2={<WorkspaceV2 />} />
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
              <UiVersionProvider>
                <CalendarProvider>
                  <AppRoutes />
                </CalendarProvider>
              </UiVersionProvider>
            </AuthProvider>
          </BrowserRouter>
        </ErrorBoundary>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
