"""Regressions from the first real-hardware run (2026-10-16)."""

import json
import math

import numpy as np

from podium_engine import storage
from podium_engine.nlp import debrief
from podium_engine.realtime.engine import PushSource


def test_nan_never_reaches_json():
    # Silent audio made Praat's jitter/shimmer NaN; bare NaN broke JSON.parse in the UI and the
    # debrief screen waited forever.
    out = storage.dumps({"jitter": math.nan, "x": [math.inf, 1.5], "ok": 2})
    assert json.loads(out) == {"jitter": None, "x": [None, 1.5], "ok": 2}
    assert "NaN" not in out and "Infinity" not in out


def test_push_source_forwards_frames():
    got = []
    src = PushSource(16000)
    src.start(got.append)
    src.push(np.zeros(320, dtype=np.float32))
    src.stop()
    src.push(np.zeros(320, dtype=np.float32))  # ignored after stop
    assert len(got) == 1 and len(got[0]) == 320


def test_no_speech_debrief_blames_the_microphone_for_digital_silence():
    s = {"voice": {"peakDb": -180.0}, "gaze": {"audiencePct": 55.2}}
    text = debrief.no_speech(s)["text"]
    assert "completely silent" in text and "permission" in text and "55 percent" in text
