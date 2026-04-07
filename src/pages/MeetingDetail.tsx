import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { SlackDeliverySelector } from '@/components/dashboard/SlackDeliverySelector';
import { WhatsAppDeliverySelector } from '@/components/dashboard/WhatsAppDeliverySelector';
import { EmailReportSelector } from '@/components/dashboard/EmailReportSelector';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Meeting, Transcript, MeetingInsights, StrategicInsight, SpeakerHighlight, ActionItem, FollowUp } from '@/types/meeting';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
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
  ArrowLeft, Calendar, Clock, Loader2, ChevronRight, Trash2, Users, Send, 
  Lightbulb, AlertTriangle, HelpCircle, RefreshCw, Zap, CheckCircle2, 
  FileText, Globe, MessageCircle, Mail, Languages, Bot, Chrome
} from 'lucide-react';
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

// ─── Reusable badge components matching prototype ───
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    completed: { bg: '#FFF7ED', color: '#C2410C', label: 'Completed' },
    processing: { bg: '#DBEAFE', color: '#1D4ED8', label: 'Processing' },
    recording: { bg: '#DCFCE7', color: '#15803D', label: 'Recording' },
    failed: { bg: '#FEE2E2', color: '#B91C1C', label: 'Failed' },
    scheduled: { bg: 'rgba(168,168,168,0.1)', color: '#A8A29E', label: 'Scheduled' },
  };
  const s = map[status] || map.scheduled;
  return (
    <span style={{ padding: '3px 10px', borderRadius: 100, fontSize: 11, fontWeight: 600, color: s.color, background: s.bg, letterSpacing: '0.02em', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      {status === 'recording' && <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />}
      {s.label}
    </span>
  );
}

function SourceBadge({ source }: { source: string }) {
  const isBot = source === 'manual' || source === 'calendar';
  return (
    <span style={{ padding: '3px 10px', borderRadius: 100, fontSize: 11, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4, color: isBot ? '#A855F7' : '#FB923C', background: isBot ? 'rgba(168,85,247,0.12)' : 'rgba(249,115,22,0.1)' }}>
      {isBot ? <Bot size={11} /> : <Chrome size={11} />}
      {isBot ? 'Bot' : 'Extension'}
    </span>
  );
}

// ─── Prototype-style Card ───
function ProtoCard({ children, style, className }: { children: React.ReactNode; style?: React.CSSProperties; className?: string }) {
  return (
    <div className={className} style={{ background: '#1C1917', border: '1px solid #292524', borderRadius: 16, padding: 20, ...style }}>
      {children}
    </div>
  );
}

function GradientBar() {
  return <div style={{ height: 3, background: 'linear-gradient(135deg, #F97316, #F59E0B)', borderRadius: 2, marginBottom: 16 }} />;
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
  const [emailMessages, setEmailMessages] = useState<any[]>([]);
  const [slackMessages, setSlackMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [slackDialogOpen, setSlackDialogOpen] = useState(false);
  const [slackChannelId, setSlackChannelId] = useState<string | undefined>();
  const [slackChannelName, setSlackChannelName] = useState<string | undefined>();
  const [whatsappDialogOpen, setWhatsappDialogOpen] = useState(false);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('summary');
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

        const { data: insightsRows } = await supabase
          .from('meeting_insights')
          .select('*')
          .eq('meeting_id', id)
          .order('created_at', { ascending: false })
          .limit(1);

        const insightsData = insightsRows?.[0] || null;
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

        // Fetch delivery history
        const { data: emailMsgs } = await supabase
          .from('email_messages')
          .select('*')
          .eq('meeting_id', id)
          .order('created_at', { ascending: false });

        if (emailMsgs) {
          setEmailMessages(emailMsgs);
        }

        const { data: slackMsgs } = await supabase
          .from('slack_messages')
          .select('*')
          .eq('meeting_id', id)
          .order('created_at', { ascending: false });

        if (slackMsgs) {
          setSlackMessages(slackMsgs);
        }
      }

      setLoading(false);
    };

    fetchMeetingData();
  }, [user, id]);

  // Poll for status updates when the meeting is still processing
  useEffect(() => {
    if (!user || !id || !meeting) return;
    const terminalStatuses = ['completed', 'failed'];
    if (terminalStatuses.includes(meeting.status)) return;

    const pollInterval = setInterval(async () => {
      // If it's a bot meeting, call check-recall-status to trigger the backend fallback
      if (meeting.recall_bot_id) {
        try {
          const token = (await supabase.auth.getSession()).data.session?.access_token;
          if (token) {
            await fetch(`${SUPABASE_URL}/functions/v1/check-recall-status`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ meeting_id: id }),
            });
          }
        } catch {
          // Ignore polling errors
        }
      }

      // Re-fetch meeting status from DB
      const { data: updatedMeeting } = await supabase
        .from('meetings')
        .select('*')
        .eq('id', id)
        .eq('user_id', user.id)
        .single();

      if (updatedMeeting && updatedMeeting.status !== meeting.status) {
        setMeeting(updatedMeeting as Meeting);

        // If now completed, fetch the transcript and insights too
        if (updatedMeeting.status === 'completed') {
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

          const { data: insightsRows } = await supabase
            .from('meeting_insights')
            .select('*')
            .eq('meeting_id', id)
            .order('created_at', { ascending: false })
            .limit(1);

          const insightsData = insightsRows?.[0] || null;
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
        }
      }
    }, 5000);

    return () => clearInterval(pollInterval);
  }, [user, id, meeting?.status, meeting?.recall_bot_id]);

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
      const { error } = await supabase.from('meetings').delete().eq('id', meeting.id).eq('user_id', user.id);
      if (error) throw error;
      toast({ title: 'Meeting deleted', description: 'The meeting and all related data have been removed.' });
      navigate('/dashboard');
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to delete meeting', variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  };

  const getInitials = (name?: string | null, email?: string) => {
    if (name) return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
    if (email) return email.slice(0, 2).toUpperCase();
    return '??';
  };

  const handleSendToSlack = async (destination: { type: 'dm' | 'channel'; channelId: string; channelName?: string }) => {
    if (!meeting || !session?.access_token) return;
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/process-meeting`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ meetingId: meeting.id, slackDestination: destination }),
      });
      const data = await response.json();
      if (data.slackSent) {
        toast({ title: 'Sent to Slack', description: `Summary sent to ${destination.channelName || destination.channelId}` });
      } else throw new Error('Failed to send');
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to send summary to Slack', variant: 'destructive' });
    }
  };

  const handleSendToWhatsApp = async (phoneNumber: string) => {
    if (!meeting || !user || !session?.access_token) return;
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/send-whatsapp-report`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          meeting_id: meeting.id, 
          user_id: user.id,
          phone_number: phoneNumber,
          language: summaryLang.toLowerCase(),
        }),
      });
      const data = await response.json();
      if (data.success) {
        toast({ title: 'Sent to WhatsApp', description: `Report sent to ${phoneNumber}` });
      } else throw new Error(data.error || 'Failed to send');
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Failed to send to WhatsApp', variant: 'destructive' });
    }
  };

  const handleSendEmail = async (emailAddress: string) => {
    if (!meeting || !user || !session?.access_token) return;
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/send-email-report`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          meeting_id: meeting.id, 
          user_id: user.id,
          recipient_email: emailAddress,
        }),
      });
      const data = await response.json();
      if (data.success) {
        toast({ title: 'Sent', description: `Report sent to ${emailAddress}` });
      } else throw new Error(data.error || 'Failed to send');
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Failed to send email', variant: 'destructive' });
    }
  };

  const getPriorityColor = (priority?: string) => {
    switch (priority) {
      case 'high': return 'bg-destructive/10 text-destructive border-destructive/20';
      case 'medium': return 'bg-warning/10 text-warning border-warning/20';
      default: return 'bg-muted text-muted-foreground border-border';
    }
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return '';
    const mins = Math.floor(seconds / 60);
    return `${mins} min`;
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="max-w-3xl mx-auto px-8 py-8">
          <Skeleton className="h-6 w-16 mb-6" />
          <Skeleton className="h-8 w-64 mb-2" />
          <Skeleton className="h-5 w-48 mb-8" />
          <div className="space-y-6">
            <Skeleton className="h-32 rounded-2xl" />
            <Skeleton className="h-48 rounded-2xl" />
            <Skeleton className="h-24 rounded-2xl" />
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!meeting) {
    return (
      <DashboardLayout>
        <div className="max-w-3xl mx-auto px-8 py-8">
          <p style={{ color: '#A8A29E' }}>Meeting not found</p>
        </div>
      </DashboardLayout>
    );
  }

  const actionItemCount = insights?.action_items?.length || 0;

  const tabs = [
    { id: 'summary', label: 'Summary', icon: <Zap size={14} /> },
    { id: 'actions', label: `Actions (${actionItemCount})`, icon: <CheckCircle2 size={14} /> },
    { id: 'transcript', label: 'Transcript', icon: <FileText size={14} /> },
    { id: 'delivery', label: 'Delivery', icon: <Mail size={14} /> },
  ];

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto px-8 py-8">
        {/* Header */}
        <div className="mb-6">
          <Link 
            to="/dashboard" 
            className="inline-flex items-center gap-1 text-[13px] mb-3 transition-colors"
            style={{ color: '#A8A29E' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#FB923C')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#A8A29E')}
          >
            <ChevronRight size={14} style={{ transform: 'rotate(180deg)' }} /> Back to meetings
          </Link>

          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <h1 
                className="text-2xl font-semibold text-foreground mb-2"
                style={{ fontFamily: 'Outfit, sans-serif', letterSpacing: '-0.02em' }}
              >
                {meeting.title}
              </h1>
              <div className="flex gap-2 items-center flex-wrap">
                <StatusBadge status={meeting.status || 'scheduled'} />
                <SourceBadge source={meeting.source || 'manual'} />
                <span style={{ padding: '3px 10px', borderRadius: 100, fontSize: 11, fontWeight: 600, color: '#A8A29E', background: 'rgba(168,168,168,0.1)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Globe size={11} /> {meeting.language || 'English'}
                </span>
                <span className="text-[13px]" style={{ color: '#78716C' }}>
                  {format(new Date(meeting.start_time), 'MMMM d, yyyy')} at {format(new Date(meeting.start_time), 'h:mm a')}
                  {meeting.duration_seconds ? ` · ${formatDuration(meeting.duration_seconds)}` : ''}
                </span>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              {insights && (
                <>
                  <button
                    onClick={() => setSlackDialogOpen(true)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-[10px] text-[13px] font-medium transition-colors"
                    style={{ background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.15)', color: '#FB923C' }}
                  >
                    <Send size={14} /> Slack
                  </button>
                  <button
                    onClick={() => setEmailDialogOpen(true)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-[10px] text-[13px] font-medium transition-colors"
                    style={{ background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.15)', color: '#3B82F6' }}
                  >
                    <Mail size={14} /> Email
                  </button>
                  <button
                    onClick={() => setWhatsappDialogOpen(true)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-[10px] text-[13px] font-medium transition-colors"
                    style={{ background: 'rgba(37, 211, 102, 0.08)', border: '1px solid rgba(37, 211, 102, 0.15)', color: '#25D366' }}
                  >
                    <MessageCircle size={14} /> WhatsApp
                  </button>
                </>
              )}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button className="flex items-center gap-1.5 px-4 py-2 rounded-[10px] text-[13px] font-medium transition-colors" style={{ color: '#A8A29E' }}>
                    <Trash2 size={14} /> Delete
                  </button>
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
                    <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      {deleting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
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

        {/* Email Report Selector */}
        <EmailReportSelector
          open={emailDialogOpen}
          onOpenChange={setEmailDialogOpen}
          meetingTitle={meeting.title}
          userEmail={user?.email || undefined}
          onSend={handleSendEmail}
        />

        {/* WhatsApp Delivery Selector */}
        <WhatsAppDeliverySelector
          open={whatsappDialogOpen}
          onOpenChange={setWhatsappDialogOpen}
          meetingTitle={meeting.title}
          onSend={handleSendToWhatsApp}
        />

        {/* Stats row */}
        {insights && (
          <div className="grid grid-cols-4 gap-3 mb-6">
            {[
              { label: 'Speakers', value: attendees.length || '—', icon: <Users size={16} style={{ color: '#3B82F6' }} /> },
              { label: 'Action Items', value: actionItemCount, icon: <CheckCircle2 size={16} style={{ color: '#22C55E' }} /> },
              { label: 'Decisions', value: insights.decisions?.length || 0, icon: <Zap size={16} style={{ color: '#FB923C' }} /> },
              { label: 'Risks', value: insights.risks?.length || 0, icon: <AlertTriangle size={16} style={{ color: (insights.risks?.length || 0) > 0 ? '#EF4444' : '#78716C' }} /> },
            ].map((s, i) => (
              <ProtoCard key={i} style={{ textAlign: 'center', padding: 16 }}>
                <div className="mb-1.5">{s.icon}</div>
                <div className="text-[22px] font-bold text-foreground" style={{ fontFamily: 'Outfit, sans-serif' }}>{s.value}</div>
                <div className="text-xs" style={{ color: '#78716C' }}>{s.label}</div>
              </ProtoCard>
            ))}
          </div>
        )}

        {/* Content */}
        {insights ? (
          <div>
            {/* Tabs */}
            <div className="flex gap-1 mb-5" style={{ borderBottom: '1px solid #292524' }}>
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className="flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-medium transition-all"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: activeTab === tab.id ? '#FB923C' : '#78716C',
                    borderBottom: `2px solid ${activeTab === tab.id ? '#F97316' : 'transparent'}`,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  {tab.icon} {tab.label}
                </button>
              ))}

              {/* Language selector */}
              {activeTab === 'summary' && (
                <div className="ml-auto flex items-center gap-1.5 pb-1">
                  <Languages size={14} style={{ color: '#78716C' }} />
                  <select
                    value={summaryLang}
                    onChange={e => setSummaryLang(e.target.value)}
                    className="text-xs py-1.5 px-2.5 rounded-lg outline-none"
                    style={{ background: '#1C1917', border: '1px solid #292524', color: '#FAFAF9', fontFamily: 'inherit' }}
                  >
                    {['English', 'Hindi', 'Tamil', 'Telugu', 'Bengali', 'Kannada', 'Marathi', 'Malayalam', 'Gujarati', 'Punjabi'].map(l => (
                      <option key={l} value={l}>{l}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* ═══ SUMMARY TAB ═══ */}
            {activeTab === 'summary' && (
              <div className="space-y-4">
                {/* Executive Summary */}
                <ProtoCard>
                  <GradientBar />
                  <h3 className="text-[15px] font-semibold text-foreground mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>
                    Executive Summary
                  </h3>
                  <p className="text-sm leading-relaxed" style={{ color: '#A8A29E' }}>
                    {insights.summary_short}
                  </p>
                  {insights.summary_detailed && (
                    <p className="text-sm leading-relaxed mt-3" style={{ color: '#78716C' }}>
                      {insights.summary_detailed}
                    </p>
                  )}
                </ProtoCard>

                {/* Key Decisions */}
                {insights.decisions && insights.decisions.length > 0 && (
                  <ProtoCard>
                    <h3 className="text-[15px] font-semibold text-foreground mb-3 flex items-center gap-2" style={{ fontFamily: 'Outfit, sans-serif' }}>
                      <Zap size={16} style={{ color: '#FB923C' }} /> Key Decisions
                    </h3>
                    {insights.decisions.map((d: string, i: number) => (
                      <div key={i} className="flex gap-2 text-sm" style={{ padding: '8px 0', borderTop: i > 0 ? '1px solid #292524' : 'none', color: '#A8A29E' }}>
                        <span className="text-xs font-semibold min-w-[20px]" style={{ color: '#FB923C' }}>{i + 1}.</span> {d}
                      </div>
                    ))}
                  </ProtoCard>
                )}

                {/* Strategic Insights */}
                {insights.strategic_insights && insights.strategic_insights.length > 0 && (
                  <ProtoCard>
                    <h3 className="text-[15px] font-semibold text-foreground mb-3 flex items-center gap-2" style={{ fontFamily: 'Outfit, sans-serif' }}>
                      <Lightbulb size={16} style={{ color: '#F59E0B' }} /> Strategic Insights
                    </h3>
                    <div className="space-y-3">
                      {(insights.strategic_insights as StrategicInsight[]).map((item, i) => (
                        <div key={i} className="flex items-start gap-3 p-3 rounded-xl" style={{ background: 'rgba(249,115,22,0.04)', border: '1px solid #292524' }}>
                          <p className="text-sm flex-1" style={{ color: '#A8A29E' }}>{item.insight}</p>
                          <span className="text-xs px-2 py-0.5 rounded-full capitalize" style={{ background: 'rgba(168,168,168,0.08)', color: '#78716C' }}>
                            {item.category || 'insight'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </ProtoCard>
                )}

                {/* Key Points */}
                {insights.key_points && insights.key_points.length > 0 && (
                  <ProtoCard>
                    <h3 className="text-[15px] font-semibold text-foreground mb-3" style={{ fontFamily: 'Outfit, sans-serif' }}>
                      🎯 Key Points
                    </h3>
                    <ul className="space-y-2">
                      {insights.key_points.map((point: string, i: number) => (
                        <li key={i} className="flex items-start gap-2 text-sm" style={{ color: '#A8A29E' }}>
                          <span className="w-1.5 h-1.5 rounded-full mt-2 flex-shrink-0" style={{ background: '#F97316' }} />
                          {point}
                        </li>
                      ))}
                    </ul>
                  </ProtoCard>
                )}

                {/* Risks */}
                {insights.risks && insights.risks.length > 0 && (
                  <ProtoCard style={{ borderColor: 'rgba(239,68,68,0.2)' }}>
                    <h3 className="text-[15px] font-semibold mb-3 flex items-center gap-2" style={{ fontFamily: 'Outfit, sans-serif', color: '#EF4444' }}>
                      <AlertTriangle size={16} /> Risk Flags
                    </h3>
                    {insights.risks.map((r: string, i: number) => (
                      <div key={i} className="text-sm leading-relaxed" style={{ color: '#A8A29E' }}>{r}</div>
                    ))}
                  </ProtoCard>
                )}

                {/* Open Questions */}
                {insights.open_questions && insights.open_questions.length > 0 && (
                  <ProtoCard>
                    <h3 className="text-[15px] font-semibold text-foreground mb-3 flex items-center gap-2" style={{ fontFamily: 'Outfit, sans-serif' }}>
                      <HelpCircle size={16} style={{ color: '#F59E0B' }} /> Open Questions
                    </h3>
                    {insights.open_questions.map((q: string, i: number) => (
                      <div key={i} className="flex items-start gap-3 p-3 rounded-xl" style={{ background: 'rgba(245,158,11,0.04)', border: '1px solid rgba(245,158,11,0.15)' }}>
                        <HelpCircle size={14} className="mt-0.5 flex-shrink-0" style={{ color: '#F59E0B' }} />
                        <p className="text-sm" style={{ color: '#A8A29E' }}>{q}</p>
                      </div>
                    ))}
                  </ProtoCard>
                )}

                {/* Follow-Ups */}
                {insights.follow_ups && insights.follow_ups.length > 0 && (
                  <ProtoCard>
                    <h3 className="text-[15px] font-semibold text-foreground mb-3 flex items-center gap-2" style={{ fontFamily: 'Outfit, sans-serif' }}>
                      <RefreshCw size={16} style={{ color: '#3B82F6' }} /> Follow-Ups
                    </h3>
                    <div className="space-y-2">
                      {(insights.follow_ups as FollowUp[]).map((item, i) => (
                        <div key={i} className="flex items-start gap-3 p-3 rounded-xl" style={{ background: '#1C1917', border: '1px solid #292524' }}>
                          <RefreshCw size={14} className="mt-0.5 flex-shrink-0" style={{ color: '#3B82F6' }} />
                          <div className="flex-1">
                            <p className="text-sm" style={{ color: '#A8A29E' }}>{item.description}</p>
                            <div className="flex items-center gap-2 mt-1.5">
                              {item.assignee && (
                                <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(168,168,168,0.08)', color: '#A8A29E' }}>
                                  → {item.assignee}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ProtoCard>
                )}

                {/* Speakers */}
                {attendees.length > 0 && (
                  <ProtoCard>
                    <h3 className="text-[15px] font-semibold text-foreground mb-3 flex items-center gap-2" style={{ fontFamily: 'Outfit, sans-serif' }}>
                      <Users size={16} style={{ color: '#3B82F6' }} /> Speakers
                    </h3>
                    <div className="flex gap-2 flex-wrap">
                      {attendees.map((a, i) => (
                        <div key={i} className="flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[13px]" style={{ background: 'rgba(59,130,246,0.08)', color: '#FAFAF9' }}>
                          <div 
                            className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold text-white"
                            style={{ background: 'linear-gradient(135deg, #F97316, #F59E0B)' }}
                          >
                            {getInitials(a.displayName, a.email)}
                          </div>
                          {a.displayName || a.email}
                          {a.organizer && <span className="text-[11px]" style={{ color: '#78716C' }}>(organizer)</span>}
                        </div>
                      ))}
                    </div>
                  </ProtoCard>
                )}

                {/* Speaker Highlights */}
                {insights.speaker_highlights && insights.speaker_highlights.length > 0 && (
                  <ProtoCard>
                    <h3 className="text-[15px] font-semibold text-foreground mb-3 flex items-center gap-2" style={{ fontFamily: 'Outfit, sans-serif' }}>
                      💬 Speaker Highlights
                    </h3>
                    <div className="space-y-3">
                      {(insights.speaker_highlights as SpeakerHighlight[]).map((item, i) => (
                        <div key={i} className="p-3 rounded-xl" style={{ border: '1px solid #292524' }}>
                          <span className="font-medium text-foreground text-sm">{item.speaker}</span>
                          <p className="text-sm text-foreground mt-1">{item.highlight}</p>
                          <p className="text-xs mt-1" style={{ color: '#78716C' }}>→ {item.context}</p>
                        </div>
                      ))}
                    </div>
                  </ProtoCard>
                )}
              </div>
            )}

            {/* ═══ ACTIONS TAB ═══ */}
            {activeTab === 'actions' && (
              <div className="space-y-2">
                {insights.action_items && (insights.action_items as ActionItem[]).map((item, i) => (
                  <ProtoCard key={i} style={{ padding: 16 }}>
                    <div className="flex items-center gap-3">
                      <div 
                        className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0"
                        style={{ border: `2px solid ${item.done ? '#22C55E' : '#292524'}`, background: item.done ? '#22C55E' : 'transparent' }}
                      >
                        {item.done && <CheckCircle2 size={12} color="#fff" />}
                      </div>
                      <div className="flex-1">
                        <div className={cn("text-sm", item.done && "line-through")} style={{ color: item.done ? '#78716C' : '#FAFAF9' }}>
                          {typeof item === 'string' ? item : item.task}
                        </div>
                        {item.owner && (
                          <div className="text-xs mt-0.5" style={{ color: '#78716C' }}>Assigned to {item.owner}</div>
                        )}
                      </div>
                      {item.owner && (
                        <span style={{ padding: '3px 10px', borderRadius: 100, fontSize: 11, fontWeight: 600, color: '#A8A29E', background: 'rgba(168,168,168,0.1)' }}>
                          {item.owner}
                        </span>
                      )}
                      {item.priority && (
                        <Badge variant="outline" className={cn('text-xs', getPriorityColor(item.priority))}>
                          {item.priority}
                        </Badge>
                      )}
                    </div>
                  </ProtoCard>
                ))}
                {(!insights.action_items || insights.action_items.length === 0) && (
                  <ProtoCard style={{ textAlign: 'center', padding: 40 }}>
                    <CheckCircle2 size={32} style={{ color: '#78716C', margin: '0 auto 12px' }} />
                    <p className="text-sm" style={{ color: '#78716C' }}>No action items for this meeting</p>
                  </ProtoCard>
                )}
              </div>
            )}

            {/* ═══ TRANSCRIPT TAB ═══ */}
            {activeTab === 'transcript' && (
              <div>
                {speakerSegments.length > 0 ? speakerSegments.map((seg, i) => {
                  const prevSpeaker = i > 0 ? speakerSegments[i - 1].speaker : null;
                  const isNewSpeaker = seg.speaker !== prevSpeaker;
                  return (
                    <div key={i} className="flex gap-3 py-3" style={{ borderBottom: '1px solid #292524' }}>
                      {isNewSpeaker ? (
                        <div 
                          className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white flex-shrink-0"
                          style={{ background: 'linear-gradient(135deg, #F97316, #F59E0B)' }}
                        >
                          {seg.speaker[0]}
                        </div>
                      ) : (
                        <div className="w-8 flex-shrink-0" />
                      )}
                      <div>
                        {isNewSpeaker && (
                          <div className="flex gap-2 items-center mb-1">
                            <span className="text-[13px] font-medium text-foreground">{seg.speaker}</span>
                            {seg.start !== undefined && (
                              <span className="text-[11px] font-mono" style={{ color: '#78716C' }}>
                                {Math.floor((seg.start || 0) / 60)}:{String(Math.floor((seg.start || 0) % 60)).padStart(2, '0')}
                              </span>
                            )}
                          </div>
                        )}
                        <p className="text-sm leading-relaxed" style={{ color: '#A8A29E' }}>{seg.text}</p>
                      </div>
                    </div>
                  );
                }) : transcript ? (
                  <p className="text-sm whitespace-pre-wrap leading-relaxed" style={{ color: '#A8A29E' }}>
                    {transcript.content}
                  </p>
                ) : (
                  <ProtoCard style={{ textAlign: 'center', padding: 40 }}>
                    <FileText size={32} style={{ color: '#78716C', margin: '0 auto 12px' }} />
                    <p className="text-sm" style={{ color: '#78716C' }}>Transcript will appear here after processing</p>
                  </ProtoCard>
                )}
              </div>
            )}

            {/* ═══ DELIVERY TAB ═══ */}
            {activeTab === 'delivery' && (
              <div className="space-y-3">
                {/* Email Deliveries */}
                {emailMessages.length > 0 && (
                  <>
                    <h3 className="text-[15px] font-semibold text-foreground mb-3 flex items-center gap-2" style={{ fontFamily: 'Outfit, sans-serif' }}>
                      <Mail size={16} style={{ color: '#3B82F6' }} /> Email Deliveries
                    </h3>
                    {emailMessages.map((msg, i) => (
                      <ProtoCard key={i} style={{ padding: 16 }}>
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="text-sm font-medium text-foreground">{msg.recipient_email}</div>
                            <div className="text-xs mt-1" style={{ color: '#78716C' }}>
                              {format(new Date(msg.sent_at || msg.created_at), 'MMM d, yyyy h:mm a')}
                            </div>
                            {msg.error_message && (
                              <div className="text-xs mt-1" style={{ color: '#EF4444' }}>
                                Error: {msg.error_message}
                              </div>
                            )}
                          </div>
                          <span style={{ padding: '4px 10px', borderRadius: 100, fontSize: 11, fontWeight: 600, color: msg.status === 'sent' ? '#22C55E' : '#A8A29E', background: msg.status === 'sent' ? 'rgba(34,197,94,0.1)' : 'rgba(168,168,168,0.1)' }}>
                            {msg.status === 'sent' ? '✓ Sent' : msg.status === 'failed' ? '✗ Failed' : 'Pending'}
                          </span>
                        </div>
                      </ProtoCard>
                    ))}
                  </>
                )}

                {/* Slack Deliveries */}
                {slackMessages.length > 0 && (
                  <>
                    <h3 className="text-[15px] font-semibold text-foreground mb-3 mt-6 flex items-center gap-2" style={{ fontFamily: 'Outfit, sans-serif' }}>
                      <Send size={16} style={{ color: '#FB923C' }} /> Slack Deliveries
                    </h3>
                    {slackMessages.map((msg, i) => (
                      <ProtoCard key={i} style={{ padding: 16 }}>
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="text-sm font-medium text-foreground">{msg.channel_id}</div>
                            <div className="text-xs mt-1" style={{ color: '#78716C' }}>
                              {format(new Date(msg.sent_at || msg.created_at), 'MMM d, yyyy h:mm a')}
                            </div>
                            {msg.error_message && (
                              <div className="text-xs mt-1" style={{ color: '#EF4444' }}>
                                Error: {msg.error_message}
                              </div>
                            )}
                          </div>
                          <span style={{ padding: '4px 10px', borderRadius: 100, fontSize: 11, fontWeight: 600, color: msg.status === 'sent' ? '#22C55E' : '#A8A29E', background: msg.status === 'sent' ? 'rgba(34,197,94,0.1)' : 'rgba(168,168,168,0.1)' }}>
                            {msg.status === 'sent' ? '✓ Sent' : msg.status === 'failed' ? '✗ Failed' : 'Pending'}
                          </span>
                        </div>
                      </ProtoCard>
                    ))}
                  </>
                )}

                {emailMessages.length === 0 && slackMessages.length === 0 && (
                  <ProtoCard style={{ textAlign: 'center', padding: 40 }}>
                    <Mail size={32} style={{ color: '#78716C', margin: '0 auto 12px' }} />
                    <p className="text-sm" style={{ color: '#78716C' }}>No deliveries yet. Send this report via Email or Slack above.</p>
                  </ProtoCard>
                )}
              </div>
            )}
          </div>
        ) : meeting.status === 'processing' ? (
          <div className="text-center py-16">
            <Loader2 className="w-12 h-12 mx-auto mb-4 animate-spin" style={{ color: '#78716C' }} />
            <p className="text-base font-medium text-foreground mb-1">Processing meeting...</p>
            <p className="text-sm max-w-sm mx-auto" style={{ color: '#A8A29E' }}>
              AI is analyzing your recording. This usually takes a few minutes.
            </p>
          </div>
        ) : (
          <div className="text-center py-16">
            <p className="text-base font-medium text-foreground mb-1">No insights available</p>
            <p className="text-sm" style={{ color: '#A8A29E' }}>This meeting hasn't been processed yet.</p>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
