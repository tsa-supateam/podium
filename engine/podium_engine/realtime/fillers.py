"""Filler-word detection shared by the real-time and deep engines (spec §4.1.3).

Three detectors:
  * lexical rules over recognized words ("like", "you know", "so" ...)
  * Vosk sound-alike rule: the small Vosk model has no "um"/"uh" in its
    vocabulary, so it emits a short function word ("on", "all", "owe") with an
    unusually long duration and a flat pitch. We catch those.
  * acoustic filled-pause detector (FPD): a long, flat-pitched, spectrally
    stable voiced stretch, which is what "uhhh" looks like.
"""

from __future__ import annotations

import math
import re
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field

from .pace import Word

_PUNCT = re.compile(r"[^\w'\-]+")

LIKE_GRAMMATICAL_PREV = {
    "would", "feel", "feels", "felt", "look", "looks", "looked", "sound", "sounds", "sounded",
    "seem", "seems", "i", "you", "we", "they", "he", "she", "just", "don't", "didn't", "really",
    "more", "most", "not", "also", "things", "something", "anything", "nothing", "it's", "was", "is",
}
LIKE_GRAMMATICAL_NEXT = {"a", "an", "the", "this", "that", "to", "it", "these", "those", "him", "her", "them", "me", "us"}
YOU_KNOW_GRAMMATICAL_NEXT = {"that", "what", "how", "why", "the", "who", "where", "when", "if", "about"}
MULTIWORD = [("you", "know"), ("i", "mean"), ("kind", "of"), ("sort", "of")]


def norm(token: str) -> str:
    return _PUNCT.sub("", token.lower()).strip("-")


@dataclass
class FillerEvent:
    t0: float
    t1: float
    token: str
    cls: str           # "filled_pause" | "lexical"
    conf: float
    src: str           # "fpd" | "vosk" | "lex" | "whisper"

    def as_dict(self) -> dict:
        return {"t0": round(self.t0, 3), "t1": round(self.t1, 3), "token": self.token,
                "class": self.cls, "conf": round(self.conf, 3), "src": self.src}


def _gap_before(words: Sequence[Word], i: int) -> float:
    return words[i].t0 - words[i - 1].t1 if i > 0 else 10.0


def _gap_after(words: Sequence[Word], i: int) -> float:
    return words[i + 1].t0 - words[i].t1 if i + 1 < len(words) else 10.0


def lexical_fillers(words: Sequence[Word], lexicon: Sequence[str], src: str = "lex",
                    sentence_starts: set[int] | None = None) -> list[FillerEvent]:
    """Context rules that separate filler "like"/"so"/"you know" from grammatical uses."""
    toks = [norm(w.w) for w in words]
    starts = sentence_starts or set()
    lex = set(lexicon)
    out: list[FillerEvent] = []
    skip = -1
    for i, tok in enumerate(toks):
        if i <= skip:
            continue
        prev_tok = toks[i - 1] if i > 0 else ""
        next_tok = toks[i + 1] if i + 1 < len(toks) else ""
        # Whisper's punctuation is a strong prosodic cue: "Like, you know, ..." / "So, ..."
        comma_after = words[i].w.rstrip().endswith(",")
        comma_before = i > 0 and words[i - 1].w.rstrip().endswith((",", ".", "?", "!"))
        pause_before = _gap_before(words, i) >= 0.15 or i in starts or comma_before
        pause_after = _gap_after(words, i) >= 0.15 or comma_after

        pair = (tok, next_tok)
        if pair in MULTIWORD and " ".join(pair) in lex:
            phrase = " ".join(pair)
            nxt2 = toks[i + 2] if i + 2 < len(toks) else ""
            ok = True
            if pair == ("you", "know"):
                ok = (nxt2 not in YOU_KNOW_GRAMMATICAL_NEXT or words[i + 1].w.rstrip().endswith(",")
                      or (comma_before and prev_tok in {"like", "so", "um", "uh", "and", "but"}))
                ok = ok and prev_tok not in {"do", "don't", "did", "didn't", "if", "you", "to", "i", "we", "they"}
                # (pair-level comma cue computed above for the first word)
            elif pair in {("kind", "of"), ("sort", "of")}:
                ok = prev_tok not in {"a", "the", "what", "this", "that", "every", "any", "some", "one"}
            elif pair == ("i", "mean"):
                ok = nxt2 not in {"that", "it", "to", "what"} or pause_before
            if ok:
                out.append(FillerEvent(words[i].t0, words[i + 1].t1, phrase, "lexical", 0.6, src))
                skip = i + 1
            continue

        if tok == "like" and "like" in lex:
            if (prev_tok in LIKE_GRAMMATICAL_PREV or next_tok in LIKE_GRAMMATICAL_NEXT) and not comma_after:
                continue
            if pause_before or pause_after or i in starts:
                out.append(FillerEvent(words[i].t0, words[i].t1, "like", "lexical", 0.65, src))
        elif tok == "so" and "so" in lex:
            if (i in starts or _gap_before(words, i) >= 0.4 or comma_before) and (_gap_after(words, i) >= 0.2 or comma_after):
                out.append(FillerEvent(words[i].t0, words[i].t1, "so", "lexical", 0.5, src))
        elif tok in {"basically", "literally", "actually"} and tok in lex:
            if pause_before or i in starts:
                out.append(FillerEvent(words[i].t0, words[i].t1, tok, "lexical", 0.45, src))
        elif tok == "right" and "right" in lex:
            if pause_after and i + 1 < len(toks) and _gap_after(words, i) >= 0.5 and prev_tok not in {"the", "is", "all", "that's"}:
                out.append(FillerEvent(words[i].t0, words[i].t1, "right", "lexical", 0.4, src))
    return out


def filled_pause_tokens(words: Sequence[Word], filled: Sequence[str], src: str) -> list[FillerEvent]:
    """Words that ARE filled pauses (Whisper writes "Umm," / "uh")."""
    fp = set(filled)
    out = []
    for w in words:
        tok = norm(w.w)
        if tok in fp or re.fullmatch(r"u+m+|u+h+|e+r+m*|a+h+|h+m+|m+", tok or "x"):
            out.append(FillerEvent(w.t0, w.t1, tok, "filled_pause", max(0.7, w.p), src))
    return out


def vosk_soundalikes(words: Sequence[Word], soundalikes: Sequence[str], min_dur: float,
                     pitch_std: Callable[[float, float], float | None]) -> list[FillerEvent]:
    """Long, flat-pitched short words that Vosk produced in place of an 'um'/'uh'."""
    sa = set(soundalikes)
    out = []
    for i, w in enumerate(words):
        tok = norm(w.w)
        if tok not in sa:
            continue
        dur = w.t1 - w.t0
        if dur < min_dur:
            continue
        sd = pitch_std(w.t0, w.t1)
        flat = sd is not None and sd < 1.2
        low_conf = w.p < 0.8
        pause_adj = _gap_before(words, i) >= 0.2 or _gap_after(words, i) >= 0.2
        score = 0.35 + 0.25 * flat + 0.2 * low_conf + 0.15 * pause_adj + 0.1 * (dur >= 0.4)
        if score >= 0.6:
            label = "um" if tok in {"on", "i'm", "um", "and", "an"} else "uh"
            out.append(FillerEvent(w.t0, w.t1, label, "filled_pause", min(score, 0.95), "vosk"))
    return out


@dataclass
class FilledPauseDetector:
    """Streaming acoustic detector fed one prosody frame at a time."""

    min_dur: float
    max_dur: float
    max_st_std: float
    _run: list[tuple[float, float, float]] = field(default_factory=list)  # (t, semitone, flux)
    _flux_hist: list[float] = field(default_factory=list)

    def push(self, t: float, f0: float, flux: float) -> FillerEvent | None:
        if f0 > 0:
            self._flux_hist.append(flux)
            if len(self._flux_hist) > 500:
                self._flux_hist = self._flux_hist[-500:]
            st = 12 * math.log2(f0 / 100.0)
            # A pitch jump > 1.5 st breaks the run (a new syllable started).
            if self._run and abs(st - self._run[-1][1]) > 1.5:
                ev = self._close()
                self._run = [(t, st, flux)]
                return ev
            self._run.append((t, st, flux))
            return None
        return self._close()

    def _close(self) -> FillerEvent | None:
        run, self._run = self._run, []
        if len(run) < 3:
            return None
        t0, t1 = run[0][0], run[-1][0]
        dur = t1 - t0
        if not (self.min_dur <= dur <= self.max_dur):
            return None
        sts = [r[1] for r in run]
        mean = sum(sts) / len(sts)
        sd = math.sqrt(sum((s - mean) ** 2 for s in sts) / len(sts))
        fluxes = sorted(self._flux_hist)
        p30 = fluxes[int(0.3 * (len(fluxes) - 1))] if fluxes else 1.0
        mean_flux = sum(r[2] for r in run) / len(run)
        if sd > self.max_st_std or mean_flux > max(p30, 1e-6) * 1.2:
            return None
        conf = min(0.9, 0.5 + 0.4 * (1 - sd / self.max_st_std) * min(1.0, dur / 0.6))
        return FillerEvent(t0, t1, "uh", "filled_pause", conf, "fpd")


def merge_events(events: list[FillerEvent], window: float) -> list[FillerEvent]:
    """Union detections from several sources; overlapping or near-identical ones become one."""
    events = sorted(events, key=lambda e: e.t0)
    merged: list[FillerEvent] = []
    for e in events:
        same = merged and (e.cls == "filled_pause" == merged[-1].cls or e.token == merged[-1].token)
        gap = window if same else 0.0
        if merged and e.t0 - merged[-1].t1 <= gap:
            m = merged[-1]
            better = e if e.conf > m.conf else m
            merged[-1] = FillerEvent(min(m.t0, e.t0), max(m.t1, e.t1), better.token, m.cls,
                                     max(m.conf, e.conf), f"{m.src}+{e.src}" if e.src not in m.src else m.src)
        else:
            merged.append(e)
    return merged
