import { useEffect, useLayoutEffect, useRef, useState } from "react";
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
import Learn from "./features/learn/Learn";
import { stopSession } from "./features/live/session";
import type { Screen } from "./stores/app";
import { BootSplash, LogoLockup } from "./ui/logo";
import { Icon } from "./ui/icons";
import { ZonePatterns } from "./ui/kit";
import { installCardLight } from "./ui/motion";
import Gallery from "./ui/Gallery";

/** Screen names for the shutter transition. */
const SECTION: Record<Screen, string> = {
  home: "Home", learn: "Learn", history: "History", setup: "Setup", calibrate: "Calibrate", live: "Live", qa: "Q&A",
  analyzing: "Processing", debrief: "Debrief",
};

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

  useEffect(() => installCardLight(), []);
  const [gallery, setGallery] = useState(() => import.meta.env.DEV && location.hash === "#gallery");
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const on = () => setGallery(location.hash === "#gallery");
    window.addEventListener("hashchange", on);
    // dev-only handle for screenshots and fps checks
    (window as unknown as { __podium: unknown }).__podium = { useApp, openSession, engine, live };
    return () => window.removeEventListener("hashchange", on);
  }, []);

  return (
    <div className={`app ${screen === "live" ? "recording" : ""}`}>
      <ZonePatterns />
      <ConstructionGrid />
      <TopBar />
      <main className="main">
        {gallery ? <Gallery /> : (
          <>
            {conn !== "open" && screen !== "live" ? <Connecting /> : null}
            {conn === "open" || screen === "live" ? (
              <div key={screen} className="screen">
                {screen === "home" && <Home />}
                {screen === "history" && <History />}
                {screen === "learn" && <Learn />}
                {screen === "setup" && <Setup />}
                {screen === "calibrate" && <Calibration />}
                {screen === "live" && <Live />}
                {screen === "qa" && <QA />}
                {screen === "analyzing" && <Analyzing />}
                {screen === "debrief" && <Debrief />}
              </div>
            ) : null}
          </>
        )}
      </main>
      <Shutter screen={screen} />
      {toast && <div className="toast" role="status"><span className="micro">SYS.MSG</span>{toast}</div>}
      <div className="grain" aria-hidden />
      <BootSplash />
    </div>
  );
}

/** Charcoal panel with a diagonal edge that wipes off, flashing the new screen's index code. */
function Shutter({ screen }: { screen: Screen }) {
  const first = useRef(true);
  const [n, setN] = useState(0);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setN((x) => x + 1);
  }, [screen]);
  if (!n) return null;
  return (
    <div className="shutter" key={n} aria-hidden onAnimationEnd={(e) => e.target === e.currentTarget && setN(0)}>
      <div className="shutter-label">{SECTION[screen]}</div>
    </div>
  );
}

/** Construction grid: two hairlines on the page's content edges, so every screen lines up with them. */
function ConstructionGrid() {
  return (
    <div className="cgrid" aria-hidden>
      <div className="cgrid-inner">
        <span className="cgrid-v" style={{ left: "var(--gutter)" }} />
        <span className="cgrid-v" style={{ right: "var(--gutter)" }} />
      </div>
    </div>
  );
}

const NAV: [Screen, string][] = [["home", "Home"], ["learn", "Learn"], ["history", "History"]];

function TopBar() {
  const { screen, go, conn } = useApp();
  const inSession = screen === "live" || screen === "calibrate" || screen === "qa";
  const navRef = useRef<HTMLElement>(null);
  const [ind, setInd] = useState<{ x: number; w: number } | null>(null);
  useLayoutEffect(() => {
    const el = navRef.current?.querySelector<HTMLElement>("button.active");
    setInd(el ? { x: el.offsetLeft, w: el.offsetWidth } : null);
  }, [screen]);
  const open = (s: Screen) => {
    if (s === "learn") useApp.getState().set({ learnPath: { module: null, skill: null } });
    go(s);
  };
  return (
    <header className="topbar">
      <button className="brand" onClick={() => !inSession && go("home")} disabled={inSession} aria-label="Podium home">
        <LogoLockup size={26} />
      </button>
      <nav className="nav" ref={navRef}>
        {NAV.map(([s, label]) => (
          <button key={s} className={screen === s ? "active" : ""} disabled={inSession} onClick={() => open(s)}>
            {label}
          </button>
        ))}
        <span className="nav-ind" style={{ transform: ind ? `translateX(${ind.x}px) scaleX(${ind.w})` : "scaleX(0)" }} />
      </nav>
      <div className="status">
        <span className={`pill ${conn === "open" ? "ok" : "warn"}`} title="All processing happens on this computer">
          <span className="dot" /> Offline · on-device
        </span>
        {conn !== "open" && <span className="pill warn">Engine {conn}</span>}
        {screen !== "home" && screen !== "setup" && !inSession && (
          <button className="cta" onClick={() => go("setup")}>
            Start session <Icon name="arrowR" size={14} />
          </button>
        )}
      </div>
      <WindowControls />
    </header>
  );
}

/** Minimize / maximize-restore / close for the frameless window (Electron only). */
function WindowControls() {
  const [max, setMax] = useState(false);
  useEffect(() => window.podium?.onMaximized?.(setMax), []);
  const win = window.podium?.win;
  if (!win) return null;
  return (
    <div className="win-controls">
      <button onClick={() => win("min")} aria-label="Minimize" title="Minimize">
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden><path d="M1.5 6h9" stroke="currentColor" strokeWidth="1.2" /></svg>
      </button>
      <button onClick={() => win("max")} aria-label={max ? "Restore" : "Maximize"} title={max ? "Restore" : "Maximize"}>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden>
          {max ? <><path d="M3.5 1.5h7v7" /><rect x="1.5" y="3.5" width="7" height="7" /></> : <path d="M1.5 3.5l2-2h7v7l-2 2h-7z" />}
        </svg>
      </button>
      <button className="close" onClick={() => win("close")} aria-label="Close" title="Close">
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.2" /></svg>
      </button>
    </div>
  );
}

function Connecting() {
  const { conn, connDetail } = useApp();
  return (
    <div className="center-card">
      <div className="spinner" />
      <span className="micro">SYS.BOOT / ENGINE {conn.toUpperCase()}</span>
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
