// One camera stream + one face tracker for the whole app (setup → calibration → live).
import { engine } from "./engine";
import { micStream } from "./mic";
import { FaceTracker } from "./faceTracker";
import { live, useApp } from "../stores/app";

let stream: MediaStream | null = null;
let video: HTMLVideoElement | null = null;
export const tracker = new FaceTracker();
let trackerStarted = false;
let recorder: MediaRecorder | null = null;
let chunks: Blob[] = [];
export let streaming = false; // forward gaze samples to the engine

export async function startCamera(): Promise<MediaStream> {
  if (stream) return stream;
  stream = await navigator.mediaDevices.getUserMedia({
    video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 }, facingMode: "user" },
    audio: false,
  });
  video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  await video.play();
  tracker.onSample = (s) => {
    live.gaze = s;
    if (streaming) {
      engine.send("gaze.sample", s);
      live.gazeHistory.push({ t: s.t, zone: s.zone });
      if (live.gazeHistory.length > 30 * 60 * 15) live.gazeHistory.splice(0, 30 * 60);
    }
  };
  if (!trackerStarted) {
    trackerStarted = true;
    const st = useApp.getState();
    tracker.flipYaw = st.settings.flipYaw;
    tracker.model = st.zoneModel;
    tracker.gains = st.gains;
    await tracker.start(video);
  }
  return stream;
}

export function cameraStream(): MediaStream | null {
  return stream;
}

export function videoLabel(): { name: string; width?: number; height?: number; fps?: number } | null {
  const t = stream?.getVideoTracks()[0];
  if (!t) return null;
  const s = t.getSettings();
  return { name: t.label, width: s.width, height: s.height, fps: s.frameRate };
}

export function setStreaming(on: boolean): void {
  streaming = on;
}

export async function startRecording(): Promise<void> {
  if (!stream) return;
  chunks = [];
  // Include the mic in the video file so playback is self-contained (the engine records its own WAV too).
  const mic = micStream();
  const recStream = new MediaStream([...stream.getVideoTracks(), ...(mic ? mic.getAudioTracks() : [])]);
  const mime = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"].find((m) =>
    MediaRecorder.isTypeSupported(m),
  );
  recorder = new MediaRecorder(recStream, { mimeType: mime, videoBitsPerSecond: 1_200_000 });
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  recorder.start(1000);
}

export function stopRecording(): Promise<Blob | null> {
  return new Promise((resolve) => {
    if (!recorder || recorder.state === "inactive") return resolve(null);
    const r = recorder;
    r.onstop = () => {
      resolve(chunks.length ? new Blob(chunks, { type: "video/webm" }) : null);
      recorder = null;
    };
    r.stop();
  });
}

export function pauseRecording(): void {
  if (recorder?.state === "recording") recorder.pause();
}

export function resumeRecording(): void {
  if (recorder?.state === "paused") recorder.resume();
}
