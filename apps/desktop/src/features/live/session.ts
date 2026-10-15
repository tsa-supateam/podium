// Session lifecycle: start (mic or replay) → live → stop → upload video → deep analysis.
import { engine } from "../../lib/engine";
import { setStreaming, startRecording, stopRecording, videoLabel } from "../../lib/camera";
import { live, useApp } from "../../stores/app";

export async function startSession(replayFrom: string | null = null): Promise<void> {
  const st = useApp.getState();
  const s = st.settings;
  live.reset();
  const res = await engine.request<{ sessionId: string; replayDuration: number | null }>("session.start", {
    title: replayFrom ? `Replay: ${s.title}` : s.title,
    mode: "practice",
    targetDurationSec: s.targetMinutes ? s.targetMinutes * 60 : null,
    audienceSize: s.audienceSize,
    audioDevice: s.audioDevice,
    replaySessionId: replayFrom,
    speed: 1,
    calibration: st.calibrated ? { zoneModel: st.zoneModel, gains: st.gains, flipYaw: s.flipYaw } : null,
    videoInput: videoLabel(),
  });
  live.reset();
  st.set({ sessionId: res.sessionId, replayFrom, replayDuration: res.replayDuration, screen: "live", analysisError: null,
    analysis: null });
  if (!replayFrom) {
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
    const blob = await stopRecording();
    const res = await engine.request<{ sessionId: string }>("session.stop", { analyze: true }, 60000);
    st.set({ screen: "analyzing", analysis: { stage: "transcribe", pct: 0, sessionId: res.sessionId } });
    if (blob) await engine.uploadVideo(res.sessionId, blob).catch(() => st.set({ toast: "Video could not be saved" }));
  } catch (e) {
    st.set({ toast: `Stop failed: ${(e as Error).message}` });
  } finally {
    stopping = false;
  }
}
