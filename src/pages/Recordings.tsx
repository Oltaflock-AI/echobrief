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
import { Search, Loader2, Filter, Mic } from 'lucide-react';
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

  return (
    <DashboardLayout>
      <div style={{ padding: '32px' }}>
        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 30, fontWeight: 'bold', color: '#FAFAF9', margin: 0, fontFamily: 'Outfit, sans-serif', letterSpacing: '-0.02em' }}>
            Meetings
          </h1>
          <p style={{ fontSize: 14, color: '#A8A29E', marginTop: 8, margin: 0, fontFamily: 'DM Sans, sans-serif' }}>
            Browse and manage all your recorded meetings
          </p>
        </div>

        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px' }}>
            <Loader2 style={{ width: 32, height: 32, animation: 'spin 1s linear infinite', color: '#A8A29E' }} />
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
            <Mic style={{ width: 40, height: 40, marginBottom: 24, color: '#44403C' }} />
            <h3 style={{ fontSize: 18, fontWeight: 600, color: '#FAFAF9', margin: 0, marginBottom: 12, fontFamily: 'Outfit, sans-serif' }}>
              Your meetings will appear here
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
              Connect your calendar and EchoBrief will automatically record and summarize your meetings.
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
                → Go to Calendar
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
                + Record Now
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
