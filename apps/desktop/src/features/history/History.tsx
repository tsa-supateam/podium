import { useEffect, useState } from "react";
import { openSession } from "../../App";
import { engine } from "../../lib/engine";
import type { SessionRow } from "../../lib/types";
import { useApp } from "../../stores/app";
import { Icon } from "../../ui/icons";
import { ScreenHeader, StatTile } from "../../ui/kit";
import { Sparkline, scoreColor } from "../debrief/charts";
import { startSession } from "../live/session";
import { AchievementsView } from "../achievements/achievements";

export function fmtDuration(s: number): string {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.round(s % 60)).padStart(2, "0")}`;
}

const METRIC_KEYS = ["content", "structure", "engagement", "pacing", "fillers", "vocalVariety", "eyeContact"] as const;

export function SessionList({ rows, onChange }: { rows: SessionRow[]; onChange: (r: SessionRow[]) => void }) {
  const set = useApp((s) => s.set);
  const del = async (r: SessionRow) => {
    if (!confirm(`Delete "${r.title}" and its recordings from this computer?`)) return;
    await engine.request("session.delete", { sessionId: r.sessionId });
    onChange(rows.filter((x) => x.sessionId !== r.sessionId));
  };
  const replay = async (r: SessionRow) => {
    try {
      await startSession(r.sessionId);
    } catch (e) {
      set({ toast: (e as Error).message });
    }
  };
  return (
    <div className="session-list">
      {rows.map((r, i) => (
        <div className="session-row" key={r.sessionId} onClick={() => openSession(r.sessionId)}>
          <span className="acc-idx micro">{String(i + 1).padStart(3, "0")}</span>
          <div className="score-badge" style={{ color: r.overall != null ? scoreColor(r.overall) : "var(--concrete-faint)" }}>
            {r.overall ?? "--"}
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="row-title">{r.title}</div>
            <div className="row-meta">
              <span>{new Date(r.createdAt).toLocaleString()}</span>
              <span>{fmtDuration(r.durationSec)}</span>
              <span className="tag">{r.mode}</span> {r.status !== "analyzed" && <span className="tag">{r.status}</span>}
            </div>
          </div>
          <Sparkline values={METRIC_KEYS.map((k) => r.scores?.[k] ?? null)} />
          <button
            className="btn ghost"
            title="Play the recorded audio and gaze back through the live pipeline (Replay Mode)"
            onClick={(e) => {
              e.stopPropagation();
              void replay(r);
            }}
          >
            <Icon name="replay" size={14} /> Replay
          </button>
          <button
            className="btn ghost danger"
            aria-label={`Delete ${r.title}`}
            onClick={(e) => {
              e.stopPropagation();
              void del(r);
            }}
          >
            <Icon name="trash" size={14} />
          </button>
          <span className="row-go" aria-hidden><Icon name="arrowR" size={16} /></span>
        </div>
      ))}
    </div>
  );
}

export default function History() {
  const [rows, setRows] = useState<SessionRow[] | null>(null);
  const [view, setView] = useState<"runs" | "achievements">("runs");
  useEffect(() => {
    engine.request<SessionRow[]>("sessions.list", { limit: 200 }).then(setRows).catch(() => setRows([]));
  }, []);
  const scored = (rows ?? []).filter((r) => r.overall != null).reverse();

  return (
    <div className="page history stagger">
      <ScreenHeader title={view === "runs" ? "History" : "Achievements"}>
        <div className="segmented history-tabs" role="tablist">
          {(["runs", "achievements"] as const).map((v) => (
            <button key={v} role="tab" aria-selected={view === v} className={view === v ? "on" : ""} onClick={() => setView(v)}>
              {v === "runs" ? "Runs" : "Achievements"}
            </button>
          ))}
        </div>
        {window.podium && (
          <button className="btn ghost" onClick={() => window.podium?.openDataFolder()}>
            <Icon name="folder" size={14} /> Open data folder
          </button>
        )}
      </ScreenHeader>
      {view === "achievements" ? <AchievementsView /> : <>
      {scored.length >= 2 && (
        <div className="card trend-card">
          <div className="trend-row">
          <div className="tiles two">
            <StatTile value={scored[scored.length - 1].overall!} label="Latest" tone="signal" />
            <StatTile value={Math.max(...scored.map((r) => r.overall!))} label="Best" />
            <StatTile value={Math.round(scored.reduce((a, r) => a + r.overall!, 0) / scored.length)} label="Average" />
            <StatTile value={scored.length} label="Scored runs" tone="paper" />
          </div>
          <div className="trend-col">
            <Trend values={scored.map((r) => r.overall as number)} />
            <button className="btn ghost avg-btn" onClick={() => useApp.getState().go("average")}>
              <Icon name="gauge" size={14} /> Average performance <Icon name="arrowR" size={12} className="arw" />
            </button>
          </div>
          </div>
        </div>
      )}
      {rows === null ? <div className="spinner" /> : null}
      {rows?.length === 0 && <p className="muted">No sessions yet. Your practice runs will appear here.</p>}
      {rows && <div className="scroll"><SessionList rows={rows} onChange={setRows} /></div>}
      </>}
    </div>
  );
}

function Trend({ values }: { values: number[] }) {
  const w = 1000, h = 140, pad = 30;
  const x = (i: number) => pad + (i * (w - 2 * pad)) / Math.max(values.length - 1, 1);
  const y = (v: number) => h - pad - (v / 100) * (h - 2 * pad);
  const d = values.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", background: "var(--charcoal-900)" }}>
      <rect x={pad} y={0} width={w - 2 * pad} height={h} fill="url(#pat-dots)" />
      {[0, 25, 50, 75, 100].map((g) => (
        <g key={g} fontFamily="var(--mono)">
          <line x1={pad} x2={w - pad} y1={y(g)} y2={y(g)} stroke="var(--concrete)" strokeOpacity={g % 50 === 0 ? 0.18 : 0.07} />
          <text x={4} y={y(g) + 3} fill="var(--concrete-dim)" fontSize="9">{String(g).padStart(3, "0")}</text>
        </g>
      ))}
      <path className="trace" d={d} pathLength={1} fill="none" stroke="var(--signal)" strokeWidth={1.75} />
      {values.map((v, i) => (
        <rect key={i} x={x(i) - 3.5} y={y(v) - 3.5} width={7} height={7} fill={scoreColor(v)} className="drop" style={{ animationDelay: `${400 + i * 30}ms` }} />
      ))}
    </svg>
  );
}
