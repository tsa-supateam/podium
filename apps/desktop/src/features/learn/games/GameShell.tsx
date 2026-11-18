// Every quick game runs inside this shell: intro (what it trains, the rules) → play → result (score,
// personal best, XP, and a review of what you missed, each linked back to the lesson that teaches it).
import { type ReactNode, useEffect, useState } from "react";
import { engine } from "../../../lib/engine";
import { useApp } from "../../../stores/app";
import { Icon, type IconName } from "../../../ui/icons";
import { type GamePlay, type LearnStatus, skillById } from "../curriculum";
import { GAME_XP_PER_DAY, XP, bestOf, gameXp } from "../game";

export type QuickGame = "claimDuel" | "spotHedge" | "signpostSorter" | "evidenceSort";

export interface Miss { text: string; detail: string }
export interface GameResult { score: number; max: number; misses: Miss[] }
export interface PlayProps { seed: number; onDone: (r: GameResult) => void }

export interface GameDef {
  id: QuickGame;
  title: string;
  blurb: string;
  icon: IconName;
  /** Skills it trains (ids); the first is the "learn the rule" link. */
  skills: string[];
  rules: string[];
  minutes: string;
  /** How to show a score ("9/10", "3★"). */
  fmt: (p: { score: number; max: number }) => string;
  Play: (p: PlayProps) => ReactNode;
}

export function GameShell({ def, st, setSt, demo, onExit, onLesson }: {
  def: GameDef; st: LearnStatus | null; setSt: (s: LearnStatus) => void; demo: boolean;
  onExit: () => void; onLesson: (skillId: string) => void;
}) {
  const [phase, setPhase] = useState<"intro" | "play" | "result">("intro");
  const [seed, setSeed] = useState(() => Date.now());
  const [result, setResult] = useState<{ r: GameResult; xp: number; best: boolean; capped: boolean } | null>(null);

  // Esc leaves (nothing is saved mid-game); Enter starts from the intro and replays from the result.
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea")) return;
      if (e.key === "Escape") onExit();
      if (e.key === "Enter" && phase !== "play") { e.preventDefault(); start(); }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  });

  const start = () => {
    setSeed(Date.now());
    setResult(null);
    setPhase("play");
  };
  const done = async (r: GameResult) => {
    const prev = st?.games?.[def.id] ?? [];
    const play: GamePlay = { at: new Date().toISOString(), score: r.score, max: r.max };
    const plays = [...prev, play];
    const xp = gameXp(plays).at(-1) ?? 0;
    const before = bestOf(prev);
    const best = !before || r.score / r.max > before.score / before.max;
    const today = new Date().toDateString();
    const capped = prev.filter((p) => new Date(p.at).toDateString() === today).length >= GAME_XP_PER_DAY;
    setResult({ r, xp, best, capped });
    setPhase("result");
    if (st) setSt({ ...st, games: { ...st.games, [def.id]: plays }, activity: [...(st.activity ?? []), play.at] });
    if (!demo) {
      try {
        await engine.request("learn.game", { game: def.id, score: r.score, max: r.max });
      } catch {
        useApp.getState().set({ toast: "Couldn't save this game's result." });
      }
    }
  };

  const best = bestOf(st?.games?.[def.id]);
  const lesson = skillById(def.skills[0]);
  return (
    <div className="page learn game-page stagger">
      <header className="game-head">
        <button className="btn ghost" onClick={onExit}><Icon name="arrowL" size={14} /> Play</button>
        <span className="game-head-title"><Icon name={def.icon} size={16} /> {def.title}</span>
        <span className="spacer" />
        {best && <span className="micro">Best {def.fmt(best)}</span>}
      </header>

      {phase === "intro" && (
        <section className="card game-intro">
          <span className="game-badge"><Icon name={def.icon} size={30} /></span>
          <h2>{def.title}</h2>
          <p className="game-blurb">{def.blurb}</p>
          <ul className="game-rules">
            {def.rules.map((r) => <li key={r}><Icon name="arrowR" size={12} /> {r}</li>)}
          </ul>
          <div className="game-trains">
            <span className="micro">Trains</span>
            {def.skills.map((id) => skillById(id)).filter(Boolean).map((s) => (
              <span key={s!.id} className="mchip" style={{ ["--chip" as string]: s!.module.color }}>{s!.module.title} · {s!.title}</span>
            ))}
          </div>
          <div className="row">
            <button className="btn primary big" onClick={start}>Start <Icon name="arrowR" size={14} className="arw" /></button>
            <span className="micro">{def.minutes} · Enter to start · Esc to leave</span>
          </div>
        </section>
      )}

      {phase === "play" && <div className="game-stage" key={seed}>{def.Play({ seed, onDone: (r) => void done(r) })}</div>}

      {phase === "result" && result && (
        <section className="card game-result">
          <div className="game-score">
            <b>{def.fmt(result.r)}</b>
            {result.best && <span className="new-best">New best!</span>}
          </div>
          <p className="game-verdict">{verdict(result.r.score / result.r.max)}</p>
          <div className="xp-earned">
            {result.xp > 0 ? (
              <>
                <b>+{result.xp} XP</b>
                <span className="micro">
                  finished +{XP.game}{result.r.score / result.r.max >= 0.8 ? ` · 80%+ right +${XP.gameGood}` : ""}
                  {result.xp === XP.game + (result.r.score / result.r.max >= 0.8 ? XP.gameGood : 0) + XP.gameBest ? ` · new best +${XP.gameBest}` : ""}
                </span>
              </>
            ) : (
              <span className="micro">{result.capped ? `Today's ${GAME_XP_PER_DAY} XP plays are used up. Scores still count for your best; speaking practice earns more.` : "No XP this time."}</span>
            )}
          </div>
          {result.r.misses.length > 0 && (
            <div className="misses">
              <span className="micro">Worth another look ({result.r.misses.length})</span>
              <ul>
                {result.r.misses.slice(0, 5).map((m, i) => (
                  <li key={i}><b>{m.text}</b><span className="muted small">{m.detail}</span></li>
                ))}
              </ul>
            </div>
          )}
          <div className="row">
            <button className="btn primary" onClick={start}><Icon name="retry" size={14} /> Play again</button>
            {lesson && <button className="btn" onClick={() => onLesson(lesson.id)}><Icon name="book" size={14} /> Lesson: {lesson.title}</button>}
            <button className="btn ghost" onClick={onExit}>Back to Play</button>
          </div>
        </section>
      )}
    </div>
  );
}

const verdict = (pct: number) =>
  pct >= 0.95 ? "Flawless. You'd catch this in a real speech." : pct >= 0.8 ? "Sharp. Your ear for this is strong."
    : pct >= 0.5 ? "Getting there. Read the misses below, then go again." : "Tough round. The lesson below explains the rule in two minutes.";

/** Round counter along the top of a game. */
export function Pips({ n, i, marks }: { n: number; i: number; marks?: (boolean | null)[] }) {
  return (
    <div className="game-pips" aria-label={`Round ${Math.min(i + 1, n)} of ${n}`}>
      {Array.from({ length: n }, (_, k) => (
        <i key={k} className={`${k === i ? "on" : ""} ${marks?.[k] === true ? "ok" : marks?.[k] === false ? "no" : ""}`} />
      ))}
    </div>
  );
}
