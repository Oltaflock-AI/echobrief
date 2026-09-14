import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Loader2, MessageCircleQuestion, Send } from 'lucide-react';
import { Button, Card, CardHeader } from '@/ui';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { rememberPostLoginRedirect } from '@/lib/postLoginRedirect';
import { Ts } from '@/components/meeting/jump';

/**
 * "Ask this meeting", the one thing on a share link that needs an account.
 *
 * Signed out, it is an invitation and nothing else — the page stays readable,
 * search stays free, no modal. Signed in, each question goes to
 * `ask-shared-meeting` with the share token; the answer comes back with the
 * second in the call that settles it, which jumps like every other timestamp.
 */
interface Turn {
  role: 'user' | 'assistant';
  content: string;
  citation?: number | null;
}

export function AskPanel({ token, docked = false }: { token: string; docked?: boolean }) {
  const { user } = useAuth();
  const location = useLocation();
  const [question, setQuestion] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ask = async () => {
    const q = question.trim();
    if (!q || busy) return;
    setBusy(true);
    setError(null);
    const history = turns.map(({ role, content }) => ({ role, content }));
    setTurns((prev) => [...prev, { role: 'user', content: q }]);
    setQuestion('');
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('ask-shared-meeting', {
        body: { token, question: q, history },
      });
      if (invokeError) throw invokeError;
      if (data?.error) throw new Error(data.error);
      setTurns((prev) => [
        ...prev,
        { role: 'assistant', content: String(data?.answer ?? ''), citation: data?.citation_seconds ?? null },
      ]);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Could not answer that right now.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card padded={false} className={docked ? 'flex max-h-[42dvh] flex-col' : ''}>
      <CardHeader title="Ask this meeting" />
      {!user ? (
        <div className="flex flex-col gap-3 px-[18px] py-4 sm:flex-row sm:items-center">
          <span className="inline-flex h-9 w-9 flex-none items-center justify-center rounded-tile bg-eb-sidebar text-eb-accent-sidebar">
            <MessageCircleQuestion size={16} strokeWidth={1.75} />
          </span>
          <p className="m-0 flex-1 font-dmsans text-[13.5px] leading-[1.55] text-eb-prose">
            Ask anything about what was said and get the answer with the moment in the call. Free
            with an EchoBrief account.
          </p>
          <Link
            to="/auth"
            onClick={() => rememberPostLoginRedirect(location.pathname)}
            className="no-underline"
          >
            <Button variant="primary" size="sm">Sign in to ask</Button>
          </Link>
        </div>
      ) : (
        <div className={`px-[18px] py-4 ${docked ? 'flex min-h-0 flex-1 flex-col' : ''}`}>
          {turns.length > 0 && (
            <div className={`mb-4 flex flex-col gap-3 ${docked ? 'min-h-0 flex-1 overflow-y-auto' : ''}`}>
              {turns.map((turn, i) => (
                <div
                  key={i}
                  className={
                    turn.role === 'user'
                      ? 'self-end rounded-card bg-eb-chip px-3.5 py-2 font-dmsans text-[13.5px] text-eb-text'
                      : 'rounded-card border border-eb-border bg-eb-card px-3.5 py-2.5 font-dmsans text-[13.5px] leading-[1.6] text-eb-prose'
                  }
                >
                  {turn.content}
                  {turn.role === 'assistant' && turn.citation != null && (
                    <span className="ml-2 inline-flex align-middle">
                      <Ts seconds={turn.citation} />
                    </span>
                  )}
                </div>
              ))}
              {busy && (
                <div className="flex items-center gap-2 font-dmsans text-[12.5px] text-eb-secondary">
                  <Loader2 size={13} className="animate-spin" /> Reading the transcript…
                </div>
              )}
            </div>
          )}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void ask();
            }}
            className="flex items-center gap-2"
          >
            <input
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="What was decided about…"
              aria-label="Ask a question about this meeting"
              maxLength={500}
              className="h-[38px] flex-1 rounded-input border border-eb-border bg-white px-3 font-dmsans text-[13.5px] text-eb-text shadow-eb-input outline-none placeholder:text-eb-muted focus:border-eb-accent"
            />
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={busy || !question.trim()}
              icon={<Send size={14} strokeWidth={1.75} />}
            >
              Ask
            </Button>
          </form>
          {error && <p className="mb-0 mt-2 font-dmsans text-[12.5px] text-eb-red">{error}</p>}
          <p className="mb-0 mt-2 font-dmsans text-[11.5px] text-eb-muted">
            Answers come only from this meeting’s transcript.
          </p>
        </div>
      )}
    </Card>
  );
}
