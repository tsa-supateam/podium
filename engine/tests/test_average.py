"""Average performance across full runs."""

import base64
import json

from podium_engine import average
from podium_engine.paths import sessions_dir


def _run(sid, overall, mode="practice", drill=None, yaw_lo=-40.0, kind="prepared"):
    d = sessions_dir() / sid
    d.mkdir(parents=True)
    meta = {"sessionId": sid, "mode": mode, "status": "analyzed", "createdAt": sid, "speechType": kind}
    if drill:
        meta["drill"] = drill
    grid = bytes([255 if i == 12 * 40 + 20 else 0 for i in range(25 * 40)])
    s = {"durationSec": 60, "wordCount": 140, "scores": {"overall": overall, "content": overall, "eyeContact": 80},
         "pacing": {"meanWpm": 140}, "fillers": {"perMinute": 2, "total": 2, "byToken": {"um": 2}},
         "gaze": {"mode": "room", "zonePct": {"L": 20, "C": 60, "R": 20, "N": 0, "X": 0},
                  "heatmap": {"yawBins": [yaw_lo, yaw_lo + 80, 2.0], "pitchBins": [-30.0, 20.0, 2.0], "rows": 25,
                              "cols": 40, "u8": base64.b64encode(grid).decode()},
                  "boundaries": {"leftCenter": yaw_lo + 28, "centerRight": yaw_lo + 52, "down": -15}},
         "overview": {"dimensions": {"structure": {"score": 3}}},
         "engagement": {"meanE": 60, "series": {"t": [0, 30, 60], "E": [50, 70, 60]}}}
    (d / "session.json").write_text(json.dumps(meta))
    (d / "summary.json").write_text(json.dumps(s))


def test_average_over_full_runs_only(tmp_path, monkeypatch):
    monkeypatch.setenv("PODIUM_DATA", str(tmp_path))
    _run("2026-01-01_a", 60)
    _run("2026-01-02_b", 80, yaw_lo=-20.0)  # calibrated 20° to the right: same center-relative frame
    _run("2026-01-03_c", 10, mode="qa")
    _run("2026-01-04_d", 10, drill="fewer_fillers")
    _run("2026-01-05_e", 90, kind="impromptu")
    a = average.average("prepared")
    assert a["count"] == 2 and a["scores"]["overall"] == 70 and a["trend"]["overall"] == [60, 80]
    assert a["fillers"]["byToken"] == {"um": 4} and a["dimensions"]["structure"] == 3.0
    g = a["gaze"]
    assert g["heatmap"]["yawBins"] == [-40.0, 40.0, 2.0] and g["boundaries"]["leftCenter"] == -12.0
    assert max(base64.b64decode(g["heatmap"]["u8"])) == 255  # both peaks land in the same cell
    assert len(a["engagement"]["curve"]) == average.CURVE_POINTS
    assert average.average()["count"] == 3
    assert average.average("impromptu")["scores"]["overall"] == 90
