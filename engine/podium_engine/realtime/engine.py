"""Fast Real-Time Engine (spec §4.1).

One processing thread consumes the audio ring buffer in 20 ms hops and runs
VAD, YIN pitch, RMS, Vosk streaming ASR and the filled-pause detector. A
fusion step every 250 ms produces the Boredom Index. All timestamps are
seconds of audio since session start (the audio sample count is the clock).
"""

from __future__ import annotations

import json
import logging
import threading
import time
import wave
from collections import deque
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import numpy as np

from .. import config as cfgmod
from ..paths import models_dir
from ..storage import SCHEMA_VERSION, Index, TelemetryWriter, read_ndjson, write_json
from . import fusion
from .dsp import RingBuffer, StreamingVAD, VadState, hysteresis_step, rms_db, spectral_flux, yin
from .fillers import FilledPauseDetector, FillerEvent, filled_pause_tokens, lexical_fillers
from .live_whisper import LiveWhisper
from .pace import Word, articulation_rate, pace_label, rolling_wpm

log = logging.getLogger("podium.rt")
Emit = Callable[[dict[str, Any]], None]


# ---------------------------------------------------------------- audio sources
class MicSource:
    def __init__(self, sr: int, block: int, device: int | str | None = None) -> None:
        self.sr, self.block, self.device = sr, block, device
        self._stream = None

    def start(self, on_audio: Callable[[np.ndarray], None]) -> None:
        import sounddevice as sd

        def cb(indata, frames, t, status):  # PortAudio thread: copy only
            on_audio(indata[:, 0].copy())

        self._stream = sd.InputStream(samplerate=self.sr, channels=1, dtype="float32",
                                      blocksize=self.block, device=self.device, callback=cb)
        self._stream.start()

    def stop(self) -> None:
        if self._stream is not None:
            self._stream.stop()
            self._stream.close()
            self._stream = None

    def describe(self) -> dict:
        try:
            import sounddevice as sd

            info = sd.query_devices(self.device, "input")
            return {"name": info["name"], "sampleRate": self.sr}
        except Exception:  # noqa: BLE001
            return {"name": "default", "sampleRate": self.sr}


class PushSource:
    """Audio captured by the app window (getUserMedia) and streamed over the WebSocket.

    The default for live sessions: the window already holds the OS microphone permission, while
    a Python process launched by it may silently receive zeros on macOS.
    """

    def __init__(self, sr: int, name: str = "App microphone") -> None:
        self.sr, self.name = sr, name
        self._cb: Callable[[np.ndarray], None] | None = None

    def start(self, on_audio: Callable[[np.ndarray], None]) -> None:
        self._cb = on_audio

    def push(self, samples: np.ndarray) -> None:
        if self._cb is not None and len(samples):
            self._cb(samples)

    def stop(self) -> None:
        self._cb = None

    def describe(self) -> dict:
        return {"name": self.name, "sampleRate": self.sr}


class FileSource:
    """Replays a WAV (and optionally a recorded gaze track) at real-time speed: Replay Mode."""

    def __init__(self, wav: Path, sr: int, block: int, speed: float = 1.0,
                 gaze: list[dict] | None = None, on_gaze: Callable[[dict, float], None] | None = None) -> None:
        import soundfile as sf

        y, file_sr = sf.read(str(wav), dtype="float32", always_2d=True)
        y = y[:, 0]
        if file_sr != sr:
            import librosa

            y = librosa.resample(y, orig_sr=file_sr, target_sr=sr)
        self.y, self.sr, self.block, self.speed = y, sr, block, speed
        self.gaze = sorted(gaze or [], key=lambda g: g["t"])
        self.on_gaze = on_gaze
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self.finished = threading.Event()

    def start(self, on_audio: Callable[[np.ndarray], None]) -> None:
        def run() -> None:
            t_start = time.perf_counter()
            gi = 0
            for i in range(0, len(self.y), self.block):
                if self._stop.is_set():
                    break
                on_audio(self.y[i : i + self.block])
                t_audio = (i + self.block) / self.sr
                while gi < len(self.gaze) and self.gaze[gi]["t"] <= t_audio:
                    if self.on_gaze:
                        self.on_gaze(self.gaze[gi], self.gaze[gi]["t"])
                    gi += 1
                if self.speed > 0:
                    lag = t_start + t_audio / self.speed - time.perf_counter()
                    if lag > 0:
                        time.sleep(lag)
            self.finished.set()

        self._thread = threading.Thread(target=run, name="replay", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=2)

    def describe(self) -> dict:
        return {"name": "Replay", "sampleRate": self.sr}


# ---------------------------------------------------------------- engine
class RealtimeEngine:
    def __init__(self, session_dir: Path, emit: Emit, meta: dict, cfg: dict | None = None) -> None:
        self.cfg = cfg or cfgmod.load()
        a = self.cfg["audio"]
        self.sr = a["sample_rate"]
        self.block = int(self.sr * a["block_ms"] / 1000)
        self.dir = session_dir
        self.dir.mkdir(parents=True, exist_ok=True)
        self.emit = emit
        self.meta = meta
        self.ring = RingBuffer(self.sr * 30)
        self.tel = TelemetryWriter(self.dir)

        p = self.cfg["prosody"]
        self.hop, self.frame = p["hop"], p["frame"]
        self.vad = StreamingVAD()
        self.vad_state = VadState()
        self._vad_pending = np.zeros(0, dtype=np.float32)

        import vosk

        vosk.SetLogLevel(-1)
        self._vosk_model = vosk.Model(str(models_dir() / "vosk-model-small-en-us-0.15"))
        self.rec = vosk.KaldiRecognizer(self._vosk_model, self.sr)
        self.rec.SetWords(True)
        self.rec.SetPartialWords(True)  # word timings while the utterance is still in progress
        self._vosk_pending = bytearray()

        f = self.cfg["fillers"]
        self.fpd = FilledPauseDetector(f["fpd_min_dur"], f["fpd_max_dur"], f["fpd_max_st_std"])

        b = self.cfg["boredom"]
        self.integ = fusion.BoredomIntegrator(b["k_up"], b["k_down"])

        # state
        self.words: list[Word] = []              # finalized
        self.provisional: list[Word] = []        # from partial results
        self._partial_n = 0
        self._partial_t = 0.0
        self.fillers: list[FillerEvent] = []
        self.prosody: deque[tuple[float, float, float, bool]] = deque(maxlen=int(30 * self.sr / self.hop))
        self._f0_baseline: list[float] = []
        self.f_ref: float | None = None
        self._prev_mag: np.ndarray | None = None
        self.gaze: deque[tuple[float, str]] = deque(maxlen=30 * 40)
        self._gaze_count = 0
        self._last_speech_t = 0.0
        self._speech_start: float | None = None
        self._pause_start: float | None = 0.0
        self.voiced_frames: deque[float] = deque(maxlen=int(10 * self.sr / self.hop))
        self._wpm_ema: float | None = None
        self._next_tick = 0.0
        self._next_pace = 1.0
        self._silent_since: float | None = 0.0
        self._silence_warned = False
        self._hop_i = 0

        self._wav = wave.open(str(self.dir / "audio.wav"), "wb")
        self._wav.setnchannels(1)
        self._wav.setsampwidth(2)
        self._wav.setframerate(self.sr)

        # Accurate live words (fillers, captions) come from Whisper on each stretch of speech.
        self.live_words: list[Word] = []
        self._chunk_start: float | None = None
        self._filler_lock = threading.Lock()
        self.live_asr = LiveWhisper(self.cfg, self._on_live_words)

        self._running = threading.Event()
        self._thread: threading.Thread | None = None
        self._source: MicSource | FileSource | PushSource | None = None
        self._flush_at = time.monotonic()

    # -- lifecycle --------------------------------------------------------
    @property
    def t(self) -> float:
        return self.ring.written / self.sr

    def start(self, source: MicSource | FileSource | PushSource) -> None:
        self._source = source
        self.meta.setdefault("devices", {})["audioInput"] = source.describe()
        self.meta["status"] = "recording"
        write_json(self.dir / "session.json", self.meta)
        Index().upsert(self.meta)
        self._running.set()
        self._thread = threading.Thread(target=self._loop, name="rt-engine", daemon=True)
        self._thread.start()
        source.start(self.ring.write)

    def stop(self) -> dict:
        if self._source:
            self._source.stop()
        self._running.clear()
        if self._thread:
            self._thread.join(timeout=5)
        # flush the recognizer's last utterance, and transcribe the speech still in progress
        final = json.loads(self.rec.FinalResult())
        self._on_final(final)
        if self._chunk_start is not None:
            self._submit_chunk(self._chunk_start, self.t)
            self._chunk_start = None
        self.live_asr.close()
        self._wav.close()
        self.tel.flush()
        self.meta["durationSec"] = round(self.t, 3)
        self.meta["status"] = "recorded"
        self.meta["endedAt"] = datetime.now(UTC).isoformat()
        write_json(self.dir / "session.json", self.meta)
        Index().upsert(self.meta)
        return self.meta

    # -- gaze from renderer -------------------------------------------------
    def add_gaze(self, sample: dict, t: float | None = None) -> None:
        t = self.t if t is None else t
        zone = sample.get("zone", "X") if sample.get("face", True) else "X"
        dt = 1 / 30
        if self.gaze:
            dt = min(0.1, max(0.0, t - self.gaze[-1][0]))
        self.gaze.append((t, zone))
        self._gaze_dt = dt
        self._gaze_count += 1
        rec = {k: sample[k] for k in ("face", "yaw", "pitch", "roll", "gYaw", "gPitch", "zone", "conf", "irisX", "irisY")
               if k in sample}
        rec["t"] = round(t, 3)
        self.tel.write("gaze", rec)

    # -- processing loop ---------------------------------------------------
    def _loop(self) -> None:
        cursor = 0
        while self._running.is_set() or self.ring.written - cursor >= self.hop:
            if self.ring.written - cursor < self.hop:
                time.sleep(0.005)
                continue
            try:
                chunk = self.ring.read(cursor, self.hop)
            except IndexError:  # fell behind by > 30 s; skip ahead
                cursor = self.ring.written - self.hop
                continue
            cursor += self.hop
            try:
                self._process_hop(chunk, cursor)
            except Exception:
                log.exception("hop failed")
            if time.monotonic() - self._flush_at > 1.0:
                self.tel.flush()
                self._flush_at = time.monotonic()

    def _process_hop(self, chunk: np.ndarray, cursor: int) -> None:
        t = cursor / self.sr
        self._hop_i += 1
        self._wav.writeframes((np.clip(chunk, -1, 1) * 32767).astype("<i2").tobytes())

        # VAD (32 ms frames)
        v = self.cfg["vad"]
        self._vad_pending = np.concatenate([self._vad_pending, chunk])
        while len(self._vad_pending) >= StreamingVAD.FRAME:
            frame, self._vad_pending = self._vad_pending[: StreamingVAD.FRAME], self._vad_pending[StreamingVAD.FRAME :]
            p = self.vad(frame)
            change = hysteresis_step(self.vad_state, p, 32.0, v["speech_on"], v["speech_off"],
                                     v["min_speech_ms"], v["min_silence_ms"])
            if change is True:
                start = t - v["min_speech_ms"] / 1000
                if self._pause_start is not None and start - self._pause_start >= v["min_silence_ms"] / 1000:
                    pause = {"t0": round(self._pause_start, 3), "t1": round(start, 3)}
                    self.tel.write("pauses", pause)
                self._pause_start = None
                self._speech_start = start
                self._chunk_start = max(0.0, start - 0.2)
            elif change is False:
                self._pause_start = t - v["min_silence_ms"] / 1000
                if self._chunk_start is not None:  # speaker paused: transcribe what they just said
                    self._submit_chunk(self._chunk_start, t)
                    self._chunk_start = None
        if self.vad_state.speaking:
            self._last_speech_t = t
            if self._chunk_start is not None and t - self._chunk_start >= self.cfg["live_asr"]["max_chunk_s"]:
                self._submit_chunk(self._chunk_start, t)
                self._chunk_start = t

        # Pitch / energy (64 ms window ending now)
        if cursor >= self.frame:
            win = self.ring.read(cursor - self.frame, self.frame)
            db = rms_db(win)
            mag = np.abs(np.fft.rfft(win * np.hanning(len(win))))[:256]
            flux = spectral_flux(self._prev_mag, mag)
            self._prev_mag = mag
            p = self.cfg["prosody"]
            f0 = yin(win, self.sr, p["fmin"], p["fmax"]) if (self.vad_state.speaking and db > -50) else 0.0
            voiced = f0 > 0
            if voiced and self.f_ref is None:
                self._f0_baseline.append(f0)
                if len(self._f0_baseline) * self.hop / self.sr >= p["baseline_s"]:
                    self.f_ref = float(np.median(self._f0_baseline))
            ref = self.f_ref or (float(np.median(self._f0_baseline)) if self._f0_baseline else 150.0)
            st = 12 * np.log2(f0 / ref) if voiced else 0.0
            self.prosody.append((t, float(st), db, voiced))
            self.voiced_frames.append(t if self.vad_state.speaking else -1.0)
            if self._hop_i % 5 == 0:
                self.tel.write("prosody", {"t": round(t, 3), "f0": round(f0, 1), "st": round(float(st), 2),
                                           "rmsDb": round(db, 1), "voiced": voiced})
            ev = self.fpd.push(t, f0 if self.vad_state.speaking else 0.0, flux)
            if ev and self.cfg["fillers"].get("fpd_live", False):
                self._add_filler(ev)

        # Vosk (100 ms chunks)
        self._vosk_pending += (np.clip(chunk, -1, 1) * 32767).astype("<i2").tobytes()
        if len(self._vosk_pending) >= 3200:
            data, self._vosk_pending = bytes(self._vosk_pending), bytearray()
            if self.rec.AcceptWaveform(data):
                self._on_final(json.loads(self.rec.Result()))
            elif self._hop_i % 5 == 0:
                self._on_partial(json.loads(self.rec.PartialResult()), t)

        if t >= self._next_tick:
            self._next_tick = t + self.cfg["boredom"]["tick_s"]
            self._fusion_tick(t)
        if t >= self._next_pace:
            self._next_pace = t + 1.0
            self._pace_tick(t)

    # -- ASR handling ------------------------------------------------------
    def _on_partial(self, res: dict, t: float) -> None:
        """Vosk partial words (with timings) keep the speed reading current between Whisper chunks."""
        items = res.get("partial_result") or []
        self.provisional = [Word(float(i["start"]), float(i["end"]), i["word"], float(i.get("conf", 1.0))) for i in items]

    def _on_final(self, res: dict) -> None:
        self.provisional.clear()
        items = res.get("result") or []
        if not items:
            return
        new_words = [Word(float(i["start"]), float(i["end"]), i["word"], float(i.get("conf", 1.0))) for i in items]
        for w in new_words:
            self.tel.write("vosk", {"t0": round(w.t0, 3), "t1": round(w.t1, 3), "w": w.w, "p": round(w.p, 2)})
        self.words.extend(new_words)  # word count for WPM only; too inaccurate for fillers or captions

    # -- accurate live words (Whisper) -----------------------------------
    def _submit_chunk(self, t0: float, t1: float) -> None:
        start = max(0, int(t0 * self.sr))
        n = int(t1 * self.sr) - start
        if n <= 0:
            return
        try:
            audio = self.ring.read(start, min(n, self.ring.written - start))
        except IndexError:
            return
        self.live_asr.submit(start / self.sr, audio)

    def _on_live_words(self, words: list[Word]) -> None:
        """Runs on the live-whisper thread."""
        ctx = self.live_words[-3:]
        self.live_words.extend(words)
        for w in words:
            self.tel.write("words", {"t0": round(w.t0, 3), "t1": round(w.t1, 3), "w": w.w, "p": round(w.p, 3),
                                     "src": "whisper-live"})
        self.emit({"type": "transcript.final", "t": round(self.t, 3),
                   "data": {"words": [{"w": w.w, "t0": round(w.t0, 2), "t1": round(w.t1, 2)} for w in words]}})
        f = self.cfg["fillers"]
        sure = [w for w in words if w.p >= self.cfg["live_asr"]["min_filler_prob"]]
        events = filled_pause_tokens(sure, f["filled_pauses"], "live")
        events += lexical_fillers(ctx + words, f["lexical"], src="live", sentence_starts={len(ctx)})
        for ev in sorted(events, key=lambda e: e.t0):
            if ev.t0 >= words[0].t0 - 1e-6:
                self._add_filler(ev)

    def _pitch_std(self, t0: float, t1: float) -> float | None:
        sts = [s for (t, s, _, v) in self.prosody if v and t0 <= t <= t1]
        return float(np.std(sts)) if len(sts) >= 4 else None

    def _add_filler(self, ev: FillerEvent) -> None:
        win = self.cfg["fillers"]["merge_window"]
        with self._filler_lock:
            for prev in reversed(self.fillers[-6:]):
                if ev.t0 <= prev.t1 + win and ev.t1 >= prev.t0 - win:
                    return  # already counted by another detector
            self.fillers.append(ev)
        self.tel.write("fillers", ev.as_dict())
        self.emit({"type": "filler.detected", "t": round(self.t, 3),
                   "data": {**ev.as_dict(), "total": len(self.fillers)}})

    # -- periodic ticks ----------------------------------------------------
    def _all_words(self) -> list[Word]:
        return self.words + self.provisional

    def _pace_tick(self, t: float) -> None:
        pc = self.cfg["pace"]
        words = [w for w in self._all_words() if w.t1 > t - pc["window_s"] - 1]
        wpm = rolling_wpm(words, t, pc["window_s"])
        speech_frac = sum(1 for x in self.voiced_frames if x > t - pc["window_s"]) * self.hop / self.sr / pc["window_s"]
        speech_frac = min(1.0, speech_frac)
        voiced_s = speech_frac * pc["window_s"]
        art = articulation_rate(words, t, pc["window_s"], voiced_s)
        a = pc["ema_alpha"]
        if speech_frac >= 0.3:
            self._wpm_ema = wpm if self._wpm_ema is None else a * wpm + (1 - a) * self._wpm_ema
        rec = {"t": round(t, 3), "wpm": round(wpm, 1), "wpmEma": round(self._wpm_ema or 0.0, 1),
               "artRate": round(art, 1), "speechFrac": round(speech_frac, 2),
               "label": pace_label(self._wpm_ema or 0.0, pc["band"], pc["drag"], pc["rush"]) if speech_frac >= 0.3 else "pause"}
        self.tel.write("pace", rec)
        self.emit({"type": "pace.tick", "t": rec["t"], "data": rec})

    def _check_input(self, t: float) -> None:
        """Warn once if the input is digital silence: a denied OS permission delivers exact zeros."""
        level = self.prosody[-1][2] if self.prosody else -180.0
        if level > -100:
            self._silent_since = None
        elif self._silent_since is None:
            self._silent_since = t
        elif not self._silence_warned and t - self._silent_since >= 3.0:
            self._silence_warned = True
            self.emit({"type": "audio.silent", "t": round(t, 3),
                       "data": {"message": "The microphone is sending pure silence. Check the input device and "
                                           "microphone permission for Podium."}})

    def _fusion_tick(self, t: float) -> None:
        self._check_input(t)
        b = self.cfg["boredom"]
        silence = t - self._last_speech_t
        recent_g = [(t_, z) for (t_, z) in self.gaze if t_ > t - b["gaze_window_s"]]
        shares = fusion.zone_shares((1 / 30, z) for _, z in recent_g) if recent_g else None
        c_g = fusion.gaze_component(shares, b["gaze_lambda"]) if shares and len(recent_g) > 30 else None
        if shares and shares.get("X", 0) > 0.5:
            c_g = None  # face not visible: don't punish detector failures

        if t < 2.0 or (silence > b["silence_grace_s"] and self._speech_start is not None):
            sil = fusion.clip01((silence - b["silence_grace_s"]) / 10.0) if self._speech_start is not None else None
            comps = {"gaze": c_g, "silence": sil}
            weights = {"gaze": b["weights"]["gaze"], "silence": 0.65}
            comps_out = {"filler": None, "monotony": None, "gaze": c_g, "pace": None, "silence": sil}
        else:
            n_f = sum(1 for f in self.fillers if f.t0 > t - b["filler_window_s"])
            n_w = sum(1 for w in self._all_words() if w.t0 > t - b["filler_window_s"])
            c_f = fusion.filler_component(n_f, n_w, b["rho0"], b["s_f"]) if n_w + n_f >= 5 else None
            pr = [(s, db) for (t_, s, db, v) in self.prosody if v and t_ > t - b["prosody_window_s"]]
            c_m = None
            if len(pr) >= 25:
                arr = np.array(pr)
                c_m = fusion.monotony_component(arr[:, 0], arr[:, 1], b["sigma_lo"], b["sigma_hi"],
                                                b["energy_lo"], b["energy_hi"])
            c_p = fusion.pace_component(self._wpm_ema) if (self._wpm_ema and t > 8.0) else None
            comps = {"filler": c_f, "monotony": c_m, "gaze": c_g, "pace": c_p}
            weights = b["weights"]
            comps_out = {**comps, "silence": None}

        b_raw = fusion.fuse(comps, weights)
        if self.meta.get("difficulty", "coach") == "coach":
            b_raw *= self.cfg["boredom"]["coach_leniency"]  # a friendlier audience while learning
        B = self.integ.step(b_raw, b["tick_s"])
        E = round(100 * (1 - B))
        state = "engaged" if B < 0.35 else "bored" if B > 0.65 else "neutral"
        rec = {"t": round(t, 3), "Braw": round(b_raw, 3), "B": round(B, 3), "E": E,
               "c": {k: (round(v, 3) if v is not None else None) for k, v in comps_out.items()},
               "zoneShare": {k: round(v, 3) for k, v in (shares or {}).items()},
               "audienceState": state, "speaking": self.vad_state.speaking,
               "levelDb": round(self.prosody[-1][2], 1) if self.prosody else -90.0,
               "fillerBurst": sum(1 for f in self.fillers if f.t0 > t - 6) >= 3}
        self.tel.write("engagement", rec)
        self.emit({"type": "engagement.tick", "t": rec["t"], "data": rec})


def new_meta(session_id: str, title: str, mode: str, cfg: dict, extra: dict | None = None) -> dict:
    return {
        "schemaVersion": SCHEMA_VERSION,
        "sessionId": session_id,
        "createdAt": datetime.now(UTC).isoformat(),
        "title": title,
        "mode": mode,
        "durationSec": 0,
        "status": "created",
        "config": {
            "targetWpm": cfg["pace"]["band"],
            "fillerLexicon": cfg["fillers"]["filled_pauses"] + cfg["fillers"]["lexical"],
            "boredomWeights": cfg["boredom"]["weights"],
        },
        "app": {"engineVersion": "0.1.0", "models": {
            "rtAsr": "vosk-model-small-en-us-0.15", "deepAsr": cfg["deep"]["whisper_model"] + "-" + cfg["deep"]["compute_type"],
            "vad": "silero-vad-v6", "face": "face_landmarker.task (float16/1)", "tts": "piper/en_US-lessac-medium"}},
        **(extra or {}),
    }


def load_replay_gaze(session_dir: Path) -> list[dict]:
    return read_ndjson(session_dir / "telemetry" / "gaze.ndjson")
