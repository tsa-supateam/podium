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


def _run(sid, summary, **meta):
    d = sessions_dir() / sid
    d.mkdir(parents=True)
    m = {"sessionId": sid, "mode": "practice", "status": "analyzed", "createdAt": sid, **meta}
    (d / "session.json").write_text(json.dumps(m))
    (d / "summary.json").write_text(json.dumps(summary))


def test_rust_after_mastery_and_review_clears_it(tmp_path, monkeypatch):
    monkeypatch.setenv("PODIUM_DATA", str(tmp_path))
    ok, bad = _summary(fillers={"perMinute": 2}), _summary(fillers={"perMinute": 8})
    _run("2026-01-01_a", ok, drill="fewer_fillers")  # practice passed
    _run("2026-01-02_b", ok)
    _run("2026-01-03_c", ok)  # mastered (2 of last 3)
    c = learn.status()["checks"]["fewer_fillers"]
    assert c["everMastered"] and not c["rusty"]
    _run("2026-01-04_d", bad)  # [ok, ok, bad]: still 2 of 3
    assert not learn.status()["checks"]["fewer_fillers"]["rusty"]
    _run("2026-01-05_e", bad)  # [ok, bad, bad]: slipped
    c = learn.status()["checks"]["fewer_fillers"]
    assert c["rusty"] and c["rustySince"] == "2026-01-05_e" and c["everMastered"]
    _run("2026-01-06_f", ok, drill="fewer_fillers")  # a review practice
    c = learn.status()["checks"]["fewer_fillers"]
    assert not c["rusty"] and c["rustCleared"] == 1
    _run("2026-01-07_g", bad)  # fails again in a full run: rusty again
    assert learn.status()["checks"]["fewer_fillers"]["rusty"]


def test_never_mastered_is_never_rusty(tmp_path, monkeypatch):
    monkeypatch.setenv("PODIUM_DATA", str(tmp_path))
    _run("2026-01-01_a", _summary(fillers={"perMinute": 8}))
    c = learn.status()["checks"]["fewer_fillers"]
    assert not c["everMastered"] and not c["rusty"]


def test_boss_checks_every_skill_and_stays_out_of_full_runs(tmp_path, monkeypatch):
    monkeypatch.setenv("PODIUM_DATA", str(tmp_path))
    checks = ["claim_up_front", "signposts", "conclusion"]
    _run("2026-01-01_a", _summary(), boss="structure", checks=checks)
    _run("2026-01-02_b", _summary(overview={"thesis": None, "points": [], "concluded": True}), boss="structure", checks=checks)
    st = learn.status()
    b = st["bosses"]["structure"]
    assert [x["passed"] for x in b] == [True, False]
    assert [r["passed"] for r in b[1]["results"]] == [False, False, True]
    assert st["checks"]["signposts"]["recent"] == []  # a boss isn't a full run
    r = learn.boss_result("structure", checks, _summary())
    assert r["passed"] and len(r["results"]) == 3


def test_pace_runner_scores_time_in_band():
    ser = {"smoothT": list(range(0, 20)), "smooth": [200] * 8 + [130] * 6 + [190] * 2 + [140] * 4,
           "speech": [True] * 14 + [False] * 2 + [True] * 4}
    r = learn.pace_runner({"pacing": {"series": ser, "band": [120, 160]}})
    # warm-up (t < 8) skipped, the paused 2 s don't count: 10 scored points, all in band
    assert r["inBandPct"] == 100 and r["bestStreakSec"] >= 6
    ser["smooth"][10] = 300
    assert learn.pace_runner({"pacing": {"series": ser, "band": [120, 160]}})["inBandPct"] == 90
    assert learn.pace_runner({"pacing": {}, "noSpeech": True}) is None


def test_pace_runner_runs_are_speed_practices(tmp_path, monkeypatch):
    monkeypatch.setenv("PODIUM_DATA", str(tmp_path))
    ser = {"smoothT": list(range(0, 30)), "smooth": [140] * 30, "speech": [True] * 30}
    _run("2026-01-01_a", _summary(pacing={"meanWpm": 140, "band": [120, 160], "series": ser}), drill="target_pace",
         game="paceRunner")
    st = learn.status()
    assert st["paceRunner"][0]["inBandPct"] == 100
    assert st["checks"]["target_pace"]["attempts"][0]["passed"]


def test_games_equip_and_seen(tmp_path, monkeypatch):
    monkeypatch.setenv("PODIUM_DATA", str(tmp_path))
    learn.mark_lesson("structure.claim")
    for i in range(55):
        learn.record_game("claimDuel", i % 11, 10)
    st = learn.status()
    assert len(st["games"]["claimDuel"]) == 50 and st["games"]["claimDuel"][-1]["score"] == 10
    assert st["lessons"] == ["structure.claim"]  # other stored state survives
    assert len(st["activity"]) == 51  # a lesson + 50 games
    assert learn.equip("accent", "mint") == {"accent": "mint"}
    assert learn.mark_seen(["a", "b"]) == ["a", "b"] and learn.status()["seenUnlocks"] == ["a", "b"]
    import pytest

    with pytest.raises(ValueError):
        learn.record_game("nope", 1, 1)
    with pytest.raises(ValueError):
        learn.equip("hat", "x")
