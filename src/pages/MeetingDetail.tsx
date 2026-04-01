import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { SlackDeliverySelector } from '@/components/dashboard/SlackDeliverySelector';
import { StatusBadge, SourceBadge, LanguageBadge, Card, GradientBar } from '@/components/dashboard/PrototypeBadges';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Meeting, Transcript, MeetingInsights, StrategicInsight, SpeakerHighlight, ActionItem, FollowUp } from '@/types/meeting';
import { Button } from '@/components/ui/button';
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
import { 
  ChevronRight, Trash2, Users, Send, Zap, AlertTriangle, 
  CheckCircle2, FileText, Loader2, MessageCircle, Mail, Languages
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { T, SUPPORTED_LANGUAGES } from '@/lib/theme';

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

type TabId = 'summary' | 'actions' | 'transcript';

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
  const [slackDialogOpen, setSlackDialogOpen] = useState(false);
  const [slackChannelId, setSlackChannelId] = useState<string | undefined>();
  const [slackChannelName, setSlackChannelName] = useState<string | undefined>();
  
  // Prototype-style state
  const [activeTab, setActiveTab] = useState<TabId>('summary');
  const [summaryLang, setSummaryLang] = useState('English');

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
            timeline_entries: (insightsData.timeline_entries as any) || [],
            meeting_metrics: (insightsData.meeting_metrics as any) || {},
            summary_short: insightsData.summary_short || '',
            summary_detailed: insightsData.summary_detailed || '',
          } as MeetingInsights);
        }

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
      await supabase.from('meeting_insights').delete().eq('meeting_id', meeting.id);
      await supabase.from('transcripts').delete().eq('meeting_id', meeting.id);
      await supabase.from('slack_messages').delete().eq('meeting_id', meeting.id);
      
      if (meeting.audio_url) {
        await supabase.storage.from('recordings').remove([meeting.audio_url]);
      }
      
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

  const formatDuration = (seconds?: number) => {
    if (!seconds) return '';
    const mins = Math.floor(seconds / 60);
    return `${mins} min`;
  };

  const tabs = [
    { id: 'summary' as TabId, label: 'Summary', icon: <Zap size={14} /> },
    { id: 'actions' as TabId, label: `Actions (${insights?.action_items?.length || 0})`, icon: <CheckCircle2 size={14} /> },
    { id: 'transcript' as TabId, label: 'Transcript', icon: <FileText size={14} /> },
  ];

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

  const actionItems = insights?.action_items as ActionItem[] || [];
  const decisions = insights?.decisions || [];
  const risks = insights?.risks || [];

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-6">
          <Link 
            to="/dashboard" 
            className="inline-flex items-center gap-1 text-sm mb-4 transition-colors"
            style={{ color: T.textS }}
          >
            <ChevronRight size={14} style={{ transform: 'rotate(180deg)' }} /> Back to meetings
          </Link>
          
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <h1 
                className="text-2xl font-semibold text-foreground mb-2"
                style={{ fontFamily: 'Outfit, sans-serif', letterSpacing: '-0.02em' }}
              >
                {meeting.title}
              </h1>
              <div className="flex gap-2 items-center flex-wrap">
                <StatusBadge status={meeting.status || 'scheduled'} />
                <SourceBadge source={meeting.source === 'bot' ? 'Bot' : 'Extension'} />
                <LanguageBadge language="EN" />
                <span className="text-sm" style={{ color: T.textM }}>
                  {format(new Date(meeting.start_time), 'MMM d')} at {format(new Date(meeting.start_time), 'h:mm a')} · {formatDuration(meeting.duration_seconds)}
                </span>
              </div>
            </div>
            
            <div className="flex gap-2">
              {insights && (
                <>
                  <button
                    onClick={() => setSlackDialogOpen(true)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-colors"
                    style={{ 
                      background: 'rgba(249, 115, 22, 0.08)',
                      border: '1px solid rgba(249, 115, 22, 0.15)',
                      color: T.orangeL,
                    }}
                  >
                    <MessageCircle size={14} /> Send to WhatsApp
                  </button>
                  <button
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-colors"
                    style={{ 
                      background: 'rgba(249, 115, 22, 0.08)',
                      border: '1px solid rgba(249, 115, 22, 0.15)',
                      color: T.orangeL,
                    }}
                  >
                    <Mail size={14} /> Email
                  </button>
                </>
              )}
              
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
        </div>

        <SlackDeliverySelector
          open={slackDialogOpen}
          onOpenChange={setSlackDialogOpen}
          meetingTitle={meeting.title}
          defaultChannel={slackChannelId}
          defaultChannelName={slackChannelName}
          onSend={handleSendToSlack}
        />

        {/* Stats Row - Prototype Style */}
        {insights && (
          <div className="grid grid-cols-4 gap-3 mb-6">
            {[
              { label: 'Speakers', value: attendees.length, icon: <Users size={16} color={T.blue} /> },
              { label: 'Action Items', value: actionItems.length, icon: <CheckCircle2 size={16} color={T.green} /> },
              { label: 'Decisions', value: decisions.length, icon: <Zap size={16} color={T.orangeL} /> },
              { label: 'Risks', value: risks.length, icon: <AlertTriangle size={16} color={risks.length > 0 ? T.red : T.textM} /> },
            ].map((s, i) => (
              <Card key={i} style={{ textAlign: 'center', padding: 16 }}>
                <div className="mb-1.5">{s.icon}</div>
                <div className="text-xl font-bold text-foreground" style={{ fontFamily: 'Outfit, sans-serif' }}>
                  {s.value}
                </div>
                <div className="text-xs" style={{ color: T.textM }}>{s.label}</div>
              </Card>
            ))}
          </div>
        )}

        {/* Tabs */}
        {insights && (
          <div 
            className="flex gap-1 mb-5 pb-0"
            style={{ borderBottom: `1px solid hsl(var(--border))` }}
          >
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-all"
                style={{
                  background: 'none',
                  border: 'none',
                  color: activeTab === tab.id ? T.orangeL : T.textM,
                  borderBottom: `2px solid ${activeTab === tab.id ? T.orange : 'transparent'}`,
                }}
              >
                {tab.icon} {tab.label}
              </button>
            ))}

            {/* Language selector */}
            {activeTab === 'summary' && (
              <div className="ml-auto flex items-center gap-1.5 py-2">
                <Languages size={14} style={{ color: T.textM }} />
                <select
                  value={summaryLang}
                  onChange={e => setSummaryLang(e.target.value)}
                  className="text-xs font-medium rounded-lg px-2 py-1"
                  style={{ 
                    background: 'hsl(var(--card))',
                    border: `1px solid hsl(var(--border))`,
                    color: 'hsl(var(--foreground))',
                  }}
                >
                  {SUPPORTED_LANGUAGES.map(l => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        {/* Tab Content */}
        {insights ? (
          <>
            {/* Summary Tab */}
            {activeTab === 'summary' && (
              <div className="space-y-4">
                {/* Executive Summary */}
                <Card>
                  <GradientBar />
                  <h3 
                    className="text-sm font-semibold mb-2"
                    style={{ fontFamily: 'Outfit, sans-serif', color: T.text }}
                  >
                    Executive Summary
                  </h3>
                  <p className="text-sm leading-relaxed" style={{ color: T.textS }}>
                    {insights.summary_short || insights.summary_detailed}
                  </p>
                </Card>

                {/* Decisions */}
                {decisions.length > 0 && (
                  <Card>
                    <h3 
                      className="text-sm font-semibold mb-3 flex items-center gap-2"
                      style={{ fontFamily: 'Outfit, sans-serif', color: T.text }}
                    >
                      <Zap size={16} color={T.orangeL} /> Key Decisions
                    </h3>
                    {decisions.map((d: string, i: number) => (
                      <div 
                        key={i} 
                        className="py-2 text-sm flex gap-2"
                        style={{ 
                          borderTop: i > 0 ? `1px solid hsl(var(--border))` : 'none',
                          color: T.textS,
                        }}
                      >
                        <span className="font-semibold text-xs min-w-5" style={{ color: T.orangeL }}>
                          {i + 1}.
                        </span>
                        {d}
                      </div>
                    ))}
                  </Card>
                )}

                {/* Risks */}
                {risks.length > 0 && (
                  <Card style={{ borderColor: 'rgba(239, 68, 68, 0.2)' }}>
                    <h3 
                      className="text-sm font-semibold mb-3 flex items-center gap-2"
                      style={{ fontFamily: 'Outfit, sans-serif', color: T.red }}
                    >
                      <AlertTriangle size={16} /> Risk Flags
                    </h3>
                    {risks.map((r: string, i: number) => (
                      <div key={i} className="text-sm leading-relaxed" style={{ color: T.textS }}>
                        {r}
                      </div>
                    ))}
                  </Card>
                )}

                {/* Speakers */}
                {attendees.length > 0 && (
                  <Card>
                    <h3 
                      className="text-sm font-semibold mb-3 flex items-center gap-2"
                      style={{ fontFamily: 'Outfit, sans-serif', color: T.text }}
                    >
                      <Users size={16} color={T.blue} /> Speakers
                    </h3>
                    <div className="flex gap-2 flex-wrap">
                      {attendees.map((a, i) => (
                        <div 
                          key={i}
                          className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm"
                          style={{ 
                            background: 'rgba(59, 130, 246, 0.08)',
                            color: T.text,
                          }}
                        >
                          <div 
                            className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold"
                            style={{ background: T.gradient, color: '#fff' }}
                          >
                            {(a.displayName || a.email)?.[0]?.toUpperCase() || '?'}
                          </div>
                          {a.displayName || a.email}
                        </div>
                      ))}
                    </div>
                  </Card>
                )}
              </div>
            )}

            {/* Actions Tab */}
            {activeTab === 'actions' && (
              <div className="space-y-2">
                {actionItems.length > 0 ? (
                  actionItems.map((item, i) => (
                    <Card key={i} style={{ padding: 16 }}>
                      <div className="flex items-start gap-3">
                        <div 
                          className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5"
                          style={{ 
                            border: `2px solid ${item.done ? T.green : 'hsl(var(--border))'}`,
                            background: item.done ? T.green : 'transparent',
                          }}
                        >
                          {item.done && <CheckCircle2 size={12} color="#fff" />}
                        </div>
                        <div className="flex-1">
                          <div 
                            className="text-sm font-medium"
                            style={{ 
                              color: item.done ? T.textM : T.text,
                              textDecoration: item.done ? 'line-through' : 'none',
                            }}
                          >
                            {typeof item === 'string' ? item : item.task}
                          </div>
                          {item.owner && (
                            <div className="text-xs mt-1" style={{ color: T.textM }}>
                              Assigned to {item.owner}
                            </div>
                          )}
                        </div>
                        {item.owner && (
                          <span 
                            className="text-xs px-2.5 py-1 rounded-full"
                            style={{ background: 'rgba(168, 168, 168, 0.1)', color: T.textS }}
                          >
                            {item.owner}
                          </span>
                        )}
                      </div>
                    </Card>
                  ))
                ) : (
                  <Card style={{ textAlign: 'center', padding: 40 }}>
                    <CheckCircle2 size={32} style={{ color: T.textM, marginBottom: 12, marginInline: 'auto' }} />
                    <p className="text-sm" style={{ color: T.textM }}>No action items from this meeting</p>
                  </Card>
                )}
              </div>
            )}

            {/* Transcript Tab */}
            {activeTab === 'transcript' && (
              <div>
                {speakerSegments.length > 0 ? (
                  speakerSegments.map((t, i) => (
                    <div 
                      key={i}
                      className="flex gap-3 py-3"
                      style={{ borderBottom: `1px solid hsl(var(--border))` }}
                    >
                      <div 
                        className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0"
                        style={{ background: T.gradient, color: '#fff' }}
                      >
                        {t.speaker?.[0]?.toUpperCase() || '?'}
                      </div>
                      <div>
                        <div className="flex gap-2 items-center mb-1">
                          <span className="text-sm font-medium" style={{ color: T.text }}>{t.speaker}</span>
                          {t.start !== undefined && (
                            <span 
                              className="text-xs font-mono"
                              style={{ color: T.textM }}
                            >
                              {Math.floor((t.start || 0) / 60)}:{String(Math.floor((t.start || 0) % 60)).padStart(2, '0')}
                            </span>
                          )}
                        </div>
                        <p className="text-sm leading-relaxed" style={{ color: T.textS }}>
                          {t.text}
                        </p>
                      </div>
                    </div>
                  ))
                ) : transcript?.content ? (
                  <Card>
                    <p className="text-sm whitespace-pre-wrap leading-relaxed" style={{ color: T.textS }}>
                      {transcript.content}
                    </p>
                  </Card>
                ) : (
                  <Card style={{ textAlign: 'center', padding: 40 }}>
                    <FileText size={32} style={{ color: T.textM, marginBottom: 12, marginInline: 'auto' }} />
                    <p className="text-sm" style={{ color: T.textM }}>Transcript will appear here after processing</p>
                  </Card>
                )}
              </div>
            )}
          </>
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
