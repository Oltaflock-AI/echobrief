"""Grant existing meetings to allowlisted reviewers who were on the invite.

The pipeline writes `meeting_observers` rows when insights are saved
(`_shared/observers.ts`), so only meetings that completed BEFORE that shipped
need this. It is also how a reviewer added to the allowlist later, or one who
signed up after their first meeting, catches up — it is safe to re-run.

    python3 scripts/backfill_meeting_observers.py            # dry run, prints what it would grant
    python3 scripts/backfill_meeting_observers.py --apply    # write the rows
    python3 scripts/backfill_meeting_observers.py --apply --email vineet@oltaflock.ai

Reads the service role from .env. Skips [harness] meetings.
"""
from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load_env() -> dict[str, str]:
    env: dict[str, str] = {}
    for line in (ROOT / ".env").read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def rest(env: dict[str, str], method: str, path: str, body=None, prefer: str | None = None):
    headers = {
        "apikey": env["SUPABASE_SERVICE_ROLE_KEY"],
        "Authorization": f"Bearer {env['SUPABASE_SERVICE_ROLE_KEY']}",
        "Content-Type": "application/json",
    }
    if prefer:
        headers["Prefer"] = prefer
    req = urllib.request.Request(
        f"{env['SUPABASE_URL']}/rest/v1/{path}",
        method=method,
        headers=headers,
        data=json.dumps(body).encode() if body is not None else None,
    )
    try:
        with urllib.request.urlopen(req) as r:
            raw = r.read()
            return json.loads(raw) if raw else []
    except urllib.error.HTTPError as e:
        print(f"  ! {method} {path} → {e.code} {e.read().decode()[:300]}")
        raise


def emails_of(attendees) -> set[str]:
    """Same three shapes `extractAttendeeEmails` handles in the edge function."""
    if isinstance(attendees, str):
        try:
            attendees = json.loads(attendees)
        except json.JSONDecodeError:
            return set()
    if not isinstance(attendees, list):
        return set()
    out = set()
    for a in attendees:
        email = a if isinstance(a, str) else (a or {}).get("email")
        if isinstance(email, str) and "@" in email:
            out.add(email.strip().lower())
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="write the grants (default is a dry run)")
    ap.add_argument("--email", help="restrict to one reviewer address")
    args = ap.parse_args()

    env = load_env()

    # 1. Who may observe.
    reviewers = rest(env, "GET", "summary_recipient_allowlist?select=email&active=eq.true&dashboard_access=eq.true")
    wanted = {r["email"].strip().lower() for r in reviewers}
    if args.email:
        wanted &= {args.email.strip().lower()}
    if not wanted:
        print("No reviewers have dashboard_access. Nothing to do.")
        return 0

    # 2. Their accounts. A reviewer without a profile cannot be granted anything
    #    yet; re-run this after they sign up.
    profiles = rest(env, "GET", "profiles?select=user_id,email")
    by_email = {
        (p.get("email") or "").strip().lower(): p["user_id"]
        for p in profiles
        if p.get("email")
    }
    missing = sorted(e for e in wanted if e not in by_email)
    for e in missing:
        print(f"  · {e}: no account yet — skipped")
    wanted &= set(by_email)
    if not wanted:
        return 0

    # 3. Every meeting, with its attendee list and the calendar event behind it.
    meetings = rest(
        env,
        "GET",
        "meetings?select=id,user_id,title,start_time,attendees,calendar_event_id"
        "&title=not.like.%5Bharness%5D%25&order=start_time.desc&limit=5000",
    )
    events = rest(env, "GET", "calendar_events?select=event_id,user_id,attendees&limit=10000")
    event_attendees = {(e["user_id"], e["event_id"]): e.get("attendees") for e in events}

    existing = rest(env, "GET", "meeting_observers?select=meeting_id,user_id&limit=10000")
    have = {(r["meeting_id"], r["user_id"]) for r in existing}

    rows = []
    for m in meetings:
        attendees = emails_of(m.get("attendees"))
        if not attendees and m.get("calendar_event_id"):
            attendees = emails_of(event_attendees.get((m["user_id"], m["calendar_event_id"])))
        for email in sorted(wanted & attendees):
            uid = by_email[email]
            if uid == m["user_id"] or (m["id"], uid) in have:
                continue
            rows.append({
                "meeting_id": m["id"],
                "user_id": uid,
                "email": email,
                "reason": "backfill_allowlist_attendee",
            })
            print(f"  + {email} → {m['start_time'][:10]} {(m.get('title') or 'Untitled')[:60]}")

    print(f"\n{len(rows)} grant(s) over {len(meetings)} meeting(s); {len(have)} already granted.")
    if not rows or not args.apply:
        if rows:
            print("Dry run. Re-run with --apply to write them.")
        return 0

    # Chunked: one 5,000-row insert is a request nobody can debug when it 400s.
    for i in range(0, len(rows), 200):
        rest(env, "POST", "meeting_observers", rows[i:i + 200],
             prefer="resolution=ignore-duplicates,return=minimal")
    print(f"Wrote {len(rows)} grant(s).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
