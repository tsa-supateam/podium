"""Rule-based follow-up question generator (spec §4.5.2). No language model involved.

1. Type each sentence with lexical/POS rules (claim, statistic, causal, comparison, proposal).
2. Fill a question template with the sentence's most important noun phrase.
3. Add "under-explained" and "definition gap" questions from keyphrase statistics.
4. Rank by keyphrase weight × template prior, then pick a diverse set with MMR.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from .keyphrases import is_rare
from .text import Sentence, noun_phrases, pos_tag, strip_fillers

CLAIM = re.compile(r"\b(should|must|need to|have to|will|always|never|best|worst|most important|clearly|obviously)\b", re.IGNORECASE)
CAUSAL = re.compile(r"\b(because|leads? to|caus(es|ed|ing)|results? in|therefore|due to|so that|which means|that means)\b", re.IGNORECASE)
COMPARE = re.compile(r"\b(than|versus|vs\.?|compared (to|with)|unlike|better|worse|cheaper|faster|more \w+ than)\b", re.IGNORECASE)
PROPOSAL = re.compile(r"\b(i (recommend|propose|suggest)|we (propose|recommend|should)|my (solution|proposal|plan)|our (solution|plan))\b", re.IGNORECASE)
STAT = re.compile(r"(\d+(?:\.\d+)?\s?%|\b\d[\d,.]*\s+(percent|million|billion|thousand|years?|dollars|people|times)\b|"
                  r"\b(half|twice|double|triple|ninety|eighty|seventy|sixty|fifty|forty|thirty|twenty|ten)\s+(percent|times)\b)", re.IGNORECASE)

PRIOR = {"statistic": 1.0, "proposal": 0.95, "causal": 0.9, "claim": 0.85, "comparison": 0.8,
         "under_explained": 0.7, "definition": 0.65}


@dataclass
class Candidate:
    kind: str
    text: str
    t: float | None
    score: float
    source: str

    def as_dict(self) -> dict:
        return {"kind": self.kind, "question": self.text, "t": self.t, "score": round(self.score, 3),
                "source": self.source}


# Casual words that a noun-phrase tagger mistakes for topics ("the kinda", "the stuff").
CASUAL = {"kinda", "sorta", "gonna", "wanna", "gotta", "stuff", "thing", "things", "bro", "okay", "yeah", "guys", "lot"}


def topical(np_: str | None) -> bool:
    return bool(np_) and not any(w in CASUAL for w in np_.split())


def the(np_: str) -> str:
    """Add an article so templates read naturally: "pilot project" -> "the pilot project"."""
    first = np_.split()[0]
    if first in {"the", "a", "an", "this", "that", "these", "those", "our", "your", "my"} or np_.endswith("s") or "'s" in np_:
        return np_
    return "the " + np_


def _best_np(text: str, keyphrases: list[dict]) -> str | None:
    nps = [p for p in noun_phrases(text) if topical(p)]
    if not nps:
        return None
    weights = {k["phrase"]: k["score"] for k in keyphrases}

    def w(np_: str) -> float:
        direct = weights.get(np_, 0.0)
        partial = max((s for p, s in weights.items() if p in np_ or np_ in p), default=0.0)
        return max(direct, 0.7 * partial) + 0.02 * len(np_.split())

    return max(nps, key=w)


def _kp_weight(text: str, keyphrases: list[dict]) -> float:
    low = text.lower()
    return max((k["score"] for k in keyphrases if k["phrase"] in low), default=0.2)


def _clause_np(clause: str) -> str | None:
    nps = noun_phrases(clause)
    return nps[-1] if nps else None


def _sentence_candidates(s: Sentence, keyphrases: list[dict], punctuated: bool = True) -> list[Candidate]:
    text = strip_fillers(s.text)
    if len(text.split()) < 5:
        return []
    out: list[Candidate] = []
    kw = _kp_weight(text, keyphrases)
    np_ = _best_np(text, keyphrases)

    def add(kind: str, q: str) -> None:
        out.append(Candidate(kind, q, round(s.t0, 2), 0.6 * kw + 0.4 * PRIOR[kind], text))

    if m := STAT.search(text):
        # "90 percent" -> "90%", but keep spelled-out numbers ("ninety percent") as words
        fig = re.sub(r"(\d)\s*(percent|%)", r"\1%", m.group(0)).strip()
        subject = np_ or "that"
        add("statistic", f"Where does the figure \"{fig}\" for {the(subject) if np_ else subject} come from, and how recent is that data?")
    if PROPOSAL.search(text) and np_:
        add("proposal", f"What is the biggest risk in implementing {the(np_)}, and how would you reduce it?")
    if (m := CAUSAL.search(text)) and np_:
        before, after = text[: m.start()], text[m.end() :]
        cause = _clause_np(after) if m.group(0).lower() in {"because", "due to"} else _clause_np(before)
        effect = _clause_np(before) if m.group(0).lower() in {"because", "due to"} else _clause_np(after)
        # Only name both sides when they are real topics of the talk; on unpunctuated live
        # transcripts the clause split is unreliable and produces nonsense pairs.
        topical = lambda np_: any(k["phrase"] in np_ or np_ in k["phrase"] for k in keyphrases)  # noqa: E731
        if punctuated and cause and effect and cause != effect and topical(cause) and topical(effect):
            add("causal", f"Could anything other than {the(cause)} explain {the(effect)}?")
        else:
            add("causal", f"How confident are you in the cause-and-effect link you described for {the(np_)}?")
    if COMPARE.search(text):
        nps = [p for p in noun_phrases(text) if topical(p)]
        if len(nps) >= 2 and nps[0] != nps[1]:
            add("comparison", f"How does {the(nps[0])} compare with {the(nps[1])} once you account for cost and trade-offs?")
    if CLAIM.search(text) and np_ and not PROPOSAL.search(text):
        add("claim", f"What evidence best supports your point about {the(np_)}?")
    return out


def _mmr(cands: list[Candidate], k: int, lam: float = 0.7) -> list[Candidate]:
    if len(cands) <= k:
        return sorted(cands, key=lambda c: -c.score)
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.metrics.pairwise import cosine_similarity

    vecs = TfidfVectorizer().fit_transform([c.text + " " + c.source for c in cands])
    sim = cosine_similarity(vecs)
    chosen: list[int] = []
    rest = list(range(len(cands)))
    while rest and len(chosen) < k:
        def mmr(i: int) -> float:
            red = max((sim[i, j] for j in chosen), default=0.0)
            kind_pen = 0.15 if any(cands[j].kind == cands[i].kind for j in chosen) else 0.0
            return lam * cands[i].score - (1 - lam) * red - kind_pen
        best = max(rest, key=mmr)
        chosen.append(best)
        rest.remove(best)
    return [cands[i] for i in chosen]


def generate(sents: list[Sentence], keyphrases: list[dict], k: int = 6, punctuated: bool = True) -> list[dict]:
    """`punctuated=False` for live (Vosk) transcripts: clause-level templates fall back to safe wording."""
    cands: list[Candidate] = []
    for s in sents:
        cands.extend(_sentence_candidates(s, keyphrases, punctuated))
    full = " ".join(strip_fillers(s.text) for s in sents).lower()
    for kp in keyphrases[:8]:
        p = kp["phrase"]
        if not topical(p):
            continue
        if kp.get("count", 0) <= 1 and kp["score"] >= 0.3:
            cands.append(Candidate("under_explained", f"You briefly mentioned {the(p)}. Can you expand on that?",
                                   kp.get("firstT"), 0.6 * kp["score"] + 0.4 * PRIOR["under_explained"], p))
        defined = re.search(re.escape(p) + r"\s+(is|are|means|refers to)\b", full)
        if is_rare(p) and not defined:
            cands.append(Candidate("definition", f"How would you explain {the(p) if not p.endswith('s') else p} to someone who is new to the topic?",
                                   kp.get("firstT"), 0.6 * kp["score"] + 0.4 * PRIOR["definition"], p))
    # de-duplicate identical question text
    seen: dict[str, Candidate] = {}
    for c in cands:
        if c.text not in seen or c.score > seen[c.text].score:
            seen[c.text] = c
    picked = _mmr(list(seen.values()), k)
    if not picked:
        picked = [Candidate("general", "What is the single most important thing you want your audience to remember?",
                            None, 0.5, "")]
    return [c.as_dict() for c in picked]


__all__ = ["generate", "pos_tag"]
