/**
 * "Post to Slack" / "Post to ClickUp" on a meeting page — the owner's way to
 * choose which summaries reach a channel. With Settings → Delivery set to
 * "only when I choose", this is the ONLY way a meeting gets posted; with
 * auto-post on it covers meetings that finished before a channel was picked.
 *
 * Each button reads its state from the manage-* `status` action with the
 * meeting id, so "Posted" reflects the delivery ledger rather than a guess.
 * Posting again is impossible by construction: the server's claim row makes a
 * second press `already_posted`. A post cannot be unsent and everyone in the
 * channel sees it, so it asks first.
 */
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Loader2, Send } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/ui';
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

type Provider = { fn: 'manage-slack' | 'manage-clickup'; label: 'Slack' | 'ClickUp' };

const PROVIDERS: Provider[] = [
  { fn: 'manage-slack', label: 'Slack' },
  { fn: 'manage-clickup', label: 'ClickUp' },
];

type ChannelStatus = {
  connected: boolean;
  channel_id?: string | null;
  channel_name?: string | null;
  needs_reconnect?: boolean;
  meeting_delivery?: { posted: boolean; posted_at: string | null; error: string | null };
};

export function ChannelPostButtons({ meetingId }: { meetingId: string }) {
  return (
    <>
      {PROVIDERS.map((p) => (
        <ChannelPostButton key={p.fn} provider={p} meetingId={meetingId} />
      ))}
    </>
  );
}

function ChannelPostButton({ provider, meetingId }: { provider: Provider; meetingId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [posting, setPosting] = useState(false);
  const queryKey = ['channel-post', provider.fn, meetingId];

  const { data: status } = useQuery({
    queryKey,
    queryFn: async (): Promise<ChannelStatus> => {
      const { data, error } = await supabase.functions.invoke(provider.fn, {
        body: { action: 'status', meeting_id: meetingId },
      });
      // A failed status read hides the button; it must not break the page.
      if (error || !data) return { connected: false };
      return data as ChannelStatus;
    },
  });

  // Nothing to offer until the integration is connected, healthy and has a
  // destination — Settings is where those get fixed.
  if (!status?.connected || !status.channel_id || status.needs_reconnect) return null;

  const posted = !!status.meeting_delivery?.posted;

  if (posted) {
    return (
      <Button size="sm" disabled icon={<CheckCircle2 size={14} strokeWidth={1.75} />}>
        Posted to #{status.channel_name}
      </Button>
    );
  }

  const post = async () => {
    setPosting(true);
    try {
      const { data, error } = await supabase.functions.invoke(provider.fn, {
        body: { action: 'post', meeting_id: meetingId },
      });
      const detail = (data as { error?: string } | null)?.error;
      if (error || detail) throw new Error(detail || error?.message || 'Post failed');
      toast({ title: `Posted to #${status.channel_name}`, description: `The summary is in ${provider.label}.` });
    } catch (err) {
      toast({ title: `Could not post to ${provider.label}`, description: (err as Error).message, variant: 'destructive' });
    } finally {
      setPosting(false);
      void queryClient.invalidateQueries({ queryKey });
    }
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          size="sm"
          disabled={posting}
          icon={posting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} strokeWidth={1.75} />}
        >
          {posting ? 'Posting…' : `Post to ${provider.label}`}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="bg-eb-bg border-eb-border text-eb-text">
        <AlertDialogHeader>
          <AlertDialogTitle>Post this summary to #{status.channel_name}?</AlertDialogTitle>
          <AlertDialogDescription>
            Everyone in the {provider.label} channel will see the summary, decisions, action items and
            next steps. The transcript is never posted. A post cannot be taken back from here.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={post}>Post</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
