// Instrumentation-style charts for the debrief: gauge dial, oscilloscope timeline, scope engagement curve,
// zone meters, blueprint radar and sparklines. Dependency-free SVG/canvas; colours come from CSS tokens.
import { useEffect, useMemo, useRef, useState } from "react";
import type { Summary, Zone } from "../../lib/types";
import { SegMeter } from "../../ui/kit";
import { useCountUp, useInView, useSpring } from "../../ui/motion";

export function scoreColor(s: number): string {
  return s >= 80 ? "var(--good)" : s >= 60 ? "var(--signal)" : "var(--bad-ink)";
}

/** Read a colour token for canvas drawing (canvas can't resolve CSS variables itself). */
export function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
const rgbOf = (hex: string): [number, number, number] => {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
};

const fmtT = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
const pad4 = (n: number) => String(Math.max(0, Math.round(n))).padStart(4, "0");

// ---------------------------------------------------------------- gauge dial
const START = 135, SWEEP = 270; // degrees, clockwise from +x
const polar = (cx: number, cy: number, r: number, deg: number): [number, number] => {
  const a = (deg * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
};
const arc = (cx: number, cy: number, r: number, a0: number, a1: number) => {
  const [x0, y0] = polar(cx, cy, r, a0), [x1, y1] = polar(cx, cy, r, a1);
  return `M${x0.toFixed(2)},${y0.toFixed(2)}A${r},${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(2)},${y1.toFixed(2)}`;
};

/** 270° gauge: 60 ticks (every 5th long), signal arc, spring needle, count-up numerals, chamfered grade tag. */
export function Gauge({ score, grade }: { score: number; grade: string }) {
  const [ref, seen] = useInView<HTMLDivElement>();
  const v = useSpring(score, seen);
  const n = useCountUp(score, seen);
  const cx = 120, cy = 120, R = 88;
  const clamped = Math.max(0, Math.min(100, v));
  const needle = START + (clamped / 100) * SWEEP;
  const [nx, ny] = polar(cx, cy, R - 14, needle);
  return (
    <div className="gauge" ref={ref} role="img" aria-label={`Score ${score} out of 100, grade ${grade}`}>
      <svg viewBox="0 0 240 220" width="240" height="220">
        <g className="gauge-scale">
          <circle cx={cx} cy={cy} r={110} fill="none" stroke="var(--concrete-faint)" strokeWidth={1} strokeDasharray="1 5" />
        </g>
        <path d={arc(cx, cy, R, START, START + SWEEP)} fill="none" stroke="var(--charcoal-500)" strokeWidth={8} />
        {clamped > 0.2 && <path d={arc(cx, cy, R, START, needle)} fill="none" stroke="var(--signal)" strokeWidth={8} />}
        {Array.from({ length: 61 }, (_, i) => {
          const a = START + (i / 60) * SWEEP, major = i % 5 === 0;
          const [x0, y0] = polar(cx, cy, R + 7, a), [x1, y1] = polar(cx, cy, R + (major ? 16 : 11), a);
          return <line key={i} x1={x0} y1={y0} x2={x1} y2={y1} stroke={major ? "var(--concrete)" : "var(--concrete-faint)"} strokeWidth={major ? 1.5 : 1} />;
        })}
        {[0, 25, 50, 75, 100].map((s) => {
          const [x, y] = polar(cx, cy, R + 27, START + (s / 100) * SWEEP);
          return <text key={s} x={x} y={y + 3} textAnchor="middle" fontSize="9" fill="var(--concrete-dim)" fontFamily="var(--mono)">{String(s).padStart(3, "0")}</text>;
        })}
        <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="var(--paper)" strokeWidth={2} />
        <rect x={cx - 5} y={cy - 5} width={10} height={10} fill="var(--signal)" transform={`rotate(45 ${cx} ${cy})`} />
      </svg>
      <div className="gauge-num">
        <b>{Math.round(n)}</b>
        <span className="micro">SCORE / 100</span>
        <span className="grade-tag">{grade}</span>
      </div>
    </div>
  );
}
/** Kept for callers that still use the old name. */
export const ScoreRing = Gauge;

// ---------------------------------------------------------------- zones (shape + label, never colour alone)
export const ZONE_FILL: Record<Zone, string> = { L: "var(--signal)", C: "var(--paper)", R: "var(--concrete-dim)", N: "url(#pat-N)", X: "url(#pat-X)" };

export function ZoneSwatch({ z }: { z: Zone }) {
  return (
    <svg width="14" height="10" aria-hidden>
      <rect width="14" height="10" fill={ZONE_FILL[z]} />
    </svg>
  );
}

interface TimelineProps {
  s: Summary;
  current: number;
  onSeek: (t: number) => void;
}

/** Oscilloscope strip: pace, pitch, fillers, gaze bands on one time axis, with a snapping crosshair readout. */
export function Timeline({ s, current, onSeek }: TimelineProps) {
  const W = 1100, padL = 86, padR = 14;
  const lanes = { pace: [14, 78], pitch: [96, 146], fill: [164, 188], gaze: [202, 220] } as const;
  const H = 248;
  const dur = Math.max(s.durationSec, 1);
  const band = s.pacing.band ?? [130, 170];
  const x = (t: number) => padL + (t / dur) * (W - padL - padR);
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<{ t: number; px: number; sx: number; sy: number; wpm: number | null } | null>(null);
  const paceY = (w: number) => lanes.pace[1] - (Math.min(w, 240) / 240) * (lanes.pace[1] - lanes.pace[0]);

  const pace = useMemo(() => {
    const p = s.pacing.series;
    const t = p.smoothT ?? p.t ?? [], v = p.smooth ?? p.wpm ?? [];
    return { t, v, d: t.map((tt, i) => `${i ? "L" : "M"}${x(tt).toFixed(1)},${paceY(v[i]).toFixed(1)}`).join("") };
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

  const toTime = (clientX: number) => {
    const r = svgRef.current!.getBoundingClientRect();
    const px = ((clientX - r.left) / r.width) * W;
    return { t: Math.max(0, Math.min(dur, ((px - padL) / (W - padL - padR)) * dur)), px: clientX - r.left, scale: r.width / W };
  };
  const onMove = (clientX: number) => {
    const { t, px, scale } = toTime(clientX);
    // snap the crosshair to the nearest pace sample
    let best = -1, bd = Infinity;
    pace.t.forEach((tt, i) => { const d = Math.abs(tt - t); if (d < bd) { bd = d; best = i; } });
    const snap = best >= 0 && Math.abs(x(pace.t[best]) - x(t)) < 18;
    const st = snap ? pace.t[best] : t;
    setHover({ t: st, px: snap ? x(st) * scale : px, sx: x(st), sy: snap ? paceY(pace.v[best]) : lanes.pace[1], wpm: snap ? pace.v[best] : null });
  };

  const gz = s.gaze?.timeline ?? [];
  const minor = dur > 240 ? 15 : 5, major = dur > 240 ? 60 : 30;
  let lastLabel = -Infinity;

  return (
    <div className="chart-wrap scope">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        onMouseMove={(e) => onMove(e.clientX)}
        onMouseLeave={() => setHover(null)}
        onClick={(e) => onSeek(toTime(e.clientX).t)}
        style={{ cursor: "crosshair", background: "var(--charcoal-900)" }}
      >
        <rect x={padL} y={0} width={W - padL - padR} height={H - 16} fill="url(#pat-dots)" />
        {/* minor / major grid */}
        {Array.from({ length: Math.floor(dur / minor) + 1 }, (_, i) => i * minor).map((t) => (
          <line key={`g${t}`} x1={x(t)} x2={x(t)} y1={0} y2={H - 16} stroke="var(--concrete)" strokeOpacity={t % major === 0 ? 0.16 : 0.06} />
        ))}
        {[lanes.pace, lanes.pitch, lanes.fill, lanes.gaze].map(([a, b], i) => (
          <g key={i}>
            <line x1={padL} x2={W - padR} y1={a} y2={a} stroke="var(--concrete)" strokeOpacity={0.08} />
            <line x1={padL} x2={W - padR} y1={b} y2={b} stroke="var(--concrete)" strokeOpacity={0.16} />
          </g>
        ))}
        {/* lane labels */}
        {([["SPEED", lanes.pace], ["PITCH", lanes.pitch], ["FILLERS", lanes.fill], ["GAZE", lanes.gaze]] as const).map(([label, [a, b]]) => (
          <text key={label} x={6} y={(a + b) / 2 + 3} fill="var(--concrete)" fontSize="10" letterSpacing="0.08em" fontFamily="var(--mono)">{label}</text>
        ))}
        {/* problem zones */}
        {s.pacing.accelZones.filter((z) => z.kind === "rush").map((z, i) => (
          <rect key={`r${i}`} x={x(z.t0)} width={Math.max(2, x(z.t1) - x(z.t0))} y={lanes.pace[0]} height={lanes.pace[1] - lanes.pace[0]} fill="url(#pat-N)" opacity={0.45} />
        ))}
        {s.voice.monotoneSegments.map((m, i) => (
          <rect key={`m${i}`} x={x(m.t0)} width={Math.max(2, x(m.t1) - x(m.t0))} y={lanes.pitch[0]} height={lanes.pitch[1] - lanes.pitch[0]} fill="url(#pat-X)" opacity={0.8} />
        ))}
        {/* pace band */}
        <rect x={padL} width={W - padL - padR} y={paceY(band[1])} height={paceY(band[0]) - paceY(band[1])} fill="var(--paper)" opacity={0.05} />
        <line x1={padL} x2={W - padR} y1={paceY(band[1])} y2={paceY(band[1])} stroke="var(--paper)" strokeOpacity={0.3} strokeDasharray="2 4" />
        <line x1={padL} x2={W - padR} y1={paceY(band[0])} y2={paceY(band[0])} stroke="var(--paper)" strokeOpacity={0.3} strokeDasharray="2 4" />
        <path className="trace" d={pace.d} pathLength={1} fill="none" stroke="var(--signal)" strokeWidth={1.75} />
        {/* pitch */}
        <line x1={padL} x2={W - padR} y1={(lanes.pitch[0] + lanes.pitch[1]) / 2} y2={(lanes.pitch[0] + lanes.pitch[1]) / 2} stroke="var(--concrete)" strokeOpacity={0.2} />
        <path className="trace delay" d={pitchPath} pathLength={1} fill="none" stroke="var(--paper)" strokeWidth={1} opacity={0.85} />
        {/* fillers: triangles that drop in, with mono labels where there is room */}
        {s.fillers.clusters.map((c, i) => (
          <rect key={`c${i}`} x={x(c.t0) - 3} width={Math.max(6, x(c.t1) - x(c.t0) + 6)} y={lanes.fill[0]} height={lanes.fill[1] - lanes.fill[0]} fill="var(--signal)" opacity={0.12} />
        ))}
        {s.fillers.events.map((f, i) => {
          const fx = x(f.t0), lab = fx - lastLabel > 46;
          if (lab) lastLabel = fx;
          const y0 = lanes.fill[0] + 3;
          return (
            <g key={`f${i}`} className="drop" style={{ animationDelay: `${300 + i * 15}ms` }}>
              <path d={`M${fx - 4.5},${y0}L${fx + 4.5},${y0}L${fx},${y0 + 8}Z`} fill={f.class === "lexical" ? "var(--paper)" : "var(--signal)"} />
              {lab && <text x={fx + 6} y={y0 + 18} fontSize="8.5" fill="var(--concrete-dim)" fontFamily="var(--mono)">{f.token.toUpperCase()}</text>}
              <title>{`${f.token} @ ${f.t0.toFixed(1)}s`}</title>
            </g>
          );
        })}
        {/* gaze bands */}
        {gz.length ? (
          gz.map(([t, z], i) => {
            const t1 = i + 1 < gz.length ? gz[i + 1][0] : dur;
            return <rect key={`z${i}`} x={x(t)} width={Math.max(0.5, x(t1) - x(t))} y={lanes.gaze[0]} height={lanes.gaze[1] - lanes.gaze[0]} fill={ZONE_FILL[z]} />;
          })
        ) : (
          <text x={padL + 6} y={lanes.gaze[1] - 4} fill="var(--concrete-faint)" fontSize="10" fontFamily="var(--mono)">NO CAMERA DATA</text>
        )}
        {/* x axis: mm:ss ticks */}
        {Array.from({ length: Math.floor(dur / major) + 1 }, (_, i) => i * major).map((t) => (
          <g key={`a${t}`} fontFamily="var(--mono)">
            <line x1={x(t)} x2={x(t)} y1={H - 16} y2={H - 11} stroke="var(--concrete)" />
            <text x={x(t)} y={H - 2} fill="var(--concrete-dim)" fontSize="9.5" textAnchor="middle">{fmtT(t)}</text>
          </g>
        ))}
        {/* playhead */}
        <line x1={x(current)} x2={x(current)} y1={0} y2={H - 16} stroke="var(--signal)" strokeWidth={1.5} />
        <path d={`M${x(current) - 5},0L${x(current) + 5},0L${x(current)},7Z`} fill="var(--signal)" />
        {/* crosshair */}
        {hover && (
          <g pointerEvents="none">
            <line x1={hover.sx} x2={hover.sx} y1={0} y2={H - 16} stroke="var(--paper)" strokeOpacity={0.6} />
            <line x1={padL} x2={W - padR} y1={hover.sy} y2={hover.sy} stroke="var(--paper)" strokeOpacity={0.35} strokeDasharray="3 3" />
            <rect x={hover.sx - 3.5} y={hover.sy - 3.5} width={7} height={7} fill="none" stroke="var(--signal)" strokeWidth={1.5} />
          </g>
        )}
      </svg>
      {hover && (
        <>
          <span className="readout-xy mono">X {pad4(Math.floor(hover.t / 60) * 100 + Math.floor(hover.t % 60))} Y {hover.wpm != null ? pad4(hover.wpm) : "----"}</span>
          <div className="chart-tip" style={{ left: hover.px, top: 0 }}>
            {fmtT(hover.t)}{hover.wpm != null ? ` · ${Math.round(hover.wpm)} WPM` : ""} · click to play
          </div>
        </>
      )}
      <div className="legend" style={{ marginTop: 10 }}>
        <span><i style={{ background: "var(--paper)", opacity: 0.25 }} />ideal speed ({band.join("–")} wpm)</span>
        <span><svg width="14" height="10" aria-hidden><rect width="14" height="10" fill="url(#pat-N)" /></svg>talking too fast</span>
        <span><svg width="14" height="10" aria-hidden><rect width="14" height="10" fill="url(#pat-X)" /></svg>voice went flat</span>
        <span><svg width="10" height="8" aria-hidden><path d="M0,0L10,0L5,8Z" fill="var(--signal)" /></svg>um / uh</span>
        <span><svg width="10" height="8" aria-hidden><path d="M0,0L10,0L5,8Z" fill="var(--paper)" /></svg>like / you know</span>
        {(["L", "C", "R", "N", "X"] as Zone[]).map((z) => (
          <span key={z}><ZoneSwatch z={z} />{{ L: "left", C: "center", R: "right", N: s.gaze?.notesMode === false ? "down" : "notes", X: "away" }[z]}</span>
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
    const stops = ["--charcoal-600", "--concrete-dim", "--signal", "--paper"].map((t) => rgbOf(token(t)));
    ctx.fillStyle = token("--charcoal-900");
    ctx.fillRect(0, 0, W, H);
    // blueprint grid
    ctx.strokeStyle = token("--concrete");
    ctx.globalAlpha = 0.06;
    ctx.lineWidth = 1;
    for (let gx = 0; gx <= W; gx += 32) { ctx.beginPath(); ctx.moveTo(gx + 0.5, 0); ctx.lineTo(gx + 0.5, H); ctx.stroke(); }
    for (let gy = 0; gy <= H; gy += 32) { ctx.beginPath(); ctx.moveTo(0, gy + 0.5); ctx.lineTo(W, gy + 0.5); ctx.stroke(); }
    ctx.globalAlpha = 1;
    const [y0, y1] = g.heatmap.yawBins, [p0, p1] = g.heatmap.pitchBins;
    const cw = W / cols, ch = H / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const v = bytes[r * cols + c] / 255;
        if (v < 0.02) continue;
        ctx.fillStyle = heat(v, stops);
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
    ctx.strokeStyle = token("--concrete");
    ctx.globalAlpha = 0.5;
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    if (!camera) {
      ctx.moveTo(X(b.leftCenter), 0); ctx.lineTo(X(b.leftCenter), Y(b.down));
      ctx.moveTo(X(b.centerRight), 0); ctx.lineTo(X(b.centerRight), Y(b.down));
    }
    ctx.moveTo(0, Y(b.down)); ctx.lineTo(W, Y(b.down));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    ctx.fillStyle = token("--paper");
    ctx.font = `500 11px ${token("--mono")}`;
    ctx.textAlign = "center";
    const mid = (a: number, c: number) => (X(a) + X(c)) / 2;
    if (camera) {
      ctx.fillText(`EYE CONTACT ${(g.zonePct.L + g.zonePct.C + g.zonePct.R).toFixed(1)}%`, W / 2, 22);
    } else {
      ctx.fillText(`L / ${g.zonePct.L}%`, Math.max(40, mid(y0, b.leftCenter)), 22);
      ctx.fillText(`C / ${g.zonePct.C}%`, mid(b.leftCenter, b.centerRight), 22);
      ctx.fillText(`R / ${g.zonePct.R}%`, Math.min(W - 40, mid(b.centerRight, y1)), 22);
    }
    ctx.fillText(`${g.notesMode === false ? "DOWN" : "NOTES"} / ${g.zonePct.N}%`, W / 2, H - 14);
  }, [g]);
  return <canvas ref={ref} style={{ width: "100%", maxWidth: 640, display: "block", margin: "0 auto" }} />;
}

function heat(v: number, stops: [number, number, number][]): string {
  const p = Math.min(0.999, v) * (stops.length - 1);
  const i = Math.floor(p), f = p - i;
  const c = stops[i].map((a, k) => Math.round(a + (stops[i + 1][k] - a) * f));
  return `rgba(${c[0]},${c[1]},${c[2]},${0.4 + 0.6 * v})`;
}

export function ZoneBars({ pct, notes = true, camera = false }: { pct: Record<Zone, number>; notes?: boolean; camera?: boolean }) {
  const names: Record<Zone, string> = { L: "Left audience", C: "Center audience", R: "Right audience", N: notes ? "Notes / slides" : "Looking down", X: "Away / no face" };
  const rows: [Zone, string, number][] = camera
    ? [["C", "Looking at camera", Math.round((pct.L + pct.C + pct.R) * 10) / 10], ["N", names.N, pct.N], ["X", names.X, pct.X]]
    : (["L", "C", "R", "N", "X"] as Zone[]).map((z) => [z, names[z], pct[z]]);
  return (
    <div className="grid" style={{ gap: 0 }}>
      {rows.map(([z, name, v]) => (
        <div key={name} className="row small" style={{ padding: "8px 0", borderTop: "1px solid var(--hair)" }}>
          <ZoneSwatch z={z} />
          <span style={{ flex: 1, textTransform: "uppercase", letterSpacing: "0.06em" }}>{name}</span>
          <SegMeter value={v / 100} tone={z === "X" || z === "N" ? "signal" : undefined} label={name} />
          <span className="mono" style={{ width: 48, textAlign: "right" }}>{v}%</span>
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
  const [hover, setHover] = useState<{ left: number; text: string; t: number; v: number } | null>(null);
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
    setHover({ left, t, v: e.series.E[i] ?? 0, text: `${fmtT(t)} · engagement ${e.series.E[i] ?? "–"}${c ? ` · ${CAUSE_LABEL[c]}` : ""}` });
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
          {[20, 40, 60, 80].map((g) => (
            <line key={g} x1={0} x2={W} y1={y(g)} y2={y(g)} stroke="var(--concrete)" strokeOpacity={0.07} vectorEffect="non-scaling-stroke" />
          ))}
          <rect x={0} y={y(35)} width={W} height={y(0) - y(35)} fill="url(#pat-X)" opacity={0.5} />
          <line x1={0} x2={W} y1={y(65)} y2={y(65)} stroke="var(--good)" strokeOpacity={0.5} strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
          <line x1={0} x2={W} y1={y(35)} y2={y(35)} stroke="var(--signal)" strokeOpacity={0.5} strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
          {peak && <rect x={x(peak.t0)} width={Math.max(2, x(peak.t1) - x(peak.t0))} y={0} height={H} fill="var(--paper)" opacity={0.06} />}
          {/* clip-path wipe, not dashoffset: dashes misbehave with non-scaling strokes */}
          <path className="wipe" d={area} fill="var(--signal)" opacity={0.12} />
          <path className="wipe" d={line} fill="none" stroke="var(--signal)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
          <line x1={x(current)} x2={x(current)} y1={0} y2={H} stroke="var(--paper)" strokeOpacity={0.8} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          {hover && <line x1={x(hover.t)} x2={x(hover.t)} y1={0} y2={H} stroke="var(--paper)" strokeOpacity={0.35} vectorEffect="non-scaling-stroke" />}
        </svg>
        <span className="eng-band-label good">ENGAGED ≥ 65</span>
        <span className="eng-band-label bad">BORED ≤ 35</span>
        {hover && <span className="readout-xy mono">X {pad4(Math.floor(hover.t / 60) * 100 + Math.floor(hover.t % 60))} Y {pad4(hover.v)}</span>}
        {dips.map((d, i) => (
          <button
            key={i}
            className="eng-marker dip"
            style={{ left: pct(d.t), top: top(d.E), animationDelay: `${600 + i * 80}ms` }}
            onClick={(ev) => { ev.stopPropagation(); onSeek(d.t0); }}
            onMouseEnter={() => setHover({ left: (x(d.t) / W) * 100, t: d.t, v: d.E, text: `${fmtT(d.t)} · engagement ${d.E}${d.cause ? ` · ${CAUSE_LABEL[d.cause]}` : ""}` })}
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
            onMouseEnter={() => setHover({ left: (x((peak.t0 + peak.t1) / 2) / W) * 100, t: peak.t0, v: peak.E, text: `${fmtT(peak.t0)} · engagement ${peak.E} · best stretch` })}
            aria-label={`Best stretch at ${fmtT(peak.t0)}`}
          >
            P
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
        <span>{fmtT(dur / 4)}</span>
        <span>{fmtT(dur / 2)}</span>
        <span>{fmtT((dur * 3) / 4)}</span>
        <span>{fmtT(dur)}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- blueprint radar
export function Radar({ axes, size = 300 }: { axes: [string, number][]; size?: number }) {
  const c = size / 2, R = size / 2 - 46, n = axes.length;
  const pt = (i: number, v: number): [number, number] => {
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
    return [c + Math.cos(a) * R * (v / 100), c + Math.sin(a) * R * (v / 100)];
  };
  const poly = (vals: number[]) => vals.map((v, i) => pt(i, v).map((k) => k.toFixed(1)).join(",")).join(" ");
  return (
    <svg className="radar" viewBox={`0 0 ${size} ${size}`} role="img" aria-label={axes.map(([k, v]) => `${k} ${v}`).join(", ")}>
      {[25, 50, 75, 100].map((r) => (
        <polygon key={r} points={poly(axes.map(() => r))} fill="none" stroke="var(--concrete)" strokeOpacity={r === 100 ? 0.35 : 0.12} strokeDasharray={r === 100 ? undefined : "2 3"} />
      ))}
      {axes.map((_, i) => {
        const [x, y] = pt(i, 100);
        return <line key={i} x1={c} y1={c} x2={x} y2={y} stroke="var(--concrete)" strokeOpacity={0.15} />;
      })}
      <polygon className="poly" points={poly(axes.map(([, v]) => v))} fill="var(--signal)" fillOpacity={0.18} stroke="var(--signal)" strokeWidth={1.5} />
      {axes.map(([k, v], i) => {
        const [x, y] = pt(i, v), [lx, ly] = pt(i, 122);
        return (
          <g key={k} fontFamily="var(--mono)">
            <rect x={x - 2.5} y={y - 2.5} width={5} height={5} fill="var(--paper)" />
            <text x={lx} y={ly - 2} textAnchor="middle" fontSize="9" fill="var(--concrete)" letterSpacing="0.06em">{k.toUpperCase()}</text>
            <text x={lx} y={ly + 9} textAnchor="middle" fontSize="9" fill="var(--signal)">{String(v).padStart(3, "0")}</text>
          </g>
        );
      })}
    </svg>
  );
}

/** Sparkline strip: one square bar per value (0-100). */
export function Sparkline({ values, width = 130, height = 28 }: { values: (number | null)[]; width?: number; height?: number }) {
  const n = Math.max(values.length, 1), bw = width / n;
  return (
    <svg className="spark" viewBox={`0 0 ${width} ${height}`} aria-hidden>
      <line x1={0} x2={width} y1={height - 0.5} y2={height - 0.5} stroke="var(--concrete)" strokeOpacity={0.25} />
      {values.map((v, i) => v == null ? null : (
        <rect key={i} x={i * bw + 1} width={Math.max(1, bw - 2)} y={height - (v / 100) * height} height={(v / 100) * height}
          fill={v >= 80 ? "var(--paper)" : v >= 60 ? "var(--concrete-dim)" : "var(--signal)"} />
      ))}
    </svg>
  );
}
