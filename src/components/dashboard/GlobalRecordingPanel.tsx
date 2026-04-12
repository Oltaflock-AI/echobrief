import { Button } from '@/components/ui/button';
import { Square, Pause, Play } from 'lucide-react';
import { useRecording } from '@/contexts/RecordingContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface GlobalRecordingPanelProps {
  onRecordingComplete?: (meetingId: string) => void;
}

export function GlobalRecordingPanel({ onRecordingComplete }: GlobalRecordingPanelProps) {
  const { toast } = useToast();
  const {
    isRecording,
    isPaused,
    duration,
    audioLevel,
    meetingId,
    meetingTitle,
    stopRecording,
    pauseRecording,
    resumeRecording,
  } = useRecording();

  if (!isRecording) return null;

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleStopRecording = async () => {
    await stopRecording();
    
    if (meetingId) {
      toast({
        title: 'Recording saved',
        description: 'Your meeting is being processed...',
      });
      
      try {
        await supabase.functions.invoke('process-meeting', {
          body: { meetingId }
        });
      } catch (err) {
        console.error('Processing error:', err);
      }
      
      onRecordingComplete?.(meetingId);
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 animate-in sm:bottom-6 sm:right-6">
      <div className="bg-card rounded-lg shadow-lg border border-border border-l-2 border-l-accent p-4 w-[calc(100vw-2rem)] max-w-[320px] sm:w-auto sm:min-w-[280px]">
        {/* Recording title */}
        {meetingTitle && (
          <p className="text-sm font-medium text-foreground truncate mb-2">
            {meetingTitle}
          </p>
        )}
        
        {/* Recording indicator */}
        <div className="flex items-center gap-3 mb-3">
          <div className="w-2 h-2 rounded-full bg-recording animate-pulse" />
          <span className="text-sm font-medium text-foreground">
            {isPaused ? 'Paused' : 'Recording'}
          </span>
          <span className="ml-auto font-mono text-base font-semibold text-foreground">
            {formatDuration(duration)}
          </span>
        </div>

        {/* Audio level visualization */}
        <div className="flex items-end justify-center gap-0.5 h-6 mb-3">
          {[...Array(16)].map((_, i) => (
            <div
              key={i}
              className={cn(
                'w-1 rounded-full transition-all duration-75',
                !isPaused && audioLevel * 16 > i ? 'bg-accent' : 'bg-muted'
              )}
              style={{
                height: isPaused ? '16%' : `${Math.max(16, Math.random() * audioLevel * 100)}%`,
              }}
            />
          ))}
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={isPaused ? resumeRecording : pauseRecording}
            className="hover:bg-secondary"
          >
            {isPaused ? (
              <Play className="w-4 h-4" />
            ) : (
              <Pause className="w-4 h-4" />
            )}
          </Button>
          <Button
            variant="destructive"
            size="default"
            onClick={handleStopRecording}
            className="gap-2"
          >
            <Square className="w-4 h-4" />
            Stop Recording
          </Button>
        </div>
      </div>
    </div>
  );
}
