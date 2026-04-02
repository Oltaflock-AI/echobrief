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
  const [meetings] = useState<Meeting[]>([]); // Hardcoded empty for now
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Skip Supabase fetch entirely — just show empty state
  console.log('[recordings] Rendering with 0 meetings (Supabase skipped)');

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
      <div style={{ padding: '32px 40px', maxWidth: 1200 }}>
        {/* Welcome message */}
        <p style={{ fontSize: 13, color: '#78716C', margin: '0 0 4px 0', fontFamily: 'DM Sans, sans-serif' }}>
          Welcome back,{' '}
          <span style={{ color: '#FB923C', fontWeight: 500 }}>
            {user?.user_metadata?.full_name?.split(' ')[0] || user?.email?.split('@')[0] || 'there'}
          </span>{' '}👋
        </p>

        {/* Header with Record button */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 32 }}>
          <div style={{ flex: 1 }}>
            <h1 style={{
              fontSize: 32,
              fontWeight: 600,
              color: '#FAFAF9',
              margin: 0,
              marginBottom: 4,
              fontFamily: 'Outfit, sans-serif',
              letterSpacing: '-0.02em',
            }}>
              Meetings
            </h1>
            <p style={{
              fontSize: 13,
              color: '#78716C',
              margin: 0,
              fontFamily: 'DM Sans, sans-serif',
            }}>
              Your meeting intelligence hub
            </p>
          </div>
          <button
            onClick={() => startRecording()}
            style={{
              background: 'linear-gradient(135deg, #F97316, #F59E0B)',
              color: 'white',
              border: 'none',
              borderRadius: 10,
              padding: '10px 20px',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              transition: 'all 0.2s',
              flexShrink: 0,
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

        {/* Stats Row — ALWAYS render, shows 0s when empty */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 16 }}>
          {[
            { value: meetings.length, label: 'Meetings' },
            { value: recordedTimeString, label: 'Recorded' },
            { value: summariesCount, label: 'Summaries' },
          ].map((stat, i) => (
            <div
              key={i}
              style={{
                background: '#1C1917',
                border: '1px solid #292524',
                borderRadius: 14,
                padding: '24px 20px',
              }}
            >
              <div
                style={{
                  fontFamily: 'Outfit, sans-serif',
                  fontSize: 32,
                  fontWeight: 700,
                  color: '#FAFAF9',
                  margin: 0,
                  marginBottom: 4,
                }}
              >
                {stat.value}
              </div>
              <div style={{ fontSize: 13, color: '#78716C', fontFamily: 'DM Sans, sans-serif' }}>
                {stat.label}
              </div>
            </div>
          ))}
        </div>

        {/* Time Saved Banner — ALWAYS render */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            background: 'rgba(34, 197, 94, 0.06)',
            border: '1px solid rgba(34, 197, 94, 0.12)',
            borderRadius: 12,
            padding: '14px 20px',
            marginBottom: 32,
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              background: 'rgba(34, 197, 94, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Sparkles size={18} color="#22C55E" />
          </div>
          <div>
            <div
              style={{
                fontFamily: 'Outfit, sans-serif',
                fontSize: 15,
                fontWeight: 600,
                color: '#FAFAF9',
                margin: 0,
              }}
            >
              ~{timeSavedString} saved
            </div>
            <div style={{ fontSize: 12, color: '#78716C', marginTop: 2, fontFamily: 'DM Sans, sans-serif' }}>
              Time saved on meeting summaries with AI
            </div>
          </div>
        </div>

        {/* Meetings List Area — changes based on state */}

        {/* Empty State */}
        {meetings.length === 0 && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            padding: '60px 24px',
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
        )}

        {/* Meetings List (when not empty) */}
        {meetings.length > 0 && (
          <>
            {/* Recent Meetings Label */}
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: '#78716C',
                marginBottom: 16,
              }}
            >
              Recent Meetings
            </div>

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
