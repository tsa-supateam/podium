"""Deep Analysis Engine orchestration (spec §4.2). Runs in its own OS process.

Reads a recorded session folder and writes transcript.json, summary.json,
debrief.txt and debrief.wav. Progress is reported through a
callback (the CLI prints it as JSON lines for the server to relay).
"""

from __future__ import annotations

import json
import time
from collections.abc import Callable
from pathlib import Path

from .. import config as cfgmod
from .. import tts
from ..nlp import debrief, keyphrases
from ..nlp.quick import topic_coverage
from ..nlp.text import pos_tag, sentences
from ..realtime.fillers import FillerEvent, filled_pause_tokens, lexical_fillers, merge_events, norm
from ..realtime.pace import Word
from ..storage import SCHEMA_VERSION, Index, read_ndjson, write_json
from . import engagement as engagement_mod
from . import prosody, scoring, segmentation
from .transcribe import transcribe

Progress = Callable[[str, float], None]
STAGES = ["transcribe", "fillers", "prosody", "pacing", "structure", "keyphrases", "scoring", "tts"]


def _refine_like(words: list[Word], events: list[FillerEvent]) -> list[FillerEvent]:
    """POS re-check: drop "like" where the tagger sees a verb or a preposition with an object."""
    toks = [norm(w.w) or "x" for w in words]
    tags = pos_tag(toks)
    idx = {round(w.t0, 3): i for i, w in enumerate(words)}
    keep = []
    for e in events:
        i = idx.get(round(e.t0, 3))
        if e.token == "like" and i is not None and not words[i].w.rstrip().endswith(","):
            tag = tags[i][1]
            nxt = tags[i + 1][1] if i + 1 < len(tags) else "."
            if tag.startswith("VB") or (tag == "IN" and nxt.startswith(("DT", "NN", "PRP"))):
                continue
        keep.append(e)
    return keep


def analyze(session_dir: Path, progress: Progress = lambda s, p: None, cfg: dict | None = None,
            with_tts: bool = True) -> dict:
    cfg = cfg or cfgmod.load()
    t_start = time.perf_counter()
    meta = json.loads((session_dir / "session.json").read_text())
    meta["status"] = "analyzing"
    write_json(session_dir / "session.json", meta)
    wav = session_dir / "audio.wav"
    tel = session_dir / "telemetry"

    # 1. transcription
    progress("transcribe", 0.0)
    tr = transcribe(wav, cfg, lambda p: progress("transcribe", p))
    words = tr.words
    import soundfile as sf

    duration = float(sf.info(str(wav)).duration)
    sents = sentences(words)
    write_json(session_dir / "transcript.json", {
        "schemaVersion": SCHEMA_VERSION, "text": tr.text,
        "words": [{"t0": round(w.t0, 3), "t1": round(w.t1, 3), "w": w.w, "p": round(w.p, 3)} for w in words],
        "sentences": [{"t0": round(s.t0, 2), "t1": round(s.t1, 2), "text": s.text} for s in sents],
        "speechRegions": [[round(a, 2), round(b, 2)] for a, b in tr.speech_regions],
    })

    # 2. filler reconciliation: Whisper tokens ∪ lexical rules ∪ real-time acoustic detections
    progress("fillers", 0.0)
    f = cfg["fillers"]
    starts = {s.i0 for s in sents}
    whisper_fp = filled_pause_tokens(words, f["filled_pauses"], "whisper")
    lex = _refine_like(words, lexical_fillers(words, f["lexical"], src="whisper", sentence_starts=starts))
    rt = [FillerEvent(r["t0"], r["t1"], r["token"], r["class"], r["conf"], r["src"])
          for r in read_ndjson(tel / "fillers.ndjson") if r.get("src") == "fpd" and r.get("class") == "filled_pause" and r.get("conf", 0) >= 0.8]
    # an acoustic detection only counts if Whisper heard no real word there
    rt = [e for e in rt if not any(w.t0 < e.t1 and w.t1 > e.t0 and norm(w.w) not in f["filled_pauses"] for w in words)]
    fillers = merge_events(whisper_fp + lex + rt, f["merge_window"])
    filler_words = {round(e.t0, 2) for e in whisper_fp}
    n_words = sum(1 for w in words if round(w.t0, 2) not in filler_words)
    minutes = max(duration / 60, 1e-6)
    clusters, burst = segmentation.filler_clusters(fillers, cfg["deep"]["dbscan_eps"], cfg["deep"]["dbscan_min"])
    by_token: dict[str, int] = {}
    for e in fillers:
        by_token[e.token] = by_token.get(e.token, 0) + 1

    # 3. prosody
    progress("prosody", 0.0)
    p = cfg["prosody"]
    track, voice = prosody.extract(wav, p["fmin"], p["fmax"])
    d = cfg["deep"]
    voice["monotoneSegments"] = prosody.monotone_segments(track, d["monotone_win_s"], d["monotone_st"], d["monotone_db"])
    voice["track"] = prosody.downsample(track, 600)

    # 4. pacing
    progress("pacing", 0.0)
    pc = cfg["pace"]
    ts, wpm, speech = segmentation.wpm_series(words, duration, tr.speech_regions, pc["window_s"])
    pacing = segmentation.pacing_stats(ts, wpm, speech, pc["band"], pc["drag"], pc["rush"])
    pauses = segmentation.pauses_from_words(words)
    speaking_time = sum(b - a for a, b in tr.speech_regions)
    pacing["articulationRate"] = round(60 * n_words / speaking_time, 1) if speaking_time > 0 else 0.0
    pacing["pauseRatio"] = round(1 - speaking_time / duration, 3) if duration else 0.0
    pacing["longPauses"] = [x for x in pauses if x["t1"] - x["t0"] >= 2.0]

    # 5. structure
    progress("structure", 0.0)
    struct = scoring.structure(sents, duration, meta.get("targetDurationSec"))

    # 6. keyphrases (follow-up questions are generated right after the speech, from the live
    #    transcript, by nlp.quick so the user can answer them before this analysis finishes)
    progress("keyphrases", 0.0)
    kps = keyphrases.extract(tr.text, words)

    def keyphrase_at(t: float) -> str | None:
        best = None
        for k in kps:
            for kt in k.get("times", []):
                if t - 2 <= kt <= t + 12 and (best is None or abs(kt - t) < best[0]):
                    best = (abs(kt - t), k["phrase"])
        return best[1] if best else None

    for c in clusters:
        topic = keyphrase_at(c["t0"])
        c["context"] = f"transition into '{topic}'" if topic else ""

    # 8. gaze + engagement + scores
    progress("scoring", 0.0)
    notes = bool(meta.get("notes", True))
    gaze = scoring.gaze_summary(read_ndjson(tel / "gaze.ndjson"), duration, notes)
    eng = read_ndjson(tel / "engagement.ndjson")
    engagement = engagement_mod.summarize(eng)
    if engagement:
        gaze_raw = read_ndjson(tel / "gaze.ndjson")
        band = tuple(pc["band"])
        prev_end = 0.0
        for d in engagement["dips"]:
            d["w0"] = round(max(d["t0"] - debrief.REACT_S, prev_end), 2)
            prev_end = d["t1"]
            d["cause"] = debrief.confirm_cause(d.pop("causes"), d, words, fillers, gaze_raw, band)
            d["said"] = debrief.said(words, *debrief.dip_window(d))
            d["line"] = debrief.dip_line(d, words, fillers, gaze_raw, notes, band)
        if engagement["peak"]:
            pk = engagement["peak"]
            pk["said"] = debrief.said(words, pk["t0"], pk["t1"])
            pk["line"] = debrief.peak_line(pk, words)

    fillers_out = {
        "total": len(fillers), "perMinute": round(len(fillers) / minutes, 2),
        "ratio": round(len(fillers) / max(n_words, 1), 3), "byToken": by_token, "burstiness": burst,
        "clusters": clusters, "events": [e.as_dict() for e in fillers],
    }
    scores = {
        "pacing": scoring.score_pace(pacing, pc["band"]),
        "fillers": scoring.score_fillers(fillers_out["perMinute"]),
        "vocalVariety": scoring.score_voice(voice),
        "eyeContact": scoring.score_eye(gaze),
        "structure": struct["score"],
    }
    no_speech = n_words < 5
    if no_speech:
        # Nothing was said (or the mic delivered silence): speech scores would be meaningless.
        scores.update(pacing=None, fillers=None, vocalVariety=None, structure=None)
    scores["overall"], scores["grade"] = scoring.overall(scores)

    highlights = (
        [{"t": c["t0"], "kind": "filler_cluster", "severity": min(1.0, 0.2 * c["count"])} for c in clusters]
        + [{"t": m["t0"], "kind": "monotone", "severity": 0.6} for m in voice["monotoneSegments"]]
        # "Too fast" only when the speed-up actually exceeds the target band, not merely the speaker's own median.
        + [{"t": z["t0"], "kind": "rush", "severity": 0.6} for z in pacing["accelZones"]
           if z["kind"] == "rush" and z["peakWpm"] > pc["band"][1]]
        + [{"t": s["t0"], "kind": "notes_stare" if notes else "look_down", "severity": 0.5}
           for s in (gaze or {}).get("notesStares", [])]
    )
    summary = {
        "schemaVersion": SCHEMA_VERSION, "sessionId": meta["sessionId"], "title": meta.get("title", ""),
        "durationSec": round(duration, 2), "speakingTimeSec": round(speaking_time, 2), "wordCount": n_words,
        "scores": scores, "pacing": pacing, "fillers": fillers_out, "voice": voice, "gaze": gaze,
        "engagement": engagement, "structure": struct, "keyphrases": kps,
        "highlights": sorted(highlights, key=lambda h: h["t"]),
    }

    # 9. debrief script + TTS
    summary["noSpeech"] = no_speech
    deb = debrief.no_speech(summary) if no_speech else debrief.build(summary, keyphrase_at)
    summary["debrief"] = deb
    (session_dir / "debrief.txt").write_text(deb["text"] + "\n")
    if meta.get("mode") == "qa":
        # An on-the-spot answer: no spoken debrief, but check it stayed on the question's topic.
        summary["qa"] = topic_coverage(meta.get("question", ""), tr.text)
        with_tts = False
    progress("tts", 0.0)
    if with_tts and tts.available():
        try:
            tts.synthesize_many([(deb["text"], session_dir / "debrief.wav")])
            summary["debriefAudio"] = "debrief.wav"
        except Exception as e:  # noqa: BLE001
            summary["debriefAudioError"] = str(e)

    summary["analysisSec"] = round(time.perf_counter() - t_start, 2)
    write_json(session_dir / "summary.json", summary)
    # Re-read before writing: the Q&A round links answers into session.json while this runs.
    meta = json.loads((session_dir / "session.json").read_text())
    meta["status"] = "analyzed"
    meta["durationSec"] = round(duration, 3)
    write_json(session_dir / "session.json", meta)
    Index().upsert(meta, scores)
    progress("done", 1.0)
    return summary
