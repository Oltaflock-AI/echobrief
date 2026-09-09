"""EchoBrief output-quality eval runner.

This is the EVAL layer (output quality), complementary to the pipeline harness
(scripts/pipeline-test/harness.py, which tests plumbing/control-flow). Together:
harness answers "did the pipeline run?", evals answer "is the output any good?".

Modes:
    python3 scripts/evals/run_evals.py                    # static dataset gate (run before deploys)
    python3 scripts/evals/run_evals.py --meeting-id <id>  # evaluate a live prod meeting from the DB
    python3 scripts/evals/run_evals.py --snapshot <id>    # save a prod meeting into dataset/ as a new case

Evals (12):
    deterministic: schema_validity, english_output, stitch_integrity, speaker_attribution,
                   entity_spelling, boundary_exclusion, timestamp_accuracy
    LLM-judge:     action_item_recall, action_item_precision, summary_faithfulness,
                   decision_accuracy, numbers_recall

Each dataset case may declare expected failures (judge calibration):
    "expect": {"action_item_precision": "fail"} → suite passes only when that eval FAILS.

Exit code 0 = all evals matched expectations; 1 = regression.
"""
from __future__ import annotations

import argparse
import json
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import scorers  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
DATASET_DIR = Path(__file__).parent / "dataset"


def load_env() -> dict[str, str]:
    env: dict[str, str] = {}
    with open(ROOT / ".env") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def sb_get(env: dict[str, str], path: str):
    req = urllib.request.Request(
        f"{env['SUPABASE_URL']}/rest/v1/{path}",
        headers={
            "apikey": env["SUPABASE_SERVICE_ROLE_KEY"],
            "Authorization": f"Bearer {env['SUPABASE_SERVICE_ROLE_KEY']}",
        },
    )
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())


def fetch_meeting_case(env: dict[str, str], meeting_id: str) -> dict:
    """Build an eval case from a live prod meeting (transcript + insights rows)."""
    meetings = sb_get(env, f"meetings?id=eq.{meeting_id}&select=*")
    if not meetings:
        raise SystemExit(f"meeting {meeting_id} not found")
    meeting = meetings[0]
    transcripts = sb_get(env, f"transcripts?meeting_id=eq.{meeting_id}&select=*")
    insights = sb_get(env, f"meeting_insights?meeting_id=eq.{meeting_id}&select=*")
    if not transcripts:
        raise SystemExit(f"meeting {meeting_id} has no transcript row")
    t = transcripts[0]
    ins = insights[0] if insights else {}
    config = meeting.get("processing_config") or {}
    participants = [p.get("name") for p in (config.get("recall_participants") or []) if p.get("name")]
    gold_file = DATASET_DIR / f"gold_{meeting_id}.json"
    gold = json.loads(gold_file.read_text()) if gold_file.exists() else {}
    return {
        "id": f"live_{meeting_id[:8]}",
        "description": meeting.get("title") or "live meeting",
        "duration_seconds": meeting.get("duration_seconds"),
        "participants": participants,
        "transcript": t.get("content") or "",
        "speakers": t.get("speakers") or [],
        "insights": {
            # meeting_insights uses summary_short/summary_detailed (no `summary` column)
            "summary": ins.get("summary_detailed") or ins.get("summary_short") or "",
            "action_items": ins.get("action_items") or [],
            "decisions": ins.get("decisions") or [],
            "key_points": ins.get("key_points") or [],
            "facts": ins.get("facts") or {},
        },
        "gold": gold,
        "expect": {},
    }


def run_case(case: dict, api_key: str, skip_llm: bool = False) -> tuple[list[dict], list[str]]:
    """Run all evals on one case. Returns (results, mismatches-vs-expectation)."""
    expect = case.get("expect") or {}
    results: list[dict] = []
    for fn in scorers.DETERMINISTIC:
        results.append(fn(case))
    if not skip_llm:
        for fn in scorers.LLM_JUDGED:
            try:
                results.append(fn(case, api_key))
            except Exception as e:
                results.append({"name": fn.__name__, "passed": False, "score": 0.0, "detail": f"judge error: {e}"})
    mismatches: list[str] = []
    for r in results:
        expected_fail = expect.get(r["name"]) == "fail"
        if expected_fail and r["passed"]:
            mismatches.append(f"{r['name']}: expected FAIL (judge calibration) but it PASSED — judge is too lenient")
        elif not expected_fail and not r["passed"]:
            mismatches.append(f"{r['name']}: FAILED — {r['detail']}")
    return results, mismatches


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--meeting-id", help="Evaluate a live prod meeting")
    ap.add_argument("--snapshot", help="Save a prod meeting into dataset/ as a new case")
    ap.add_argument("--skip-llm", action="store_true", help="Deterministic evals only (no OpenAI calls)")
    args = ap.parse_args()

    env = load_env()
    api_key = env.get("OPENAI_API_KEY", "")

    if args.snapshot:
        case = fetch_meeting_case(env, args.snapshot)
        out = DATASET_DIR / f"case_live_{args.snapshot[:8]}.json"
        out.write_text(json.dumps(case, indent=2))
        print(f"Snapshotted meeting to {out}")
        print("Add a gold reference (gold.action_items / gold.decisions) to enable recall/accuracy evals.")
        return 0

    if args.meeting_id:
        cases = [fetch_meeting_case(env, args.meeting_id)]
    else:
        cases = [json.loads(p.read_text()) for p in sorted(DATASET_DIR.glob("case_*.json"))]
        if not cases:
            print("No dataset cases found.")
            return 1

    print(f"Running {len(cases)} case(s) x up to 12 evals")
    print("=" * 88)
    all_mismatches: list[str] = []
    for case in cases:
        print(f"\n--- {case['id']}: {case.get('description','')[:70]}")
        results, mismatches = run_case(case, api_key, skip_llm=args.skip_llm)
        for r in results:
            expected_fail = (case.get("expect") or {}).get(r["name"]) == "fail"
            ok = (r["passed"] != expected_fail)
            tag = "OK " if ok else "BAD"
            suffix = " [expected-fail: judge correctly caught it]" if expected_fail and not r["passed"] else ""
            print(f"  [{tag}] {r['name']:24} score={r['score']:<6} {r['detail'][:80]}{suffix}")
        all_mismatches.extend(f"{case['id']}/{m}" for m in mismatches)

    print("\n" + "=" * 88)
    if all_mismatches:
        print(f"RESULT: FAIL — {len(all_mismatches)} eval(s) off expectation:")
        for m in all_mismatches:
            print(f"  - {m}")
        return 1
    print("RESULT: PASS — every eval matched expectations")
    return 0


if __name__ == "__main__":
    sys.exit(main())
