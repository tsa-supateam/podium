"""Rolling words-per-minute with fractional window overlap (spec §6.3.1)."""

from __future__ import annotations

from collections.abc import Iterable, Sequence
from dataclasses import dataclass


@dataclass(frozen=True)
class Word:
    t0: float
    t1: float
    w: str
    p: float = 1.0


def rolling_wpm(words: Iterable[Word], t: float, window: float) -> float:
    """WPM over (t - window, t]; a word straddling the edge counts by the fraction inside."""
    lo = t - window
    total = 0.0
    for wd in words:
        if wd.t1 <= lo or wd.t0 > t:
            continue
        dur = max(wd.t1 - wd.t0, 1e-3)
        inside = min(wd.t1, t) - max(wd.t0, lo)
        total += max(0.0, min(1.0, inside / dur))
    return 60.0 * total / window


def articulation_rate(words: Sequence[Word], t: float, window: float, voiced_s: float) -> float:
    n = sum(1 for wd in words if t - window < wd.t0 <= t)
    return 60.0 * n / voiced_s if voiced_s > 0.5 else 0.0


def pace_label(wpm: float, band: Sequence[float], drag: float, rush: float) -> str:
    if wpm < drag:
        return "drag"
    if wpm < band[0]:
        return "slow"
    if wpm <= band[1]:
        return "optimal"
    if wpm <= rush:
        return "fast"
    return "rushing"
