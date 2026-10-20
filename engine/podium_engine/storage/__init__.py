"""Session storage: one folder per session, NDJSON telemetry, SQLite history index (spec §5)."""

from __future__ import annotations

import json
import math
import secrets
import shutil
import sqlite3
import threading
from collections.abc import Iterator
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from ..paths import data_dir, sessions_dir

SCHEMA_VERSION = "1.0.0"
CHANNELS = ("words", "vosk", "fillers", "pace", "prosody", "gaze", "engagement", "pauses")


def new_session_id() -> str:
    now = datetime.now(UTC).strftime("%Y-%m-%dT%H-%M-%SZ")
    return f"{now}_{secrets.token_hex(2)}"


def json_safe(obj: Any) -> Any:
    """Replace NaN/Infinity with None. Python's json emits bare NaN, which JSON.parse rejects
    (silent audio makes jitter/shimmer NaN, which once left the debrief screen hanging)."""
    if isinstance(obj, float):
        return obj if math.isfinite(obj) else None
    if isinstance(obj, dict):
        return {k: json_safe(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [json_safe(v) for v in obj]
    return obj


def dumps(obj: Any, **kw: Any) -> str:
    return json.dumps(json_safe(obj), allow_nan=False, **kw)


def write_json(path: Path, obj: Any) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(dumps(obj, indent=2))
    tmp.replace(path)


def read_ndjson(path: Path) -> list[dict]:
    if not path.exists():
        return []
    out = []
    for line in path.read_text().splitlines():
        line = line.strip()
        if line:
            try:
                out.append(json.loads(line))
            except json.JSONDecodeError:
                pass  # a crash can leave one partial last line
    return out


class TelemetryWriter:
    """Buffered, append-only NDJSON writers, one file per channel."""

    def __init__(self, root: Path) -> None:
        self.dir = root / "telemetry"
        self.dir.mkdir(parents=True, exist_ok=True)
        self._buf: dict[str, list[str]] = {c: [] for c in CHANNELS}
        self._lock = threading.Lock()

    def write(self, channel: str, record: dict) -> None:
        with self._lock:
            self._buf[channel].append(dumps(record, separators=(",", ":")))

    def flush(self) -> None:
        with self._lock:
            pending = {c: lines for c, lines in self._buf.items() if lines}
            self._buf = {c: [] for c in CHANNELS}
        for c, lines in pending.items():
            with (self.dir / f"{c}.ndjson").open("a") as f:
                f.write("\n".join(lines) + "\n")


class Index:
    """SQLite index of sessions, for the history view (fast without opening every folder)."""

    def __init__(self, path: Path | None = None) -> None:
        self.path = path or data_dir() / "podium.db"
        with self._conn() as c:
            c.execute("""CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY, created_at TEXT, title TEXT, mode TEXT,
                duration REAL, status TEXT, overall INTEGER, scores TEXT)""")

    def _conn(self) -> sqlite3.Connection:
        return sqlite3.connect(self.path)

    def upsert(self, meta: dict, scores: dict | None = None) -> None:
        with self._conn() as c:
            c.execute(
                """INSERT INTO sessions (id, created_at, title, mode, duration, status, overall, scores)
                   VALUES (?,?,?,?,?,?,?,?)
                   ON CONFLICT(id) DO UPDATE SET title=excluded.title, duration=excluded.duration,
                     status=excluded.status, overall=COALESCE(excluded.overall, overall),
                     scores=COALESCE(excluded.scores, scores)""",
                (meta["sessionId"], meta["createdAt"], meta.get("title", ""), meta.get("mode", "practice"),
                 meta.get("durationSec", 0), meta.get("status", "recorded"),
                 (scores or {}).get("overall"), json.dumps(scores) if scores else None),
            )

    def list(self, limit: int = 50, exclude_modes: tuple[str, ...] = ("qa",)) -> list[dict]:
        """Newest first. Q&A answers are part of their parent session, so they are hidden by default."""
        marks = ",".join("?" for _ in exclude_modes) or "''"
        with self._conn() as c:
            rows = c.execute(
                "SELECT id, created_at, title, mode, duration, status, overall, scores FROM sessions "
                f"WHERE mode NOT IN ({marks}) ORDER BY created_at DESC LIMIT ?", (*exclude_modes, limit)).fetchall()
        return [{"sessionId": r[0], "createdAt": r[1], "title": r[2], "mode": r[3], "durationSec": r[4],
                 "status": r[5], "overall": r[6], "scores": json.loads(r[7]) if r[7] else None} for r in rows]

    def delete(self, session_id: str) -> None:
        with self._conn() as c:
            c.execute("DELETE FROM sessions WHERE id = ?", (session_id,))


def session_path(session_id: str) -> Path:
    p = (sessions_dir() / session_id).resolve()
    if p.parent != sessions_dir().resolve():
        raise ValueError("invalid session id")
    return p


def delete_session(session_id: str) -> None:
    p = session_path(session_id)
    meta = p / "session.json"
    if meta.exists():  # a speech's Q&A answers go with it
        for a in json.loads(meta.read_text()).get("answers", []):
            if a.get("sessionId") and a["sessionId"] != session_id:
                delete_session(a["sessionId"])
    if p.exists():
        shutil.rmtree(p)
    Index().delete(session_id)


def iter_sessions() -> Iterator[Path]:
    yield from sorted(sessions_dir().iterdir(), reverse=True)
