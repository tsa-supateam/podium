"""Keyphrase extraction (spec §4.5.2).

Candidates are noun phrases from the NLTK chunker (so we never return verb
fragments like "talk about renewable"). Each is scored by:
  * TF-IDF against a reference corpus of 60 public-domain speeches: a word that is
    frequent here but rare in speeches generally is topical;
  * YAKE, an unsupervised single-document keyword extractor;
  * how often the phrase is repeated.
"""

from __future__ import annotations

import json
import re
from collections import Counter
from functools import lru_cache

from ..paths import models_dir
from ..realtime.pace import Word
from .text import content_tokens, noun_phrases, stopwords, strip_fillers

GENERIC = {"reason", "reasons", "way", "time", "people", "part", "point", "idea", "today", "year", "years",
           "lot", "number", "first", "second", "third", "everyone", "good", "morning", "afternoon", "thanks"}


@lru_cache(maxsize=1)
def reference_idf() -> tuple[dict[str, float], float]:
    p = models_dir() / "idf_reference.json"
    if not p.exists():
        return {}, 4.0
    d = json.loads(p.read_text())
    return d["idf"], d["default"]


def idf_of(term: str) -> float:
    idf, default = reference_idf()
    return idf.get(term.lower(), default)


def is_rare(phrase: str) -> bool:
    """True when the phrase's head noun almost never appears in the reference speeches."""
    _, default = reference_idf()
    head = phrase.split()[-1]
    return idf_of(head) >= default - 0.5


def extract(text: str, words: list[Word], top: int = 10) -> list[dict]:
    import yake

    clean = strip_fillers(text)
    if len(clean.split()) < 8:
        return []
    toks = content_tokens(clean)
    tf = Counter(toks)
    n = max(len(toks), 1)
    tfidf = {t: (c / n) * idf_of(t) for t, c in tf.items()}
    max_tfidf = max(tfidf.values(), default=1.0)

    yk = yake.KeywordExtractor(lan="en", n=2, top=30, dedupLim=0.8, stopwords=set(stopwords())).extract_keywords(clean)
    yake_rank = {k.lower(): 1 - i / max(len(yk), 1) for i, (k, _) in enumerate(yk)}

    nps = noun_phrases(clean)
    np_count = Counter(nps)
    sw = stopwords()
    cands: dict[str, float] = {}
    for np_, cnt in np_count.items():
        parts = [w for w in np_.split() if w not in sw]
        if not parts or parts[-1] in GENERIC or all(w in GENERIC for w in parts):
            continue
        np_ = " ".join(parts)
        t_score = sum(tfidf.get(w, 0.0) for w in parts) / len(parts) / max_tfidf
        y_score = max((r for k, r in yake_rank.items() if k in np_ or np_ in k), default=0.0)
        f_score = min(1.0, cnt / 3)
        cands[np_] = max(cands.get(np_, 0.0),
                         (0.5 * t_score + 0.35 * y_score + 0.15 * f_score) * (1 + 0.1 * (len(parts) - 1)))

    lw = [re.sub(r"[^\w%'-]", "", w.w.lower()) for w in words]
    out: list[dict] = []
    for p, s in sorted(cands.items(), key=lambda kv: -kv[1]):
        if any(p == o["phrase"] or (p in o["phrase"].split()) for o in out):
            continue
        parts = p.split()
        hits = [i for i in range(len(lw) - len(parts) + 1) if lw[i : i + len(parts)] == parts]
        if not hits:  # plural/singular mismatch
            hits = [i for i, w in enumerate(lw) if w.rstrip("s") == parts[-1].rstrip("s")]
        out.append({"phrase": p, "score": round(min(1.0, s), 3), "count": len(hits),
                    "firstT": round(words[hits[0]].t0, 2) if hits else None,
                    "times": [round(words[i].t0, 2) for i in hits[:10]]})
        if len(out) >= top:
            break
    return out
