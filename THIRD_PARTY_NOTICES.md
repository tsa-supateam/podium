# Third-party components

Podium's own code is MIT-licensed (see `LICENSE`). It relies on the following components.
Verify each license again before distributing a build.

## Models (downloaded by `scripts/fetch_models.py`, never at runtime)

| Asset | Source | License |
|---|---|---|
| `vosk-model-small-en-us-0.15` | alphacephei.com/vosk/models | Apache-2.0 |
| `faster-whisper-base.en` (CTranslate2 conversion of OpenAI Whisper base.en) | huggingface.co/Systran | MIT |
| Silero VAD v6 (bundled inside the `faster-whisper` package) | github.com/snakers4/silero-vad | MIT |
| `face_landmarker.task` + MediaPipe WASM runtime | Google MediaPipe | Apache-2.0 |
| Piper voice `en_US-lessac-medium` | huggingface.co/rhasspy/piper-voices | See the voice's `MODEL_CARD` (trained on the Blizzard 2013 Lessac dataset; check its terms before any commercial use) |
| NLTK data: punkt_tab, averaged_perceptron_tagger_eng, stopwords, inaugural | nltk.org | Apache-2.0 / public domain (inaugural addresses) |

## Libraries

**Python:** numpy, scipy, scikit-learn (BSD-3); librosa (ISC); praat-parselmouth (GPL-3.0); ruptures (BSD-2);
nltk (Apache-2.0); yake (LGPL-3.0); websockets (BSD-3); sounddevice / soundfile (MIT / BSD-3);
onnxruntime (MIT); vosk (Apache-2.0); faster-whisper (MIT); **piper-tts 1.8 (GPL-3.0)**; pydantic (MIT).

**JavaScript:** react, react-dom (MIT); three, @react-three/fiber (MIT); zustand (MIT);
@mediapipe/tasks-vision (Apache-2.0); electron (MIT); vite, vitest, esbuild, typescript (MIT / Apache-2.0).

## GPL note

`piper-tts` (piper1) and `praat-parselmouth` are GPL-3.0. Podium runs Piper in a **separate process**
(`podium_engine.tts.worker`) so it isn't linked into the engine. Parselmouth is imported only by the
deep-analysis process. If you distribute a combined binary, review the GPL obligations, or swap in
`librosa.pyin` (ISC) for pitch and a permissively licensed TTS.
