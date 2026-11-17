"""Average performance: one report across all full runs (Q&A answers, replays and Learn practices
are left out). Shaped like a run's summary where it can be, so the results screen's charts work on it.

Gaze heatmaps share one grid centered on each run's calibrated center (C±40° yaw, C-30..C+20°
pitch), so they average cell by cell in that center-relative frame; zone boundaries are averaged
in the same frame.
"""

from __future__ import annotations

import base64
import json
from collections import Counter

from .paths import sessions_dir

SCORE_KEYS = ["overall", "content", "structure", "engagement", "pacing", "fillers", "vocalVariety", "eyeContact",
              "audienceE"]
CURVE_POINTS = 40
# same cut-offs as deep.scoring.overall()
GRADES = [(93, "A"), (90, "A-"), (87, "B+"), (83, "B"), (80, "B-"), (77, "C+"), (73, "C"), (70, "C-"), (60, "D"), (0, "F")]


def _load(p):
    try:
        return json.loads(p.read_text(), parse_constant=lambda _: None)
    except (OSError, ValueError):
        return None


def _mean(xs, nd: int = 1):
    xs = [x for x in xs if isinstance(x, (int, float))]
    return round(sum(xs) / len(xs), nd) if xs else None


def _get(d, *path):
    for k in path:
        if not isinstance(d, dict):
            return None
        d = d.get(k)
    return d


def runs(speech_type: str | None = None) -> list[tuple[dict, dict]]:
    out = []
    root = sessions_dir()
    for d in sorted(p for p in root.iterdir() if p.is_dir()) if root.exists() else []:
        meta, s = _load(d / "session.json"), _load(d / "summary.json")
        if (not meta or not s or meta.get("status") != "analyzed" or meta.get("mode") in ("qa", "replay")
                or meta.get("drill") or s.get("noSpeech")):
            continue
        kind = "impromptu" if meta.get("speechType") == "impromptu" else "prepared"
        if speech_type and kind != speech_type:
            continue
        out.append((meta, s))
    return out


def _heatmap(gazes: list[dict]) -> dict | None:
    grids, rows, cols, bounds = [], None, None, []
    for g in gazes:
        h = g.get("heatmap") or {}
        if not h.get("u8") or not h.get("yawBins"):
            continue
        r, c = h["rows"], h["cols"]
        if rows is None:
            rows, cols = r, c
        if (r, c) != (rows, cols):
            continue
        raw = base64.b64decode(h["u8"])
        peak = max(raw) or 1
        grids.append([v / peak for v in raw])
        cy, cp = h["yawBins"][0] + 40, h["pitchBins"][0] + 30  # this run's calibrated center
        b = g.get("boundaries")
        if b:
            bounds.append((b["leftCenter"] - cy, b["centerRight"] - cy, b["down"] - cp))
    if not grids:
        return None
    avg = [sum(col) / len(grids) for col in zip(*grids)]
    peak = max(avg) or 1
    u8 = bytes(min(255, round(255 * v / peak)) for v in avg)
    out = {"heatmap": {"yawBins": [-40.0, 40.0, 2.0], "pitchBins": [-30.0, 20.0, 2.0], "rows": rows, "cols": cols,
                       "u8": base64.b64encode(u8).decode()}}
    if bounds:
        out["boundaries"] = {k: round(sum(b[i] for b in bounds) / len(bounds), 1)
                             for i, k in enumerate(("leftCenter", "centerRight", "down"))}
    return out


def _curve(engs: list[dict]) -> list[float]:
    """Average audience engagement over the course of a talk (0 = start, 1 = end)."""
    sums, n = [0.0] * CURVE_POINTS, [0] * CURVE_POINTS
    for e in engs:
        t, v = (e.get("series") or {}).get("t") or [], (e.get("series") or {}).get("E") or []
        if len(t) < 2 or not t[-1]:
            continue
        for i in range(CURVE_POINTS):
            x = t[-1] * i / (CURVE_POINTS - 1)
            j = min(range(len(t)), key=lambda k: abs(t[k] - x))
            if v[j] is not None:
                sums[i] += v[j]
                n[i] += 1
    return [round(s / c, 1) if c else None for s, c in zip(sums, n)]


def average(speech_type: str | None = None) -> dict:
    rs = runs(speech_type)
    if not rs:
        return {"count": 0}
    metas, ss = [m for m, _ in rs], [s for _, s in rs]
    scores = {k: _mean([_get(s, "scores", k) for s in ss], 0) for k in SCORE_KEYS}
    scores = {k: (int(v) if v is not None else None) for k, v in scores.items()}
    ov = scores.get("overall") or 0
    scores["grade"] = next(g for cut, g in GRADES if ov >= cut)

    gazes = [s["gaze"] for s in ss if s.get("gaze")]
    gaze = None
    if gazes:
        modes = Counter(g.get("mode", "room") for g in gazes)
        gaze = {
            "zonePct": {z: _mean([_get(g, "zonePct", z) for g in gazes]) or 0 for z in "LCRNX"},
            "audiencePct": _mean([g.get("audiencePct") for g in gazes]),
            "balanceEntropy": _mean([g.get("balanceEntropy") for g in gazes], 3),
            "faceVisibleFrac": _mean([g.get("faceVisibleFrac") for g in gazes], 3),
            "longestNotesStareSec": _mean([g.get("longestNotesStareSec") for g in gazes]),
            "notesStares": [], "notesMode": sum(bool(g.get("notesMode", True)) for g in gazes) * 2 >= len(gazes),
            "mode": modes.most_common(1)[0][0], "runs": len(gazes),
            **(_heatmap(gazes) or {}),
        }

    by_token: Counter = Counter()
    for s in ss:
        by_token.update(_get(s, "fillers", "byToken") or {})
    part_names = sorted({k for s in ss for k in (_get(s, "content", "parts") or {})})
    dims = {k: _mean([_get(s, "overview", "dimensions", k, "score") for s in ss]) for k in ("structure", "evidence", "commentary")}
    kinds = Counter("impromptu" if m.get("speechType") == "impromptu" else "prepared" for m in metas)

    return {
        "count": len(rs),
        "speechTypes": dict(kinds),
        "firstAt": metas[0].get("createdAt"), "lastAt": metas[-1].get("createdAt"),
        "totalMinutes": round(sum(s.get("durationSec", 0) for s in ss) / 60, 1),
        "avgDurationSec": _mean([s.get("durationSec") for s in ss]),
        "wordCount": round(sum(s.get("wordCount", 0) for s in ss) / len(ss)),
        "scores": scores,
        "trend": {k: [_get(s, "scores", k) for s in ss] for k in ("overall", "content", "structure", "engagement")},
        "runs": [{"sessionId": m["sessionId"], "title": m.get("title", ""), "at": m.get("createdAt"),
                  "overall": _get(s, "scores", "overall")} for m, s in rs],
        "pacing": {"meanWpm": _mean([_get(s, "pacing", "meanWpm") for s in ss]),
                   "articulationRate": _mean([_get(s, "pacing", "articulationRate") for s in ss]),
                   "pauseRatio": _mean([_get(s, "pacing", "pauseRatio") for s in ss], 3),
                   "cv": _mean([_get(s, "pacing", "cv") for s in ss], 3),
                   "wpmTrend": [_get(s, "pacing", "meanWpm") for s in ss]},
        "fillers": {"perMinute": _mean([_get(s, "fillers", "perMinute") for s in ss], 2),
                    "total": sum(_get(s, "fillers", "total") or 0 for s in ss),
                    "byToken": dict(by_token.most_common(8))},
        "voice": {k: _mean([_get(s, "voice", k) for s in ss], 2) for k in ("f0RangeSt", "f0StdSt", "rmsDbStd", "f0MedianHz")},
        "gaze": gaze,
        "content": {"score": _mean([_get(s, "content", "score") for s in ss], 0),
                    "parts": {k: {"score": _mean([_get(s, "content", "parts", k, "score") for s in ss], 0)} for k in part_names}},
        "dimensions": {k: v for k, v in dims.items() if v is not None},
        "engagement": {"meanE": _mean([_get(s, "engagement", "meanE") for s in ss]),
                       "engagedPct": _mean([_get(s, "engagement", "engagedPct") for s in ss]),
                       "curve": _curve([s["engagement"] for s in ss if s.get("engagement")])},
    }
