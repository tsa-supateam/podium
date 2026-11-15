"""Achievements: tiers per speech type, owned by the run that first reached them."""

import json

from podium_engine import achievements
from podium_engine.paths import sessions_dir


def _run(sid, overall, kind="prepared", structure=None, mode="practice"):
    d = sessions_dir() / sid
    d.mkdir(parents=True, exist_ok=True)
    (d / "session.json").write_text(json.dumps({"sessionId": sid, "mode": mode, "status": "analyzed",
                                                "speechType": kind, "createdAt": sid}))
    dims = {"structure": {"score": structure, "feedback": []}} if structure else {}
    (d / "summary.json").write_text(json.dumps({"scores": {"overall": overall}, "overview": {"dimensions": dims}}))


def test_tiers_follow_levels_and_speech_type(tmp_path, monkeypatch):
    monkeypatch.setenv("PODIUM_DATA", str(tmp_path))  # an empty history of our own
    _run("2099-01-01_a", 60, structure=2)              # 3 stars prepared: wood..silver; structure wood..bronze
    _run("2099-01-02_b", 72)                            # 4 stars prepared: gold is new
    _run("2099-01-03_c", 90, kind="impromptu")          # impromptu is its own track: wood..diamond
    _run("2099-01-04_d", 99, mode="qa")                 # Q&A answers don't count
    got = {a["id"]: a["sessionId"] for a in achievements.earned()}
    assert got["prepared:overall:silver"] == "2099-01-01_a"
    assert got["prepared:overall:gold"] == "2099-01-02_b"
    assert "prepared:overall:diamond" not in got
    assert got["prepared:structure:bronze"] == "2099-01-01_a"
    assert got["impromptu:overall:diamond"] == "2099-01-03_c"
    assert "2099-01-04_d" not in got.values()
