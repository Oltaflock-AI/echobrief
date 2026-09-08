/**
 * Calendar connections and delivery preferences (email, Slack, Zoho CRM).
 *
 * Google and Microsoft sit side by side here because auto-join treats them the
 * same way — see supabase/functions/_shared/calendar-connections.ts.
 */

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Calendar, Loader2, Mail, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { SlackCard } from './SlackCard';
import { ZohoCard } from './ZohoCard';
import type { GoogleCalendar, Profile } from './types';

interface PanelProps {
  profile: Profile | null;
  setProfile: React.Dispatch<React.SetStateAction<Profile | null>>;
}

export function IntegrationsPanel({ profile, setProfile }: PanelProps) {
  const { user, session } = useAuth();
  const { toast } = useToast();
  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

  const [connectingGoogle, setConnectingGoogle] = useState(false);
  const [connectingMicrosoft, setConnectingMicrosoft] = useState(false);
  const [microsoft, setMicrosoft] = useState<{ connected: boolean; needsReconnect: boolean } | null>(null);
  const [savingEmailPref, setSavingEmailPref] = useState(false);
  const [googleCalendars, setGoogleCalendars] = useState<GoogleCalendar[]>([]);

  // Connected calendars are only rendered on this tab.
  useEffect(() => {
    if (!user) return;
    void (async () => {
      const { data, error } = await supabase
        .from('calendars')
        .select('id, email, calendar_name, is_primary, is_active')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('is_primary', { ascending: false });
      if (!error && data) {
        setGoogleCalendars(
          data.map((cal: any) => ({
            id: cal.id,
            email: cal.email || '',
            name: cal.calendar_name || 'Unnamed Calendar',
            is_primary: cal.is_primary,
            connected_at: new Date().toISOString(),
          }))
        );
      }
    })();
  }, [user]);

  // Integration handlers
  const loadMicrosoft = useCallback(async () => {
    if (!user) return;
    // RLS scopes this to the caller; tokens are never selected.
    const { data } = await supabase
      .from('calendar_connections')
      .select('provider, needs_reconnect')
      .eq('user_id', user.id)
      .eq('provider', 'microsoft')
      .maybeSingle();
    setMicrosoft(data ? { connected: true, needsReconnect: !!data.needs_reconnect } : null);
  }, [user]);

  useEffect(() => { loadMicrosoft(); }, [loadMicrosoft]);

  const handleConnectMicrosoft = async () => {
    if (!session?.access_token) {
      toast({ title: 'Sign in first', description: 'Please sign in to connect Outlook.', variant: 'destructive' });
      return;
    }
    setConnectingMicrosoft(true);
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/microsoft-oauth-start`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ returnTo: '/settings?tab=integrations', origin: window.location.origin }),
      });
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      if (data.authUrl) window.location.href = data.authUrl;
    } catch (error: any) {
      toast({ title: 'Could not connect Outlook', description: error.message, variant: 'destructive' });
      setConnectingMicrosoft(false);
    }
  };

  const handleDisconnectMicrosoft = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('disconnect-calendar', {
        body: { provider: 'microsoft' },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      await loadMicrosoft();
      toast({ title: 'Outlook disconnected' });
    } catch (error: any) {
      toast({ title: 'Could not disconnect', description: error.message, variant: 'destructive' });
    }
  };

  const handleConnectGoogle = async () => {
    if (!session?.access_token) {
      toast({ title: 'Error', description: 'Please sign in to connect Google Calendar', variant: 'destructive' });
      return;
    }
    setConnectingGoogle(true);
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/google-oauth-start`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ returnTo: '/settings?tab=integrations', origin: window.location.origin }),
      });

      const data = await response.json();
      if (data.error) throw new Error(data.error);
      if (data.authUrl) {
        // Mark that we're waiting for calendar sync after OAuth
        localStorage.setItem('awaiting-calendar-sync-' + user?.id, 'true');
        window.location.href = data.authUrl;
      }
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      setConnectingGoogle(false);
    }
  };

  // After OAuth redirect, read calendars from DB (OAuth callback saves them)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const googleConnected = params.get('google_connected');
    
    if (googleConnected === 'true' && user) {
      setTimeout(async () => {
        try {
          const { data: calendarsData } = await supabase
            .from('calendars')
            .select('id, email, calendar_name, is_primary')
            .eq('user_id', user.id)
            .eq('is_active', true);

          if (calendarsData && calendarsData.length > 0) {
            setGoogleCalendars(
              calendarsData.map((cal: any) => ({
                id: cal.id,
                email: cal.email || '',
                name: cal.calendar_name || 'Unnamed',
                is_primary: cal.is_primary,
                connected_at: new Date().toISOString(),
              }))
            );
            toast({ title: 'Success!', description: `Connected ${calendarsData.length} calendar(s).` });
          } else {
            toast({ title: 'Info', description: 'No calendars found' });
          }
        } catch (error: any) {
          toast({ title: 'Error', description: 'Failed to load calendars', variant: 'destructive' });
        }
      }, 500); // Small delay for DB write to complete
    }
  }, [user, toast]);

  // Backs deliverResults() in supabase/functions/_shared/insights.ts, which
  // treats a missing/true value as "send the summary".
  const handleToggleEmailSummaries = async (enabled: boolean) => {
    if (!user) return;
    setSavingEmailPref(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ email_summaries_enabled: enabled })
        .eq('user_id', user.id);

      if (error) throw error;
      setProfile(prev => (prev ? { ...prev, email_summaries_enabled: enabled } : null));
      toast({
        title: enabled ? 'Email summaries on' : 'Email summaries off',
        description: enabled
          ? 'You will get a summary email when a meeting finishes processing.'
          : 'Meeting summaries will no longer be emailed to you.',
      });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setSavingEmailPref(false);
    }
  };

  const handleDisconnectGoogle = async () => {
    if (!user || !session?.access_token) return;
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/disconnect-google`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();
      if (data.error) throw new Error(data.error);
      setProfile(prev => prev ? { ...prev, google_calendar_connected: false, google_needs_reconnect: false } : null);
      setGoogleCalendars([]);
      toast({ title: 'Disconnected', description: 'Google Calendar integration has been removed.' });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const handleDisconnectGoogleCalendar = async (calendarId: string) => {
    try {
      // Mark calendar as inactive in database
      const { error } = await supabase
        .from('calendars')
        .update({ is_active: false })
        .eq('id', calendarId)
        .eq('user_id', user?.id);

      if (error) throw error;

      setGoogleCalendars(prev => prev.filter(cal => cal.id !== calendarId));
      toast({ title: 'Disconnected', description: 'Google Calendar has been removed.' });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };



  return (
    <div className="space-y-6">
      {/* Google Calendar */}
      <div className="rounded-2xl border border-border bg-card p-6 text-card-foreground shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div className="flex flex-1 items-center gap-3">
            <Calendar size={32} className="shrink-0 text-[#4285F4]" />
            <div>
              <h3 className="mb-1 text-[15px] font-semibold text-foreground">Google Calendar</h3>
              <p className="text-[13px] text-muted-foreground">
                Connect multiple calendars to detect and record meetings
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {profile?.google_calendar_connected && (
              <Button
                variant="outline"
                onClick={handleDisconnectGoogle}
                title="Revoke EchoBrief's access to your Google Calendar"
              >
                Disconnect
              </Button>
            )}
            <Button
              onClick={handleConnectGoogle}
              disabled={connectingGoogle}
              className="bg-ember text-white hover:bg-ember-deep"
            >
              {connectingGoogle ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {profile?.google_needs_reconnect ? 'Reconnect' : 'Add Calendar'}
            </Button>
          </div>
        </div>

        {profile?.google_needs_reconnect && (
          <div
            role="alert"
            className="mb-4 rounded-md px-4 py-3 text-[13px]"
            style={{
              border: '1px solid color-mix(in oklch, hsl(var(--warning)) 35%, transparent)',
              background: 'color-mix(in oklch, hsl(var(--warning)) 8%, transparent)',
              color: 'var(--ink)',
            }}
          >
            Google Calendar disconnected — reconnect to keep auto-join working. Your saved
            connection stopped refreshing; click Reconnect to sign in with Google again.
          </div>
        )}

        {googleCalendars.length > 0 ? (
          <div className="flex flex-col gap-2">
            {googleCalendars.map(cal => (
              <div
                key={cal.id}
                className="flex items-center justify-between rounded-lg border border-success/40 bg-muted/30 px-4 py-3"
              >
                <div className="flex-1">
                  <div className="mb-1 flex items-center gap-2">
                    <p className="m-0 text-[13px] font-medium text-foreground">{cal.name}</p>
                    <span className="rounded px-2 py-0.5 text-[10px] font-semibold text-success dark:text-success bg-success/15">
                      ✓ Connected
                    </span>
                  </div>
                  <p className="m-0 text-[11px] text-muted-foreground">📧 {cal.email}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleDisconnectGoogleCalendar(cal.id)}
                  className="ml-3 cursor-pointer border-none bg-transparent p-1 text-destructive hover:opacity-90"
                  title="Disconnect this calendar"
                >
                  <X size={18} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="p-3 text-center text-xs text-muted-foreground">
            No calendars connected. Click &quot;Add Calendar&quot; to get started.
          </p>
        )}
      </div>

      {/* Outlook / Microsoft 365 */}
      <div className="rounded-2xl border border-border bg-card p-6 text-card-foreground shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div className="flex flex-1 items-center gap-3">
            <Calendar size={32} className="shrink-0 text-[#0078D4]" />
            <div>
              <h3 className="mb-1 text-[15px] font-semibold text-foreground">Outlook Calendar</h3>
              <p className="text-[13px] text-muted-foreground">
                Auto-join Teams, Zoom and Meet calls from your Microsoft 365 or Outlook.com calendar
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {microsoft?.connected && (
              <Button
                variant="outline"
                onClick={handleDisconnectMicrosoft}
                title="Remove EchoBrief's access to your Outlook calendar"
              >
                Disconnect
              </Button>
            )}
            <Button
              onClick={handleConnectMicrosoft}
              disabled={connectingMicrosoft}
              className="bg-ember text-white hover:bg-ember-deep"
            >
              {connectingMicrosoft ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {microsoft?.connected ? 'Reconnect' : 'Connect Outlook'}
            </Button>
          </div>
        </div>

        {microsoft?.needsReconnect && (
          <div
            role="alert"
            className="mb-4 rounded-md px-4 py-3 text-[13px]"
            style={{
              border: '1px solid color-mix(in oklch, hsl(var(--warning)) 35%, transparent)',
              background: 'color-mix(in oklch, hsl(var(--warning)) 8%, transparent)',
              color: 'var(--ink)',
            }}
          >
            Outlook disconnected — reconnect to keep auto-join working.
          </div>
        )}

        {microsoft?.connected ? (
          <div className="flex items-center justify-between rounded-lg border border-success/40 bg-muted/30 px-4 py-3">
            <p className="m-0 text-[13px] font-medium text-foreground">
              Outlook connected
              <span className="ml-2 rounded px-2 py-0.5 text-[10px] font-semibold text-success dark:text-success bg-success/15">
                ✓ Connected
              </span>
            </p>
          </div>
        ) : (
          <p className="p-3 text-center text-xs text-muted-foreground">
            Not connected. Click &quot;Connect Outlook&quot; to auto-join meetings from your Outlook calendar.
          </p>
        )}
      </div>

      {/* Slack */}
      <SlackCard />

      {/* Zoho CRM */}
      <ZohoCard />

      {/* Email summaries */}
      <div className="rounded-2xl border border-border bg-card p-6 text-card-foreground shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-1 items-center gap-3">
            <Mail size={32} className="shrink-0 text-ember" />
            <div>
              <h3 className="mb-1 text-[15px] font-semibold text-foreground">Email summaries</h3>
              <p className="text-[13px] text-muted-foreground">
                Get the summary, decisions and action items in your inbox when a meeting finishes processing.
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            onClick={() => handleToggleEmailSummaries(profile?.email_summaries_enabled === false)}
            disabled={savingEmailPref}
            className="border-border"
          >
            {savingEmailPref ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {profile?.email_summaries_enabled === false ? 'Turn on' : 'Turn off'}
          </Button>
        </div>
      </div>

    </div>
  );
}
