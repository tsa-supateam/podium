import os
import tempfile
from pathlib import Path

import pytest

# Every test run writes sessions to a throwaway folder, never the user's real data.
os.environ.setdefault("PODIUM_DATA", tempfile.mkdtemp(prefix="podium-test-"))

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture
def fixture_wav() -> Path:
    return FIXTURES / "speech_with_fillers.wav"
