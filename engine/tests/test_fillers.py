import pytest

from podium_engine.realtime.fillers import (
    FillerEvent,
    filled_pause_tokens,
    lexical_fillers,
    merge_events,
    vosk_soundalikes,
)
from podium_engine.realtime.pace import Word

LEX = ["like", "you know", "so", "basically", "actually", "literally", "right", "i mean", "kind of", "sort of"]


def words(text: str, gap_after: dict[int, float] | None = None) -> list[Word]:
    """Words 0.25 s long with 0.05 s gaps, plus optional longer pauses after given indices."""
    out, t = [], 0.0
    for i, w in enumerate(text.split()):
        out.append(Word(t, t + 0.25, w))
        t += 0.30 + (gap_after or {}).get(i, 0.0)
    return out


def tokens(text: str, **kw) -> list[str]:
    return [e.token for e in lexical_fillers(words(text, kw.get("gaps")), LEX, sentence_starts={0})]


@pytest.mark.parametrize("text", [
    "I would like to thank you",
    "it looks like a storm",
    "I like pizza",
    "it was like the best day",
    "do you know what time it is",
    "a kind of magic",
])
def test_grammatical_uses_are_not_fillers(text):
    assert tokens(text) == []


def test_comma_marked_like_is_filler():
    assert tokens("and, like, it broke") == ["like"]


def test_sentence_initial_like_with_you_know():
    assert tokens("Like, you know, that means") == ["like", "you know"]


def test_so_needs_pause_after():
    assert tokens("So, the first reason") == ["so"]
    assert tokens("so the first reason") == []


def test_filled_pause_tokens_variants():
    ws = [Word(0, 0.4, "Umm,"), Word(0.5, 0.8, "uh"), Word(0.9, 1.2, "Hmm."), Word(1.3, 1.6, "under")]
    assert [e.token for e in filled_pause_tokens(ws, ["um", "uh", "hmm", "umm"], "whisper")] == ["umm", "uh", "hmm"]


def test_vosk_soundalike_requires_long_flat_word():
    ws = [Word(0.0, 0.3, "talk"), Word(0.5, 0.9, "on", 0.7), Word(1.2, 1.5, "renewable")]
    found = vosk_soundalikes(ws, ["on"], 0.3, lambda a, b: 0.4)
    assert [e.token for e in found] == ["um"]
    short = [Word(0.0, 0.3, "lights"), Word(0.3, 0.45, "on", 1.0)]
    assert vosk_soundalikes(short, ["on"], 0.3, lambda a, b: 0.4) == []


def test_merge_keeps_distinct_lexical_fillers_and_unions_sources():
    ev = [
        FillerEvent(1.0, 1.4, "um", "filled_pause", 0.7, "vosk"),
        FillerEvent(1.1, 1.3, "umm", "filled_pause", 0.9, "whisper"),
        FillerEvent(2.0, 2.2, "like", "lexical", 0.6, "lex"),
        FillerEvent(2.4, 2.7, "you know", "lexical", 0.6, "lex"),
    ]
    merged = merge_events(ev, 0.3)
    assert [m.token for m in merged] == ["umm", "like", "you know"]
    assert merged[0].src == "vosk+whisper"
