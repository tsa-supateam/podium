# Podium

**An offline public speaking coach with a virtual audience that reacts to you in real time.**

Podium listens to your pace, filler words and vocal variety, and watches where you look. A low-poly
audience leans in, takes notes, or pulls out their phones based on how you're doing. When you finish,
you get a full debrief: scores, a clickable timeline of key moments, an eye-contact heatmap, a spoken
summary, and follow-up questions generated from your own speech. Between speeches, **Learn** teaches
the skills those scores measure through lessons, speaking practices and quick games.

**Everything runs on your computer.** No cloud APIs, no accounts, no internet at runtime. The app
blocks outbound network requests in code, and a test checks it.

![Live session with the reactive audience](docs/img/live.jpg)

| Home | Debrief |
|---|---|
| ![Home](docs/img/home.jpg) | ![Debrief](docs/img/debrief.jpg) |

| Timeline | Learn |
|---|---|
| ![Timeline](docs/img/timeline.jpg) | ![Learn skill tree](docs/img/learn.jpg) |

![Play: quick games, Pace Runner, boss fights and the Locker](docs/img/play.jpg)

Built for the TSA Software Development event. The full design is in
[`docs/TECHNICAL_SPEC.md`](docs/TECHNICAL_SPEC.md), and the Learn games are described in
[`docs/LEARN_GAMES_SPEC.md`](docs/LEARN_GAMES_SPEC.md).

## Features

| | |
|---|---|
| **Live pacing** | Words per minute over rolling 5 s windows, color-banded (drag / slow / optimal / fast / rushing) |
| **Filler detection** | *um, uh, like, you know, so, basically…* from a hybrid of speech recognition, context rules and acoustics |
| **Boredom Index** | Fuses filler density, pitch/loudness monotony, gaze and pace into one 0–100 engagement score; audiences lose interest faster than they regain it |
| **Eye-contact zones** | MediaPipe face mesh + iris tracking → Left / Center / Right audience / Notes. A 12-second room calibration is required before each run and handles glasses |
| **Reactive audience** | 9–18 avatars, each with its own personality. A seating section you ignore drifts toward boredom; look at it and it perks up |
| **Deep debrief** | Whisper transcript, pitch analysis via Praat, pace change-points (PELT), filler clusters (DBSCAN), structure checks, composite score |
| **Spoken feedback** | Piper TTS reads the debrief and the follow-up questions aloud |
| **Q&A round** | After the analysis: 5 on-topic questions about what you just said, read aloud. Pick one or two and answer on the spot under a timer, and each answer gets its own full feedback. Built from keyphrases (YAKE + TF-IDF against 60 public-domain speeches) and rule templates, with no LLM |
| **Learn** | 8 modules (Structure, Evidence, Commentary, Clarity, Speaking speed, Filler words, Vocal variety, Eye contact) on a skill tree. Step-by-step lessons with spoken examples, and short speaking practices graded by the same analysis that scores your speeches. XP, levels and streaks |
| **Play** | Quick games (Claim Duel, Spot the Hedge, Signpost Sorter, Evidence or Anecdote), the Pace Runner speaking game, and optional module boss fights. Mastered skills turn rusty when later runs slip |
| **Locker** | Cosmetics unlocked through progress: accent colors, ring and XP bar styles, title badges, audience looks and audience reactions |
| **Achievements** | Wood → bronze → silver → gold → diamond tiers for overall, structure, evidence and commentary, tracked separately for prepared and impromptu speeches |
| **History** | Every run is saved locally (NDJSON telemetry + SQLite index), with a progress trend and an average performance report across all runs |
| **Replay Mode** | Plays a recorded session back through the live pipeline. It's a demo-day safety net if a mic or camera fails |
| **Judge Demo Mode** | One toggle in settings unlocks every Learn module with sample progress, so the whole app can be shown in minutes. Your real progress comes back when you turn it off |

## Architecture

```mermaid
flowchart LR
  CAM[Webcam] --> MP[MediaPipe Face Landmarker<br/>renderer, GPU] --> GZ[Gaze zones<br/>One-Euro + Mahalanobis + sticky HMM]
  MIC[Microphone] --> RT
  GZ -- "gaze.sample 30 Hz" --> RT
  subgraph RT[Fast real-time engine · Python]
    VAD[Silero VAD] --> VOSK[Vosk streaming ASR<br/>timed partials]
    VOSK --> FIL[Filler rules]
    YIN[YIN pitch + RMS] --> FIL
    FIL --> BI[Boredom Index 4 Hz]
    VOSK --> WPM[Rolling WPM]
    WPM --> BI
  end
  BI -- "engagement.tick" --> AUD[3D audience · three.js]
  RT --> STORE[(session folder<br/>WAV + NDJSON)]
  STORE --> DEEP
  subgraph DEEP[Deep analysis engine · separate process]
    WH[faster-whisper + disfluency prompt] --> REC[Filler reconciliation]
    PR[Praat pitch · librosa RMS] --> SC[Scores]
    REC --> SEG[PELT pace regimes · DBSCAN clusters] --> SC
    WH --> NLP[YAKE + TF-IDF → questions] --> SC
    SC --> TTS[Piper TTS]
  end
  DEEP --> DEB[Debrief UI]
```

- **`apps/desktop/`**: Electron + React + TypeScript. Camera, face tracking, 3D audience, HUD, debrief, Learn and its games.
- **`engine/`**: Python 3.11. Real-time engine, deep-analysis engine, NLP, TTS, storage, Learn progress, achievements, WebSocket server.
- **`docs/`**: technical spec, Learn games spec, architecture decision records, evaluation.

Learn progress is not stored as a separate score. XP, mastery, rusty skills, achievements and unlocks
are recomputed from your saved runs each time, so deleting or re-analyzing a run keeps everything
consistent. Only lesson completions, quick-game scores and equipped cosmetics live in a small
`learn.json`.

## Getting started

Requirements: macOS / Windows / Linux, Python via [uv](https://docs.astral.sh/uv/), Node.js 22+, a
webcam and a microphone. On Linux you also need `libportaudio2`.

```bash
make setup     # Python + Node deps, downloads ~300 MB of models once (the only time Podium uses the network)
make dev       # launches the desktop app
```

Without `make`:

```bash
cd engine && uv sync --python 3.11 && uv run python ../scripts/fetch_models.py
cd ../apps/desktop && npm install && npm run dev
```

macOS will ask for camera and microphone permission on first launch.

### Browser dev mode (no Electron)

```bash
make engine    # engine on ws://127.0.0.1:8765, token "dev"
make web       # open http://127.0.0.1:5173
```

### Headless replay of any recording

```bash
cd engine && uv run python -m podium_engine replay path/to/speech.wav
```

## Tests and measurements

```bash
make test      # 79 Python tests (incl. end-to-end replay → analysis) + 49 TypeScript tests
make bench     # real-time factor, filler latency, analysis time on this machine
make smoke     # builds the app, launches it hidden, checks it connects to the engine
```

Measured on an Apple M1 (CPU only): the live engine runs **12.6× faster than real time**, and deep
analysis takes **0.29 s per second of speech**. Details and limitations are in
[`docs/evaluation/`](docs/evaluation/README.md).

## Privacy

Recordings, transcripts and telemetry stay in your OS app-data folder (`~/Library/Application
Support/Podium` on macOS, `%APPDATA%\Podium` on Windows). Delete any session from the History screen.
The Electron main process cancels every non-local request, the renderer's Content-Security-Policy only
allows loopback connections, and the Python engine replaces `socket.connect` with a guard that rejects
non-loopback hosts.

## Known limitations

- Live filler alerts arrive about **1.6 s** after the filler (Vosk partial-result lag); the deep
  analysis is more accurate.
- Accuracy numbers so far come from a synthetic fixture. A labelled set of real recordings is the next
  step (`scripts/evaluate_fillers.py`).
- English only. One speaker.
- The installer packaging (PyInstaller + electron-builder) is not set up yet. Run from source for now.

## License

MIT for Podium's code. Models and some libraries have their own licenses; see
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) (Piper TTS and Parselmouth are GPL-3.0).
