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

/** Multi-lane timeline: pace, pitch, fillers, gaze ribbon on one time axis (engagement has its own chart). */
export function Timeline({ s, current, onSeek }: TimelineProps) {
  const W = 1100, padL = 70, padR = 14;
  const lanes = { pace: [10, 70], pitch: [90, 140], fill: [156, 176], gaze: [192, 208] } as const;
  const H = 232;
  const dur = Math.max(s.durationSec, 1);
  const x = (t: number) => padL + (t / dur) * (W - padL - padR);
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<{ t: number; px: number } | null>(null);

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
        {[["Speed", lanes.pace], ["Voice pitch", lanes.pitch], ["Fillers", lanes.fill], ["Looking at", lanes.gaze]].map(
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
          <span key={z}><i style={{ background: ZONE_COLOR[z] }} />{{ L: "left", C: "center", R: "right", N: s.gaze?.notesMode === false ? "down" : "notes", X: "away" }[z]}</span>
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
    // Draw the lines where the classifier actually split the zones (the speaker's calibration),
    // so the picture and the percentages always agree.
    const b = g.boundaries ?? { leftCenter: -12, centerRight: 12, down: -15 };
    const camera = g.mode === "camera";
    ctx.strokeStyle = "#ffffff40";
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    if (!camera) {
      ctx.moveTo(X(b.leftCenter), 0); ctx.lineTo(X(b.leftCenter), Y(b.down));
      ctx.moveTo(X(b.centerRight), 0); ctx.lineTo(X(b.centerRight), Y(b.down));
    }
    ctx.moveTo(0, Y(b.down)); ctx.lineTo(W, Y(b.down));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#ffffffaa";
    ctx.font = "600 13px system-ui";
    ctx.textAlign = "center";
    const mid = (a: number, c: number) => (X(a) + X(c)) / 2;
    if (camera) {
      ctx.fillText(`EYE CONTACT ${(g.zonePct.L + g.zonePct.C + g.zonePct.R).toFixed(1)}%`, W / 2, 22);
    } else {
      ctx.fillText(`LEFT ${g.zonePct.L}%`, Math.max(40, mid(y0, b.leftCenter)), 22);
      ctx.fillText(`CENTER ${g.zonePct.C}%`, mid(b.leftCenter, b.centerRight), 22);
      ctx.fillText(`RIGHT ${g.zonePct.R}%`, Math.min(W - 40, mid(b.centerRight, y1)), 22);
    }
    ctx.fillText(`${g.notesMode === false ? "LOOKING DOWN" : "NOTES / SLIDES"} ${g.zonePct.N}%`, W / 2, H - 14);
  }, [g]);
  return <canvas ref={ref} style={{ width: "100%", maxWidth: 640, display: "block", margin: "0 auto", borderRadius: 12, border: "1px solid var(--line)" }} />;
}

function heat(v: number): string {
  // dark blue → teal → amber → white
  const stops = [[20, 40, 90], [40, 170, 160], [245, 177, 76], [255, 245, 220]];
  const p = Math.min(0.999, v) * (stops.length - 1);
  const i = Math.floor(p), f = p - i;
  const c = stops[i].map((a, k) => Math.round(a + (stops[i + 1][k] - a) * f));
  return `rgba(${c[0]},${c[1]},${c[2]},${0.35 + 0.65 * v})`;
}

export function ZoneBars({ pct, notes = true, camera = false }: { pct: Record<Zone, number>; notes?: boolean; camera?: boolean }) {
  const names: Record<Zone, string> = { L: "Left audience", C: "Center audience", R: "Right audience", N: notes ? "Notes / slides" : "Looking down", X: "Away / no face" };
  if (camera) {
    const at = Math.round((pct.L + pct.C + pct.R) * 10) / 10;
    const rows: [string, number, string][] = [["Looking at camera", at, ZONE_COLOR.C], [names.N, pct.N, ZONE_COLOR.N], [names.X, pct.X, ZONE_COLOR.X]];
    return (
      <div className="grid" style={{ gap: 8 }}>
        {rows.map(([name, v, color]) => (
          <div key={name}>
            <div className="row small" style={{ justifyContent: "space-between" }}>
              <span>{name}</span>
              <span className="mono">{v}%</span>
            </div>
            <div className="progress">
              <div style={{ width: `${v}%`, background: color }} />
            </div>
          </div>
        ))}
      </div>
    );
  }
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

// ---------------------------------------------------------------- engagement curve
type Dip = NonNullable<NonNullable<Summary["engagement"]>["dips"]>[number];

export const CAUSE_LABEL: Record<string, string> = {
  filler: "filler words", monotony: "flat voice", gaze: "eye contact", pace: "speed", silence: "long silence",
};
const CAUSE_WEIGHT: Record<string, number> = { filler: 0.25, monotony: 0.3, gaze: 0.35, pace: 0.1, silence: 0.65 };

/** Strongest weighted cause at one point of the series (what was costing engagement right then). */
function causeAt(series: NonNullable<Summary["engagement"]>["series"], i: number): string | null {
  let best: string | null = null, bestV = 0.05;
  for (const c of Object.keys(CAUSE_WEIGHT)) {
    const v = (series as any)[c]?.[i];
    if (v != null && v * CAUSE_WEIGHT[c] > bestV) { best = c; bestV = v * CAUSE_WEIGHT[c]; }
  }
  return best;
}

/** Catmull-Rom spline through the points, as SVG cubic Béziers: a smooth curve that still passes through every value. */
function smoothPath(pts: [number, number][]): string {
  if (pts.length < 2) return "";
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

const fmtT = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

export function engagementHeadline(e: NonNullable<Summary["engagement"]>): string {
  const E = e.series.E;
  const engaged = e.engagedPct ?? (E.length ? Math.round((100 * E.filter((v) => v >= 65).length) / E.length) : 0);
  // only name a lowest point when there was a real dip (the start of a talk is not one)
  const lowT = e.dips?.length ? e.dips.reduce((a, b) => (b.E < a.E ? b : a)).t : null;
  return `Audience engaged ${Math.round(engaged)}% of the time${lowT != null ? ` · lowest at ${fmtT(lowT)}` : ""}`;
}

export function EngagementChart({ e, duration, current, onSeek }: {
  e: NonNullable<Summary["engagement"]>;
  duration: number;
  current: number;
  onSeek: (t: number) => void;
}) {
  const W = 1000, H = 200;
  const dur = Math.max(duration, e.series.t[e.series.t.length - 1] ?? 1, 1);
  const x = (t: number) => (t / dur) * W;
  const y = (v: number) => H - 6 - (v / 100) * (H - 12);
  const box = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ left: number; text: string } | null>(null);
  const dips: Dip[] = e.dips ?? [];
  const peak = e.peak ?? null;

  const { line, area } = useMemo(() => {
    // light 3-point smoothing so 1 Hz jitter doesn't hide the shape
    const E = e.series.E.map((_, i, a) => (a[Math.max(0, i - 1)] + a[i] + a[Math.min(a.length - 1, i + 1)]) / 3);
    const pts = e.series.t.map((t, i) => [x(t), y(E[i])] as [number, number]);
    const ln = smoothPath(pts);
    const last = pts[pts.length - 1], first = pts[0];
    return { line: ln, area: pts.length ? `${ln}L${last[0]},${H}L${first[0]},${H}Z` : "" };
  }, [e, dur]);

  const timeAt = (clientX: number) => {
    const r = box.current!.getBoundingClientRect();
    return { t: Math.max(0, Math.min(dur, ((clientX - r.left) / r.width) * dur)), left: ((clientX - r.left) / r.width) * 100 };
  };
  const onMove = (clientX: number) => {
    const { t, left } = timeAt(clientX);
    const ts = e.series.t;
    let i = 0;
    while (i < ts.length - 1 && ts[i + 1] <= t) i++;
    // inside a dip, show its confirmed cause (the raw live signal can disagree)
    const dip = dips.find((d) => t >= d.t0 && t <= d.t1);
    const c = dip ? dip.cause : causeAt(e.series, i);
    setHover({ left, text: `${fmtT(t)} · engagement ${e.series.E[i] ?? "–"}${c ? ` · ${CAUSE_LABEL[c]}` : ""}` });
  };
  const pct = (t: number) => `${(x(t) / W) * 100}%`;
  const top = (v: number) => `${(y(v) / H) * 100}%`;

  return (
    <div className="eng-chart">
      <div
        className="eng-plot"
        ref={box}
        onMouseMove={(ev) => onMove(ev.clientX)}
        onMouseLeave={() => setHover(null)}
        onClick={(ev) => onSeek(timeAt(ev.clientX).t)}
        role="img"
        aria-label={engagementHeadline(e)}
      >
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
          <rect x={0} y={y(100)} width={W} height={y(65) - y(100)} fill="var(--good)" opacity={0.07} />
          <rect x={0} y={y(35)} width={W} height={y(0) - y(35)} fill="var(--bad)" opacity={0.08} />
          <line x1={0} x2={W} y1={y(65)} y2={y(65)} stroke="var(--good)" strokeOpacity={0.35} strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
          <line x1={0} x2={W} y1={y(35)} y2={y(35)} stroke="var(--bad)" strokeOpacity={0.35} strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
          {peak && <rect x={x(peak.t0)} width={Math.max(2, x(peak.t1) - x(peak.t0))} y={0} height={H} fill="var(--good)" opacity={0.07} />}
          <path d={area} fill="url(#engFill)" />
          <path d={line} fill="none" stroke="var(--accent)" strokeWidth={2.5} vectorEffect="non-scaling-stroke" />
          <line x1={x(current)} x2={x(current)} y1={0} y2={H} stroke="var(--text)" strokeOpacity={0.7} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          <defs>
            <linearGradient id="engFill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
        </svg>
        <span className="eng-band-label good">engaged</span>
        <span className="eng-band-label bad">bored</span>
        {dips.map((d, i) => (
          <button
            key={i}
            className="eng-marker dip"
            style={{ left: pct(d.t), top: top(d.E) }}
            onClick={(ev) => { ev.stopPropagation(); onSeek(d.t0); }}
            onMouseEnter={() => setHover({ left: (x(d.t) / W) * 100, text: `${fmtT(d.t)} · engagement ${d.E}${d.cause ? ` · ${CAUSE_LABEL[d.cause]}` : ""}` })}
            aria-label={`Dip ${i + 1} at ${fmtT(d.t)}`}
          >
            {i + 1}
          </button>
        ))}
        {peak && (
          <button
            className="eng-marker peak"
            style={{ left: pct((peak.t0 + peak.t1) / 2), top: top(peak.E) }}
            onClick={(ev) => { ev.stopPropagation(); onSeek(peak.t0); }}
            onMouseEnter={() => setHover({ left: (x((peak.t0 + peak.t1) / 2) / W) * 100, text: `${fmtT(peak.t0)} · engagement ${peak.E} · best stretch` })}
            aria-label={`Best stretch at ${fmtT(peak.t0)}`}
          >
            ★
          </button>
        )}
        {hover && (
          <div className="chart-tip eng-tip" style={{ left: `${Math.min(88, Math.max(12, hover.left))}%` }}>
            {hover.text}
          </div>
        )}
      </div>
      <div className="eng-axis">
        <span>0:00</span>
        <span>{fmtT(dur / 2)}</span>
        <span>{fmtT(dur)}</span>
      </div>
    </div>
  );
}
