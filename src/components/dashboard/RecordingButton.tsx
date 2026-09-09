import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogDescription 
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Mic, Loader2, Check } from 'lucide-react';
import { parseMeetingUrl, PLATFORM_LABELS } from '@/lib/meetingUrl';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useStartRecording } from '@/hooks/useStartRecording';

interface CalendarAttendee {
  email: string;
  displayName?: string | null;
  responseStatus?: string | null;
  organizer?: boolean;
}

interface RecordingButtonProps {
  onRecordingComplete?: (meetingId: string) => void;
  prefillTitle?: string;
  calendarEventId?: string;
  meetingLink?: string;
  attendees?: CalendarAttendee[];
  /**
   * Draw a different trigger and keep this component's dialog and start logic.
   * The V2 shell passes the Console split button; omitting it keeps the V1
   * button exactly as it was, so no existing call site changes.
   */
  renderTrigger?: (open: () => void) => React.ReactNode;
}

export function RecordingButton({ 
  prefillTitle, 
  calendarEventId, 
  meetingLink: propMeetingLink,
  attendees,
  renderTrigger,
}: RecordingButtonProps) {
  const [showDialog, setShowDialog] = useState(false);
  const [meetingTitle, setMeetingTitle] = useState(prefillTitle || '');
  const [meetingUrl, setMeetingUrl] = useState(propMeetingLink || '');
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();
  const { toast } = useToast();
  const { start, isStarting } = useStartRecording();

  useEffect(() => {
    if (prefillTitle) {
      setMeetingTitle(prefillTitle);
      setShowDialog(true);
    }
  }, [prefillTitle]);

  const handleStartRecording = async () => {
    if (!user) return;
    setError(null);
    const message = await start({
      meetingUrl,
      title: meetingTitle,
      calendarEventId,
    });
    if (message) {
      setError(message);
      toast({ title: 'Error', description: message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Bot started', description: 'Bot is joining the meeting' });
    setShowDialog(false);
  };

  // Named as you type, so it is obvious before pressing Start that a Zoom or
  // Teams link is accepted.
  const urlCheck = parseMeetingUrl(meetingUrl);
  const detected = urlCheck.platform;

  return (
    <>
      {renderTrigger ? (
        renderTrigger(() => setShowDialog(true))
      ) : (
        <Button
          variant="recording"
          onClick={() => setShowDialog(true)}
          className="gap-2"
        >
          <Mic className="w-4 h-4" />
          Record
        </Button>
      )}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Start New Recording</DialogTitle>
            <DialogDescription>
              Enter your meeting details to start recording.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="meeting-title">Meeting Title</Label>
              <Input
                id="meeting-title"
                placeholder="Weekly standup, Client call..."
                value={meetingTitle}
                onChange={(e) => setMeetingTitle(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="meeting-url">Meeting link</Label>
              <Input
                id="meeting-url"
                placeholder="Paste a Google Meet, Zoom or Teams link"
                value={meetingUrl}
                onChange={(e) => setMeetingUrl(e.target.value)}
                aria-describedby="meeting-url-hint"
              />
              <p id="meeting-url-hint" className="text-xs text-muted-foreground">
                {detected ? (
                  <span className="inline-flex items-center gap-1.5 text-foreground">
                    <Check className="h-3.5 w-3.5" style={{ color: 'var(--ok)' }} />
                    {PLATFORM_LABELS[detected]} link recognised
                  </span>
                ) : (
                  'Works with Google Meet, Zoom and Microsoft Teams.'
                )}
              </p>
            </div>

            {error && (
              <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">
                {error}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setShowDialog(false)}>
              Cancel
            </Button>
            <Button 
              variant="recording" 
              onClick={handleStartRecording}
              disabled={isStarting}
            >
              {isStarting ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Mic className="w-4 h-4 mr-2" />
              )}
              Start
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
