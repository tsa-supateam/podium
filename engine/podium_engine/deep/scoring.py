"""Gaze summary and composite scoring (spec §6.2.4, §6.5)."""

from __future__ import annotations

import base64
import re

import numpy as np

from ..realtime.fusion import AUDIENCE_ZONES, audience_entropy, clip01
from .segmentation import tri

YAW_BINS = (-40.0, 40.0, 2.0)
PITCH_BINS = (-30.0, 20.0, 2.0)


# Without notes there is no reason to look down, so shorter downward looks count against you.
STARE_SEC = {True: 5.0, False: 2.5}


DEFAULT_ZONES = {"L": [-25.0, 2.0], "C": [0.0, 2.0], "R": [25.0, 2.0], "N": [0.0, -25.0]}
MIN_SIDE_SEP = 10.0  # degrees: a side zone closer to center than this was a weak calibration


def zone_centers(calibration: dict | None) -> dict[str, list[float]]:
    """Zone centers (yaw, pitch) the classifier used: calibrated if available, with weak calibrations
    pushed apart the same way the app does (lib/gaze.ts sanitizeZoneModel)."""
    m = {z: list(v) for z, v in DEFAULT_ZONES.items()}
    if calibration and calibration.get("zoneModel"):
        for z, g in calibration["zoneModel"].items():
            if z in m:
                m[z] = [float(g["mu"][0]), float(g["mu"][1])]
    cx, cy = m["C"]
    m["L"][0] = min(m["L"][0], cx - MIN_SIDE_SEP)
    m["R"][0] = max(m["R"][0], cx + MIN_SIDE_SEP)
    m["N"][1] = min(m["N"][1], cy - MIN_SIDE_SEP)
    return m


def zone_boundaries(centers: dict[str, list[float]]) -> dict[str, float]:
    """Where the classifier switches zones (equal-variance Gaussians: halfway between centers)."""
    return {"leftCenter": round((centers["L"][0] + centers["C"][0]) / 2, 1),
            "centerRight": round((centers["C"][0] + centers["R"][0]) / 2, 1),
            "down": round((centers["C"][1] + centers["N"][1]) / 2, 1)}


def gaze_summary(gaze: list[dict], duration: float, notes: bool = True, mode: str = "room",
                 calibration: dict | None = None) -> dict | None:
    """`notes`: the speaker had notes or slides. If False, zone N means "looking down", not "reading".
    `mode`: "room" (simulated audience left/center/right) or "camera" (eye contact = looking up at the camera)."""
    if len(gaze) < 30:
        return None
    gaze = sorted(gaze, key=lambda g: g["t"])
    ts = np.array([g["t"] for g in gaze])
    dt = np.clip(np.diff(ts, append=ts[-1] + 1 / 30), 0, 0.1)
    faces = [bool(g.get("face", True)) for g in gaze]
    zones = [g.get("zone", "X") if f else "X" for g, f in zip(gaze, faces)]
    tot = {z: 0.0 for z in ("L", "C", "R", "N", "X")}
    for d, z in zip(dt, zones):
        tot[z] += float(d)
    all_t = sum(tot.values()) or 1.0
    # Only "no face detected" is excluded. Looking away with the face visible (zone X) is real
    # time off the audience and must count against eye contact.
    visible = float(sum(d for d, f in zip(dt, faces) if f))
    zone_pct = {z: round(100 * v / all_t, 1) for z, v in tot.items()}
    shares = {z: v / all_t for z, v in tot.items()}
    aud = sum(tot[z] for z in AUDIENCE_ZONES)

    # longest uninterrupted notes stare
    longest, run_start = 0.0, None
    stares: list[dict] = []
    for t, z in zip(ts, zones + ["X"]):
        if z == "N" and run_start is None:
            run_start = t
        elif z != "N" and run_start is not None:
            dur = t - run_start
            longest = max(longest, dur)
            if dur > STARE_SEC[notes]:
                stares.append({"t0": round(float(run_start), 2), "t1": round(float(t), 2)})
            run_start = None

    # heatmap (yaw, pitch) histogram, Gaussian-smoothed, centered on the speaker's own center
    centers = zone_centers(calibration)
    cx, cy = centers["C"]
    yaw_bins = (round(cx - 40, 1), round(cx + 40, 1), YAW_BINS[2])
    pitch_bins = (round(cy - 30, 1), round(cy + 20, 1), PITCH_BINS[2])
    pts = np.array([(g.get("gYaw", g.get("yaw", 0)), g.get("gPitch", g.get("pitch", 0)))
                    for g in gaze if g.get("face", True) and ("gYaw" in g or "yaw" in g)], dtype=float).reshape(-1, 2)
    yb = np.arange(yaw_bins[0], yaw_bins[1] + yaw_bins[2], yaw_bins[2])
    pb = np.arange(pitch_bins[0], pitch_bins[1] + pitch_bins[2], pitch_bins[2])
    hist = np.zeros((len(pb) - 1, len(yb) - 1))
    if len(pts):
        hist, _, _ = np.histogram2d(pts[:, 1], pts[:, 0], bins=[pb, yb])
        from scipy.ndimage import gaussian_filter

        hist = gaussian_filter(hist, 1.5)
        hist = hist / (hist.max() or 1.0)
    enc = base64.b64encode((hist * 255).astype(np.uint8).tobytes()).decode()

    timeline = []
    last = None
    for t, z in zip(ts, zones):
        if z != last:
            timeline.append([round(float(t), 2), z])
            last = z
    return {
        "faceVisibleFrac": round(visible / all_t, 3),
        "zonePct": zone_pct,
        "audiencePct": round(100 * aud / (visible or 1.0), 1),
        "balanceEntropy": round(audience_entropy(shares), 3),
        "longestNotesStareSec": round(longest, 1),
        "notesStares": stares,
        "notesMode": notes,
        "mode": mode,
        "boundaries": zone_boundaries(centers),
        "heatmap": {"yawBins": list(yaw_bins), "pitchBins": list(pitch_bins),
                    "rows": int(hist.shape[0]), "cols": int(hist.shape[1]), "u8": enc},
        "timeline": timeline,
    }


def score_eye(g: dict | None) -> int | None:
    if not g:
        return None
    notes = g.get("notesMode", True)
    target = 0.75 if notes else 0.85  # no notes: nothing to read, so expect more audience time
    aud_frac = g["audiencePct"] / 100
    # camera mode: there is no room to sweep, so spreading attention left/right doesn't apply
    spread = 1.0 if g.get("mode") == "camera" else (0.7 + 0.3 * g["balanceEntropy"])
    s = 100 * clip01(aud_frac / target) ** 0.7 * spread
    s -= min(20, (2 if notes else 3) * len(g.get("notesStares", [])))
    return int(round(max(0.0, s)))


def score_pace(p: dict, band: list[float]) -> int:
    mu = p.get("meanWpm", 0)
    if mu <= 0:
        return 0
    lo, hi = band
    in_band = 1.0 if lo <= mu <= hi else clip01(1 - (lo - mu if mu < lo else mu - hi) / 40)
    cv = tri(p.get("cv", 0), 0.02, 0.15, 0.35)
    jitter = clip01(1 - (p.get("npvi", 0) - 8) / 12)
    return int(round(100 * (0.5 * in_band + 0.3 * cv + 0.2 * jitter)))


def score_fillers(per_min: float) -> int:
    return int(round(100 * clip01(1 - (per_min - 1) / 9)))


def score_voice(v: dict) -> int:
    return int(round(100 * (0.6 * tri(v.get("f0StdSt", 0), 0.5, 3.5, 8.0) + 0.4 * tri(v.get("rmsDbStd", 0), 1.0, 5.0, 11.0))))


HOOK = re.compile(r"(\?|\d|imagine|what if|did you know|have you ever|picture this)", re.IGNORECASE)
TRANSITIONS = ["first", "firstly", "second", "secondly", "third", "next", "then", "finally", "lastly", "another",
               "in conclusion", "to conclude", "to summarize", "in summary", "moving on", "on the other hand",
               "for example", "for instance", "however"]
CONCLUSION = re.compile(r"\b(in conclusion|to conclude|to summarize|in summary|to sum up|thank you|finally)\b", re.IGNORECASE)


def structure(sents: list, duration: float, target_s: float | None) -> dict:
    text = " ".join(s.text for s in sents).lower()
    opening = [s for s in sents if s.t0 <= max(0.15 * duration, 10)]
    closing = [s for s in sents if s.t1 >= 0.85 * duration]
    found = [t for t in TRANSITIONS if re.search(r"\b" + re.escape(t) + r"\b", text)]
    hook = any(HOOK.search(s.text) for s in opening)
    concl = any(CONCLUSION.search(s.text) for s in closing)
    in_time = target_s is None or abs(duration - target_s) <= 0.1 * target_s
    score = 25 * hook + 25 * (len(found) >= 2) + 25 * concl + 25 * in_time
    return {"sentences": len(sents), "openingHook": hook, "conclusionDetected": concl,
            "transitions": found, "withinTarget": in_time, "score": int(score)}


def overall(scores: dict[str, int | None]) -> tuple[int, str]:
    w = {"pacing": 0.20, "fillers": 0.20, "vocalVariety": 0.20, "eyeContact": 0.25, "structure": 0.15}
    num = sum(w[k] * v for k, v in scores.items() if k in w and v is not None)
    den = sum(w[k] for k, v in scores.items() if k in w and v is not None)
    s = round(num / den) if den else 0
    grade = next(g for cut, g in [(93, "A"), (90, "A-"), (87, "B+"), (83, "B"), (80, "B-"), (77, "C+"), (73, "C"),
                                  (70, "C-"), (60, "D"), (0, "F")] if s >= cut)
    return s, grade


TOP_WEIGHTS = {"content": 0.35, "structure": 0.25, "engagement": 0.40}


def top_level(delivery: dict, content: int | None, structure: int | None, audience_e: float | None,
              no_speech: bool = False) -> dict:
    """The three headline scores. Engagement = how the delivery (speed, fillers, voice, eye contact)
    and the live audience's reaction averaged out; delivery details stay available underneath."""
    if no_speech:
        delivery = {k: (v if k == "eyeContact" else None) for k, v in delivery.items()}
        content = structure = None
    d_vals = [v for v in delivery.values() if v is not None]
    d_avg = sum(d_vals) / len(d_vals) if d_vals else None
    parts = [v for v in (d_avg, audience_e) if v is not None]
    engagement = round(sum(parts) / len(parts)) if parts else None
    top = {"content": content, "structure": structure, "engagement": engagement}
    num = sum(TOP_WEIGHTS[k] * v for k, v in top.items() if v is not None)
    den = sum(TOP_WEIGHTS[k] for k, v in top.items() if v is not None)
    s = round(num / den) if den else 0
    grade = next(g for cut, g in [(93, "A"), (90, "A-"), (87, "B+"), (83, "B"), (80, "B-"), (77, "C+"), (73, "C"),
                                  (70, "C-"), (60, "D"), (0, "F")] if s >= cut)
    return {**top, **delivery, "overall": s, "grade": grade}
