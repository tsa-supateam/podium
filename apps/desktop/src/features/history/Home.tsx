import { useEffect, useState } from "react";
import { engine } from "../../lib/engine";
import type { SessionRow } from "../../lib/types";
import { useApp } from "../../stores/app";
import { Icon } from "../../ui/icons";
import { Corners, Odometer } from "../../ui/kit";
import AudienceScene from "../audience/Audience";

export default function Home() {
  const { go, models } = useApp();
  const [all, setAll] = useState<SessionRow[]>([]);
  useEffect(() => {
    engine.request<SessionRow[]>("sessions.list", { limit: 200 }).then(setAll).catch(() => {});
  }, []);
  const missing = models ? Object.entries(models).filter(([, ok]) => !ok).map(([k]) => k) : [];
  const scored = all.filter((r) => r.overall != null);
  const best = scored.length ? Math.max(...scored.map((r) => r.overall!)) : 0;
  const minutes = Math.round(all.reduce((a, r) => a + r.durationSec, 0) / 60);
  const avg = scored.length ? Math.round(scored.reduce((a, r) => a + r.overall!, 0) / scored.length) : 0;

  return (
    <div className="page home stagger">
      <section className="home-top">
        <div className="home-copy">
          <h1 className="display">
            {["Practice in front", "of an audience", "that reacts."].map((l, i) => (
              <span className="line-mask" key={l}><span className="line" style={{ animationDelay: `${80 + i * 60}ms` }}>{l}</span></span>
            ))}
          </h1>
          <p>Speak. The room reacts. Get scored on pace, fillers, voice and eye contact.</p>
          <div className="home-ctas">
            <button className="btn primary big" onClick={() => go("setup")}>
              Start a practice run <Icon name="arrowR" size={14} className="arw" />
            </button>
            <button className="btn ghost" onClick={() => { useApp.getState().set({ learnPath: { module: null, skill: null } }); go("learn"); }}>
              <Icon name="learn" size={14} /> Learn
            </button>
            <button className="btn ghost" onClick={() => go("history")}>
              <Icon name="history" size={14} /> Past sessions
            </button>
          </div>
          {missing.length > 0 && (
            <p className="small" style={{ color: "var(--bad-ink)" }}>
              <Icon name="warn" size={14} /> Missing models: {missing.join(", ")}. Run <code>scripts/fetch_models.py</code>.
            </p>
          )}
        </div>
        <figure className="home-preview">
          <div className="home-preview-frame">
            <AudienceScene demo />
          </div>
          <Corners tone="signal" />
          <figcaption className="micro"><span className="live-dot" /> Your audience, live</figcaption>
        </figure>
      </section>

      <section className="home-stats" aria-label="Your numbers">
        {([
          [all.length, "Sessions", "var(--signal)"],
          [minutes, "Minutes spoken", "var(--paper)"],
          [best || "--", "Best score", "var(--good)"],
          [avg || "--", "Average score", "var(--concrete-dim)"],
        ] as const).map(([v, label, color]) => (
          <div className="home-stat" key={label}>
            <span className="home-stat-value" style={{ color }}><Odometer value={v} /></span>
            <span className="micro">{label}</span>
          </div>
        ))}
      </section>
    </div>
  );
}
