import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { SlackDeliverySelector } from '@/components/dashboard/SlackDeliverySelector';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Meeting, Transcript, MeetingInsights, StrategicInsight, SpeakerHighlight, ActionItem, FollowUp } from '@/types/meeting';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ArrowLeft, Calendar, Clock, Loader2, ChevronRight, Trash2, Users, Send, Lightbulb, AlertTriangle, HelpCircle, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';

interface SpeakerSegment {
  speaker: string;
  text: string;
  start?: number;
  end?: number;
}

interface Attendee {
  email: string;
  displayName?: string | null;
  responseStatus?: string | null;
  organizer?: boolean;
}

export default function MeetingDetail() {
  const { id } = useParams<{ id: string }>();
  const { user, session } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [speakerSegments, setSpeakerSegments] = useState<SpeakerSegment[]>([]);
  const [insights, setInsights] = useState<MeetingInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [slackDialogOpen, setSlackDialogOpen] = useState(false);
  const [slackChannelId, setSlackChannelId] = useState<string | undefined>();
  const [slackChannelName, setSlackChannelName] = useState<string | undefined>();

  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

  useEffect(() => {
    if (!user || !id) return;

    const fetchMeetingData = async () => {
      const { data: meetingData } = await supabase
        .from('meetings')
        .select('*')
        .eq('id', id)
        .eq('user_id', user.id)
        .single();

      if (meetingData) {
        setMeeting(meetingData as Meeting);
        
        // Parse attendees from meeting data
        if (meetingData.attendees && Array.isArray(meetingData.attendees)) {
          setAttendees(meetingData.attendees as unknown as Attendee[]);
        }

        const { data: transcriptData } = await supabase
          .from('transcripts')
          .select('*')
          .eq('meeting_id', id)
          .single();

        if (transcriptData) {
          setTranscript({
            ...transcriptData,
            speakers: (transcriptData.speakers as any) || [],
            word_timestamps: (transcriptData.word_timestamps as any) || [],
          } as Transcript);
          
          // Set speaker segments if available
          if (transcriptData.speakers && Array.isArray(transcriptData.speakers)) {
            setSpeakerSegments(transcriptData.speakers as unknown as SpeakerSegment[]);
          }
        }

        const { data: insightsData } = await supabase
          .from('meeting_insights')
          .select('*')
          .eq('meeting_id', id)
          .single();

        if (insightsData) {
          setInsights({
            ...insightsData,
            key_points: (insightsData.key_points as any) || [],
            action_items: (insightsData.action_items as any) || [],
            decisions: (insightsData.decisions as any) || [],
            risks: (insightsData.risks as any) || [],
            follow_ups: (insightsData.follow_ups as any) || [],
            strategic_insights: (insightsData.strategic_insights as any) || [],
            speaker_highlights: (insightsData.speaker_highlights as any) || [],
            open_questions: (insightsData.open_questions as any) || [],
            summary_short: insightsData.summary_short || '',
            summary_detailed: insightsData.summary_detailed || '',
          } as MeetingInsights);
        }

        // Get Slack settings
        const { data: profile } = await supabase
          .from('profiles')
          .select('slack_channel_id, slack_channel_name')
          .eq('user_id', user.id)
          .single();

        if (profile) {
          setSlackChannelId(profile.slack_channel_id || undefined);
          setSlackChannelName(profile.slack_channel_name || undefined);
        }
      }

      setLoading(false);
    };

    fetchMeetingData();
  }, [user, id]);

  const handleDelete = async () => {
    if (!meeting || !user) return;
    
    setDeleting(true);
    try {
      // Delete related data first
      await supabase.from('meeting_insights').delete().eq('meeting_id', meeting.id);
      await supabase.from('transcripts').delete().eq('meeting_id', meeting.id);
      await supabase.from('slack_messages').delete().eq('meeting_id', meeting.id);
      
      // Delete audio file from storage if exists
      if (meeting.audio_url) {
        await supabase.storage.from('recordings').remove([meeting.audio_url]);
      }
      
      // Delete the meeting
      const { error } = await supabase
        .from('meetings')
        .delete()
        .eq('id', meeting.id)
        .eq('user_id', user.id);
      
      if (error) throw error;
      
      toast({
        title: 'Meeting deleted',
        description: 'The meeting and all related data have been removed.',
      });
      
      navigate('/dashboard');
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message || 'Failed to delete meeting',
        variant: 'destructive',
      });
    } finally {
      setDeleting(false);
    }
  };

  const getInitials = (name?: string | null, email?: string) => {
    if (name) {
      return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
    }
    if (email) {
      return email.slice(0, 2).toUpperCase();
    }
    return '??';
  };

  const handleSendToSlack = async (destination: { type: 'dm' | 'channel'; channelId: string; channelName?: string }) => {
    if (!meeting || !session?.access_token) return;

    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/process-meeting`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          meetingId: meeting.id,
          slackDestination: destination,
        }),
      });

      const data = await response.json();

      if (data.slackSent) {
        toast({
          title: 'Sent to Slack',
          description: `Summary sent to ${destination.channelName || destination.channelId}`,
        });
      } else {
        throw new Error('Failed to send');
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to send summary to Slack',
        variant: 'destructive',
      });
    }
  };

  const getPriorityColor = (priority?: string) => {
    switch (priority) {
      case 'high': return 'bg-destructive/10 text-destructive border-destructive/20';
      case 'medium': return 'bg-warning/10 text-warning border-warning/20';
      case 'low': return 'bg-muted text-muted-foreground border-border';
      default: return 'bg-muted text-muted-foreground border-border';
    }
  };

  const getConfidenceBadge = (confidence?: string) => {
    if (!confidence) return null;
    const colors = {
      high: 'bg-accent/10 text-accent',
      medium: 'bg-warning/10 text-warning',
      low: 'bg-muted text-muted-foreground',
    };
    return (
      <Badge variant="outline" className={cn('text-xs', colors[confidence as keyof typeof colors])}>
        {confidence} confidence
      </Badge>
    );
  };

  const getCategoryIcon = (category?: string) => {
    switch (category) {
      case 'risk': return <AlertTriangle className="w-4 h-4 text-destructive" />;
      case 'opportunity': return <Lightbulb className="w-4 h-4 text-accent" />;
      case 'market': return <RefreshCw className="w-4 h-4 text-primary" />;
      default: return <Lightbulb className="w-4 h-4 text-muted-foreground" />;
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="max-w-3xl mx-auto px-6 py-8">
          <Skeleton className="h-6 w-16 mb-6" />
          <Skeleton className="h-8 w-64 mb-2" />
          <Skeleton className="h-5 w-48 mb-8" />
          <div className="space-y-6">
            <Skeleton className="h-32" />
            <Skeleton className="h-48" />
            <Skeleton className="h-24" />
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!meeting) {
    return (
      <DashboardLayout>
        <div className="max-w-3xl mx-auto px-6 py-8">
          <p className="text-muted-foreground">Meeting not found</p>
        </div>
      </DashboardLayout>
    );
  }

  const formatDuration = (seconds?: number) => {
    if (!seconds) return '';
    const mins = Math.floor(seconds / 60);
    return `${mins} min`;
  };

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto px-6 py-8">
        {/* Back button */}
        <div className="flex items-center justify-between mb-6">
          <Link to="/dashboard" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4" />
            Back
          </Link>
          
          <div className="flex items-center gap-2">
            {/* Send to Slack button */}
            {insights && (
              <Button variant="outline" size="sm" onClick={() => setSlackDialogOpen(true)}>
                <Send className="w-4 h-4 mr-1" />
                Send to Slack
              </Button>
            )}
            
            {/* Delete button */}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive">
                  <Trash2 className="w-4 h-4 mr-1" />
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Meeting</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete this meeting, including its transcript, insights, and audio recording. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction 
                    onClick={handleDelete}
                    disabled={deleting}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {deleting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        {/* Slack Delivery Selector */}
        <SlackDeliverySelector
          open={slackDialogOpen}
          onOpenChange={setSlackDialogOpen}
          meetingTitle={meeting.title}
          defaultChannel={slackChannelId}
          defaultChannelName={slackChannelName}
          onSend={handleSendToSlack}
        />

        {/* Title */}
        <h1 className="text-2xl font-semibold text-foreground mb-2">{meeting.title}</h1>
        
        {/* Metadata */}
        <div className="flex items-center gap-4 text-sm text-muted-foreground mb-6">
          <span className="flex items-center gap-1.5">
            <Calendar className="w-4 h-4" />
            {format(new Date(meeting.start_time), 'MMMM d, yyyy · h:mm a')}
          </span>
          {meeting.duration_seconds && (
            <span className="flex items-center gap-1.5">
              <Clock className="w-4 h-4" />
              {formatDuration(meeting.duration_seconds)}
            </span>
          )}
          <span className={cn(
            'status-dot',
            meeting.status
          )} />
          <span className="capitalize">{meeting.status}</span>
        </div>

        {/* Attendees */}
        {attendees.length > 0 && (
          <div className="mb-8 p-4 rounded-lg bg-card border border-border">
            <div className="flex items-center gap-2 mb-3">
              <Users className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">
                {attendees.length} Participant{attendees.length !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {attendees.map((attendee, i) => (
                <div 
                  key={i}
                  className="flex items-center gap-2 px-2 py-1 rounded-full bg-secondary border border-border"
                >
                  <Avatar className="w-6 h-6">
                    <AvatarFallback className="text-xs bg-accent/10 text-accent">
                      {getInitials(attendee.displayName, attendee.email)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm text-foreground">
                    {attendee.displayName || attendee.email}
                  </span>
                  {attendee.organizer && (
                    <span className="text-xs text-muted-foreground">(organizer)</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Content */}
        {insights ? (
          <div className="space-y-8">
            {/* Executive Summary */}
            <section className="doc-section">
              <h2 className="doc-section-title">📝 Executive Summary</h2>
              <p className="doc-content">{insights.summary_short}</p>
              {insights.summary_detailed && (
                <p className="doc-content mt-3 text-muted-foreground text-sm">{insights.summary_detailed}</p>
              )}
            </section>

            {/* Strategic Insights */}
            {insights.strategic_insights && insights.strategic_insights.length > 0 && (
              <section className="doc-section">
                <h2 className="doc-section-title">🧠 Strategic Insights</h2>
                <div className="space-y-3">
                  {(insights.strategic_insights as StrategicInsight[]).map((item, i) => (
                    <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-secondary/50 border border-border">
                      {getCategoryIcon(item.category)}
                      <p className="doc-content flex-1">{item.insight}</p>
                      <Badge variant="outline" className="text-xs capitalize">
                        {item.category || 'insight'}
                      </Badge>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Speaker Highlights */}
            {insights.speaker_highlights && insights.speaker_highlights.length > 0 && (
              <section className="doc-section">
                <h2 className="doc-section-title">💬 Speaker Highlights</h2>
                <div className="space-y-3">
                  {(insights.speaker_highlights as SpeakerHighlight[]).map((item, i) => (
                    <div key={i} className="p-3 rounded-lg bg-card border border-border">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-foreground">{item.speaker}</span>
                      </div>
                      <p className="doc-content text-foreground">{item.highlight}</p>
                      <p className="text-sm text-muted-foreground mt-1">→ {item.context}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Key Points */}
            {insights.key_points && insights.key_points.length > 0 && (
              <section className="doc-section">
                <h2 className="doc-section-title">🎯 Key Points</h2>
                <ul className="space-y-2">
                  {insights.key_points.map((point: string, i: number) => (
                    <li key={i} className="flex items-start gap-2 doc-content">
                      <span className="w-1.5 h-1.5 rounded-full bg-accent mt-2 flex-shrink-0" />
                      {point}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Action Items */}
            {insights.action_items && insights.action_items.length > 0 && (
              <section className="doc-section">
                <h2 className="doc-section-title">✅ Action Items</h2>
                <div className="space-y-3">
                  {(insights.action_items as ActionItem[]).map((item, i) => (
                    <div key={i} className="action-item p-3 rounded-lg bg-card border border-border">
                      <div className="flex items-start gap-3">
                        <Checkbox id={`action-${i}`} className="action-item-checkbox mt-1" />
                        <div className="flex-1">
                          <label htmlFor={`action-${i}`} className="action-item-text cursor-pointer block font-medium">
                            {typeof item === 'string' ? item : item.task}
                          </label>
                          <div className="flex flex-wrap items-center gap-2 mt-2">
                            {item.owner && (
                              <Badge variant="secondary" className="text-xs">
                                → {item.owner}
                              </Badge>
                            )}
                            {item.priority && (
                              <Badge variant="outline" className={cn('text-xs', getPriorityColor(item.priority))}>
                                {item.priority}
                              </Badge>
                            )}
                            {getConfidenceBadge(item.confidence)}
                          </div>
                          {item.outcome && (
                            <p className="text-sm text-muted-foreground mt-2">
                              Expected outcome: {item.outcome}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Decisions */}
            {insights.decisions && insights.decisions.length > 0 && (
              <section className="doc-section">
                <h2 className="doc-section-title">📋 Decisions & Commitments</h2>
                <ul className="space-y-2">
                  {insights.decisions.map((decision: string, i: number) => (
                    <li key={i} className="flex items-start gap-2 doc-content">
                      <span className="w-1.5 h-1.5 rounded-full bg-warning mt-2 flex-shrink-0" />
                      {decision}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Risks & Open Questions */}
            {((insights.risks && insights.risks.length > 0) || (insights.open_questions && insights.open_questions.length > 0)) && (
              <section className="doc-section">
                <h2 className="doc-section-title">⚠️ Risks & Open Questions</h2>
                <div className="space-y-3">
                  {insights.risks?.map((risk: string, i: number) => (
                    <div key={`risk-${i}`} className="flex items-start gap-3 p-3 rounded-lg bg-destructive/5 border border-destructive/20">
                      <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 flex-shrink-0" />
                      <p className="doc-content">{risk}</p>
                    </div>
                  ))}
                  {insights.open_questions?.map((question: string, i: number) => (
                    <div key={`question-${i}`} className="flex items-start gap-3 p-3 rounded-lg bg-warning/5 border border-warning/20">
                      <HelpCircle className="w-4 h-4 text-warning mt-0.5 flex-shrink-0" />
                      <p className="doc-content">{question}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Follow-Ups */}
            {insights.follow_ups && insights.follow_ups.length > 0 && (
              <section className="doc-section">
                <h2 className="doc-section-title">🔁 Follow-Ups & Next Touchpoints</h2>
                <div className="space-y-2">
                  {(insights.follow_ups as FollowUp[]).map((item, i) => (
                    <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-card border border-border">
                      <RefreshCw className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="doc-content">{item.description}</p>
                        <div className="flex items-center gap-2 mt-1">
                          {item.assignee && (
                            <Badge variant="secondary" className="text-xs">
                              → {item.assignee}
                            </Badge>
                          )}
                          {item.type && (
                            <Badge variant="outline" className="text-xs capitalize">
                              {item.type}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Transcript (collapsible) */}
            {transcript && (
              <Collapsible open={transcriptOpen} onOpenChange={setTranscriptOpen}>
                <CollapsibleTrigger className="collapsible-trigger">
                  <ChevronRight className="w-4 h-4" />
                  <span className="text-xs font-semibold uppercase tracking-wider">Full Transcript</span>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-4">
                  <p className="doc-content whitespace-pre-wrap text-muted-foreground">
                    {transcript.content}
                  </p>
                </CollapsibleContent>
              </Collapsible>
            )}
          </div>
        ) : meeting.status === 'processing' ? (
          <div className="empty-state">
            <Loader2 className="empty-state-icon animate-spin" />
            <p className="empty-state-title">Processing meeting...</p>
            <p className="empty-state-description">AI is analyzing your recording. This usually takes a few minutes.</p>
          </div>
        ) : (
          <div className="empty-state">
            <p className="empty-state-title">No insights available</p>
            <p className="empty-state-description">This meeting hasn't been processed yet.</p>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
