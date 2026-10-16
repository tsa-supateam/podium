import { useEffect, useRef } from "react";
import { cameraStream } from "../../lib/camera";
import { zoneNames, type Zone } from "../../lib/types";
import { live, useApp, useTicker } from "../../stores/app";
import AudienceScene, { audienceStats } from "../audience/Audience";
import { stopSession } from "./session";

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const PACE_COLORS: Record<string, string> = {
  drag: "var(--bad)", slow: "var(--warn)", optimal: "var(--good)", fast: "var(--warn)", rushing: "var(--bad)", pause: "var(--faint)",
};

export default function Live() {
  const { settings, replayFrom, replayDuration } = useApp();
  const pipRef = useRef<HTMLVideoElement>(null);
  useTicker(10);

  useEffect(() => {
    const s = cameraStream();
    if (pipRef.current && s && !replayFrom) pipRef.current.srcObject = s;
  }, [replayFrom]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") void stopSession();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const tick = live.tick;
  const pace = live.pace;
  const elapsed = tick?.t ?? 0;
  const E = tick?.E ?? 70;
  const fillerCount = live.fillers.length;
  const perMin = elapsed > 20 ? (fillerCount / elapsed) * 60 : null;
  const flash = live.lastFiller && performance.now() - live.lastFiller.at < 1400 ? live.lastFiller : null;
  const target = settings.targetMinutes ? settings.targetMinutes * 60 : null;
  const counts = audienceStats.counts;

  return (
    <div className="live">
      <div className="live-top">
        <div className="stat">
          <div className="label">{replayFrom ? "Replay" : "Time"}</div>
          <div className="value">{fmt(elapsed)}</div>
          <div className="sub">
            {replayDuration ? `of ${fmt(replayDuration)}` : target ? `target ${fmt(target)}` : " "}
          </div>
        </div>
        <div className="stat" style={{ minWidth: 260, flex: 1 }}>
          <div className="label">Audience engagement</div>
          <div className="row" style={{ gap: 14 }}>
            <div className="value" style={{ color: E >= 65 ? "var(--good)" : E >= 35 ? "var(--warn)" : "var(--bad)" }}>
              {E}
            </div>
            <div style={{ flex: 1 }}>
              <div className="engagement-bar">
                <div className="needle" style={{ left: `calc(${E}% - 2px)` }} />
              </div>
              <div className="state-counts muted" style={{ marginTop: 6 }}>
                <span>🙂 {counts.engaged} engaged</span>
                <span>😐 {counts.neutral}</span>
                <span>😴 {counts.bored} bored</span>
                {counts.confused > 0 && <span>🤔 {counts.confused}</span>}
              </div>
            </div>
          </div>
        </div>
        <div className="stat">
          <div className="label">Speed (words/min)</div>
          <div className="value" style={{ color: PACE_COLORS[pace?.label ?? "pause"] }}>
            {pace && pace.label !== "pause" ? Math.round(pace.wpmEma) : "–"}
          </div>
          <div className="sub">{pace ? (pace.label === "pause" ? "pausing" : pace.label) : "target 130–170"}</div>
        </div>
        <div className="stat">
          <div className="label">Filler words</div>
          <div className="value" style={{ color: perMin != null && perMin > 4 ? "var(--bad)" : undefined }}>{fillerCount}</div>
          <div className="sub">{perMin != null ? `${perMin.toFixed(1)} / min` : " "}</div>
        </div>
      </div>

      <div className="stage">
        <AudienceScene size={settings.audienceSize} />
        {flash && (
          <div className="filler-flash" key={flash.at}>
            “{flash.token}”
          </div>
        )}
        {replayFrom && (
          <div className="replay-banner">
            <span className="pill warn">
              <span className="dot" /> Replay Mode: recorded audio and gaze through the live pipeline
            </span>
          </div>
        )}
        {settings.showCamera && !replayFrom && (
          <div className="pip">
            <video ref={pipRef} autoPlay muted playsInline />
          </div>
        )}
      </div>

      <aside className="side">
        <div>
          <h3 style={{ marginBottom: 8 }}>Where you're looking</h3>
          <ZoneMap />
        </div>
        <div>
          <h3 style={{ marginBottom: 4 }}>What's losing the audience</h3>
          <p className="muted small" style={{ margin: "0 0 8px" }}>Longer, redder bars hurt engagement more.</p>
          <Components />
        </div>
        <div>
          <h3 style={{ marginBottom: 8 }}>Mic level</h3>
          <div className="meter">
            <div style={{ width: `${Math.max(0, Math.min(100, ((tick?.levelDb ?? -90) + 60) * 1.8))}%` }} />
          </div>
        </div>
        <p className="muted small">
          Tip: look at the side of the room that's drifting. Its audience members will perk up.
        </p>
      </aside>

      <div className="caption">
        <span>
          {live.finals.slice(-3).join(" ")} <span className="partial">{live.partial}</span>
        </span>
      </div>
      <div className="stop-bar">
        <button className="btn primary big" style={{ width: "100%" }} onClick={() => void stopSession()}>
          ■ Finish &amp; analyze
        </button>
      </div>
    </div>
  );
}

function ZoneMap() {
  const notes = useApp((st) => st.settings.notes);
  const names = zoneNames(notes);
  const g = live.gaze;
  const hist = live.gazeHistory;
  const counts: Record<string, number> = { L: 0, C: 0, R: 0, N: 0, X: 0 };
  for (const h of hist) counts[h.zone] = (counts[h.zone] ?? 0) + 1;
  const total = hist.length || 1;
  const cell = (z: Zone, cls = "") => (
    <div
      className={`zone-cell ${cls} ${g?.zone === z ? "on" : ""}`}
      style={{ color: `var(--zone-${z})` }}
      title={names[z]}
    >
      <b>{Math.round((100 * counts[z]) / total)}%</b>
      <span className="small">{names[z]}</span>
    </div>
  );
  return (
    <div className="zone-map">
      {cell("L")}
      {cell("C")}
      {cell("R")}
      {cell("N", "notes")}
      <div className="muted small" style={{ gridColumn: "1 / -1" }}>
        {g?.face === false ? "Face not visible" : `Away ${Math.round((100 * counts.X) / total)}%`}
      </div>
    </div>
  );
}

function Components() {
  const c = live.tick?.c;
  const rows: [string, number | null | undefined, string][] = [
    ["Filler words", c?.filler, "How often you said um, uh, like… in the last 30 seconds"],
    ["Flat voice", c?.monotony, "How little your pitch and volume changed in the last 10 seconds"],
    ["Looking away", c?.gaze, "Time not looking at the audience in the last 10 seconds"],
    ["Speed", c?.pace, "How far your speed is from a comfortable 150 words per minute"],
  ];
  if (c?.silence != null) rows.push(["Long silence", c.silence, "You've been quiet for a while"]);
  return (
    <div className="components">
      {rows.map(([name, v, tip]) => (
        <Row key={name} name={name} v={v} tip={tip} />
      ))}
    </div>
  );
}

function Row({ name, v, tip }: { name: string; v: number | null | undefined; tip: string }) {
  return (
    <>
      <span title={tip}>{name}</span>
      <div className="bar">
        <div style={{ width: `${(v ?? 0) * 100}%`, background: v == null ? "var(--faint)" : v > 0.6 ? "var(--bad)" : v > 0.35 ? "var(--warn)" : "var(--good)" }} />
      </div>
      <span className="muted mono">{v == null ? "–" : Math.round(v * 100)}</span>
    </>
  );
}
