"""What the speaker said, not how: rule-based content analysis (no language model).

Each part is scored 0-100 and comes with the evidence behind it, so feedback can quote it:
  relevance   - how many of the prompt's key ideas the talk covered
  evidence    - numbers, examples and sources backing the points
  directness  - hedges ("I think", "maybe", "kind of") per 100 words
  clarity     - sentence length (one idea per sentence)
  vocabulary  - word variety (moving-average type-token ratio) and over-used words
  takeaway    - a clear closing point or call to action
  qa          - whether Q&A answers stayed on the question, were long enough, and answered directly
"""

from __future__ import annotations

import re
from collections import Counter

from ..realtime.fillers import norm
from .questions import STAT
from .text import Sentence, content_tokens, stopwords, strip_fillers

PROMPT_WORDS = {  # instructions inside prompts, not their topic
    "describe", "explain", "argue", "persuade", "convince", "talk", "speech", "give", "tell", "share", "discuss",
    "present", "minute", "minutes", "audience", "classmates", "class", "someone", "something", "would", "could",
    "one", "two", "three", "why", "how", "what", "your", "you", "best", "make", "case", "pitch", "story",
}
EVIDENCE = re.compile(
    r"\b(for example|for instance|such as|according to|research|studies|a study|survey|data|statistic|statistics|"
    r"evidence|in fact|imagine|picture this|when i|last year|in \d{4}|percent|times more|times less)\b", re.IGNORECASE)
HEDGES = ["i think", "i guess", "i feel like", "maybe", "probably", "kind of", "sort of", "basically", "i mean",
          "just", "really", "very", "stuff", "things", "or something", "whatever", "i don't know"]
TAKEAWAY = re.compile(
    r"\b(in conclusion|to sum up|to summarize|remember|that's why|which is why|we should|you should|we need to|"
    r"let's|i urge|i encourage|the key|the takeaway|my point is|so next time|start by|try to)\b", re.IGNORECASE)
WEIGHTS = {"relevance": 0.25, "evidence": 0.20, "directness": 0.15, "clarity": 0.15, "vocabulary": 0.10,
           "takeaway": 0.05, "qa": 0.10}


def _stem(w: str) -> str:
    return w[:5]


def _clip(x: float) -> float:
    return max(0.0, min(1.0, x))


def relevance(prompt: str, text: str) -> tuple[float, dict] | None:
    terms = [t for t in dict.fromkeys(content_tokens(prompt)) if t not in PROMPT_WORDS]
    if not prompt.strip() or not terms:
        return None
    said = {_stem(t) for t in content_tokens(text)}
    covered = [t for t in terms if _stem(t) in said]
    missing = [t for t in terms if t not in covered]
    return _clip(len(covered) / len(terms) / 0.6), {"covered": covered, "missing": missing, "terms": terms}


def evidence(sents: list[Sentence], minutes: float) -> tuple[float, dict]:
    from .argument import HARD, clean, support_kinds

    hits, hard = [], False
    for s in sents:
        kinds = support_kinds(clean(s.text))
        number = bool(STAT.search(s.text) or re.search(r"\d", s.text))
        if kinds or number or EVIDENCE.search(s.text):
            hits.append(s.text)
            hard = hard or number or bool(set(kinds) & HARD)
    need = max(1.0, 1.5 * minutes)  # about one number, example, story or source every 40 s
    score = _clip(len(hits) / need)
    if not hard:
        score = min(score, 0.6)  # stories and examples alone show one case each: never full marks
    return score, {"count": len(hits), "hard": hard, "examples": [strip_fillers(h)[:90] for h in hits[:3]]}


def directness(text: str, n_words: int) -> tuple[float, dict]:
    low = " " + re.sub(r"[^\w' ]", " ", text.lower()) + " "
    counts = {h: len(re.findall(r"(?<=\s)" + re.escape(h) + r"(?=\s)", low)) for h in HEDGES}
    counts = {h: c for h, c in counts.items() if c}
    total = sum(counts.values())
    rate = 100 * total / max(n_words, 1)
    top = sorted(counts.items(), key=lambda kv: -kv[1])[:3]
    return _clip(1 - (rate - 2) / 8), {"total": total, "per100": round(rate, 1), "top": top}


def clarity(sents: list[Sentence]) -> tuple[float, dict] | None:
    lens = [len(strip_fillers(s.text).split()) for s in sents]
    lens = [n for n in lens if n > 0]
    if len(lens) < 2:
        return None
    avg = sum(lens) / len(lens)
    if 9 <= avg <= 20:
        score = 1.0
    elif avg < 9:
        score = _clip((avg - 4) / 5)
    else:
        score = _clip((35 - avg) / 15)
    longest = max(sents, key=lambda s: len(s.text.split()))
    return score, {"avgWords": round(avg, 1), "longCount": sum(1 for n in lens if n > 30),
                   "longest": strip_fillers(longest.text)[:120]}


def vocabulary(text: str, keyphrase_words: set[str]) -> tuple[float, dict] | None:
    toks = [t for t in (norm(x) for x in strip_fillers(text).split()) if t and t.isalpha()]
    if len(toks) < 40:
        return None
    win = 40
    mattr = sum(len(set(toks[i : i + win])) / win for i in range(len(toks) - win + 1)) / (len(toks) - win + 1)
    sw = stopwords()
    counts = Counter(t for t in toks if t not in sw and t not in keyphrase_words and len(t) > 2)
    overused = [(w, c) for w, c in counts.most_common(3) if c >= max(5, len(toks) // 40)]
    score = _clip((mattr - 0.5) / 0.22)
    if overused:
        score = min(score, 0.6)
    return score, {"mattr": round(mattr, 3), "overused": overused}


def takeaway(sents: list[Sentence], duration: float) -> tuple[float, dict] | None:
    if not sents:
        return None
    closing = [s for s in sents if s.t1 >= 0.8 * duration] or sents[-2:]
    hit = next((s.text for s in closing if TAKEAWAY.search(s.text)), None)
    return (1.0 if hit else 0.3), {"found": bool(hit), "sentence": strip_fillers(hit)[:100] if hit else ""}


def qa_quality(answers: list[dict]) -> tuple[float, dict] | None:
    """answers: [{question, text, durationSec, onTopic, mentioned, terms}]"""
    if not answers:
        return None
    rows = []
    for a in answers:
        words = len(strip_fillers(a.get("text", "")).split())
        long_enough = words >= 25 or a.get("durationSec", 0) >= 15
        first = re.split(r"[.!?]", a.get("text", ""), maxsplit=1)[0].lower()
        direct = any(_stem(t) in first for t in a.get("terms", [])) or not a.get("terms")
        s = 0.5 * bool(a.get("onTopic")) + 0.3 * long_enough + 0.2 * direct
        rows.append({"question": a["question"], "words": words, "onTopic": bool(a.get("onTopic")),
                     "longEnough": long_enough, "direct": direct, "score": round(100 * s)})
    return sum(r["score"] for r in rows) / len(rows) / 100, {"answers": rows}


def analyze(words, sents: list[Sentence], text: str, duration: float, prompt: str = "",
            answers: list[dict] | None = None, keyphrases: list[dict] | None = None) -> dict:
    n_words = len(strip_fillers(text).split())
    minutes = max(duration / 60, 0.25)
    kp_words = {w for k in (keyphrases or []) for w in k["phrase"].split()}
    parts: dict[str, tuple[float, dict] | None] = {
        "relevance": relevance(prompt, text),
        "evidence": evidence(sents, minutes) if n_words >= 15 else None,
        "directness": directness(text, n_words) if n_words >= 15 else None,
        "clarity": clarity(sents),
        "vocabulary": vocabulary(text, kp_words),
        "takeaway": takeaway(sents, duration) if n_words >= 30 else None,
        "qa": qa_quality(answers or []),
    }
    scored = {k: v for k, v in parts.items() if v is not None}
    den = sum(WEIGHTS[k] for k in scored)
    score = round(100 * sum(WEIGHTS[k] * v[0] for k, v in scored.items()) / den) if den else None
    return {
        "score": score,
        "prompt": prompt,
        "parts": {k: {"score": round(100 * v[0]), **v[1]} for k, v in scored.items()},
    }


# ---------------------------------------------------------------- feedback lines
def _q(words: list[str], n: int = 3) -> str:
    return ", ".join(f"“{w}”" for w in words[:n])


def tips(c: dict, minutes: float) -> list[dict]:
    """Growth items for the debrief: key, metric, severity (0-1), text, drill."""
    p = c["parts"]
    out = []

    def add(key: str, part: str, text: str, drill: str) -> None:
        out.append({"key": key, "metric": f"content_{part}", "severity": 0.9 * (1 - p[part]["score"] / 100),
                    "text": text, "t": None, "drill": drill})

    if "relevance" in p and p["relevance"]["score"] < 70:
        r = p["relevance"]
        add("CONTENT_RELEVANCE", "relevance",
            f"You covered {len(r['covered'])} of {len(r['terms'])} key ideas from the prompt. Bring in {_q(r['missing'])}.",
            "Before you start, pick the prompt's three key words and use each one in your talk.")
    if "evidence" in p and p["evidence"]["score"] < 70:
        n = p["evidence"]["count"]
        soft = n and not p["evidence"].get("hard", True)
        add("CONTENT_EVIDENCE", "evidence",
            f"You backed up your points {n} time{'s' if n != 1 else ''} in {max(1, round(minutes))} minute"
            f"{'s' if round(minutes) != 1 else ''}"
            + (", but only with stories or examples. Add a number or a source to show it holds generally."
               if soft else ". Give each main point a number, an example or a source."),
            "For each main point, prepare one fact and one quick real-life example.")
    if "directness" in p and p["directness"]["score"] < 70:
        top = ", ".join(f"“{h}” ×{c}" for h, c in p["directness"]["top"])
        add("CONTENT_DIRECTNESS", "directness",
            f"You hedged {p['directness']['total']} times ({top}). State your points directly.",
            "Re-record your opening without “I think”, “maybe” or “kind of”.")
    if "clarity" in p and p["clarity"]["score"] < 70:
        avg = p["clarity"]["avgWords"]
        text = (f"Your sentences averaged {avg} words. Split long ones so each sentence carries one idea."
                if avg > 20 else f"Your sentences averaged only {avg} words. Connect your ideas into full sentences.")
        add("CONTENT_CLARITY", "clarity", text, "Aim for one idea per sentence, about 10 to 20 words each.")
    if "vocabulary" in p and p["vocabulary"]["score"] < 70 and p["vocabulary"]["overused"]:
        w, n = p["vocabulary"]["overused"][0]
        add("CONTENT_VOCABULARY", "vocabulary", f"You said “{w}” {n} times. Vary your wording.",
            f"List three other ways to say “{w}” before your next run.")
    if "takeaway" in p and p["takeaway"]["score"] < 70:
        add("CONTENT_TAKEAWAY", "takeaway", "End with one clear takeaway your audience should remember.",
            "Write your last sentence first: what should they think or do after your talk?")
    if "qa" in p and p["qa"]["score"] < 70:
        bad = next((a for a in p["qa"]["answers"] if a["score"] < 70), p["qa"]["answers"][0])
        q = bad["question"] if len(bad["question"]) < 70 else bad["question"][:67] + "…"
        why = ("drifted off the topic" if not bad["onTopic"]
               else f"was very short ({bad['words']} words)" if not bad["longEnough"] else "didn't answer the question directly")
        add("CONTENT_QA", "qa", f"In Q&A, your answer to “{q}” {why}.",
            "Start each answer by repeating the question's key words, then give one reason and one example.")
    return sorted(out, key=lambda i: -i["severity"])


def strengths(c: dict) -> list[dict]:
    p, out = c["parts"], []
    if p.get("relevance", {}).get("score", 0) >= 85:
        out.append({"key": "OPEN_ON_PROMPT", "metric": "content_relevance", "severity": 0.9,
                    "text": "You stayed right on the prompt."})
    if p.get("evidence", {}).get("score", 0) >= 85:
        out.append({"key": "OPEN_EVIDENCE", "metric": "content_evidence", "severity": 0.85,
                    "text": f"You backed your points with examples or numbers ({p['evidence']['count']} times)."})
    if p.get("qa", {}).get("score", 0) >= 85:
        out.append({"key": "OPEN_QA", "metric": "content_qa", "severity": 0.8,
                    "text": "You answered your Q&A questions on topic and directly."})
    return out
