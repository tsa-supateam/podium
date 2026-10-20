# ADR 0007: Live Whisper for fillers and captions; Coach and Judge modes

**Status:** accepted (supersedes the live part of ADR 0003)

## What a real session showed (2026-10-19, 2 min)
- Live alerts: **13, of which 12 were false.** The Vosk small model mis-heard real speech ("in all the
  in a car now are these he all…"), and the sound-alike rule turned "oh", "all", "a", "are" and "ah"
  into "uh".
- The disfluent Whisper prompt ("I was like, you know…") could leak into the transcript on unclear
  audio ("I was like, you know, I was like, you know…"), inventing fillers.

## Decision
- **Live words come from Whisper base.en**, run on each stretch of speech when the speaker pauses
  (or every 4 s during long runs). It uses greedy decoding, `max_new_tokens=64`, 2 threads, and
  drops segments with `no_speech_prob > 0.6`, `avg_logprob < -1`, `compression_ratio > 2.2`, or
  text that just echoes the prompt. Fillers are reported only when Whisper actually wrote them. A
  confidence cutoff of 0.1 is used because Whisper scores real "Umm"s as low as 0.14.
- Vosk stays for the instant words-per-minute reading only. The sound-alike rule and live acoustic
  filled-pause alerts are off.
- **The prompt is now only filled pauses** ("Umm, uh... hmm. Uh, okay."), for both live and
  after-speech transcription. It still recovers every "um"/"uh" in the fixture, and it cannot
  inject "like" or "you know".
- Whisper small.en was rejected for the after-speech pass: 4.6× slower (52 s vs 11 s for 2 min on
  an M1) for a modestly better transcript.

| Same 2-minute recording | Before | After |
|---|---|---|
| Live filler alerts | 13 (12 false) | 2 ("kind of", "umm"), both real |
| Live captions | Vosk ("in all the in a car now…") | Whisper ("Oh my god, it's giving me... I'm looking away. My speed is bad.") |
| Caption / alert delay after a pause | about 1.6 s | median 1.3 s, max 1.9 s |

## Coach and Judge modes
- **Coach** (default): live cue words at the bottom of the stage ("Slow down", "Speed up",
  "Calm · pause", "Look up", "Look left", "Look right", "Eye contact", "More energy", "Keep going",
  "Good"), the audience's boredom scaled by 0.8, and results shown as a star level plus a word per
  metric, with what went well first. Only improvements are compared with the last run.
- **Judge**: test conditions. No cues, full audience strictness, scores out of 100 with a grade,
  and the change from the last run whether up or down.
- The scoring itself is identical; only the live audience and the presentation differ.
