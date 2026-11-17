// Average performance: the results screen's view of every full run at once. No transcript or
// video (there is no single recording); averages of every score, the eye-contact map, speed,
// fillers, content and the audience's engagement over the course of a talk.
import { useEffect, useState } from "react";
import { openSession } from "../../App";
import { engine } from "../../lib/engine";
import { CONTENT_PARTS, TOP_METRICS } from "../../lib/metrics";
import type { Summary, Zone } from "../../lib/types";
import { useApp } from "../../stores/app";
import { Icon } from "../../ui/icons";
import { ScreenHeader, SegMeter, StatTile } from "../../ui/kit";
import { Gauge, GazeHeatmap, Sparkline, ZoneBars, scoreColor } from "../debrief/charts";

type Kind = "all" | "prepared" | "impromptu";

interface AverageReport {
  count: number;
  speechTypes?: Record<string, number>;
  firstAt?: string | null;
  lastAt?: string | null;
  totalMinutes?: number;
  avgDurationSec?: number | null;
  wordCount?: number;
  scores?: Record<string, number | null> & { grade: string };
  trend?: Record<string, (number | null)[]>;
  runs?: { sessionId: string; title: string; at: string | null; overall: number | null }[];
  pacing?: { meanWpm: number | null; articulationRate: number | null; pauseRatio: number | null; cv: number | null; wpmTrend: (number | null)[] };
  fillers?: { perMinute: number | null; total: number; byToken: Record<string, number> };
  voice?: Record<string, number | null>;
  gaze?: (NonNullable<Summary["gaze"]> & { runs: number }) | null;
  content?: { score: number | null; parts: Record<string, { score: number | null }> };
  dimensions?: Partial<Record<"structure" | "evidence" | "commentary", number>>;
  engagement?: { meanE: number | null; engagedPct: number | null; curve: (number | null)[] };
}

const fmtMin = (s: number | null | undefined) => (s == null ? "--" : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`);
const date = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString() : "");

export default function Average() {
  const [kind, setKind] = useState<Kind>("all");
  const [a, setA] = useState<AverageReport | null>(null);
  useEffect(() => {
    setA(null);
    engine.request<AverageReport>("sessions.average", { speechType: kind === "all" ? null : kind })
      .then(setA).catch(() => setA({ count: 0 }));
  }, [kind]);

  const go = useApp((s) => s.go);
  const header = (
    <ScreenHeader title="Average performance"
      meta={a?.count ? [`${a.count} run${a.count === 1 ? "" : "s"}`, `${a.totalMinutes} min spoken`, `${date(a.firstAt)} – ${date(a.lastAt)}`] : undefined}>
      <div className="segmented avg-kind" role="radiogroup" aria-label="Speech type">
        {([["all", "All"], ["prepared", "Prepared"], ["impromptu", "On the spot"]] as const).map(([k, label]) => (
          <button key={k} role="radio" aria-checked={kind === k} className={kind === k ? "on" : ""} onClick={() => setKind(k)}>{label}</button>
        ))}
      </div>
      <button className="btn ghost" onClick={() => go("history")}><Icon name="arrowL" size={14} /> History</button>
    </ScreenHeader>
  );
  if (!a) return <div className="page stagger">{header}<div className="spinner" /></div>;
  if (!a.count) return <div className="page stagger">{header}<p className="muted">No full runs yet{kind !== "all" ? " for this speech type" : ""}. Averages appear after your first analyzed run.</p></div>;

  const sc = a.scores!;
  return (
    <div className="page debrief average stagger">
      {header}
      <div className="debrief-body">
        <aside className="debrief-side scroll">
          <div className="card hero-score">
            <Gauge score={sc.overall ?? 0} grade={sc.grade} />
            <span className="micro">Average overall · {a.count} run{a.count === 1 ? "" : "s"}</span>
            <div className="chips chips-top">
              {TOP_METRICS.map((m) => {
                const v = sc[m.key];
                return (
                  <div className="chip" key={m.key} title={m.what}>
                    <span className="chip-label">{m.short}</span>
                    <b style={{ color: v == null ? "var(--concrete-faint)" : scoreColor(v) }}>{v ?? "--"}</b>
                    <SegMeter value={(v ?? 0) / 100} tone={v != null && v < 60 ? "signal" : undefined} label={m.short} />
                  </div>
                );
              })}
            </div>
          </div>
          <div className="card">
            <h3 style={{ marginBottom: 10 }}>Overall, run by run</h3>
            <Sparkline values={a.trend?.overall ?? []} width={300} height={56} />
            <ul className="avg-runs">
              {[...(a.runs ?? [])].reverse().slice(0, 8).map((r) => (
                <li key={r.sessionId}>
                  <button className="link-btn" onClick={() => void openSession(r.sessionId)}>
                    <b style={{ color: r.overall == null ? undefined : scoreColor(r.overall) }}>{r.overall ?? "--"}</b>
                    <span className="avg-run-title">{r.title}</span>
                    <span className="muted small">{date(r.at)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </aside>

        <div className="debrief-main scroll">
          {a.engagement && a.engagement.curve.some((v) => v != null) && (
            <section className="card">
              <div className="row" style={{ marginBottom: 10 }}>
                <h3>Audience engagement, on average</h3>
                <span className="spacer" />
                <span className="micro">
                  Mean {a.engagement.meanE ?? "--"} · engaged {a.engagement.engagedPct ?? "--"}% of the time
                </span>
              </div>
              <AverageCurve values={a.engagement.curve} />
              <p className="muted small" style={{ margin: "8px 0 0" }}>{curveNote(a.engagement.curve)}</p>
            </section>
          )}

          <div className="side-by-side">
            <section className="card content-card">
              <div className="row eng-head"><h3>Content</h3><span className="spacer" /><b style={{ color: scoreColor(a.content?.score ?? 0) }}>{a.content?.score ?? "--"}</b></div>
              <div className="content-parts">
                {Object.entries(a.content?.parts ?? {}).map(([k, p]) => (
                  <div className="content-part" key={k}>
                    <span className="cp-name">{CONTENT_PARTS[k] ?? k}</span>
                    <b style={{ color: p.score == null ? undefined : scoreColor(p.score) }}>{p.score ?? "--"}</b>
                    <SegMeter value={(p.score ?? 0) / 100} label={CONTENT_PARTS[k] ?? k} />
                  </div>
                ))}
              </div>
              {a.dimensions && Object.keys(a.dimensions).length > 0 && (
                <div className="avg-dims">
                  {(["structure", "evidence", "commentary"] as const).filter((k) => a.dimensions![k] != null).map((k) => (
                    <div key={k} className="avg-dim">
                      <span className="cp-name">{k[0].toUpperCase() + k.slice(1)}</span>
                      <b>{a.dimensions![k]!.toFixed(1)}<span className="muted small"> / 5</span></b>
                      <SegMeter value={a.dimensions![k]! / 5} blocks={5} label={k} />
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="card delivery-card">
              <h3>Delivery</h3>
              <div className="delivery-grid">
                <DeliveryRow title="Speaking speed" v={sc.pacing} detail={`${a.pacing?.meanWpm ?? "--"} words/min on average`} />
                <DeliveryRow title="Filler words" v={sc.fillers} detail={`${a.fillers?.perMinute ?? "--"} per minute`} />
                <DeliveryRow title="Expressive voice" v={sc.vocalVariety} detail={a.voice?.f0RangeSt != null ? `${a.voice.f0RangeSt} semitone pitch range` : "--"} />
                <DeliveryRow title="Eye contact" v={sc.eyeContact} detail={a.gaze ? `${a.gaze.audiencePct ?? "--"}% on the audience` : "No camera data"} />
              </div>
            </section>
          </div>

          <div className="tiles">
            <StatTile value={a.pacing?.meanWpm != null ? Math.round(a.pacing.meanWpm) : "--"} label="Avg words / min" tone="signal" />
            <StatTile value={fmtMin(a.avgDurationSec)} label="Avg length" />
            <StatTile value={a.wordCount ?? "--"} label="Avg words" />
            <StatTile value={a.pacing?.pauseRatio != null ? `${Math.round(a.pacing.pauseRatio * 100)}%` : "--"} label="Time pausing" tone="paper" />
          </div>

          {a.gaze && a.gaze.heatmap && (
            <section className="card">
              <div className="row" style={{ marginBottom: 10 }}>
                <h3>Where you looked, on average</h3>
                <span className="spacer" />
                <span className="micro">{a.gaze.runs} run{a.gaze.runs === 1 ? "" : "s"} with camera · centered on your calibration</span>
              </div>
              <GazeHeatmap g={a.gaze} />
              <div style={{ marginTop: 12 }}>
                <ZoneBars pct={a.gaze.zonePct as Record<Zone, number>} notes={a.gaze.notesMode ?? true} camera={a.gaze.mode === "camera"} />
              </div>
            </section>
          )}

          {a.fillers && Object.keys(a.fillers.byToken).length > 0 && (
            <section className="card">
              <div className="row" style={{ marginBottom: 10 }}>
                <h3>Your filler words</h3>
                <span className="spacer" />
                <span className="micro">{a.fillers.total} across all runs</span>
              </div>
              <div className="grid" style={{ gap: 0 }}>
                {Object.entries(a.fillers.byToken).map(([tok, n]) => (
                  <div key={tok} className="row small" style={{ padding: "8px 0", borderTop: "1px solid var(--hair)" }}>
                    <span style={{ flex: 1 }}>“{tok}”</span>
                    <SegMeter value={n / Math.max(...Object.values(a.fillers!.byToken))} tone="signal" label={tok} />
                    <span className="mono" style={{ width: 48, textAlign: "right" }}>{n}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function DeliveryRow({ title, v, detail }: { title: string; v: number | null | undefined; detail: string }) {
  return (
    <div className="delivery-item">
      <span className="cp-name">{title}</span>
      <b style={{ color: v == null ? "var(--concrete-faint)" : scoreColor(v) }}>{v ?? "--"}</b>
      <span className="muted small">{detail}</span>
    </div>
  );
}

/** Where a typical talk loses the room: compare the opening, middle and ending thirds. */
function curveNote(c: (number | null)[]): string {
  const third = (i: number) => {
    const xs = c.slice(Math.floor((i * c.length) / 3), Math.floor(((i + 1) * c.length) / 3)).filter((v): v is number => v != null);
    return xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : 0;
  };
  const [o, m, e] = [third(0), third(1), third(2)];
  const low = Math.min(o, m, e);
  const where = low === o ? "the opening" : low === m ? "the middle" : "the ending";
  return `Across your talks, engagement is lowest in ${where} (${Math.round(low)}), highest at ${Math.round(Math.max(o, m, e))}.`;
}

function AverageCurve({ values }: { values: (number | null)[] }) {
  const W = 1000, H = 180;
  const x = (i: number) => (i / Math.max(values.length - 1, 1)) * W;
  const y = (v: number) => H - 6 - (v / 100) * (H - 12);
  const pts = values.map((v, i) => (v == null ? null : [x(i), y(v)] as const)).filter(Boolean) as (readonly [number, number])[];
  const line = pts.map(([px, py], i) => `${i ? "L" : "M"}${px.toFixed(1)},${py.toFixed(1)}`).join("");
  const area = pts.length ? `${line}L${pts[pts.length - 1][0]},${H}L${pts[0][0]},${H}Z` : "";
  return (
    <svg viewBox={`0 0 ${W} ${H + 18}`} style={{ width: "100%", background: "var(--charcoal-900)" }} aria-label="Average engagement over a talk">
      <defs>
        <linearGradient id="avg-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--signal)" stopOpacity="0.35" />
          <stop offset="1" stopColor="var(--signal)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[35, 65].map((g) => (
        <line key={g} x1={0} x2={W} y1={y(g)} y2={y(g)} stroke="var(--concrete)" strokeOpacity={0.15} strokeDasharray="4 6" />
      ))}
      <path d={area} fill="url(#avg-fill)" />
      <path className="trace" d={line} pathLength={1} fill="none" stroke="var(--signal)" strokeWidth={2} />
      {["Start", "Middle", "End"].map((l, i) => (
        <text key={l} x={[8, W / 2, W - 8][i]} y={H + 14} fill="var(--concrete-dim)" fontSize="11" fontFamily="var(--mono)"
          textAnchor={["start", "middle", "end"][i] as "start" | "middle" | "end"}>{l.toUpperCase()}</text>
      ))}
    </svg>
  );
}
