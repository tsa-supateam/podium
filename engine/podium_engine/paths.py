"""Filesystem locations. Models are bundled; user data lives in the OS app-data folder."""

from __future__ import annotations

import os
import sys
from pathlib import Path


def models_dir() -> Path:
    if env := os.environ.get("PODIUM_MODELS"):
        return Path(env)
    if getattr(sys, "frozen", False):  # PyInstaller bundle
        return Path(sys.executable).parent / "models"
    return Path(__file__).resolve().parents[2] / "models"


def data_dir() -> Path:
    if env := os.environ.get("PODIUM_DATA"):
        root = Path(env)
    elif sys.platform == "darwin":
        root = Path.home() / "Library" / "Application Support" / "Podium"
    elif sys.platform == "win32":
        root = Path(os.environ.get("APPDATA", Path.home())) / "Podium"
    else:
        root = Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local" / "share")) / "Podium"
    root.mkdir(parents=True, exist_ok=True)
    return root


def sessions_dir() -> Path:
    d = data_dir() / "sessions"
    d.mkdir(exist_ok=True)
    return d


def silero_vad_path() -> Path:
    import faster_whisper

    return Path(faster_whisper.__file__).parent / "assets" / "silero_vad_v6.onnx"
