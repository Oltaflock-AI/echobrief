import { Link } from 'react-router-dom';
import { Meeting } from '@/types/meeting';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Video, 
  Clock, 
  Calendar,
  ChevronRight,
  FileText,
  Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface MeetingCardProps {
  meeting: Meeting;
}

const sourceIcons: Record<string, typeof Video> = {
  google_meet: Video,
  zoom: Video,
  teams: Video,
  manual: Video,
  calendar: Calendar,
};

const statusConfig: Record<string, { label: string; className: string; icon?: typeof Loader2 }> = {
  scheduled: { label: 'Scheduled', className: 'bg-muted text-muted-foreground' },
  // Recording = green (#22C55E) per brand spec
  recording: { label: 'Recording', className: 'bg-green-500/10 text-green-500 border border-green-500/20 animate-pulse' },
  // Processing = blue (#3B82F6) per brand spec
  processing: { label: 'Processing', className: 'bg-blue-500/10 text-blue-500 border border-blue-500/20', icon: Loader2 },
  // Completed = orange-500 per brand spec
  completed: { label: 'Completed', className: 'bg-orange-500/10 text-orange-500 border border-orange-500/20' },
  // Failed = red (#EF4444) per brand spec
  failed: { label: 'Failed', className: 'bg-red-500/10 text-red-500 border border-red-500/20' },
};

export function MeetingCard({ meeting }: MeetingCardProps) {
  const SourceIcon = sourceIcons[meeting.source] || Video;
  const status = statusConfig[meeting.status];
  const StatusIcon = status.icon;

  const formatDuration = (seconds?: number) => {
    if (!seconds) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  return (
    <Link to={`/meeting/${meeting.id}`}>
      <Card className={cn(
        "group transition-all duration-150 cursor-pointer border border-border bg-card",
        "hover:bg-secondary hover:border-border",
        meeting.status === 'recording' && "border-l-2 border-l-recording"
      )}>
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              {/* Source icon */}
              <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0">
                <SourceIcon className="w-5 h-5 text-muted-foreground" />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-foreground truncate group-hover:text-orange-400 transition-colors">
                  {meeting.title}
                </h3>
                
                <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    {format(new Date(meeting.start_time), 'MMM d, yyyy')}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    {format(new Date(meeting.start_time), 'h:mm a')}
                  </span>
                  {meeting.duration_seconds && (
                    <span className="flex items-center gap-1">
                      <FileText className="w-3.5 h-3.5" />
                      {formatDuration(meeting.duration_seconds)}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Status & Arrow */}
            <div className="flex items-center gap-3">
              <Badge className={cn('gap-1', status.className)}>
                {StatusIcon && <StatusIcon className="w-3 h-3 animate-spin" />}
                {status.label}
              </Badge>
              <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-orange-400 transition-colors" />
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
