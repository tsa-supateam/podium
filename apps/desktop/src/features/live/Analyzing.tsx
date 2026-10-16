import { useEffect, useState } from "react";
import { openSession } from "../../App";
import { useApp } from "../../stores/app";

const STAGES: [string, string][] = [
  ["transcribe", "Transcribing with Whisper (on-device)"],
  ["fillers", "Reconciling filler words"],
  ["prosody", "Measuring pitch and loudness"],
  ["pacing", "Finding pace changes"],
  ["structure", "Checking structure"],
  ["keyphrases", "Extracting key phrases"],
  ["questions", "Writing follow-up questions"],
  ["scoring", "Scoring"],
  ["tts", "Recording your spoken debrief"],
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
      if (Date.now() - start > 4000 && (await openSession(sessionId))) clearInterval(id);
    }, 3000);
    return () => clearInterval(id);
  }, [sessionId, analysisError]);

  return (
    <div className="center-card" style={{ maxWidth: 480 }}>
      {analysisError ? (
        <>
          <h2>Analysis failed</h2>
          <pre className="small muted" style={{ whiteSpace: "pre-wrap", textAlign: "left" }}>{analysisError}</pre>
          <button className="btn" onClick={() => go("history")}>Go to history</button>
        </>
      ) : (
        <>
          <div className="spinner" />
          <h2>Analyzing your speech…</h2>
          <div className="progress">
            <div style={{ width: `${overall * 100}%` }} />
          </div>
          <ul className="stage-list">
            {STAGES.map(([k, label], i) => (
              <li key={k} className={i < idx ? "done" : i === idx ? "current" : ""}>
                <span>{i < idx ? "✓" : i === idx ? "›" : "·"}</span> {label}
              </li>
            ))}
          </ul>
          <p className="muted small">The deep-analysis engine runs in its own process so it never slows down live feedback.</p>
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
