"""Learn: practice checks read the same summary as the results screen."""

import json

from podium_engine import learn
from podium_engine.paths import sessions_dir


def _summary(**kw):
    s = {"durationSec": 60, "scores": {"overall": 70, "pacing": 80, "vocalVariety": 70, "eyeContact": 75},
         "pacing": {"meanWpm": 130, "band": [120, 160]}, "fillers": {"perMinute": 1.0},
         "content": {"parts": {"evidence": {"count": 3, "hard": True}, "directness": {"per100": 1.0},
                               "clarity": {"avgWords": 14}, "takeaway": {"found": True}}},
         "overview": {"thesis": {"text": "x", "t": 3.0}, "concluded": True, "counterargument": False,
                      "points": [{"text": "a", "support": ["stat"]}, {"text": "b", "support": []}],
                      "dimensions": {"commentary": {"score": 3}}},
         "gaze": {"mode": "room", "zonePct": {"L": 20, "C": 60, "R": 10}}}
    s.update(kw)
    return s


def test_checks():
    s = _summary()
    passed = {k for k in learn.CHECKS if learn.evaluate(k, s)["passed"]}
    assert {"claim_up_front", "signposts", "conclusion", "examples", "hard_evidence", "explain_evidence", "direct",
            "one_idea", "takeaway", "target_pace", "steady_pace", "fewer_fillers", "pause_not_fill", "pitch_range",
            "hold_contact"} <= passed
    assert not {"support_every_point", "other_side", "why_it_matters", "stress_words", "sweep_room"} & passed
    assert learn.evaluate("target_pace", _summary(pacing={"meanWpm": 180, "band": [120, 160]}))["value"] == 180
    assert learn.evaluate("nope", s) is None


def test_status_separates_practices_from_full_runs(tmp_path, monkeypatch):
    monkeypatch.setenv("PODIUM_DATA", str(tmp_path))

    def run(sid, summary, drill=None):
        d = sessions_dir() / sid
        d.mkdir(parents=True)
        meta = {"sessionId": sid, "mode": "practice", "status": "analyzed", "createdAt": sid}
        if drill:
            meta["drill"] = drill
        (d / "session.json").write_text(json.dumps(meta))
        (d / "summary.json").write_text(json.dumps(summary))

    run("2026-01-01_a", _summary(fillers={"perMinute": 6}), drill="fewer_fillers")
    run("2026-01-02_b", _summary(fillers={"perMinute": 2}), drill="fewer_fillers")
    run("2026-01-03_c", _summary(fillers={"perMinute": 3}))
    st = learn.status()
    att = st["checks"]["fewer_fillers"]["attempts"]
    assert [a["passed"] for a in att] == [False, True]
    assert st["checks"]["fewer_fillers"]["recent"] == [{"id": "fewer_fillers", "value": 3.0, "passed": True}]
    assert learn.mark_lesson("fillers.notice") == ["fillers.notice"]
    assert learn.status()["lessons"] == ["fillers.notice"]
