"""Follow-up questions and on-topic checks for the Q&A round.

The Q&A round starts once the speech is analyzed, so questions come from the accurate Whisper
transcript and from what the analysis found in the content: points left unsupported, prompt ideas
never covered, a missing answer to the other side. Sessions without an analysis yet (or older
ones) fall back to the live transcript in telemetry/words.ndjson.
"""

from __future__ import annotations

import json
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
    "strongest", "objection", "argument", "answer", "minute", "add", "would", "one", "more", "position",
    "backs", "examples", "case", "number", "source", "shows", "true", "broadly", "prompt", "connect", "said",
}


def _load(p: Path) -> dict | None:
    return json.loads(p.read_text(), parse_constant=lambda _: None) if p.exists() else None


# Generated questions that quote something concrete from the speech (a figure, a proposal). Others
# (cause-and-effect, comparison, "explain X", "you briefly mentioned X") fill a template with a
# noun phrase and too often read as nonsense ("Could anything other than students explain the
# homework?"), so a finished analysis leaves them out.
ANCHORED = {"statistic", "proposal"}


def _content_questions(summary: dict) -> list[dict]:
    """Questions about the speaker's own argument, quoting it, most useful first."""
    out: list[dict] = []
    o = summary.get("overview") or {}
    parts = (summary.get("content") or {}).get("parts", {})
    points = o.get("points", [])
    for p in [p for p in points if not p.get("support")][:2]:
        out.append({"kind": "claim", "question": f"You said “{p['text']}”. What evidence backs that up?", "t": p["t"]})
    if o.get("thesis"):
        out.append({"kind": "thesis", "t": o["thesis"]["t"],
                    "question": f"Your main claim was “{o['thesis']['text']}”. What is your single strongest reason for it?"})
    if o.get("persuasive") and not o.get("counterargument"):
        out.append({"kind": "counter", "t": None,
                    "question": "What is the strongest argument against your position, and how would you answer it?"})
    for p in [p for p in points if p.get("support")][:1]:
        out.append({"kind": "commentary", "question": f"You said “{p['text']}”. Why does that matter to your audience?",
                    "t": p["t"]})
    ev = parts.get("evidence")
    if ev and ev.get("count") and ev.get("hard") is False:
        out.append({"kind": "statistic", "t": None, "question": "Your examples each show one case. What number or source "
                    "shows this is true more broadly?"})
    return [{**q, "score": 1.0, "source": ""} for q in out]


def analyzed_questions(session_dir: Path, k: int) -> list[dict] | None:
    """Questions from the finished analysis, or None if the speech isn't analyzed yet."""
    tr = _load(session_dir / "transcript.json")
    summary = _load(session_dir / "summary.json")
    if not tr or not summary or summary.get("noSpeech"):
        return None
    words = [Word(w["t0"], w["t1"], w["w"], w.get("p", 1.0)) for w in tr["words"]]
    out = _content_questions(summary)
    if len(words) >= 15:
        seen = {q["question"] for q in out}
        gen = questions.generate(sentences(words), summary.get("keyphrases") or [], k=k, punctuated=True)
        out += [q for q in gen if q["kind"] in ANCHORED and q["question"] not in seen]
    return out


def quick_questions(session_dir: Path, k: int = 5) -> list[dict]:
    out = analyzed_questions(session_dir, k)
    if out is not None:
        for g in GENERAL:
            if len(out) >= k:
                break
            out.append({**g, "t": None, "score": 0.0, "source": ""})
        return out[:k]
    tel = session_dir / "telemetry"
    rows = read_ndjson(tel / "words.ndjson")
    # Live Whisper words are punctuated; older sessions (and a failed live model) only have Vosk.
    punctuated = any(r.get("src") == "whisper-live" for r in rows)
    if not punctuated:
        rows = rows or read_ndjson(tel / "vosk.ndjson")
    words = [Word(r["t0"], r["t1"], r["w"], r.get("p", 1.0)) for r in rows]
    out: list[dict] = []
    if len(words) >= 15:
        sents = sentences(words)  # without punctuation, sentences split on pauses > 1.2 s
        text = " ".join(w.w for w in words)
        kps = keyphrases.extract(text, words)
        out = [q for q in questions.generate(sents, kps, k=k, punctuated=punctuated) if q["kind"] != "general"]
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
