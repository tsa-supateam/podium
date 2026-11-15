"""Overview: Structure / Evidence / Commentary scored 1-5 with plain-language feedback."""

from podium_engine.nlp import argument, content
from podium_engine.nlp.text import Sentence


def sents(*texts, dur=6.0):
    return [Sentence(i, i, i * dur, (i + 1) * dur, t) for i, t in enumerate(texts)]


def scores(o):
    return {k: d["score"] for k, d in o["dimensions"].items()}


def said(o, dim):
    return " ".join(o["dimensions"][dim]["feedback"])


GAP_YEAR = sents(
    "So I think that everybody should have a gap year.",
    "This is because when you come out of high school, a lot of the time you don't really know what you want to do.",
    "So the first reason why you should take a gap year is that you can...",
    "Explore the world, which is something that you might not have a chance to do later in your life.",
    "Yeah, so, like, uh, I have a friend, and he took a gap year.",
    "And he went to, like, Sweden and, uh, Norway.",
    "And if he didn't take a gap year, he might not have been able to do those things later in his life.",
    "The other reason that you should take a gap year is that you might not be sure what you want to do in your career yet.",
    "So taking a gap year gives you more time to explore those things about yourself.",
)
GAP_PROMPT = "Resolved: Everyone should have a gap year. Argue one side."


def test_gap_year_speech():
    o = argument.overview(GAP_YEAR, duration=54.0, prompt=GAP_PROMPT)
    assert o["summary"] == ("You argued that everybody should have a gap year, with two main reasons: "
                            "“you can explore the world” and “you might not be sure what you want to do in your "
                            "career yet”.")
    assert scores(o) == {"structure": 3, "evidence": 2, "commentary": 3}
    assert "“the first reason” and “the other reason”" in said(o, "structure")
    assert "without a conclusion" in said(o, "structure")
    assert "personal story" in said(o, "evidence") and "Your second point" in said(o, "evidence")
    assert "reach 4 or 5" in said(o, "evidence")
    assert "he didn't take a gap year" in said(o, "commentary")  # the story was tied back to the claim
    assert "other side" in said(o, "commentary")


def test_strong_speech_scores_five_across_the_board():
    s = sents(
        "Our school should switch to a four day week.",
        "First, it saves money.",
        "According to a 2021 study, districts saved 5 percent of their budget.",
        "That means more money for teachers and books.",
        "Second, students are better rested.",
        "For example, attendance rose by 20 percent in Colorado schools.",
        "This shows that rested students actually show up.",
        "Some people say a longer day is tiring, but the data shows grades held steady.",
        "In conclusion, a four day week saves money and helps students, so our school should try it.",
    )
    o = argument.overview(s, duration=54.0, prompt="Persuade your school board of one change.")
    assert [p["text"] for p in o["points"]] == ["it saves money", "students are better rested"]
    assert scores(o) == {"structure": 5, "evidence": 5, "commentary": 5}


def test_stories_alone_never_score_above_three_on_evidence():
    s = sents(
        "Every student should learn to cook before they graduate.",
        "The first reason is that cooking saves money.",
        "My brother learned to cook last year and stopped buying takeout every night.",
        "That's why he can afford his own car now.",
        "The second reason is that it keeps you healthy.",
        "I remember my friend lost weight once she started cooking her own meals at home.",
        "This shows how much control cooking gives you over your health.",
        "In conclusion, every student should learn to cook, because it saves money and keeps you healthy.",
    )
    o = argument.overview(s, duration=48.0, prompt="Argue for one life skill every student should learn.")
    assert all(p["support"] == ["story"] for p in o["points"])  # every point has a story behind it
    assert scores(o)["evidence"] == 3
    assert "reach 4 or 5" in said(o, "evidence")
    assert scores(o)["structure"] == 5


def test_hypotheticals_only_score_two_and_are_called_out():
    s = sents(
        "We need to ban phones in class because they distract everyone around you all the time.",
        "Imagine you are trying to focus on a test and the person next to you is scrolling.",
        "Picture this, a teacher explaining something important while half the room looks down.",
        "What if every class had a phone basket by the door at the start of every period.",
    )
    o = argument.overview(s, duration=24.0, prompt="Argue for or against phones in school.")
    assert scores(o)["evidence"] == 2
    assert "imagined, not shown" in said(o, "evidence")


def test_qa_answers_add_evidence_and_are_mentioned():
    o = argument.overview(GAP_YEAR, duration=54.0, prompt=GAP_PROMPT,
                          answers=["My own brother studied computer science and went straight to college."])
    assert "In Q&A you added a personal story" in said(o, "evidence")


def test_no_signposts_falls_back_to_topics():
    flat = sents(
        "Bees are amazing insects and they make honey from the nectar of many flowers every summer day.",
        "The hive works together and the queen lays eggs while workers gather food for everyone.",
        "Honey lasts a very long time and people have eaten it for thousands of years around the world.",
    )
    kp = [{"phrase": "honey", "firstT": 1.0}, {"phrase": "hive", "firstT": 7.0}]
    o = argument.overview(flat, duration=18.0, prompt="Explain a process from nature.", keyphrases=kp)
    assert o["points"] == [] and not o["persuasive"]
    assert o["summary"] == "Your talk centered on honey and hive."
    assert scores(o)["structure"] == 1 and "clearly separate points" in said(o, "structure")


def test_signpost_in_next_sentence():
    s = sents(
        "Today I want to explain how bees make honey for their whole colony every summer.",
        "Here's my first point.",
        "Bees collect nectar from thousands of flowers every single day of the season.",
        "My second point is that they store it in wax cells and fan it dry with their wings.",
    )
    o = argument.overview(s, duration=24.0, prompt="Explain a process from nature.")
    assert o["points"][0]["text"].startswith("bees collect nectar from thousands of flowers")
    assert o["points"][1]["text"].startswith("they store it in wax cells")


def test_too_short_has_no_overview():
    assert argument.overview(sents("Hello everyone, thanks."), duration=3.0) is None


def test_content_evidence_counts_stories_but_caps_them():
    story_only = sents("I have a friend who took a gap year.", "My brother did too and loved it.")
    score, d = content.evidence(story_only, minutes=1.0)
    assert d["count"] == 2 and d["hard"] is False and score == 0.6
    with_stat = sents("I have a friend who took a gap year.", "About 40 percent of students change majors.")
    assert content.evidence(with_stat, minutes=1.0)[0] == 1.0
