"""Engagement curve: dips, peak, causes confirmed by evidence, and coaching lines."""

import numpy as np

from podium_engine.deep import engagement
from podium_engine.nlp import debrief
from podium_engine.realtime.fillers import FillerEvent
from podium_engine.realtime.pace import Word


def curve(points):
    """Piecewise-linear engagement from (t, E) points, sampled every 250 ms."""
    ts = np.arange(0, points[-1][0], 0.25)
    xs, ys = zip(*points)
    return ts, np.interp(ts, xs, ys)


def records(ts, E, cause="gaze"):
    return [{"t": float(t), "E": int(e), "B": 1 - e / 100,
             "c": {"filler": 0.0, "monotony": 0.1, "gaze": 0.9 if e < 50 else 0.1, "pace": 0.0, "silence": None}}
            for t, e in zip(ts, E)]


def test_three_deepest_dips_are_separate_minima_not_adjacent_ticks():
    ts, E = curve([(0, 70), (25, 70), (30, 30), (35, 70), (50, 70), (55, 45), (60, 70), (75, 70), (80, 20), (85, 70),
                   (100, 72), (105, 40), (110, 70), (125, 70)])
    dips = engagement.find_dips(ts, E)
    assert [round(d["t"]) for d in dips] == [30, 80, 105]  # deepest three, in time order; 55 is shallower
    assert all(b["t"] - a["t"] >= 15 for a, b in zip(dips, dips[1:]))
    assert all(a["t1"] <= b["t0"] for a, b in zip(dips, dips[1:]))  # windows don't overlap
    assert dips[1]["E"] <= 25


def test_flat_talk_has_no_dips_and_peak_needs_to_stand_out():
    ts, E = curve([(0, 60), (120, 61)])
    assert engagement.find_dips(ts, E) == []
    s = engagement.summarize(records(ts, E))
    assert s["peak"] is None and s["dips"] == []


def test_summary_keeps_old_fields_and_adds_cause_series():
    ts, E = curve([(0, 70), (30, 70), (40, 30), (50, 75), (70, 80), (90, 60)])
    s = engagement.summarize(records(ts, E))
    for k in ("meanE", "minE", "timeBoredPct", "lowPoints", "series", "engagedPct", "dips", "peak"):
        assert k in s
    assert set(s["series"]) == {"t", "E", "filler", "monotony", "gaze", "pace", "silence"}
    assert len(s["series"]["gaze"]) == len(s["series"]["t"])
    assert s["dips"][0]["causes"][0] == "gaze"
    assert s["peak"]["t0"] >= 15


def test_cause_needs_evidence_and_lines_quote_what_happened():
    d = {"t": 40.0, "t0": 39.0, "t1": 44.0}  # window with the reaction lead-in: 31-44 s
    words = [Word(30 + i * 0.5, 30.4 + i * 0.5, w) for i, w in enumerate("so the battery storage cost has fallen".split())]
    gaze = [{"t": 31 + i / 30, "face": True, "zone": "N"} for i in range(30 * 8)]  # 8 s on notes
    # filler ranks first in the live signal, but there was no filler: fall through to gaze
    cause = debrief.confirm_cause(["filler", "gaze"], d, words, [], gaze, (130, 170))
    assert cause == "gaze"
    line = debrief.dip_line({**d, "cause": cause}, words, [], gaze, True, (130, 170))
    assert line.startswith("Engagement dropped at 0:40 while you looked at your notes for 8 s")
    assert "down" in debrief.dip_line({**d, "cause": "gaze"}, words, [], gaze, False, (130, 170))

    fillers = [FillerEvent(38.0, 38.3, "um", "filled_pause", 0.9, "whisper")]
    assert debrief.confirm_cause(["filler"], d, words, fillers, [], (130, 170)) == "filler"
    assert "(“um”)" in debrief.dip_line({**d, "cause": "filler"}, words, fillers, [], True, (130, 170))
    assert "battery storage cost" in debrief.dip_line({**d, "cause": "monotony"}, words, [], [], True, (130, 170))


def test_mostly_silent_dip_is_not_called_slow_speech():
    d = {"t": 40.0, "t0": 36.0, "t1": 50.0}
    words = [Word(37.0, 37.3, "okay"), Word(45.0, 45.4, "so")]
    line = debrief.dip_line({**d, "cause": "pace"}, words, [], [], True, (130, 170))
    assert "said only 2 words in 22 s" in line and "words/min" not in line
