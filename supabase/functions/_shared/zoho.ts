/**
 * Zoho CRM client and note builder.
 *
 * Scope of this integration, deliberately narrow: after a meeting, find the
 * Contact or Lead whose email matches an external attendee and attach ONE note.
 * Nothing is created, nothing is edited, no field on a record is touched. A CRM
 * is a sales team's system of record — an integration that invents records in
 * it gets switched off within a week, and the first thing it costs is trust in
 * everything else the product says.
 *
 * WHAT MAY BE WRITTEN. The same boundary as Slack: summary, decisions, action
 * items and next steps, all computed from the MEETING ZONE ONLY
 * (`_shared/zones.ts`). Never the transcript, never coaching, never `facts`
 * quotes. A CRM note is more durable than a Slack message, not less — it
 * outlives the deal and is read by people who were not in the room.
 *
 * ---------------------------------------------------------------------------
 * The datacentre trap
 * ---------------------------------------------------------------------------
 * Zoho runs independent datacentres and **a token minted in one is rejected by
 * all the others**. An India account authorises at accounts.zoho.in and its
 * tokens only work against www.zohoapis.in. The rejection is an ordinary auth
 * error, so a hardcoded domain does not fail loudly at build time — it fails
 * for every customer outside whichever DC we developed against. Every function
 * here therefore takes the domain as an argument, read from the connection row.
 */

/** Accounts (OAuth) host per datacentre code. */
export const ZOHO_ACCOUNTS: Record<string, string> = {
  us: "https://accounts.zoho.com",
  eu: "https://accounts.zoho.eu",
  in: "https://accounts.zoho.in",
  au: "https://accounts.zoho.com.au",
  jp: "https://accounts.zoho.jp",
  ca: "https://accounts.zohocloud.ca",
  cn: "https://accounts.zoho.com.cn",
};

/** API host per datacentre code, used only when a grant omits `api_domain`. */
export const ZOHO_API_DOMAINS: Record<string, string> = {
  us: "https://www.zohoapis.com",
  eu: "https://www.zohoapis.eu",
  in: "https://www.zohoapis.in",
  au: "https://www.zohoapis.com.au",
  jp: "https://www.zohoapis.jp",
  ca: "https://www.zohocloud.ca",
  cn: "https://www.zohoapis.com.cn",
};

/**
 * The datacentre this deployment authorises against, and therefore the console
 * the app is registered in. A Zoho app is registered per DC — the client id
 * from api-console.zoho.in is not a valid client id at accounts.zoho.com — so
 * this is a property of OUR registration, not of the user.
 */
export const ZOHO_HOME_DC = (Deno.env.get("ZOHO_DC") || "in").toLowerCase();

export function accountsHost(dc = ZOHO_HOME_DC): string {
  return ZOHO_ACCOUNTS[dc] ?? ZOHO_ACCOUNTS.in;
}

/**
 * Resolve the API domain for a grant.
 *
 * Preference order matters: what the token response says beats what the
 * callback's `location` hinted at, and both beat our own default — the grant is
 * the only party that actually knows where those tokens work.
 */
export function resolveApiDomain(
  tokenApiDomain?: string | null,
  location?: string | null,
): string {
  const fromToken = String(tokenApiDomain ?? "").trim().replace(/\/$/, "");
  if (/^https:\/\/[\w.-]+$/.test(fromToken)) return fromToken;
  const dc = String(location ?? "").trim().toLowerCase();
  return ZOHO_API_DOMAINS[dc] ?? ZOHO_API_DOMAINS[ZOHO_HOME_DC] ?? ZOHO_API_DOMAINS.in;
}

/**
 * Read scopes for matching, one create scope for the note, and org read so the
 * UI can name the account. Nothing that can modify a record.
 */
export const ZOHO_SCOPES = [
  "ZohoCRM.modules.contacts.READ",
  "ZohoCRM.modules.leads.READ",
  "ZohoCRM.modules.notes.CREATE",
  "ZohoCRM.org.READ",
].join(",");

export class ZohoError extends Error {
  constructor(readonly code: string, readonly status: number, message: string) {
    super(message);
    this.name = "ZohoError";
  }
}

/** Grants that are dead rather than merely failing: the user must reconnect. */
export const FATAL_ZOHO_ERRORS = new Set([
  "INVALID_TOKEN",
  "OAUTH_SCOPE_MISMATCH",
  "invalid_client",
  "invalid_code",
  "invalid_grant",
  "AUTHENTICATION_FAILURE",
]);

export interface ZohoTokens {
  access_token: string;
  refresh_token?: string | null;
  expires_in?: number | null;
  scope?: string | null;
  api_domain: string;
}

async function tokenCall(
  dc: string,
  params: Record<string, string>,
): Promise<Record<string, any>> {
  const res = await fetch(`${accountsHost(dc)}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });
  const data = await res.json().catch(() => ({}));
  // Zoho answers 200 with {error: "invalid_code"} for a failed exchange, so the
  // status alone says nothing.
  if (!res.ok || data?.error) {
    throw new ZohoError(String(data?.error ?? `http_${res.status}`), res.status,
      `Zoho token call failed: ${data?.error ?? res.status}`);
  }
  return data;
}

/** Exchange the authorization code. `location` comes from the callback query. */
export async function exchangeCode(
  clientId: string,
  clientSecret: string,
  code: string,
  redirectUri: string,
  location?: string | null,
): Promise<ZohoTokens> {
  const dc = (location || ZOHO_HOME_DC).toLowerCase();
  const data = await tokenCall(dc, {
    grant_type: "authorization_code",
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    code,
  });
  return {
    access_token: String(data.access_token ?? ""),
    refresh_token: data.refresh_token ?? null,
    expires_in: Number(data.expires_in) || 3600,
    scope: data.scope ?? null,
    api_domain: resolveApiDomain(data.api_domain, location),
  };
}

/**
 * Trade the refresh token for a new access token.
 *
 * Zoho access tokens last an hour, which is shorter than the gap between two of
 * anyone's meetings, so this is the normal path rather than an edge case.
 * Refresh tokens do not expire unless revoked, and a refresh never returns a
 * new one — so the caller must not null the stored refresh token from this
 * response.
 */
export async function refreshAccessToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string,
  location?: string | null,
): Promise<{ access_token: string; expires_in: number }> {
  const data = await tokenCall((location || ZOHO_HOME_DC).toLowerCase(), {
    grant_type: "refresh_token",
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  });
  return {
    access_token: String(data.access_token ?? ""),
    expires_in: Number(data.expires_in) || 3600,
  };
}

async function crmCall(
  apiDomain: string,
  token: string,
  path: string,
  init: RequestInit = {},
): Promise<{ status: number; body: Record<string, any> | null }> {
  const res = await fetch(`${apiDomain}/crm/v8${path}`, {
    ...init,
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  // **204 with an EMPTY BODY is Zoho's "no results"** for a search, and it is
  // also what several endpoints return on success-with-nothing-to-say. Calling
  // .json() on it throws, which would turn "this attendee is not in your CRM"
  // — the single most common outcome of this integration — into a crash.
  if (res.status === 204) return { status: 204, body: null };

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const code = String(body?.code ?? body?.error ?? `http_${res.status}`);
    throw new ZohoError(code, res.status, `Zoho ${path} failed: ${code}`);
  }
  return { status: res.status, body };
}

export interface ZohoRecord { id: string; module: string; name: string; email: string }

/**
 * Find the Contact, else the Lead, matching an email.
 *
 * Contacts are searched first on purpose: a person who exists as both is
 * further along, and the note belongs on the record the team actually works.
 */
export async function findRecordByEmail(
  apiDomain: string,
  token: string,
  email: string,
): Promise<ZohoRecord | null> {
  const clean = email.trim().toLowerCase();
  if (!clean.includes("@")) return null;

  for (const module of ["Contacts", "Leads"]) {
    const { body } = await crmCall(
      apiDomain,
      token,
      `/${module}/search?email=${encodeURIComponent(clean)}`,
    );
    const hit = Array.isArray(body?.data) ? body.data[0] : null;
    if (hit?.id) {
      return {
        id: String(hit.id),
        module,
        name: String(hit.Full_Name ?? hit.Last_Name ?? hit.Company ?? clean),
        email: clean,
      };
    }
  }
  return null;
}

/** Attach a note to a record. Returns Zoho's id for the note. */
export async function createNote(
  apiDomain: string,
  token: string,
  module: string,
  recordId: string,
  title: string,
  content: string,
): Promise<string> {
  const { body } = await crmCall(apiDomain, token, `/${module}/${recordId}/Notes`, {
    method: "POST",
    body: JSON.stringify({ data: [{ Note_Title: title, Note_Content: content }] }),
  });
  const row = Array.isArray(body?.data) ? body.data[0] : null;
  // A per-row failure arrives inside a 200/201 envelope, so the HTTP status is
  // not the answer here either.
  if (row?.status && row.status !== "success") {
    throw new ZohoError(String(row.code ?? "note_failed"), 200, String(row.message ?? "note failed"));
  }
  return String(row?.details?.id ?? "");
}

/** The connected org, for the Settings label. Best effort — never blocks a grant. */
export async function fetchOrg(
  apiDomain: string,
  token: string,
): Promise<{ id: string; name: string } | null> {
  try {
    const { body } = await crmCall(apiDomain, token, "/org");
    const org = Array.isArray(body?.org) ? body.org[0] : null;
    return org ? { id: String(org.id ?? ""), name: String(org.company_name ?? "") } : null;
  } catch {
    return null;
  }
}

/* ── the note ───────────────────────────────────────────────────────────── */

const NOTE_LIMIT = 32000;

function bullets(items: unknown, pick: (o: Record<string, unknown>) => string, max: number): string[] {
  if (!Array.isArray(items)) return [];
  return items
    .map((i) => (typeof i === "string" ? i.trim() : pick((i ?? {}) as Record<string, unknown>).trim()))
    .filter(Boolean)
    .slice(0, max);
}

/**
 * Build the note body. Pure, so it is unit-tested against the shapes the
 * pipeline actually emits.
 *
 * Plain text with `-` bullets, not HTML and not markdown: Zoho renders the note
 * body as text in most surfaces, so markup arrives as literal asterisks in
 * front of the one person this feature exists for.
 */
export function buildNote(
  meeting: { id: string; title?: string | null; start_time?: string | null },
  insights: Record<string, any>,
  appUrl: string,
  meetingDate: string,
): { title: string; content: string } {
  const name = String(meeting.title || "Meeting").trim();
  const title = `EchoBrief — ${name}${meetingDate ? ` (${meetingDate})` : ""}`.slice(0, 120);

  const parts: string[] = [];
  const summary = String(insights?.summary_short || insights?.summary || "").trim();
  if (summary) parts.push(summary);

  const decisions = bullets(insights?.decisions, (o) => String(o.decision ?? o.text ?? o.title ?? ""), 10);
  if (decisions.length) parts.push(`Decisions:\n${decisions.map((d) => `- ${d}`).join("\n")}`);

  const actions = bullets(insights?.action_items, (o) => {
    const task = String(o.task ?? o.text ?? o.title ?? "");
    const tail = [String(o.owner ?? o.assignee ?? ""), String(o.due_date ?? o.due ?? "")]
      .map((t) => t.trim()).filter(Boolean).join(", ");
    return task && tail ? `${task} (${tail})` : task;
  }, 15);
  if (actions.length) parts.push(`Action items:\n${actions.map((a) => `- ${a}`).join("\n")}`);

  const next = bullets(insights?.follow_ups, (o) => String(o.description ?? o.text ?? ""), 10);
  if (next.length) parts.push(`Next steps:\n${next.map((n) => `- ${n}`).join("\n")}`);

  parts.push(`Full report: ${appUrl.replace(/\/$/, "")}/meeting/${meeting.id}`);

  const content = parts.join("\n\n");
  return { title, content: content.length > NOTE_LIMIT ? content.slice(0, NOTE_LIMIT - 1) + "…" : content };
}
