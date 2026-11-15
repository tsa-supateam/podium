"""Achievements: tiers earned the first time a run reaches a new level, kept apart per speech type.

Levels are the 1-5 ratings shown on the results screen:
  overall     - the star rating of the overall score (the same cut-offs as the app's stars)
  structure, evidence, commentary - the Overview's #/5 ratings
Each level maps to a tier, wood (1) up to diamond (5). Reaching level 4 on a first prepared run
earns wood through gold for prepared speeches at once; the results screen shows only the highest.

Nothing is stored: achievements are recomputed from the saved runs, oldest first, so each one
belongs to the run that first earned it. Re-analyzing or deleting runs keeps them consistent.
"""

from __future__ import annotations

import json

from .paths import sessions_dir

TIERS = ["wood", "bronze", "silver", "gold", "diamond"]
CATEGORIES = ["overall", "structure", "evidence", "commentary"]
SPEECH_TYPES = ["prepared", "impromptu"]


def stars(overall: float) -> int:
    """Same cut-offs as coachLevel() in the app."""
    return 5 if overall >= 85 else 4 if overall >= 70 else 3 if overall >= 55 else 2 if overall >= 40 else 1


def levels(summary: dict) -> dict[str, int]:
    out: dict[str, int] = {}
    overall = (summary.get("scores") or {}).get("overall")
    if overall is not None and not summary.get("noSpeech"):
        out["overall"] = stars(overall)
    dims = (summary.get("overview") or {}).get("dimensions") or {}
    for k in ("structure", "evidence", "commentary"):
        if k in dims and dims[k].get("score"):
            out[k] = int(dims[k]["score"])
    return out


def _load(p):
    try:
        return json.loads(p.read_text(), parse_constant=lambda _: None)
    except (OSError, ValueError):
        return None


def earned() -> list[dict]:
    """Every achievement earned so far, with the run that first earned it."""
    got: dict[tuple[str, str, int], dict] = {}
    root = sessions_dir()
    for d in sorted(p for p in root.iterdir() if p.is_dir()) if root.exists() else []:
        meta, summary = _load(d / "session.json"), _load(d / "summary.json")
        if (not meta or not summary or meta.get("mode") in ("qa", "replay") or meta.get("status") != "analyzed"
                or meta.get("drill")):  # Learn practices are short exercises, not full speeches
            continue
        kind = "impromptu" if meta.get("speechType") == "impromptu" else "prepared"
        for cat, lvl in levels(summary).items():
            for tier in range(1, min(lvl, 5) + 1):
                key = (kind, cat, tier)
                if key not in got:
                    got[key] = {"id": f"{kind}:{cat}:{TIERS[tier - 1]}", "speechType": kind, "category": cat,
                                "tier": TIERS[tier - 1], "level": tier, "sessionId": meta["sessionId"],
                                "title": meta.get("title", ""), "at": meta.get("createdAt")}
    return list(got.values())
