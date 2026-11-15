import { useEffect, useState } from "react";
import { openSession } from "../../App";
import { engine } from "../../lib/engine";
import type { SessionRow } from "../../lib/types";
import { useApp } from "../../stores/app";
import { scoreColor } from "../debrief/charts";
import { startSession } from "../live/session";
import { AchievementsView } from "../achievements/achievements";

export function fmtDuration(s: number): string {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.round(s % 60)).padStart(2, "0")}`;
}

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
      {rows.map((r) => (
        <div className="card session-row" key={r.sessionId} onClick={() => openSession(r.sessionId)}>
          <div className="score-badge" style={{ color: r.overall != null ? scoreColor(r.overall) : "var(--faint)" }}>
            {r.overall ?? "–"}
          </div>
          <div>
            <div style={{ fontWeight: 600 }}>{r.title}</div>
            <div className="muted small">
              {new Date(r.createdAt).toLocaleString()} · {fmtDuration(r.durationSec)} ·{" "}
              <span className="tag">{r.mode}</span> {r.status !== "analyzed" && <span className="tag">{r.status}</span>}
            </div>
          </div>
          <button
            className="btn ghost"
            title="Play the recorded audio and gaze back through the live pipeline (Replay Mode)"
            onClick={(e) => {
              e.stopPropagation();
              void replay(r);
            }}
          >
            ▶ Replay
          </button>
          <button
            className="btn ghost danger"
            onClick={(e) => {
              e.stopPropagation();
              void del(r);
            }}
          >
            Delete
          </button>
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
    <div className="page">
      <div className="row" style={{ marginBottom: 18 }}>
        <h1>History</h1>
        <div className="segmented history-tabs" role="tablist">
          {(["runs", "achievements"] as const).map((v) => (
            <button key={v} role="tab" aria-selected={view === v} className={view === v ? "on" : ""} onClick={() => setView(v)}>
              {v === "runs" ? "Runs" : "Achievements"}
            </button>
          ))}
        </div>
        <span className="spacer" />
        {window.podium && (
          <button className="btn ghost" onClick={() => window.podium?.openDataFolder()}>
            Open data folder
          </button>
        )}
      </div>
      {view === "achievements" ? <AchievementsView /> : <>
      {scored.length >= 2 && (
        <div className="card" style={{ marginBottom: 18 }}>
          <h3 style={{ marginBottom: 10 }}>Progress</h3>
          <Trend values={scored.map((r) => r.overall as number)} />
        </div>
      )}
      {rows === null ? <div className="spinner" /> : null}
      {rows?.length === 0 && <p className="muted">No sessions yet. Your practice runs will appear here.</p>}
      {rows && <SessionList rows={rows} onChange={setRows} />}
      </>}
    </div>
  );
}

function Trend({ values }: { values: number[] }) {
  const w = 1000, h = 120, pad = 24;
  const x = (i: number) => pad + (i * (w - 2 * pad)) / Math.max(values.length - 1, 1);
  const y = (v: number) => h - pad - (v / 100) * (h - 2 * pad);
  const d = values.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%" }}>
      {[50, 75, 100].map((g) => (
        <g key={g}>
          <line x1={pad} x2={w - pad} y1={y(g)} y2={y(g)} stroke="var(--line)" />
          <text x={4} y={y(g) + 4} fill="var(--faint)" fontSize="11">
            {g}
          </text>
        </g>
      ))}
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth={2.5} />
      {values.map((v, i) => (
        <circle key={i} cx={x(i)} cy={y(v)} r={4} fill={scoreColor(v)} />
      ))}
    </svg>
  );
}
