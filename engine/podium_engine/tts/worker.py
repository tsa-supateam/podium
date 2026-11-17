"""Subprocess entry point: read a JSON job on stdin, write one WAV per item."""

import json
import sys
import wave

from piper import PiperVoice, SynthesisConfig


def main() -> None:
    job = json.loads(sys.stdin.read())
    voice = PiperVoice.load(job["model"])
    base = {"length_scale": job.get("length_scale", 1.0)}
    for item in job["items"]:
        # per-item delivery style (speed, expressiveness, volume), e.g. a weak vs strong example
        cfg = SynthesisConfig(**{**base, **(item.get("style") or {})})
        with wave.open(item["out"], "wb") as wf:
            voice.synthesize_wav(item["text"], wf, syn_config=cfg)


if __name__ == "__main__":
    main()
