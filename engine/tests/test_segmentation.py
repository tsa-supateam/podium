import numpy as np

from podium_engine.deep import segmentation as seg
from podium_engine.realtime.fillers import FillerEvent


def ev(t):
    return FillerEvent(t, t + 0.3, "um", "filled_pause", 0.9, "test")


def test_clustered_fillers_are_found_and_bursty():
    clustered = [ev(t) for t in [10, 11, 12.5, 13, 60, 120, 121, 122, 123]]
    clusters, burst = seg.filler_clusters(clustered, 4.0, 3)
    assert [c["count"] for c in clusters] == [4, 4]
    assert burst > 0.2


def test_evenly_spread_fillers_are_not_bursty():
    _, burst = seg.filler_clusters([ev(t) for t in range(0, 300, 20)], 4.0, 3)
    assert burst < -0.5


def test_tri_membership():
    assert seg.tri(0.15, 0.05, 0.15, 0.30) == 1.0
    assert seg.tri(0.05, 0.05, 0.15, 0.30) == 0.0
    assert abs(seg.tri(0.10, 0.05, 0.15, 0.30) - 0.5) < 1e-9


def test_pacing_stats_detects_rush():
    ts = np.arange(5, 125, 1.0)
    wpm = np.where((ts > 50) & (ts < 80), 210.0, 145.0)
    out = seg.pacing_stats(ts, wpm, np.ones_like(ts, dtype=bool), [130, 170], 110, 190)
    assert any(s["label"] == "rushing" for s in out["segments"])
    assert any(z["kind"] == "rush" for z in out["accelZones"])
