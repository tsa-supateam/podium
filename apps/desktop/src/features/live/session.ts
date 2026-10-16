// Session lifecycle: start (mic or replay) → live → stop → upload video → deep analysis.
import { engine } from "../../lib/engine";
import { setStreaming, startRecording, stopRecording, videoLabel } from "../../lib/camera";
import { micLabel, startMic, streamTo } from "../../lib/mic";
import { live, useApp } from "../../stores/app";

export async function startSession(replayFrom: string | null = null): Promise<void> {
  const st = useApp.getState();
  const s = st.settings;
  live.reset();
  if (!replayFrom) {
    try {
      await startMic(typeof s.audioDevice === "string" ? s.audioDevice : null);
    } catch (e) {
      throw new Error(`Microphone unavailable (${(e as Error).message}). Check the microphone permission for Podium.`);
    }
  }
  const res = await engine.request<{ sessionId: string; replayDuration: number | null }>("session.start", {
    audioSource: "app",
    audioDeviceName: micLabel(),
    title: replayFrom ? `Replay: ${s.title}` : s.title,
    mode: "practice",
    targetDurationSec: s.targetMinutes ? s.targetMinutes * 60 : null,
    audienceSize: s.audienceSize,
    notes: s.notes,
    replaySessionId: replayFrom,
    speed: 1,
    calibration: st.calibrated ? { zoneModel: st.zoneModel, gains: st.gains, flipYaw: s.flipYaw } : null,
    videoInput: videoLabel(),
  });
  live.reset();
  st.set({ sessionId: res.sessionId, replayFrom, replayDuration: res.replayDuration, screen: "live", analysisError: null,
    analysis: null });
  if (!replayFrom) {
    streamTo((pcm) => engine.sendAudio(res.sessionId, pcm));
    setStreaming(true);
    if (s.recordVideo) await startRecording().catch(() => {});
  }
}

let stopping = false;

export async function stopSession(): Promise<void> {
  if (stopping) return;
  stopping = true;
  const st = useApp.getState();
  try {
    setStreaming(false);
    streamTo(null);
    const blob = await stopRecording();
    const res = await engine.request<{ sessionId: string }>("session.stop", { analyze: true }, 60000);
    st.set({ screen: "analyzing", sessionId: res.sessionId, analysis: { stage: "transcribe", pct: 0, sessionId: res.sessionId } });
    if (blob) await engine.uploadVideo(res.sessionId, blob).catch(() => st.set({ toast: "Video could not be saved" }));
  } catch (e) {
    st.set({ toast: `Stop failed: ${(e as Error).message}` });
  } finally {
    stopping = false;
  }
}
