from podium_engine.realtime.pace import Word, pace_label, rolling_wpm


def test_full_window_count():
    words = [Word(i * 0.4, i * 0.4 + 0.3, "w") for i in range(12)]  # 12 words in 4.7 s
    assert rolling_wpm(words, 5.0, 5.0) == 144.0


def test_word_straddling_window_edge_counts_fractionally():
    words = [Word(-0.5, 0.5, "half")]  # half inside (0, 5]
    assert abs(rolling_wpm(words, 5.0, 5.0) - 6.0) < 1e-9


def test_future_words_ignored():
    assert rolling_wpm([Word(6.0, 6.2, "later")], 5.0, 5.0) == 0.0


def test_labels():
    band = (130, 170)
    assert pace_label(100, band, 110, 190) == "drag"
    assert pace_label(120, band, 110, 190) == "slow"
    assert pace_label(150, band, 110, 190) == "optimal"
    assert pace_label(180, band, 110, 190) == "fast"
    assert pace_label(200, band, 110, 190) == "rushing"
