"""Template-based spoken debrief (spec §4.5.1): one strength, two growth areas, one drill."""

from __future__ import annotations

from dataclasses import dataclass

from .. import config as cfgmod


def mmss(t: float) -> str:
    t = max(0, int(round(t)))
    return f"{t // 60}:{t % 60:02d}"


def spoken_time(t: float) -> str:
    t = max(0, int(round(t)))
    m, s = divmod(t, 60)
    if m == 0:
        return f"{s} seconds in"
    return f"{m} minute{'s' if m != 1 else ''} {s} seconds in" if s else f"{m} minute{'s' if m != 1 else ''} in"


@dataclass
class Item:
    key: str
    metric: str
    severity: float
    text: str
    t: float | None = None


def _strengths(s: dict) -> list[Item]:
    sc, out = s["scores"], []
    g = s.get("gaze")
    if g and sc.get("eyeContact") is not None and sc["eyeContact"] >= 75:
        target = 75 if g.get("notesMode", True) else 85
        out.append(Item("OPEN_STRONG_GAZE", "eyeContact", sc["eyeContact"] / 100,
                        f"You spent {round(g['audiencePct'])} percent of your time looking at the audience, "
                        f"against a {target} percent target."))
    if sc["fillers"] >= 80:
        out.append(Item("OPEN_FEW_FILLERS", "fillers", sc["fillers"] / 100,
                        f"You kept filler words down to {s['fillers']['perMinute']:.1f} per minute. That is clean, "
                        f"confident delivery."))
    if sc["pacing"] >= 75:
        out.append(Item("OPEN_PACE", "pacing", sc["pacing"] / 100,
                        f"Your average pace of {round(s['pacing']['meanWpm'])} words per minute sits right in the "
                        f"comfortable range for listeners."))
    if sc["vocalVariety"] >= 70:
        out.append(Item("OPEN_VOICE", "vocalVariety", sc["vocalVariety"] / 100,
                        "Your voice had good pitch and volume variety, which helps keep listeners with you."))
    if sc["structure"] >= 75:
        out.append(Item("OPEN_STRUCTURE", "structure", sc["structure"] / 100,
                        "Your talk had a clear structure, with signposts that made it easy to follow."))
    return sorted(out, key=lambda i: -i.severity)


def _growth(s: dict, keyphrase_at) -> list[Item]:
    sc, out = s["scores"], []
    f = s["fillers"]
    if f["clusters"]:
        c = max(f["clusters"], key=lambda c: c["count"])
        topic = keyphrase_at(c["t0"])
        where = f", right as you moved into {topic}" if topic else ""
        out.append(Item("GROW_FILLER_BURST", "fillers", 0.5 + 0.1 * c["count"],
                        f"{spoken_time(c['t0']).capitalize()}, you used {c['count']} filler words in "
                        f"{max(1, round(c['t1'] - c['t0']))} seconds{where}. Try a silent pause there instead.", c["t0"]))
    elif sc["fillers"] < 75 and f["total"]:
        top = max(f["byToken"].items(), key=lambda kv: kv[1])[0]
        out.append(Item("GROW_FILLERS", "fillers", 1 - sc["fillers"] / 100,
                        f"You used {f['total']} filler words, most often \"{top}\". Pausing silently sounds more "
                        f"confident than filling the gap."))
    p = s["pacing"]
    lo, hi = cfgmod.load()["pace"]["band"]
    mean = p.get("meanWpm", 0)
    rush = [z for z in p.get("accelZones", []) if z["kind"] == "rush"]
    if mean and mean < lo:
        # Too slow overall is the real problem. A "rush" zone here is only fast relative to a slow
        # median (a slow speaker's 131 WPM looks like +78%), so it must not be the pacing tip.
        out.append(Item("GROW_SLOW", "pacing", 1.3 - (sc["pacing"] or 0) / 100,
                        f"You spoke at {round(mean)} words per minute on average, below the {lo} to {hi} target. "
                        f"Pick up the pace and keep your pauses short."))
    elif mean > hi:
        out.append(Item("GROW_FAST", "pacing", 1.3 - (sc["pacing"] or 0) / 100,
                        f"You spoke at {round(mean)} words per minute on average, above the {lo} to {hi} target. "
                        f"Slow down so key points can land."))
    elif rush:
        z = max(rush, key=lambda z: z["peakWpm"])
        pct = round(100 * (z["peakWpm"] / max(p["medianWpm"], 1) - 1))
        out.append(Item("GROW_RUSH", "pacing", 0.4 + pct / 100,
                        f"Your pace climbed to {round(z['peakWpm'])} words per minute between {mmss(z['t0'])} and "
                        f"{mmss(z['t1'])}, about {pct} percent faster than your usual pace.", z["t0"]))
    elif mean and sc["pacing"] < 70:
        out.append(Item("GROW_PACE", "pacing", 1 - sc["pacing"] / 100,
                        f"Your average pace was {round(mean)} words per minute, but your speed was uneven. "
                        f"Aim for a steady rhythm, slowing only for key points."))
    v = s["voice"]
    if v.get("monotoneSegments"):
        m = max(v["monotoneSegments"], key=lambda m: m["t1"] - m["t0"])
        out.append(Item("GROW_MONOTONE", "vocalVariety", 0.6,
                        f"Between {mmss(m['t0'])} and {mmss(m['t1'])} your pitch barely moved. Try stressing one key "
                        f"word in each sentence.", m["t0"]))
    elif sc["vocalVariety"] < 60:
        out.append(Item("GROW_VOICE", "vocalVariety", 1 - sc["vocalVariety"] / 100,
                        ("Your voice stayed close to one note for much of the talk. " if v.get("f0StdSt", 0) < 2.5 else
                         "Your voice jumped around a lot in pitch. ")
                        + "Let it rise on important words and fall at the end of each point to sound more engaged."))
    g = s.get("gaze")
    notes = (g or {}).get("notesMode", True)
    if g and sc.get("eyeContact") is not None and sc["eyeContact"] < 70:
        if notes and g["zonePct"]["N"] > 25:
            msg = (f"You looked at your notes {round(g['zonePct']['N'])} percent of the time. Aim to glance down, "
                   f"then deliver each sentence to a person.")
        elif not notes and g["zonePct"]["N"] + g["zonePct"]["X"] > 15:
            off = round(g["zonePct"]["N"] + g["zonePct"]["X"])
            msg = (f"You looked down or away {off} percent of the time. With no notes, keep your eyes up on the "
                   f"audience, even while you think.")
        else:
            side = min(("L", "R"), key=lambda z: g["zonePct"][z])
            name = "left" if side == "L" else "right"
            msg = (f"The {name} side of the room only got {round(g['zonePct'][side])} percent of your eye contact. "
                   f"Sweep your gaze across the whole audience.")
        out.append(Item("GROW_GAZE", "eyeContact", 1 - sc["eyeContact"] / 100, msg))
    st = s["structure"]
    if not st["conclusionDetected"]:
        out.append(Item("GROW_CONCLUSION", "structure", 0.45,
                        "Your ending did not signal a conclusion. Try a clear wrap-up like, \"To sum up.\""))
    return sorted(out, key=lambda i: -i.severity)


DRILLS = {
    "fillers": "Drill: read your opening aloud and replace every filler with a one second pause.",
    "pacing": "Drill: pick three key sentences and deliberately slow down on each one.",
    "vocalVariety": "Drill: read one paragraph as if telling an exciting story to a ten year old, then keep half that energy.",
    "eyeContact": "Drill: pick three spots in the room, left, center and right, and deliver one full sentence to each in turn.",
    "structure": "Drill: write one sentence each for your opening hook, three main points and conclusion, then practice the transitions.",
}

# A drill that fits the specific problem, where the per-metric drill would be wrong.
DRILLS_BY_KEY = {
    "GROW_SLOW": "Drill: read one paragraph against a timer at about two and a half words per second, then match that pace from memory.",
}


def drill_for(item: Item) -> str:
    return DRILLS_BY_KEY.get(item.key, DRILLS[item.metric])


# When nothing crosses a "fix this" threshold, still give the weakest area one concrete next step.
LEVEL_UP = {  # metric: (name, next step)
    "pacing": ("Speed", "Aim for a steady 140 to 160 words per minute."),
    "fillers": ("Filler words", "Replace each one with a short silent pause."),
    "vocalVariety": ("Voice", "Stress one key word in every sentence."),
    "eyeContact": ("Eye contact", "Finish each sentence looking at one person."),
    "structure": ("Structure", "Open with a question and close with a clear summary."),
}


def _level_up(summary: dict, exclude: set[str], below: float = 101) -> Item | None:
    sc = summary["scores"]
    scored = [(v, k) for k, v in sc.items()
              if k in LEVEL_UP and k not in exclude and isinstance(v, (int, float)) and v < below]
    if not scored:
        return None
    v, k = min(scored)
    name, step = LEVEL_UP[k]
    return Item(f"LEVEL_{k.upper()}", k, 0.1, f"{name} scored {round(v)} out of 100. {step}")


def _as_dict(item: Item) -> dict:
    return {**item.__dict__, "drill": drill_for(item)}


def build(summary: dict, keyphrase_at) -> dict:
    strengths = _strengths(summary)
    growth = _growth(summary, keyphrase_at)
    distinct: list[Item] = []  # most severe first, one per metric
    for g in growth:
        if all(g.metric != p.metric for p in distinct):
            distinct.append(g)
    # Always give one tip, and a second one when another area is still clearly improvable (< 90).
    if not distinct and (lvl := _level_up(summary, set())):
        distinct.append(lvl)
    if len(distinct) == 1 and (lvl := _level_up(summary, {distinct[0].metric}, below=90)):
        distinct.append(lvl)
    # Any other area that is still weak (< 70) becomes a smaller tip for the dropdown.
    while lvl := _level_up(summary, {d.metric for d in distinct}, below=70):
        distinct.append(lvl)
    picked, more = distinct[:2], distinct[2:]
    parts = []
    overall = summary["scores"]["overall"]
    parts.append(f"Here is your debrief. Your overall score is {overall} out of 100.")
    if strengths:
        parts.append("Nice work. " + strengths[0].text)
    if picked:
        parts.append("Two things to work on." if len(picked) == 2 else "One thing to work on.")
        parts.extend(p.text for p in picked)
        parts.append(drill_for(picked[0]))
    else:
        parts.append("There is nothing major to fix. Keep practicing to make it automatic.")
    parts.append("Keep going. Every run makes the next one easier.")
    return {
        "text": " ".join(parts),
        "strengths": [i.__dict__ for i in strengths[:2]],
        "growth": [_as_dict(i) for i in picked],  # the one or two headline tips, each with its own drill
        "more": [_as_dict(i) for i in more],      # smaller critiques, shown in a dropdown
        "drill": drill_for(picked[0]) if picked else None,
    }


def no_speech(summary: dict) -> dict:
    """Debrief for a recording with no detectable speech (usually a muted or blocked microphone)."""
    if summary["voice"].get("peakDb", 0.0) <= -90:
        cause = ("The microphone recording was completely silent, which usually means the app does not have "
                 "microphone permission or the wrong input is selected.")
    else:
        cause = "The recording had sound, but no words could be recognized. Try speaking closer to the microphone."
    text = f"Podium did not hear any speech in this run. {cause} Check the microphone meter on the setup screen, then try again."
    g = summary.get("gaze")
    if g:
        text += f" Your eye contact was still tracked: {round(g['audiencePct'])} percent of your time went to the audience."
    return {"text": text, "strengths": [], "growth": [], "more": [], "drill": None}


# ---------------------------------------------------------------- engagement curve
def said(words, t0: float, t1: float, max_words: int = 7) -> str:
    """What the speaker said in [t0, t1] (first few words, fillers removed), for quoting."""
    from .text import strip_fillers

    text = strip_fillers(" ".join(w.w for w in words if t0 <= w.t0 <= t1))
    parts = text.split()
    if not parts:
        return ""
    return " ".join(parts[:max_words]).strip(" ,.;:") + ("…" if len(parts) > max_words else "")


def _longest_run(gaze: list[dict], t0: float, t1: float, zones: set[str]) -> float:
    longest, start, last = 0.0, None, None
    for g in gaze:
        if not t0 <= g["t"] <= t1:
            continue
        last = g["t"]
        z = g.get("zone", "X") if g.get("face", True) else "-"
        if z in zones and start is None:
            start = g["t"]
        elif z not in zones and start is not None:
            longest, start = max(longest, g["t"] - start), None
    if start is not None and last is not None:  # still looking there at the last sample
        longest = max(longest, last - start)
    return longest


def confirm_cause(causes: list[str], d: dict, words, fillers, gaze: list[dict], band: tuple[float, float]) -> str | None:
    """First cause that the transcript and gaze actually back up in the dip window.

    The live components are smoothed over 10-30 s, so on their own they can blame fillers or
    pace for a dip where none happened."""
    t0, t1 = d["t0"] - 5.0, d["t1"]
    for c in causes:
        if c == "filler" and any(t0 <= f.t0 <= t1 for f in fillers):
            return c
        if c == "gaze" and (_longest_run(gaze, t0, t1, {"N", "X"}) >= 2 or _center_only(gaze, t0, t1)):
            return c
        if c == "pace":
            n = sum(1 for w in words if t0 <= w.t0 <= t1)
            wpm = 60 * n / max(t1 - t0, 1.0)
            if not band[0] - 20 <= wpm <= band[1] + 10:
                return c
        if c == "silence" and max((b.t0 - a.t1 for a, b in zip(words, words[1:]) if a.t1 <= t1 and b.t0 >= t0), default=0) >= 3:
            return c
        if c == "monotony":
            return c  # measured directly from the voice in this window
    return None


def _center_only(gaze: list[dict], t0: float, t1: float) -> bool:
    zs = [g.get("zone") for g in gaze if t0 <= g["t"] <= t1 and g.get("face", True)]
    aud = [z for z in zs if z in ("L", "C", "R")]
    return len(aud) > 60 and aud.count("C") / len(aud) > 0.9


def dip_line(d: dict, words, fillers, gaze: list[dict], notes: bool, band: tuple[float, float]) -> str:
    """One coaching sentence for an engagement dip, from its cause and what happened in it."""
    at = f"Engagement dropped at {mmss(d['t'])}"
    t0, t1 = d["t0"] - 5.0, d["t1"]  # the audience reacts to what happened just before
    cause = d.get("cause")
    if cause == "gaze":
        down = _longest_run(gaze, t0, t1, {"N"})
        away = _longest_run(gaze, t0, t1, {"X"})
        if down >= 2:
            where = "at your notes" if notes else "down"
            return f"{at} while you looked {where} for {round(down)} s — glance up at the end of each sentence."
        if away >= 2:
            return f"{at} while you looked away for {round(away)} s — finish each sentence looking at someone."
        return f"{at} while your eyes stayed on one part of the room — sweep left and right."
    if cause == "filler":
        fs = [f for f in fillers if t0 <= f.t0 <= t1]
        if fs:
            toks = ", ".join(dict.fromkeys(f"“{f.token}”" for f in fs))
            n = len(fs)
            return f"{at} after {n} filler word{'s' if n > 1 else ''} ({toks}) — pause silently instead."
        return f"{at} as filler words built up — pause silently instead."
    if cause == "monotony":
        q = said(words, t0, t1)
        on = f" on “{q}”" if q else ""
        return f"{at} while your voice stayed flat{on} — stress one key word in each sentence."
    if cause == "pace":
        n = sum(1 for w in words if t0 <= w.t0 <= t1)
        span = max(t1 - t0, 1.0)
        wpm = round(60 * n / span)
        if wpm > band[1]:
            return f"{at} while you were speaking at {wpm} words/min — slow down so the point lands."
        return f"{at} while you were speaking at {wpm} words/min — pick up the pace here."
    if cause == "silence":
        gaps = [b.t0 - a.t1 for a, b in zip(words, words[1:]) if a.t1 <= t1 and b.t0 >= t0]
        gap = max(gaps, default=0.0)
        long = f" a {round(gap)} s" if gap >= 2 else " a long"
        return f"{at} during{long} silence — keep pauses under 3 s, or fill them with a question."
    return f"{at} — a question, a story or a number would win them back here."


def peak_line(p: dict, words) -> str:
    q = said(words, p["t0"], p["t1"])
    on = f", on “{q}”" if q else ""
    return f"Your audience was most engaged at {mmss(p['t0'])}{on} — do more of that."
