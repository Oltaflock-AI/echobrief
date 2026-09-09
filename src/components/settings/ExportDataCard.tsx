import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { Button, Section } from '@/ui';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

// `contacts` and `usage_events` post-date the generated types; same escape
// hatch Contacts.tsx and BillingCard.tsx use.
// The one place that stays on an untyped client: six generated query types in
// a single Promise.all exceed TypeScript's instantiation depth, and the export
// dumps every row verbatim without reading a field, so the types buy nothing.
const db = supabase as unknown as SupabaseClient;

/**
 * Data export — Console (UI v2). Handlers are the V1 card's, unchanged.
 *
 * Original note kept because it is the reason this has no server endpoint:
 *
 * Data export — the DPDP portability right, and the thing the privacy policy
 * promises. Everything is read through the caller's own session, so RLS scopes
 * it: there is no server endpoint to secure, and no way for this to return
 * somebody else's rows even if the queries were wrong.
 *
 * The file is assembled and downloaded in the browser. For the meeting volumes
 * this product produces that is far simpler than a job that emails a link, and
 * it means the export never touches our servers as a stored artefact.
 */
export function ExportDataCard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [working, setWorking] = useState(false);

  const handleExport = async () => {
    if (!user) return;
    setWorking(true);
    try {
      const [meetings, transcripts, insights, actionItems, contacts, profile] = await Promise.all([
        db.from('meetings').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
        db.from('transcripts').select('*').eq('user_id', user.id),
        db.from('meeting_insights').select('*'),
        db.from('action_item_completions').select('*').eq('user_id', user.id),
        db.from('contacts').select('*').eq('user_id', user.id),
        db.from('profiles').select('*').eq('user_id', user.id).maybeSingle(),
      ]);

      const firstError = [meetings, transcripts, insights, actionItems, contacts, profile]
        .map((r) => r.error)
        .find(Boolean);
      if (firstError) throw new Error(firstError.message);

      const payload = {
        exported_at: new Date().toISOString(),
        account: { id: user.id, email: user.email },
        profile: profile.data ?? null,
        meetings: meetings.data ?? [],
        transcripts: transcripts.data ?? [],
        insights: insights.data ?? [],
        action_item_completions: actionItems.data ?? [],
        contacts: contacts.data ?? [],
      };

      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `echobrief-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      toast({
        title: 'Export ready',
        description: `${payload.meetings.length} meetings and ${payload.transcripts.length} transcripts downloaded.`,
      });
    } catch (err) {
      toast({
        title: 'Export failed',
        description: err instanceof Error ? err.message : 'Could not build your export.',
        variant: 'destructive',
      });
    } finally {
      setWorking(false);
    }
  };

  return (
    <Section
      title="Export your data"
      description="Download every meeting, transcript, summary and contact on your account as a single JSON file. Nothing leaves your browser except the queries that fetch it."
    >
      <Button
        onClick={handleExport}
        disabled={working || !user}
        icon={
          working ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <Download size={15} strokeWidth={1.75} />
          )
        }
      >
        {working ? 'Preparing…' : 'Download my data'}
      </Button>
    </Section>
  );
}
