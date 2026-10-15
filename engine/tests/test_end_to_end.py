"""Fixture speech → real-time engine (replay) → deep analysis. Uses the real bundled models."""

import json

import pytest

from podium_engine import config, storage
from podium_engine.paths import models_dir

pytestmark = pytest.mark.skipif(not (models_dir() / "vosk-model-small-en-us-0.15").exists(),
                                reason="models not downloaded")


def test_replay_then_deep_analysis(fixture_wav):
    from podium_engine.deep.pipeline import analyze
    from podium_engine.realtime.engine import FileSource, RealtimeEngine, new_meta

    cfg = config.load()
    sid = storage.new_session_id()
    sdir = storage.session_path(sid)
    events = []
    eng = RealtimeEngine(sdir, events.append, new_meta(sid, "test", "replay", cfg), cfg)
    src = FileSource(fixture_wav, 16000, 320, speed=4.0)
    eng.start(src)
    assert src.finished.wait(60)
    meta = eng.stop()
    assert 29 < meta["durationSec"] < 32

    types = {e["type"] for e in events}
    assert {"engagement.tick", "pace.tick", "filler.detected", "transcript.final"} <= types
    ticks = [e["data"] for e in events if e["type"] == "engagement.tick"]
    assert all(0 <= t["B"] <= 1 for t in ticks)

    s = analyze(sdir, with_tts=False)
    # the fixture contains: um, uh, like, you know, um, uh (6 fillers; the deep engine finds ≥ 4)
    assert s["fillers"]["total"] >= 4
    assert {"like", "you know"} <= set(s["fillers"]["byToken"])
    assert 140 <= s["pacing"]["meanWpm"] <= 190
    assert s["structure"]["conclusionDetected"]
    assert 0 <= s["scores"]["overall"] <= 100
    q = json.loads((sdir / "questions.json").read_text())["questions"]
    assert len(q) >= 4
    assert any("microgrid" in x["question"] for x in q)
