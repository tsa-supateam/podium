import numpy as np
from hypothesis import given
from hypothesis import strategies as st

from podium_engine.realtime import fusion

unit = st.floats(min_value=0, max_value=1)


@given(st.dictionaries(st.sampled_from(["filler", "monotony", "gaze", "pace"]), st.one_of(st.none(), unit)))
def test_fused_index_is_bounded(comps):
    b = fusion.fuse(comps, {"filler": 0.25, "monotony": 0.3, "gaze": 0.35, "pace": 0.1})
    assert 0.0 <= b <= 1.0


def test_integrator_loses_audience_faster_than_it_wins_them_back():
    up = fusion.BoredomIntegrator(1 / 6, 1 / 10, B=0.0)
    down = fusion.BoredomIntegrator(1 / 6, 1 / 10, B=1.0)
    for _ in range(20):  # 5 s
        up.step(1.0, 0.25)
        down.step(0.0, 0.25)
    assert up.B > 1 - down.B  # rose more than it fell


def test_filler_component_midpoint():
    assert abs(fusion.filler_component(5, 100, 0.05, 0.015) - 0.5) < 1e-9


def test_monotony_flat_vs_lively():
    flat = fusion.monotony_component(np.zeros(100) + np.random.default_rng(0).normal(0, 0.2, 100),
                                     np.full(100, -20.0), 1.5, 4.0, 2.0, 6.0)
    lively = fusion.monotony_component(np.random.default_rng(1).normal(0, 6, 100),
                                       np.random.default_rng(2).normal(-20, 8, 100), 1.5, 4.0, 2.0, 6.0)
    assert flat > 0.9 and lively < 0.1


def test_gaze_component_rewards_spreading_attention():
    center_only = fusion.gaze_component({"C": 1.0}, 0.6)
    spread = fusion.gaze_component({"L": 1 / 3, "C": 1 / 3, "R": 1 / 3}, 0.6)
    notes = fusion.gaze_component({"N": 1.0}, 0.6)
    assert spread < center_only < notes
    assert spread < 1e-9 and abs(notes - 1.0) < 1e-9


def test_ignored_section_gets_bored():
    looked_at = fusion.per_avatar_boredom(0.4, 0.8, 0.0, 0.45)
    ignored = fusion.per_avatar_boredom(0.4, 0.0, 0.0, 0.45)
    assert ignored > 0.4 > looked_at
