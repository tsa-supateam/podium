"""Deep vocal analysis (spec §4.2 stage 4, §6.4).

Pitch comes from Praat's autocorrelation tracker via Parselmouth: it is as
accurate as librosa.pyin for speech but ~200x faster (5 minutes of audio in
well under a second). Librosa supplies RMS energy. Parselmouth also gives the
voice-quality measures (jitter, shimmer, HNR).
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np

from ..realtime.fusion import robust_std


@dataclass
class ProsodyTrack:
    t: np.ndarray        # frame times (s)
    f0: np.ndarray       # Hz, 0 = unvoiced
    st: np.ndarray       # semitones re speaker median, nan = unvoiced
    rms_db: np.ndarray   # dBFS at the same frame times


def extract(wav: Path, fmin: float = 65, fmax: float = 400, hop_s: float = 0.01) -> tuple[ProsodyTrack, dict]:
    import librosa
    import parselmouth
    from parselmouth.praat import call

    snd = parselmouth.Sound(str(wav))
    pitch = snd.to_pitch_ac(time_step=hop_s, pitch_floor=fmin, pitch_ceiling=fmax)
    f0 = pitch.selected_array["frequency"].astype(float)
    t = pitch.xs()
    voiced = f0 > 0
    med = float(np.median(f0[voiced])) if voiced.any() else 150.0
    st = np.full_like(f0, np.nan)
    st[voiced] = 12 * np.log2(f0[voiced] / med)

    y = snd.values[0].astype(np.float32)
    sr = int(snd.sampling_frequency)
    hop = int(sr * hop_s)
    rms = librosa.feature.rms(y=y, frame_length=4 * hop, hop_length=hop)[0]
    rms_t = librosa.frames_to_time(np.arange(len(rms)), sr=sr, hop_length=hop)
    rms_db = 20 * np.log10(np.interp(t, rms_t, rms) + 1e-9)

    voice: dict = {
        "peakDb": round(float(20 * np.log10(np.max(np.abs(y)) + 1e-9)), 1) if len(y) else -180.0,
        "f0MedianHz": round(med, 1),
        "f0RangeSt": round(float(np.nanpercentile(st, 95) - np.nanpercentile(st, 5)), 2) if voiced.sum() > 20 else 0.0,
        "f0StdSt": round(robust_std(st[voiced]), 2) if voiced.any() else 0.0,
        "rmsDbMean": round(float(np.mean(rms_db[voiced])), 1) if voiced.any() else -60.0,
        "rmsDbStd": round(robust_std(rms_db[voiced]), 2) if voiced.any() else 0.0,
    }
    try:
        pp = call(snd, "To PointProcess (periodic, cc)", fmin, fmax)
        voice["jitterLocal"] = round(float(call(pp, "Get jitter (local)", 0, 0, 0.0001, 0.02, 1.3)), 4)
        voice["shimmerLocal"] = round(float(call([snd, pp], "Get shimmer (local)", 0, 0, 0.0001, 0.02, 1.3, 1.6)), 4)
        harm = call(snd, "To Harmonicity (cc)", 0.01, fmin, 0.1, 1.0)
        voice["hnrDb"] = round(float(call(harm, "Get mean", 0, 0)), 1)
    except Exception:  # voice quality is optional
        pass
    for k in ("jitterLocal", "shimmerLocal", "hnrDb"):
        if k in voice and not np.isfinite(voice[k]):
            del voice[k]  # undefined on silent or unvoiced audio
    return ProsodyTrack(t, f0, st, rms_db), voice


def monotone_segments(track: ProsodyTrack, win_s: float, max_st: float, max_db: float,
                      hop_s: float = 0.01) -> list[dict]:
    """Sliding windows where both pitch and loudness barely move (merged when overlapping)."""
    n = int(win_s / hop_s)
    step = max(1, n // 4)
    flagged: list[tuple[float, float, float]] = []
    for i in range(0, max(0, len(track.t) - n), step):
        st = track.st[i : i + n]
        v = ~np.isnan(st)
        if v.sum() < n * 0.3:
            continue  # mostly silence: not "monotone speech"
        sd = robust_std(st[v])
        ed = robust_std(track.rms_db[i : i + n][v])
        if sd < max_st and ed < max_db:
            flagged.append((float(track.t[i]), float(track.t[min(i + n, len(track.t) - 1)]), sd))
    merged: list[dict] = []
    for t0, t1, sd in flagged:
        if merged and t0 <= merged[-1]["t1"]:
            merged[-1]["t1"] = round(t1, 2)
            merged[-1]["stdSt"] = round(min(merged[-1]["stdSt"], sd), 2)
        else:
            merged.append({"t0": round(t0, 2), "t1": round(t1, 2), "stdSt": round(sd, 2)})
    return merged


def section_pitch_std(track: ProsodyTrack, t0: float, t1: float) -> float | None:
    m = (track.t >= t0) & (track.t < t1) & ~np.isnan(track.st)
    return robust_std(track.st[m]) if m.sum() > 20 else None


def downsample(track: ProsodyTrack, n: int) -> dict:
    """Median per bucket for the debrief chart; a bucket that is mostly unvoiced becomes a gap."""
    step = max(1, len(track.t) // n)
    ts, sts, dbs = [], [], []
    for i in range(0, len(track.t), step):
        seg = track.st[i : i + step]
        v = seg[~np.isnan(seg)]
        ts.append(round(float(track.t[i]), 2))
        sts.append(round(float(np.median(v)), 2) if len(v) >= max(1, step // 2) else None)
        dbs.append(round(float(np.median(track.rms_db[i : i + step])), 1))
    return {"t": ts, "st": sts, "db": dbs}
