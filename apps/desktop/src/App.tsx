import { useEffect } from "react";
import { engine } from "./lib/engine";
import type { EngagementTick, FillerEventMsg, GazeSample, PaceTick, SessionBundle } from "./lib/types";
import { live, useApp } from "./stores/app";
import Home from "./features/history/Home";
import History from "./features/history/History";
import Setup from "./features/setup/Setup";
import Calibration from "./features/calibration/Calibration";
import Live from "./features/live/Live";
import Analyzing from "./features/live/Analyzing";
import Debrief from "./features/debrief/Debrief";
import { stopSession } from "./features/live/session";

/** Open a session's debrief. A session that was recorded but never analyzed gets analyzed now
 *  (unless `analyzeIfMissing` is false, as for the analyzing screen's own polling). */
export async function openSession(sessionId: string, analyzeIfMissing = true): Promise<boolean> {
  const st = useApp.getState();
  try {
    const bundle = await engine.request<SessionBundle>("session.get", { sessionId });
    if (!bundle.summary && analyzeIfMissing && bundle.session?.status !== "analyzing") {
      await engine.request("session.analyze", { sessionId });
      st.set({ analysis: { stage: "transcribe", pct: 0, sessionId }, analysisError: null });
    }
    st.set({ bundle, sessionId, screen: bundle.summary ? "debrief" : "analyzing" });
    return !!bundle.summary;
  } catch (e) {
    st.set({ toast: `Could not open the session: ${(e as Error).message}` });
    return false;
  }
}

export default function App() {
  const { screen, conn, set, toast } = useApp();

  useEffect(() => {
    engine.onStatus = (s, detail) => set({ conn: s, connDetail: detail });
    const off = engine.on((ev) => {
      switch (ev.type) {
        case "hello":
          set({ models: ev.data.models });
          break;
        case "engagement.tick": {
          const d = ev.data as EngagementTick;
          live.tick = d;
          live.eSeries.push({ t: d.t, E: d.E });
          break;
        }
        case "pace.tick": {
          const d = ev.data as PaceTick;
          live.pace = d;
          if (d.label !== "pause") live.wpmSeries.push({ t: d.t, wpm: d.wpmEma });
          break;
        }
        case "filler.detected": {
          const d = ev.data as FillerEventMsg;
          live.fillers.push(d);
          live.lastFiller = { ...d, at: performance.now() };
          break;
        }
        case "transcript.partial":
          live.partial = ev.data.text;
          break;
        case "transcript.final":
          live.finals.push(ev.data.words.map((w: { w: string }) => w.w).join(" "));
          live.partial = "";
          if (live.finals.length > 50) live.finals.shift();
          break;
        case "gaze.replay": {
          const g = ev.data as GazeSample;
          live.gaze = { ...g, zoneP: g.zoneP ?? {} } as GazeSample;
          live.gazeHistory.push({ t: g.t, zone: g.zone });
          break;
        }
        case "replay.ended":
          if (useApp.getState().screen === "live") void stopSession();
          break;
        case "analysis.progress":
          set({ analysis: { stage: ev.data.stage, pct: ev.data.pct, sessionId: ev.data.sessionId } });
          break;
        case "audio.silent":
          set({ toast: ev.data.message });
          break;
        case "analysis.done":
          set({ analysis: null });
          if (useApp.getState().screen === "analyzing") void openSession(ev.data.sessionId);
          break;
        case "analysis.failed":
          set({ analysisError: ev.data.message ?? "Analysis failed" });
          break;
      }
    });
    engine.connect().catch((e) => set({ conn: "closed", connDetail: String(e.message ?? e) }));
    return () => {
      off();
    };
  }, [set]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => set({ toast: null }), 3500);
    return () => clearTimeout(id);
  }, [toast, set]);

  return (
    <div className="app">
      <TopBar />
      <main className="main">
        {conn !== "open" && screen !== "live" ? <Connecting /> : null}
        {conn === "open" || screen === "live" ? (
          <>
            {screen === "home" && <Home />}
            {screen === "history" && <History />}
            {screen === "setup" && <Setup />}
            {screen === "calibrate" && <Calibration />}
            {screen === "live" && <Live />}
            {screen === "analyzing" && <Analyzing />}
            {screen === "debrief" && <Debrief />}
          </>
        ) : null}
      </main>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function TopBar() {
  const { screen, go, conn } = useApp();
  const inSession = screen === "live" || screen === "calibrate";
  return (
    <header className="topbar">
      <button className="brand" onClick={() => !inSession && go("home")} disabled={inSession}>
        <span className="brand-mark" aria-hidden>◐</span> Podium
      </button>
      <nav className="nav">
        <button className={screen === "home" ? "active" : ""} disabled={inSession} onClick={() => go("home")}>
          Home
        </button>
        <button className={screen === "history" ? "active" : ""} disabled={inSession} onClick={() => go("history")}>
          History
        </button>
      </nav>
      <div className="status">
        <span className={`pill ${conn === "open" ? "ok" : "warn"}`} title="All processing happens on this computer">
          <span className="dot" /> Offline · on-device
        </span>
        {conn !== "open" && <span className="pill warn">Engine {conn}</span>}
      </div>
    </header>
  );
}

function Connecting() {
  const { conn, connDetail } = useApp();
  return (
    <div className="center-card">
      <div className="spinner" />
      <h2>Starting the analysis engine…</h2>
      <p className="muted">
        Loading the speech models on this computer. {conn === "closed" && connDetail ? `(${connDetail})` : null}
      </p>
      {!window.podium && (
        <p className="muted small">
          Browser dev mode: run <code>uv run python -m podium_engine serve --port 8765 --token dev</code> in{" "}
          <code>engine/</code>.
        </p>
      )}
    </div>
  );
}
