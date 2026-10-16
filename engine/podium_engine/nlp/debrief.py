"""Template-based spoken debrief (spec §4.5.1): one strength, two growth areas, one drill."""

from __future__ import annotations

from dataclasses import dataclass


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
        out.append(Item("OPEN_STRONG_GAZE", "eyeContact", sc["eyeContact"] / 100,
                        f"You spent {round(g['audiencePct'])} percent of your time looking at the audience, which is "
                        f"above the 75 percent target."))
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
    rush = [z for z in p.get("accelZones", []) if z["kind"] == "rush"]
    if rush:
        z = max(rush, key=lambda z: z["peakWpm"])
        pct = round(100 * (z["peakWpm"] / max(p["medianWpm"], 1) - 1))
        out.append(Item("GROW_RUSH", "pacing", 0.4 + pct / 100,
                        f"Your pace climbed to {round(z['peakWpm'])} words per minute between {mmss(z['t0'])} and "
                        f"{mmss(z['t1'])}, about {pct} percent faster than your usual pace.", z["t0"]))
    elif p.get("meanWpm", 0) and sc["pacing"] < 70:
        fast = p["meanWpm"] > 160
        out.append(Item("GROW_PACE", "pacing", 1 - sc["pacing"] / 100,
                        f"Your average pace was {round(p['meanWpm'])} words per minute. "
                        + ("Slow down a little so key points can land." if fast else
                           "Pick up the pace slightly to keep energy up.")))
    v = s["voice"]
    if v.get("monotoneSegments"):
        m = max(v["monotoneSegments"], key=lambda m: m["t1"] - m["t0"])
        out.append(Item("GROW_MONOTONE", "vocalVariety", 0.6,
                        f"Between {mmss(m['t0'])} and {mmss(m['t1'])} your pitch barely moved. Try stressing one key "
                        f"word in each sentence.", m["t0"]))
    elif sc["vocalVariety"] < 60:
        out.append(Item("GROW_VOICE", "vocalVariety", 1 - sc["vocalVariety"] / 100,
                        f"Your pitch varied by about {v.get('f0StdSt', 0):.1f} semitones. Adding more rise and fall "
                        f"will make you sound more engaged."))
    g = s.get("gaze")
    if g and sc.get("eyeContact") is not None and sc["eyeContact"] < 70:
        if g["zonePct"]["N"] > 25:
            msg = (f"You looked at your notes {round(g['zonePct']['N'])} percent of the time. Aim to glance down, "
                   f"then deliver each sentence to a person.")
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
    "pacing": "Drill: mark three key sentences in your notes and deliberately slow down on each one.",
    "vocalVariety": "Drill: read one paragraph as if telling an exciting story to a ten year old, then keep half that energy.",
    "eyeContact": "Drill: pick three spots in the room, left, center and right, and deliver one full sentence to each in turn.",
    "structure": "Drill: write one sentence each for your opening hook, three main points and conclusion, then practice the transitions.",
}


def build(summary: dict, keyphrase_at) -> dict:
    strengths = _strengths(summary)
    growth = _growth(summary, keyphrase_at)
    picked: list[Item] = []
    for g in growth:
        if all(g.metric != p.metric for p in picked):
            picked.append(g)
        if len(picked) == 2:
            break
    parts = []
    overall = summary["scores"]["overall"]
    parts.append(f"Here is your debrief. Your overall score is {overall} out of 100.")
    if strengths:
        parts.append("Nice work. " + strengths[0].text)
    if picked:
        parts.append("Two things to work on." if len(picked) == 2 else "One thing to work on.")
        parts.extend(p.text for p in picked)
        parts.append(DRILLS[picked[0].metric])
    else:
        parts.append("There is nothing major to fix. Keep practicing to make it automatic.")
    parts.append("Keep going. Every run makes the next one easier.")
    return {
        "text": " ".join(parts),
        "strengths": [i.__dict__ for i in strengths[:2]],
        "growth": [i.__dict__ for i in picked],
        "drill": DRILLS[picked[0].metric] if picked else None,
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
    return {"text": text, "strengths": [], "growth": [], "drill": None}
