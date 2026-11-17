"""Local TTS with Piper (spec §4.5.1).

Piper runs in a separate process (`python -m podium_engine.tts.worker`). That
keeps the GPL-licensed piper1 package out of Podium's own process, and a TTS
crash can't take the engine down. One worker call synthesizes a whole batch so
the voice model is loaded once.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

from ..paths import models_dir

VOICE = "en_US-lessac-medium"

# Delivery styles for Learn's example lines: the same words, said weakly or strongly.
STYLES = {
    "weak": {"length_scale": 1.3, "noise_scale": 0.25, "noise_w_scale": 0.3, "volume": 0.75},  # slow, flat, quiet
    "strong": {"length_scale": 0.92, "noise_scale": 0.8, "noise_w_scale": 1.0, "volume": 1.0},  # brisk, lively
}


def voice_path() -> Path:
    return models_dir() / "piper" / f"{VOICE}.onnx"


def available() -> bool:
    return voice_path().exists()


def synthesize_many(items: list[tuple[str, Path]], timeout: float = 300, style: str | None = None) -> None:
    job = {"model": str(voice_path()), "items": [{"text": t, "out": str(p), "style": STYLES.get(style or "")}
                                                 for t, p in items]}
    proc = subprocess.run([sys.executable, "-m", "podium_engine.tts.worker"], input=json.dumps(job).encode(),
                          capture_output=True, timeout=timeout)
    missing = [str(p) for _, p in items if not p.exists()]
    if proc.returncode != 0 or missing:
        raise RuntimeError(f"Piper failed: {proc.stderr.decode(errors='ignore')[-500:]}")


def synthesize(text: str, out_wav: Path, style: str | None = None) -> Path:
    synthesize_many([(text, out_wav)], style=style)
    return out_wav
