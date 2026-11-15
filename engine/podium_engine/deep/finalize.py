"""Turn a speech's measurements into its report: content, scores, tips and spoken debrief.

Runs twice for a speech with a Q&A round:
  1. at the end of the speech's own analysis (answers usually not ready yet), and
  2. from `combine()` once every Q&A answer is analyzed, so the speech and its answers become
     one report: content covers both transcripts, delivery scores are averaged over both by
     duration, and Q&A quality is part of the content score.

The speech-only measurements are kept in summary_speech.json so combining never double-counts.
"""

from __future__ import annotations

import json
from pathlib import Path

from .. import config as cfgmod
from .. import tts
from ..nlp import argument, debrief
from ..nlp import content as content_mod
from ..nlp.text import sentences
from ..realtime.pace import Word
from ..storage import Index, write_json
from . import scoring

DELIVERY = ("pacing", "fillers", "vocalVariety", "eyeContact")


def _load(p: Path) -> dict | None:
    return json.loads(p.read_text(), parse_constant=lambda _: None) if p.exists() else None


def answer_inputs(meta: dict) -> list[dict]:
    """Analyzed Q&A answers linked to a speech, as content-analysis inputs."""
    from ..storage import session_path

    out = []
    for a in meta.get("answers", []):
        d = session_path(a["sessionId"])
        s, tr = _load(d / "summary.json"), _load(d / "transcript.json")
        if not s or not tr:
            continue
        qa = s.get("qa") or {}
        out.append({"sessionId": a["sessionId"], "question": a.get("question", ""), "text": tr.get("text", ""),
                    "durationSec": s.get("durationSec", 0), "onTopic": qa.get("onTopic", False),
                    "mentioned": qa.get("mentioned", []), "terms": qa.get("terms", []),
                    "scores": s.get("scores", {}), "wpm": (s.get("pacing") or {}).get("meanWpm", 0),
                    "fillers": (s.get("fillers") or {}).get("total", 0),
                    "fillerTokens": (s.get("fillers") or {}).get("byToken", {}), "noSpeech": s.get("noSpeech", False),
                    "content": s.get("content"), "overview": s.get("overview"), "debrief": s.get("debrief") or {}})
    return out


def _weighted(parts: list[tuple[float, float | None]]) -> int | None:
    """Duration-weighted mean of (weight, value) pairs, skipping missing values."""
    num = sum(w * v for w, v in parts if v is not None)
    den = sum(w for w, v in parts if v is not None)
    return round(num / den) if den else None


def finalize(session_dir: Path, base: dict, words: list[Word], meta: dict, answers: list[dict],
             cfg: dict | None = None, with_tts: bool = True) -> dict:
    cfg = cfg or cfgmod.load()
    summary = json.loads(json.dumps(base))  # deep copy: base stays speech-only
    sents = sentences(words)
    text = " ".join(w.w for w in words)
    duration = base["durationSec"]
    is_answer = meta.get("mode") == "qa"
    practice = meta.get("difficulty", "coach") == "coach"
    prompt = meta.get("question", "") if is_answer else meta.get("prompt", "")
    usable = [a for a in answers if not a["noSpeech"]]

    # content: the speech plus what was said in Q&A
    full_text = " ".join([text] + [a["text"] for a in usable])
    c = content_mod.analyze(words, sents, full_text, duration + sum(a["durationSec"] for a in usable),
                            prompt=prompt, answers=usable, keyphrases=base.get("keyphrases"))
    summary["content"] = c
    # plain-language Structure / Evidence / Commentary read of the speech (Q&A answers add evidence)
    summary["overview"] = argument.overview(
        sents, duration, prompt, base.get("keyphrases"), answers=[a["text"] for a in usable], practice=practice)

    # delivery: speech and answers together, weighted by how long each lasted
    sc = base["scores"]
    delivery = {k: _weighted([(duration, sc.get(k))] + [(a["durationSec"], a["scores"].get(k)) for a in usable])
                for k in DELIVERY}
    if usable:
        f = summary["fillers"]
        f["total"] = f["total"] + sum(a["fillers"] for a in usable)
        for a in usable:
            for tok, n in a["fillerTokens"].items():
                f["byToken"][tok] = f["byToken"].get(tok, 0) + n
        total_min = (duration + sum(a["durationSec"] for a in usable)) / 60
        f["perMinute"] = round(f["total"] / max(total_min, 1e-6), 2)
        delivery["fillers"] = scoring.score_fillers(f["perMinute"])
        summary["qaRound"] = [
            {"sessionId": a["sessionId"], "question": a["question"], "onTopic": a["onTopic"],
             "mentioned": a["mentioned"], "durationSec": a["durationSec"], "wpm": a["wpm"], "fillers": a["fillers"],
             "words": len(a["text"].split()),
             # the answer's own report, analyzed the same way as the speech
             "scores": a["scores"], "content": a["content"],
             "dimensions": (a["overview"] or {}).get("dimensions"),
             "strengths": [x["text"] for x in a["debrief"].get("strengths", [])],
             "tips": [x["text"] for x in a["debrief"].get("growth", [])]} for a in answers]
    mean_e = [(duration, (base.get("engagement") or {}).get("meanE"))] + [
        (a["durationSec"], a["scores"].get("audienceE")) for a in usable]
    structure = sc.get("structure")
    if practice and structure is not None:
        structure = round(40 + 0.6 * structure)  # practice: a missing hook or ending costs less
    scores = scoring.top_level(delivery, c["score"], structure, _weighted(mean_e), base.get("noSpeech", False))
    scores["audienceE"] = (base.get("engagement") or {}).get("meanE")
    summary["scores"] = scores

    # tips: delivery + content, one spoken debrief
    def keyphrase_at(t: float) -> str | None:
        best = None
        for k in base.get("keyphrases", []):
            for kt in k.get("times", []):
                if t - 2 <= kt <= t + 12 and (best is None or abs(kt - t) < best[0]):
                    best = (abs(kt - t), k["phrase"])
        return best[1] if best else None

    minutes = max(duration / 60, 0.25)
    if base.get("noSpeech"):
        deb = debrief.no_speech(summary)
    else:
        # the Overview's Evidence and Structure ratings already explain these, every run
        covered = {"CONTENT_EVIDENCE", "GROW_CONCLUSION"} if summary["overview"] else set()
        deb = debrief.build(summary, keyphrase_at, extra_growth=content_mod.tips(c, minutes), skip=covered,
                            extra_strengths=content_mod.strengths(c))
    summary["debrief"] = deb
    (session_dir / "debrief.txt").write_text(deb["text"] + "\n")
    if with_tts and not is_answer and tts.available():
        try:
            tts.synthesize_many([(deb["text"], session_dir / "debrief.wav")])
            summary["debriefAudio"] = "debrief.wav"
        except Exception as e:  # noqa: BLE001
            summary["debriefAudioError"] = str(e)
    return summary


def combine(session_dir: Path, cfg: dict | None = None, with_tts: bool = True) -> dict | None:
    """Re-finalize a speech once all its Q&A answers are analyzed. Returns None if not ready yet."""
    meta = _load(session_dir / "session.json") or {}
    linked = meta.get("answers", [])
    base = _load(session_dir / "summary_speech.json")
    tr = _load(session_dir / "transcript.json")
    if not linked or not base or not tr:
        return None
    answers = answer_inputs(meta)
    if len(answers) < len(linked):
        return None  # an answer is still being analyzed
    words = [Word(w["t0"], w["t1"], w["w"], w.get("p", 1.0)) for w in tr["words"]]
    summary = finalize(session_dir, base, words, meta, answers, cfg, with_tts)
    summary["analysisSec"] = (_load(session_dir / "summary.json") or {}).get("analysisSec")
    write_json(session_dir / "summary.json", summary)
    Index().upsert(meta, summary["scores"])
    return summary
