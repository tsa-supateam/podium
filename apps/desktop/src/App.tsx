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
import QA from "./features/qa/QA";
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
    // A speech with Q&A answers is one report: wait until the answers have been merged in.
    const linked = bundle.session?.answers?.length ?? 0;
    const combined = !linked || (bundle.summary?.qaRound?.length ?? 0) >= linked;
    const ready = !!bundle.summary && combined;
    if (bundle.summary && !combined) st.set({ analysis: { stage: "qa", pct: 0.5, sessionId } });
    st.set({ bundle, sessionId, screen: ready ? "debrief" : "analyzing" });
    return ready;
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
        case "analysis.progress": {
          // Several analyses can run at once (the speech, plus each Q&A answer), so route by session.
          const st = useApp.getState();
          const d = { stage: ev.data.stage, pct: ev.data.pct, sessionId: ev.data.sessionId };
          if (d.sessionId === st.qa?.parentId) set({ mainAnalysis: { stage: d.stage, pct: d.pct, done: d.stage === "done" } });
          if (d.sessionId === st.sessionId && st.screen === "analyzing") set({ analysis: d });
          break;
        }
        case "session.updated": {
          // the speech and its Q&A answers were merged into one report
          const st = useApp.getState();
          const id = ev.data.sessionId as string;
          if (id === st.sessionId && st.screen === "analyzing") void openSession(id, false);
          if (st.screen === "debrief" && st.bundle?.sessionId === id) void openSession(id, false);
          break;
        }
        case "audio.silent":
          set({ toast: ev.data.message });
          break;
        case "analysis.done": {
          const st = useApp.getState();
          const id = ev.data.sessionId as string;
          if (id === st.qa?.parentId) set({ mainAnalysis: { stage: "done", pct: 1, done: true } });
          if (id === st.sessionId && st.screen === "analyzing") {
            set({ analysis: null });
            void openSession(id);
          }
          // A Q&A answer finished analyzing while its speech's results are open: refresh them.
          if (st.screen === "debrief" && st.bundle?.answers?.some((a) => a.sessionId === id)) {
            void openSession(st.bundle.sessionId, false);
          }
          break;
        }
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
            {screen === "qa" && <QA />}
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
  const inSession = screen === "live" || screen === "calibrate" || screen === "qa";
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
