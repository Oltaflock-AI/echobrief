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
import { Mic, Loader2, Bot } from 'lucide-react';
import { useRecording } from '@/contexts/RecordingContext';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import type { Json } from '@/integrations/supabase/types';

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
}

export function RecordingButton({ 
  prefillTitle, 
  calendarEventId, 
  meetingLink: propMeetingLink,
  attendees 
}: RecordingButtonProps) {
  const [showDialog, setShowDialog] = useState(false);
  const [meetingTitle, setMeetingTitle] = useState(prefillTitle || '');
  const [isStarting, setIsStarting] = useState(false);
  const [recordingMode, setRecordingMode] = useState<'browser' | 'bot'>('browser');
  const [meetingUrl, setMeetingUrl] = useState(propMeetingLink || '');
  const [notetakerName, setNotetakerName] = useState('EchoBrief Notetaker');
  const { user } = useAuth();
  const { toast } = useToast();

  // Fetch notetaker name from user preferences
  useEffect(() => {
    if (!user) return;
    const fetchPrefs = async () => {
      const { data } = await supabase
        .from('notification_preferences')
        .select('notetaker_name')
        .eq('user_id', user.id)
        .maybeSingle();
      if (data?.notetaker_name) {
        setNotetakerName(data.notetaker_name);
      }
    };
    fetchPrefs();
  }, [user]);

  const {
    isRecording,
    startRecording,
    error,
    permissionStatus,
  } = useRecording();

  useEffect(() => {
    if (prefillTitle && !isRecording) {
      setMeetingTitle(prefillTitle);
      setShowDialog(true);
    }
  }, [prefillTitle, isRecording]);

  const handleStartRecording = async () => {
    if (!user) return;
    
    setIsStarting(true);
    
    try {
      const title = meetingTitle || `Meeting ${new Date().toLocaleDateString()}`;

      if (recordingMode === 'bot') {
        if (!meetingUrl) {
          throw new Error('Please enter a meeting URL');
        }
        
        const { data, error: botError } = await supabase.functions.invoke('start-recall-recording', {
          body: { meeting_url: meetingUrl, user_id: user.id, title: title }
        });

        if (botError) throw botError;
        if (data?.error) throw new Error(data.error);

        toast({ title: 'Bot started', description: `Bot is joining the meeting` });
        setShowDialog(false);
      } else {
        const meetingData = {
          user_id: user.id,
          title,
          source: calendarEventId ? 'calendar' : 'manual',
          calendar_event_id: calendarEventId || null,
          meeting_link: meetingUrl || null,
          attendees: (attendees || []) as unknown as Json,
          status: 'recording',
          start_time: new Date().toISOString(),
        };
        
        const { data: meeting, error: meetingError } = await supabase
          .from('meetings')
          .insert(meetingData)
          .select()
          .single();

        if (meetingError) throw meetingError;

        await startRecording(meeting.id, title);
        setShowDialog(false);
        setMeetingTitle('');
      }
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message || 'Failed to start recording',
        variant: 'destructive',
      });
    } finally {
      setIsStarting(false);
    }
  };

  if (isRecording) {
    return null;
  }

  return (
    <>
      <Button
        variant="recording"
        onClick={() => setShowDialog(true)}
        className="gap-2"
      >
        <Mic className="w-4 h-4" />
        Record
      </Button>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Start New Recording</DialogTitle>
            <DialogDescription>
              Choose how you want to record your meeting.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="flex gap-2">
              <Button 
                variant={recordingMode === 'browser' ? 'default' : 'outline'}
                className="flex-1"
                onClick={() => setRecordingMode('browser')}
              >
                Extension
              </Button>
              <Button 
                variant={recordingMode === 'bot' ? 'default' : 'outline'}
                className="flex-1"
                onClick={() => setRecordingMode('bot')}
              >
                Bot (No Screen Share)
              </Button>
            </div>

            <div className="space-y-2">
              <Label htmlFor="meeting-title">Meeting Title</Label>
              <Input
                id="meeting-title"
                placeholder="Weekly standup, Client call..."
                value={meetingTitle}
                onChange={(e) => setMeetingTitle(e.target.value)}
              />
            </div>

            {recordingMode === 'bot' && (
              <div className="space-y-2">
                <Label htmlFor="meeting-url">Meeting URL</Label>
                <Input
                  id="meeting-url"
                  placeholder="https://meet.google.com/..."
                  value={meetingUrl}
                  onChange={(e) => setMeetingUrl(e.target.value)}
                />
              </div>
            )}

            {recordingMode === 'browser' && permissionStatus === 'denied' && (
              <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">
                Microphone access is required. Please enable it in your browser settings.
              </div>
            )}

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
