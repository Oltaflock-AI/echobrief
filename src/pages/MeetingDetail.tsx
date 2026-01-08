import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Meeting, Transcript, MeetingInsights } from '@/types/meeting';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ArrowLeft,
  Calendar,
  Clock,
  FileText,
  CheckCircle,
  AlertTriangle,
  Users,
  Loader2,
  MessageSquare,
  ListChecks,
  Lightbulb,
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

export default function MeetingDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [insights, setInsights] = useState<MeetingInsights | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !id) return;

    const fetchMeetingData = async () => {
      // Fetch meeting
      const { data: meetingData } = await supabase
        .from('meetings')
        .select('*')
        .eq('id', id)
        .eq('user_id', user.id)
        .single();

      if (meetingData) {
        setMeeting(meetingData as Meeting);

        // Fetch transcript
        const { data: transcriptData } = await supabase
          .from('transcripts')
          .select('*')
          .eq('meeting_id', id)
          .single();

        if (transcriptData) {
          setTranscript(transcriptData as Transcript);
        }

        // Fetch insights
        const { data: insightsData } = await supabase
          .from('meeting_insights')
          .select('*')
          .eq('meeting_id', id)
          .single();

        if (insightsData) {
          setInsights(insightsData as MeetingInsights);
        }
      }

      setLoading(false);
    };

    fetchMeetingData();
  }, [user, id]);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  if (!meeting) {
    return (
      <DashboardLayout>
        <div className="p-8">
          <p>Meeting not found</p>
        </div>
      </DashboardLayout>
    );
  }

  const formatDuration = (seconds?: number) => {
    if (!seconds) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  return (
    <DashboardLayout>
      <div className="p-8">
        {/* Back button */}
        <Link to="/dashboard">
          <Button variant="ghost" className="mb-6 gap-2">
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </Button>
        </Link>

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold text-foreground mb-2">{meeting.title}</h1>
              <div className="flex items-center gap-4 text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  {format(new Date(meeting.start_time), 'MMMM d, yyyy')}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  {format(new Date(meeting.start_time), 'h:mm a')}
                </span>
                {meeting.duration_seconds && (
                  <span className="flex items-center gap-1">
                    <FileText className="w-4 h-4" />
                    {formatDuration(meeting.duration_seconds)}
                  </span>
                )}
              </div>
            </div>
            <Badge
              className={cn(
                meeting.status === 'completed' && 'bg-success text-success-foreground',
                meeting.status === 'processing' && 'bg-warning text-warning-foreground',
                meeting.status === 'recording' && 'bg-recording text-recording-foreground',
                meeting.status === 'failed' && 'bg-destructive text-destructive-foreground'
              )}
            >
              {meeting.status}
            </Badge>
          </div>
        </div>

        {/* Content Tabs */}
        <Tabs defaultValue="insights" className="space-y-6">
          <TabsList>
            <TabsTrigger value="insights" className="gap-2">
              <Lightbulb className="w-4 h-4" />
              Insights
            </TabsTrigger>
            <TabsTrigger value="transcript" className="gap-2">
              <MessageSquare className="w-4 h-4" />
              Transcript
            </TabsTrigger>
          </TabsList>

          <TabsContent value="insights">
            {insights ? (
              <div className="grid gap-6 lg:grid-cols-2">
                {/* Summary */}
                <Card className="lg:col-span-2">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="w-5 h-5 text-accent" />
                      Summary
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-foreground mb-4">{insights.summary_short}</p>
                    <p className="text-muted-foreground">{insights.summary_detailed}</p>
                  </CardContent>
                </Card>

                {/* Action Items */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <ListChecks className="w-5 h-5 text-accent" />
                      Action Items
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {insights.action_items && insights.action_items.length > 0 ? (
                      <ul className="space-y-3">
                        {insights.action_items.map((item: any, index: number) => (
                          <li key={index} className="flex items-start gap-3">
                            <CheckCircle className="w-5 h-5 text-success flex-shrink-0 mt-0.5" />
                            <div>
                              <p className="text-foreground">{item.task}</p>
                              {item.owner && (
                                <p className="text-sm text-muted-foreground">
                                  Owner: {item.owner}
                                </p>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-muted-foreground">No action items identified</p>
                    )}
                  </CardContent>
                </Card>

                {/* Key Decisions */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Lightbulb className="w-5 h-5 text-warning" />
                      Key Decisions
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {insights.decisions && insights.decisions.length > 0 ? (
                      <ul className="space-y-2">
                        {insights.decisions.map((decision: string, index: number) => (
                          <li key={index} className="flex items-start gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-warning mt-2 flex-shrink-0" />
                            <span className="text-foreground">{decision}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-muted-foreground">No key decisions recorded</p>
                    )}
                  </CardContent>
                </Card>

                {/* Risks */}
                {insights.risks && insights.risks.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5 text-destructive" />
                        Risks & Blockers
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2">
                        {insights.risks.map((risk: string, index: number) => (
                          <li key={index} className="flex items-start gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-destructive mt-2 flex-shrink-0" />
                            <span className="text-foreground">{risk}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                )}

                {/* Follow-ups */}
                {insights.follow_ups && insights.follow_ups.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Users className="w-5 h-5 text-primary" />
                        Follow-ups
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2">
                        {insights.follow_ups.map((followUp: any, index: number) => (
                          <li key={index} className="flex items-start gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
                            <span className="text-foreground">{followUp.description}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                )}
              </div>
            ) : meeting.status === 'processing' ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Loader2 className="w-12 h-12 animate-spin text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-foreground mb-2">
                    Generating insights...
                  </h3>
                  <p className="text-muted-foreground">
                    Our AI is analyzing your meeting. This usually takes a few minutes.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="py-12 text-center">
                  <p className="text-muted-foreground">No insights available yet</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="transcript">
            <Card>
              <CardHeader>
                <CardTitle>Full Transcript</CardTitle>
              </CardHeader>
              <CardContent>
                {transcript ? (
                  <div className="prose prose-sm max-w-none">
                    <p className="whitespace-pre-wrap text-foreground leading-relaxed">
                      {transcript.content}
                    </p>
                  </div>
                ) : meeting.status === 'processing' ? (
                  <div className="py-12 text-center">
                    <Loader2 className="w-12 h-12 animate-spin text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">Transcribing your meeting...</p>
                  </div>
                ) : (
                  <p className="text-muted-foreground py-12 text-center">
                    No transcript available
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
