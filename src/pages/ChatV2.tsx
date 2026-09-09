/**
 * Ask — Console (UI v2), from mockup 08-ask.
 *
 * A conversation rail on the left, the thread on the right, the composer under
 * it. Conversations persist in `chat_conversations` / `chat_messages` (both
 * RLS-scoped to their owner), so a thread survives a reload and can be reopened
 * — the mockup's rail had nothing behind it until that migration.
 *
 * Citations are cards carrying the meeting, the verbatim line and the moment it
 * was said. The model supplies the quote; `chat-transcripts` locates it in the
 * stored speaker segments and returns the timestamp, so a citation can never
 * point at a moment that was invented — and when the quote cannot be located,
 * the card simply has no timestamp. Clicking one opens the meeting at that
 * second.
 *
 * Messages are stored as they were rendered, citations included: a meeting can
 * be deleted or regenerated later, and the thread should still show what the
 * user was actually told.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowUp, Loader2, Plus, Sparkles, Trash2 } from 'lucide-react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import type { Json } from '@/integrations/supabase/types';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { formatIST } from '@/lib/time';
import { Card } from '@/ui';
import { cn } from '@/lib/utils';

// chat_conversations and chat_messages postdate the generated Database types.
const db = supabase;

interface Citation {
  meeting_id: string;
  title: string;
  date: string;
  quote?: string | null;
  ts?: number | null;
}

interface Turn {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
  truncated?: boolean;
}

interface Conversation {
  id: string;
  title: string;
  updated_at: string;
}

const EXAMPLES = [
  'What did we commit to this week?',
  'What objections came up about pricing?',
  'Which deals are waiting on me?',
];

/** "14:20", or "1:24:15" past the hour — the moment inside the recording. */
function stamp(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const sec = String(s % 60).padStart(2, '0');
  if (m < 60) return `${m}:${sec}`;
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${sec}`;
}

function citationDate(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? date : formatIST(d, 'MMM d');
}

/** The rail label: the first question, short enough to read at a glance. */
function titleFor(question: string): string {
  const clean = question.trim().replace(/\s+/g, ' ');
  return clean.length > 60 ? `${clean.slice(0, 57)}…` : clean;
}

export default function ChatV2() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const conversationId = searchParams.get('c');

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [turns, setTurns] = useState<Turn[]>([]);
  // The search palette's Ask row hands the question over as ?q=, so the
  // composer opens holding what was typed there rather than making the reader
  // type it twice. Not sent on arrival — the question is theirs to edit.
  const [input, setInput] = useState(() => searchParams.get('q') ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const loadConversations = useCallback(async () => {
    if (!user) return;
    const { data } = await db
      .from('chat_conversations')
      .select('id, title, updated_at')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(30);
    setConversations((data ?? []) as Conversation[]);
  }, [user]);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  // Opening a conversation replays it from the database.
  useEffect(() => {
    if (!conversationId || !user) {
      setTurns([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data } = await db
        .from('chat_messages')
        .select('id, role, content, citations, truncated')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });
      if (cancelled) return;
      setTurns(
        ((data ?? []) as Array<Record<string, unknown>>).map((m) => ({
          id: String(m.id),
          role: m.role as 'user' | 'assistant',
          content: String(m.content ?? ''),
          citations: Array.isArray(m.citations) ? (m.citations as Citation[]) : [],
          truncated: !!m.truncated,
        })),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [conversationId, user]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [turns, loading]);

  const openConversation = (id: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (id) next.set('c', id);
    else next.delete('c');
    setSearchParams(next);
    setError(null);
  };

  const persist = async (
    convId: string,
    role: 'user' | 'assistant',
    content: string,
    citations: Citation[] = [],
    truncated = false,
  ) => {
    if (!user) return;
    await db.from('chat_messages').insert({
      conversation_id: convId,
      user_id: user.id,
      role,
      content,
      citations: citations as unknown as Json,
      truncated,
    });
    await db.from('chat_conversations').update({ updated_at: new Date().toISOString() }).eq('id', convId);
  };

  const ask = async (question: string) => {
    const q = question.trim();
    if (!q || loading || !user) return;
    setInput('');
    setError(null);
    setTurns((t) => [...t, { role: 'user', content: q }]);
    setLoading(true);

    let convId = conversationId;
    try {
      // A conversation is created by its first question, titled with it.
      if (!convId) {
        const { data, error: createError } = await db
          .from('chat_conversations')
          .insert({ user_id: user.id, title: titleFor(q) })
          .select('id, title, updated_at')
          .single();
        if (createError) throw createError;
        convId = (data as Conversation).id;
        openConversation(convId);
        setConversations((c) => [data as Conversation, ...c]);
      }
      await persist(convId!, 'user', q);

      const history = turns.map((t) => ({ role: t.role, content: t.content }));
      const { data, error: fnError } = await supabase.functions.invoke('chat-transcripts', {
        body: { question: q, history },
      });
      if (fnError) throw fnError;

      const citations: Citation[] = data.citations || [];
      setTurns((t) => [
        ...t,
        { role: 'assistant', content: data.answer, citations, truncated: !!data.truncated },
      ]);
      await persist(convId!, 'assistant', data.answer, citations, !!data.truncated);
      void loadConversations();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const deleteConversation = async (id: string) => {
    const { error: delError } = await db.from('chat_conversations').delete().eq('id', id);
    if (delError) {
      toast({ title: 'Could not delete that conversation', variant: 'destructive' });
      return;
    }
    setConversations((c) => c.filter((x) => x.id !== id));
    if (id === conversationId) openConversation(null);
  };

  return (
    <DashboardLayout>
      <div className="grid h-[calc(100dvh-10.75rem-env(safe-area-inset-bottom))] lg:h-[calc(100dvh-6.75rem)] grid-cols-1 gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        {/* Conversation rail */}
        <Card padded={false} className="hidden max-h-full flex-col lg:flex">
          <div className="p-3">
            <button
              type="button"
              onClick={() => openConversation(null)}
              className="flex w-full items-center justify-center gap-2 rounded-pill border border-eb-border bg-eb-card px-3 py-2 font-dmsans text-[13px] font-medium text-eb-text hover:bg-eb-row-hover"
            >
              <Plus size={14} strokeWidth={2} />
              New conversation
            </button>
          </div>

          <div className="px-3 pb-1 font-dmsans text-[11px] font-semibold uppercase tracking-[.09em] text-eb-secondary">
            Recent
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
            {conversations.length === 0 ? (
              <p className="px-2 py-3 font-dmsans text-[12.5px] text-eb-secondary">
                Nothing yet — ask a question and it is kept here.
              </p>
            ) : (
              conversations.map((c) => (
                <div
                  key={c.id}
                  className={cn(
                    'group flex items-center gap-1 rounded-input px-2',
                    c.id === conversationId ? 'bg-eb-accent-soft' : 'hover:bg-eb-row-hover',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => openConversation(c.id)}
                    className="min-w-0 flex-1 truncate py-2 text-left font-dmsans text-[13px] text-eb-text"
                    title={c.title}
                  >
                    {c.title}
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteConversation(c.id)}
                    aria-label={`Delete conversation: ${c.title}`}
                    className="flex-none text-eb-muted opacity-0 transition-opacity hover:text-eb-red group-hover:opacity-100"
                  >
                    <Trash2 size={13} strokeWidth={1.75} />
                  </button>
                </div>
              ))
            )}
          </div>
        </Card>

        {/* Thread */}
        <div className="flex min-h-0 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto pb-4">
            {turns.length === 0 && !loading ? (
              <Card className="mt-6 text-center">
                <Sparkles size={26} strokeWidth={1.5} className="mx-auto mb-2.5 text-eb-muted" />
                <p className="font-dmsans text-sm font-medium text-eb-text">Ask across every meeting</p>
                <p className="mt-1 font-dmsans text-[13px] text-eb-secondary">
                  The answer is written from your transcripts only, and quotes the moment it came from.
                </p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  {EXAMPLES.map((e) => (
                    <button
                      key={e}
                      type="button"
                      onClick={() => ask(e)}
                      className="rounded-pill border border-eb-border bg-eb-card px-3 py-1.5 font-dmsans text-[12.5px] text-eb-text hover:bg-eb-row-hover"
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </Card>
            ) : (
              <div className="flex flex-col gap-5 pt-2">
                {turns.map((t, i) =>
                  t.role === 'user' ? (
                    <div key={t.id ?? i} className="flex justify-end">
                      <div className="max-w-[80%] rounded-card bg-eb-sidebar px-4 py-2.5 font-dmsans text-[13.5px] leading-relaxed text-white">
                        {t.content}
                      </div>
                    </div>
                  ) : (
                    <div key={t.id ?? i} className="flex gap-3">
                      <span className="mt-1 flex h-6 w-6 flex-none items-center justify-center rounded-pill bg-eb-accent-soft text-eb-accent">
                        <Sparkles size={13} strokeWidth={1.75} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="m-0 whitespace-pre-wrap font-dmsans text-[14px] leading-relaxed text-eb-prose">
                          {t.content}
                        </p>

                        {t.citations && t.citations.length > 0 && (
                          <div className="mt-3 flex flex-col gap-2">
                            {t.citations.map((c, n) => (
                              <Link
                                key={`${c.meeting_id}-${n}`}
                                to={
                                  typeof c.ts === 'number'
                                    ? `/meeting/${c.meeting_id}?t=${c.ts}`
                                    : `/meeting/${c.meeting_id}`
                                }
                                className="block rounded-card border border-eb-border bg-eb-card px-3.5 py-2.5 no-underline hover:bg-eb-row-hover"
                              >
                                <span className="flex items-center gap-2">
                                  <span className="flex-none font-mono text-[11px] text-eb-accent">{n + 1}</span>
                                  <span className="min-w-0 flex-1 truncate font-dmsans text-[13px] font-medium text-eb-text">
                                    {c.title || 'Untitled meeting'}
                                  </span>
                                  <span className="flex-none font-dmsans text-[12px] text-eb-secondary">
                                    {citationDate(c.date)}
                                  </span>
                                  {typeof c.ts === 'number' && (
                                    <span className="flex-none font-mono text-[11.5px] text-eb-secondary">
                                      {stamp(c.ts)}
                                    </span>
                                  )}
                                </span>
                                {c.quote && (
                                  <span className="mt-1.5 block font-dmsans text-[12.5px] italic leading-snug text-eb-secondary">
                                    “{c.quote}”
                                  </span>
                                )}
                              </Link>
                            ))}
                          </div>
                        )}

                        {t.truncated && (
                          <p className="mt-2 font-dmsans text-[12px] text-eb-secondary">
                            Not every meeting fitted in context — ask something narrower for a fuller answer.
                          </p>
                        )}
                      </div>
                    </div>
                  ),
                )}

                {loading && (
                  <div className="flex items-center gap-2 font-dmsans text-[13px] text-eb-secondary">
                    <Loader2 size={14} className="animate-spin" />
                    Reading your transcripts…
                  </div>
                )}

                {error && <p className="font-dmsans text-[13px] text-eb-red">{error}</p>}
              </div>
            )}
            <div ref={endRef} />
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void ask(input);
            }}
            className="flex items-center gap-2 rounded-pill border border-eb-border bg-eb-card px-4 py-2 shadow-eb-card"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={turns.length ? 'Ask a follow-up…' : 'Ask anything about your meetings…'}
              className="min-w-0 flex-1 border-0 bg-transparent p-0 font-dmsans text-[13.5px] text-eb-text outline-none placeholder:text-eb-secondary"
            />
            <button
              type="submit"
              disabled={!input.trim() || loading}
              aria-label="Send"
              className={cn(
                'flex h-8 w-8 flex-none items-center justify-center rounded-pill transition-colors',
                !input.trim() || loading
                  ? 'bg-eb-chip text-eb-muted'
                  : 'bg-gradient-to-b from-eb-accent-top to-eb-accent text-white shadow-eb-primary',
              )}
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <ArrowUp size={15} strokeWidth={2} />}
            </button>
          </form>
          <p className="mt-2 text-center font-dmsans text-[12px] text-eb-secondary">
            Answers come only from your own transcripts, with citations.
          </p>
        </div>
      </div>
    </DashboardLayout>
  );
}
