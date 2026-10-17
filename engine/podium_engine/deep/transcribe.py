"""Accurate post-speech transcription with faster-whisper (spec §4.2 stage 1).

Whisper tends to "clean up" disfluencies. Two tricks keep the fillers:
  1. A disfluent initial prompt ("Umm, so, uh, ...") primes the decoder to write them.
  2. faster-whisper only applies the initial prompt to the FIRST 30 s window when
     condition_on_previous_text=False, so we split the audio at VAD pauses into
     chunks shorter than 25 s and transcribe each chunk with the prompt.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from ..paths import models_dir
from ..realtime.pace import Word

SR = 16000


@dataclass
class Transcript:
    words: list[Word]
    text: str
    speech_regions: list[tuple[float, float]]


def speech_chunks(audio: np.ndarray, max_s: float) -> tuple[list[tuple[int, int]], list[tuple[float, float]]]:
    from faster_whisper.vad import VadOptions, get_speech_timestamps

    regions = get_speech_timestamps(audio, VadOptions(min_silence_duration_ms=300, speech_pad_ms=150))
    chunks: list[tuple[int, int]] = []
    for r in regions:
        s, e = r["start"], r["end"]
        if chunks and e - chunks[-1][0] <= max_s * SR:
            chunks[-1] = (chunks[-1][0], e)
        else:
            # a single region longer than max_s gets split hard
            while e - s > max_s * SR:
                chunks.append((s, s + int(max_s * SR)))
                s += int(max_s * SR)
            chunks.append((s, e))
    return chunks, [(r["start"] / SR, r["end"] / SR) for r in regions]


def _drop_repetitions(words: list[Word]) -> list[Word]:
    """Remove Whisper's end-of-chunk hallucination loops ("Spring. Spring. Spring.")."""
    out: list[Word] = []
    for w in words:
        tok = w.w.strip(" .,!?").lower()
        if len(out) >= 2 and all(o.w.strip(" .,!?").lower() == tok for o in out[-2:]):
            continue
        if out and out[-1].w.strip(" .,!?").lower() == tok and tok.isalpha() and len(tok) > 3 \
                and w.t0 - out[-1].t1 < 0.05:
            continue
        out.append(w)
    return out


def transcribe(wav: Path, cfg: dict, progress=lambda pct: None) -> Transcript:
    import soundfile as sf
    from faster_whisper import WhisperModel

    audio, sr = sf.read(str(wav), dtype="float32", always_2d=True)
    audio = audio[:, 0]
    if sr != SR:
        import librosa

        audio = librosa.resample(audio, orig_sr=sr, target_sr=SR)

    d = cfg["deep"]
    # Half the cores: this often runs while the user is still speaking (Q&A), and the live
    # engine must keep real time.
    threads = max(1, (os.cpu_count() or 4) // 2)
    model = WhisperModel(str(models_dir() / d["whisper_model"]), device="cpu", compute_type=d["compute_type"],
                         cpu_threads=threads)
    chunks, regions = speech_chunks(audio, d["chunk_max_s"])
    words: list[Word] = []
    for i, (s, e) in enumerate(chunks):
        segs, _ = model.transcribe(
            audio[s:e], language="en", word_timestamps=True, vad_filter=False,
            initial_prompt=d["initial_prompt"], condition_on_previous_text=False, beam_size=5,
        )
        off = s / SR
        for seg in segs:
            for w in seg.words or []:
                words.append(Word(off + float(w.start), off + float(w.end), w.word.strip(), float(w.probability)))
        progress((i + 1) / max(len(chunks), 1))
    words = _drop_repetitions(words)
    text = " ".join(w.w for w in words)
    return Transcript(words, text, regions)
