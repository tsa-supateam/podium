"""Measure Podium's real-time and deep-analysis performance on this machine.

    cd engine && uv run python ../scripts/benchmark.py [path/to/speech.wav]

Prints a table with:
  * real-time factor of the live engine (how much faster than real time one 20 ms hop is processed)
  * p50 / p95 per-hop processing time
  * filler alert latency: audio time between the end of a filler and the moment it was reported
  * deep-analysis wall time, with and without TTS
"""

from __future__ import annotations

import os
import sys
import tempfile
import time
from pathlib import Path

os.environ.setdefault("PODIUM_DATA", tempfile.mkdtemp(prefix="podium-bench-"))

import numpy as np
import soundfile as sf

from podium_engine import config, storage
from podium_engine.deep.pipeline import analyze
from podium_engine.realtime.engine import RealtimeEngine, new_meta

ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    wav = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "engine" / "tests" / "fixtures" / "speech_with_fillers.wav"
    cfg = config.load()
    y, sr = sf.read(str(wav), dtype="float32")
    if y.ndim > 1:
        y = y[:, 0]
    assert sr == 16000, "benchmark expects 16 kHz mono"

    sid = storage.new_session_id()
    sdir = storage.session_path(sid)
    events: list[dict] = []
    eng = RealtimeEngine(sdir, events.append, new_meta(sid, "benchmark", "replay", cfg), cfg)

    # Drive the processing loop synchronously so every hop can be timed.
    hop = eng.hop
    times = []
    for i in range(0, len(y) - hop, hop):
        eng.ring.write(y[i : i + hop])
        t0 = time.perf_counter()
        eng._process_hop(y[i : i + hop], i + hop)
        times.append(time.perf_counter() - t0)
    eng.stop()

    times_ms = np.array(times) * 1000
    hop_ms = 1000 * hop / sr
    fill = [e for e in events if e["type"] == "filler.detected"]
    lat = [e["t"] - e["data"]["t1"] for e in fill]

    t0 = time.perf_counter()
    analyze(sdir, with_tts=False)
    deep_no_tts = time.perf_counter() - t0
    t0 = time.perf_counter()
    analyze(sdir, with_tts=True)
    deep_tts = time.perf_counter() - t0

    dur = len(y) / sr
    print(f"\nPodium benchmark: {wav.name} ({dur:.1f} s of audio)\n")
    print("| Metric | Value |")
    print("|---|---|")
    print(f"| Live engine real-time factor | {hop_ms / times_ms.mean():.1f}x faster than real time |")
    print(f"| Per-hop processing p50 / p95 / max | {np.percentile(times_ms, 50):.2f} / "
          f"{np.percentile(times_ms, 95):.2f} / {times_ms.max():.1f} ms (budget {hop_ms:.0f} ms) |")
    if lat:
        print(f"| Filler alert latency (median / max, audio time) | {np.median(lat):.2f} / {max(lat):.2f} s "
              f"({len(fill)} live detections) |")
    print(f"| Deep analysis, no TTS | {deep_no_tts:.1f} s ({deep_no_tts / dur:.2f} s per s of audio) |")
    print(f"| Deep analysis + spoken debrief and questions | {deep_tts:.1f} s |")


if __name__ == "__main__":
    main()
