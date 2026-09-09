# Security Model

> What protects what, where the boundaries are, and the two places where getting it
> wrong would leak another user's meeting content.

- [Threat model in one paragraph](#threat-model-in-one-paragraph)
- [Threat model in detail](#threat-model-in-detail)
- [Authentication](#authentication)
- [Row Level Security](#row-level-security)
- [Edge Function authentication](#edge-function-authentication)
- [Webhook verification](#webhook-verification)
- [Secrets](#secrets)
- [CORS and rate limiting](#cors-and-rate-limiting)
- [Data handling](#data-handling)

---

## Threat model in one paragraph

EchoBrief stores the full text of private conversations. The realistic threats are, in
order: (1) one authenticated user reading another user's meetings, (2) an unauthenticated
caller reaching an Edge Function that assumes it was called by the platform, (3) a
forged webhook injecting a fake transcript or status, and (4) credential leakage
between the two hosting accounts. Everything below exists for one of those four.

---

## Threat model in detail

The paragraph above is the summary. This is the working version: what is worth stealing,
who could reach it, what stops them, and — the column that matters — **what would fail if
the control regressed**. A control with no test beside it is a control nobody will notice
losing.

**Assets, roughly in order of how much damage losing one does:** OAuth refresh tokens
(live calendar access until the customer revokes it, and they will not know to);
transcripts and insights (the full text of private conversations); recordings (the mp4 is
the *whole* call, including waiting-room audio); personal access tokens (full read of one
account's meetings); attendee names and emails; billing state.

**Trust boundaries.** The anon key is shipped to the browser deliberately, so the browser
is *outside* the boundary and **RLS is the access control, not a second layer**. The
service role is inside it and bypasses RLS entirely. A share link holder has no account at
all. Third parties (Recall, Sarvam, OpenAI, Resend, Dodo, Google, Microsoft) each see some
slice of content. The repository itself is **public**, so anything committed is published.

| # | Threat | Control | Proven by | Residual gap |
|---|---|---|---|---|
| T1 | One authenticated user reads another's meetings | RLS on every user-scoped table; meeting-scoped tables joined through the owning meeting | `npm run test:rls` — 69 assertions, with a positive and a detection control so a green run cannot be vacuous | RLS is only as good as the newest policy. The suite is not in CI (it creates real users), so it depends on someone running it |
| T2 | An unauthenticated caller reaches a function that assumes the platform called it | `verify_jwt = true` by default; `authenticate()` reads the `role` claim rather than comparing bearers | The nine `verify_jwt = false` functions are enumerable from `config.toml` and each has its own verification | Enumerated by hand until 2026-09-07, when the list turned out to be missing two entries |
| T3 | A forged webhook injects a fake transcript, status or subscription | Recall signature over the **raw body**; Sarvam callback `auth_token`; Dodo Standard-Webhooks HMAC | Pipeline harness scenarios for replay and concurrency; `dodo-webhook` answering 401 to a bogus signature proves the secret is loaded | A webhook secret that silently goes missing degrades to a 503, not a 401 — the difference is the health check |
| T4 | A leaked service-role key or database dump reads every transcript | OAuth tokens are sealed with AES-256-GCM before they reach Postgres | `crypto_test.ts` (13 tests); `scripts/backfill-token-encryption.ts --verify` | **Transcripts and insights are not column-encrypted.** Anyone holding the service-role key reads them. Deliberate, and revisitable |
| T5 | Two live service-role credentials widen the blast radius | Code never string-compares a bearer, so either key authenticates correctly | `two-service-role-jwts` is the reason `authenticate()` exists in its current shape | Both keys remain valid; the legacy one does not expire until 2036 |
| T6 | A share link leaks more than the sharer intended | Both columns default `false` server-side (an omitted flag narrows); the dialog defaults them **on** and shows what the one live link carries, so reach is visible rather than guessed; the transcript is whitelisted field-by-field and trimmed to the meeting zone | `share_view_test.ts`, `share_token_test.ts`; the RLS suite rejects a random token and a JWT pasted into the share URL | **Zones cannot protect the recording** — the mp4 is the whole call, which is why it is a separate switch with its own warning |
| T7 | A stolen personal access token reads an account's meetings | Tokens are stored as a sha256 digest and shown once; the MCP endpoint mints a 60-second user JWT so **RLS** does the scoping, never a service client with a `user_id` filter | `api_tokens_test.ts`; the MCP contract test | Revoking a PAT does not kill an already-issued OAuth refresh token |
| T8 | A credential is committed to a public repository | `githooks/pre-commit` blocks credential-shaped values in `console.*`; history scanned clean, two dead historical keys | `scripts/secret-log-check.mjs` | The hook covers logging, not every possible commit of a secret |
| T9 | Unused credentials sitting in a hosting account | — | The inventory below | 13 unused variables in Vercel production, including `POSTGRES_PASSWORD`, which is direct database access that bypasses RLS |

**Explicitly out of scope**, so that it is a decision rather than an omission: a malicious
Supabase or Vercel employee; a compromised third-party provider replaying content it was
legitimately given; and a user who chooses to share their own meeting.

---

## Authentication

Supabase Auth issues JWTs. The frontend holds a session; `ProtectedRoute` gates every
authenticated page. New signups are currently **disabled** in production — access is
via the `waitlist` table and manual invitation.

**Password recovery** is the one flow with a routing subtlety. `isPasswordRecovery`
lives in `AuthContext` and is the single source of truth: it is set synchronously from
URL params on init — *before* Supabase clears the hash — and also on the
`PASSWORD_RECOVERY` auth event. Supabase's recovery token exchange auto-authenticates
the user, so any routing logic must check recovery state **before** checking for an
active session. Otherwise the user is redirected straight to the dashboard and never
sees the "set new password" form.

---

## Row Level Security

Every user-scoped table enforces `auth.uid() = user_id`. The anon key is shipped to
the browser by design — **RLS is the actual access control**, not a second layer.

`monitor_events` is service-role only, with no user-facing policy.

Tables that hang off a meeting rather than carrying a `user_id` — `transcripts`,
`meeting_insights`, `meeting_costs`, `meeting_shares`, `email_deliveries` — are scoped
through the owning meeting instead. That distinction matters when reasoning about a
policy: for those tables, "who owns this row" is a join, not a column.

### Tenant isolation suite

Every policy here is correct today because somebody read it. That is a memory, not a
control. [`scripts/rls-test/harness.py`](../scripts/rls-test/harness.py) — `npm run
test:rls` — turns it into an exit code: two real users on the deployed project, each
seeded with a meeting, transcript, insight, contact and webhook event, then an
assertion across **every table PostgREST exposes** that neither can read, update,
delete or forge ownership of the other's rows. It also checks anonymous reads, a
random share token, and a Supabase JWT pasted into the share URL.

It enumerates the schema rather than listing tables, so a table added next week is
either covered by a declared rule or reported as *"no tenancy rule defined"* — never
quietly skipped. Adding one means classifying it in `VIA_MEETING` or
`NOT_TENANT_SCOPED`, and the latter requires writing down *why* sharing it is fine.

**The suite carries two controls, and they are the reason it is worth running.** A
green isolation run proves nothing on its own: *"user A saw none of user B's rows"* is
equally true when the policy is airtight and when the table is empty. The first
version of this file was exactly that — it seeded `transcripts` with a
`speaker_segments` column that does not exist (the column is `speakers`), the insert
returned 400, nothing checked the status, and the most sensitive table in the product
reported PASS over zero rows. `webhook_events` failed the same way on a missing
`payload`. So:

- **Positive control** — the victim's own token must *see* each seeded row. If the
  owner cannot read it, the attacker's inability to read it is meaningless, and the
  table's assertion is vacuous. Vacuous fails here rather than passing.
- **Detection control** — the same scan re-runs with the service-role key, which
  bypasses RLS by definition and therefore *must* report a leak on every seeded table.
  If it reports none, the detector is broken and every PASS above it is noise.

The detection control is how "prove it fails when a policy is widened" is satisfied
without widening a real policy on a production database. Verified 2026-09-07:
a clean run exits 0 at 69/69, and a run with the leak check deliberately broken exits
1 naming the offending table.

Every insert in the seed is status-checked and fatal on failure, because a silent seed
failure is indistinguishable from a passing test.

**Run it for any migration, any new table, any RLS policy edit, and any change to
sharing, organisations or the public API.** It is not in CI — it creates and deletes
real auth users against production, so it stays a manual pre-deploy step alongside the
pipeline harness and the evals.

---

## Edge Function authentication

`verify_jwt` is declared per function in [`supabase/config.toml`](../supabase/config.toml).

**Since the 2026-08-31 auth audit, `verify_jwt = true` is the default.** The gateway
verifies the JWT signature (user tokens AND service-role bearers — two valid
service-role JWTs exist, the runtime-injected key and the one in `.env`, so code must
read the `role` claim via `_shared/auth.ts` `authenticate()`, never string-compare the
bearer). Functions then fall into three shapes:

- **User-facing** (`start-recall-recording`, `check-recall-status`,
  `send-email-report`, `send-meeting-email`, the meeting-action five, the
  calendar/OAuth set, `delete-account`): identity comes from the JWT, every read is
  scoped by `user_id` when the caller is not service. Body-supplied `user_id` is
  ignored (or honoured only for service-role bearers).
- **Service-only** (`process-meeting`, `auto-join-meetings`,
  `monitor-stuck-meetings`, `prune-recordings`, and the parked
  `queue-onboarding-emails` / `generate-digest-report` / `send-scheduled-emails`):
  `authenticate()` returns 401 without a token, 403 for user tokens. The pg_cron
  jobs authenticate with the Vault-sourced `service_role_key`
  (see [Operations § scheduled jobs](operations.md#scheduled-jobs)).
- **`verify_jwt = false`, exactly nine, each with its own verification.** This is
  the complete list of surfaces reachable without a Supabase JWT, so it is worth
  regenerating rather than trusting — `awk '/^\[functions\./{f=$0} /verify_jwt *= *false/{print f}' supabase/config.toml`:
  - `recall-webhook` — signature checked against the raw body,
  - `sarvam-webhook` — callback `auth_token` issued at job creation,
  - `dodo-webhook` — Standard-Webhooks HMAC,
  - `google-oauth-redirect` — browser redirect from Google, no JWT possible;
    the single-use `state` row in `google_oauth_states` authenticates it,
  - `microsoft-oauth-redirect` — the same shape for Microsoft, and it shares the
    `google_oauth_states` table for its single-use `state`,
  - `slack-oauth-redirect` — the same shape again for the Slack install; the bot
    token is sealed by `_shared/oauth-tokens.ts` before it lands in
    `slack_connections`,
  - `zoho-oauth-redirect` — the same shape for Zoho CRM; the access and refresh
    tokens are sealed before they land in `zoho_connections`, next to the
    datacentre domain they are only valid in,
  - `get-shared-meeting` — public by design: the reader of a shared link has no
    account, so the `ebs_live_` token **is** the credential (stored as a sha256
    digest) and the share row decides what it unlocks,
  - `get-google-client-id` — serves only the public OAuth client ID.

  Counted five here until 2026-09-07. `microsoft-oauth-redirect` and
  `get-shared-meeting` were both missing — an incomplete list of the unauthenticated
  surface is precisely what makes the next audit miss something.

This is a real attack surface and should be audited whenever a function is added.
The rule of thumb: **if the operation is user-scoped, use the caller's token and let
RLS do the work.** A service-role function that filters by `user_id` in application
code is one forgotten `.eq()` away from a cross-tenant leak.

`chat-transcripts` is the worked example. It builds its client from the caller's
`Authorization` header and the **anon** key:

```ts
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_ANON_KEY")!,
  { global: { headers: { Authorization: authHeader } } },
);
```

Chat is the one feature where a scoping bug hands one user another user's private
transcripts, so the guarantee belongs in Postgres rather than in code.

---

## Webhook verification

| Source | Verification |
|---|---|
| Recall.ai | Signature checked against the **raw body** before `JSON.parse`. Parsing first would allow a body that verifies but deserialises differently. |
| Sarvam | `auth_token` supplied in the `callback` object at job creation and checked on receipt. |
| `split-audio` | `Authorization: Bearer ${SPLIT_AUDIO_SECRET}`. Returns 401 with no auth, 400 on an empty body — both asserted by a harness scenario, because a `500` there means the Vercel env vars went missing. |

Webhooks are also **idempotent by construction**: `sarvam-webhook` skips meetings
already `completed`, and `saveInsights` only inserts. A replayed callback cannot
produce a duplicate transcript or a second summary email.

---

## Secrets

Credentials live in three places and must agree:

```
.env  ──►  Supabase secrets  (Edge Functions)
  └────►  Vercel project env (SPA + split-audio)
```

`.env` is the source of truth. Rotating a key means propagating to **both** targets
and then verifying — not assuming. Supabase secret digests are `sha256`, so a
deployed secret can be checked against `.env` without overwriting it.

`SPLIT_AUDIO_SECRET` must be byte-identical on both sides or the splitter 401s and the
pipeline silently degrades to the empty-transcript path.

### Inventory

Regenerate this rather than trusting it — the whole point of an inventory is that it is
re-derived, not remembered:

```bash
supabase secrets list                 # names + sha256 digests, never values
vercel env ls production              # names only; Sensitive values cannot be read back
grep -oE '^[A-Z_]+=' .env | sort      # names only
```

Compare a deployed Supabase secret to `.env` **without overwriting it** by hashing the
local value and matching the digest — `sha256`, no salt.

**Audited 2026-09-07.** 29 Supabase secrets, 24 Vercel production variables, 22 in
`.env`. What the audit turned up, in descending order of blast radius:

| Finding | Where | Why it matters |
|---|---|---|
| ~~13 unused credentials in Vercel production~~ — **removed 2026-09-07** | 7 × `POSTGRES_*` (including `POSTGRES_PASSWORD`), `SUPABASE_SECRET_KEY`, `SUPABASE_PUBLISHABLE_KEY`, 3 × `NEXT_PUBLIC_*`, `VITE_SUPABASE_PROJECT_ID` | `POSTGRES_PASSWORD` was direct database access that bypasses RLS entirely. The `NEXT_PUBLIC_*` set was inert — **there is no Next.js in this repo**. A credential nothing reads is pure blast radius: it can still leak, but nothing breaks when it goes. 11 variables remain, all of them read by something. `RECALL_API_KEY` is the one open question — `api/` does not reference it (Recall is called from the Edge Functions, which hold their own copy) |
| **Two live service-role JWTs** | the legacy JWT in `.env` (issued 2026-03-26, expires 2036) and the runtime-injected key — different values, both valid | Two credentials that each bypass all RLS, one of them valid for ten years. This is why `authenticate()` reads the `role` claim and never string-compares a bearer |
| **`DODO_PLAN_PRODUCTS` deployed ≠ `.env`** — still open, see below | Supabase | The monthly product→plan map. The annual map matches byte-exact, so this is content drift, not formatting. `.env` matches the four documented live product IDs, so the deployed value is the stale one. Latent, not active: no profile currently carries a `subscription_product_id` |
| **Sentry is a no-op on both sides** | `SENTRY_DSN` absent from Supabase secrets, `VITE_SENTRY_DSN` absent from Vercel | Both integrations are deliberately opt-in and silently disabled without a DSN. Backend errors still reach `function_errors` and `console.error` — **verified end-to-end 2026-09-07**, see [Operations § backend error visibility](operations.md#backend-error-visibility); frontend errors reach nobody |

**Both follow-ups were closed on 2026-09-07**, once a write-scoped token was available
(a read-only PAT can `secrets list` but not `secrets set`, which fails with "your account
does not have the necessary privileges"):

- `DODO_PLAN_PRODUCTS` now matches `.env` byte-for-byte, and all four product IDs were
  confirmed live and unarchived against the Dodo API at the documented prices
  (₹799 / ₹1,999 monthly, ₹7,990 / ₹19,990 annual). Exactly one secret changed; the
  other 28 digests were compared before and after.
- `TOKEN_PLAINTEXT_READS=deny` is set. It is read per call via `Deno.env.get`, so no
  redeploy was needed.

What the api/ functions on Vercel actually read is a short list, and it is worth
checking against the variable list before adding another: `SPLIT_AUDIO_SECRET`,
`SARVAM_API_KEY`, `OPENAI_API_KEY` (split-audio), plus `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET` and `SUPABASE_ANON_KEY` (MCP and
OAuth, which mint a short-lived user JWT so RLS does the scoping).

```bash
grep -rn "process\.env" api/ | grep -v /tests/     # what Vercel actually needs
```

**Credentials at rest.** Google and Microsoft OAuth access and refresh tokens are
sealed with AES-256-GCM before they reach Postgres
([`_shared/crypto.ts`](../supabase/functions/_shared/crypto.ts)); the key is a Supabase
secret and never lives in the database. Until 2026-09-07 these were plaintext columns,
which RLS does nothing to protect against a dump, a leaked service-role key or a
platform-side compromise — and a leaked refresh token is live calendar access until the
customer revokes it. Every read and write goes through
[`_shared/oauth-tokens.ts`](../supabase/functions/_shared/oauth-tokens.ts) rather than
touching the columns directly, because a forgotten `seal()` is indistinguishable from a
working write until it leaks. The envelope carries its own key version, so rotation is a
background re-wrap rather than an outage.

**The rollout is complete.** `TOKEN_PLAINTEXT_READS=deny` (set 2026-09-07) makes an
unsealed credential a thrown `TokenCryptoError` rather than a silent plaintext read, so a
row that escapes the backfill — or anything that writes around `seal()` — is an alert
instead of a hole. It was verified in both directions before being trusted: all
**10** stored credentials decrypt cleanly (`backfill-token-encryption.ts --verify`), all
6 `calendar_connections` values still `open()` with `deny` active, and a deliberately
unsealed value is refused. A setting that has only been shown not to break things has
not been shown to do anything.

Then the same thing was confirmed in the **deployed** runtime rather than locally: the
`auto-join-meetings` tick after the flag went live opened the sealed tokens and refreshed
`calendar_events` (a write timestamped after the change), with no `function_errors` row
and no connection flipped to `needs_reconnect`. The error capture proven earlier the same
day is what made that a real check rather than an absence of complaints.

Transcripts and insights are **not** column-encrypted: they are protected by RLS and by
the platform's at-rest disk encryption, which means anyone holding the service-role key
can read them. That is a deliberate, revisitable decision, recorded here so it is a
choice rather than an oversight.

---

## CORS and rate limiting

[`_shared/cors.ts`](../supabase/functions/_shared/cors.ts) enforces an **origin
allowlist** rather than `*`, and handles preflight centrally.

[`_shared/rate-limit.ts`](../supabase/functions/_shared/rate-limit.ts) is a
sliding-window limiter with per-endpoint configs in `RATE_LIMITS`. The counter is **one
Postgres row per key**, consumed atomically by `public.consume_rate_limit`
(migration `20260901150000`), so every edge isolate counts against the same number.

It used to be a module-level `Map`, which meant the real limit was the configured one
multiplied by however many isolates happened to be warm — a limit that loosens under
exactly the load it exists to handle. `checkRateLimit` is therefore **async**, and falls
back to the in-memory map only when the database call itself fails.

Presets: AUTH 10/min, OAUTH 20/min, API 60/min, PUBLIC 100/min, **LLM 20/min**,
**LLM_HEAVY 6/min**. Every function that calls OpenAI on demand (`chat-transcripts`,
`regenerate-insights`, `account-brief`, `draft-followup-email`) is keyed on the **user
id**, not the IP — an IP key is free to rotate and the cost being defended is per
account. Stale keys are swept by the `prune-job-logs` tick.

---

## Data handling

- **Audio** is archived to the `recordings` bucket and **deleted after 30 days** by
  the `prune-recordings` cron (7 days when the bucket is near cap). The transcript and
  insights are the product; the mp3 is an archive.
- **Transcripts and insights** are retained indefinitely and are what chat retrieves.
- **Third parties that see meeting content:** Recall.ai (audio + its own transcript),
  Sarvam AI (audio chunks), OpenAI (transcript text for insights, chat, Whisper audio),
  Resend (summary email bodies).
- **Google OAuth tokens** are stored in `user_oauth_tokens` under RLS and revoked by
  `disconnect-google`.
- **Account deletion** is self-service via the `delete-account` function (user JWT
  only — a service-role bearer is refused). It removes the user's Storage objects,
  best-effort revokes the Google grant, explicitly clears the user-scoped tables that
  do not cascade from `auth.users`, then deletes the auth user so the FK cascades
  clear everything else. See
  [Edge functions § delete-account](edge-functions.md#delete-account).

Deleting a meeting removes the row; cascading behaviour for transcripts and insights
follows the foreign keys declared in the migrations.

---

## Multi-factor authentication

TOTP enrolment has existed in Settings → Security for weeks. Until 2026-09-07 it
was **decorative**: Supabase issues an `aal1` session on a password sign-in even
for an enrolled account and leaves the decision to the application, nothing ever
asked for the code again, and every RLS policy asked only whether the row
belonged to the caller. Enrolling bought the appearance of protection and none
of the substance — a stolen password still opened every meeting.

Two halves now make it real:

- [`MfaChallenge`](../src/components/MfaChallenge.tsx), rendered by
  `ProtectedRoute`, so every authenticated route asks and none can forget.
- [`public.mfa_satisfied()`](../supabase/migrations/20260907101000_mfa_enforcement.sql),
  ANDed into the five SELECT policies that expose conversation content. **This is
  the control**; the screen is a convenience. A session token skipped past the UI
  is still `aal1` and reads nothing.

The rule is asymmetric on purpose: a user with **no** verified factor is
unaffected, a user **with** one must present `aal2`. So it cannot lock out anyone
who has not opted in, and it takes effect the moment they do.

Verified against production with a throwaway account: the same token read one
meeting before enrolment and **zero** immediately after, while the `aal2` token
from the challenge read it normally.

> **Recovery is manual.** There are no backup codes. A lost authenticator means
> an operator deletes the factor with the service role. Fine at current scale;
> it needs a real recovery path before self-serve growth.

---

## Audit trail

`audit_events` records the consequential actions: a share link minted, widened,
used or revoked; a recording URL handed out; an API token created, revoked, or
used; workspace invites, joins, role changes and removals; account and meeting
deletion. Written by [`_shared/audit.ts`](../supabase/functions/_shared/audit.ts),
never by a call site directly, so the shape of a row is decided once.

It is **append-only in the database**, by RULE rather than by convention —
`UPDATE` and `DELETE` are refused even for the service role, so a compromised
service key cannot rewrite history. Users can read their own rows and nothing
else. Tokens appear only as sha256 digests, which is what makes "what else did
that leaked link touch?" answerable without the audit table becoming the second
copy of the credential.

> **What it does not capture, stated plainly:** the dashboard reads meetings,
> transcripts and insights **directly from PostgREST** with the user's own JWT,
> and the Settings data export is a client-side bulk select. No Edge Function is
> in that path, and Postgres cannot trigger on `SELECT`. So an owner reading
> their own meeting leaves no audit row. Closing that gap means routing those
> reads through an API — the same work as the public REST API. Until then, this
> is an audit trail of **actions and of third-party access**, not of owner
> reads, and it should be described to customers in exactly those terms.
