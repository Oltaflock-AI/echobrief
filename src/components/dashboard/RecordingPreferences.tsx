import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface RecordingPreferencesProps {
  autoJoinMeetings: boolean;
  recordingPreference: 'audio_only' | 'audio_video';
  onUpdate: (autoJoin: boolean, preference: 'audio_only' | 'audio_video') => void;
}

export function RecordingPreferences({
  autoJoinMeetings,
  recordingPreference,
  onUpdate,
}: RecordingPreferencesProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  const handleAutoJoinToggle = async (enabled: boolean) => {
    if (!user) return;
    setSaving(true);

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ auto_join_meetings: enabled })
        .eq('user_id', user.id);

      if (error) throw error;
      onUpdate(enabled, recordingPreference);
      toast({
        title: 'Updated',
        description: enabled ? 'Auto-join enabled' : 'Auto-join disabled',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handlePreferenceChange = async (preference: 'audio_only' | 'audio_video') => {
    if (!user) return;
    setSaving(true);

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ recording_preference: preference })
        .eq('user_id', user.id);

      if (error) throw error;
      onUpdate(autoJoinMeetings, preference);
      toast({
        title: 'Updated',
        description: `Recording set to ${preference === 'audio_only' ? 'audio only' : 'audio + video'}`,
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ background: '#1C1917', border: '1px solid #292524', borderRadius: 16, padding: 24 }}>
      <h3 style={{ fontSize: 15, fontWeight: 600, color: '#FAFAF9', marginBottom: 16 }}>
        Recording Settings
      </h3>

      {/* Auto-join toggle */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <label style={{ fontSize: 13, fontWeight: 500, color: '#FAFAF9' }}>
            Auto-join Teams/Zoom meetings
          </label>
          <button
            onClick={() => handleAutoJoinToggle(!autoJoinMeetings)}
            disabled={saving}
            style={{
              width: 48,
              height: 28,
              borderRadius: 14,
              border: 'none',
              background: autoJoinMeetings ? '#F97316' : '#44403C',
              cursor: saving ? 'not-allowed' : 'pointer',
              transition: 'background 0.2s',
              position: 'relative',
            }}
          >
            <div
              style={{
                position: 'absolute',
                width: 24,
                height: 24,
                borderRadius: 12,
                background: '#FAFAF9',
                top: 2,
                left: autoJoinMeetings ? 22 : 2,
                transition: 'left 0.2s',
              }}
            />
          </button>
        </div>
        <p style={{ fontSize: 12, color: '#78716C', margin: 0 }}>
          Automatically join Teams and Zoom meetings from your calendar when they start
        </p>
      </div>

      {/* Recording preference */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 13, fontWeight: 500, color: '#FAFAF9', display: 'block', marginBottom: 12 }}>
          Record
        </label>
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            onClick={() => handlePreferenceChange('audio_only')}
            disabled={saving}
            style={{
              flex: 1,
              padding: '10px 16px',
              borderRadius: 10,
              border: recordingPreference === 'audio_only' ? '2px solid #FB923C' : '1px solid #292524',
              background: recordingPreference === 'audio_only' ? '#0C0A09' : '#1C1917',
              color: recordingPreference === 'audio_only' ? '#FB923C' : '#A8A29E',
              fontSize: 13,
              fontWeight: 500,
              cursor: saving ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
            }}
          >
            Audio Only
          </button>
          <button
            onClick={() => handlePreferenceChange('audio_video')}
            disabled={saving}
            style={{
              flex: 1,
              padding: '10px 16px',
              borderRadius: 10,
              border: recordingPreference === 'audio_video' ? '2px solid #FB923C' : '1px solid #292524',
              background: recordingPreference === 'audio_video' ? '#0C0A09' : '#1C1917',
              color: recordingPreference === 'audio_video' ? '#FB923C' : '#A8A29E',
              fontSize: 13,
              fontWeight: 500,
              cursor: saving ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
            }}
          >
            Audio + Video
          </button>
        </div>
      </div>
    </div>
  );
}
