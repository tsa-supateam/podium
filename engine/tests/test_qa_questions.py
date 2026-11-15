"""Q&A questions come from the analyzed speech once its analysis is done."""

import json

from podium_engine.nlp.quick import quick_questions

WORDS = ("Schools should allow AI tools for homework. The first reason is that students learn modern skills. "
         "The second reason is that teachers save time grading. Some studies show forty percent of students "
         "already use these tools. In conclusion, schools should teach students to use AI well.").split()


def _write(d, summary):
    words = [{"t0": i * 0.4, "t1": i * 0.4 + 0.3, "w": w} for i, w in enumerate(WORDS)]
    (d / "transcript.json").write_text(json.dumps({"words": words, "text": " ".join(WORDS)}))
    (d / "summary.json").write_text(json.dumps(summary))


def test_questions_target_what_the_analysis_found(tmp_path):
    _write(tmp_path, {
        "keyphrases": [{"phrase": "ai tools", "score": 0.8, "count": 2, "firstT": 1.0, "times": [1.0]}],
        "overview": {"persuasive": True, "counterargument": False,
                     "points": [{"text": "students learn modern skills", "t": 4.0, "support": []},
                                {"text": "teachers save time grading", "t": 8.0, "support": ["stat"]}]},
        "content": {"parts": {"relevance": {"missing": ["homework"]}}},
    })
    qs = quick_questions(tmp_path, k=5)
    texts = [q["question"] for q in qs]
    assert len(qs) == 5
    assert texts[0] == "You said “students learn modern skills”. What evidence backs that up?"
    assert not any("teachers save time" in t for t in texts)  # that point had support
    assert any(q["kind"] == "counter" for q in qs)


def test_falls_back_to_live_words_before_analysis(tmp_path):
    (tmp_path / "telemetry").mkdir()
    qs = quick_questions(tmp_path, k=3)
    assert len(qs) == 3 and all(q["kind"] == "general" for q in qs)
