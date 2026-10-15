# ADR 0002: Run face tracking in the renderer, not in Python

**Status:** accepted

## Decision
MediaPipe Face Landmarker (WASM + WebGL) runs in the Electron renderer, using the same camera stream
as the preview and the recorder. Only ~100-byte gaze samples (angles + zone) go to the engine at 30 Hz.

## Why
- Video frames never cross a process boundary (no serialization of 30 × 1280×720 frames per second).
- On Windows, usually only one process can open a webcam; the renderer already needs it for the preview.
- The gaze math (`apps/desktop/src/lib/gaze.ts`) is pure TypeScript with unit tests.

## Trade-off
Inference currently runs on the main thread with the GPU delegate (≈ 5–15 ms per frame). Moving it to a
Web Worker is a planned optimization. MediaPipe's WASM loader needs a classic (non-module) worker, which
complicates bundling.
