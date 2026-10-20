"""Audience engagement curve: summary, deepest dips with their causes, and the best stretch.

Input is the live engine's engagement telemetry (one record every 250 ms):
    {"t", "E" (0-100), "B", "c": {filler, monotony, gaze, pace, silence}}
"""

from __future__ import annotations

from collections.abc import Sequence

import numpy as np

TICK_S = 0.25
CAUSES = ("filler", "monotony", "gaze", "pace", "silence")
# How much each cause moves the Boredom Index (same weights as the live fusion; silence replaces
# the speech causes during long pauses, see realtime/engine.py).
CAUSE_WEIGHT = {"filler": 0.25, "monotony": 0.30, "gaze": 0.35, "pace": 0.10, "silence": 0.65}
ENGAGED, BORED = 65, 35
WARMUP_S = 15.0  # the audience starts attentive; the first seconds say nothing about the speech


def _smooth(x: np.ndarray, n: int) -> np.ndarray:
    if len(x) < n or n <= 1:
        return x.astype(float)
    k = np.ones(n) / n
    pad = np.pad(x.astype(float), (n // 2, n - 1 - n // 2), mode="edge")
    return np.convolve(pad, k, mode="valid")


def _cause_means(records: Sequence[dict], t0: float, t1: float) -> dict[str, float]:
    """Average weighted contribution of each cause in [t0, t1]."""
    sums = {c: 0.0 for c in CAUSES}
    n = 0
    for r in records:
        if t0 <= r["t"] <= t1:
            n += 1
            for c in CAUSES:
                v = (r.get("c") or {}).get(c)
                if v is not None:
                    sums[c] += CAUSE_WEIGHT[c] * v
    return {c: s / n for c, s in sums.items()} if n else sums


def ranked_causes(records: Sequence[dict], t0: float, t1: float) -> list[str]:
    """Causes by weighted contribution in [t0, t1], strongest first (negligible ones dropped)."""
    means = _cause_means(records, t0, t1)
    return [c for c in sorted(means, key=means.get, reverse=True) if means[c] > 0.02]


def find_dips(t: np.ndarray, E: np.ndarray, k: int = 3, min_sep: float = 15.0, min_drop: float = 6.0) -> list[dict]:
    """The k deepest local minima of smoothed E, at least `min_sep` apart.

    A dip must sit `min_drop` points below the talk's median engagement; its start/end are where
    E climbs back halfway to that median (searched up to ±min_sep around the minimum).
    """
    if len(E) < 8:
        return []
    s = _smooth(E, 8)  # 2 s
    ref = float(np.median(s))
    valid = t >= min(WARMUP_S, t[-1] / 3)
    order = [i for i in np.argsort(s) if valid[i]]
    dips: list[dict] = []
    for i in order:
        if len(dips) == k or ref - s[i] < min_drop:
            break
        if any(abs(t[i] - d["t"]) < min_sep for d in dips):
            continue
        lo, hi = i, i
        level = s[i] + 0.5 * (ref - s[i])
        while lo > 0 and s[lo - 1] < level and t[i] - t[lo - 1] <= min_sep:
            lo -= 1
        while hi < len(s) - 1 and s[hi + 1] < level and t[hi + 1] - t[i] <= min_sep:
            hi += 1
        dips.append({"t": round(float(t[i]), 2), "t0": round(float(t[lo]), 2), "t1": round(float(t[hi]), 2),
                     "E": int(E[lo : hi + 1].min())})
    dips.sort(key=lambda d: d["t"])
    for a, b in zip(dips, dips[1:]):  # neighbouring dips must not share seconds
        mid = round((a["t"] + b["t"]) / 2, 2)
        a["t1"], b["t0"] = min(a["t1"], mid), max(b["t0"], mid)
    return dips


def find_peak(t: np.ndarray, E: np.ndarray, window_s: float = 10.0) -> dict | None:
    """The ~10 s stretch with the highest average engagement (after the warm-up)."""
    n = int(window_s / TICK_S)
    if len(E) < n + 4:
        return None
    means = np.convolve(E.astype(float), np.ones(n) / n, mode="valid")  # means[j] covers E[j : j+n]
    ok = np.where(t[: len(means)] >= min(WARMUP_S, t[-1] / 3))[0]
    if not len(ok):
        return None
    j = int(ok[np.argmax(means[ok])])
    return {"t0": round(float(t[j]), 2), "t1": round(float(t[j + n - 1]), 2), "E": int(round(float(means[j])))}


def summarize(records: list[dict], every: int = 4) -> dict | None:
    """Existing fields (meanE, minE, timeBoredPct, lowPoints, series.t/E) plus engagedPct,
    per-cause series, dips (without coaching lines yet) and peak."""
    if not records:
        return None
    t = np.array([r["t"] for r in records], dtype=float)
    E = np.array([r["E"] for r in records], dtype=float)
    low = sorted(records, key=lambda r: r["E"])[:3]
    ds = records[::every]
    series: dict = {"t": [r["t"] for r in ds], "E": [r["E"] for r in ds]}
    for c in CAUSES:
        series[c] = [None if (r.get("c") or {}).get(c) is None else round(r["c"][c], 2) for r in ds]

    dips = find_dips(t, E)
    for d in dips:
        # The audience reacts over a few seconds, so look a little before the dip for its cause.
        # The pipeline confirms these against the transcript and picks the first with evidence.
        d["causes"] = ranked_causes(records, d["t0"] - 5.0, d["t1"])
    peak = find_peak(t, E)
    if peak and peak["E"] < max(60.0, float(E.mean()) + 5) and peak["E"] < float(E.mean()) + 5:
        peak = None  # only mark a best stretch that clearly stands out
    return {
        "meanE": round(float(E.mean()), 1),
        "minE": int(E.min()),
        "engagedPct": round(100 * float((E >= ENGAGED).mean()), 1),
        "boredPct": round(100 * float((E < BORED).mean()), 1),
        "timeBoredPct": round(100 * sum(1 for r in records if r["B"] > 0.65) / len(records), 1),
        "lowPoints": [{"t": r["t"], "E": r["E"],
                       "drivers": [k for k, v in sorted((r.get("c") or {}).items(), key=lambda kv: -(kv[1] or 0))
                                   if v is not None][:2]} for r in low],
        "series": series,
        "dips": dips,
        "peak": peak,
    }
