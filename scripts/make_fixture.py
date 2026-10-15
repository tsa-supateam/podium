"""Regenerate engine/tests/fixtures/speech_with_fillers.wav with the bundled Piper voice.

    cd engine && uv run python ../scripts/make_fixture.py
"""

import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TEXT = """Good morning everyone. Today I want to talk about, um, renewable microgrids and why our school should build one.
So, uh, the first reason is cost. Battery storage cost has fallen by almost ninety percent in the last decade.
Like, you know, that means a microgrid could pay for itself in about seven years.
Um, the second reason is resilience. When the main grid fails, a microgrid keeps the lights on.
Finally, in conclusion, I recommend that we, uh, start a pilot project next spring.
"""


def main() -> None:
    import librosa
    import soundfile as sf

    with tempfile.TemporaryDirectory() as d:
        txt, wav = Path(d) / "in.txt", Path(d) / "out.wav"
        txt.write_text(TEXT)
        model = ROOT / "models" / "piper" / "en_US-lessac-medium.onnx"
        subprocess.run([sys.executable, "-m", "piper", "-m", str(model), "-i", str(txt), "-f", str(wav),
                        "--sentence-silence", "0.6"], check=True)
        y, _ = librosa.load(str(wav), sr=16000)
    out = ROOT / "engine" / "tests" / "fixtures" / "speech_with_fillers.wav"
    sf.write(str(out), y, 16000, subtype="PCM_16")
    print(f"wrote {out} ({len(y) / 16000:.1f} s)")


if __name__ == "__main__":
    main()
