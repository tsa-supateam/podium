# Evaluation

How do we know Podium actually works? This folder has our measurements, and the scripts let anyone
re-run them.

## 1. Performance (measured)

`scripts/benchmark.py` on the bundled fixture (30.5 s synthetic speech, Apple M1, 8 GB RAM, CPU only):

| Metric | Value |
|---|---|
| Live engine real-time factor | 12.6× faster than real time |
| Per-hop processing p50 / p95 / max | 0.25 / 9.9 / 180 ms (20 ms hop; the max is a Vosk utterance finalization, absorbed by the ring buffer) |
| Filler alert latency (median / max) | 1.56 / 1.87 s after the filler ends |
| Deep analysis, no TTS | 8.9 s (0.29 s per second of audio) |
| Deep analysis + spoken debrief + 6 spoken questions | ≈ 7–11 s |
| MediaPipe Face Landmarker cold load (browser, GPU delegate) | 5.5 s |

To run it on your own machine:

```bash
cd engine && uv run python ../scripts/benchmark.py
```

**Compared to our targets:** deep analysis is well under the 60 s budget. Live filler alerts take
≈ 1.6 s, though, not the 0.6 s we planned for. That's because Vosk's partial hypotheses only commit a
word about 1.5 s after it's spoken. Two things we could try: an acoustic filled-pause detector trained
on real recordings (it would fire the moment the vowel ends), or a smaller decoding beam.

## 2. Filler accuracy (fixture, measured)

The fixture contains 6 fillers: *um, uh, like, you know, um, uh*.

| Pipeline | Found | Notes |
|---|---|---|
| Vosk transcript + lexical rules only | 1 | only "like"; "um" never appears as a word (it becomes *on* / *I'm*, and "uh" becomes *all* / *owe*) |
| Live engine (lexical + sound-alike rules) | 4 | misses "you know" (followed by "that", so treated as grammatical) and one "uh" heard as *all* with full confidence |
| Whisper + disfluency prompt + reconciliation | 5 | one "uh" lost next to "So," |

The fixture is synthetic (Piper TTS), so real speech will behave differently. That's why the next step
is a labelled set of real recordings.

## 3. Labelled set of real recordings (in progress)

How we're building it:

1. Record 15–20 clips of 60 s each from volunteers (with their consent), in different rooms and on different mics.
2. In Audacity, add a label track and mark every filler (`Ctrl+B`), then export the labels as `clipNN.txt` next to `clipNN.wav`.
3. Run:

```bash
cd engine && uv run python ../scripts/evaluate_fillers.py path/to/clips
```

4. Add the precision / recall / F1 table here, tune `engine/podium_engine/config/defaults.toml`
   (sound-alike duration, FPD thresholds), and re-run to compare before and after.

For gaze, one of us records a session while a teammate writes down which zone the speaker is looking at
every 5 s. Comparing that against `telemetry/gaze.ndjson` gives a confusion matrix, both calibrated
and uncalibrated.
