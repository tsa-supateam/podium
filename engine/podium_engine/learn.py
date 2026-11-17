"""Learn: practice checks and skill progress for the lessons in the app's Learn section.

Every skill has one check, read from the same analysis summary the results screen uses, so a
skill practiced here is exactly what a full run scores:
  - a practice (a short recorded run tagged with the check, meta["drill"]) passes when its check does;
  - a skill counts as mastered when it also passes in 2 of your last 3 full runs.
Lessons marked read are the only stored state (learn.json); everything else is recomputed.
"""

from __future__ import annotations

import json
from collections.abc import Callable

from .paths import data_dir, sessions_dir


def _part(s: dict, name: str) -> dict:
    return ((s.get("content") or {}).get("parts") or {}).get(name) or {}


def _ov(s: dict) -> dict:
    return s.get("overview") or {}


def _dim(s: dict, name: str) -> int | None:
    return ((_ov(s).get("dimensions") or {}).get(name) or {}).get("score")


def _band(s: dict) -> list[float]:
    return (s.get("pacing") or {}).get("band") or [120, 160]


def _zone(s: dict, z: str) -> float | None:
    pct = ((s.get("gaze") or {}).get("zonePct") or {})
    return pct.get(z)


Check = Callable[[dict], tuple[float | None, bool]]

# check id -> (value, passed). value is what the app shows next to the target.
CHECKS: dict[str, Check] = {
    # Structure
    "claim_up_front": lambda s: ((t := (_ov(s).get("thesis") or {}).get("t")),
                                 t is not None and t <= max(15.0, 0.2 * s.get("durationSec", 0))),
    "signposts": lambda s: (len(_ov(s).get("points", [])), len(_ov(s).get("points", [])) >= 2),
    "conclusion": lambda s: (float(bool(_ov(s).get("concluded"))), bool(_ov(s).get("concluded"))),
    # Evidence
    "examples": lambda s: (_part(s, "evidence").get("count"), (_part(s, "evidence").get("count") or 0) >= 2),
    "hard_evidence": lambda s: (float(bool(_part(s, "evidence").get("hard"))), bool(_part(s, "evidence").get("hard"))),
    "support_every_point": lambda s: (
        sum(1 for p in _ov(s).get("points", []) if p.get("support")),
        len(_ov(s).get("points", [])) >= 2 and all(p.get("support") for p in _ov(s).get("points", []))),
    # Commentary
    "explain_evidence": lambda s: (_dim(s, "commentary"), (_dim(s, "commentary") or 0) >= 3),
    "why_it_matters": lambda s: (_dim(s, "commentary"), (_dim(s, "commentary") or 0) >= 4),
    "other_side": lambda s: (float(bool(_ov(s).get("counterargument"))), bool(_ov(s).get("counterargument"))),
    # Clarity & word choice
    "direct": lambda s: (_part(s, "directness").get("per100"),
                         _part(s, "directness").get("per100") is not None and _part(s, "directness")["per100"] <= 2.0),
    "one_idea": lambda s: (_part(s, "clarity").get("avgWords"), 9 <= (_part(s, "clarity").get("avgWords") or 0) <= 20),
    "takeaway": lambda s: (float(bool(_part(s, "takeaway").get("found"))), bool(_part(s, "takeaway").get("found"))),
    # Speaking speed
    "target_pace": lambda s: ((w := (s.get("pacing") or {}).get("meanWpm")),
                              bool(w) and _band(s)[0] <= w <= _band(s)[1]),
    "steady_pace": lambda s: ((s.get("scores") or {}).get("pacing"), ((s.get("scores") or {}).get("pacing") or 0) >= 70),
    # Filler words
    "fewer_fillers": lambda s: ((f := (s.get("fillers") or {}).get("perMinute")), f is not None and f <= 4),
    "pause_not_fill": lambda s: ((f := (s.get("fillers") or {}).get("perMinute")), f is not None and f <= 1.5),
    # Vocal variety
    "pitch_range": lambda s: ((v := (s.get("scores") or {}).get("vocalVariety")), (v or 0) >= 65),
    "stress_words": lambda s: ((v := (s.get("scores") or {}).get("vocalVariety")), (v or 0) >= 80),
    # Eye contact
    "hold_contact": lambda s: ((e := (s.get("scores") or {}).get("eyeContact")), (e or 0) >= 70),
    "sweep_room": lambda s: ((m := min(_zone(s, "L") or 0, _zone(s, "R") or 0)),
                             (s.get("gaze") or {}).get("mode") == "camera" or m >= 15),
}


def evaluate(check_id: str, summary: dict) -> dict | None:
    fn = CHECKS.get(check_id)
    if not fn or summary.get("noSpeech"):
        return None
    try:
        value, passed = fn(summary)
    except (TypeError, KeyError, ValueError):
        return None
    return {"id": check_id, "value": None if value is None else round(float(value), 1), "passed": bool(passed)}


def _load(p):
    try:
        return json.loads(p.read_text(), parse_constant=lambda _: None)
    except (OSError, ValueError):
        return None


def _lessons_file():
    return data_dir() / "learn.json"


def lessons_done() -> list[str]:
    return (_load(_lessons_file()) or {}).get("lessons", [])


def lesson_times() -> dict[str, str]:
    return (_load(_lessons_file()) or {}).get("lessonAt", {})


def mark_lesson(lesson_id: str, done: bool = True) -> list[str]:
    from datetime import UTC, datetime

    done_ids = [x for x in lessons_done() if x != lesson_id] + ([lesson_id] if done else [])
    times = {k: v for k, v in lesson_times().items() if k in done_ids}
    if done:
        times.setdefault(lesson_id, datetime.now(UTC).isoformat())
    _lessons_file().write_text(json.dumps({"lessons": done_ids, "lessonAt": times}))
    return done_ids


def status() -> dict:
    """Practice attempts per check, and how each check did in the last 3 full runs."""
    attempts: dict[str, list[dict]] = {k: [] for k in CHECKS}
    runs: list[dict] = []
    activity: list[str] = list(lesson_times().values())  # when you did something, for streaks
    root = sessions_dir()
    for d in sorted(p for p in root.iterdir() if p.is_dir()) if root.exists() else []:
        meta, summary = _load(d / "session.json"), _load(d / "summary.json")
        if not meta or not summary or meta.get("status") != "analyzed" or meta.get("mode") in ("qa", "replay"):
            continue
        if meta.get("createdAt"):
            activity.append(meta["createdAt"])
        drill = meta.get("drill")
        if drill in CHECKS:
            r = evaluate(drill, summary)
            if r:
                attempts[drill].append({**r, "sessionId": meta["sessionId"], "at": meta.get("createdAt")})
        elif not summary.get("noSpeech"):
            runs.append(summary)
    recent = runs[-3:]
    return {
        "lessons": lessons_done(),
        "activity": sorted(activity)[-400:],
        "checks": {k: {"attempts": attempts[k][-10:],
                       "recent": [r for r in (evaluate(k, s) for s in recent) if r]} for k in CHECKS},
    }
