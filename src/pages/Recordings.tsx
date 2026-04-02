import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { MeetingCard } from '@/components/dashboard/MeetingCard';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useRecording } from '@/contexts/RecordingContext';
import { Meeting } from '@/types/meeting';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Loader2, Filter, Mic, Sparkles, Clock } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export default function Recordings() {
  const { user } = useAuth();
  const { startRecording } = useRecording();
  const navigate = useNavigate();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    if (!user) return;

    const fetchMeetings = async () => {
      const { data, error } = await supabase
        .from('meetings')
        .select('*')
        .eq('user_id', user.id)
        .order('start_time', { ascending: false });

      if (!error && data) {
        setMeetings(data as Meeting[]);
      }
      setLoading(false);
    };

    fetchMeetings();
  }, [user]);

  const filteredMeetings = meetings.filter((meeting) => {
    const matchesSearch = meeting.title.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || meeting.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Calculate stats
  const totalRecordedMinutes = meetings.reduce((acc, meeting) => {
    const duration = meeting.duration_seconds ? Math.round(meeting.duration_seconds / 60) : 0;
    return acc + duration;
  }, 0);

  const totalHours = Math.floor(totalRecordedMinutes / 60);
  const remainingMinutes = totalRecordedMinutes % 60;
  const recordedTimeString = totalHours > 0 ? `${totalHours}h ${remainingMinutes}m` : `${remainingMinutes}m`;

  const summariesCount = meetings.filter((m) => m.summary).length;

  const timeSavedMinutes = Math.round(totalRecordedMinutes * 0.25); // 15 seconds per minute
  const timeSavedHours = Math.floor(timeSavedMinutes / 60);
  const timeSavedRemainingMinutes = timeSavedMinutes % 60;
  const timeSavedString = timeSavedHours > 0 ? `${timeSavedHours}h ${timeSavedRemainingMinutes}m` : `${timeSavedRemainingMinutes}m`;

  return (
    <DashboardLayout>
      <div style={{ padding: '32px' }}>
        {/* Header with Record button */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <h1 style={{ fontSize: 26, fontWeight: 600, color: '#FAFAF9', margin: 0, fontFamily: 'Outfit, sans-serif', letterSpacing: '-0.01em' }}>
                Meetings
              </h1>
              <button
                onClick={() => startRecording()}
                style={{
                  background: 'linear-gradient(135deg, #F97316, #F59E0B)',
                  color: 'white',
                  border: 'none',
                  borderRadius: 10,
                  padding: '8px 16px',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(249, 115, 22, 0.3)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <Mic size={14} />
                Record
              </button>
            </div>
            <p style={{ fontSize: 13, color: '#78716C', margin: 0, fontFamily: 'DM Sans, sans-serif' }}>
              Your meeting intelligence hub
            </p>
          </div>
        </div>

        {!loading && meetings.length > 0 && (
          <>
            {/* Stats Row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
              {/* Meetings Stat */}
              <div style={{
                background: '#1C1917',
                border: '1px solid #292524',
                borderRadius: 14,
                padding: 24,
              }}>
                <div style={{ fontSize: 32, fontWeight: 700, color: '#FAFAF9', margin: 0, fontFamily: 'Outfit, sans-serif' }}>
                  {meetings.length}
                </div>
                <div style={{ fontSize: 13, color: '#78716C', margin: '4px 0 0 0', fontFamily: 'DM Sans, sans-serif' }}>
                  Meetings
                </div>
              </div>

              {/* Recorded Time Stat */}
              <div style={{
                background: '#1C1917',
                border: '1px solid #292524',
                borderRadius: 14,
                padding: 24,
              }}>
                <div style={{ fontSize: 32, fontWeight: 700, color: '#FAFAF9', margin: 0, fontFamily: 'Outfit, sans-serif' }}>
                  {recordedTimeString}
                </div>
                <div style={{ fontSize: 13, color: '#78716C', margin: '4px 0 0 0', fontFamily: 'DM Sans, sans-serif' }}>
                  Recorded
                </div>
              </div>

              {/* Summaries Stat */}
              <div style={{
                background: '#1C1917',
                border: '1px solid #292524',
                borderRadius: 14,
                padding: 24,
              }}>
                <div style={{ fontSize: 32, fontWeight: 700, color: '#FAFAF9', margin: 0, fontFamily: 'Outfit, sans-serif' }}>
                  {summariesCount}
                </div>
                <div style={{ fontSize: 13, color: '#78716C', margin: '4px 0 0 0', fontFamily: 'DM Sans, sans-serif' }}>
                  Summaries
                </div>
              </div>
            </div>

            {/* Time Saved Banner */}
            <div style={{
              background: 'rgba(34, 197, 94, 0.06)',
              border: '1px solid rgba(34, 197, 94, 0.12)',
              borderRadius: 12,
              padding: '16px 20px',
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              marginBottom: 32,
            }}>
              <div style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                background: 'rgba(34, 197, 94, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}>
                <Sparkles size={20} color="#22C55E" />
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#FAFAF9', margin: 0, fontFamily: 'Outfit, sans-serif' }}>
                  ~{timeSavedString} saved
                </div>
                <div style={{ fontSize: 13, color: '#78716C', margin: '2px 0 0 0', fontFamily: 'DM Sans, sans-serif' }}>
                  Time saved on meeting summaries with AI
                </div>
              </div>
            </div>

            {/* Recent Meetings Section */}
            <div style={{ marginBottom: 32 }}>
              <div style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: '#78716C',
                marginBottom: 16,
              }}>
                Recent Meetings
              </div>

              {/* Meetings List */}
              <div>
                {meetings.slice(0, 10).map((meeting, index) => {
                  const statusDotColor = meeting.status === 'completed' ? '#22C55E' : meeting.status === 'processing' ? '#3B82F6' : '#44403C';
                  const hasSummary = !!meeting.summary;
                  const meetingDate = meeting.start_time ? new Date(meeting.start_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';

                  return (
                    <div
                      key={meeting.id}
                      onClick={() => navigate(`/dashboard/meetings/${meeting.id}`)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '14px 0',
                        borderBottom: '1px solid #292524',
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(249,115,22,0.04)';
                        e.currentTarget.style.borderRadius = '8px';
                        e.currentTarget.style.paddingLeft = '4px';
                        e.currentTarget.style.paddingRight = '4px';
                        e.currentTarget.querySelector('[data-title]')!.style.color = '#FAFAF9';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.borderRadius = '0';
                        e.currentTarget.style.paddingLeft = '0';
                        e.currentTarget.style.paddingRight = '0';
                        e.currentTarget.querySelector('[data-title]')!.style.color = '#FAFAF9';
                      }}
                    >
                      {/* Status Dot */}
                      <div
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          background: statusDotColor,
                          flexShrink: 0,
                        }}
                      />

                      {/* Title */}
                      <div
                        data-title
                        style={{
                          flex: 1,
                          fontSize: 14,
                          fontWeight: 500,
                          color: '#FAFAF9',
                          fontFamily: 'DM Sans, sans-serif',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {meeting.title}
                      </div>

                      {/* Summary Badge */}
                      {hasSummary && (
                        <div
                          style={{
                            background: 'rgba(168,85,247,0.1)',
                            border: '1px solid rgba(168,85,247,0.15)',
                            color: '#A855F7',
                            fontSize: 11,
                            fontWeight: 600,
                            padding: '3px 10px',
                            borderRadius: 100,
                            whiteSpace: 'nowrap',
                            flexShrink: 0,
                          }}
                        >
                          Summary
                        </div>
                      )}

                      {/* Duration */}
                      {meeting.duration_seconds && (
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            color: '#78716C',
                            fontSize: 12,
                            fontFamily: 'DM Sans, sans-serif',
                            whiteSpace: 'nowrap',
                            flexShrink: 0,
                          }}
                        >
                          <Clock size={12} />
                          {Math.round(meeting.duration_seconds / 60)}m
                        </div>
                      )}

                      {/* Date */}
                      <div
                        style={{
                          color: '#78716C',
                          fontSize: 12,
                          fontFamily: 'DM Sans, sans-serif',
                          whiteSpace: 'nowrap',
                          flexShrink: 0,
                        }}
                      >
                        {meetingDate}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* View All Link */}
              {meetings.length > 10 && (
                <div style={{ textAlign: 'center', marginTop: 16 }}>
                  <button
                    onClick={() => navigate('/dashboard/meetings')}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#FB923C',
                      fontSize: 13,
                      fontFamily: 'DM Sans, sans-serif',
                      cursor: 'pointer',
                      textDecoration: 'none',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.textDecoration = 'underline';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.textDecoration = 'none';
                    }}
                  >
                    View all {meetings.length} meetings →
                  </button>
                </div>
              )}
            </div>
          </>
        )}

        {loading ? (
          // Loading State
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 24px' }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                border: '2px solid #292524',
                borderTopColor: '#F97316',
                animation: 'spin 0.8s linear infinite',
                marginBottom: 16,
              }}
            />
            <p style={{ fontSize: 14, color: '#78716C', margin: 0, fontFamily: 'DM Sans, sans-serif' }}>
              Loading your meetings...
            </p>
          </div>
        ) : meetings.length === 0 ? (
          // Empty State
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '80px 24px',
            textAlign: 'center',
          }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 12,
                background: 'rgba(249,115,22,0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 20,
              }}
            >
              <Mic size={28} color="#F97316" />
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 600, color: '#FAFAF9', margin: 0, marginBottom: 12, fontFamily: 'Outfit, sans-serif' }}>
              No meetings yet
            </h3>
            <p style={{
              fontSize: 14,
              color: '#78716C',
              margin: 0,
              marginBottom: 32,
              maxWidth: 340,
              lineHeight: 1.6,
              fontFamily: 'DM Sans, sans-serif',
            }}>
              Head to your Calendar to send a bot to an upcoming meeting, or hit Record to capture one now.
            </p>
            <div style={{ display: 'flex', gap: 12 }}>
              <Button
                onClick={() => navigate('/calendar')}
                style={{
                  border: '1px solid #292524',
                  color: '#FB923C',
                  background: 'transparent',
                  borderRadius: 10,
                  padding: '10px 20px',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Go to Calendar
              </Button>
              <Button
                onClick={() => startRecording()}
                style={{
                  background: 'linear-gradient(135deg, #F97316, #F59E0B)',
                  color: 'white',
                  borderRadius: 10,
                  padding: '10px 20px',
                  fontSize: 13,
                  fontWeight: 600,
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                Record Now
              </Button>
            </div>
          </div>
        ) : (
          <>
            {/* Filters */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
              <div style={{ position: 'relative', flex: 1, maxWidth: 320 }}>
                <Search style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: '#A8A29E' }} />
                <Input
                  placeholder="Search meetings..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ paddingLeft: 36 }}
                />
              </div>

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger style={{ width: 160 }}>
                  <Filter style={{ width: 16, height: 16, marginRight: 8 }} />
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="processing">Processing</SelectItem>
                  <SelectItem value="recording">Recording</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Meetings List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {filteredMeetings.map((meeting) => (
                <MeetingCard key={meeting.id} meeting={meeting} />
              ))}
            </div>
          </>
        )}

        <style>{`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    </DashboardLayout>
  );
}
