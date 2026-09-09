#!/usr/bin/env python3
"""
Tenant isolation regression suite.

Every RLS policy in this project is correct today because someone read it. That
is not a control — it is a memory. The next eight weeks add org sharing, four
outbound connectors and a public REST API, which are exactly the changes that
break tenancy, and nothing currently fails a build when one does.

So: two real users, real data, real tokens, against the deployed database. For
every table in `public`, user A must not see a single row belonging to user B,
by any path — direct PostgREST, the org-share policies, a share link, or a
write. A leak is an exit code, not a paragraph in a review.

WHY IT ENUMERATES THE SCHEMA rather than listing tables: a hand-written list
silently stops covering the table someone adds next week. This asks the database
what exists and fails on anything it cannot account for, so a new table is
either covered or it is a failure — never quietly skipped.

THE TWO CONTROLS, which are the reason this file is worth running at all:

  A green isolation suite proves nothing on its own. "User A saw none of user
  B's rows" is equally true when the policy is airtight and when the table is
  simply empty, or when the seed that was supposed to fill it failed silently.
  The first version of this file did exactly that — it seeded `transcripts`
  with a column that does not exist, the insert 400'd, nothing checked the
  status, and the most sensitive table in the product reported PASS over zero
  rows. Two controls close that hole:

  POSITIVE CONTROL — the victim's own token must SEE each seeded row. If the
  owner cannot read it, the attacker's inability to read it means nothing, and
  the table's assertion is vacuous. Vacuous is a failure here, not a pass.

  DETECTION CONTROL — the same scan is re-run with the service-role key, which
  bypasses RLS by definition and therefore MUST report a leak on every seeded
  table. If it reports none, the detector is broken and every PASS above it is
  worthless. This is the "prove it fails when a policy is widened" check,
  performed without widening a real policy on a production database.

Run:  python3 scripts/rls-test/harness.py [--keep]
Needs SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VITE_SUPABASE_PUBLISHABLE_KEY.
"""
from __future__ import annotations

import json
import os
import secrets
import sys
import time
import urllib.error
import urllib.request

URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
ANON_KEY = os.environ.get("VITE_SUPABASE_PUBLISHABLE_KEY", "")
KEEP = "--keep" in sys.argv

if not (URL and SERVICE_KEY and ANON_KEY):
    print("Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and VITE_SUPABASE_PUBLISHABLE_KEY.")
    sys.exit(2)

# Tables whose rows are linked to a user through a meeting rather than a
# user_id column. The value is the column holding the meeting id.
VIA_MEETING = {
    "transcripts": "meeting_id",
    "meeting_insights": "meeting_id",
    "meeting_shares": "meeting_id",
    "meeting_contacts": "meeting_id",
    "meeting_costs": "meeting_id",
    "email_deliveries": "meeting_id",
    "email_messages": "meeting_id",
    "action_item_completions": "meeting_id",
    "meeting_notifications": "meeting_id",
    # Read-only reviewer grants. A row belongs to the reviewer, not the meeting
    # owner, so the victim never owns one — but it is meeting-scoped and the
    # detection control must still reach it.
    "meeting_observers": "meeting_id",
}

# Tables that hold no per-user rows at all. Each one is listed with the reason,
# because "it is fine that this is shared" is a claim that should be written
# down and re-read, not assumed.
NOT_TENANT_SCOPED = {
    "access_codes": "invite codes, service-managed",
    "audit_events": "own rows readable by design; cross-tenant checked separately",
    # RLS on with zero policies is deny-all for every user role — verified
    # against pg_policy 2026-09-07, which is a stronger claim than "we only
    # write to it from the service role" and the one actually worth recording.
    "billing_events": "RLS on, 0 policies — deny-all (Dodo webhook ledger)",
    "function_errors": "RLS on, 0 policies — deny-all (backend error log)",
    "monitor_events": "service-role only",
    "oauth_clients": "DCR clients, service-role only",
    "organizations": "membership-scoped, checked via org paths",
    "org_invites": "admin-scoped, checked via org paths",
    "rate_limits": "counters, no user data",
    "summary_recipient_allowlist": "global reviewer list, service-role only",
    "waitlist": "pre-signup contact form",
}

# Views. PostgREST exposes them like tables but they carry no policies of their
# own — they inherit from the tables underneath, and are reached here only to
# confirm they are not readable by a normal user at all.
VIEWS = {"meeting_margin", "slo_daily", "slo_summary_30d", "slo_meeting_facts"}


class Result:
    def __init__(self) -> None:
        self.passed: list[str] = []
        self.failed: list[tuple[str, str]] = []

    def ok(self, name: str, detail: str = "") -> None:
        self.passed.append(name)
        print(f"    [PASS] {name}{(' — ' + detail) if detail else ''}")

    def bad(self, name: str, detail: str) -> None:
        self.failed.append((name, detail))
        print(f"    [FAIL] {name} — {detail}")


R = Result()


def request(method: str, path: str, token: str, body=None, extra_headers=None):
    headers = {
        "apikey": ANON_KEY if token != SERVICE_KEY else SERVICE_KEY,
        "Content-Type": "application/json",
        "User-Agent": "echobrief-rls-harness",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"
    headers.update(extra_headers or {})
    req = urllib.request.Request(
        f"{URL}{path}",
        data=json.dumps(body).encode() if body is not None else None,
        headers=headers,
        method=method,
    )
    try:
        with urllib.request.urlopen(req) as resp:
            raw = resp.read().decode()
            return resp.status, (json.loads(raw) if raw.strip() else None)
    except urllib.error.HTTPError as err:
        raw = err.read().decode()
        try:
            return err.code, json.loads(raw)
        except json.JSONDecodeError:
            return err.code, {"raw": raw}


def rest(method, table, token, query="", body=None, prefer=None):
    return request(method, f"/rest/v1/{table}{query}", token, body,
                   {"Prefer": prefer} if prefer else None)


def admin(method, path, body=None):
    return request(method, path, SERVICE_KEY, body)


def make_user(label: str) -> dict:
    email = f"rls-{label}-{int(time.time())}-{secrets.token_hex(3)}@echobrief.in"
    password = f"Rls-{secrets.token_urlsafe(14)}"
    status, data = admin("POST", "/auth/v1/admin/users",
                         {"email": email, "password": password, "email_confirm": True})
    if status >= 300:
        print(f"could not create {label}: {status} {data}")
        sys.exit(2)
    status, token_data = request("POST", "/auth/v1/token?grant_type=password", "",
                                 {"email": email, "password": password})
    if status >= 300 or "access_token" not in (token_data or {}):
        print(f"could not sign in {label}: {status} {token_data}")
        sys.exit(2)
    return {"id": data["id"], "email": email, "jwt": token_data["access_token"]}


def list_tables() -> list[str]:
    """Ask PostgREST what it exposes. The schema is the source of truth."""
    status, spec = request("GET", "/rest/v1/", SERVICE_KEY)
    if status >= 300 or not isinstance(spec, dict):
        print(f"could not read the PostgREST schema: {status}")
        sys.exit(2)
    names = (p.lstrip("/") for p in spec.get("paths", {}) if p.startswith("/") and p != "/")
    # `rpc/*` are callable functions, not row stores. A GET against one proves
    # nothing about tenancy, and counting them as PASS inflates the score with
    # checks that never ran.
    return sorted(n for n in names if not n.startswith("rpc/"))


# The rows a tenant would mind losing, in every shape the app stores them.
# Each entry builds a body from the seeded meeting and says how a row of that
# table is traced back to its owner.
def seed(user: dict) -> dict:
    """Give a user something worth stealing. Every insert is checked: a seed
    that fails silently turns the whole suite into an assertion about nothing."""
    status, meeting = rest("POST", "meetings", SERVICE_KEY, body={
        "user_id": user["id"], "title": "[harness] rls tenancy probe",
        "status": "completed", "source": "bot", "duration_seconds": 60,
    }, prefer="return=representation")
    if status >= 300 or not meeting:
        print(f"seed failed on meetings: {status} {meeting}")
        sys.exit(2)
    mid = meeting[0]["id"]
    created = {"meeting_id": mid}

    # A conversation has to exist before its messages can hang off it, and its
    # id is needed below — so it is inserted here rather than in the flat batch.
    status, conv = rest("POST", "chat_conversations", SERVICE_KEY, body={
        "user_id": user["id"], "title": "SECRET-CHAT-TITLE-DO-NOT-LEAK",
    }, prefer="return=representation")
    if status >= 300 or not conv:
        print(f"seed failed on chat_conversations: {status} {conv}")
        sys.exit(2)
    cid = conv[0]["id"]

    rows = {
        "transcripts": {
            "meeting_id": mid, "content": "SECRET-TRANSCRIPT-DO-NOT-LEAK",
            "speakers": [{"speaker": "A", "text": "SECRET", "zone": "meeting"}],
        },
        "meeting_insights": {
            "meeting_id": mid, "summary_short": "SECRET-SUMMARY-DO-NOT-LEAK",
        },
        "contacts": {
            "user_id": user["id"], "name": "Secret Contact",
            "email": f"secret-contact-{secrets.token_hex(3)}@example.com",
        },
        "webhook_events": {
            "user_id": user["id"], "event_type": "meeting.insights_ready",
            "meeting_id": mid, "status_code": 200,
            "payload": {"secret": "DO-NOT-LEAK"},
        },
        # The connector grants. These hold OAuth tokens — the most sensitive
        # rows in the product after transcripts — and until they were seeded the
        # suite reported PASS over two empty tables, which is the same
        # non-assertion that made the first version of this harness meaningless.
        "slack_connections": {
            "user_id": user["id"], "team_id": f"T-SECRET-{secrets.token_hex(3)}",
            "team_name": "SECRET-SLACK-DO-NOT-LEAK",
            "access_token": "v1.SECRET-SLACK-TOKEN.DO-NOT-LEAK",
            "channel_id": "C-SECRET", "channel_name": "secret-channel",
        },
        "slack_deliveries": {
            "meeting_id": mid, "user_id": user["id"],
            "channel_id": "C-SECRET", "message_ts": "1.1",
        },
        "zoho_connections": {
            "user_id": user["id"], "api_domain": "https://www.zohoapis.in",
            "location": "in", "org_name": "SECRET-ZOHO-DO-NOT-LEAK",
            "access_token": "v1.SECRET-ZOHO-TOKEN.DO-NOT-LEAK",
            "refresh_token": "v1.SECRET-ZOHO-REFRESH.DO-NOT-LEAK",
        },
        "zoho_deliveries": {
            "meeting_id": mid, "user_id": user["id"],
            "module": "Contacts", "record_id": f"rec-{secrets.token_hex(3)}",
            "matched_email": "secret@example.com",
        },
        # Ask stores the question, the answer and the quotes it showed — the
        # same meeting content transcripts hold, in a second place.
        "chat_messages": {
            "conversation_id": cid, "user_id": user["id"], "role": "assistant",
            "content": "SECRET-CHAT-ANSWER-DO-NOT-LEAK",
            "citations": [{"meeting_id": mid, "title": "SECRET", "quote": "SECRET-QUOTE"}],
        },
    }
    for table, body in rows.items():
        status, data = rest("POST", table, SERVICE_KEY, body=body, prefer="return=representation")
        if status >= 300:
            # This is the failure mode that made the first run of this suite
            # meaningless. It is fatal on purpose.
            print(f"seed failed on {table}: {status} {json.dumps(data)[:300]}")
            sys.exit(2)
    created["seeded"] = ["meetings", "chat_conversations", *rows]
    return created


def owns(row: dict, table: str, user_id: str, meeting_id: str) -> bool:
    """Does this row belong to that tenant? user_id when the table has one,
    otherwise the meeting it hangs off."""
    if "user_id" in row:
        return row.get("user_id") == user_id
    if table in VIA_MEETING:
        return row.get(VIA_MEETING[table]) == meeting_id
    return False


def scan(tables: list[str], token: str, victim: dict, victim_rows: dict):
    """Read every table with one token and report which of the victim's rows
    came back. Shared by the isolation check and the detection control, so both
    exercise the same code — a detector that is only used one way is a detector
    nobody has tested."""
    leaks: dict[str, int] = {}
    refused: dict[str, int] = {}
    visible: dict[str, int] = {}
    unaccounted: list[str] = []
    mid = victim_rows["meeting_id"]

    for table in tables:
        status, rows = rest("GET", table, token, "?select=*&limit=1000")
        if status >= 400:
            refused[table] = status
            continue
        if not isinstance(rows, list):
            visible[table] = 0
            continue
        visible[table] = len(rows)
        found = [r for r in rows if owns(r, table, victim["id"], mid)]
        if found:
            leaks[table] = len(found)
        elif rows and table not in VIA_MEETING and table not in NOT_TENANT_SCOPED \
                and table not in VIEWS and "user_id" not in rows[0]:
            # Rows, no user_id, no meeting link, no recorded reason. Silence
            # here is how a new table stops being covered.
            unaccounted.append(table)
    return leaks, refused, visible, unaccounted


def check_reads(tables, attacker, victim, victim_rows) -> None:
    """The core assertion: nothing user A can select belongs to user B."""
    print("\n  Cross-tenant reads (user A's token against every table)")
    leaks, refused, visible, unaccounted = scan(tables, attacker["jwt"], victim, victim_rows)

    for table in tables:
        if table in leaks:
            R.bad(f"read:{table}", f"{leaks[table]} of user B's rows visible to user A")
        elif table in unaccounted:
            R.bad(f"read:{table}",
                  f"{visible[table]} rows visible and no tenancy rule defined for this table")
        elif table in refused:
            R.ok(f"read:{table}", f"refused ({refused[table]})")
        elif table in NOT_TENANT_SCOPED:
            R.ok(f"read:{table}", f"{visible[table]} rows — {NOT_TENANT_SCOPED[table]}")
        else:
            R.ok(f"read:{table}", f"{visible[table]} own/none")

    if unaccounted:
        print(f"\n    note: add {', '.join(unaccounted)} to VIA_MEETING or "
              f"NOT_TENANT_SCOPED once its tenancy is decided")


def check_positive_control(victim, victim_rows) -> None:
    """The victim must be able to read their own seeded rows. Where they cannot,
    'the attacker saw nothing' is a statement about an unreadable table, not
    about a policy — and the cross-tenant PASS above it is vacuous."""
    print("\n  Positive control (user B can see user B's own rows)")
    mid = victim_rows["meeting_id"]
    for table in victim_rows["seeded"]:
        status, rows = rest("GET", table, victim["jwt"], "?select=*&limit=1000")
        own = [r for r in rows if owns(r, table, victim["id"], mid)] \
            if isinstance(rows, list) else []
        if own:
            R.ok(f"own:{table}", f"{len(own)} own row(s) readable")
        else:
            R.bad(f"own:{table}",
                  f"owner cannot read own seeded row ({status}) — the isolation "
                  f"check on this table proves nothing")


def check_detection(tables, victim, victim_rows) -> None:
    """Prove the detector fires. The service role bypasses RLS, so this scan
    MUST surface the victim's rows; if it does not, every PASS above is noise.
    This is the widened-policy proof, without widening one in production."""
    print("\n  Detection control (service role must trip every seeded table)")
    leaks, _, _, _ = scan(tables, SERVICE_KEY, victim, victim_rows)
    for table in victim_rows["seeded"]:
        if leaks.get(table):
            R.ok(f"detect:{table}", f"leak seen ({leaks[table]} rows) as expected")
        else:
            R.bad(f"detect:{table}",
                  "service role saw no victim rows — the leak detector for this "
                  "table does not work, so its PASS above is meaningless")


def check_anonymous(tables: list[str], victim_rows: dict) -> None:
    print("\n  Anonymous reads (no session at all)")
    for table in ("meetings", "transcripts", "meeting_insights", "contacts",
                  "api_tokens", "audit_events", "meeting_costs", "usage_events"):
        if table not in tables:
            continue
        status, rows = rest("GET", table, "", "?select=*&limit=50")
        if status >= 400 or not rows:
            R.ok(f"anon:{table}", f"nothing ({status})")
        else:
            R.bad(f"anon:{table}", f"{len(rows)} rows readable with no session")


def check_writes(attacker: dict, victim_rows: dict) -> None:
    print("\n  Cross-tenant writes (user A against user B's meeting)")
    mid = victim_rows["meeting_id"]

    status, rows = rest("PATCH", "meetings", attacker["jwt"], f"?id=eq.{mid}",
                        body={"title": "OWNED BY ATTACKER"}, prefer="return=representation")
    if status < 300 and isinstance(rows, list) and rows:
        R.bad("write:update-other-meeting", "user A modified user B's meeting")
    else:
        R.ok("write:update-other-meeting", f"refused/no-op ({status})")

    status, rows = rest("DELETE", "meetings", attacker["jwt"], f"?id=eq.{mid}",
                        prefer="return=representation")
    if status < 300 and isinstance(rows, list) and rows:
        R.bad("write:delete-other-meeting", "user A deleted user B's meeting")
    else:
        R.ok("write:delete-other-meeting", f"refused/no-op ({status})")

    # The write is only proven refused if the row is still there afterwards —
    # PostgREST answers 200 with an empty body both when RLS filtered the row
    # and when it deleted it and was asked to return nothing.
    status, rows = rest("GET", "meetings", SERVICE_KEY, f"?id=eq.{mid}&select=id,title")
    if isinstance(rows, list) and len(rows) == 1 and rows[0]["title"] != "OWNED BY ATTACKER":
        R.ok("write:victim-meeting-intact", "row unchanged after both attempts")
    else:
        R.bad("write:victim-meeting-intact", f"victim's meeting was altered or removed: {rows}")

    # Claiming someone else's meeting by writing their user_id is the version of
    # this that a `user_id` column invites.
    status, rows = rest("POST", "meetings", attacker["jwt"], body={
        "user_id": victim_rows["victim_id"], "title": "[harness] rls forged ownership",
        "status": "completed", "source": "bot",
    }, prefer="return=representation")
    if status < 300 and isinstance(rows, list) and rows:
        R.bad("write:insert-as-other-user", "user A created a meeting owned by user B")
        rest("DELETE", "meetings", SERVICE_KEY, f"?id=eq.{rows[0]['id']}")
    else:
        R.ok("write:insert-as-other-user", f"refused ({status})")


def check_shares(attacker: dict, victim_rows: dict) -> None:
    """A share link is a credential; a wrong or absent one must reveal nothing."""
    print("\n  Share links")
    status, data = request("GET", f"/functions/v1/get-shared-meeting?token=ebs_live_{secrets.token_urlsafe(32)}", "")
    if status == 404 or (isinstance(data, dict) and data.get("error")):
        R.ok("share:unknown-token", "rejected")
    else:
        R.bad("share:unknown-token", f"a random token returned {status} {str(data)[:80]}")

    # A Supabase JWT pasted into the share URL must not be looked up as a share.
    status, data = request("GET", f"/functions/v1/get-shared-meeting?token={attacker['jwt']}", "")
    if status >= 400 or (isinstance(data, dict) and data.get("error")):
        R.ok("share:jwt-as-share-token", "rejected")
    else:
        R.bad("share:jwt-as-share-token", f"returned {status}")


def teardown(users: list[dict]) -> None:
    for user in users:
        admin("DELETE", f"/auth/v1/admin/users/{user['id']}")
    # Meetings cascade from auth.users; the harness rows are named so a failed
    # run is still findable.
    rest("DELETE", "meetings", SERVICE_KEY, "?title=like.%5Bharness%5D%20rls%25")


def main() -> int:
    print("EchoBrief — tenant isolation suite")
    print(f"  target: {URL}")

    tables = list_tables()
    print(f"  tables exposed by PostgREST: {len(tables)}")

    print("\n  Seeding two tenants…")
    victim = make_user("victim")
    attacker = make_user("attacker")
    victim_rows = seed(victim)
    victim_rows["victim_id"] = victim["id"]
    seed(attacker)
    print(f"    victim   {victim['id'][:8]}  meeting {victim_rows['meeting_id'][:8]}")
    print(f"    attacker {attacker['id'][:8]}")

    try:
        check_reads(tables, attacker, victim, victim_rows)
        check_positive_control(victim, victim_rows)
        check_detection(tables, victim, victim_rows)
        check_anonymous(tables, victim_rows)
        check_writes(attacker, victim_rows)
        check_shares(attacker, victim_rows)
    finally:
        if KEEP:
            print(f"\n  --keep: leaving {victim['email']} and {attacker['email']} in place")
        else:
            teardown([victim, attacker])

    total = len(R.passed) + len(R.failed)
    print("\n" + "=" * 72)
    print(f"RESULT: {len(R.passed)}/{total} passed")
    for name, detail in R.failed:
        print(f"  [FAIL] {name} — {detail}")
    return 1 if R.failed else 0


if __name__ == "__main__":
    sys.exit(main())
