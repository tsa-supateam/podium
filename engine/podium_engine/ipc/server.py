"""Loopback WebSocket server between the UI and the engines (spec §5.5).

Text frames carry JSON envelopes: {"v":1,"type":...,"id"?:...,"t"?:...,"data":{...}}.
Binary frames (file transfer both ways) are: 4-byte big-endian header length,
a JSON header, then the raw bytes.

Security: binds 127.0.0.1 only and requires the one-time token that the
Electron main process generated when it spawned this process.
"""

from __future__ import annotations

import asyncio
import json
import logging
import struct
import sys
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse

import numpy as np
import websockets
from websockets.asyncio.server import ServerConnection, serve

from .. import config as cfgmod
from .. import storage
from ..paths import models_dir, sessions_dir
from ..realtime.engine import FileSource, MicSource, PushSource, RealtimeEngine, load_replay_gaze, new_meta

log = logging.getLogger("podium.ipc")
PROTOCOL_VERSION = 1
SERVED_FILES = {"audio.wav", "video.webm", "debrief.wav", "summary.json", "transcript.json", "questions.json",
                "session.json"} | {f"question_{i}.wav" for i in range(12)}


def pack_binary(header: dict, payload: bytes) -> bytes:
    h = json.dumps(header).encode()
    return struct.pack(">I", len(h)) + h + payload


def unpack_binary(frame: bytes) -> tuple[dict, bytes]:
    (n,) = struct.unpack(">I", frame[:4])
    return json.loads(frame[4 : 4 + n]), frame[4 + n :]


SPEED_BANDS = {"prepared": [120, 160], "impromptu": [100, 140]}  # words per minute

class Server:
    def __init__(self, token: str) -> None:
        self.token = token
        self.cfg = cfgmod.load()
        self.client: ServerConnection | None = None
        self.engine: RealtimeEngine | None = None
        self.source: MicSource | FileSource | PushSource | None = None
        self.session_id: str | None = None
        self.replay = False
        self.queue: asyncio.Queue[dict] = asyncio.Queue()
        self.loop: asyncio.AbstractEventLoop | None = None
        self.analyses: dict[str, asyncio.subprocess.Process] = {}

    # -- plumbing ---------------------------------------------------------------
    def emit_threadsafe(self, ev: dict) -> None:
        assert self.loop is not None
        self.loop.call_soon_threadsafe(self.queue.put_nowait, ev)

    async def send(self, ev: dict) -> None:
        ev.setdefault("v", PROTOCOL_VERSION)
        if self.client is not None:
            try:
                await self.client.send(storage.dumps(ev, separators=(",", ":")))
            except websockets.ConnectionClosed:
                pass

    async def pump(self) -> None:
        while True:
            ev = await self.queue.get()
            await self.send(ev)

    def authorized(self, conn: ServerConnection) -> bool:
        q = parse_qs(urlparse(conn.request.path).query)
        return q.get("token", [""])[0] == self.token

    async def handler(self, conn: ServerConnection) -> None:
        if not self.authorized(conn):
            await conn.close(code=4401, reason="bad token")
            return
        if self.client is not None:
            await self.client.close(code=4000, reason="replaced by a new client")
        self.client = conn
        await self.send({"type": "hello", "data": self.hello()})
        try:
            async for msg in conn:
                if isinstance(msg, bytes):
                    header, payload = unpack_binary(msg)
                    await self.on_binary(header, payload)
                    continue
                ev = json.loads(msg)
                try:
                    await self.dispatch(ev)
                except Exception as e:
                    log.exception("command failed")
                    await self.send({"type": "error", "id": ev.get("id"), "data": {"message": str(e),
                                                                                  "command": ev.get("type")}})
        finally:
            if self.client is conn:
                self.client = None

    # -- commands ---------------------------------------------------------------
    def hello(self) -> dict:
        m = models_dir()
        models = {
            "vosk": (m / "vosk-model-small-en-us-0.15").exists(),
            "whisper": (m / self.cfg["deep"]["whisper_model"] / "model.bin").exists(),
            "piper": (m / "piper").exists(),
            "face": (m / "face_landmarker.task").exists(),
        }
        return {"protocol": PROTOCOL_VERSION, "engineVersion": "0.1.0", "models": models,
                "config": {"pace": self.cfg["pace"], "boredom": self.cfg["boredom"]},
                "recording": self.session_id is not None}

    async def reply(self, ev: dict, type_: str, data: Any) -> None:
        await self.send({"type": type_, "id": ev.get("id"), "data": data})

    async def dispatch(self, ev: dict) -> None:
        t = ev.get("type")
        d = ev.get("data") or {}
        if t == "gaze.sample":
            if self.engine is not None and not self.replay:
                self.engine.add_gaze(d)
        elif t == "ping":
            await self.reply(ev, "pong", {})
        elif t == "devices.list":
            import sounddevice as sd

            devs = [{"index": i, "name": x["name"], "default": i == sd.default.device[0]}
                    for i, x in enumerate(sd.query_devices()) if x["max_input_channels"] > 0]
            await self.reply(ev, "devices", devs)
        elif t == "session.start":
            await self.start_session(ev, d)
        elif t == "session.stop":
            await self.stop_session(ev)
        elif t == "achievements.list":
            from .. import achievements

            await self.reply(ev, "achievements", achievements.earned())
        elif t == "sessions.list":
            await self.reply(ev, "sessions", storage.Index().list(int(d.get("limit", 50))))
        elif t == "session.get":
            await self.reply(ev, "session", self.load_session(d["sessionId"]))
        elif t == "session.delete":
            storage.delete_session(d["sessionId"])
            await self.reply(ev, "session.deleted", {"sessionId": d["sessionId"]})
        elif t == "session.analyze":
            self.launch_analysis(d["sessionId"])
            await self.reply(ev, "ok", {})
        elif t == "session.rename":
            p = storage.session_path(d["sessionId"]) / "session.json"
            meta = json.loads(p.read_text())
            meta["title"] = str(d["title"])[:120]
            storage.write_json(p, meta)
            storage.Index().upsert(meta)
            await self.reply(ev, "ok", {})
        elif t == "questions.quick":
            from ..nlp.quick import quick_questions

            qs = await asyncio.get_running_loop().run_in_executor(
                None, quick_questions, storage.session_path(d["sessionId"]), int(d.get("k", 5)))
            await self.reply(ev, "questions", qs)
        elif t == "tts.speak":
            await self.speak(ev, str(d["text"])[:500])
        elif t == "file.get":
            await self.send_file(ev, d["sessionId"], d["name"])
        else:
            await self.reply(ev, "error", {"message": f"unknown command {t}"})

    async def start_session(self, ev: dict, d: dict) -> None:
        if self.engine is not None:
            raise RuntimeError("a session is already running")
        sid = storage.new_session_id()
        sdir = storage.session_path(sid)
        extra = {"targetDurationSec": d.get("targetDurationSec"), "audienceSize": d.get("audienceSize", 15),
                 "notes": bool(d.get("notes", True)),
                 "difficulty": "judge" if d.get("difficulty") in ("judge", "assessment") else "coach",
                 "gazeMode": "camera" if d.get("gazeMode") == "camera" else "room",
                 "prompt": str(d.get("prompt") or "")[:400]}
        title = d.get("title") or "Practice run"
        replay_from = d.get("replaySessionId")
        mode = "replay" if replay_from else d.get("mode", "practice")
        # Target speed by speech type; a Q&A answer is always on the spot.
        extra["speechType"] = "impromptu" if mode == "qa" or d.get("speechType") == "impromptu" else "prepared"
        cfg = {**self.cfg, "pace": {**self.cfg["pace"], "band": SPEED_BANDS[extra["speechType"]]}}
        if mode == "qa":  # an on-the-spot answer to a question about a previous speech
            extra.update(parentSessionId=d["parentSessionId"], question=d.get("question", ""))
        meta = new_meta(sid, title, mode, cfg, extra)
        if mode == "qa":
            self._link_answer(d["parentSessionId"], sid, d.get("question", ""))
        if d.get("calibration"):
            sdir.mkdir(parents=True, exist_ok=True)
            storage.write_json(sdir / "calibration.json", d["calibration"])
            meta["calibrated"] = True
        if d.get("videoInput"):
            meta.setdefault("devices", {})["videoInput"] = d["videoInput"]
        self.engine = RealtimeEngine(sdir, self.emit_threadsafe, meta, cfg)
        a = self.cfg["audio"]
        block = int(a["sample_rate"] * a["block_ms"] / 1000)
        if replay_from:
            src_dir = storage.session_path(replay_from) if not Path(replay_from).is_absolute() else Path(replay_from)
            wav = src_dir / "audio.wav" if src_dir.is_dir() else src_dir
            gaze = load_replay_gaze(src_dir) if src_dir.is_dir() else []
            if (src_dir / "session.json").exists():  # a replay keeps the original run's notes setting
                meta["notes"] = json.loads((src_dir / "session.json").read_text()).get("notes", True)
            eng = self.engine

            def on_gaze(g: dict, t: float) -> None:
                eng.add_gaze(g, t)
                self.emit_threadsafe({"type": "gaze.replay", "t": t, "data": g})

            self.source = FileSource(wav, a["sample_rate"], block, float(d.get("speed", 1.0)), gaze, on_gaze)
            self.replay = True
            asyncio.get_running_loop().run_in_executor(None, self._watch_replay_end, self.source, sid)
        elif d.get("audioSource", "app") == "app":
            self.source = PushSource(a["sample_rate"], d.get("audioDeviceName") or "App microphone")
            self.replay = False
        else:  # "engine": capture with PortAudio inside this process
            self.source = MicSource(a["sample_rate"], block, d.get("audioDevice"))
            self.replay = False
        self.session_id = sid
        try:
            self.engine.start(self.source)
        except Exception:
            self.engine, self.session_id, self.source = None, None, None
            raise
        await self.reply(ev, "session.started", {"sessionId": sid, "mode": mode,
                                                  "replayDuration": (len(self.source.y) / self.source.sr)
                                                  if isinstance(self.source, FileSource) else None})

    def _watch_replay_end(self, source: FileSource, sid: str) -> None:
        source.finished.wait()
        if self.session_id == sid:
            self.emit_threadsafe({"type": "replay.ended", "data": {"sessionId": sid}})

    async def stop_session(self, ev: dict) -> None:
        if self.engine is None:
            raise RuntimeError("no session is running")
        engine, sid = self.engine, self.session_id
        self.engine = self.session_id = self.source = None
        meta = await asyncio.get_running_loop().run_in_executor(None, engine.stop)
        await self.reply(ev, "session.stopped", {"sessionId": sid, "durationSec": meta["durationSec"]})
        if ev.get("data", {}).get("analyze", True):
            self.launch_analysis(sid)

    def launch_analysis(self, sid: str) -> None:
        asyncio.get_running_loop().create_task(self._run_analysis(sid))

    async def _run_analysis(self, sid: str) -> None:
        sdir = storage.session_path(sid)
        proc = await asyncio.create_subprocess_exec(
            sys.executable, "-m", "podium_engine", "analyze", str(sdir), "--json-progress",
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
        self.analyses[sid] = proc
        assert proc.stdout is not None and proc.stderr is not None
        # Drain stderr concurrently: if its pipe buffer fills, the child blocks and stdout never ends.
        err_task = asyncio.create_task(proc.stderr.read())
        async for line in proc.stdout:
            try:
                msg = json.loads(line)
            except json.JSONDecodeError:
                continue
            await self.send({"type": "analysis.progress", "data": {"sessionId": sid, **msg}})
        err = (await err_task).decode(errors="ignore")
        code = await proc.wait()
        self.analyses.pop(sid, None)
        if code == 0:
            await self.send({"type": "analysis.done", "data": {"sessionId": sid}})
            await self._maybe_combine(sid)
        else:
            await self.send({"type": "analysis.failed", "data": {"sessionId": sid, "message": err[-800:]}})

    async def _maybe_combine(self, sid: str) -> None:
        """When a speech and all its Q&A answers are analyzed, merge them into one report."""
        from ..deep.finalize import combine

        meta = json.loads((storage.session_path(sid) / "session.json").read_text())
        parent = meta.get("parentSessionId") if meta.get("mode") == "qa" else sid
        if not parent:
            return
        pmeta = json.loads((storage.session_path(parent) / "session.json").read_text())
        if not pmeta.get("answers") or pmeta.get("status") != "analyzed":
            return
        try:
            done = await asyncio.get_running_loop().run_in_executor(None, combine, storage.session_path(parent))
        except Exception:
            log.exception("combine failed")
            return
        if done:
            await self.send({"type": "session.updated", "data": {"sessionId": parent}})

    def _link_answer(self, parent: str, child: str, question: str) -> None:
        pf = storage.session_path(parent) / "session.json"
        pm = json.loads(pf.read_text())
        pm.setdefault("answers", []).append({"sessionId": child, "question": question})
        storage.write_json(pf, pm)

    async def speak(self, ev: dict, text: str) -> None:
        """Synthesize short text with Piper (cached by content) and return the WAV as a binary frame."""
        import hashlib

        from .. import tts
        from ..paths import data_dir

        cache = data_dir() / "tts_cache"
        cache.mkdir(exist_ok=True)
        f = cache / (hashlib.sha1(text.encode()).hexdigest()[:16] + ".wav")
        if not f.exists():
            await asyncio.get_running_loop().run_in_executor(None, tts.synthesize, text, f)
        assert self.client is not None
        await self.client.send(pack_binary({"type": "file", "id": ev.get("id"), "name": f.name}, f.read_bytes()))

    def load_session(self, sid: str) -> dict:
        p = storage.session_path(sid)
        out: dict[str, Any] = {"sessionId": sid}
        for name in ("session", "summary", "transcript", "questions", "calibration"):
            f = p / f"{name}.json"
            # parse_constant: sessions saved before the NaN fix may contain bare NaN
            out[name] = json.loads(f.read_text(), parse_constant=lambda _: None) if f.exists() else None
        out["files"] = sorted(x.name for x in p.iterdir() if x.name in SERVED_FILES)
        out["answers"] = [self._answer_bundle(a) for a in (out["session"] or {}).get("answers", [])]
        return out

    def _answer_bundle(self, a: dict) -> dict:
        p = storage.session_path(a["sessionId"])
        read = lambda n: json.loads((p / n).read_text(), parse_constant=lambda _: None) if (p / n).exists() else None  # noqa: E731
        summary, transcript = read("summary.json"), read("transcript.json")
        files = sorted(x.name for x in p.iterdir() if x.name in SERVED_FILES) if p.exists() else []
        return {"sessionId": a["sessionId"], "question": a.get("question", ""), "summary": summary,
                "text": (transcript or {}).get("text", ""), "files": files}

    async def send_file(self, ev: dict, sid: str, name: str) -> None:
        if name not in SERVED_FILES:
            raise ValueError("file not available")
        f = storage.session_path(sid) / name
        if not f.exists():
            raise FileNotFoundError(name)
        data = await asyncio.get_running_loop().run_in_executor(None, f.read_bytes)
        assert self.client is not None
        await self.client.send(pack_binary({"type": "file", "id": ev.get("id"), "name": name}, data))

    async def on_binary(self, header: dict, payload: bytes) -> None:
        if header.get("type") == "audio":
            # 16 kHz mono float32 PCM from the app window's AudioWorklet
            if isinstance(self.source, PushSource) and header.get("sessionId") == self.session_id:
                self.source.push(np.frombuffer(payload, dtype="<f4").copy())
            return
        if header.get("type") == "video.upload":
            p = storage.session_path(header["sessionId"])
            if not p.exists():
                raise FileNotFoundError(header["sessionId"])
            (p / "video.webm").write_bytes(payload)
            await self.send({"type": "ok", "id": header.get("id"), "data": {"saved": "video.webm",
                                                                             "bytes": len(payload)}})


async def run(port: int, token: str, ready_file: str | None = None) -> None:
    srv = Server(token)
    srv.loop = asyncio.get_running_loop()
    sessions_dir()
    async with serve(srv.handler, "127.0.0.1", port, max_size=512 * 1024 * 1024, ping_interval=20) as ws:
        actual = ws.sockets[0].getsockname()[1] if hasattr(ws, "sockets") else port
        line = json.dumps({"event": "ready", "port": actual})
        print(line, flush=True)
        if ready_file:
            Path(ready_file).write_text(line)
        await srv.pump()
