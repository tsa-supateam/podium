"""Transcript utilities: bundled NLTK data, sentences with timings, POS tags, noun phrases."""

from __future__ import annotations

import re
from dataclasses import dataclass
from functools import lru_cache

from ..paths import models_dir
from ..realtime.fillers import norm
from ..realtime.pace import Word


@lru_cache(maxsize=1)
def nltk_ready():
    import nltk

    path = str(models_dir() / "nltk_data")
    if path not in nltk.data.path:
        nltk.data.path.insert(0, path)
    return nltk


@lru_cache(maxsize=1)
def stopwords() -> frozenset[str]:
    nltk = nltk_ready()
    from nltk.corpus import stopwords as sw

    try:
        words = set(sw.words("english"))
    except LookupError:
        words = set()
    del nltk
    return frozenset(words | {"um", "uh", "umm", "uhh", "like", "yeah", "okay", "gonna", "really", "just", "lot",
                              "thing", "things", "kind", "sort", "know", "mean", "basically", "actually", "today",
                              "going", "want", "think", "everyone", "morning"})


@dataclass
class Sentence:
    i0: int          # first word index
    i1: int          # last word index (inclusive)
    t0: float
    t1: float
    text: str


def sentences(words: list[Word]) -> list[Sentence]:
    out: list[Sentence] = []
    start = 0
    for i, w in enumerate(words):
        end_punct = bool(re.search(r"[.!?]$", w.w))
        long_gap = i + 1 < len(words) and words[i + 1].t0 - w.t1 > 1.2
        if end_punct or long_gap or i == len(words) - 1:
            seg = words[start : i + 1]
            if seg:
                out.append(Sentence(start, i, seg[0].t0, seg[-1].t1, " ".join(x.w for x in seg)))
            start = i + 1
    return out


def pos_tag(tokens: list[str]) -> list[tuple[str, str]]:
    nltk = nltk_ready()
    try:
        return nltk.pos_tag(tokens)
    except LookupError:
        return [(t, "NN") for t in tokens]


_FILLER_RE = re.compile(r"\b(u+m+|u+h+|e+r+m*|a+h+|h+m+)\b[,.]?\s*", re.IGNORECASE)


def strip_fillers(text: str) -> str:
    return re.sub(r"\s+", " ", _FILLER_RE.sub("", text)).strip()


def noun_phrases(text: str) -> list[str]:
    """Regex chunker NP: {<JJ.*|NN.*>*<NN.*>} over NLTK POS tags, never crossing punctuation."""
    sw = stopwords()
    phrases: list[str] = []
    for clause in re.split(r"[.,;:!?()\"]+", strip_fillers(text)):
        toks = re.findall(r"[A-Za-z][A-Za-z'\-]*|\d+(?:\.\d+)?%?", clause)
        if not toks:
            continue
        tags = pos_tag(toks)
        cur: list[tuple[str, str]] = []
        for tok, tag in tags + [("", ".")]:
            if (tag.startswith("NN") or tag.startswith("JJ")) and tok.lower() not in sw and not tok.isdigit():
                cur.append((tok, tag))
            else:
                while cur and not cur[-1][1].startswith("NN"):
                    cur.pop()
                if cur and (len(cur) > 1 or len(cur[0][0]) > 3):
                    phrases.append(" ".join(t for t, _ in cur[-4:]).lower())
                cur = []
    return phrases


def content_tokens(text: str) -> list[str]:
    sw = stopwords()
    return [t for t in (norm(x) for x in text.split()) if t and t not in sw and not t.isdigit() and len(t) > 2]
