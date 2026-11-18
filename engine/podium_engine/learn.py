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


def _store() -> dict:
    return _load(_lessons_file()) or {}


def _save(**changes) -> dict:
    data = {**_store(), **changes}
    _lessons_file().write_text(json.dumps(data))
    return data


def lessons_done() -> list[str]:
    return _store().get("lessons", [])


def lesson_times() -> dict[str, str]:
    return _store().get("lessonAt", {})


def _now() -> str:
    from datetime import UTC, datetime

    return datetime.now(UTC).isoformat()


def mark_lesson(lesson_id: str, done: bool = True) -> list[str]:
    done_ids = [x for x in lessons_done() if x != lesson_id] + ([lesson_id] if done else [])
    times = {k: v for k, v in lesson_times().items() if k in done_ids}
    if done:
        times.setdefault(lesson_id, _now())
    _save(lessons=done_ids, lessonAt=times)
    return done_ids


# ---------------------------------------------------------------- Play: quick games and cosmetics
GAMES = ("claimDuel", "spotHedge", "signpostSorter", "evidenceSort")
SLOTS = ("accent", "ring", "xpBar", "badge")


def record_game(game: str, score: float, max_score: float) -> dict:
    """One finished quick game (the app grades it; this only keeps the history, last 50 per game)."""
    if game not in GAMES:
        raise ValueError(f"unknown game {game}")
    games = _store().get("games", {})
    entry = {"at": _now(), "score": round(max(0.0, min(float(score), float(max_score))), 1), "max": float(max_score)}
    games[game] = (games.get(game, []) + [entry])[-50:]
    _save(games=games)
    return games


def equip(slot: str, item: str) -> dict:
    if slot not in SLOTS:
        raise ValueError(f"unknown slot {slot}")
    eq = {**_store().get("equipped", {}), slot: str(item)[:40]}
    _save(equipped=eq)
    return eq


def mark_seen(ids: list[str]) -> list[str]:
    seen = sorted(set(_store().get("seenUnlocks", [])) | {str(i)[:40] for i in ids})
    _save(seenUnlocks=seen)
    return seen


# ---------------------------------------------------------------- Pace Runner and bosses
def pace_runner(summary: dict, warmup: float = 8.0) -> dict | None:
    """Share of speaking time inside the target band, and the longest unbroken stretch in it.
    Pauses don't count either way (pausing is good); the first seconds are a warm-up."""
    p = summary.get("pacing") or {}
    ser, band = p.get("series") or {}, p.get("band") or [120, 160]
    ts, wpm, speech = ser.get("smoothT") or ser.get("t") or [], ser.get("smooth") or ser.get("wpm") or [], ser.get("speech") or []
    if not ts or summary.get("noSpeech"):
        return None
    inside = total = 0
    best = run = 0.0
    prev = None
    for i, t in enumerate(ts):
        dt = (t - prev) if prev is not None else 1.0
        prev = t
        if t < warmup or i >= len(wpm) or (i < len(speech) and not speech[i]):
            continue
        total += 1
        if band[0] <= wpm[i] <= band[1]:
            inside += 1
            run += dt
            best = max(best, run)
        else:
            run = 0.0
    if not total:
        return None
    return {"inBandPct": round(100 * inside / total), "bestStreakSec": round(best), "band": band}


def boss_result(module: str, checks: list[str], summary: dict) -> dict:
    results = [r for r in (evaluate(c, summary) for c in checks) if r]
    return {"module": module, "results": results, "passed": bool(results) and len(results) == len(checks)
            and all(r["passed"] for r in results)}


def _rust(attempts: list[dict], runs: list[tuple[str, bool]]) -> dict:
    """Replays a skill's history in time order. A skill is mastered while a practice has passed and
    2 of the last 3 full runs pass. Once mastered, a failing full run that drops it below that makes
    it rusty; a passed practice (a review) or getting back to 2 of 3 clears the rust."""
    events = sorted([(a.get("at") or "", 0, a["passed"]) for a in attempts] + [(at or "", 1, ok) for at, ok in runs])
    practiced = ever = rusty = False
    since, cleared, window = None, 0, []
    for at, kind, ok in events:
        if kind == 0:
            if ok:
                practiced = True
                if rusty:
                    rusty, cleared = False, cleared + 1
            continue
        window = (window + [ok])[-3:]
        if practiced and sum(window) >= 2:
            ever = True
            if rusty:
                rusty, cleared = False, cleared + 1
        elif ever and not ok and not rusty:
            rusty, since = True, at
    return {"everMastered": ever, "rusty": rusty, "rustySince": since if rusty else None, "rustCleared": cleared}


def status() -> dict:
    """Practice attempts per check, how each check did in the last 3 full runs, rust, bosses,
    Pace Runner bests, quick-game history and cosmetics."""
    attempts: dict[str, list[dict]] = {k: [] for k in CHECKS}
    runs: list[tuple[str, dict]] = []
    bosses: dict[str, list[dict]] = {}
    pace: list[dict] = []
    store = _store()
    activity: list[str] = list(store.get("lessonAt", {}).values())  # when you did something, for streaks
    activity += [g["at"] for gs in store.get("games", {}).values() for g in gs if g.get("at")]
    root = sessions_dir()
    for d in sorted(p for p in root.iterdir() if p.is_dir()) if root.exists() else []:
        meta, summary = _load(d / "session.json"), _load(d / "summary.json")
        if not meta or not summary or meta.get("status") != "analyzed" or meta.get("mode") in ("qa", "replay"):
            continue
        at = meta.get("createdAt")
        if at:
            activity.append(at)
        drill = meta.get("drill")
        if meta.get("boss"):
            if not summary.get("noSpeech"):
                r = summary.get("boss") or boss_result(meta["boss"], meta.get("checks") or [], summary)
                bosses.setdefault(meta["boss"], []).append({**r, "sessionId": meta["sessionId"], "at": at})
        elif drill in CHECKS:
            r = evaluate(drill, summary)
            if r:
                attempts[drill].append({**r, "sessionId": meta["sessionId"], "at": at})
            if meta.get("game") == "paceRunner" and (pr := pace_runner(summary)):
                pace.append({**pr, "sessionId": meta["sessionId"], "at": at})
        elif not summary.get("noSpeech"):
            runs.append((at or d.name, summary))
    recent = runs[-3:]
    checks = {}
    for k in CHECKS:
        history = [(at, r["passed"]) for at, s in runs if (r := evaluate(k, s))]
        checks[k] = {"attempts": attempts[k][-10:],
                     "recent": [r for r in (evaluate(k, s) for _, s in recent) if r],
                     **_rust(attempts[k], history)}
    return {
        "lessons": store.get("lessons", []),
        "activity": sorted(activity)[-400:],
        "checks": checks,
        "bosses": {m: v[-10:] for m, v in bosses.items()},
        "paceRunner": pace[-20:],
        "games": store.get("games", {}),
        "equipped": store.get("equipped", {}),
        "seenUnlocks": store.get("seenUnlocks", []),
    }
