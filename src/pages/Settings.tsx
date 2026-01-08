import { useEffect, useState, useCallback } from 'react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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
  ExternalLink
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
  
  // Slack connection dialog
  const [slackDialogOpen, setSlackDialogOpen] = useState(false);
  const [slackChannelId, setSlackChannelId] = useState('');
  const [slackChannelName, setSlackChannelName] = useState('');
  const [connectingSlack, setConnectingSlack] = useState(false);

  // Google Calendar connection
  const [connectingGoogle, setConnectingGoogle] = useState(false);
  const [googleClientId, setGoogleClientId] = useState<string | null>(null);

  // Handle OAuth callback code from URL
  const handleOAuthCallback = useCallback(async (code: string) => {
    if (!session?.access_token) return;
    
    setConnectingGoogle(true);
    try {
      const redirectUri = `${window.location.origin}/settings`;
      
      const response = await fetch(`${SUPABASE_URL}/functions/v1/google-oauth-callback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ code, redirectUri }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to connect Google Calendar');
      }

      setProfile(prev => prev ? { ...prev, google_calendar_connected: true } : null);
      toast({
        title: 'Connected!',
        description: 'Google Calendar is now syncing your events',
      });
      
      // Clean up URL
      window.history.replaceState({}, '', '/settings');
    } catch (error: any) {
      console.error('OAuth callback error:', error);
      toast({
        title: 'Connection Failed',
        description: error.message || 'Failed to connect Google Calendar',
        variant: 'destructive',
      });
    } finally {
      setConnectingGoogle(false);
    }
  }, [session, toast]);

  useEffect(() => {
    // Check for OAuth callback code in URL
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    if (code && session) {
      handleOAuthCallback(code);
    }
  }, [session, handleOAuthCallback]);

  // Fetch Google Client ID on mount
  useEffect(() => {
    const fetchGoogleClientId = async () => {
      try {
        const response = await fetch(`${SUPABASE_URL}/functions/v1/get-google-client-id`);
        const data = await response.json();
        if (data.clientId) {
          setGoogleClientId(data.clientId);
        }
      } catch (error) {
        console.error('Failed to fetch Google Client ID:', error);
      }
    };
    fetchGoogleClientId();
  }, []);

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
  }, [user]);

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

  const handleConnectGoogle = () => {
    if (!googleClientId) {
      toast({
        title: 'Configuration Error',
        description: 'Google Client ID is not configured',
        variant: 'destructive',
      });
      return;
    }

    const redirectUri = `${window.location.origin}/settings`;
    const scope = 'https://www.googleapis.com/auth/calendar.readonly';
    
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', googleClientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', scope);
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent');
    
    window.location.href = authUrl.toString();
  };

  const handleDisconnectGoogle = async () => {
    if (!user) return;

    const { error } = await supabase
      .from('profiles')
      .update({ 
        google_calendar_connected: false,
        google_access_token: null,
        google_refresh_token: null,
        google_token_expiry: null,
      })
      .eq('user_id', user.id);

    if (error) {
      toast({
        title: 'Error',
        description: 'Failed to disconnect Google Calendar',
        variant: 'destructive',
      });
    } else {
      setProfile(prev => prev ? { ...prev, google_calendar_connected: false } : null);
      toast({
        title: 'Disconnected',
        description: 'Google Calendar integration has been removed',
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
      <div className="p-8 max-w-4xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground">Settings</h1>
          <p className="text-muted-foreground mt-1">
            Manage your account and integrations
          </p>
        </div>

        <div className="space-y-6">
          {/* Profile Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="w-5 h-5" />
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
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  value={user?.email || ''}
                  disabled
                  className="bg-muted"
                />
              </div>
              <Button onClick={handleSaveProfile} disabled={saving}>
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : null}
                Save Changes
              </Button>
            </CardContent>
          </Card>

          {/* Google Calendar Integration */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="w-5 h-5" />
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
                      <CheckCircle className="w-5 h-5 text-green-500" />
                      <span className="text-foreground">Connected</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-5 h-5 text-muted-foreground" />
                      <span className="text-muted-foreground">Not connected</span>
                    </>
                  )}
                </div>
                <Button 
                  variant="outline" 
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

          {/* Slack Integration */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Slack className="w-5 h-5" />
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
                      <CheckCircle className="w-5 h-5 text-green-500" />
                      <div>
                        <span className="text-foreground">Connected</span>
                        {profile.slack_channel_name && (
                          <span className="text-muted-foreground ml-2">
                            #{profile.slack_channel_name}
                          </span>
                        )}
                      </div>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-5 h-5 text-muted-foreground" />
                      <span className="text-muted-foreground">Not connected</span>
                    </>
                  )}
                </div>
                <Button 
                  variant="outline" 
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
              <p className="text-sm text-muted-foreground mt-4">
                After each meeting, we'll send a formatted summary with action items, decisions, and key points to your chosen channel.
              </p>
            </CardContent>
          </Card>

          {/* Notification Preferences */}
          <Card>
            <CardHeader>
              <CardTitle>Notifications</CardTitle>
              <CardDescription>
                Configure how you receive updates
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-foreground">Meeting reminders</p>
                  <p className="text-sm text-muted-foreground">
                    Get notified before scheduled meetings
                  </p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-foreground">Processing complete</p>
                  <p className="text-sm text-muted-foreground">
                    Notify when transcription and insights are ready
                  </p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between">
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Slack className="w-5 h-5" />
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
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSlackDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleConnectSlack} disabled={connectingSlack || !slackChannelId.trim()}>
              {connectingSlack && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Connect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </DashboardLayout>
  );
}
