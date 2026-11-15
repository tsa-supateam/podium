"""A plain-language read of the speaker's argument (rule-based, no language model).

Reads the whole transcript to find the main claim, the points the speaker signposted, the
support behind each point and the reasoning that ties it together, then scores three things
from 1 to 5 and explains each score in a few sentences:

  structure   - claim stated early, signposted points, a conclusion, an ending that ties back
  evidence    - what backs each point. Stories, examples and hypotheticals count, but each shows
                one case, so evidence made only of them tops out at 3/5. 4-5 needs a statistic
                or a named source (and 5 needs every point supported).
  commentary  - whether the speaker explains how the evidence proves the point, explains each
                point, says why it matters, and answers the other side.
"""

from __future__ import annotations

import re

from .questions import STAT
from .text import Sentence, content_tokens, strip_fillers

ORDINALS = ["first", "second", "third", "fourth", "fifth", "sixth"]
COUNT_WORDS = ["no", "one", "two", "three", "four", "five", "six"]

PERSUASIVE_PROMPT = re.compile(r"\b(argue|argument|resolved|persuade|convince|should|for or against|pitch|debate|"
                               r"agree|disagree|side)\b", re.IGNORECASE)
STANCE = re.compile(r"\b(should|shouldn't|should not|must|need to|needs to|ought to|have to|has to|is better|are better|"
                    r"is the best|is worse|deserves?|i (?:strongly |really |truly )?believe|i argue|i'd argue|"
                    r"i would argue|my position|i'm (?:for|against)|i am (?:for|against)|i support|i oppose)\b",
                    re.IGNORECASE)
POINT_PHRASE = re.compile(
    r"\b(?:the |my |a |one |an )?(first|second|third|fourth|fifth|next|other|another|last|final|main|biggest|"
    r"most important|key)\s+(?:big\s+)?(reasons?|points?|arguments?|benefits?|advantages?|things?|ways?|problems?|"
    r"issues?|ideas?|factors?|steps?|parts?)\b", re.IGNORECASE)
POINT_START = re.compile(r"^(?:and |so |now |okay |ok )?(first(?:ly)?|second(?:ly)?|third(?:ly)?|finally|lastly|"
                         r"additionally|furthermore|moreover|on top of that|to start|to begin)\b,?\s*", re.IGNORECASE)
CONCLUSION = re.compile(r"\b(in conclusion|to conclude|to summarize|in summary|to sum up|overall|all in all|"
                        r"that's why|that is why|which is why|so remember|in the end|the bottom line)\b", re.IGNORECASE)
COUNTER = re.compile(r"\b(some (?:people )?(?:say|argue|might say|may say|think|believe|claim)|critics|opponents|"
                     r"on the other hand|you might (?:think|say|be thinking)|people might say|admittedly|"
                     r"the other side|counter ?argument|an objection|the downside|even though some|"
                     r"i know (?:that )?(?:some|many))\b", re.IGNORECASE)

SUPPORT = {  # kind -> pattern; STAT is checked separately
    "source": re.compile(r"\b(according to|research|researchers|a study|studies|survey|surveys|data|report(?:ed|s)?|"
                         r"experts?|scientists|published|university of|statistics)\b", re.IGNORECASE),
    "story": re.compile(r"\b(i have a friend|a friend of mine|my (?:own )?(?:friend|best friend|brother|sister|mom|mother|"
                        r"dad|father|parents|family|cousin|uncle|aunt|grandma|grandmother|grandpa|grandfather|teacher|"
                        r"coach|neighbou?r|classmate)|when i was|i remember|one time|last (?:year|summer|week|month)|"
                        r"i once|i've seen|i have seen|i know (?:someone|somebody|a guy|a girl|people|some people)|"
                        r"in my experience|personally,? i)\b", re.IGNORECASE),
    "example": re.compile(r"\b(for example|for instance|such as|take .{1,25} for example|a good example)\b", re.IGNORECASE),
    "hypothetical": re.compile(r"\b(imagine|picture this|picture yourself|what if|suppose|let's say|let us say|"
                               r"pretend|think about if|if you were)\b", re.IGNORECASE),
}
KIND_NAME = {"stat": "a statistic", "source": "a source", "story": "a personal story", "example": "an example",
             "hypothetical": "a hypothetical"}
KIND_NOUN = {"stat": "statistic", "source": "source", "story": "story", "example": "example",
             "hypothetical": "hypothetical"}
KIND_PLURAL = {"stat": "statistics", "source": "sources", "story": "personal stories", "example": "examples",
               "hypothetical": "hypotheticals"}
HARD = {"stat", "source"}  # shows a point holds beyond one person or one imagined case

# reasoning that explains evidence or a point: "this shows", "which means", "if he hadn't…"
LINK = re.compile(
    r"\b(this shows|that shows|which shows|this proves|that proves|this means|that means|which means|"
    r"that's why|that is why|which is why|this is why|so that|therefore|as a result|because of (?:this|that)|"
    r"in other words|the point is|this matters|that matters|it matters|that's important|this is important|"
    r"leads? to|which leads|gives? (?:you|them|us|people|students)|allows?|helps?|lets? (?:you|them|us)|"
    r"(?:if|without) (?:he|she|they|you|we|i|it|this|that|a|an|the)\b.{0,30}?\b(?:didn't|hadn't|had not|did not|"
    r"wasn't|weren't|couldn't|wouldn't|won't|never|might not|would not|could not))\b", re.IGNORECASE)
IMPACT = re.compile(r"\b(this matters|that matters|it matters|why (?:this|it) matters|which means|this means|that means|"
                    r"in the long run|in the long term|for the rest of|the result is|leads? to|ends up|"
                    r"that's huge|significant|costs? (?:you|them|us)|saves? (?:you|them|us)|future)\b", re.IGNORECASE)
REBUT = re.compile(r"\b(but|however|yet|actually|that's not|that isn't|isn't true|doesn't hold|the truth is|"
                   r"in reality|even so|still)\b", re.IGNORECASE)

_DISCOURSE = re.compile(r"(?:(?<=^)|(?<=[\s,]))(?:like|you know|i mean|basically|yeah|okay|ok|so|well|and so|um+|uh+)"
                        r",\s*", re.IGNORECASE)
_LEAD = re.compile(r"^(?:(?:so|well|and|but|now|okay|ok|yeah|alright|also)\b[, ]*)+", re.IGNORECASE)
_I_THINK = re.compile(r"^i (?:really |strongly |truly )?(?:think|believe|feel|would argue|'d argue|argue|am arguing|"
                      r"am going to argue|will argue)(?: that)?\s+", re.IGNORECASE)


def clean(text: str) -> str:
    t = strip_fillers(text)
    t = re.sub(r"\.\.\.|…", " ", t)
    for _ in range(2):
        t = _DISCOURSE.sub("", t)
    t = re.sub(r"\s+,", ",", re.sub(r"\s+", " ", t)).strip(" ,")
    return t


def _clip(phrase: str, max_words: int = 14) -> str:
    phrase = _LEAD.sub("", phrase.strip())
    phrase = re.split(r"[.!?;]|,\s*which\b|,\s*so\b|\s+because\b|,\s*but\b|\s+but\b", phrase, maxsplit=1)[0]
    words = phrase.split()
    out = " ".join(words[:max_words]).strip(" ,:-")
    if len(words) > max_words:
        out += "…"
    return out[:1].lower() + out[1:] if out[:2] not in ("I ", "I'") else out


def _first_person(phrase: str) -> bool:
    return bool(re.search(r"\b(i|me|my|i'm|i've|we|our|us)\b", phrase, re.IGNORECASE))


def _list(items: list[str]) -> str:
    if len(items) <= 1:
        return "".join(items)
    return ", ".join(items[:-1]) + " and " + items[-1]


def _ord(i: int) -> str:
    return ORDINALS[i] if i < len(ORDINALS) else f"#{i + 1}"


def _count(n: int) -> str:
    return COUNT_WORDS[n] if n < len(COUNT_WORDS) else str(n)


# ---------------------------------------------------------------- claim and points
def find_thesis(sents: list[Sentence], duration: float) -> tuple[str, float] | None:
    early = [s for s in sents if s.t0 <= max(0.3 * duration, 15)][:6]
    for s in early:
        t = clean(s.text)
        if not STANCE.search(t) or POINT_PHRASE.search(t):
            continue
        t = _I_THINK.sub("", _LEAD.sub("", t))
        claim = _clip(t, 18)
        if len(claim.split()) >= 3:
            return claim, s.t0
    return None


def _idea_after(rest: str, after_noun: bool = True) -> str:
    """The idea in what follows a signpost: 'reason (why you should X) is that Y' -> Y.
    After a bare 'First,' (after_noun=False) the rest is already the idea."""
    m = re.search(r"\b(?:is|was|would be|are)\s+(?:that|because|how)?\b\s*", rest) if after_noun else None
    if m and len(rest[: m.start()].split()) <= 12:
        rest = rest[m.end():]
    rest = re.sub(r"^\s*(?:is|are|was|that|why|where|because|:|,|-)\s*", "", rest)
    return _clip(_LEAD.sub("", rest).strip(" ,:"))


def find_points(sents: list[Sentence]) -> list[dict]:
    points: list[dict] = []
    for i, s in enumerate(sents):
        raw = s.text
        nxt = sents[i + 1].text if i + 1 < len(sents) else ""
        if re.search(r"(\.\.\.|…)\s*$", raw) and nxt:  # "you can..." / "Explore the world": one thought
            raw = raw + " " + (nxt if nxt[:2] in ("I ", "I'") else nxt[:1].lower() + nxt[1:])
        t = clean(raw)
        if SUPPORT["example"].match(t):
            continue
        m = POINT_PHRASE.search(t)
        # "the main reason is…" names a point; "the main thing" in passing does not
        if m and (m.group(1).lower() not in ("main", "key", "biggest", "most important")
                  or re.search(r"\b(?:is|was)\b", t[m.end():m.end() + 80])):
            idea, sign = _idea_after(t[m.end():]), m.group(0)
        elif (m2 := POINT_START.match(_LEAD.sub("", t))):
            idea, sign = _idea_after(_LEAD.sub("", t)[m2.end():], after_noun=False), m2.group(1)
            if CONCLUSION.search(t):
                continue
        else:
            continue
        if len(idea.split()) < 2 and nxt:  # "Here's my first reason." -> the idea is the next sentence
            idea = _clip(_LEAD.sub("", clean(nxt)))
        if len(idea.split()) >= 2:
            points.append({"text": idea, "t": round(s.t0, 2), "i": i, "signpost": sign.strip().lower()})
    return points


# ---------------------------------------------------------------- support and reasoning
def support_kinds(text: str) -> list[str]:
    kinds = []
    if STAT.search(text) or re.search(r"\b\d+\s+(?:out of|in)\s+\d+\b", text):
        kinds.append("stat")
    kinds += [k for k, rx in SUPPORT.items() if rx.search(text)]
    if "story" in kinds and "example" in kinds:
        kinds.remove("example")  # "for example, my brother…" is a story
    return kinds


def _support(sents: list[Sentence]) -> list[dict]:
    out = []
    for j, s in enumerate(sents):
        t = clean(s.text)
        for k in support_kinds(t):
            out.append({"kind": k, "t": round(s.t0, 2), "j": j, "quote": _clip(t, 12)})
    return out


def _stems(text: str) -> set[str]:
    return {t[:5] for t in content_tokens(text) if len(t) > 3}


def _answer_sents(answers: list[str]) -> list[Sentence]:
    return [Sentence(0, 0, 0.0, 0.0, p.strip()) for a in answers for p in re.split(r"(?<=[.!?])\s+", a or "")
            if p.strip()]


def _sentence(parts: list[str]) -> str:
    s = _list(parts) + "."
    return s[0].upper() + s[1:]


# ---------------------------------------------------------------- the three dimensions
def _structure(thesis, points, concluded: bool, tied: bool, persuasive: bool, practice: bool = False) -> dict:
    position = "position" if persuasive else "main idea"
    what = "reasons" if persuasive else "points"
    n = len(points)
    raw = 1 + bool(thesis) + (1 if n >= 2 else 0.5 if n == 1 else 0) + concluded + (concluded and tied)
    score = min(5, int(raw + 0.5) + practice)  # practice: one step more generous

    good, fix = [], []
    if thesis:
        good.append(f"you stated your {position} up front (“{thesis[0]}”)")
    else:
        fix.append(f"You never put your overall {position} into one sentence. Open with it, so the audience knows "
                   f"what you're about to {'argue' if persuasive else 'explain'}.")
    if n >= 2:
        signs = _list([f"“{p['signpost']}”" for p in points[:3]])
        good.append(f"you signposted {_count(n)} separate {what} ({signs}), which made it easy to follow")
    else:
        fix.append(("Only one point was clearly signposted, and the rest ran together. " if n == 1 else
                    f"Your ideas weren't split into clearly separate {what}. ")
                   + "Label each one (“First…”, “Second…”) so listeners can keep track.")
    if concluded and tied:
        good.append(f"you closed by bringing it back to your {position}")
    elif concluded:
        good.append("you signalled a conclusion")
        fix.append(f"Your ending didn't come back to your {position}. Restate it in your last sentence.")
    else:
        fix.append(f"The talk stopped without a conclusion. Finish by restating your {position}"
                   + (f" and your {_count(n)} {what}" if n >= 2 else "") + " in one or two sentences.")
    # practice: one thing to fix at a time
    return {"score": score, "feedback": ([_sentence(good)] if good else []) + fix[: 1 if practice else 2]}


def _evidence(points: list[dict], support: list[dict], qa_support: list[dict], n_words: int) -> dict:
    kinds = list(dict.fromkeys(x["kind"] for x in support))
    all_kinds = set(kinds) | {x["kind"] for x in qa_support}
    hard = bool(all_kinds & HARD)
    bare = [i for i, p in enumerate(points) if not p["support"]]
    every = bool(points) and not bare
    pieces = len({x["j"] for x in support})

    if not support and not qa_support:
        score = 1
    elif not hard:  # stories, examples, hypotheticals: one case each, so at most 3
        if all_kinds == {"hypothetical"}:
            score = 2
        elif points:
            score = 3 if every else 2
        else:
            score = 3 if pieces >= 2 else 2
    else:
        score = 5 if pieces >= 2 and (every or (not points and pieces >= 3)) else 4
    if score >= 3 and pieces + len(qa_support) < max(2, n_words // 250):
        score -= 1  # one piece of support is thin for a long talk, whatever kind it is

    text = []
    if support:
        names = [KIND_PLURAL[k] if sum(x["kind"] == k for x in support) > 1 else KIND_NAME[k] for k in kinds]
        text.append(f"You backed your points with {_list(names)} (“{support[0]['quote']}”).")
    else:
        text.append("Your speech didn't back up its points with any statistics, sources, examples or stories.")
    if bare and len(bare) < len(points):
        i = bare[0]
        also = f" (nor did your {_list([_ord(b) for b in bare[1:]])})" if len(bare) > 1 else ""
        text.append(f"Your {_ord(i)} point (“{points[i]['text']}”) had nothing behind it{also}, so it rests on "
                    f"your word alone. Give it its own example or fact.")
    elif points and not support:
        text.append("Give each point one specific example and, where you can, a number or a source.")
    if qa_support:
        qk = list(dict.fromkeys(x["kind"] for x in qa_support))
        text.append(f"In Q&A you added {_list([KIND_NAME[k] for k in qk])} (“{qa_support[0]['quote']}”). "
                    f"Put it in the speech itself next time.")
    if (support or qa_support) and not hard:
        if all_kinds == {"hypothetical"}:
            text.append("Hypotheticals help the audience picture it, but they're imagined, not shown. Add a real "
                        "example, then a statistic or a credible source to score higher.")
        else:
            text.append("Stories and examples make a point relatable, but each is a single case, so they can't show "
                        "it holds generally. Add a statistic or a credible source to reach 4 or 5.")
    elif hard and score < 5:
        text.append("Your hard evidence gave the argument real weight. Back every point with something concrete "
                    "to reach 5.")
    elif hard:
        text.append("Mixing facts with examples like this is what makes an argument convincing.")
    return {"score": max(1, score), "feedback": text}


def _commentary(sents: list[Sentence], points: list[dict], support: list[dict], persuasive: bool,
                claim_stems: set[str]) -> dict:
    texts = [clean(s.text) for s in sents]
    bounds = [p["i"] for p in points] + [len(sents)]
    section_end = {j: b for a, b in zip([0] + bounds, bounds) for j in range(a, b)}

    def explains(k: int, after: int) -> bool:
        t = texts[k]
        return bool(LINK.search(t)) or (k > after and bool(claim_stems & _stems(t))
                                         and bool(re.match(r"(?:so|and so|that's|this|which)\b", t, re.I)))

    # evidence is "linked" when it, or a sentence soon after it (before the next point), explains it
    linked, unlinked = [], []
    for x in {x["j"]: x for x in support}.values():
        j = x["j"]
        k = next((k for k in range(j, min(section_end.get(j, len(sents)), j + 5)) if explains(k, j)), None)
        (linked if k is not None else unlinked).append((x, texts[k] if k is not None else None))
    explained = [any(LINK.search(texts[k]) or re.search(r"\bbecause\b", texts[k], re.I) for k in range(p["i"], end))
                 for p, end in zip(points, bounds[1:])]
    reasons = any(LINK.search(t) or re.search(r"\bbecause\b", t, re.I) for t in texts)
    impact = any(IMPACT.search(t) for t in texts)
    rebut = any(COUNTER.search(t) and (REBUT.search(t) or (k + 1 < len(texts) and REBUT.search(texts[k + 1])))
                for k, t in enumerate(texts))
    all_linked = bool(linked) and not unlinked
    all_explained = bool(points) and all(explained)

    score = 1
    if reasons:
        score = 2
        if linked or (points and sum(explained) >= max(1, len(points) / 2)):
            score = 3
            if all_linked and (all_explained or not points) and impact:
                score = 4
                if rebut or not persuasive:
                    score = 5

    text = []
    if linked:
        x, expl = linked[0]
        text.append(f"After your {KIND_NOUN[x['kind']]}, you explained what it showed (“{_clip(expl, 16)}”). "
                    f"That's what turns evidence into an argument.")
    if unlinked:
        x, _ = unlinked[0]
        text.append(f"After “{x['quote']}”, you moved on without saying how it proves your point. Follow each piece "
                    f"of evidence with a line like “This shows that…”.")
    bare = [i for i, e in enumerate(explained) if not e]
    if bare:
        i = bare[0]
        text.append(f"Your {_ord(i)} point (“{points[i]['text']}”) was stated but not explained. Say why it's true "
                    f"and what follows from it.")
    elif all_explained and not linked:
        text.append("You explained the reasoning behind each point.")
    if not reasons:
        text.append("Most of the talk stated things without explaining them. Use “because” and “this means” to "
                    "tie each idea back to your main claim.")
    elif not impact:
        text.append("Push one step further and say why it matters: what does your audience gain or lose?")
    if persuasive:
        text.append("You also took on the other side and explained why it doesn't hold, which is the strongest kind "
                    "of commentary." if rebut else
                    "You didn't respond to the other side. Name the strongest objection and explain why it doesn't "
                    "change your conclusion.")
    return {"score": score, "feedback": text[:4]}


# ---------------------------------------------------------------- the overview
def overview(sents: list[Sentence], duration: float, prompt: str = "", keyphrases: list[dict] | None = None,
             answers: list[str] | None = None, practice: bool = False) -> dict | None:
    """answers: transcripts of the Q&A answers, read for extra evidence. practice: gentler structure read."""
    n_words = sum(len(strip_fillers(s.text).split()) for s in sents)
    if n_words < 40:
        return None
    thesis = find_thesis(sents, duration)
    points = find_points(sents)
    persuasive = bool(PERSUASIVE_PROMPT.search(prompt)) or bool(thesis)

    bounds = [p["i"] for p in points] + [len(sents)]
    for p, end in zip(points, bounds[1:]):
        p["support"] = sorted({x["kind"] for x in _support(sents[p["i"]:end])})
    support = _support(sents)
    qa_support = _support(_answer_sents(answers or []))
    claim_stems = _stems(thesis[0]) if thesis else set()

    closing = [s for s in sents if s.t1 >= 0.85 * duration] or sents[-1:]
    concluded = any(CONCLUSION.search(clean(s.text)) for s in closing)
    tied = any(claim_stems & _stems(clean(s.text)) for s in closing) if claim_stems else concluded
    countered = bool(COUNTER.search(clean(" ".join(s.text for s in sents))))

    # one sentence on what was argued
    n = len(points)
    lead = ""
    if thesis:
        lead = f"Your main claim was “{thesis[0]}”" if _first_person(thesis[0]) else f"You argued that {thesis[0]}"
    what = "reasons" if persuasive else "points"
    if n >= 2:
        ideas = _list([f"“{p['text']}”" for p in points[:4]])
        summary = f"{lead}, with {_count(n)} main {what}: {ideas}." if lead else f"You made {_count(n)} main {what}: {ideas}."
    elif n == 1:
        summary = (f"{lead}. " if lead else "") + f"Your one clearly signposted point was “{points[0]['text']}”."
    else:
        topics = [k["phrase"] for k in sorted((keyphrases or [])[:3], key=lambda k: k.get("firstT") or 0)]
        summary = (f"{lead}. " if lead else "") + (f"Your talk centered on {_list(topics)}." if topics
                                                   else "Your talk didn't settle on one clear claim.")

    dims = {
        "structure": _structure(thesis, points, concluded, tied, persuasive, practice),
        "evidence": _evidence(points, support, qa_support, n_words),
        "commentary": _commentary(sents, points, support, persuasive, claim_stems),
    }
    strip = lambda xs: [{k: v for k, v in x.items() if k != "j"} for x in xs]  # noqa: E731
    return {
        "summary": summary,
        "dimensions": dims,
        "text": " ".join([summary] + [line for d in dims.values() for line in d["feedback"]]),
        "thesis": {"text": thesis[0], "t": round(thesis[1], 2)} if thesis else None,
        "points": [{"text": p["text"], "t": p["t"], "support": p["support"]} for p in points],
        "support": strip(support[:8]),
        "qaSupport": strip(qa_support[:4]),
        "concluded": concluded,
        "counterargument": countered,
        "persuasive": persuasive,
    }
