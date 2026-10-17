// Session lifecycle:
//   speech → stop (deep analysis starts in the background) → Q&A round (pick 1-2 questions,
//   answer each on the spot) → results. Replays skip the Q&A round.
import { openSession } from "../../App";
import { engine } from "../../lib/engine";
import { setStreaming, startRecording, stopRecording, videoLabel } from "../../lib/camera";
import { micLabel, startMic, streamTo } from "../../lib/mic";
import { live, useApp } from "../../stores/app";

export interface AnswerTarget {
  parentId: string;
  question: string;
  seconds: number;
}

export async function startSession(replayFrom: string | null = null, answer: AnswerTarget | null = null): Promise<void> {
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
    title: answer ? `Answer: ${answer.question}` : replayFrom ? `Replay: ${s.title}` : s.title,
    mode: answer ? "qa" : "practice",
    parentSessionId: answer?.parentId,
    question: answer?.question,
    targetDurationSec: answer ? answer.seconds : s.targetMinutes ? s.targetMinutes * 60 : null,
    audienceSize: s.audienceSize,
    notes: answer ? false : s.notes, // an on-the-spot answer has no notes
    replaySessionId: replayFrom,
    speed: 1,
    calibration: st.calibrated ? { zoneModel: st.zoneModel, gains: st.gains, flipYaw: s.flipYaw } : null,
    videoInput: videoLabel(),
  });
  live.reset();
  st.set({ sessionId: res.sessionId, replayFrom, replayDuration: res.replayDuration, screen: "live", analysisError: null,
    analysis: null });
  if (answer) st.set({ qa: { ...useApp.getState().qa!, answering: true } });
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
  const qa = st.qa;
  const wasReplay = !!st.replayFrom;
  try {
    setStreaming(false);
    streamTo(null);
    const blob = await stopRecording();
    const res = await engine.request<{ sessionId: string }>("session.stop", { analyze: true }, 60000);
    if (qa?.answering) {
      // One answer done: on to the next picked question, or to the results.
      const next = qa.index + 1;
      if (next < qa.picked.length) st.set({ qa: { ...qa, index: next, answering: false }, screen: "qa" });
      else await finishQA();
    } else if (wasReplay) {
      st.set({ screen: "analyzing", sessionId: res.sessionId, analysis: { stage: "transcribe", pct: 0, sessionId: res.sessionId } });
    } else {
      st.set({
        screen: "qa",
        qa: { parentId: res.sessionId, questions: null, picked: [], index: -1, seconds: 60, answering: false },
        mainAnalysis: { stage: "transcribe", pct: 0, done: false },
      });
    }
    if (blob) await engine.uploadVideo(res.sessionId, blob).catch(() => st.set({ toast: "Video could not be saved" }));
  } catch (e) {
    st.set({ toast: `Stop failed: ${(e as Error).message}` });
  } finally {
    stopping = false;
  }
}

/** Leave the Q&A round (finished or skipped) and show the speech's results. */
export async function finishQA(): Promise<void> {
  const st = useApp.getState();
  const parentId = st.qa?.parentId;
  st.set({ qa: null });
  if (!parentId) return st.go("home");
  st.set({ sessionId: parentId, analysis: st.mainAnalysis && !st.mainAnalysis.done ? { ...st.mainAnalysis, sessionId: parentId } : null });
  await openSession(parentId, false);
}
