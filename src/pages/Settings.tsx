import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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

interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  google_calendar_connected: boolean;
  slack_connected: boolean;
  slack_channel_name: string | null;
}

export default function Settings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fullName, setFullName] = useState('');

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
                      <CheckCircle className="w-5 h-5 text-success" />
                      <span className="text-foreground">Connected</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-5 h-5 text-muted-foreground" />
                      <span className="text-muted-foreground">Not connected</span>
                    </>
                  )}
                </div>
                <Button variant="outline" className="gap-2">
                  <ExternalLink className="w-4 h-4" />
                  {profile?.google_calendar_connected ? 'Disconnect' : 'Connect'}
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
                      <CheckCircle className="w-5 h-5 text-success" />
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
                <Button variant="outline" className="gap-2">
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
    </DashboardLayout>
  );
}
