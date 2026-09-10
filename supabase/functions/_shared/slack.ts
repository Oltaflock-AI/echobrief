/**
 * Slack client and message builder.
 *
 * Slack was in this product once and was removed on 2026-08-20 because it was
 * never really built: a single global SLACK_BOT_TOKEN posted for everyone, the
 * UI asked for a raw channel ID, and Disconnect did nothing. The token now
 * belongs to a per-user connection row, sealed at rest, and everything below
 * takes it as an argument — there is deliberately no module-level token to fall
 * back on, because that is precisely how one workspace's token came to serve
 * every customer.
 *
 * WHAT MAY BE POSTED. A Slack channel is a room full of people, which makes it
 * the least forgiving delivery surface in the product. Only the summary, one
 * highlight drawn from `key_points`, the decisions, the action items and the
 * next steps go out —
 * fields the pipeline already computes from the MEETING ZONE ONLY
 * (`_shared/zones.ts`), so internal pre/post-meeting speech cannot reach it. The
 * transcript never goes to Slack, and neither does anything derived from the
 * internal zones: coaching, attendee emails. `facts` stays out too, deliberately
 * — its quotes are people's exact words, whereas `key_points` is already written
 * for an audience.
 */

import { formatISTDate, formatISTTime } from "./time.ts";

const SLACK_API = "https://slack.com/api";

export interface SlackTokens {
  access_token: string;
  refresh_token?: string | null;
  expires_in?: number | null;
  scope?: string | null;
  team_id: string;
  team_name?: string | null;
  bot_user_id?: string | null;
  authed_user_id?: string | null;
}

export class SlackError extends Error {
  constructor(readonly slackCode: string, message: string) {
    super(message);
    this.name = "SlackError";
  }
}

/**
 * Slack answers 200 with `{ok: false, error: "..."}` for real failures, so the
 * HTTP status tells you almost nothing. Every call goes through here.
 */
async function call(
  method: string,
  token: string | null,
  body: Record<string, unknown>,
  form = false,
): Promise<Record<string, any>> {
  const headers: Record<string, string> = {
    "Content-Type": form
      ? "application/x-www-form-urlencoded"
      : "application/json; charset=utf-8",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${SLACK_API}/${method}`, {
    method: "POST",
    headers,
    body: form
      ? new URLSearchParams(body as Record<string, string>).toString()
      : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!data?.ok) {
    throw new SlackError(
      String(data?.error ?? `http_${res.status}`),
      `Slack ${method} failed: ${data?.error ?? res.status}`,
    );
  }
  return data;
}

/** Exchange the OAuth code for a bot token. */
export async function exchangeCode(
  clientId: string,
  clientSecret: string,
  code: string,
  redirectUri: string,
): Promise<SlackTokens> {
  const data = await call("oauth.v2.access", null, {
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
  }, true);

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? null,
    expires_in: data.expires_in ?? null,
    scope: data.scope ?? null,
    team_id: data.team?.id ?? "",
    team_name: data.team?.name ?? null,
    bot_user_id: data.bot_user_id ?? null,
    authed_user_id: data.authed_user?.id ?? null,
  };
}

/**
 * Channels the bot can post to. Public channels plus any private channel the
 * bot has been invited to — Slack only returns private channels the token can
 * actually see, so this list is exactly "where this will work", which is the
 * whole point of a picker over a pasted ID.
 */
export async function listChannels(
  token: string,
  limit = 200,
): Promise<Array<{ id: string; name: string; is_private: boolean }>> {
  const out: Array<{ id: string; name: string; is_private: boolean }> = [];
  let cursor = "";
  // Bounded: three pages is 600 channels, past which a picker is the wrong UI
  // anyway and the user should be typing a name.
  for (let page = 0; page < 3; page++) {
    const data = await call("conversations.list", token, {
      types: "public_channel,private_channel",
      exclude_archived: true,
      limit,
      ...(cursor ? { cursor } : {}),
    }, true);
    for (const c of data.channels ?? []) {
      out.push({ id: c.id, name: c.name, is_private: !!c.is_private });
    }
    cursor = data.response_metadata?.next_cursor ?? "";
    if (!cursor) break;
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

function truncate(text: string, max: number): string {
  const clean = (text ?? "").trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, max - 1).trimEnd() + "…";
}

/** Slack rejects any single text block over 3000 characters. */
const BLOCK_LIMIT = 3000;
/** A header is plain_text and capped much lower. */
const HEADER_LIMIT = 150;

/** Escape the three characters Slack's mrkdwn parser treats as markup. */
function esc(text: string): string {
  return String(text ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** "57 min", "1 h 32 min", or "" when the duration is unknown. */
function formatDuration(seconds: number | null | undefined): string {
  const s = Number(seconds);
  if (!Number.isFinite(s) || s < 60) return "";
  const mins = Math.round(s / 60);
  if (mins < 90) return `${mins} min`;
  return `${Math.floor(mins / 60)} h ${mins % 60} min`;
}

interface ActionItem { text: string; owner: string; due: string; urgent: boolean }

/**
 * Action items have been plain strings in some meetings and
 * `{task, owner, due_date, priority}` objects in others since the two-pass
 * rewrite. A renderer that assumes one of them posts "[object Object]" into a
 * team channel, so both shapes are handled here and nowhere else.
 */
function asActionItems(items: unknown, max: number): ActionItem[] {
  if (!Array.isArray(items)) return [];
  const out: ActionItem[] = [];
  for (const item of items) {
    // Checked at the TOP: the string branch below `continue`s, so a cap tested
    // only at the bottom silently never applies to string-shaped items.
    if (out.length >= max) break;
    if (typeof item === "string") {
      if (item.trim()) out.push({ text: item.trim(), owner: "", due: "", urgent: false });
      continue;
    }
    if (item && typeof item === "object") {
      const o = item as Record<string, unknown>;
      const text = String(o.task ?? o.text ?? o.title ?? o.description ?? "").trim();
      if (!text) continue;
      out.push({
        text,
        owner: String(o.owner ?? o.assignee ?? "").trim(),
        due: String(o.due_date ?? o.due ?? "").trim(),
        urgent: String(o.priority ?? "").toLowerCase() === "high",
      });
    }
  }
  return out;
}

/**
 * Decisions arrive as `Decision (Owner) — "the verbatim sentence that settled
 * it"`. The quote is the evidence, and it belongs in the report; in a channel
 * it doubles the length of every line and puts someone's exact words in front
 * of a room. Trimmed only when a real decision is left behind — a line that is
 * mostly quote keeps it rather than being gutted to nothing.
 */
function stripQuoteTail(line: string): string {
  const trimmed = line.replace(/\s*[—–-]+\s*["\u201C\u2018'][\s\S]*$/, "").trim();
  return trimmed.length >= 25 ? trimmed : line;
}

/** Decisions and other list fields that are strings or single-key objects. */
function asLines(items: unknown, max: number): string[] {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (item && typeof item === "object") {
        const o = item as Record<string, unknown>;
        return String(o.decision ?? o.statement ?? o.text ?? o.title ?? o.task ?? "").trim();
      }
      return "";
    })
    .filter(Boolean)
    .map(stripQuoteTail)
    .slice(0, max);
}

/** Normalised for comparison only: punctuation and case carry no meaning here. */
function sameText(a: string, b: string): boolean {
  const n = (t: string) => t.toLowerCase().replace(/[^a-z0-9]/g, "");
  return n(a) === n(b) && n(a).length > 0;
}

/**
 * Next steps, from `follow_ups`, minus anything already listed as an action
 * item.
 *
 * The pipeline emits both, and measured across the last eight meetings they
 * overlap about half the time — "Look into Travify's features" arrived as an
 * action item and again, word for word, as a follow-up. Printing both would
 * make the post look padded and, worse, make a reader wonder whether they are
 * two different tasks. When everything overlaps the section is empty and is
 * omitted entirely, which is the correct outcome: there was nothing to add.
 */
function asNextSteps(
  followUps: unknown,
  actions: ActionItem[],
  max: number,
): Array<{ text: string; who: string }> {
  if (!Array.isArray(followUps)) return [];
  const out: Array<{ text: string; who: string }> = [];
  for (const item of followUps) {
    if (out.length >= max) break;
    const text = typeof item === "string"
      ? item.trim()
      : String((item as Record<string, unknown>)?.description ?? "").trim();
    if (!text) continue;
    if (actions.some((a) => sameText(a.text, text))) continue;
    if (out.some((o) => sameText(o.text, text))) continue;
    const who = typeof item === "string"
      ? ""
      : String((item as Record<string, unknown>)?.assignee ?? "").trim();
    out.push({ text, who });
  }
  return out;
}

/**
 * The one line worth remembering, drawn from `key_points`.
 *
 * A number is what people quote back at each other afterwards — a price, a
 * headcount, a deadline — so a key point containing one wins over one that does
 * not. Deterministic on purpose: this runs unattended on every meeting and a
 * second LLM call to choose a sentence would be cost and latency for a decision
 * a regex settles.
 *
 * It comes from `key_points` rather than `facts` so nothing verbatim leaves for
 * Slack. `facts` quotes are someone's exact words; a channel is a room full of
 * people, and the summary fields are already written for an audience.
 */
export function pickHighlight(insights: Record<string, any>): string {
  const points = (Array.isArray(insights?.key_points) ? insights.key_points : [])
    .map((p: unknown) => String(p ?? "").trim())
    .filter(Boolean);
  if (!points.length) return "";
  const withNumber = points.find((p: string) => /\d/.test(p));
  return withNumber ?? points[0];
}

/** How many distinct speakers the metrics saw, or 0 when unknown. */
function speakerCount(insights: Record<string, any>): number {
  const share = insights?.meeting_metrics?.speaker_participation;
  return share && typeof share === "object" ? Object.keys(share).length : 0;
}

export interface SlackMeeting {
  id: string;
  title?: string | null;
  start_time?: string | null;
  duration_seconds?: number | null;
}

/**
 * Build the Slack message. Pure, so it is unit-tested against the shapes the
 * pipeline actually emits.
 *
 * Five sections, in the order a reader needs them: what happened, the one line
 * worth remembering, what was decided, who owes what, and what happens next. Empty sections are
 * OMITTED rather than printed with "None" — a channel post that says
 * "Decisions: none" three times a day trains people to stop reading it, and
 * most meetings genuinely decide nothing.
 */
export function buildSummaryMessage(
  meeting: SlackMeeting,
  insights: Record<string, any>,
  appUrl: string,
): { text: string; blocks: unknown[] } {
  const title = truncate(String(meeting.title || "Meeting"), HEADER_LIMIT);
  const summary = truncate(
    String(insights?.summary_short || insights?.summary || "").trim(),
    BLOCK_LIMIT - 200,
  );
  const highlight = pickHighlight(insights);
  const decisions = asLines(insights?.decisions, 6);
  const actions = asActionItems(insights?.action_items, 6);
  const totalActions = Array.isArray(insights?.action_items) ? insights.action_items.length : 0;
  const nextSteps = asNextSteps(insights?.follow_ups, actions, 4);
  const link = `${appUrl.replace(/\/$/, "")}/meeting/${meeting.id}`;

  const blocks: unknown[] = [
    { type: "header", text: { type: "plain_text", text: title, emoji: true } },
  ];

  // Context line: when, how long, how many voices. Every part is optional
  // because uploaded meetings have no start time and short ones no duration.
  const meta: string[] = [];
  if (meeting.start_time) {
    const day = formatISTDate(meeting.start_time, { weekday: "short", month: "short", day: "numeric" });
    const time = formatISTTime(meeting.start_time);
    if (day) meta.push(`:calendar: ${day}${time ? `, ${time}` : ""}`);
  }
  const duration = formatDuration(meeting.duration_seconds);
  if (duration) meta.push(`:stopwatch: ${duration}`);
  const speakers = speakerCount(insights);
  if (speakers) meta.push(`:busts_in_silhouette: ${speakers} ${speakers === 1 ? "speaker" : "speakers"}`);
  if (meta.length) {
    blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: meta.join("  ·  ") }] });
  }

  blocks.push({ type: "divider" });

  if (summary) {
    blocks.push({ type: "section", text: { type: "mrkdwn", text: `*Summary*\n${esc(summary)}` } });
  }

  if (highlight) {
    // A blockquote, so the eye lands on it even when the summary above is long.
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: truncate(`:bulb: *Highlight*\n>${esc(highlight)}`, BLOCK_LIMIT) },
    });
  }

  if (decisions.length) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: truncate(
          `:white_check_mark: *Decisions*\n${decisions.map((d) => `•  ${esc(d)}`).join("\n")}`,
          BLOCK_LIMIT,
        ),
      },
    });
  }

  if (actions.length) {
    const lines = actions.map((a) => {
      // Owner and due date are metadata about the task, so they sit after an
      // em dash in italics rather than competing with the task itself.
      const tail = [a.owner, a.due].filter(Boolean).join(" · ");
      const flag = a.urgent ? ":exclamation: " : "";
      return `•  ${flag}*${esc(a.text)}*${tail ? `  _— ${esc(tail)}_` : ""}`;
    });
    if (totalActions > actions.length) {
      lines.push(`_…and ${totalActions - actions.length} more_`);
    }
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: truncate(`:pushpin: *Action items*\n${lines.join("\n")}`, BLOCK_LIMIT) },
    });
  }

  if (nextSteps.length) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: truncate(
          `:arrow_right: *Next steps*\n${
            nextSteps.map((n) => `•  ${esc(n.text)}${n.who ? `  _— ${esc(n.who)}_` : ""}`).join("\n")
          }`,
          BLOCK_LIMIT,
        ),
      },
    });
  }

  blocks.push({
    type: "context",
    elements: [{ type: "mrkdwn", text: `<${link}|Open the full report in EchoBrief>` }],
  });

  // `text` is the notification preview and the accessible fallback; a message
  // with blocks but no text shows as a blank line in the sidebar and in
  // notifications.
  const preview = summary || highlight;
  const text = preview ? `${title} — ${truncate(preview, 200)}` : title;
  return { text, blocks };
}

export async function postMessage(
  token: string,
  channel: string,
  message: { text: string; blocks: unknown[] },
): Promise<{ ts: string }> {
  const data = await call("chat.postMessage", token, {
    channel,
    text: message.text,
    blocks: message.blocks,
    unfurl_links: false,
  });
  return { ts: String(data.ts ?? "") };
}

/**
 * Errors that mean the connection is dead rather than the request being bad.
 * These flip `needs_reconnect` so the UI can ask for a reconnect instead of
 * failing quietly forever.
 */
export const FATAL_SLACK_ERRORS = new Set([
  "invalid_auth",
  "token_revoked",
  "account_inactive",
  "token_expired",
  "not_authed",
]);

/** Errors the user can fix in Slack without reconnecting. */
export const CHANNEL_ERRORS = new Set([
  "channel_not_found",
  "not_in_channel",
  "is_archived",
  "restricted_action",
]);

/**
 * Revoke the bot token in Slack.
 *
 * Disconnect deletes our row either way — the old integration's Disconnect
 * button never wrote to the database at all, and "connected" must mean "a row
 * exists" and nothing else. This is the courtesy half: without it the app stays
 * installed in the workspace with a live token that nothing will ever use.
 * Best-effort by design; the caller must not fail a disconnect on it.
 */
export async function revokeToken(token: string): Promise<void> {
  await call("auth.revoke", token, {}, true);
}
