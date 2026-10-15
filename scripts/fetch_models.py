"""Download every model Podium needs into ./models at BUILD time.

The app itself never touches the network. Run once after cloning:

    cd engine && uv run python ../scripts/fetch_models.py

Each file's SHA-256 is recorded in models/manifest.lock.json on first download
and verified on every later run, so a tampered or truncated model fails loudly.
"""

from __future__ import annotations

import hashlib
import json
import shutil
import sys
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODELS = ROOT / "models"
LOCK = MODELS / "manifest.lock.json"

VOSK_URL = "https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip"
FACE_URL = (
    "https://storage.googleapis.com/mediapipe-models/face_landmarker/"
    "face_landmarker/float16/1/face_landmarker.task"
)
WHISPER_REPO = "Systran/faster-whisper-base.en"
PIPER_VOICE = "en_US-lessac-medium"
NLTK_PACKAGES = ["punkt_tab", "averaged_perceptron_tagger_eng", "stopwords", "inaugural"]


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def download(url: str, dest: Path) -> None:
    if dest.exists():
        return
    print(f"  ↓ {url}")
    tmp = dest.with_suffix(dest.suffix + ".part")
    with urllib.request.urlopen(url) as r, tmp.open("wb") as f:
        shutil.copyfileobj(r, f)
    tmp.rename(dest)


def fetch_vosk() -> None:
    target = MODELS / "vosk-model-small-en-us-0.15"
    if target.exists():
        return
    print("Vosk streaming ASR")
    zpath = MODELS / "vosk.zip"
    download(VOSK_URL, zpath)
    with zipfile.ZipFile(zpath) as z:
        z.extractall(MODELS)
    zpath.unlink()


def fetch_face() -> None:
    print("MediaPipe face landmarker")
    download(FACE_URL, MODELS / "face_landmarker.task")


def fetch_whisper() -> None:
    target = MODELS / "faster-whisper-base.en"
    if (target / "model.bin").exists():
        return
    print("faster-whisper base.en")
    from huggingface_hub import snapshot_download

    snapshot_download(WHISPER_REPO, local_dir=target)


def fetch_piper() -> None:
    target = MODELS / "piper"
    if (target / f"{PIPER_VOICE}.onnx").exists():
        return
    print("Piper TTS voice")
    target.mkdir(parents=True, exist_ok=True)
    from piper.download_voices import download_voice

    download_voice(PIPER_VOICE, target)


def fetch_nltk() -> None:
    import nltk

    target = MODELS / "nltk_data"
    print("NLTK data")
    for pkg in NLTK_PACKAGES:
        nltk.download(pkg, download_dir=str(target), quiet=True)


def build_idf() -> None:
    """Reference IDF table for TF-IDF keyphrases, from the public-domain US inaugural addresses.

    A single speech has no "document frequency" on its own, so we compare its
    terms against how common they are across ~60 other speeches.
    """
    out = MODELS / "idf_reference.json"
    if out.exists():
        return
    import math
    import re

    corpus_dir = MODELS / "nltk_data" / "corpora" / "inaugural"
    if not corpus_dir.exists():
        import zipfile as zf

        zf.ZipFile(MODELS / "nltk_data" / "corpora" / "inaugural.zip").extractall(corpus_dir.parent)
    docs = [p.read_text(errors="ignore").lower() for p in sorted(corpus_dir.glob("*.txt"))]
    df: dict[str, int] = {}
    for d in docs:
        for term in set(re.findall(r"[a-z][a-z'-]+", d)):
            df[term] = df.get(term, 0) + 1
    n = len(docs)
    idf = {t: round(math.log((1 + n) / (1 + c)) + 1, 4) for t, c in df.items()}
    out.write_text(json.dumps({"n_docs": n, "default": round(math.log(1 + n) + 1, 4), "idf": idf}, sort_keys=True))
    print(f"IDF table: {len(idf)} terms from {n} speeches")


def verify_lock() -> None:
    files = sorted(
        p for p in MODELS.rglob("*")
        if p.is_file() and p.name != LOCK.name and not p.name.startswith(".")
        and "nltk_data" not in p.parts and ".cache" not in p.parts
    )
    current = {str(p.relative_to(MODELS)): sha256(p) for p in files}
    if LOCK.exists():
        locked = json.loads(LOCK.read_text())
        bad = [k for k, v in locked.items() if current.get(k) != v]
        if bad:
            sys.exit(f"Checksum mismatch for: {bad}. Delete them and re-run.")
        print(f"✓ {len(locked)} model files match manifest.lock.json")
    else:
        LOCK.write_text(json.dumps(current, indent=2) + "\n")
        print(f"✓ wrote manifest.lock.json ({len(current)} files)")


def main() -> None:
    MODELS.mkdir(exist_ok=True)
    fetch_vosk()
    fetch_face()
    fetch_whisper()
    fetch_piper()
    fetch_nltk()
    build_idf()
    verify_lock()


if __name__ == "__main__":
    main()
