/**
 * ClickUp client and Chat message builder.
 *
 * The second "summary to the team room" destination after Slack, built when
 * the company moved its own operations to ClickUp. Same rules as `slack.ts`:
 * the token belongs to a per-user connection row (sealed at rest) and every
 * function below takes it as an argument — there is deliberately no
 * module-level token. WHAT MAY BE POSTED is decided once, in
 * `summary-content.ts`: summary, one highlight, decisions, action items, next
 * steps — meeting-zone fields only. Never the transcript, coaching, `facts`
 * or attendee emails.
 *
 * Where ClickUp differs from Slack, and why the code looks the way it does:
 *
 *  - Chat is in the v3 API and every path is scoped to a WORKSPACE id, while
 *    OAuth lives in v2. One grant can cover several workspaces (the consent
 *    screen lets the user tick them), so the channel picker walks all of them
 *    and the chosen channel stores its workspace alongside.
 *  - Failures are HTTP statuses, not `{ok:false}` in a 200. The body carries
 *    `err` + `ECODE` on v2 and `message` on v3; both are kept on the error.
 *  - Messages are markdown (`content_format: "text/md"`), not Block Kit.
 *  - OAuth tokens never expire (per the docs, "subject to change") and there
 *    is no refresh token and no revoke endpoint. Disconnect is our row only.
 */

import { formatISTDate, formatISTTime } from "./time.ts";
import {
  asActionItems,
  asLines,
  asNextSteps,
  formatDuration,
  pickHighlight,
  speakerCount,
  truncate,
} from "./summary-content.ts";

const API_V2 = "https://api.clickup.com/api/v2";
const API_V3 = "https://api.clickup.com/api/v3";

export class ClickUpError extends Error {
  constructor(
    readonly status: number,
    readonly ecode: string,
    message: string,
  ) {
    super(message);
    this.name = "ClickUpError";
  }
}

/** Every call goes through here so the two error shapes are read in one place. */
async function call(
  url: string,
  token: string | null,
  init: { method?: string; body?: unknown } = {},
): Promise<Record<string, any>> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, {
    method: init.method ?? "GET",
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const ecode = String(data?.ECODE ?? data?.ecode ?? "");
    const detail = String(data?.err ?? data?.message ?? data?.error ?? res.statusText ?? "");
    throw new ClickUpError(res.status, ecode, `ClickUp ${res.status}${ecode ? ` ${ecode}` : ""}: ${detail}`);
  }
  return data;
}

/** The grant is dead: reconnecting is the only fix. */
export function isFatal(err: unknown): boolean {
  return err instanceof ClickUpError && (err.status === 401 || err.ecode.startsWith("OAUTH_"));
}

/** The workspace is fine; the chosen channel is not there any more. */
export function isChannelGone(err: unknown): boolean {
  return err instanceof ClickUpError && err.status === 404;
}

/**
 * Exchange the OAuth code for an access token.
 *
 * ClickUp takes the three parameters as a query string on a POST and answers
 * `{ access_token, token_type }` — no expiry, no refresh token.
 */
export async function exchangeCode(
  clientId: string,
  clientSecret: string,
  code: string,
): Promise<{ access_token: string }> {
  const params = new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code });
  const data = await call(`${API_V2}/oauth/token?${params.toString()}`, null, { method: "POST" });
  return { access_token: String(data.access_token ?? "") };
}

export interface ClickUpWorkspace { id: string; name: string }

/** Workspaces this grant covers — what the user ticked on the consent screen. */
export async function listWorkspaces(token: string): Promise<ClickUpWorkspace[]> {
  const data = await call(`${API_V2}/team`, token);
  return (Array.isArray(data.teams) ? data.teams : [])
    .map((t: Record<string, unknown>) => ({ id: String(t.id ?? ""), name: String(t.name ?? "") }))
    .filter((t: ClickUpWorkspace) => t.id);
}

/** The user who granted access, for "connected as". */
export async function getAuthorizedUser(
  token: string,
): Promise<{ id: string; email: string | null }> {
  const data = await call(`${API_V2}/user`, token);
  return { id: String(data.user?.id ?? ""), email: data.user?.email ? String(data.user.email) : null };
}

export interface ClickUpChannel {
  id: string;
  name: string;
  is_private: boolean;
  workspace_id: string;
  workspace_name: string;
}

/**
 * Chat channels in one workspace. DMs and group DMs are listed by the same
 * endpoint and are filtered out: a meeting summary belongs in a room the team
 * chose, not in somebody's private conversation.
 */
async function listWorkspaceChannels(
  token: string,
  workspace: ClickUpWorkspace,
): Promise<ClickUpChannel[]> {
  const out: ClickUpChannel[] = [];
  let cursor = "";
  // Bounded: three pages of 100 is past the point where a picker is the right UI.
  for (let page = 0; page < 3; page++) {
    const params = new URLSearchParams({ limit: "100" });
    if (cursor) params.set("cursor", cursor);
    const data = await call(
      `${API_V3}/workspaces/${encodeURIComponent(workspace.id)}/chat/channels?${params.toString()}`,
      token,
    );
    for (const c of Array.isArray(data.data) ? data.data : []) {
      if (String(c.type ?? "CHANNEL").toUpperCase() !== "CHANNEL") continue;
      const name = String(c.name ?? "").trim();
      if (!c.id || !name) continue;
      out.push({
        id: String(c.id),
        name,
        is_private: String(c.visibility ?? "").toUpperCase() === "PRIVATE",
        workspace_id: workspace.id,
        workspace_name: workspace.name,
      });
    }
    cursor = String(data.next_cursor ?? "");
    if (!cursor) break;
  }
  return out;
}

/**
 * Channels across every authorised workspace, sorted by workspace then name.
 * Exactly "where this will work", which is the whole point of a picker.
 */
export async function listChannels(
  token: string,
  workspaces: ClickUpWorkspace[],
): Promise<ClickUpChannel[]> {
  const all: ClickUpChannel[] = [];
  for (const ws of workspaces) {
    all.push(...await listWorkspaceChannels(token, ws));
  }
  return all.sort((a, b) =>
    a.workspace_name.localeCompare(b.workspace_name) || a.name.localeCompare(b.name)
  );
}

export interface ClickUpMeeting {
  id: string;
  title?: string | null;
  start_time?: string | null;
  duration_seconds?: number | null;
}

/** ClickUp caps message content at 40,000 characters; we stay far under it. */
const CONTENT_LIMIT = 12000;

/** Markdown characters that would turn a summary sentence into formatting. */
function esc(text: string): string {
  return String(text ?? "").replace(/([*_`~#>\[\]])/g, "\\$1");
}

/**
 * Build the Chat message as markdown. Pure, so it is unit-tested against the
 * shapes the pipeline actually emits.
 *
 * Same five sections in the same order as the Slack post — what happened, the
 * one line worth remembering, what was decided, who owes what, what happens
 * next — and empty sections are omitted rather than printed with "None".
 */
export function buildSummaryMessage(
  meeting: ClickUpMeeting,
  insights: Record<string, any>,
  appUrl: string,
): string {
  const title = truncate(String(meeting.title || "Meeting"), 150);
  const summary = truncate(String(insights?.summary_short || insights?.summary || "").trim(), 2800);
  const highlight = pickHighlight(insights);
  const decisions = asLines(insights?.decisions, 6);
  const actions = asActionItems(insights?.action_items, 6);
  const totalActions = Array.isArray(insights?.action_items) ? insights.action_items.length : 0;
  const nextSteps = asNextSteps(insights?.follow_ups, actions, 4);
  const link = `${appUrl.replace(/\/$/, "")}/meeting/${meeting.id}`;

  const parts: string[] = [`**${esc(title)}**`];

  const meta: string[] = [];
  if (meeting.start_time) {
    const day = formatISTDate(meeting.start_time, { weekday: "short", month: "short", day: "numeric" });
    const time = formatISTTime(meeting.start_time);
    if (day) meta.push(`📅 ${day}${time ? `, ${time}` : ""}`);
  }
  const duration = formatDuration(meeting.duration_seconds);
  if (duration) meta.push(`⏱ ${duration}`);
  const speakers = speakerCount(insights);
  if (speakers) meta.push(`👥 ${speakers} ${speakers === 1 ? "speaker" : "speakers"}`);
  if (meta.length) parts.push(meta.join("  ·  "));

  if (summary) parts.push(`**Summary**\n${esc(summary)}`);

  if (highlight) parts.push(`💡 **Highlight**\n> ${esc(highlight)}`);

  if (decisions.length) {
    parts.push(`✅ **Decisions**\n${decisions.map((d) => `- ${esc(d)}`).join("\n")}`);
  }

  if (actions.length) {
    const lines = actions.map((a) => {
      const tail = [a.owner, a.due].filter(Boolean).join(" · ");
      const flag = a.urgent ? "❗ " : "";
      return `- ${flag}**${esc(a.text)}**${tail ? ` — _${esc(tail)}_` : ""}`;
    });
    if (totalActions > actions.length) lines.push(`_…and ${totalActions - actions.length} more_`);
    parts.push(`📌 **Action items**\n${lines.join("\n")}`);
  }

  if (nextSteps.length) {
    parts.push(
      `➡️ **Next steps**\n${
        nextSteps.map((n) => `- ${esc(n.text)}${n.who ? ` — _${esc(n.who)}_` : ""}`).join("\n")
      }`,
    );
  }

  parts.push(`[Open the full report in EchoBrief](${link})`);

  return truncate(parts.join("\n\n"), CONTENT_LIMIT);
}

export async function postMessage(
  token: string,
  workspaceId: string,
  channelId: string,
  content: string,
): Promise<{ id: string }> {
  const data = await call(
    `${API_V3}/workspaces/${encodeURIComponent(workspaceId)}/chat/channels/${encodeURIComponent(channelId)}/messages`,
    token,
    { method: "POST", body: { type: "message", content, content_format: "text/md" } },
  );
  return { id: String(data.id ?? "") };
}
