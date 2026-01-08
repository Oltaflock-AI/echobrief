import { Card, CardContent } from '@/components/ui/card';
import { Video, Clock, FileText, CheckCircle } from 'lucide-react';

interface StatsCardsProps {
  totalMeetings: number;
  totalDuration: number;
  transcriptCount: number;
  completedCount: number;
}

export function StatsCards({ 
  totalMeetings, 
  totalDuration, 
  transcriptCount, 
  completedCount 
}: StatsCardsProps) {
  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  };

  const stats = [
    {
      icon: Video,
      label: 'Total Meetings',
      value: totalMeetings.toString(),
      color: 'text-accent',
      bgColor: 'bg-accent/10',
    },
    {
      icon: Clock,
      label: 'Recording Time',
      value: formatDuration(totalDuration),
      color: 'text-primary',
      bgColor: 'bg-primary/10',
    },
    {
      icon: FileText,
      label: 'Transcripts',
      value: transcriptCount.toString(),
      color: 'text-success',
      bgColor: 'bg-success/10',
    },
    {
      icon: CheckCircle,
      label: 'Completed',
      value: completedCount.toString(),
      color: 'text-warning',
      bgColor: 'bg-warning/10',
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((stat) => (
        <Card key={stat.label} className="border-border">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-xl ${stat.bgColor} flex items-center justify-center`}>
                <stat.icon className={`w-6 h-6 ${stat.color}`} />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
                <p className="text-2xl font-bold text-foreground">{stat.value}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
