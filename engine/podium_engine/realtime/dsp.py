"""Small real-time DSP blocks: ring buffer, streaming Silero VAD, YIN pitch, RMS."""

from __future__ import annotations

import threading
from dataclasses import dataclass

import numpy as np

from ..paths import silero_vad_path


class RingBuffer:
    """Single-producer audio ring buffer indexed by absolute sample number.

    The PortAudio callback calls `write`; analysis loops call `read(start, n)`.
    Absolute indexing lets every consumer keep its own cursor.
    """

    def __init__(self, capacity: int) -> None:
        self._buf = np.zeros(capacity, dtype=np.float32)
        self._cap = capacity
        self._written = 0
        self._lock = threading.Lock()

    @property
    def written(self) -> int:
        return self._written

    def write(self, x: np.ndarray) -> None:
        n = len(x)
        with self._lock:
            start = self._written % self._cap
            first = min(n, self._cap - start)
            self._buf[start : start + first] = x[:first]
            if first < n:
                self._buf[: n - first] = x[first:]
            self._written += n

    def read(self, start: int, n: int) -> np.ndarray:
        with self._lock:
            if start < self._written - self._cap:
                raise IndexError("data already overwritten")
            if start + n > self._written:
                raise IndexError("data not yet written")
            idx = (np.arange(start, start + n) % self._cap)
            return self._buf[idx].copy()


class StreamingVAD:
    """Silero VAD v6 (ONNX), one 512-sample (32 ms) frame at a time, with state carried across calls."""

    FRAME = 512
    CONTEXT = 64

    def __init__(self) -> None:
        import onnxruntime

        opts = onnxruntime.SessionOptions()
        opts.inter_op_num_threads = 1
        opts.intra_op_num_threads = 1
        opts.log_severity_level = 4
        self._sess = onnxruntime.InferenceSession(
            str(silero_vad_path()), providers=["CPUExecutionProvider"], sess_options=opts
        )
        self.reset()

    def reset(self) -> None:
        self._h = np.zeros((1, 1, 128), dtype=np.float32)
        self._c = np.zeros((1, 1, 128), dtype=np.float32)
        self._ctx = np.zeros(self.CONTEXT, dtype=np.float32)

    def __call__(self, frame: np.ndarray) -> float:
        assert len(frame) == self.FRAME
        x = np.concatenate([self._ctx, frame.astype(np.float32)])[None, :]
        out, self._h, self._c = self._sess.run(None, {"input": x, "h": self._h, "c": self._c})
        self._ctx = frame[-self.CONTEXT :].astype(np.float32)
        return float(np.asarray(out).ravel()[0])


@dataclass
class VadState:
    speaking: bool = False
    run_ms: float = 0.0  # time the opposite condition has held


def hysteresis_step(state: VadState, p: float, frame_ms: float, on: float, off: float,
                    min_on_ms: float, min_off_ms: float) -> bool | None:
    """Advance the speech/silence state machine. Returns the new state on a transition, else None."""
    if not state.speaking:
        state.run_ms = state.run_ms + frame_ms if p > on else 0.0
        if state.run_ms >= min_on_ms:
            state.speaking, state.run_ms = True, 0.0
            return True
    else:
        state.run_ms = state.run_ms + frame_ms if p < off else 0.0
        if state.run_ms >= min_off_ms:
            state.speaking, state.run_ms = False, 0.0
            return False
    return None


def yin(frame: np.ndarray, sr: int, fmin: float, fmax: float, threshold: float = 0.15) -> float:
    """YIN fundamental-frequency estimate for one frame. Returns 0.0 when unvoiced."""
    x = frame.astype(np.float64) - frame.mean()
    tau_min = max(2, int(sr / fmax))
    tau_max = min(len(x) // 2, int(sr / fmin) + 1)
    w = len(x) - tau_max
    if w <= tau_max:
        return 0.0
    # Difference function d(tau) via FFT cross-correlation and cumulative energies.
    n = 1 << int(np.ceil(np.log2(len(x) + w)))
    fx = np.fft.rfft(x, n)
    fw = np.fft.rfft(x[:w], n)
    cross = np.fft.irfft(fx * np.conj(fw), n)[: tau_max + 1]
    sq = np.concatenate([[0.0], np.cumsum(x * x)])
    e0 = sq[w]
    e_tau = sq[np.arange(tau_max + 1) + w] - sq[np.arange(tau_max + 1)]
    d = e0 + e_tau - 2 * cross
    d[0] = 0.0
    # Cumulative mean normalized difference.
    cmnd = np.ones_like(d)
    cum = np.cumsum(d[1:])
    cmnd[1:] = d[1:] * np.arange(1, tau_max + 1) / np.maximum(cum, 1e-12)
    below = np.where(cmnd[tau_min:] < threshold)[0]
    if len(below) == 0:
        return 0.0
    tau = below[0] + tau_min
    while tau + 1 <= tau_max and cmnd[tau + 1] < cmnd[tau]:
        tau += 1
    # Parabolic interpolation for sub-sample accuracy.
    if 1 <= tau < tau_max:
        a, b, c = cmnd[tau - 1], cmnd[tau], cmnd[tau + 1]
        denom = a - 2 * b + c
        if abs(denom) > 1e-12:
            tau = tau + 0.5 * (a - c) / denom
    return float(sr / tau)


def rms_db(frame: np.ndarray) -> float:
    return float(20 * np.log10(np.sqrt(np.mean(frame.astype(np.float64) ** 2)) + 1e-9))


def spectral_flux(prev_mag: np.ndarray | None, mag: np.ndarray) -> float:
    if prev_mag is None:
        return 0.0
    a = mag / (np.linalg.norm(mag) + 1e-9)
    b = prev_mag / (np.linalg.norm(prev_mag) + 1e-9)
    return float(np.sqrt(np.sum(np.maximum(a - b, 0) ** 2)))
