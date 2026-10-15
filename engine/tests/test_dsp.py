import numpy as np
import pytest

from podium_engine.realtime.dsp import RingBuffer, VadState, hysteresis_step, yin


@pytest.mark.parametrize("f0", [90.0, 150.0, 220.0, 330.0])
def test_yin_recovers_pitch_of_harmonic_tone(f0):
    sr = 16000
    t = np.arange(1024) / sr
    x = sum(np.sin(2 * np.pi * f0 * k * t) / k for k in range(1, 5))
    assert abs(yin(x, sr, 65, 400) - f0) / f0 < 0.02


def test_yin_returns_zero_on_noise():
    x = np.random.default_rng(0).normal(0, 1, 1024)
    assert yin(x, 16000, 65, 400) == 0.0


def test_ring_buffer_wraps_and_guards():
    rb = RingBuffer(8)
    rb.write(np.arange(6, dtype=np.float32))
    rb.write(np.arange(6, 12, dtype=np.float32))
    assert list(rb.read(6, 4)) == [6, 7, 8, 9]
    with pytest.raises(IndexError):
        rb.read(0, 2)  # overwritten
    with pytest.raises(IndexError):
        rb.read(10, 4)  # not written yet


def test_vad_hysteresis_needs_sustained_speech():
    s = VadState()
    assert hysteresis_step(s, 0.9, 32, 0.5, 0.35, 90, 250) is None
    assert hysteresis_step(s, 0.9, 32, 0.5, 0.35, 90, 250) is None
    assert hysteresis_step(s, 0.9, 32, 0.5, 0.35, 90, 250) is True
    # a dip to 0.4 is above the "off" threshold: still speaking
    for _ in range(20):
        assert hysteresis_step(s, 0.4, 32, 0.5, 0.35, 90, 250) is None
