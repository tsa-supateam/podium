"""Load tunable constants from defaults.toml (optionally overridden by a user file)."""

from __future__ import annotations

import tomllib
from functools import lru_cache
from pathlib import Path
from typing import Any

_DEFAULTS = Path(__file__).with_name("defaults.toml")


def _merge(base: dict[str, Any], over: dict[str, Any]) -> dict[str, Any]:
    out = dict(base)
    for k, v in over.items():
        out[k] = _merge(out[k], v) if isinstance(v, dict) and isinstance(out.get(k), dict) else v
    return out


@lru_cache(maxsize=1)
def load(override: str | None = None) -> dict[str, Any]:
    cfg = tomllib.loads(_DEFAULTS.read_text())
    if override:
        cfg = _merge(cfg, tomllib.loads(Path(override).read_text()))
    return cfg
