import { useEffect, useState } from "react";
import { engine } from "../../lib/engine";
import type { SessionRow } from "../../lib/types";
import { useApp } from "../../stores/app";
import AudienceScene from "../audience/Audience";
import { SessionList } from "./History";

export default function Home() {
  const { go, models } = useApp();
  const [rows, setRows] = useState<SessionRow[]>([]);
  useEffect(() => {
    engine.request<SessionRow[]>("sessions.list", { limit: 4 }).then(setRows).catch(() => {});
  }, []);
  const missing = models ? Object.entries(models).filter(([, ok]) => !ok).map(([k]) => k) : [];

  return (
    <div className="page">
      <section className="hero">
        <div className="grid" style={{ gap: 18 }}>
          <h1>Practice in front of an audience that reacts to you.</h1>
          <p>
            Podium listens to your pace, filler words and vocal variety, and watches where you look. A virtual
            audience leans in or loses interest in real time. Afterwards you get a full debrief, spoken aloud, plus
            the follow-up questions a judge might ask.
          </p>
          <div className="row">
            <button className="btn primary big" onClick={() => go("setup")}>
              Start a practice run
            </button>
            <button className="btn big ghost" onClick={() => go("history")}>
              Past sessions
            </button>
          </div>
          <p className="muted small">
            Runs entirely on this computer. No internet connection, accounts or cloud services are used.
          </p>
          {missing.length > 0 && (
            <p className="small" style={{ color: "var(--bad)" }}>
              Missing models: {missing.join(", ")}. Run <code>scripts/fetch_models.py</code>.
            </p>
          )}
        </div>
        <div className="hero-art">
          <AudienceScene demo />
        </div>
      </section>

      <section className="feature-row">
        {[
          ["Live pacing", "Words per minute over rolling 5-second windows, with an optimal band."],
          ["Filler detection", "Catches um, uh, like and you know as you speak."],
          ["Eye-contact zones", "Left, center, right audience and your notes, tracked from your webcam."],
          ["Spoken debrief", "Scores, a timeline of key moments, and practice questions read aloud."],
        ].map(([t, d]) => (
          <div className="card feature" key={t}>
            <b>{t}</b>
            <span className="muted small">{d}</span>
          </div>
        ))}
      </section>

      {rows.length > 0 && (
        <section style={{ marginTop: 28 }}>
          <div className="row" style={{ marginBottom: 10 }}>
            <h3>Recent sessions</h3>
            <span className="spacer" />
            <button className="btn ghost" onClick={() => go("history")}>
              See all
            </button>
          </div>
          <SessionList rows={rows} onChange={setRows} />
        </section>
      )}
    </div>
  );
}
