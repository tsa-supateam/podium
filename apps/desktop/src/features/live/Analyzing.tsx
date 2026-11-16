import { useEffect, useState } from "react";
import { openSession } from "../../App";
import { useApp } from "../../stores/app";
import { Icon } from "../../ui/icons";
import { ScreenHeader } from "../../ui/kit";

export const STAGES: [string, string][] = [
  ["transcribe", "Transcribing with Whisper (on-device)"],
  ["fillers", "Reconciling filler words"],
  ["prosody", "Measuring pitch and loudness"],
  ["pacing", "Finding pace changes"],
  ["structure", "Checking structure"],
  ["keyphrases", "Extracting key phrases"],
  ["scoring", "Scoring"],
  ["tts", "Recording your spoken debrief"],
  ["qa", "Adding your Q&A answers"],
];

export default function Analyzing() {
  const { analysis, analysisError, go, sessionId } = useApp();
  const [waited, setWaited] = useState(0);
  const done = analysis?.stage === "done";
  const idx = !analysis ? 0 : done ? STAGES.length : Math.max(0, STAGES.findIndex(([k]) => k === analysis.stage));
  const overall = analysis ? Math.min(1, (idx + (done ? 0 : analysis.pct ?? 0)) / STAGES.length) : 0;

  // Safety net: if the "done" event is missed for any reason, check the session folder directly.
  useEffect(() => {
    if (!sessionId || analysisError) return;
    const start = Date.now();
    const id = setInterval(async () => {
      setWaited(Math.round((Date.now() - start) / 1000));
      if (Date.now() - start > 4000 && (await openSession(sessionId, false))) clearInterval(id);
    }, 3000);
    return () => clearInterval(id);
  }, [sessionId, analysisError]);

  return (
    <div className="page analyzing stagger">
      <ScreenHeader title={analysisError ? "Analysis failed" : "Analyzing"} meta={analysisError ? undefined : [`${Math.round(overall * 100)}%`]} />
      {analysisError ? (
        <>
          <pre className="small muted" style={{ whiteSpace: "pre-wrap", textAlign: "left" }}>{analysisError}</pre>
          <button className="btn" onClick={() => go("history")}>Go to history <Icon name="arrowR" size={14} className="arw" /></button>
        </>
      ) : (
        <>
          <div className="scan-panel" aria-hidden>
            <span className="micro" style={{ right: 12, bottom: 10 }}>{STAGES[Math.min(idx, STAGES.length - 1)][0].toUpperCase()}</span>
            <div className="loader">
              <svg width="90" height="90" viewBox="0 0 90 90" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="45" cy="45" r="38" strokeDasharray="4 6" />
                <path d="M45 0v20M45 70v20M0 45h20M70 45h20" />
                <g className="inner"><rect x="33" y="33" width="24" height="24" /><path d="M45 37v16M37 45h16" stroke="var(--paper)" /></g>
              </svg>
            </div>
          </div>
          <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(overall * 100)}>
            {Array.from({ length: 32 }, (_, i) => <i key={i} className={i < Math.round(overall * 32) ? "on" : ""} />)}
          </div>
          <ul className="stage-list scroll">
            {STAGES.map(([k, label], i) => (
              <li key={k} className={i < idx ? "done" : i === idx ? "current" : ""}>
                <span className="micro">{String(i + 1).padStart(2, "0")}</span>
                <span>{i <= idx ? <span className="typed" key={`${k}-${i <= idx}`}>{label}</span> : label}</span>
                <span className="st-mark">{i < idx ? <Icon name="check" size={14} /> : i === idx ? <span className="micro" style={{ color: "inherit" }}>RUN</span> : <Icon name="minus" size={14} />}</span>
              </li>
            ))}
          </ul>
          <p className="muted small" style={{ marginTop: 14 }}>The deep-analysis engine runs in its own process so it never slows down live feedback.</p>
          {waited > 90 && (
            <div className="row">
              <span className="muted small">This is taking longer than usual.</span>
              <button className="btn ghost" onClick={() => go("history")}>Go to history</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
