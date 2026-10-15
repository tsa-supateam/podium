"""Boredom Index fusion (spec §6.1). Pure functions + a small stateful integrator."""

from __future__ import annotations

import math
from collections import deque
from collections.abc import Iterable
from dataclasses import dataclass, field

import numpy as np

AUDIENCE_ZONES = ("L", "C", "R")
ALL_ZONES = ("L", "C", "R", "N", "X")


def clip01(x: float) -> float:
    return 0.0 if x < 0 else 1.0 if x > 1 else x


def sigmoid(x: float) -> float:
    return 1.0 / (1.0 + math.exp(-x))


def filler_component(n_fillers: int, n_words: int, rho0: float, s_f: float) -> float:
    rho = n_fillers / max(n_words, 1)
    return sigmoid((rho - rho0) / s_f)


def robust_std(x: np.ndarray) -> float:
    """MAD-based spread: YIN octave errors would otherwise inflate a plain std."""
    x = np.asarray(x, dtype=float)
    if len(x) < 2:
        return 0.0
    return float(1.4826 * np.median(np.abs(x - np.median(x))))


def monotony_component(semitones: np.ndarray, rms_db: np.ndarray, sigma_lo: float, sigma_hi: float,
                       e_lo: float, e_hi: float) -> float | None:
    if len(semitones) < 10:
        return None
    m_p = clip01((sigma_hi - robust_std(semitones)) / (sigma_hi - sigma_lo))
    m_e = clip01((e_hi - robust_std(rms_db)) / (e_hi - e_lo)) if len(rms_db) >= 10 else m_p
    return 0.7 * m_p + 0.3 * m_e


def zone_shares(samples: Iterable[tuple[float, str]]) -> dict[str, float]:
    """Fraction of time per zone from (dt, zone) pairs."""
    tot: dict[str, float] = {z: 0.0 for z in ALL_ZONES}
    for dt, z in samples:
        tot[z] = tot.get(z, 0.0) + dt
    s = sum(tot.values())
    return {z: (v / s if s > 0 else 0.0) for z, v in tot.items()}


def audience_entropy(shares: dict[str, float]) -> float:
    a = sum(shares.get(z, 0.0) for z in AUDIENCE_ZONES)
    if a <= 0:
        return 0.0
    h = 0.0
    for z in AUDIENCE_ZONES:
        q = shares.get(z, 0.0) / a
        if q > 0:
            h -= q * math.log(q)
    return h / math.log(3)


def gaze_component(shares: dict[str, float], lam: float) -> float:
    visible = 1.0 - shares.get("X", 0.0)
    if visible <= 0:
        return 1.0
    a = sum(shares.get(z, 0.0) for z in AUDIENCE_ZONES) / visible
    return clip01(1.0 - a * (lam + (1 - lam) * audience_entropy(shares)))


def pace_component(wpm: float) -> float:
    return clip01(max(0.0, abs(wpm - 150.0) - 20.0) / 50.0)


def per_avatar_boredom(B: float, zone_share: float, theta: float, beta: float) -> float:
    return clip01(B + beta * (1 / 3 - zone_share) + theta)


@dataclass
class BoredomIntegrator:
    """Asymmetric leaky integrator: audiences lose interest faster than they regain it."""

    k_up: float
    k_down: float
    B: float = 0.3
    history: deque[float] = field(default_factory=lambda: deque(maxlen=4096))

    def step(self, b_raw: float, dt: float) -> float:
        k = self.k_up if b_raw > self.B else self.k_down
        self.B = clip01(self.B + min(1.0, dt * k) * (b_raw - self.B))
        self.history.append(self.B)
        return self.B


def fuse(components: dict[str, float | None], weights: dict[str, float]) -> float:
    """Weighted sum over the components that are currently available (renormalized)."""
    num = den = 0.0
    for k, w in weights.items():
        v = components.get(k)
        if v is None:
            continue
        num += w * v
        den += w
    return num / den if den > 0 else 0.3
