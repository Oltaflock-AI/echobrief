/**
 * The audit trail writer.
 *
 * One module so the shape of an audit row is decided once. Call sites say what
 * happened; they do not get to invent field names, because a trail whose
 * `action` values are ad-hoc strings cannot be queried when it matters.
 *
 * Three rules, all learned from how this kind of thing usually fails:
 *
 *   1. NEVER THROW. A failed audit write must not fail the operation being
 *      audited. Losing a row is bad; refusing to revoke a share link because
 *      the logging failed is worse.
 *   2. NEVER LOG CONTENT. Ids, counts and flags only. This table will be handed
 *      to an auditor and read by support; a transcript excerpt in `metadata`
 *      turns an access log into a second copy of the data it protects.
 *   3. NEVER STORE A RAW CREDENTIAL. Tokens are recorded as a sha256 digest, so
 *      "what else did that leaked link touch?" is answerable without the table
 *      itself becoming the thing that leaks.
 *
 * What is NOT here: reads the dashboard performs. Those go browser → PostgREST
 * under RLS with no function in the path, and Postgres has no SELECT trigger.
 * See the migration comment; closing that gap means routing reads through an
 * API, which is week-8 work.
 */

/** The actions we record. A closed set on purpose — see rule 1 above. */
export type AuditAction =
  // Sharing: every path by which a meeting reaches someone who is not its owner.
  | "share.created"
  | "share.updated"
  | "share.revoked"
  | "share.viewed"
  | "share.asked"
  | "recording.accessed"
  // Credentials.
  | "api_token.created"
  | "api_token.revoked"
  | "oauth.authorized"
  // Workspaces.
  | "org.created"
  | "org.invited"
  | "org.joined"
  | "org.member_removed"
  | "org.role_changed"
  // Destruction. The rows most likely to be asked about.
  | "meeting.deleted"
  | "account.deleted"
  // Bulk reads that DO pass through a function.
  | "transcript.queried"
  | "data.exported";

export type ActorType = "user" | "service" | "share_token" | "api_token" | "anonymous";

export interface AuditEntry {
  action: AuditAction;
  actorType: ActorType;
  actorUserId?: string | null;
  /** Raw token — hashed here, never stored or logged as given. */
  actorToken?: string | null;
  resourceType?: string;
  resourceId?: string | null;
  orgId?: string | null;
  result?: "ok" | "denied" | "error";
  /** Ids, counts, flags. Never content. */
  metadata?: Record<string, unknown>;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Caller network identity, best-effort.
 *
 * Behind Supabase's edge the client address is only in `x-forwarded-for`, and
 * only its first entry is the client — the rest are proxies. A malformed value
 * must yield null rather than a bad inet cast that fails the insert.
 */
export function requestActor(req: Request): { ip: string | null; userAgent: string | null } {
  const forwarded = req.headers.get("x-forwarded-for") ?? "";
  const first = forwarded.split(",")[0]?.trim() ?? "";
  const ip = /^[0-9a-fA-F:.]+$/.test(first) && first.length > 2 ? first : null;
  return { ip, userAgent: req.headers.get("user-agent")?.slice(0, 500) ?? null };
}

/**
 * Write one audit row. Never throws, never rejects.
 *
 * Await it before returning the response: the isolate can be frozen the moment
 * a response is sent, and an un-awaited write is one that sometimes vanishes —
 * which would make the gaps in this table meaningless rather than informative.
 */
export async function recordAudit(
  supabase: any,
  entry: AuditEntry,
  req?: Request,
): Promise<void> {
  try {
    const net = req ? requestActor(req) : { ip: null, userAgent: null };
    const row: Record<string, unknown> = {
      action: entry.action,
      actor_type: entry.actorType,
      actor_user_id: entry.actorUserId ?? null,
      actor_token_id: entry.actorToken ? await sha256Hex(entry.actorToken) : null,
      resource_type: entry.resourceType ?? null,
      resource_id: entry.resourceId ?? null,
      org_id: entry.orgId ?? null,
      result: entry.result ?? "ok",
      ip: net.ip,
      user_agent: net.userAgent,
      metadata: entry.metadata ?? null,
    };
    const { error } = await supabase.from("audit_events").insert(row);
    if (error) {
      // One line, and no rethrow: the caller's operation is not this row's
      // business. A burst of these in function_errors is the signal.
      console.error(`[audit] could not record ${entry.action}: ${error.message}`);
    }
  } catch (err) {
    console.error(`[audit] could not record ${entry.action}: ${err}`);
  }
}
