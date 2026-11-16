// Speaking screen: only what helps while talking. Analytics come after.
import { useEffect, useRef } from "react";
import { cameraStream } from "../../lib/camera";
import { micLevelDb } from "../../lib/mic";
import { live, SPEED_BANDS, useApp, useTicker } from "../../stores/app";
import { Icon } from "../../ui/icons";
import { Odometer } from "../../ui/kit";
import AudienceScene from "../audience/Audience";
import { token } from "../debrief/charts";
import CueWord from "./Cue";
import { stopSession, togglePause } from "./session";

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** Analog VU meter: tick-marked arc, a zone band, a needle that eases to the value (0..1). */
function VU({ value, label, readout, band }: { value: number; label: string; readout: string; band?: [number, number] }) {
  const a = (v: number) => -50 + Math.max(0, Math.min(1, v)) * 100; // degrees from vertical
  const pt = (v: number, r: number) => {
    const t = (a(v) * Math.PI) / 180;
    return [100 + Math.sin(t) * r, 58 - Math.cos(t) * r];
  };
  const arc = (v0: number, v1: number, r: number) => {
    const [x0, y0] = pt(v0, r), [x1, y1] = pt(v1, r);
    return `M${x0},${y0}A${r},${r} 0 0 1 ${x1},${y1}`;
  };
  return (
    <div className="vu" title={label}>
      <span className="label">{label} <span style={{ color: "var(--paper)" }}>{readout}</span></span>
      <svg viewBox="0 0 200 64" preserveAspectRatio="xMidYMax meet" role="meter" aria-label={label} aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
        <path d={arc(0, 1, 52)} fill="none" stroke="var(--concrete)" strokeOpacity={0.3} />
        {band && <path d={arc(band[0], band[1], 52)} fill="none" stroke="var(--paper)" strokeWidth={3} />}
        <path d={arc(0.85, 1, 52)} fill="none" stroke="var(--signal)" strokeWidth={3} />
        {Array.from({ length: 21 }, (_, i) => {
          const [x0, y0] = pt(i / 20, 52), [x1, y1] = pt(i / 20, i % 5 ? 47 : 43);
          return <line key={i} x1={x0} y1={y0} x2={x1} y2={y1} stroke="var(--concrete)" strokeOpacity={i % 5 ? 0.4 : 0.8} />;
        })}
        <g className="vu-needle" style={{ transform: `rotate(${a(value)}deg)` }}>
          <line x1={100} y1={58} x2={100} y2={10} stroke="var(--signal)" strokeWidth={1.5} />
        </g>
        <rect x={96} y={54} width={8} height={8} fill="var(--paper)" />
      </svg>
    </div>
  );
}

/** Scrolling mic waveform with peak-hold markers; drives the mic pulse ring too. One rAF loop, no React state. */
function WaveStrip({ pulse, active }: { pulse: React.RefObject<HTMLDivElement | null>; active: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const W = 200, H = 40, dpr = Math.min(1.5, devicePixelRatio || 1);
    cv.width = W * dpr;
    cv.height = H * dpr;
    const ctx = cv.getContext("2d")!;
    ctx.scale(dpr, dpr);
    const col = { bg: token("--charcoal-900"), line: token("--paper"), peak: token("--signal"), grid: token("--charcoal-500") };
    const hist = new Float32Array(100);
    let peak = 0, peakAt = 0, raf = 0, last = 0;
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (now - last < 33) return; // 30 Hz is plenty for a strip
      last = now;
      const db = active ? micLevelDb() : -120;
      const v = Math.max(0, Math.min(1, (db + 60) / 60));
      hist.copyWithin(0, 1);
      hist[hist.length - 1] = v;
      if (v >= peak || now - peakAt > 1500) { peak = v; peakAt = now; }
      pulse.current?.style.setProperty("--lvl", (0.6 + v * 0.8).toFixed(3));
      ctx.fillStyle = col.bg;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = col.grid;
      for (let x = 0; x < W; x += 20) ctx.fillRect(x, 0, 1, H);
      ctx.fillRect(0, H / 2, W, 1);
      ctx.fillStyle = col.line;
      for (let i = 0; i < hist.length; i++) {
        const h = Math.max(1, hist[i] * (H - 6));
        ctx.fillRect(i * 2, (H - h) / 2, 1, h);
      }
      ctx.fillStyle = col.peak;
      const ph = peak * (H - 6);
      ctx.fillRect(W - 8, (H - ph) / 2 - 1, 8, 2);
      ctx.fillRect(W - 8, (H + ph) / 2 - 1, 8, 2);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [active, pulse]);
  return (
    <div className="wave-strip">
      <span className="label">Mic</span>
      <canvas ref={ref} aria-hidden />
    </div>
  );
}

export default function Live() {
  const { settings, replayFrom, replayDuration, qa, paused } = useApp();
  const answering = qa?.answering && qa.questions ? qa : null;
  const question = answering ? answering.questions![answering.picked[answering.index]].question : null;
  const pipRef = useRef<HTMLVideoElement>(null);
  const pulseRef = useRef<HTMLDivElement>(null);
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
  const band = SPEED_BANDS[answering ? "impromptu" : settings.speechType];
  const wpm = live.pace && live.pace.label !== "pause" ? live.pace.wpmEma : null;
  const WPM_MAX = 240;

  // An answer stops itself at its time limit.
  useEffect(() => {
    if (left !== null && left <= 0) void stopSession();
  }, [left]);

  return (
    <div className="live2">
      <div className="live2-top">
        <div className="live2-time" title={target ? `Target ${fmt(target)}` : undefined}>
          <span className={`label rec-dot ${paused ? "paused" : ""}`}>{replayFrom ? "Replay" : paused ? "Paused" : answering ? "Rec · time left" : "Rec"}</span>
          <b style={{ color: left !== null && left <= 10 ? "var(--signal)" : undefined }}><Odometer value={left !== null ? fmt(left) : fmt(elapsed)} /></b>
          <span className="sub">{replayDuration ? `of ${fmt(replayDuration)}` : target && !answering ? `of ${fmt(target)}` : ""}</span>
        </div>
        <div className="live2-eng" title="How engaged your audience is right now">
          <VU value={E / 100} label="Audience" readout={String(E).padStart(3, "0")} band={[0.65, 1]} />
          <VU value={(wpm ?? 0) / WPM_MAX} label="Pace" readout={wpm != null ? `${Math.round(wpm)} WPM` : "--- WPM"}
            band={[band[0] / WPM_MAX, band[1] / WPM_MAX]} />
          <WaveStrip pulse={pulseRef} active={!replayFrom && !paused} />
        </div>
        <div className="live2-fill" title="Filler words so far">
          <span className="label">Fillers</span>
          <b>{live.fillers.length}</b>
        </div>
        <div className="live2-actions">
          {!replayFrom && (
            <button className="btn" onClick={() => void togglePause()} aria-pressed={paused}>
              <Icon name={paused ? "play" : "pause"} size={14} /> {paused ? "Resume" : "Pause"}
            </button>
          )}
          <button className="btn primary" onClick={() => void stopSession()}>
            <Icon name="stop" size={14} /> {answering ? "Finish answer" : "Finish"}
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
        <AudienceScene size={20} live={!replayFrom && !paused} />
        {flash && !paused && (
          <div className="filler-flash" key={flash.at} style={question ? { top: 104 } : undefined}>
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
        {!replayFrom && (
          <div className="mic-pulse" ref={pulseRef} aria-hidden>
            <Icon name="mic" size={18} />
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
