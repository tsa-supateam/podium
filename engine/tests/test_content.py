"""Content analysis, headline scores, and gaze zones in the speaker's calibrated frame."""

from podium_engine.deep import scoring
from podium_engine.nlp import content
from podium_engine.nlp.text import Sentence


def sents(*texts, dur=10.0):
    return [Sentence(0, 0, i * dur, (i + 1) * dur, t) for i, t in enumerate(texts)]


def test_relevance_counts_prompt_ideas_and_names_the_missing_ones():
    score, d = content.relevance("Should our school build a renewable microgrid? Argue for or against.",
                                 "Our school should build one because renewable power is cheap.")
    assert set(d["covered"]) == {"school", "build", "renewable"}
    assert d["missing"] == ["microgrid"]
    assert 0.9 < score <= 1.0  # 3 of 4 covered clears the 60% bar


def test_hedges_evidence_and_takeaway():
    s = sents("I think maybe this is kind of good, I think.", "For example, costs fell 90 percent in 2020.",
              "Our school uses a lot of power every single day of the year.",
              "That's why we should start a pilot project.")
    text = " ".join(x.text for x in s)
    c = content.analyze([], s, text, duration=30.0, prompt="")
    p = c["parts"]
    assert p["directness"]["top"][0] == ("i think", 2)
    assert p["evidence"]["count"] == 1
    assert p["takeaway"]["found"]
    assert "relevance" not in p and "qa" not in p  # no prompt, no Q&A: not scored


def test_qa_quality_rewards_direct_on_topic_answers():
    good = {"question": "What is the biggest risk of the microgrid?", "text": "The microgrid's biggest risk is cost. " * 6,
            "durationSec": 20, "onTopic": True, "terms": ["biggest", "risk", "microgrid"], "mentioned": ["microgrid"]}
    off = {**good, "text": "I like pizza.", "durationSec": 3, "onTopic": False}
    assert content.qa_quality([good])[0] == 1.0
    assert content.qa_quality([off])[0] < 0.3
    tip = content.tips({"parts": {"qa": {"score": 10, "answers": content.qa_quality([off])[1]["answers"]}}}, 2)[0]
    assert "drifted off the topic" in tip["text"]


def test_top_level_split_and_no_speech():
    t = scoring.top_level({"pacing": 80, "fillers": 60, "vocalVariety": 70, "eyeContact": 90}, 70, 50, 60)
    assert t["engagement"] == round((75 + 60) / 2)
    assert t["overall"] == round(0.35 * 70 + 0.25 * 50 + 0.40 * t["engagement"])
    silent = scoring.top_level({"pacing": 0, "fillers": 100, "vocalVariety": 0, "eyeContact": 58}, 40, 25, None, True)
    assert silent["content"] is None and silent["structure"] is None and silent["fillers"] is None


def test_weak_calibration_is_pushed_apart_and_boundaries_follow_it():
    # real calibration from 2026-10-20: left/right only 10 and 5 degrees from center
    cal = {"zoneModel": {"L": {"mu": [12.0, -6.7]}, "C": {"mu": [22.7, -5.9]}, "R": {"mu": [27.6, -6.5]},
                         "N": {"mu": [0, -25]}}}
    c = scoring.zone_centers(cal)
    assert c["R"][0] == 32.7 and c["L"][0] == 12.0
    b = scoring.zone_boundaries(c)
    assert b == {"leftCenter": 17.4, "centerRight": 27.7, "down": -15.4}
