# ADR 0008: Content analysis, the Content / Structure / Engagement split, and one report per run

**Status:** accepted

## Content (nlp/content.py, rule-based)
Each part is scored 0–100 and keeps the evidence used in feedback:

| Part | Weight | Measured as |
|---|---|---|
| On the prompt | 25% | Share of the prompt's key words covered (60% covered = full marks) |
| Evidence | 20% | Sentences with a number, example or source, about one per 40 s |
| Directness | 15% | Hedges ("I think", "maybe", "kind of", "just"…) per 100 words |
| Clear sentences | 15% | Average sentence length, best at 10–20 words |
| Word variety | 10% | Moving-average type-token ratio, plus over-used words |
| Takeaway | 5% | A closing point or call to action |
| Q&A answers | 10% | On topic, long enough, answered directly |

Parts that don't apply (no prompt, no Q&A) are left out, and the weights are renormalized.

## Headline scores
Overall = **Content 35% + Structure 25% + Engagement 40%**. Engagement is half the average of the
delivery scores (speed, fillers, voice, eye contact) and half the live audience's mean engagement.
The delivery scores are still computed and shown lower on the results screen.

## One report per run
A speech and its Q&A answers become one analysis. `deep/finalize.py` runs at the end of the
speech's analysis, and runs again (`combine`) once every answer is analyzed. That second pass
covers content over both transcripts, delivery scores weighted by duration, filler counts merged,
and Q&A quality inside Content. The speech-only base stays in `summary_speech.json`, so repeated
combines never double-count. The app waits on "Adding your Q&A answers" until the merged report
is ready.

## Gaze: calibrated frame, simulated audience vs direct camera
A real calibration (left +12°, center +22.7°, right +27.6°) counted a few degrees of drift as
"left" (45%), while the heatmap drew fixed ±12° lines, so the two disagreed. Now:
- the heatmap is centered on the speaker's calibrated center, with lines drawn where the
  classifier actually splits the zones;
- a side zone calibrated closer than 10° to the center is pushed out (app and engine agree);
- **Direct camera** mode treats any look at the lens as eye contact (no left/right spread, no
  side cues, calibration is just "camera" and, with notes, "down").
