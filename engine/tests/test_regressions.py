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


def _summary(mean_wpm, pacing_score, rush_peak=None):
    zones = [{"t0": 10.0, "t1": 20.0, "kind": "rush", "peakWpm": rush_peak}] if rush_peak else []
    return {
        "scores": {"overall": 60, "pacing": pacing_score, "fillers": 100, "vocalVariety": 92, "eyeContact": 82, "structure": 50},
        "fillers": {"clusters": [], "total": 1, "perMinute": 0.5, "byToken": {"um": 1}},
        "pacing": {"meanWpm": mean_wpm, "medianWpm": 73.0, "accelZones": zones},
        "voice": {"monotoneSegments": [], "f0StdSt": 3.5},
        "gaze": {"audiencePct": 80, "zonePct": {"L": 20, "C": 40, "R": 20, "N": 15, "X": 5}},
        "structure": {"conclusionDetected": True},
    }


def test_slow_speaker_is_told_to_speed_up_not_warned_about_rushing():
    # Real session 2026-10-16: 76 WPM average, pacing 4/100, but the only tip said
    # "your pace climbed to 131 WPM... 78% faster than usual".
    d = debrief.build(_summary(75.6, 4, rush_peak=131.0), lambda t: None)
    top = d["growth"][0]
    assert top["key"] == "GROW_SLOW"
    assert "76 words per minute" in top["text"] and "130 to 170" in top["text"]
    assert not any(g["key"] == "GROW_RUSH" for g in d["growth"])
    assert "slow down" not in d["drill"].lower()


def test_rush_tip_still_used_when_average_is_on_target():
    d = debrief.build(_summary(150.0, 72, rush_peak=200.0), lambda t: None)
    assert any(g["key"] == "GROW_RUSH" for g in d["growth"])


def test_feedback_always_has_a_headline_tip_with_its_own_drill():
    s = _summary(150.0, 95)
    s["scores"].update(fillers=100, vocalVariety=95, eyeContact=96, structure=90)
    s["structure"]["conclusionDetected"] = True
    d = debrief.build(s, lambda t: None)
    assert len(d["growth"]) >= 1 and d["growth"][0]["drill"]
    assert d["growth"][0]["key"] == "LEVEL_STRUCTURE"  # lowest score gets the level-up tip


def test_two_headline_tips_and_the_rest_in_more():
    s = _summary(75.6, 4)
    s["scores"].update(vocalVariety=40, eyeContact=50, structure=50)
    s["structure"]["conclusionDetected"] = False
    d = debrief.build(s, lambda t: None)
    assert len(d["growth"]) == 2 and len(d["more"]) >= 1
    assert all(g["drill"] for g in d["growth"] + d["more"])
    metrics = [g["metric"] for g in d["growth"] + d["more"]]
    assert len(metrics) == len(set(metrics))


def test_no_notes_mode_is_stricter_and_names_looking_down():
    from podium_engine.deep import scoring

    g = {"audiencePct": 80.0, "balanceEntropy": 1.0, "notesStares": [{"t0": 1, "t1": 4}], "notesMode": True}
    with_notes = scoring.score_eye(g)
    without = scoring.score_eye({**g, "notesMode": False})
    assert without < with_notes

    s = _summary(150.0, 90)
    s["scores"]["eyeContact"] = 55
    s["gaze"] = {"audiencePct": 70, "notesMode": False, "zonePct": {"L": 20, "C": 40, "R": 10, "N": 25, "X": 5}}
    texts = [g["text"] for g in debrief.build(s, lambda t: None)["growth"]]
    assert any("looked down or away 30 percent" in t for t in texts)
    assert not any("your notes" in t for t in texts)


def test_looking_away_with_face_visible_counts_against_eye_contact():
    from podium_engine.deep import scoring

    # 100 samples on the audience, 100 looking away with the face still visible
    gaze = [{"t": i / 30, "face": True, "zone": "C" if i < 100 else "X", "gYaw": 0, "gPitch": 0} for i in range(200)]
    g = scoring.gaze_summary(gaze, 200 / 30)
    assert 45 <= g["audiencePct"] <= 55


def test_second_tip_comes_from_weakest_remaining_area():
    s = _summary(75.6, 4)  # only the slow-speed tip triggers; structure is 50
    d = debrief.build(s, lambda t: None)
    assert [g["key"] for g in d["growth"]] == ["GROW_SLOW", "LEVEL_STRUCTURE"]
