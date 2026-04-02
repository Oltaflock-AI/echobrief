import { useEffect, useState, useCallback } from 'react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { BotCustomization } from '@/components/dashboard/BotCustomization';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { 
  Calendar, 
  Slack, 
  User, 
  CheckCircle, 
  XCircle,
  Loader2,
  ExternalLink,
  Send,
  Sparkles,
  Lock,
  Bot,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  google_calendar_connected: boolean;
  slack_connected: boolean;
  slack_channel_id: string | null;
  slack_channel_name: string | null;
}

export default function Settings() {
  const { user, session } = useAuth();
  const { toast } = useToast();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fullName, setFullName] = useState('');

  // Auto-Join Settings
  const [autoRecord, setAutoRecord] = useState(false);
  const [notetakerName, setNotetakerName] = useState('EchoBrief Notetaker');
  const [joinMinutesBefore, setJoinMinutesBefore] = useState('2');
  const [preferredLanguage, setPreferredLanguage] = useState('English');
  const [savingAutoJoin, setSavingAutoJoin] = useState(false);

  // Change password
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

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
      toast({ title: 'Error', description: error.message || 'Failed to update password', variant: 'destructive' });
    } finally {
      setChangingPassword(false);
    }
  };

  // Slack connection dialog
  const [slackDialogOpen, setSlackDialogOpen] = useState(false);
  const [slackChannelId, setSlackChannelId] = useState('');
  const [slackChannelName, setSlackChannelName] = useState('');
  const [connectingSlack, setConnectingSlack] = useState(false);
  const [testingSlack, setTestingSlack] = useState(false);

  // Google Calendar connection
  const [connectingGoogle, setConnectingGoogle] = useState(false);

  // Handle success/error from backend OAuth redirect
  const handleOAuthResult = useCallback(async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const googleConnected = urlParams.get('google_connected');
    const error = urlParams.get('error');

    if (googleConnected === 'true') {
      // Refetch profile from DB to get actual connection state
      if (user) {
        const { data } = await supabase
          .from('profiles')
          .select('*')
          .eq('user_id', user.id)
          .single();
        if (data) {
          setProfile(data);
        }
      }
      toast({
        title: 'Connected!',
        description: 'Google Calendar is now syncing your events',
      });
      window.history.replaceState({}, '', '/settings');
    } else if (error) {
      const errorMessages: Record<string, string> = {
        invalid_state: 'Session expired. Please try again.',
        expired_state: 'Session expired. Please try again.',
        access_denied: 'Access was denied. Please try again.',
        no_code: 'Authorization failed. Please try again.',
        server_config: 'Server configuration error. Please contact support.',
        save_failed: 'Failed to save credentials. Please try again.',
        server_error: 'Server error. Please try again.',
      };
      toast({
        title: 'Connection Failed',
        description: errorMessages[error] || `Failed to connect: ${error}`,
        variant: 'destructive',
      });
      window.history.replaceState({}, '', '/settings');
    }
    setConnectingGoogle(false);
  }, [toast, user]);

  useEffect(() => {
    // Check for OAuth result from backend redirect
    const urlParams = new URLSearchParams(window.location.search);
    const googleConnected = urlParams.get('google_connected');
    const error = urlParams.get('error');
    if (googleConnected || error) {
      handleOAuthResult();
    }
  }, [handleOAuthResult]);

  useEffect(() => {
    if (!user) return;

    const fetchProfile = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (!error && data) {
        setProfile(data);
        setFullName(data.full_name || '');
      }
      setLoading(false);
    };

    fetchProfile();

    const fetchAutoJoinPrefs = async () => {
      const { data } = await (supabase as any)
        .from('notification_preferences')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (data) {
        setAutoRecord(data.auto_record ?? false);
        setNotetakerName(data.notetaker_name ?? 'EchoBrief Notetaker');
        setJoinMinutesBefore(String(data.join_minutes_before ?? 2));
        setPreferredLanguage(data.preferred_language ?? 'English');
      }
    };

    fetchAutoJoinPrefs();
  }, [user]);

  const handleSaveAutoJoin = async () => {
    if (!user) return;
    setSavingAutoJoin(true);
    const { error } = await (supabase as any)
      .from('notification_preferences')
      .upsert({
        user_id: user.id,
        auto_record: autoRecord,
        notetaker_name: notetakerName,
        join_minutes_before: parseInt(joinMinutesBefore),
        preferred_language: preferredLanguage,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });

    if (error) {
      toast({ title: 'Error', description: 'Failed to save auto-join settings', variant: 'destructive' });
    } else {
      toast({ title: 'Saved', description: 'Auto-join settings updated' });
    }
    setSavingAutoJoin(false);
  };

  const handleSaveProfile = async () => {
    if (!user) return;

    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: fullName })
      .eq('user_id', user.id);

    if (error) {
      toast({
        title: 'Error',
        description: 'Failed to save profile',
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Saved',
        description: 'Your profile has been updated',
      });
    }
    setSaving(false);
  };

  const handleConnectSlack = async () => {
    if (!user || !slackChannelId.trim()) return;

    setConnectingSlack(true);
    const { error } = await supabase
      .from('profiles')
      .update({ 
        slack_connected: true,
        slack_channel_id: slackChannelId.trim(),
        slack_channel_name: slackChannelName.trim() || slackChannelId.trim(),
      })
      .eq('user_id', user.id);

    if (error) {
      toast({
        title: 'Error',
        description: 'Failed to connect Slack',
        variant: 'destructive',
      });
    } else {
      setProfile(prev => prev ? {
        ...prev,
        slack_connected: true,
        slack_channel_id: slackChannelId.trim(),
        slack_channel_name: slackChannelName.trim() || slackChannelId.trim(),
      } : null);
      toast({
        title: 'Connected!',
        description: 'Slack integration is now active',
      });
      setSlackDialogOpen(false);
    }
    setConnectingSlack(false);
  };

  const handleTestSlackConnection = async () => {
    if (!profile?.slack_channel_id || !session?.access_token) return;

    setTestingSlack(true);
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/test-slack-connection`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          channelId: profile.slack_channel_id,
          channelName: profile.slack_channel_name,
        }),
      });

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      toast({
        title: 'Test Successful! 🎉',
        description: 'Check your Slack channel for the test message',
      });
    } catch (err) {
      console.error('Test Slack error:', err);
      toast({
        title: 'Test Failed',
        description: err instanceof Error ? err.message : 'Failed to send test message',
        variant: 'destructive',
      });
    } finally {
      setTestingSlack(false);
    }
  };

  const handleDisconnectSlack = async () => {
    if (!user) return;

    const { error } = await supabase
      .from('profiles')
      .update({ 
        slack_connected: false,
        slack_channel_id: null,
        slack_channel_name: null,
      })
      .eq('user_id', user.id);

    if (error) {
      toast({
        title: 'Error',
        description: 'Failed to disconnect Slack',
        variant: 'destructive',
      });
    } else {
      setProfile(prev => prev ? {
        ...prev,
        slack_connected: false,
        slack_channel_id: null,
        slack_channel_name: null,
      } : null);
      toast({
        title: 'Disconnected',
        description: 'Slack integration has been removed',
      });
    }
  };

  const handleConnectGoogle = async () => {
    if (!session?.access_token) {
      toast({
        title: 'Error',
        description: 'Please sign in to connect Google Calendar',
        variant: 'destructive',
      });
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
        body: JSON.stringify({ returnTo: '/settings', origin: window.location.origin }),
      });

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      if (data.authUrl) {
        window.location.href = data.authUrl;
      }
    } catch (err) {
      console.error('Failed to start OAuth:', err);
      toast({
        title: 'Connection Error',
        description: err instanceof Error ? err.message : 'Failed to start Google connection',
        variant: 'destructive',
      });
      setConnectingGoogle(false);
    }
  };

  const handleDisconnectGoogle = async () => {
    if (!user || !session?.access_token) return;

    try {
      // Call edge function to securely delete tokens
      const response = await fetch(`${SUPABASE_URL}/functions/v1/disconnect-google`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      setProfile(prev => prev ? { ...prev, google_calendar_connected: false } : null);
      toast({
        title: 'Disconnected',
        description: 'Google Calendar integration has been removed',
      });
    } catch (err) {
      console.error('Disconnect error:', err);
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to disconnect Google Calendar',
        variant: 'destructive',
      });
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

  return (
    <DashboardLayout>
      <div className="px-8 py-8 max-w-4xl">
        <div className="mb-6">
          <h1 
            className="text-[26px] font-semibold text-foreground"
            style={{ fontFamily: 'Outfit, sans-serif', letterSpacing: '-0.02em' }}
          >
            Settings
          </h1>
          <p className="text-sm mt-1" style={{ color: '#A8A29E' }}>
            Manage your account and integrations
          </p>
        </div>

        <div className="space-y-6">
          {/* Profile Settings */}
          <Card className="glass-card-liquid overflow-hidden">
            <CardHeader className="relative">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-orange-500 to-amber-500" />
              <CardTitle className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-orange-500/10">
                  <User className="w-5 h-5 text-orange-500" />
                </div>
                Profile
              </CardTitle>
              <CardDescription>
                Update your personal information
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <Input
                  id="name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Your name"
                  className="bg-card"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  value={user?.email || ''}
                  disabled
                  className="bg-muted/50"
                />
              </div>
              <Button onClick={handleSaveProfile} disabled={saving} variant="accent">
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : null}
                Save Changes
              </Button>
            </CardContent>
          </Card>

          {/* Bot Customization */}
          {user && (
            <BotCustomization user_id={user.id} />
          )}

          {/* Change Password */}
          <Card className="glass-card-liquid overflow-hidden">
            <CardHeader className="relative">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-orange-500 to-amber-500" />
              <CardTitle className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-orange-500/10">
                  <Lock className="w-5 h-5 text-orange-500" />
                </div>
                Change Password
              </CardTitle>
              <CardDescription>
                Update your account password
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">New Password</Label>
                <Input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password"
                  className="bg-card"
                  minLength={6}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-new-password">Confirm New Password</Label>
                <Input
                  id="confirm-new-password"
                  type="password"
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  placeholder="Confirm new password"
                  className="bg-card"
                  minLength={6}
                />
              </div>
              <Button onClick={handleChangePassword} disabled={changingPassword} variant="accent">
                {changingPassword ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : null}
                Update Password
              </Button>
            </CardContent>
          </Card>

          {/* Google Calendar Integration */}
          <Card className="glass-card-liquid overflow-hidden">
            <CardHeader className="relative">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-orange-500 to-amber-500" />
              <CardTitle className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-orange-500/10">
                  <Calendar className="w-5 h-5 text-orange-500" />
                </div>
                Google Calendar
              </CardTitle>
              <CardDescription>
                Automatically detect meetings from your calendar
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {profile?.google_calendar_connected ? (
                    <>
                      <div className="p-2 rounded-full bg-success/10">
                        <CheckCircle className="w-5 h-5 text-success" />
                      </div>
                      <span className="text-foreground font-medium">Connected</span>
                    </>
                  ) : (
                    <>
                      <div className="p-2 rounded-full bg-muted">
                        <XCircle className="w-5 h-5 text-muted-foreground" />
                      </div>
                      <span className="text-muted-foreground">Not connected</span>
                    </>
                  )}
                </div>
                <Button 
                  variant={profile?.google_calendar_connected ? "outline" : "accent"}
                  className="gap-2"
                  disabled={connectingGoogle}
                  onClick={() => {
                    if (profile?.google_calendar_connected) {
                      handleDisconnectGoogle();
                    } else {
                      handleConnectGoogle();
                    }
                  }}
                >
                  {connectingGoogle ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <ExternalLink className="w-4 h-4" />
                  )}
                  {connectingGoogle ? 'Connecting...' : profile?.google_calendar_connected ? 'Disconnect' : 'Connect'}
                </Button>
              </div>
              <p className="text-sm text-muted-foreground mt-4">
                When connected, we'll automatically detect upcoming meetings and remind you to start recording.
              </p>
            </CardContent>
          </Card>

          {/* Auto-Join Settings */}
          <Card className="glass-card-liquid overflow-hidden">
            <CardHeader className="relative">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-orange-500 to-amber-500" />
              <CardTitle className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-orange-500/10">
                  <Bot className="w-5 h-5 text-orange-500" />
                </div>
                Auto-Join Settings
              </CardTitle>
              <CardDescription>
                Configure how EchoBrief joins your meetings
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Auto-join toggle */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                <div>
                  <p className="font-medium text-foreground">Auto-join meetings</p>
                  <p className="text-sm text-muted-foreground">
                    Automatically join meetings from your calendar
                  </p>
                </div>
                <Switch
                  checked={autoRecord}
                  onCheckedChange={setAutoRecord}
                />
              </div>

              {/* Notetaker display name */}
              <div className="space-y-2">
                <Label htmlFor="notetaker-name">Notetaker display name</Label>
                <Input
                  id="notetaker-name"
                  value={notetakerName}
                  onChange={(e) => setNotetakerName(e.target.value)}
                  placeholder="EchoBrief Notetaker"
                  className="bg-card"
                />
                <p className="text-xs text-muted-foreground">
                  The name shown when the bot joins your meeting
                </p>
              </div>

              {/* Minutes before meeting */}
              <div className="space-y-2">
                <Label>Join how early?</Label>
                <Select
                  value={joinMinutesBefore}
                  onValueChange={setJoinMinutesBefore}
                >
                  <SelectTrigger className="bg-card">
                    <SelectValue placeholder="Select minutes" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 minute before</SelectItem>
                    <SelectItem value="2">2 minutes before</SelectItem>
                    <SelectItem value="3">3 minutes before</SelectItem>
                    <SelectItem value="5">5 minutes before</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Preferred language */}
              <div className="space-y-2">
                <Label>Preferred transcription language</Label>
                <Select
                  value={preferredLanguage}
                  onValueChange={setPreferredLanguage}
                >
                  <SelectTrigger className="bg-card">
                    <SelectValue placeholder="Select language" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="English">English</SelectItem>
                    <SelectItem value="Hindi">Hindi</SelectItem>
                    <SelectItem value="Tamil">Tamil</SelectItem>
                    <SelectItem value="Telugu">Telugu</SelectItem>
                    <SelectItem value="Kannada">Kannada</SelectItem>
                    <SelectItem value="Malayalam">Malayalam</SelectItem>
                    <SelectItem value="Bengali">Bengali</SelectItem>
                    <SelectItem value="Marathi">Marathi</SelectItem>
                    <SelectItem value="Gujarati">Gujarati</SelectItem>
                    <SelectItem value="Punjabi">Punjabi</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Platform icons row */}
              <div className="space-y-2">
                <Label>Supported platforms</Label>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 flex-wrap">
                  {/* Google Meet */}
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-background/60">
                    <div className="w-7 h-7 rounded-md bg-white flex items-center justify-center shadow-sm">
                      <svg viewBox="0 0 48 48" className="w-4 h-4" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M29 24c0 2.76-2.24 5-5 5s-5-2.24-5-5 2.24-5 5-5 5 2.24 5 5z" fill="#00AC47"/>
                        <path d="M38 20l-8 4 8 4V20z" fill="#00AC47"/>
                        <rect x="10" y="14" width="24" height="20" rx="4" fill="none" stroke="#00AC47" strokeWidth="2.5"/>
                      </svg>
                    </div>
                    <span className="text-sm font-medium text-foreground">Google Meet</span>
                    <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                  </div>
                  {/* Zoom */}
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-background/60">
                    <div className="w-7 h-7 rounded-md bg-[#2D8CFF] flex items-center justify-center shadow-sm">
                      <svg viewBox="0 0 24 24" className="w-4 h-4" fill="white" xmlns="http://www.w3.org/2000/svg">
                        <path d="M15.5 8.5v7l4.5 3V5.5l-4.5 3zm-11 7.5h9a1 1 0 001-1v-6a1 1 0 00-1-1H4.5A1.5 1.5 0 003 9.5v5A1.5 1.5 0 004.5 16z"/>
                      </svg>
                    </div>
                    <span className="text-sm font-medium text-foreground">Zoom</span>
                    <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                  </div>
                  {/* Microsoft Teams */}
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-background/60">
                    <div className="w-7 h-7 rounded-md bg-[#5059C9] flex items-center justify-center shadow-sm">
                      <svg viewBox="0 0 24 24" className="w-4 h-4" fill="white" xmlns="http://www.w3.org/2000/svg">
                        <path d="M20 7h-5V5a2 2 0 00-2-2H6a2 2 0 00-2 2v9a2 2 0 002 2h1v2a2 2 0 002 2h9a2 2 0 002-2V9a2 2 0 00-2-2zm-7 9H6V5h7v11zm5 2h-3v-9h3v9z"/>
                      </svg>
                    </div>
                    <span className="text-sm font-medium text-foreground">Teams</span>
                    <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                  </div>
                </div>
              </div>

              <Button onClick={handleSaveAutoJoin} disabled={savingAutoJoin} variant="accent">
                {savingAutoJoin ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Save
              </Button>
            </CardContent>
          </Card>

          {/* Slack Integration */}
          <Card className="glass-card-liquid overflow-hidden">
            <CardHeader className="relative">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-orange-500 to-amber-500" />
              <CardTitle className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-orange-500/10">
                  <Slack className="w-5 h-5 text-orange-500" />
                </div>
                Slack
              </CardTitle>
              <CardDescription>
                Send meeting summaries to your Slack workspace
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {profile?.slack_connected ? (
                    <>
                      <div className="p-2 rounded-full bg-success/10">
                        <CheckCircle className="w-5 h-5 text-success" />
                      </div>
                      <div>
                        <span className="text-foreground font-medium">Connected</span>
                        {profile.slack_channel_name && (
                          <span className="text-muted-foreground ml-2 text-sm">
                            #{profile.slack_channel_name}
                          </span>
                        )}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="p-2 rounded-full bg-muted">
                        <XCircle className="w-5 h-5 text-muted-foreground" />
                      </div>
                      <span className="text-muted-foreground">Not connected</span>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {profile?.slack_connected && (
                    <Button 
                      variant="outline" 
                      className="gap-2"
                      onClick={handleTestSlackConnection}
                      disabled={testingSlack}
                    >
                      {testingSlack ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                      {testingSlack ? 'Sending...' : 'Test'}
                    </Button>
                  )}
                  <Button 
                    variant={profile?.slack_connected ? "outline" : "accent"}
                    className="gap-2"
                    onClick={() => {
                      if (profile?.slack_connected) {
                        handleDisconnectSlack();
                      } else {
                        setSlackDialogOpen(true);
                      }
                    }}
                  >
                    <ExternalLink className="w-4 h-4" />
                    {profile?.slack_connected ? 'Disconnect' : 'Connect'}
                  </Button>
                </div>
              </div>
              <p className="text-sm text-muted-foreground mt-4">
                After each meeting, we'll send a formatted summary with action items, decisions, and key points to your chosen channel.
              </p>
            </CardContent>
          </Card>

          {/* Notification Preferences */}
          <Card className="glass-card-liquid overflow-hidden">
            <CardHeader className="relative">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-orange-500 to-amber-500" />
              <CardTitle className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-purple-500/10">
                  <Sparkles className="w-5 h-5 text-purple-500" />
                </div>
                Notifications
              </CardTitle>
              <CardDescription>
                Configure how you receive updates
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                <div>
                  <p className="font-medium text-foreground">Meeting reminders</p>
                  <p className="text-sm text-muted-foreground">
                    Get notified before scheduled meetings
                  </p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                <div>
                  <p className="font-medium text-foreground">Processing complete</p>
                  <p className="text-sm text-muted-foreground">
                    Notify when transcription and insights are ready
                  </p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                <div>
                  <p className="font-medium text-foreground">Weekly summary</p>
                  <p className="text-sm text-muted-foreground">
                    Receive a weekly digest of your meetings
                  </p>
                </div>
                <Switch />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Slack Connection Dialog */}
      <Dialog open={slackDialogOpen} onOpenChange={setSlackDialogOpen}>
        <DialogContent className="glass-card-liquid">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-orange-500/10">
                <Slack className="w-5 h-5 text-orange-500" />
              </div>
              Connect Slack
            </DialogTitle>
            <DialogDescription>
              Enter the Slack channel where you want to receive meeting summaries.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="channelId">Channel ID</Label>
              <Input
                id="channelId"
                value={slackChannelId}
                onChange={(e) => setSlackChannelId(e.target.value)}
                placeholder="C01234567AB"
                className="bg-white/50"
              />
              <p className="text-xs text-muted-foreground">
                Find this by right-clicking your channel → View channel details → Copy channel ID
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="channelName">Channel Name (optional)</Label>
              <Input
                id="channelName"
                value={slackChannelName}
                onChange={(e) => setSlackChannelName(e.target.value)}
                placeholder="general"
                className="bg-white/50"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSlackDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="accent" onClick={handleConnectSlack} disabled={connectingSlack || !slackChannelId.trim()}>
              {connectingSlack && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Connect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
