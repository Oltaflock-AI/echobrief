import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { RecordingProvider } from "@/contexts/RecordingContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { CalendarProvider } from "@/contexts/CalendarContext";
import { useEffect } from "react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { ExtensionTokenSync } from "@/components/ExtensionTokenSync";
import { GlobalRecordingPanel } from "@/components/dashboard/GlobalRecordingPanel";
import { PreMeetingNotification } from "@/components/dashboard/PreMeetingNotification";
import Landing from "./pages/Landing";
import Auth from "./pages/Auth";
import Onboarding from "./pages/Onboarding";
import Dashboard from "./pages/Dashboard";
import Recordings from "./pages/Recordings";
import MeetingDetail from "./pages/MeetingDetail";
import Settings from "./pages/Settings";
import Calendar from "./pages/Calendar";
import ActionItems from "./pages/ActionItems";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import Terms from "./pages/Terms";
import Docs from "./pages/Docs";
import ChromeExtensionGuide from "./pages/ChromeExtensionGuide";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function CalendarAutoSync() {
  const { user } = useAuth();
  const { setEvents, setSynced } = useCalendar();

  useEffect(() => {
    if (!user) return;

    const fetchCalendarEvents = async () => {
      try {
        const { supabase } = await import("@/integrations/supabase/client");

        // Check if Google is connected
        const { data: tokenData } = await supabase
          .from('user_oauth_tokens')
          .select('google_access_token')
          .eq('user_id', user.id)
          .single();

        if (!tokenData?.google_access_token) return;

        // Get calendars
        const { data: calendars } = await supabase
          .from('calendars')
          .select('id, calendar_id')
          .eq('user_id', user.id)
          .eq('is_active', true);

        if (!calendars || calendars.length === 0) return;

        const now = new Date();
        const maxDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        const allEvents: any[] = [];

        for (const cal of calendars) {
          try {
            const response = await fetch(
              `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal.calendar_id)}/events?timeMin=${now.toISOString()}&timeMax=${maxDate.toISOString()}&singleEvents=true&orderBy=startTime`,
              { headers: { 'Authorization': `Bearer ${tokenData.google_access_token}` } }
            );

            if (response.ok) {
              const { items } = await response.json();
              if (items) {
                allEvents.push(...items.map((e: any) => ({
                  id: e.id,
                  title: e.summary || 'No title',
                  start_time: e.start?.dateTime || e.start?.date,
                  end_time: e.end?.dateTime || e.end?.date,
                  is_all_day: !e.start?.dateTime,
                })));
              }
            }
          } catch (err) {
            console.error('Calendar fetch error:', err);
          }
        }

        setEvents(allEvents);
        setSynced(true);
      } catch (err) {
        console.error('Calendar auto-sync error:', err);
      }
    };

    fetchCalendarEvents();
  }, [user]);

  return null;
}

function AppRoutes() {
  const { user, loading } = useAuth();

  // Check for recovery hash SYNCHRONOUSLY before any render
  const isRecovery = window.location.hash.includes('type=recovery');

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // If recovery flow, always show Auth page regardless of user state
  if (isRecovery) {
    return (
      <>
        <ExtensionTokenSync />
        <Routes>
          <Route path="*" element={<Auth />} />
        </Routes>
      </>
    );
  }

  return (
    <>
      <ExtensionTokenSync />
      <CalendarAutoSync />
      <Routes>
        <Route path="/" element={user ? <Navigate to="/dashboard" /> : <Landing />} />
        <Route path="/auth" element={<Auth />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/privacy-policy" element={<PrivacyPolicy />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/docs" element={<Docs />} />
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
          path="/chrome-extension-guide"
          element={
            <ProtectedRoute>
              <ChromeExtensionGuide />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<NotFound />} />
      </Routes>
      {/* Global recording panel - always visible when recording */}
      {user && <GlobalRecordingPanel />}
      {/* Pre-meeting notifications */}
      {user && <PreMeetingNotification notetakerName="Khush's Notetaker" notificationMinutes={5} />}
    </>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <RecordingProvider>
              <CalendarProvider>
                <AppRoutes />
              </CalendarProvider>
            </RecordingProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
