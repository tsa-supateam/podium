"""Pace regimes, acceleration zones and filler clustering (spec §6.3)."""

from __future__ import annotations

import numpy as np

from ..realtime.fillers import FillerEvent
from ..realtime.pace import Word, pace_label, rolling_wpm


def wpm_series(words: list[Word], duration: float, regions: list[tuple[float, float]], window: float = 5.0
               ) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """1 Hz WPM samples, plus a mask of windows that are mostly speech (≥ 50%)."""
    ts = np.arange(window, max(duration, window) + 1e-9, 1.0)
    wpm = np.array([rolling_wpm(words, t, window) for t in ts])
    speech = np.zeros_like(ts, dtype=bool)
    for i, t in enumerate(ts):
        covered = sum(max(0.0, min(e, t) - max(s, t - window)) for s, e in regions)
        speech[i] = covered / window >= 0.5
    return ts, wpm, speech


def tri(x: float, a: float, b: float, c: float) -> float:
    if x <= a or x >= c:
        return 0.0
    return (x - a) / (b - a) if x <= b else (c - x) / (c - b)


def pacing_stats(ts: np.ndarray, wpm: np.ndarray, speech: np.ndarray, band: list[float], drag: float,
                 rush: float) -> dict:
    from scipy.signal import savgol_filter

    w = wpm[speech]
    tv = ts[speech]
    if len(w) < 3:
        return {"meanWpm": 0, "medianWpm": 0, "stdWpm": 0, "cv": 0, "npvi": 0, "segments": [], "accelZones": [],
                "series": {"t": ts.round(1).tolist(), "wpm": wpm.round(1).tolist()}}
    mu, sd = float(np.mean(w)), float(np.std(w, ddof=1))
    npvi = float(100 / (len(w) - 1) * np.sum(np.abs(np.diff(w)) / ((w[:-1] + w[1:]) / 2 + 1e-9)))

    win = min(7, len(w) - (1 - len(w) % 2))
    smooth = savgol_filter(w, win, 2) if win >= 3 else w.copy()
    deriv = np.gradient(smooth, tv) if len(tv) > 1 else np.zeros_like(smooth)

    segments = _pelt_segments(tv, smooth, band, drag, rush)
    med = float(np.median(w))
    zones = _accel_zones(tv, deriv, smooth, med)
    return {
        "meanWpm": round(mu, 1), "medianWpm": round(med, 1), "stdWpm": round(sd, 1),
        "cv": round(sd / mu, 3) if mu else 0.0, "npvi": round(npvi, 1),
        "segments": segments, "accelZones": zones,
        "series": {"t": ts.round(1).tolist(), "wpm": wpm.round(1).tolist(), "speech": speech.tolist(),
                   "smoothT": tv.round(1).tolist(), "smooth": smooth.round(1).tolist()},
    }


def _pelt_segments(t: np.ndarray, y: np.ndarray, band, drag, rush) -> list[dict]:
    import ruptures as rpt

    if len(y) < 6:
        bkps = [len(y)]
    else:
        var = float(np.var(y)) or 1.0
        algo = rpt.Pelt(model="l2", min_size=4).fit(y.reshape(-1, 1))
        bkps = algo.predict(pen=3 * var * np.log(len(y)))
    out, start = [], 0
    for b in bkps:
        seg = y[start:b]
        if len(seg):
            m = float(np.mean(seg))
            out.append({"t0": round(float(t[start]) - 5.0, 1), "t1": round(float(t[b - 1]), 1),
                        "meanWpm": round(m, 1), "label": pace_label(m, band, drag, rush)})
        start = b
    return out


def _accel_zones(t: np.ndarray, d: np.ndarray, y: np.ndarray, median: float) -> list[dict]:
    """Spans where pace rises (or falls) > 2 WPM/s for ≥ 4 s, or sits ≥ 20% off the speaker's median."""
    zones: list[dict] = []

    def scan(mask: np.ndarray, kind: str) -> None:
        i = 0
        while i < len(mask):
            if mask[i]:
                j = i
                while j + 1 < len(mask) and mask[j + 1]:
                    j += 1
                if t[j] - t[i] >= 4.0:
                    zones.append({"t0": round(float(t[i]) - 5.0, 1), "t1": round(float(t[j]), 1), "kind": kind,
                                  "peakWpm": round(float(y[i : j + 1].max() if kind != "decel" else y[i : j + 1].min()), 1)})
                i = j + 1
            else:
                i += 1

    scan(d > 2.0, "accel")
    scan(d < -2.0, "decel")
    scan(y > 1.2 * median, "rush")
    return sorted(zones, key=lambda z: z["t0"])


def filler_clusters(fillers: list[FillerEvent], eps: float, min_samples: int) -> tuple[list[dict], float]:
    """1-D DBSCAN over filler times + Goh–Barabási burstiness of inter-filler gaps."""
    if not fillers:
        return [], 0.0
    times = np.array([f.t0 for f in fillers]).reshape(-1, 1)
    clusters: list[dict] = []
    if len(fillers) >= min_samples:
        from sklearn.cluster import DBSCAN

        labels = DBSCAN(eps=eps, min_samples=min_samples).fit(times).labels_
        for lab in sorted(set(labels) - {-1}):
            idx = np.where(labels == lab)[0]
            clusters.append({"t0": round(float(times[idx].min()), 2), "t1": round(float(fillers[idx[-1]].t1), 2),
                             "count": len(idx), "tokens": [fillers[i].token for i in idx]})
    burst = 0.0
    if len(fillers) >= 3:
        gaps = np.diff(times.ravel())
        mu, sd = float(gaps.mean()), float(gaps.std())
        burst = (sd - mu) / (sd + mu) if sd + mu > 0 else 0.0
    return clusters, round(burst, 3)


def pauses_from_words(words: list[Word], min_gap: float = 0.25) -> list[dict]:
    return [{"t0": round(a.t1, 2), "t1": round(b.t0, 2)} for a, b in zip(words, words[1:]) if b.t0 - a.t1 >= min_gap]
