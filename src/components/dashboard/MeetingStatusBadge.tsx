import { Clock, Mic, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

type MeetingStatus = 'scheduled' | 'upcoming' | 'recording' | 'processing' | 'completed' | 'failed';

interface MeetingStatusBadgeProps {
  status: string;
  className?: string;
  showLabel?: boolean;
}

const statusConfig: Record<MeetingStatus, { 
  icon: typeof Clock; 
  label: string; 
  dotClass: string;
  textClass: string;
}> = {
  scheduled: {
    icon: Clock,
    label: 'Scheduled',
    dotClass: 'bg-muted-foreground',
    textClass: 'text-muted-foreground',
  },
  upcoming: {
    icon: Clock,
    label: 'Upcoming',
    dotClass: 'bg-orange-500',
    textClass: 'text-orange-500',
  },
  recording: {
    icon: Mic,
    label: 'Recording',
    // Recording stays green (#22C55E) per brand spec
    dotClass: 'bg-green-500 animate-pulse',
    textClass: 'text-green-500',
  },
  processing: {
    icon: Loader2,
    label: 'Processing',
    // Processing stays blue (#3B82F6) per brand spec
    dotClass: 'bg-blue-500',
    textClass: 'text-blue-500',
  },
  completed: {
    icon: CheckCircle,
    label: 'Completed',
    // Completed → orange-500 per brand spec
    dotClass: 'bg-orange-500',
    textClass: 'text-orange-500',
  },
  failed: {
    icon: AlertCircle,
    label: 'Failed',
    // Failed → red (#EF4444) per brand spec
    dotClass: 'bg-red-500',
    textClass: 'text-red-500',
  },
};

export function MeetingStatusBadge({ status, className, showLabel = false }: MeetingStatusBadgeProps) {
  const config = statusConfig[status as MeetingStatus] || statusConfig.scheduled;
  const Icon = config.icon;

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <span className={cn('w-2 h-2 rounded-full', config.dotClass)} />
      {showLabel && (
        <span className={cn('text-xs font-medium', config.textClass)}>
          {config.label}
        </span>
      )}
    </div>
  );
}
