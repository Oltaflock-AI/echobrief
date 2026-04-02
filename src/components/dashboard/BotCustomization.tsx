import { useState, useEffect } from 'react';
import { Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface BotCustomizationProps {
  user_id?: string;
  onSave?: () => void;
}

const COLOR_OPTIONS = [
  { name: 'Orange', hex: '#F97316', bg: 'rgba(249,115,22,0.1)' },
  { name: 'Blue', hex: '#3B82F6', bg: 'rgba(59,130,246,0.1)' },
  { name: 'Green', hex: '#22C55E', bg: 'rgba(34,197,94,0.1)' },
  { name: 'Purple', hex: '#A855F7', bg: 'rgba(168,85,247,0.1)' },
  { name: 'Pink', hex: '#EC4899', bg: 'rgba(236,72,153,0.1)' },
  { name: 'Cyan', hex: '#06B6D4', bg: 'rgba(6,182,212,0.1)' },
];

export function BotCustomization({ user_id, onSave }: BotCustomizationProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [botName, setBotName] = useState('EchoBrief Notetaker');
  const [botColor, setBotColor] = useState('#F97316');
  const [autoJoin, setAutoJoin] = useState(true);

  useEffect(() => {
    if (!user_id) return;

    const fetchSettings = async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('notetaker_name, bot_color, auto_join_enabled')
          .eq('user_id', user_id)
          .single();

        if (data) {
          if (data.notetaker_name) setBotName(data.notetaker_name);
          if (data.bot_color) setBotColor(data.bot_color);
          if (data.auto_join_enabled !== null) setAutoJoin(data.auto_join_enabled);
        }
      } catch (err) {
        console.log('Using defaults');
      } finally {
        setLoading(false);
      }
    };

    fetchSettings();
  }, [user_id]);

  const handleSave = async () => {
    if (!user_id || !botName.trim()) {
      toast({ title: 'Error', description: 'Bot name cannot be empty', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          notetaker_name: botName,
          bot_color: botColor,
          auto_join_enabled: autoJoin,
        })
        .eq('user_id', user_id);

      if (error) throw error;

      toast({ title: 'Saved', description: 'Bot customization updated' });
      onSave?.();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div style={{ color: '#A8A29E' }}>Loading settings...</div>;
  }

  const selectedColor = COLOR_OPTIONS.find(c => c.hex === botColor) || COLOR_OPTIONS[0];

  return (
    <div style={{ background: '#1C1917', border: '1px solid #292524', borderRadius: 16, padding: 20 }}>
      <h3 className="text-[15px] font-semibold text-foreground mb-6" style={{ fontFamily: 'Outfit, sans-serif' }}>
        🤖 Bot Customization
      </h3>

      <div className="space-y-6">
        {/* Bot Name */}
        <div>
          <label className="block text-sm font-medium mb-2" style={{ color: '#FAFAF9' }}>
            Bot Name
          </label>
          <Input
            type="text"
            value={botName}
            onChange={(e) => setBotName(e.target.value)}
            placeholder="e.g., Meeting Recorder"
            maxLength={50}
            style={{
              background: '#1C1917',
              border: '1px solid #292524',
              color: '#FAFAF9',
              padding: '10px 12px',
              borderRadius: 8,
              fontSize: 13,
            }}
          />
          <p className="text-xs mt-1" style={{ color: '#78716C' }}>
            This name appears in meeting notifications and calendar invites
          </p>
        </div>

        {/* Bot Color */}
        <div>
          <label className="block text-sm font-medium mb-3" style={{ color: '#FAFAF9' }}>
            Bot Icon Color
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            {COLOR_OPTIONS.map(color => (
              <button
                key={color.hex}
                onClick={() => setBotColor(color.hex)}
                style={{
                  padding: '16px',
                  borderRadius: 8,
                  border: botColor === color.hex ? `2px solid ${color.hex}` : '1px solid #292524',
                  background: color.bg,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: color.hex,
                  }}
                />
                <span style={{ fontSize: 11, color: botColor === color.hex ? color.hex : '#A8A29E', fontWeight: 500 }}>
                  {color.name}
                </span>
              </button>
            ))}
          </div>
          <div style={{
            marginTop: 12,
            padding: '12px',
            borderRadius: 8,
            background: 'rgba(168,168,168,0.05)',
            border: '1px solid #292524',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: botColor,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontWeight: 600,
                  fontSize: 14,
                }}
              >
                E
              </div>
              <div style={{ fontSize: 12, color: '#A8A29E' }}>
                Preview: {botName}
              </div>
            </div>
          </div>
        </div>

        {/* Auto Join */}
        <div>
          <label className="flex items-center gap-3" style={{ cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={autoJoin}
              onChange={(e) => setAutoJoin(e.target.checked)}
              style={{
                width: 18,
                height: 18,
                cursor: 'pointer',
              }}
            />
            <span style={{ color: '#FAFAF9', fontSize: 13, fontWeight: 500 }}>
              Auto-join meetings from calendar
            </span>
          </label>
          <p className="text-xs mt-2" style={{ color: '#78716C', marginLeft: 28 }}>
            Automatically record and analyze meetings from your Google Calendar
          </p>
        </div>

        {/* Save Button */}
        <div className="flex gap-2 pt-4">
          <Button
            onClick={handleSave}
            disabled={saving}
            style={{
              flex: 1,
              background: '#FB923C',
              color: 'white',
            }}
          >
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save size={14} className="mr-2" />}
            Save Changes
          </Button>
        </div>
      </div>
    </div>
  );
}
