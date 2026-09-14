/**
 * "Ask this meeting" on a public share link, for a signed-in reader.
 *
 * The share token says which meeting and whether its transcript was shared;
 * the reader's session says who is asking. Both are required: the token alone
 * would let anyone with a forwarded URL spend our LLM budget, and the session
 * alone has no claim on a meeting it does not own. `verify_jwt = true`, and a
 * service-role bearer is refused — there is no backfill that asks questions.
 *
 * The model sees exactly what the share page shows: `publicSegments` — the
 * meeting zone only, speaker + text + time. Not the raw transcript, not the
 * facts, not the owner's other meetings. The rate limit is keyed on the
 * reader's user id at the same LLM preset an owner's chat gets, so a stranger
 * cannot burn budget faster than a customer.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://esm.sh/openai@4.20.1";
import { getCorsHeaders, handleCorsPrelight } from "../_shared/cors.ts";
import { authenticate } from "../_shared/auth.ts";
import { checkRateLimit, createRateLimitResponse, RATE_LIMITS } from "../_shared/rate-limit.ts";
import { hashShareToken, looksLikeShareToken } from "../_shared/share-token.ts";
import { publicSegments, type PublicSegment } from "../_shared/share-view.ts";
import { locateQuoteInSegments } from "../_shared/quote-locate.ts";
import { meterOpenAI, newCostMeter, saveCosts } from "../_shared/cost.ts";
import { recordAudit } from "../_shared/audit.ts";
import { withObservability } from "../_shared/observability.ts";

const MAX_QUESTION_CHARS = 500;
const MAX_HISTORY_TURNS = 10;

function clock(seconds: number | null): string {
  if (seconds === null) return "";
  const total = Math.max(0, Math.round(seconds));
  return `[${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}] `;
}

function renderTranscript(segments: PublicSegment[]): string {
  return segments.map((s) => `${clock(s.start)}${s.speaker}: ${s.text}`).join("\n");
}

serve(withObservability("ask-shared-meeting", async (req) => {
  const corsResponse = handleCorsPrelight(req);
  if (corsResponse) return corsResponse;
  const corsHeaders = getCorsHeaders(req.headers.get("origin"));
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const caller = await authenticate(req, supabase, corsHeaders);
  if (!caller.ok) return caller.response;
  if (caller.isService) return json({ error: "Sign in to ask a question." }, 403);

  const limit = await checkRateLimit(`ask-share:${caller.userId}`, RATE_LIMITS.LLM);
  if (!limit.allowed) return createRateLimitResponse(limit, corsHeaders);

  try {
    const body = await req.json().catch(() => ({}));
    const token = body?.token;
    const question = typeof body?.question === "string" ? body.question.trim().slice(0, MAX_QUESTION_CHARS) : "";
    if (!question) return json({ error: "question is required" }, 400);
    if (!looksLikeShareToken(token)) return json({ error: "This link is not valid." }, 404);

    const { data: share } = await supabase
      .from("meeting_shares")
      .select("id, meeting_id, expires_at, revoked_at, include_transcript")
      .eq("token_hash", await hashShareToken(token))
      .eq("scope", "link")
      .maybeSingle();
    const gone = !share
      || share.revoked_at !== null
      || (share.expires_at !== null && Date.parse(share.expires_at) <= Date.now());
    if (gone) return json({ error: "This link has expired or been revoked." }, 404);
    if (!share.include_transcript) {
      return json({ error: "This link does not include the transcript, so there is nothing to ask." }, 403);
    }

    const { data: meeting } = await supabase
      .from("meetings")
      .select("id, title, content_pruned_at")
      .eq("id", share.meeting_id)
      .maybeSingle();
    if (!meeting || meeting.content_pruned_at) {
      return json({ error: "This meeting is no longer available." }, 404);
    }

    const { data: row } = await supabase
      .from("transcripts")
      .select("speakers")
      .eq("meeting_id", share.meeting_id)
      .maybeSingle();
    const segments = publicSegments(row?.speakers);
    if (segments.length === 0) return json({ error: "This meeting has no transcript to ask." }, 404);

    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiApiKey) return json({ error: "OPENAI_API_KEY not configured" }, 500);
    const meter = newCostMeter(share.meeting_id);
    const openai = meterOpenAI(new OpenAI({ apiKey: openaiApiKey }), meter);

    const systemPrompt =
      `You answer questions about ONE meeting, "${meeting.title}", using ONLY the transcript below.\n\n` +
      `Rules:\n` +
      `- Answer only from the transcript. Never infer, guess, or use outside knowledge.\n` +
      `- If the answer is not present, say so plainly. Do not speculate.\n` +
      `- Be concise and specific. Two or three sentences unless a list is genuinely needed.\n\n` +
      `Respond as JSON: {"answer": string, "quote": string}\n` +
      `The quote must be copied VERBATIM from the transcript — one sentence, the line that settles the point, without the [m:ss] prefix or the speaker name. Empty string if no single line settles it.` +
      `\n\n--- TRANSCRIPT ---\n${renderTranscript(segments)}`;

    const history = Array.isArray(body?.history)
      ? body.history
        .filter((h: any) => (h?.role === "user" || h?.role === "assistant") && typeof h?.content === "string")
        .slice(-MAX_HISTORY_TURNS)
      : [];

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        ...history,
        { role: "user", content: question },
      ],
      response_format: { type: "json_object" },
    });

    let answer = "";
    let quote = "";
    try {
      const parsed = JSON.parse(completion.choices[0]?.message?.content || "{}");
      answer = String(parsed.answer || "").trim();
      quote = typeof parsed.quote === "string" ? parsed.quote.trim() : "";
    } catch {
      answer = String(completion.choices[0]?.message?.content || "").trim();
    }
    if (!answer) answer = "I was not able to produce an answer for that question.";
    const citationSeconds = quote ? locateQuoteInSegments(segments, quote) : null;

    await saveCosts(supabase, meter);
    await recordAudit(supabase, {
      action: "share.asked",
      actorType: "user",
      actorUserId: caller.userId,
      actorToken: token,
      resourceType: "meeting",
      resourceId: share.meeting_id,
      metadata: { share_id: share.id, cited: citationSeconds !== null },
    }, req);

    return json({ answer, citation_seconds: citationSeconds });
  } catch (err) {
    console.error("[ask-shared-meeting]", err);
    return json({ error: "Something went wrong answering that." }, 500);
  }
}));
