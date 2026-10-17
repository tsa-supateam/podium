# ADR 0006: Q&A round between the speech and its results

**Status:** accepted

## Decision
After a speech, the user immediately gets 5 follow-up questions, picks one or two, and answers
each out loud with a time limit (30, 60 or 90 s). The results come after. Q&A no longer lives
inside the analysis screen.

## How the questions are ready in about 2 seconds
- They are built from the **live Vosk transcript** (`telemetry/words.ndjson`) as soon as the speech
  stops (`nlp/quick.py`, `questions.quick` command), not from Whisper.
- Vosk text has no punctuation. Sentences are split at pauses, and templates that need clause
  boundaries (cause and effect) use safe wording instead of guessing both sides.
- Three general questions are always appended, so there is something to answer even after a
  short or unclear speech.
- Each question is read aloud with Piper on demand (`tts.speak`, cached by text), about 2 s each,
  and pre-fetched while the user chooses.

## Background analysis
The full Whisper analysis of the speech starts when the speech stops and runs during the Q&A
round at lower OS priority (`nice 10`) with half the CPU cores, so the live engine recording the
answers keeps real time. Usually the results are ready by the time the user finishes answering.

## Answers
Each answer is its own short session (`mode: "qa"`, with `parentSessionId` and `question`), recorded
through the same live pipeline: reactive audience, pace, fillers and eye contact (no notes). Its
analysis adds `summary.qa`, which says whether the answer used the question's topic words. Answers
are linked in the parent's `session.json` (`answers`), shown on the parent's results under "Your
Q&A answers", hidden from History, and deleted with their parent.

Measured on the fixture: questions in 1.5–1.7 s, the first spoken question in 1.7–1.9 s.
