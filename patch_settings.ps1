$path = "C:\Users\Administrator\Projects\echobrief\src\pages\Settings.tsx"
$content = [System.IO.File]::ReadAllText($path)

# 1. Add Select import after Switch import
$old1 = "import { Switch } from '@/components/ui/switch';"
$new1 = @"
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
"@
$content = $content.Replace($old1, $new1)

# 2. Add Bot to lucide-react imports
$old2 = "  Lock
} from 'lucide-react';"
$new2 = "  Lock,
  Bot,
} from 'lucide-react';"
$content = $content.Replace($old2, $new2)

# 3. Add NotificationPreferences interface and state after Profile interface
$old3 = "export default function Settings() {"
$new3 = @"
interface NotificationPreferences {
  id?: string;
  user_id?: string;
  auto_record: boolean;
  notetaker_name: string;
  join_minutes_before: number;
  preferred_language: string;
}

export default function Settings() {
"@
$content = $content.Replace($old3, $new3)

# 4. Add autoJoin state after saving state
$old4 = "  const [saving, setSaving] = useState(false);
  const [fullName, setFullName] = useState('');"
$new4 = @"
  const [saving, setSaving] = useState(false);
  const [fullName, setFullName] = useState('');

  // Auto-Join Settings
  const [autoJoinPrefs, setAutoJoinPrefs] = useState<NotificationPreferences>({
    auto_record: false,
    notetaker_name: 'EchoBrief Notetaker',
    join_minutes_before: 2,
    preferred_language: 'English',
  });
  const [savingAutoJoin, setSavingAutoJoin] = useState(false);
"@
$content = $content.Replace($old4, $new4)

# 5. Add fetch for notification_preferences after fetchProfile in useEffect
$old5 = "    fetchProfile();
  }, [user]);"
$new5 = @"
    fetchProfile();

    const fetchNotifPrefs = async () => {
      const { data } = await (supabase as any)
        .from('notification_preferences')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      if (data) {
        setAutoJoinPrefs({
          auto_record: data.auto_record ?? false,
          notetaker_name: data.notetaker_name ?? 'EchoBrief Notetaker',
          join_minutes_before: data.join_minutes_before ?? 2,
          preferred_language: data.preferred_language ?? 'English',
        });
      }
    };
    fetchNotifPrefs();
  }, [user]);
"@
$content = $content.Replace($old5, $new5)

# 6. Add handleSaveAutoJoin function before handleConnectSlack
$old6 = "  const handleConnectSlack = async () => {"
$new6 = @"
  const handleSaveAutoJoin = async () => {
    if (!user) return;
    setSavingAutoJoin(true);
    const { error } = await (supabase as any)
      .from('notification_preferences')
      .upsert({
        user_id: user.id,
        auto_record: autoJoinPrefs.auto_record,
        notetaker_name: autoJoinPrefs.notetaker_name,
        join_minutes_before: autoJoinPrefs.join_minutes_before,
        preferred_language: autoJoinPrefs.preferred_language,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });

    if (error) {
      toast({ title: 'Error', description: 'Failed to save auto-join settings', variant: 'destructive' });
    } else {
      toast({ title: 'Saved', description: 'Auto-join settings updated' });
    }
    setSavingAutoJoin(false);
  };

  const handleConnectSlack = async () => {
"@
$content = $content.Replace($old6, $new6)

# 7. Insert Auto-Join Settings card between Google Calendar card and Slack card
$old7 = "          {/* Slack Integration */}"
$new7 = @"
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
                  checked={autoJoinPrefs.auto_record}
                  onCheckedChange={(checked) =>
                    setAutoJoinPrefs((prev) => ({ ...prev, auto_record: checked }))
                  }
                />
              </div>

              {/* Notetaker display name */}
              <div className="space-y-2">
                <Label htmlFor="notetaker-name">Notetaker display name</Label>
                <Input
                  id="notetaker-name"
                  value={autoJoinPrefs.notetaker_name}
                  onChange={(e) =>
                    setAutoJoinPrefs((prev) => ({ ...prev, notetaker_name: e.target.value }))
                  }
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
                  value={String(autoJoinPrefs.join_minutes_before)}
                  onValueChange={(val) =>
                    setAutoJoinPrefs((prev) => ({ ...prev, join_minutes_before: Number(val) }))
                  }
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
                  value={autoJoinPrefs.preferred_language}
                  onValueChange={(val) =>
                    setAutoJoinPrefs((prev) => ({ ...prev, preferred_language: val }))
                  }
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
                <div className="flex items-center gap-4 p-3 rounded-lg bg-muted/30">
                  {/* Google Meet */}
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center shadow-sm">
                      <svg viewBox="0 0 48 48" className="w-5 h-5" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M29 24c0 2.76-2.24 5-5 5s-5-2.24-5-5 2.24-5 5-5 5 2.24 5 5z" fill="#00AC47"/>
                        <path d="M34 14H14c-2.21 0-4 1.79-4 4v12c0 2.21 1.79 4 4 4h20c2.21 0 4-1.79 4-4V18c0-2.21-1.79-4-4-4z" fill="#00AC47" fillOpacity=".2"/>
                        <path d="M38 20l-8 4 8 4V20z" fill="#00AC47"/>
                        <rect x="10" y="14" width="24" height="20" rx="4" fill="none" stroke="#00AC47" strokeWidth="2"/>
                      </svg>
                    </div>
                    <span className="text-sm font-medium text-foreground">Google Meet</span>
                    <CheckCircle className="w-4 h-4 text-green-500" />
                  </div>
                  {/* Zoom */}
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-[#2D8CFF] flex items-center justify-center shadow-sm">
                      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="white" xmlns="http://www.w3.org/2000/svg">
                        <path d="M15.5 8.5v7l4.5 3V5.5l-4.5 3zm-11 7.5h9a1 1 0 001-1v-6a1 1 0 00-1-1H4.5A1.5 1.5 0 003 9.5v5A1.5 1.5 0 004.5 16z"/>
                      </svg>
                    </div>
                    <span className="text-sm font-medium text-foreground">Zoom</span>
                    <CheckCircle className="w-4 h-4 text-green-500" />
                  </div>
                  {/* Microsoft Teams */}
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-[#5059C9] flex items-center justify-center shadow-sm">
                      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="white" xmlns="http://www.w3.org/2000/svg">
                        <path d="M20 7h-5V5a2 2 0 00-2-2H6a2 2 0 00-2 2v9a2 2 0 002 2h1v2a2 2 0 002 2h9a2 2 0 002-2V9a2 2 0 00-2-2zm-7 9H6V5h7v11zm5 2h-3v-9h3v9z"/>
                      </svg>
                    </div>
                    <span className="text-sm font-medium text-foreground">Teams</span>
                    <CheckCircle className="w-4 h-4 text-green-500" />
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
"@
$content = $content.Replace($old7, $new7)

[System.IO.File]::WriteAllText($path, $content, [System.Text.Encoding]::UTF8)
Write-Host "Done patching Settings.tsx"
