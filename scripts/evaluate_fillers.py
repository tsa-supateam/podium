"""Filler-detection accuracy on your own labelled recordings (spec §8.2).

Put pairs of files in a folder:
    clip01.wav   (any sample rate, mono or stereo)
    clip01.txt   (Audacity label track export: "start<TAB>end<TAB>label" per filler)

Then:
    cd engine && uv run python ../scripts/evaluate_fillers.py path/to/folder

A detection counts as a hit when it overlaps a labelled filler, or lies within ±300 ms of one.
Prints precision / recall / F1 for the live engine and for the full deep pipeline.
"""

from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

os.environ.setdefault("PODIUM_DATA", tempfile.mkdtemp(prefix="podium-eval-"))

from podium_engine import config, storage
from podium_engine.deep.pipeline import analyze
from podium_engine.realtime.engine import FileSource, RealtimeEngine, new_meta
from podium_engine.storage import read_ndjson

TOL = 0.3


def load_labels(p: Path) -> list[tuple[float, float]]:
    out = []
    for line in p.read_text().splitlines():
        parts = line.split("\t")
        if len(parts) >= 2 and parts[0].strip():
            out.append((float(parts[0]), float(parts[1])))
    return out


def match(pred: list[tuple[float, float]], gold: list[tuple[float, float]]) -> tuple[int, int, int]:
    used = set()
    tp = 0
    for a, b in pred:
        for j, (c, d) in enumerate(gold):
            if j not in used and a <= d + TOL and b >= c - TOL:
                used.add(j)
                tp += 1
                break
    return tp, len(pred) - tp, len(gold) - tp


def prf(tp: int, fp: int, fn: int) -> str:
    p = tp / (tp + fp) if tp + fp else 0.0
    r = tp / (tp + fn) if tp + fn else 0.0
    f = 2 * p * r / (p + r) if p + r else 0.0
    return f"P={p:.2f}  R={r:.2f}  F1={f:.2f}  (tp={tp} fp={fp} fn={fn})"


def main() -> None:
    folder = Path(sys.argv[1])
    cfg = config.load()
    totals = {"live": [0, 0, 0], "deep": [0, 0, 0]}
    for wav in sorted(folder.glob("*.wav")):
        lab = wav.with_suffix(".txt")
        if not lab.exists():
            continue
        gold = load_labels(lab)
        sid = storage.new_session_id()
        sdir = storage.session_path(sid)
        eng = RealtimeEngine(sdir, lambda e: None, new_meta(sid, wav.stem, "eval", cfg), cfg)
        src = FileSource(wav, 16000, 320, speed=4.0)
        eng.start(src)
        src.finished.wait()
        eng.stop()
        live = [(r["t0"], r["t1"]) for r in read_ndjson(sdir / "telemetry" / "fillers.ndjson")]
        deep = [(e["t0"], e["t1"]) for e in analyze(sdir, with_tts=False)["fillers"]["events"]]
        for name, pred in (("live", live), ("deep", deep)):
            tp, fp, fn = match(pred, gold)
            totals[name] = [x + y for x, y in zip(totals[name], (tp, fp, fn))]
        print(f"{wav.name}: gold={len(gold)}  live: {prf(*match(live, gold))}  deep: {prf(*match(deep, gold))}")
    print("\nOverall")
    for name, (tp, fp, fn) in totals.items():
        print(f"  {name:5s} {prf(tp, fp, fn)}")


if __name__ == "__main__":
    main()
