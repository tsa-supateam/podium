// Small dependency-free SVG/canvas charts for the debrief.
import { useEffect, useMemo, useRef, useState } from "react";
import type { Summary, Zone } from "../../lib/types";

export function scoreColor(s: number): string {
  return s >= 80 ? "var(--good)" : s >= 60 ? "var(--warn)" : "var(--bad)";
}

export function ScoreRing({ score, grade }: { score: number; grade: string }) {
  const r = 86, c = 2 * Math.PI * r;
  return (
    <div className="score-ring">
      <svg viewBox="0 0 200 200" width="200" height="200">
        <circle cx="100" cy="100" r={r} fill="none" stroke="var(--panel-2)" strokeWidth="14" />
        <circle
          cx="100" cy="100" r={r} fill="none" stroke={scoreColor(score)} strokeWidth="14" strokeLinecap="round"
          strokeDasharray={`${(score / 100) * c} ${c}`} transform="rotate(-90 100 100)"
        />
      </svg>
      <div className="num">
        <div>
          <b>{score}</b>
          <span className="muted">out of 100 · grade {grade}</span>
        </div>
      </div>
    </div>
  );
}

const ZONE_COLOR: Record<Zone, string> = { L: "#6aa9ff", C: "#4fd18b", R: "#c792ea", N: "#f5b14c", X: "#3b4252" };

interface TimelineProps {
  s: Summary;
  current: number;
  onSeek: (t: number) => void;
}

/** Multi-lane timeline: engagement, pace, pitch, fillers, gaze ribbon, all on one time axis. */
export function Timeline({ s, current, onSeek }: TimelineProps) {
  const W = 1100, padL = 70, padR = 14;
  const lanes = { eng: [10, 70], pace: [90, 150], pitch: [170, 220], fill: [236, 256], gaze: [272, 288] } as const;
  const H = 312;
  const dur = Math.max(s.durationSec, 1);
  const x = (t: number) => padL + (t / dur) * (W - padL - padR);
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<{ t: number; px: number } | null>(null);

  const engPath = useMemo(() => {
    const e = s.engagement?.series;
    if (!e || !e.t.length) return null;
    const [y0, y1] = lanes.eng;
    const y = (v: number) => y1 - (v / 100) * (y1 - y0);
    const line = e.t.map((t, i) => `${i ? "L" : "M"}${x(t).toFixed(1)},${y(e.E[i]).toFixed(1)}`).join("");
    return { line, area: `${line}L${x(e.t[e.t.length - 1])},${y1}L${x(e.t[0])},${y1}Z` };
  }, [s]);

  const pacePath = useMemo(() => {
    const p = s.pacing.series;
    const t = p.smoothT ?? p.t, v = p.smooth ?? p.wpm;
    if (!t?.length) return "";
    const [y0, y1] = lanes.pace;
    const y = (w: number) => y1 - (Math.min(w, 240) / 240) * (y1 - y0);
    return t.map((tt, i) => `${i ? "L" : "M"}${x(tt).toFixed(1)},${y(v[i]).toFixed(1)}`).join("");
  }, [s]);

  const pitchPath = useMemo(() => {
    const tr = s.voice.track;
    const [y0, y1] = lanes.pitch;
    const y = (st: number) => (y0 + y1) / 2 - (Math.max(-8, Math.min(8, st)) / 8) * ((y1 - y0) / 2);
    let d = "", pen = false;
    tr.t.forEach((t, i) => {
      const st = tr.st[i];
      if (st == null) { pen = false; return; }
      d += `${pen ? "L" : "M"}${x(t).toFixed(1)},${y(st).toFixed(1)}`;
      pen = true;
    });
    return d;
  }, [s]);

  const paceY = (w: number) => lanes.pace[1] - (w / 240) * (lanes.pace[1] - lanes.pace[0]);

  const toTime = (clientX: number) => {
    const r = svgRef.current!.getBoundingClientRect();
    const px = ((clientX - r.left) / r.width) * W;
    return { t: Math.max(0, Math.min(dur, ((px - padL) / (W - padL - padR)) * dur)), px: clientX - r.left };
  };

  const gz = s.gaze?.timeline ?? [];

  return (
    <div className="chart-wrap">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        onMouseMove={(e) => setHover(toTime(e.clientX))}
        onMouseLeave={() => setHover(null)}
        onClick={(e) => onSeek(toTime(e.clientX).t)}
        style={{ cursor: "pointer" }}
      >
        {/* lane labels */}
        {[["Engagement", lanes.eng], ["Speed", lanes.pace], ["Voice pitch", lanes.pitch], ["Fillers", lanes.fill], ["Looking at", lanes.gaze]].map(
          ([label, [a, b]]: any) => (
            <text key={label} x={4} y={(a + b) / 2 + 4} fill="var(--muted)" fontSize="11">
              {label}
            </text>
          ),
        )}
        {/* shaded problem zones */}
        {s.pacing.accelZones.filter((z) => z.kind === "rush").map((z, i) => (
          <rect key={`r${i}`} x={x(z.t0)} width={Math.max(2, x(z.t1) - x(z.t0))} y={lanes.pace[0]} height={lanes.pace[1] - lanes.pace[0]} fill="#ff6b6b18" />
        ))}
        {s.voice.monotoneSegments.map((m, i) => (
          <rect key={`m${i}`} x={x(m.t0)} width={Math.max(2, x(m.t1) - x(m.t0))} y={lanes.pitch[0]} height={lanes.pitch[1] - lanes.pitch[0]} fill="#f5b14c18" />
        ))}
        {/* engagement */}
        <line x1={padL} x2={W - padR} y1={lanes.eng[1]} y2={lanes.eng[1]} stroke="var(--line)" />
        {engPath ? (
          <>
            <path d={engPath.area} fill="#4fd18b22" />
            <path d={engPath.line} fill="none" stroke="var(--good)" strokeWidth={2} />
          </>
        ) : (
          <text x={padL} y={45} fill="var(--faint)" fontSize="11">no live data</text>
        )}
        {/* pace band */}
        <rect x={padL} width={W - padL - padR} y={paceY(170)} height={paceY(130) - paceY(170)} fill="#4fd18b10" />
        <line x1={padL} x2={W - padR} y1={lanes.pace[1]} y2={lanes.pace[1]} stroke="var(--line)" />
        <path d={pacePath} fill="none" stroke="var(--info)" strokeWidth={2} />
        {/* pitch */}
        <line x1={padL} x2={W - padR} y1={(lanes.pitch[0] + lanes.pitch[1]) / 2} y2={(lanes.pitch[0] + lanes.pitch[1]) / 2} stroke="var(--line)" />
        <path d={pitchPath} fill="none" stroke="var(--zone-R)" strokeWidth={1.2} opacity={0.9} />
        {/* fillers */}
        {s.fillers.clusters.map((c, i) => (
          <rect key={`c${i}`} x={x(c.t0) - 3} width={Math.max(6, x(c.t1) - x(c.t0) + 6)} y={lanes.fill[0] - 3} height={lanes.fill[1] - lanes.fill[0] + 6} rx={4} fill="#ff6b6b22" stroke="#ff6b6b66" />
        ))}
        {s.fillers.events.map((f, i) => (
          <circle key={`f${i}`} cx={x(f.t0)} cy={(lanes.fill[0] + lanes.fill[1]) / 2} r={4.5} fill={f.class === "lexical" ? "#ff9f6b" : "#ff6b6b"}>
            <title>{`${f.token} @ ${f.t0.toFixed(1)}s`}</title>
          </circle>
        ))}
        {/* gaze ribbon */}
        {gz.length ? (
          gz.map(([t, z], i) => {
            const t1 = i + 1 < gz.length ? gz[i + 1][0] : dur;
            return <rect key={`g${i}`} x={x(t)} width={Math.max(0.5, x(t1) - x(t))} y={lanes.gaze[0]} height={lanes.gaze[1] - lanes.gaze[0]} fill={ZONE_COLOR[z]} />;
          })
        ) : (
          <text x={padL} y={lanes.gaze[1] - 2} fill="var(--faint)" fontSize="11">no camera data</text>
        )}
        {/* time axis */}
        {Array.from({ length: Math.floor(dur / 30) + 1 }, (_, i) => i * 30).map((t) => (
          <text key={t} x={x(t)} y={H - 4} fill="var(--faint)" fontSize="10" textAnchor="middle">
            {Math.floor(t / 60)}:{String(t % 60).padStart(2, "0")}
          </text>
        ))}
        {/* playhead */}
        <line x1={x(current)} x2={x(current)} y1={0} y2={H - 14} stroke="var(--accent)" strokeWidth={1.5} />
      </svg>
      {hover && (
        <div className="chart-tip" style={{ left: hover.px, top: 0 }}>
          {Math.floor(hover.t / 60)}:{String(Math.floor(hover.t % 60)).padStart(2, "0")} · click to play from here
        </div>
      )}
      <div className="legend" style={{ marginTop: 8 }}>
        <span><i style={{ background: "#4fd18b10", border: "1px solid #4fd18b55" }} />ideal speed (130–170 words/min)</span>
        <span><i style={{ background: "#ff6b6b18" }} />talking too fast</span>
        <span><i style={{ background: "#f5b14c18" }} />voice went flat</span>
        <span><i style={{ background: "#ff6b6b" }} />um / uh</span>
        <span><i style={{ background: "#ff9f6b" }} />like / you know</span>
        {(["L", "C", "R", "N", "X"] as Zone[]).map((z) => (
          <span key={z}><i style={{ background: ZONE_COLOR[z] }} />{{ L: "left", C: "center", R: "right", N: "notes", X: "away" }[z]}</span>
        ))}
      </div>
    </div>
  );
}

/** Gaze heatmap over (yaw, pitch) with the zone layout drawn on top (spec §4.3.4). */
export function GazeHeatmap({ g }: { g: NonNullable<Summary["gaze"]> }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const { rows, cols, u8 } = g.heatmap;
    const bytes = Uint8Array.from(atob(u8), (c) => c.charCodeAt(0));
    const W = 640, H = 400;
    cv.width = W;
    cv.height = H;
    const ctx = cv.getContext("2d")!;
    ctx.fillStyle = "#0b0d12";
    ctx.fillRect(0, 0, W, H);
    const [y0, y1] = g.heatmap.yawBins, [p0, p1] = g.heatmap.pitchBins;
    const cw = W / cols, ch = H / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const v = bytes[r * cols + c] / 255;
        if (v < 0.02) continue;
        ctx.fillStyle = heat(v);
        // row 0 = lowest pitch → draw at the bottom; yaw + = speaker's right → draw on the right
        ctx.fillRect(c * cw, H - (r + 1) * ch, cw + 0.5, ch + 0.5);
      }
    }
    const X = (yaw: number) => ((yaw - y0) / (y1 - y0)) * W;
    const Y = (pitch: number) => H - ((pitch - p0) / (p1 - p0)) * H;
    ctx.strokeStyle = "#ffffff40";
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(X(-12), 0); ctx.lineTo(X(-12), Y(-15));
    ctx.moveTo(X(12), 0); ctx.lineTo(X(12), Y(-15));
    ctx.moveTo(0, Y(-15)); ctx.lineTo(W, Y(-15));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#ffffffaa";
    ctx.font = "600 13px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(`LEFT ${g.zonePct.L}%`, X(-26), 22);
    ctx.fillText(`CENTER ${g.zonePct.C}%`, X(0), 22);
    ctx.fillText(`RIGHT ${g.zonePct.R}%`, X(26), 22);
    ctx.fillText(`NOTES / SLIDES ${g.zonePct.N}%`, W / 2, H - 14);
  }, [g]);
  return <canvas ref={ref} style={{ width: "100%", borderRadius: 12, border: "1px solid var(--line)" }} />;
}

function heat(v: number): string {
  // dark blue → teal → amber → white
  const stops = [[20, 40, 90], [40, 170, 160], [245, 177, 76], [255, 245, 220]];
  const p = Math.min(0.999, v) * (stops.length - 1);
  const i = Math.floor(p), f = p - i;
  const c = stops[i].map((a, k) => Math.round(a + (stops[i + 1][k] - a) * f));
  return `rgba(${c[0]},${c[1]},${c[2]},${0.35 + 0.65 * v})`;
}

export function ZoneBars({ pct }: { pct: Record<Zone, number> }) {
  const names: Record<Zone, string> = { L: "Left audience", C: "Center audience", R: "Right audience", N: "Notes / slides", X: "Away / no face" };
  return (
    <div className="grid" style={{ gap: 8 }}>
      {(["L", "C", "R", "N", "X"] as Zone[]).map((z) => (
        <div key={z}>
          <div className="row small" style={{ justifyContent: "space-between" }}>
            <span>{names[z]}</span>
            <span className="mono">{pct[z]}%</span>
          </div>
          <div className="progress">
            <div style={{ width: `${pct[z]}%`, background: ZONE_COLOR[z] }} />
          </div>
        </div>
      ))}
    </div>
  );
}
