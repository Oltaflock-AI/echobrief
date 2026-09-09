"""Eval scorers for EchoBrief output quality.

Two kinds:
  - Deterministic scorers: pure-python checks (schema, language, timestamps,
    speaker labels). Fast, free, no API calls.
  - LLM-judge scorers: gpt-4o-mini grades semantic quality (action-item
    recall/precision, summary faithfulness, decision accuracy) and returns
    strict JSON.

Every scorer returns: {"name", "passed": bool, "score": float 0..1, "detail": str}
"""
from __future__ import annotations

import json
import re
import ssl
import time
import urllib.error
import urllib.request
from typing import Any

OPENAI_URL = "https://api.openai.com/v1/chat/completions"
JUDGE_MODEL = "gpt-4o-mini"


def _result(name: str, passed: bool, score: float, detail: str) -> dict[str, Any]:
    return {"name": name, "passed": passed, "score": round(score, 3), "detail": detail}


# ---------- Deterministic scorers ----------

def schema_validity(case: dict[str, Any]) -> dict[str, Any]:
    """Insights must have a non-empty summary and list-typed action_items/decisions."""
    ins = case.get("insights") or {}
    problems = []
    if not isinstance(ins.get("summary"), str) or len(ins.get("summary", "").strip()) < 20:
        problems.append("summary missing/too short")
    if not isinstance(ins.get("action_items"), list):
        problems.append("action_items not a list")
    if not isinstance(ins.get("decisions"), list):
        problems.append("decisions not a list")
    ok = not problems
    return _result("schema_validity", ok, 1.0 if ok else 0.0, "; ".join(problems) or "all required fields present")


def english_output(case: dict[str, Any]) -> dict[str, Any]:
    """Translate mode must output English: transcript+summary should be largely ASCII."""
    text = (case.get("transcript") or "") + " " + ((case.get("insights") or {}).get("summary") or "")
    if not text.strip():
        return _result("english_output", False, 0.0, "no text to check")
    ascii_ratio = sum(1 for c in text if ord(c) < 128) / len(text)
    ok = ascii_ratio >= 0.95
    return _result("english_output", ok, ascii_ratio, f"ascii_ratio={ascii_ratio:.3f}")


def stitch_integrity(case: dict[str, Any]) -> dict[str, Any]:
    """Chunk-stitch sanity: segments time-ordered, non-negative, non-empty text,
    and (if duration known) last timestamp within duration + slack."""
    segs = case.get("speakers") or []
    if not segs:
        return _result("stitch_integrity", True, 1.0, "no segments (skipped)")
    problems = []
    last_start = -1.0
    for i, s in enumerate(segs):
        start, end = float(s.get("start", 0)), float(s.get("end", 0))
        if start < 0 or end < 0:
            problems.append(f"seg{i} negative time")
        if start < last_start:
            problems.append(f"seg{i} out of order ({start} < {last_start})")
        last_start = start
        if not (s.get("text") or "").strip():
            problems.append(f"seg{i} empty text")
    dur = case.get("duration_seconds")
    if dur and segs:
        last_end = max(float(s.get("end", 0)) for s in segs)
        if last_end > dur * 1.15 + 60:
            problems.append(f"last_end {last_end:.0f}s exceeds duration {dur}s")
    ok = not problems
    return _result("stitch_integrity", ok, 1.0 if ok else 0.0, "; ".join(problems[:4]) or f"{len(segs)} segments ordered & non-empty")


def speaker_attribution(case: dict[str, Any]) -> dict[str, Any]:
    """When real participant names are known, no segment should keep a SPEAKER_XX label."""
    segs = case.get("speakers") or []
    participants = case.get("participants") or []
    if not segs or not participants:
        return _result("speaker_attribution", True, 1.0, "no segments/participants (skipped)")
    phantom = [s for s in segs if re.match(r"^SPEAKER_\d+$", str(s.get("speaker", "")))]
    ratio = 1 - len(phantom) / len(segs)
    ok = len(phantom) == 0
    return _result("speaker_attribution", ok, ratio, f"{len(phantom)}/{len(segs)} segments with phantom SPEAKER_XX labels")


# ---------- LLM-judge scorers ----------

def _judge(api_key: str, system: str, user: str, attempts: int = 4) -> dict[str, Any]:
    """Ask the judge, retrying only TRANSPORT failures.

    The eval suite gates deploys, so a dropped TCP connection must not read as a
    quality regression. Two different transient errors (`Remote end closed
    connection`, `SSLV3_ALERT_BAD_RECORD_MAC`) failed the gate on consecutive runs
    on 2026-09-07 — and every case added makes a spurious failure more likely, not
    less. A judge that answers and *disagrees* is a real result and is never retried;
    only the network is.
    """
    body = {
        "model": JUDGE_MODEL,
        "temperature": 0,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    }
    last: Exception | None = None
    for attempt in range(attempts):
        req = urllib.request.Request(
            OPENAI_URL,
            data=json.dumps(body).encode(),
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                data = json.loads(r.read())
            return json.loads(data["choices"][0]["message"]["content"])
        except urllib.error.HTTPError as e:
            # 4xx is our bug (bad key, bad request) and will not fix itself.
            if e.code < 500 and e.code != 429:
                raise
            last = e
        except (urllib.error.URLError, ssl.SSLError, ConnectionError, TimeoutError,
                json.JSONDecodeError) as e:
            last = e
        if attempt < attempts - 1:
            time.sleep(2 ** attempt)
    raise RuntimeError(f"judge unreachable after {attempts} attempts: {last}")


def action_item_recall(case: dict[str, Any], api_key: str) -> dict[str, Any]:
    """Of the GOLD action items, how many appear in the generated ones? Gate >= 0.7."""
    gold = (case.get("gold") or {}).get("action_items") or []
    generated = (case.get("insights") or {}).get("action_items") or []
    if not gold:
        return _result("action_item_recall", True, 1.0, "no gold action items (skipped)")
    verdict = _judge(
        api_key,
        "You grade meeting-notes systems. For each REFERENCE action item, decide if it is "
        "semantically covered by any GENERATED item (same task + owner, wording may differ). "
        'Return JSON: {"covered": [bool per reference item], "reasoning": "<brief>"}',
        f"REFERENCE:\n{json.dumps(gold, indent=1)}\n\nGENERATED:\n{json.dumps(generated, indent=1)}",
    )
    covered = verdict.get("covered") or []
    score = sum(bool(c) for c in covered) / len(gold)
    return _result("action_item_recall", score >= 0.7, score, f"{sum(bool(c) for c in covered)}/{len(gold)} gold items covered")


def action_item_precision(case: dict[str, Any], api_key: str) -> dict[str, Any]:
    """No generated action item may be hallucinated: each must be grounded in the transcript. Gate = 1.0."""
    generated = (case.get("insights") or {}).get("action_items") or []
    transcript = case.get("transcript") or ""
    if not generated:
        return _result("action_item_precision", True, 1.0, "no generated action items (skipped)")
    verdict = _judge(
        api_key,
        "You are a strict fact-checker for meeting notes. For each ACTION ITEM, decide if the "
        "meeting TRANSCRIPT actually supports it (the task was really discussed/assigned). "
        "Mark unsupported/invented items as false. "
        'Return JSON: {"grounded": [bool per item], "reasoning": "<brief>"}',
        f"TRANSCRIPT:\n{transcript[:24000]}\n\nACTION ITEMS:\n{json.dumps(generated, indent=1)}",
    )
    grounded = verdict.get("grounded") or []
    score = sum(bool(g) for g in grounded) / len(generated)
    return _result("action_item_precision", score >= 0.999, score,
                   f"{len(generated) - sum(bool(g) for g in grounded)} hallucinated of {len(generated)}")


def summary_faithfulness(case: dict[str, Any], api_key: str) -> dict[str, Any]:
    """Every factual claim in the summary must be grounded in the transcript. Gate >= 0.9."""
    summary = (case.get("insights") or {}).get("summary") or ""
    transcript = case.get("transcript") or ""
    if not summary:
        return _result("summary_faithfulness", False, 0.0, "no summary")
    verdict = _judge(
        api_key,
        "You are a strict fact-checker. Split the SUMMARY into its factual claims, then decide "
        "for each whether the TRANSCRIPT supports it. "
        'Return JSON: {"claims": ["..."], "supported": [bool per claim], "reasoning": "<brief>"}',
        f"TRANSCRIPT:\n{transcript[:24000]}\n\nSUMMARY:\n{summary}",
    )
    supported = verdict.get("supported") or []
    if not supported:
        return _result("summary_faithfulness", False, 0.0, "judge returned no claims")
    score = sum(bool(s) for s in supported) / len(supported)
    bad = [c for c, s in zip(verdict.get("claims") or [], supported) if not s]
    return _result("summary_faithfulness", score >= 0.9, score,
                   f"{len(bad)} unsupported claim(s)" + (f": {bad[0][:80]!r}" if bad else ""))


def decision_accuracy(case: dict[str, Any], api_key: str) -> dict[str, Any]:
    """Gold decisions must be captured by generated decisions. Gate >= 0.7."""
    gold = (case.get("gold") or {}).get("decisions") or []
    generated = (case.get("insights") or {}).get("decisions") or []
    if not gold:
        return _result("decision_accuracy", True, 1.0, "no gold decisions (skipped)")
    verdict = _judge(
        api_key,
        "For each REFERENCE decision, decide if it is semantically covered by any GENERATED decision. "
        'Return JSON: {"covered": [bool per reference], "reasoning": "<brief>"}',
        f"REFERENCE:\n{json.dumps(gold, indent=1)}\n\nGENERATED:\n{json.dumps(generated, indent=1)}",
    )
    covered = verdict.get("covered") or []
    score = sum(bool(c) for c in covered) / len(gold)
    return _result("decision_accuracy", score >= 0.7, score, f"{sum(bool(c) for c in covered)}/{len(gold)} decisions covered")


def entity_spelling(case: dict[str, Any]) -> dict[str, Any]:
    """No known-bad entity spelling may survive into the transcript or insights.

    gold.entity_misspellings lists strings the ASR is known to produce for this
    case (e.g. "AltaFlock" for "Oltaflock"). The vocab-correction pass exists
    to remove them; this proves it keeps working. Skips when a case has none.
    """
    banned = (case.get("gold") or {}).get("entity_misspellings") or []
    if not banned:
        return _result("entity_spelling", True, 1.0, "no known misspellings for this case (skipped)")
    ins = case.get("insights") or {}
    haystack = " ".join([
        case.get("transcript") or "",
        ins.get("summary") or "",
        json.dumps(ins.get("action_items") or []),
        json.dumps(ins.get("key_points") or []),
        json.dumps(ins.get("facts") or {}),
    ]).lower()
    found = [b for b in banned if b.lower() in haystack]
    score = 1.0 - len(found) / len(banned)
    return _result("entity_spelling", not found, score,
                   f"banned spellings present: {found}" if found else f"none of {len(banned)} known misspellings present")


def boundary_exclusion(case: dict[str, Any]) -> dict[str, Any]:
    """Internal pre/post-meeting speech must not leak into the insights.

    gold.internal_excerpts lists distinctive strings from the pre/post zones
    (private chatter). None may appear in the summary, key points, action
    items or facts. Skips when a case declares none.
    """
    excerpts = (case.get("gold") or {}).get("internal_excerpts") or []
    if not excerpts:
        return _result("boundary_exclusion", True, 1.0, "no internal excerpts declared (skipped)")
    ins = case.get("insights") or {}
    haystack = " ".join([
        ins.get("summary") or "",
        json.dumps(ins.get("action_items") or [], ensure_ascii=False),
        json.dumps(ins.get("key_points") or [], ensure_ascii=False),
        json.dumps(ins.get("facts") or {}, ensure_ascii=False),
    ])
    leaked = [e for e in excerpts if e in haystack]
    score = 1.0 - len(leaked) / len(excerpts)
    return _result("boundary_exclusion", not leaked, score,
                   f"internal speech leaked into insights: {leaked}" if leaked else f"none of {len(excerpts)} internal excerpts leaked")


def numbers_recall(case: dict[str, Any], api_key: str) -> dict[str, Any]:
    """Every gold hard number must survive into key points or facts. Gate >= 0.95.

    The headline metric: dropped numbers ($5M TTV, $20K average booking) are
    exactly what the user needs for the follow-up proposal.
    """
    gold = (case.get("gold") or {}).get("numbers") or []
    if not gold:
        return _result("numbers_recall", True, 1.0, "no gold numbers (skipped)")
    ins = case.get("insights") or {}
    generated = {
        "key_points": ins.get("key_points") or [],
        "summary": ins.get("summary") or "",
        "facts_numbers": ((ins.get("facts") or {}).get("numbers")) or [],
    }
    verdict = _judge(
        api_key,
        "You grade meeting-notes systems. For each REFERENCE number (a metric + value spoken in "
        "a meeting), decide if it is present anywhere in the GENERATED output (key points, "
        "summary, or extracted facts). The value must match (formatting may differ: $5M = "
        "$5 million = 5 million dollars). "
        'Return JSON: {"covered": [bool per reference], "reasoning": "<brief>"}',
        f"REFERENCE:\n{json.dumps(gold, indent=1)}\n\nGENERATED:\n{json.dumps(generated, indent=1)}",
    )
    covered = verdict.get("covered") or []
    score = sum(bool(c) for c in covered) / len(gold)
    return _result("numbers_recall", score >= 0.95, score,
                   f"{sum(bool(c) for c in covered)}/{len(gold)} gold numbers present")



# Mirrors supabase/functions/_shared/anchor.ts. Kept as an independent
# implementation on purpose: an eval that imported the code under test would
# agree with it by construction and prove nothing.
_STOP = set(
    "a an and are as at be but by can did do does for from had has have i if in is it its "
    "just like me my not of on or our so than that the their them then there they this to "
    "too us was we were what when which who will with you your yeah okay right".split()
)


def _norm(value: Any) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9\s]", " ", str(value or "").lower())).strip()


def _stem(token: str) -> str:
    return re.sub(r"(ings|ing|ies|ied|ed|es|s)$", "", token) if len(token) > 4 else token


def _content_tokens(text: str) -> list[str]:
    return [t for t in (_stem(w) for w in text.split() if len(w) > 2 and w not in _STOP) if len(t) > 2]


def _locate_quote(quote: str, segments: list[dict[str, Any]]) -> float | None:
    """Where this verbatim quote was actually said, or None if not locatable."""
    needle = _norm(quote)
    if len(needle) < 16 or len(needle.split()) < 4:
        return None
    head = " ".join(needle.split()[:12])

    rows = [(s.get("start"), _norm(s.get("text"))) for s in segments]
    rows = [(float(st), tx) for st, tx in rows if isinstance(st, (int, float)) and tx]
    if not rows:
        return None

    for start, text in rows:
        if head in text:
            return start

    # The quote may span consecutive rows: search the joined transcript and map
    # the hit back to the row it starts in.
    joined, spans, cursor = "", [], 0
    for start, text in rows:
        begin = cursor + (1 if cursor else 0)
        joined += (" " if cursor else "") + text
        cursor = len(joined)
        spans.append((begin, cursor, start))
    at = joined.find(head)
    if at >= 0:
        for begin, end, start in spans:
            if begin <= at < end:
                return start

    wanted = _content_tokens(needle)
    if len(wanted) < 3:
        return None
    best_start, best_score = None, 0.0
    for start, text in rows:
        tokens = set(_content_tokens(text))
        score = sum(1 for t in wanted if t in tokens) / len(wanted)
        if score > best_score:
            best_score, best_start = score, start
    return best_start if best_score >= 0.7 else None


_QUOTED_FACT_KEYS = (
    "numbers",
    "objections",
    "explicit_asks",
    "commitments",
    "decisions",
    "pain_points",
    "buying_signals",
    "notable_quotes",
)

# One segment either side of the true position is a boundary artefact, not a
# fabricated timestamp.
TIMESTAMP_TOLERANCE_SECONDS = 45


def timestamp_accuracy(case: dict[str, Any]) -> dict[str, Any]:
    """Every quoted fact must be stamped where it was actually said.

    The failure this exists to catch, seen in prod on 2026-09-09: extraction
    asked the model for a `ts` per quote and on long meetings it invented one —
    content from minute 88 of a 90-minute call came back as `ts: 13`. Every
    other eval passed while that shipped, because none of them looked at time.
    The quote is verbatim, so the true timestamp is recoverable from the
    transcript, and any scorer that cannot recover it says nothing (skip).
    """
    facts = ((case.get("insights") or {}).get("facts") or {})
    segments = case.get("speakers") or []
    if not facts or not segments:
        return _result("timestamp_accuracy", True, 1.0, "no facts/segments to check (skipped)")

    checked, wrong, worst = 0, [], 0.0
    for key in _QUOTED_FACT_KEYS:
        for row in facts.get(key) or []:
            if not isinstance(row, dict):
                continue
            actual = _locate_quote(row.get("quote") or "", segments)
            if actual is None:
                continue
            checked += 1
            drift = abs(float(row.get("ts") or 0) - actual)
            if drift > TIMESTAMP_TOLERANCE_SECONDS:
                wrong.append(f"{key} ts={row.get('ts')} said at {actual:.0f}s")
                worst = max(worst, drift)

    if checked < 3:
        return _result("timestamp_accuracy", True, 1.0, f"only {checked} locatable quote(s) (skipped)")

    accuracy = 1 - len(wrong) / checked
    ok = accuracy >= 0.8
    detail = (
        f"{len(wrong)}/{checked} misplaced (worst {worst:.0f}s off): " + "; ".join(wrong[:3])
        if wrong
        else f"{checked}/{checked} quoted facts stamped where they were said"
    )
    return _result("timestamp_accuracy", ok, accuracy, detail)


DETERMINISTIC = [
    schema_validity,
    english_output,
    stitch_integrity,
    speaker_attribution,
    entity_spelling,
    boundary_exclusion,
    timestamp_accuracy,
]
LLM_JUDGED = [action_item_recall, action_item_precision, summary_faithfulness, decision_accuracy, numbers_recall]

