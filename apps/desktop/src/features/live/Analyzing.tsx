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
  const { analysis, analysisError, go } = useApp();
  const idx = analysis ? STAGES.findIndex(([k]) => k === analysis.stage) : 0;
  const overall = analysis ? Math.min(1, (Math.max(idx, 0) + (analysis.pct ?? 0)) / STAGES.length) : 0;
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
        </>
      )}
    </div>
  );
}
