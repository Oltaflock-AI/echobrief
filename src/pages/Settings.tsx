import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { BotCustomization } from '@/components/dashboard/BotCustomization';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, Lock, Mail, Bell, LogOut, X, Trash2, Calendar, MessageCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  google_calendar_connected: boolean;
  slack_connected: boolean;
  slack_channel_id: string | null;
  slack_channel_name: string | null;
}

interface GoogleCalendar {
  id: string;
  email: string;
  name: string;
  is_primary: boolean;
  connected_at: string;
}

type SettingsTab = 'account' | 'bot' | 'integrations' | 'security';

export default function Settings() {
  const { user, session } = useAuth();
  const { toast } = useToast();
  
  // Get initial tab from URL params
  const getInitialTab = (): SettingsTab => {
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get('tab');
    if (tabParam === 'integrations' || tabParam === 'bot' || tabParam === 'security') {
      return tabParam as SettingsTab;
    }
    return 'account';
  };
  
  const [activeTab, setActiveTab] = useState<SettingsTab>(getInitialTab());
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  // Account settings
  const [fullName, setFullName] = useState('');
  const [saving, setSaving] = useState(false);

  // Security settings
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  // Integrations
  const [connectingGoogle, setConnectingGoogle] = useState(false);
  const [connectingSlack, setConnectingSlack] = useState(false);
  const [slackChannelId, setSlackChannelId] = useState('');
  const [slackChannelName, setSlackChannelName] = useState('');
  const [googleCalendars, setGoogleCalendars] = useState<GoogleCalendar[]>([]);

  // Delete account
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);

  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

  useEffect(() => {
    if (!user) return;

    const fetchProfile = async () => {
      // Fetch profile
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (!profileError && profileData) {
        setProfile(profileData as Profile);
        setFullName(profileData.full_name || '');
        setSlackChannelId(profileData.slack_channel_id || '');
        setSlackChannelName(profileData.slack_channel_name || '');
      }

      // Fetch connected Google Calendars
      const { data: calendarsData, error: calendarsError } = await supabase
        .from('calendars')
        .select('id, email, calendar_name, is_primary, is_active')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('is_primary', { ascending: false });

      if (!calendarsError && calendarsData) {
        setGoogleCalendars(
          calendarsData.map((cal: any) => ({
            id: cal.id,
            email: cal.email || '',
            name: cal.calendar_name || 'Unnamed Calendar',
            is_primary: cal.is_primary,
            connected_at: new Date().toISOString(),
          }))
        );
      }

      setLoading(false);
    };

    fetchProfile();
  }, [user]);

  // Account handlers
  const handleSaveProfile = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ full_name: fullName })
        .eq('user_id', user.id);

      if (error) throw error;
      toast({ title: 'Saved', description: 'Your profile has been updated.' });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  // Security handlers
  const handleChangePassword = async () => {
    if (!newPassword || !confirmNewPassword) {
      toast({ title: 'Error', description: 'Please fill in both fields.', variant: 'destructive' });
      return;
    }
    if (newPassword !== confirmNewPassword) {
      toast({ title: 'Error', description: 'Passwords do not match.', variant: 'destructive' });
      return;
    }
    if (newPassword.length < 6) {
      toast({ title: 'Error', description: 'Password must be at least 6 characters.', variant: 'destructive' });
      return;
    }
    setChangingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast({ title: 'Password updated', description: 'Your password has been changed successfully.' });
      setNewPassword('');
      setConfirmNewPassword('');
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setChangingPassword(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
      toast({ title: 'Signed out', description: 'You have been signed out.' });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmation !== 'DELETE') {
      toast({ title: 'Error', description: 'Please type DELETE to confirm', variant: 'destructive' });
      return;
    }

    setDeletingAccount(true);
    try {
      // Delete user account
      const { error } = await supabase.auth.admin.deleteUser(user?.id || '');
      if (error) throw error;

      // Sign out
      await supabase.auth.signOut();
      toast({ title: 'Account deleted', description: 'Your account has been permanently deleted.' });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setDeletingAccount(false);
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

  // Integration handlers
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

  // After OAuth redirect, just reload calendars from DB
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const googleConnected = params.get('google_connected');
    const shouldSync = googleConnected === 'true' || (user && localStorage.getItem('awaiting-calendar-sync-' + user?.id));
    
    if (shouldSync && user) {
      localStorage.removeItem('awaiting-calendar-sync-' + user?.id);
      
      const fetchCalendars = async () => {
        try {
          // Fetch calendars from DB (they should be there if OAuth succeeded)
          const { data: calendarsData, error } = await supabase
            .from('calendars')
            .select('id, email, calendar_name, is_primary, is_active')
            .eq('user_id', user.id)
            .eq('is_active', true);

          if (error) throw error;

          if (calendarsData && calendarsData.length > 0) {
            setGoogleCalendars(
              calendarsData.map((cal: any) => ({
                id: cal.id,
                email: cal.email || '',
                name: cal.calendar_name || 'Unnamed Calendar',
                is_primary: cal.is_primary,
                connected_at: new Date().toISOString(),
              }))
            );
            toast({ title: 'Success!', description: `Connected ${calendarsData.length} calendar(s).` });
          } else {
            toast({ title: 'Info', description: 'No calendars found. Try again.' });
          }
        } catch (error: any) {
          console.error('Error loading calendars:', error);
          toast({ title: 'Error', description: 'Failed to load calendars', variant: 'destructive' });
        }
      };

      fetchCalendars();
    }
  }, [user, activeTab]);

  const handleConnectSlack = async () => {
    if (!user || !slackChannelId.trim()) return;
    setConnectingSlack(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          slack_connected: true,
          slack_channel_id: slackChannelId.trim(),
          slack_channel_name: slackChannelName.trim() || slackChannelId.trim(),
        })
        .eq('user_id', user.id);

      if (error) throw error;
      setProfile(prev => prev ? { ...prev, slack_connected: true, slack_channel_id: slackChannelId, slack_channel_name: slackChannelName } : null);
      toast({ title: 'Connected!', description: 'Slack integration is now active.' });
      setSlackChannelId('');
      setSlackChannelName('');
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setConnectingSlack(false);
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
      setProfile(prev => prev ? { ...prev, google_calendar_connected: false } : null);
      toast({ title: 'Disconnected', description: 'Google Calendar integration has been removed.' });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  // Refetch calendars when integrations tab is opened
  const handleTabChange = (tabId: SettingsTab) => {
    setActiveTab(tabId);
    
    // If switching to integrations tab, refetch calendars
    if (tabId === 'integrations' && user) {
      const refetchCalendars = async () => {
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
      };
      refetchCalendars();
    }
  };

  const tabs = [
    { id: 'account' as const, label: 'Account', icon: '👤' },
    { id: 'bot' as const, label: 'Bot', icon: '🤖' },
    { id: 'integrations' as const, label: 'Integrations', icon: '🔗' },
    { id: 'security' as const, label: 'Security', icon: '🔒' },
  ];

  return (
    <DashboardLayout>
      <div className="px-8 py-8 max-w-4xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground" style={{ fontFamily: 'Outfit, sans-serif', letterSpacing: '-0.02em' }}>
            Settings
          </h1>
          <p className="text-sm mt-2" style={{ color: '#A8A29E' }}>
            Manage your account, integrations, and preferences
          </p>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 32, borderBottom: '1px solid #292524' }}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              style={{
                padding: '12px 16px',
                fontSize: 13,
                fontWeight: activeTab === tab.id ? 600 : 500,
                background: 'none',
                border: 'none',
                borderBottom: activeTab === tab.id ? '2px solid #F97316' : 'none',
                color: activeTab === tab.id ? '#FB923C' : '#78716C',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        {/* Account Tab */}
        {activeTab === 'account' && (
          <div className="space-y-6">
            {/* Profile */}
            <div style={{ background: '#1C1917', border: '1px solid #292524', borderRadius: 16, padding: 24 }}>
              <h2 style={{ fontSize: 16, fontWeight: 600, color: '#FAFAF9', marginBottom: 16 }}>Profile Information</h2>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#FAFAF9', marginBottom: 8 }}>
                  Full Name
                </label>
                <Input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  style={{ background: '#1C1917', border: '1px solid #292524', color: '#FAFAF9' }}
                />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#FAFAF9', marginBottom: 8 }}>
                  Email
                </label>
                <Input
                  disabled
                  value={user?.email || ''}
                  style={{ background: '#1C1917', border: '1px solid #292524', color: '#78716C' }}
                />
              </div>
              <Button onClick={handleSaveProfile} disabled={saving} style={{ background: '#FB923C', color: 'white' }}>
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Save Changes
              </Button>
            </div>
          </div>
        )}

        {/* Bot Tab */}
        {activeTab === 'bot' && (
          <div>
            {user && <BotCustomization user_id={user.id} />}
          </div>
        )}

        {/* Integrations Tab */}
        {activeTab === 'integrations' && (
          <div className="space-y-6">
            {/* Google Calendar */}
            <div style={{ background: '#1C1917', border: '1px solid #292524', borderRadius: 16, padding: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
                  <Calendar size={32} style={{ color: '#4285F4', flexShrink: 0 }} />
                  <div>
                    <h3 style={{ fontSize: 15, fontWeight: 600, color: '#FAFAF9', marginBottom: 4 }}>Google Calendar</h3>
                    <p style={{ fontSize: 13, color: '#78716C' }}>
                      Connect multiple calendars to detect and record meetings
                    </p>
                  </div>
                </div>
                <Button
                  onClick={handleConnectGoogle}
                  disabled={connectingGoogle}
                  style={{ background: '#FB923C', color: 'white' }}
                >
                  {connectingGoogle ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  Add Calendar
                </Button>
              </div>

              {googleCalendars.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {googleCalendars.map(cal => (
                    <div
                      key={cal.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '12px 16px',
                        borderRadius: 8,
                        background: '#0C0A09',
                        border: '1px solid #22C55E',
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <p style={{ fontSize: 13, fontWeight: 500, color: '#FAFAF9', margin: 0 }}>
                            {cal.name}
                          </p>
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 600,
                              color: '#22C55E',
                              background: '#22C55E20',
                              padding: '2px 8px',
                              borderRadius: 4,
                            }}
                          >
                            ✓ Connected
                          </span>
                        </div>
                        <p style={{ fontSize: 11, color: '#78716C', margin: 0 }}>📧 {cal.email}</p>
                      </div>
                      <button
                        onClick={() => handleDisconnectGoogleCalendar(cal.id)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#EF4444',
                          cursor: 'pointer',
                          padding: '4px 8px',
                          marginLeft: 12,
                        }}
                        title="Disconnect this calendar"
                      >
                        <X size={18} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ fontSize: 12, color: '#78716C', textAlign: 'center', padding: 12 }}>
                  No calendars connected. Click "Add Calendar" to get started.
                </p>
              )}
            </div>

            {/* Slack */}
            <div style={{ background: '#1C1917', border: '1px solid #292524', borderRadius: 16, padding: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <MessageCircle size={32} style={{ color: '#E01E5A', flexShrink: 0 }} />
                <h3 style={{ fontSize: 15, fontWeight: 600, color: '#FAFAF9' }}>Slack</h3>
              </div>
              {!profile?.slack_connected ? (
                <div style={{ display: 'flex', gap: 12, flexDirection: 'column' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#FAFAF9', marginBottom: 8 }}>
                      Slack Channel ID
                    </label>
                    <Input
                      value={slackChannelId}
                      onChange={(e) => setSlackChannelId(e.target.value)}
                      placeholder="e.g., C0123456789"
                      style={{ background: '#1C1917', border: '1px solid #292524', color: '#FAFAF9' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#FAFAF9', marginBottom: 8 }}>
                      Channel Name (optional)
                    </label>
                    <Input
                      value={slackChannelName}
                      onChange={(e) => setSlackChannelName(e.target.value)}
                      placeholder="e.g., #meetings"
                      style={{ background: '#1C1917', border: '1px solid #292524', color: '#FAFAF9' }}
                    />
                  </div>
                  <Button
                    onClick={handleConnectSlack}
                    disabled={connectingSlack || !slackChannelId.trim()}
                    style={{ background: '#FB923C', color: 'white' }}
                  >
                    {connectingSlack ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                    Connect
                  </Button>
                </div>
              ) : (
                <div>
                  <p style={{ fontSize: 13, color: '#22C55E', marginBottom: 12 }}>✓ Connected to {profile.slack_channel_name || profile.slack_channel_id}</p>
                  <Button
                    onClick={() => setProfile(prev => prev ? { ...prev, slack_connected: false } : null)}
                    style={{ background: 'transparent', border: '1px solid #292524', color: '#A8A29E' }}
                  >
                    Disconnect
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Security Tab */}
        {activeTab === 'security' && (
          <div className="space-y-6">
            {/* Change Password */}
            <div style={{ background: '#1C1917', border: '1px solid #292524', borderRadius: 16, padding: 24 }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, color: '#FAFAF9', marginBottom: 16 }}>Change Password</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#FAFAF9', marginBottom: 8 }}>
                    New Password
                  </label>
                  <Input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    style={{ background: '#1C1917', border: '1px solid #292524', color: '#FAFAF9' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#FAFAF9', marginBottom: 8 }}>
                    Confirm Password
                  </label>
                  <Input
                    type="password"
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    style={{ background: '#1C1917', border: '1px solid #292524', color: '#FAFAF9' }}
                  />
                </div>
                <Button
                  onClick={handleChangePassword}
                  disabled={changingPassword}
                  style={{ background: '#FB923C', color: 'white' }}
                >
                  {changingPassword ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  Update Password
                </Button>
              </div>
            </div>

            {/* Sign Out */}
            <div style={{ background: '#1C1917', border: '1px solid #292524', borderRadius: 16, padding: 24 }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, color: '#FAFAF9', marginBottom: 8 }}>Sign Out</h3>
              <p style={{ fontSize: 13, color: '#78716C', marginBottom: 16 }}>Sign out of your account on this device</p>
              <Button
                onClick={handleSignOut}
                style={{ background: 'transparent', border: '1px solid #292524', color: '#A8A29E' }}
              >
                <LogOut size={14} className="mr-2" />
                Sign Out
              </Button>
            </div>

            {/* Delete Account */}
            <div style={{ background: '#1C1917', border: '1px solid #292524', borderRadius: 16, padding: 24 }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, color: '#FAFAF9', marginBottom: 8 }}>Delete Account</h3>
              <p style={{ fontSize: 13, color: '#78716C', marginBottom: 16 }}>
                Permanently delete your account and all associated data. This action cannot be undone.
              </p>
              <Button
                onClick={() => setDeleteDialogOpen(true)}
                style={{ background: 'transparent', border: '1px solid #EF4444', color: '#EF4444' }}
              >
                <Trash2 size={14} className="mr-2" />
                Delete Account
              </Button>
            </div>

            {/* Delete Account Confirmation Dialog */}
            <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle style={{ color: '#EF4444' }}>Delete Account</DialogTitle>
                  <DialogDescription style={{ color: '#78716C' }}>
                    This will permanently delete your account, all meetings, transcripts, and data. This cannot be undone.
                  </DialogDescription>
                </DialogHeader>
                <div style={{ margin: '20px 0' }}>
                  <p style={{ fontSize: 13, color: '#FAFAF9', marginBottom: 8 }}>
                    Type <strong>DELETE</strong> to confirm:
                  </p>
                  <Input
                    value={deleteConfirmation}
                    onChange={(e) => setDeleteConfirmation(e.target.value)}
                    placeholder="Type DELETE"
                    style={{ background: '#1C1917', border: '1px solid #292524', color: '#FAFAF9' }}
                  />
                </div>
                <DialogFooter>
                  <Button
                    onClick={() => {
                      setDeleteDialogOpen(false);
                      setDeleteConfirmation('');
                    }}
                    style={{ background: 'transparent', border: '1px solid #292524', color: '#A8A29E' }}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleDeleteAccount}
                    disabled={deletingAccount || deleteConfirmation !== 'DELETE'}
                    style={{
                      background: '#EF4444',
                      color: 'white',
                      opacity: deleteConfirmation !== 'DELETE' ? 0.5 : 1,
                    }}
                  >
                    {deletingAccount ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                    Delete Account
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
