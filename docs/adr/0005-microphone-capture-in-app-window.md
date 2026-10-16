# ADR 0005: Capture the microphone in the app window, not in Python

**Status:** accepted (replaces PortAudio capture in the engine as the default)

## What happened
On the first run on real hardware (macOS), the engine's PortAudio stream recorded **120 s of exact
zeros**. macOS attributes microphone access to the app that launched a process. The Python engine
started by Electron didn't get its own permission prompt, and macOS delivered silence instead of an
error. The Electron window itself *did* have microphone permission: its video recording included audio.

The silent recording then exposed a second bug. Praat's jitter and shimmer are `NaN` on silence. Python
serialized them as bare `NaN`, `JSON.parse` in the UI rejected the message, and the analyzing screen
waited forever.

## Decision
- The app window captures the mic (`getUserMedia`, with echo cancellation, noise suppression and AGC
  **off** so pitch and loudness are untouched). An `AudioWorklet` (`public/pcm-capture-worklet.js`)
  sends 20 ms frames of 16 kHz float32 PCM to the engine as binary WebSocket frames. The engine feeds
  them into the same ring buffer through `PushSource`, so everything downstream is unchanged.
- PortAudio capture stays available (`audioSource: "engine"`) for headless use.
- The engine sends `audio.silent` after 3 s of digital silence. The setup screen has a live mic meter.
- Every JSON write and send goes through `storage.dumps`, which turns NaN/Infinity into `null`. The UI
  fails any pending request on a malformed message, and the analyzing screen checks the session folder
  itself in case it misses the "done" event.
- A run with fewer than 5 recognized words is marked `noSpeech`. Speech scores are skipped and the
  debrief explains the likely cause instead of praising "0 fillers per minute".

## Consequences
The window and the engine now share one permission prompt, and this works the same in a packaged app
and on Windows. Audio crosses the loopback socket at about 64 kB/s, which is negligible.
