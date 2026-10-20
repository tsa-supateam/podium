"""Accurate live transcription for filler alerts and captions.

The small Vosk model mis-hears real speech ("oh", "all", "are" ...), which made the old
sound-alike filler rule fire constantly. Instead, each stretch of speech is sent to Whisper
as soon as the speaker pauses (or every few seconds during long runs). Whisper writes "um"
and "uh" as real words, so a filler is reported only when it was actually transcribed.

Vosk still runs for the instant words-per-minute reading; it is no longer used for fillers.
"""

from __future__ import annotations

import logging
import queue
import threading
from collections.abc import Callable
from dataclasses import dataclass
from functools import lru_cache

import numpy as np

from ..paths import models_dir
from .pace import Word

log = logging.getLogger("podium.live_whisper")
SR = 16000


@lru_cache(maxsize=2)
def _model(name: str, threads: int):
    from faster_whisper import WhisperModel

    return WhisperModel(str(models_dir() / name), device="cpu", compute_type="int8", cpu_threads=threads)


def keep_segment(seg, prompt: str) -> bool:
    """Drop Whisper output that is likely invented: low confidence, silence, loops, or the prompt echoed back."""
    if seg.no_speech_prob > 0.6 or seg.avg_logprob < -1.0 or seg.compression_ratio > 2.2:
        return False
    text = "".join(ch for ch in seg.text.lower() if ch.isalpha() or ch == " ").split()
    p = "".join(ch for ch in prompt.lower() if ch.isalpha() or ch == " ").split()
    return not (text and len(text) >= 3 and " ".join(text) in " ".join(p))


def transcribe_chunk(audio: np.ndarray, t0: float, cfg: dict, threads: int = 2) -> list[Word]:
    la = cfg["live_asr"]
    prompt = cfg["deep"]["initial_prompt"]
    segs, _ = _model(la["model"], threads).transcribe(
        audio, language="en", initial_prompt=prompt, condition_on_previous_text=False, beam_size=1,
        temperature=0.0, word_timestamps=True, vad_filter=False, max_new_tokens=int(la["max_new_tokens"]),
    )
    words: list[Word] = []
    for seg in segs:
        if not keep_segment(seg, prompt):
            continue
        for w in seg.words or []:
            words.append(Word(t0 + float(w.start), t0 + float(w.end), w.word.strip(), float(w.probability)))
    return words


@dataclass
class _Job:
    start: float  # seconds since session start
    audio: np.ndarray


class LiveWhisper:
    """Background worker: queue speech chunks, get timed words back through a callback."""

    def __init__(self, cfg: dict, on_words: Callable[[list[Word]], None]) -> None:
        self.cfg = cfg
        self.on_words = on_words
        self._q: queue.Queue[_Job | None] = queue.Queue(maxsize=8)
        self._thread = threading.Thread(target=self._run, name="live-whisper", daemon=True)
        self._thread.start()

    def submit(self, start: float, audio: np.ndarray) -> None:
        if len(audio) < SR * 0.3:
            return  # too short to hold a word
        try:
            self._q.put_nowait(_Job(start, audio.astype(np.float32)))
        except queue.Full:
            log.warning("live transcription is behind; dropping a chunk")

    def close(self, timeout: float = 15.0) -> None:
        """Finish queued chunks (so the last words are not lost), then stop."""
        self._q.put(None)
        self._thread.join(timeout)

    def _run(self) -> None:
        threads = int(self.cfg["live_asr"]["threads"])
        try:
            _model(self.cfg["live_asr"]["model"], threads)  # load before the first chunk arrives
        except Exception:
            log.exception("live transcription unavailable")
        while (job := self._q.get()) is not None:
            try:
                words = transcribe_chunk(job.audio, job.start, self.cfg, threads)
                if words:
                    self.on_words(words)
            except Exception:
                log.exception("live chunk failed")
