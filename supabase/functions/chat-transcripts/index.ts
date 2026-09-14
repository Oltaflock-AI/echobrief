/**
 * Chat across a user's own meeting history.
 *
 * Retrieval strategy is deliberate context-stuffing, not vector search. The
 * per-user corpus is small (avg transcript ~2,126 tokens), and an embedding
 * pipeline would add another async step that can silently drift out of sync —
 * failing as "chat doesn't know about that meeting", which is indistinguishable
 * from an unhelpful model. See the design doc for the full argument.
 *
 * Security: this function uses the CALLER'S JWT rather than the service-role
 * key, so RLS scopes transcripts to their own meetings. Chat is the one feature
 * where a scoping bug leaks another user's private meeting content, so that
 * guarantee belongs in Postgres rather than in a user_id filter.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://esm.sh/openai@4.20.1";
import { getCorsHeaders, handleCorsPrelight } from "../_shared/cors.ts";
import { checkRateLimit, createRateLimitResponse, RATE_LIMITS } from "../_shared/rate-limit.ts";
import { captureError, withObservability } from "../_shared/observability.ts";
import { locateQuotes } from "../_shared/quote-locate.ts";

const MAX_CONTEXT_TOKENS = 100_000;

/**
 * Retrieval hygiene. Three classes of row are real in this database and all
 * three make answers worse by being in context:
 *   1. the literal "no clear speech" placeholder the pipeline writes when a
 *      recording captured nothing — the model quotes it back as if it were a
 *      finding about the meeting;
 *   2. sub-threshold fragments ("Hmm hmm. Hello Can you hear me?") that carry
 *      no content but still get cited;
 *   3. [harness] test meetings, whose fabricated "quarterly roadmap" transcript
 *      would otherwise be answered as though it were the user's own.
 */
const MIN_TRANSCRIPT_CHARS = 250;
const NO_SPEECH_SENTINEL = "no clear speech was detected";

function isUsableTranscript(title: string, content: string): boolean {
  if (title.startsWith("[harness]")) return false;
  const trimmed = content.trim();
  if (trimmed.length < MIN_TRANSCRIPT_CHARS) return false;
  if (trimmed.slice(0, 120).toLowerCase().includes(NO_SPEECH_SENTINEL)) return false;
  return true;
}

interface MeetingContext {
  meeting_id: string;
  title: string;
  date: string;
  content: string;
}

/** Crude on purpose: used only for the ceiling guard and the trend log. */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * The retrieval seam. Today it returns every transcript the caller can read.
 * When the token log shows the ceiling approaching, ranked retrieval replaces
 * the body of this function and nothing else changes.
 */
async function buildContext(
  supabase: SupabaseClient,
): Promise<{
  items: MeetingContext[];
  truncated: boolean;
  tokens: number;
  skipped: number;
}> {
  const { data, error } = await supabase
    .from("transcripts")
    .select("meeting_id, content, meetings(title, start_time)")
    .order("created_at", { ascending: false });

  if (error) throw new Error(`transcript query failed: ${error.message}`);

  const rows: MeetingContext[] = (data ?? []).map((r: any) => ({
    meeting_id: r.meeting_id,
    title: r.meetings?.title || "Untitled meeting",
    date: (r.meetings?.start_time || "").slice(0, 10),
    content: String(r.content ?? ""),
  }));

  const all = rows.filter((r) => isUsableTranscript(r.title, r.content));
  const skipped = rows.length - all.length;

  // Newest first, so truncation drops the oldest.
  const kept: MeetingContext[] = [];
  let tokens = 0;
  let truncated = false;
  for (const item of all) {
    const cost = estimateTokens(item.content) + 40;
    if (tokens + cost > MAX_CONTEXT_TOKENS) {
      truncated = true;
      break;
    }
    kept.push(item);
    tokens += cost;
  }
  return { items: kept, truncated, tokens, skipped };
}

function renderContext(items: MeetingContext[]): string {
  return items
    .map(
      (m) =>
        `### Meeting: ${m.title}  |  ${m.date}  |  id: ${m.meeting_id}\n${m.content}`,
    )
    .join("\n\n");
}


serve(withObservability("chat-transcripts", async (req) => {
  const corsResponse = handleCorsPrelight(req);
  if (corsResponse) return corsResponse;
  const corsHeaders = getCorsHeaders(req.headers.get("origin"));
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ error: "Missing Authorization header" }, 401);
    }

    const { question, history } = await req.json();
    if (!question || typeof question !== "string" || !question.trim()) {
      return json({ error: "question is required" }, 400);
    }

    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiApiKey) return json({ error: "OPENAI_API_KEY not configured" }, 500);

    // Caller's token, NOT the service role key — RLS does the scoping.
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    // Every question here is an OpenAI call over the caller's whole transcript
    // history — the most expensive request in the product. Rate limit it on the
    // user id, which is also the only identifier that survives an IP change.
    // A bad token is an auth failure, not a free pass, so refuse outright.
    const { data: authData } = await supabase.auth.getUser();
    if (!authData?.user) return json({ error: "Invalid or expired session" }, 401);
    const limit = await checkRateLimit(`chat:${authData.user.id}`, RATE_LIMITS.LLM);
    if (!limit.allowed) return createRateLimitResponse(limit, corsHeaders);

    const { items, truncated, tokens, skipped } = await buildContext(supabase);
    console.log(
      `[chat-transcripts] meetings=${items.length} tokens=${tokens} truncated=${truncated} skipped=${skipped}`,
    );

    if (items.length === 0) {
      return json({
        answer: skipped > 0
          ? "None of your recorded meetings have a usable transcript yet — the ones on file captured no clear speech. Once a meeting records properly, I can answer questions about it."
          : "I could not find any transcripts in your meeting history yet. Once a meeting has been recorded and transcribed, I can answer questions about it.",
        citations: [],
        context_meetings: 0,
        context_tokens: 0,
        truncated: false,
      });
    }

    const truncationNote = truncated
      ? "\n\nNOTE: The user has more meetings than fit in context. Only the most recent are included. If the answer may lie in older meetings, say so explicitly."
      : "";

    const systemPrompt =
      `You answer questions about the user's own past meetings, using ONLY the transcripts provided below.\n\n` +
      `Rules:\n` +
      `- Answer only from the transcripts. Never infer, guess, or use outside knowledge.\n` +
      `- If the answer is not present, say so plainly. Do not speculate.\n` +
      `- Cite the meetings you used by their exact id.\n` +
      `- Be concise and specific. Quote briefly when a quote settles the question.\n\n` +
      `Respond as JSON: {"answer": string, "citations": [{"meeting_id": string, "quote": string}]}\n` +
      `The quote must be copied VERBATIM from that meeting's transcript — one sentence, the line that settles the point. Never paraphrase it; a quote that is not word for word cannot be located and will be dropped.` +
      truncationNote +
      `\n\n--- TRANSCRIPTS ---\n${renderContext(items)}`;

    const priorTurns = Array.isArray(history)
      ? history
          .filter(
            (h: any) =>
              (h?.role === "user" || h?.role === "assistant") &&
              typeof h?.content === "string",
          )
          .slice(-10)
      : [];

    const openai = new OpenAI({ apiKey: openaiApiKey });
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        ...priorTurns,
        { role: "user", content: question },
      ],
      response_format: { type: "json_object" },
    });

    let answer = "";
    let citedIds: string[] = [];
    const quotes = new Map<string, string>();
    try {
      const parsed = JSON.parse(completion.choices[0]?.message?.content || "{}");
      answer = String(parsed.answer || "").trim();
      // New shape: [{meeting_id, quote}]. The old cited_meeting_ids is still
      // accepted so a model that answers in the previous format still cites.
      if (Array.isArray(parsed.citations)) {
        for (const c of parsed.citations) {
          const id = String(c?.meeting_id ?? "");
          if (!id) continue;
          citedIds.push(id);
          if (typeof c?.quote === "string" && c.quote.trim()) quotes.set(id, c.quote.trim());
        }
      } else if (Array.isArray(parsed.cited_meeting_ids)) {
        citedIds = parsed.cited_meeting_ids.map(String);
      }
    } catch {
      answer = String(completion.choices[0]?.message?.content || "").trim();
    }
    if (!answer) answer = "I was not able to produce an answer for that question.";

    // Only cite meetings that were actually in context — a model can invent ids.
    const byId = new Map(items.map((m) => [m.meeting_id, m]));
    const uniqueIds = [...new Set(citedIds)].filter((id) => byId.has(id));
    const timestamps = await locateQuotes(supabase, uniqueIds, quotes);
    const citations = uniqueIds.map((id) => {
      const m = byId.get(id)!;
      const quote = quotes.get(id) ?? null;
      return {
        meeting_id: m.meeting_id,
        title: m.title,
        date: m.date,
        quote,
        // Null when the quote was paraphrased and could not be found. A card
        // without a timestamp is honest; an invented one is not.
        ts: timestamps.get(id) ?? null,
      };
    });

    return json({
      answer,
      citations,
      context_meetings: items.length,
      context_tokens: tokens,
      truncated,
    });
  } catch (error) {
    console.error("[chat-transcripts] error:", error);
    // The console line is ephemeral; this is the one that survives to be queried.
    await captureError(error, { fn: "chat-transcripts" });
    return json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500,
    );
  }
}));
