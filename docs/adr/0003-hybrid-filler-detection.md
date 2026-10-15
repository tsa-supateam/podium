# ADR 0003: Hybrid filler-word detection

**Status:** accepted

## Problem (measured)
On our fixture speech, **Vosk's small English model has no "um" or "uh" in its vocabulary.** It
transcribed "um" as *on* / *I'm* and "uh" as *all* / *owe*. Whisper, by default, tends to clean
disfluencies out of transcripts.

## Decision
- **Live:** run detectors on Vosk *partial* results, which carry word timings (`SetPartialWords`):
  - lexical rules for *like / you know / so / basically …*, with grammatical-use exceptions;
  - a **sound-alike rule**: a short function word that Vosk produced with an unusually long duration
    and a flat pitch is reported as a filled pause;
  - an acoustic filled-pause detector (a flat-pitched, spectrally stable vowel lasting 350–1400 ms).
- **Post-speech:** faster-whisper with a disfluent *initial prompt* ("Umm, so, uh, …"). faster-whisper
  only applies the prompt to the first 30 s window when `condition_on_previous_text=False`, so the
  audio is split at VAD pauses into chunks of 25 s or less and each chunk gets the prompt. The results
  are merged with the live detections, and a POS-tagger check removes grammatical "like".

## Result
On the fixture, Whisper with the prompt transcribed every "um" and "uh". The full pipeline finds 5 of
the 6 fillers (one "uh" next to "So," is lost at a chunk boundary). Live alerts arrive about 1.6 s after
the filler, down from 8.8 s when only final results were used. See `docs/evaluation/`.
