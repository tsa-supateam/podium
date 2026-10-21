// Speaking screen: only what helps while talking. Analytics come after.
import { useEffect, useRef } from "react";
import { cameraStream } from "../../lib/camera";
import { live, useApp, useTicker } from "../../stores/app";
import AudienceScene from "../audience/Audience";
import CueWord from "./Cue";
import { stopSession, togglePause } from "./session";

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export default function Live() {
  const { settings, replayFrom, replayDuration, qa, paused } = useApp();
  const answering = qa?.answering && qa.questions ? qa : null;
  const question = answering ? answering.questions![answering.picked[answering.index]].question : null;
  const pipRef = useRef<HTMLVideoElement>(null);
  useTicker(10);

  useEffect(() => {
    const s = cameraStream();
    if (pipRef.current && s && !replayFrom) pipRef.current.srcObject = s;
  }, [replayFrom]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") void stopSession();
      if (e.key === " " && !replayFrom) {
        e.preventDefault();
        void togglePause();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [replayFrom]);

  const tick = live.tick;
  const elapsed = tick?.t ?? 0;
  const E = tick?.E ?? 70;
  const flash = live.lastFiller && performance.now() - live.lastFiller.at < 1400 ? live.lastFiller : null;
  const target = answering ? answering.seconds : settings.targetMinutes ? settings.targetMinutes * 60 : null;
  const left = answering ? Math.max(0, answering.seconds - elapsed) : null;
  const eColor = E >= 65 ? "var(--good)" : E >= 35 ? "var(--warn)" : "var(--bad)";

  // An answer stops itself at its time limit.
  useEffect(() => {
    if (left !== null && left <= 0) void stopSession();
  }, [left]);

  return (
    <div className="live2">
      <div className="live2-top">
        <div className="live2-time" title={target ? `Target ${fmt(target)}` : undefined}>
          <span className="label">{replayFrom ? "Replay" : answering ? "Time left" : "Time"}</span>
          <b style={{ color: left !== null && left <= 10 ? "var(--bad)" : undefined }}>{left !== null ? fmt(left) : fmt(elapsed)}</b>
          <span className="sub">{replayDuration ? `of ${fmt(replayDuration)}` : target && !answering ? `of ${fmt(target)}` : ""}</span>
        </div>
        <div className="live2-eng" title="How engaged your audience is right now">
          <span className="label">Audience</span>
          <div className="engagement-bar">
            <div className="needle" style={{ left: `calc(${E}% - 2px)` }} />
          </div>
          <b style={{ color: eColor }}>{E}</b>
        </div>
        <div className="live2-fill" title="Filler words so far">
          <span className="label">Fillers</span>
          <b>{live.fillers.length}</b>
        </div>
        <div className="live2-actions">
          {!replayFrom && (
            <button className="btn" onClick={() => void togglePause()} aria-pressed={paused}>
              {paused ? "▶ Resume" : "❚❚ Pause"}
            </button>
          )}
          <button className="btn primary" onClick={() => void stopSession()}>
            {answering ? "■ Finish answer" : "■ Finish"}
          </button>
        </div>
      </div>

      <div className="stage">
        {question && (
          <div className="qa-banner">
            <span className="kind">Question {answering!.index + 1} of {answering!.picked.length}</span>
            <span>{question}</span>
          </div>
        )}
        <AudienceScene size={15} />
        {flash && !paused && (
          <div className="filler-flash" key={flash.at} style={question ? { top: 96 } : undefined}>
            “{flash.token}”
          </div>
        )}
        {settings.difficulty === "coach" && !paused && <CueWord />}
        {paused && (
          <div className="paused-overlay">
            <b>Paused</b>
            <span className="muted">Press Space or Resume when you're ready.</span>
          </div>
        )}
        {replayFrom && (
          <div className="replay-banner">
            <span className="pill warn">
              <span className="dot" /> Replay
            </span>
          </div>
        )}
        {settings.showCamera && !replayFrom && (
          <div className="pip">
            <video ref={pipRef} autoPlay muted playsInline />
          </div>
        )}
      </div>

      <div className="caption live2-caption">
        <span>
          {live.finals.slice(-3).join(" ")} <span className="partial">{live.partial}</span>
        </span>
      </div>
    </div>
  );
}
