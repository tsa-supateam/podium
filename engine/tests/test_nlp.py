from podium_engine.nlp import questions
from podium_engine.nlp.text import Sentence, noun_phrases


def test_noun_phrases_do_not_cross_punctuation():
    nps = noun_phrases("The first reason is cost. Battery storage cost has fallen.")
    assert "battery storage cost" in nps
    assert not any("cost battery" in p for p in nps)


def test_question_templates_from_sentence_types():
    sents = [
        Sentence(0, 10, 0.0, 5.0, "Battery storage cost has fallen by 90% in the last decade."),
        Sentence(11, 20, 5.0, 9.0, "I recommend that we start a pilot project next spring."),
        Sentence(21, 30, 9.0, 13.0, "Our school should build a microgrid because blackouts cost money."),
    ]
    kps = [{"phrase": "microgrid", "score": 0.9, "count": 1, "firstT": 9.0},
           {"phrase": "pilot project", "score": 0.6, "count": 1, "firstT": 5.0}]
    qs = questions.generate(sents, kps, k=6)
    kinds = {q["kind"] for q in qs}
    assert {"statistic", "proposal", "causal"} <= kinds
    assert any('"90%"' in q["question"] for q in qs)
    assert len({q["question"] for q in qs}) == len(qs)
