"""Podium engine CLI.

    python -m podium_engine serve --port 0 --token <secret>   # real-time engine + IPC
    python -m podium_engine analyze <session_dir>             # deep analysis (own process)
    python -m podium_engine replay <wav> [--speed 4]          # headless replay → session + analysis
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
import sys
import warnings
from pathlib import Path

from . import offline


def main(argv: list[str] | None = None) -> int:
    offline.enforce()
    warnings.filterwarnings("ignore")
    ap = argparse.ArgumentParser(prog="podium_engine")
    sub = ap.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("serve")
    s.add_argument("--port", type=int, default=0)
    s.add_argument("--token", required=True)
    s.add_argument("--ready-file")

    a = sub.add_parser("analyze")
    a.add_argument("session_dir")
    a.add_argument("--json-progress", action="store_true")
    a.add_argument("--no-tts", action="store_true")

    r = sub.add_parser("replay")
    r.add_argument("wav")
    r.add_argument("--speed", type=float, default=4.0)
    r.add_argument("--title", default="Replay")

    args = ap.parse_args(argv)
    logging.basicConfig(level=logging.INFO, stream=sys.stderr, format="%(asctime)s %(name)s %(message)s")

    if args.cmd == "serve":
        from .ipc.server import run

        try:
            asyncio.run(run(args.port, args.token, args.ready_file))
        except KeyboardInterrupt:
            pass
        return 0

    if args.cmd == "analyze":
        from .deep.pipeline import analyze

        if hasattr(os, "nice"):
            os.nice(10)  # background work: never compete with the live engine

        def progress(stage: str, pct: float) -> None:
            if args.json_progress:
                print(json.dumps({"stage": stage, "pct": round(pct, 3)}), flush=True)
            else:
                print(f"{stage:12s} {pct:5.0%}", file=sys.stderr)

        summary = analyze(Path(args.session_dir), progress, with_tts=not args.no_tts)
        if not args.json_progress:
            print(json.dumps(summary["scores"], indent=2))
        return 0

    if args.cmd == "replay":
        from . import config, storage
        from .deep.pipeline import analyze
        from .realtime.engine import FileSource, RealtimeEngine, new_meta

        cfg = config.load()
        sid = storage.new_session_id()
        sdir = storage.session_path(sid)
        eng = RealtimeEngine(sdir, lambda ev: None, new_meta(sid, args.title, "replay", cfg), cfg)
        src = FileSource(Path(args.wav), cfg["audio"]["sample_rate"], 320, args.speed)
        eng.start(src)
        src.finished.wait()
        eng.stop()
        summary = analyze(sdir, lambda st, p: None)
        print(json.dumps({"sessionId": sid, "dir": str(sdir), "scores": summary["scores"]}, indent=2))
        return 0
    return 1


if __name__ == "__main__":
    sys.exit(main())
