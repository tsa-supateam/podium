"""Instant follow-up questions and on-topic checks for the Q&A round.

Questions must be ready within seconds of the speech ending, long before Whisper finishes, so
they are built from the live Vosk transcript (telemetry/words.ndjson). It has no punctuation,
but sentences can still be split at pauses, and the keyphrase and template rules work on
plain lowercase text.
"""

from __future__ import annotations

from pathlib import Path

from ..realtime.pace import Word
from ..storage import read_ndjson
from . import keyphrases, questions
from .text import content_tokens, sentences

# Always offered, so there is something to answer even after a very short or unclear speech.
GENERAL = [
    {"kind": "general", "question": "What is the single most important thing you want your audience to remember?"},
    {"kind": "general", "question": "What is the strongest objection to your argument, and how would you answer it?"},
    {"kind": "general", "question": "If you had one more minute, what would you add?"},
]

# Words that come from the question templates themselves, not from the speaker's topic.
TEMPLATE_WORDS = {
    "evidence", "supports", "support", "point", "figure", "come", "recent", "data", "risk", "biggest",
    "implementing", "reduce", "confident", "cause", "effect", "link", "described", "explain", "someone",
    "new", "topic", "briefly", "mentioned", "expand", "compare", "compared", "account", "trade-offs",
    "anything", "other", "could", "single", "important", "thing", "want", "audience", "remember",
    "strongest", "objection", "argument", "answer", "minute", "add", "would", "one", "more",
}


def quick_questions(session_dir: Path, k: int = 5) -> list[dict]:
    rows = read_ndjson(session_dir / "telemetry" / "words.ndjson")
    words = [Word(r["t0"], r["t1"], r["w"], r.get("p", 1.0)) for r in rows]
    out: list[dict] = []
    if len(words) >= 15:
        sents = sentences(words)  # no punctuation from Vosk: split on pauses > 1.2 s
        text = " ".join(w.w for w in words)
        kps = keyphrases.extract(text, words)
        out = [q for q in questions.generate(sents, kps, k=k, punctuated=False) if q["kind"] != "general"]
    for g in GENERAL:
        if len(out) >= k:
            break
        out.append({**g, "t": None, "score": 0.0, "source": ""})
    return out[:k]


def _stem(w: str) -> str:
    return w[:5]


def topic_coverage(question: str, answer_text: str) -> dict:
    """Which of the question's topic words the answer actually used (5-letter stems, so plurals match)."""
    terms = [t for t in dict.fromkeys(content_tokens(question)) if t not in TEMPLATE_WORDS]
    said = {_stem(t) for t in content_tokens(answer_text)}
    hit = [t for t in terms if _stem(t) in said]
    return {
        "question": question,
        "terms": terms,
        "mentioned": hit,
        "onTopic": bool(hit) or not terms,
    }
