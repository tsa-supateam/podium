// Learn → Play: quick games (no recording), speaking games (Pace Runner, bosses), rusty skills to
// review, and the Locker of cosmetics. Everything here feeds the same XP, streak and skills as the path.
import { useState } from "react";
import { engine } from "../../../lib/engine";
import { useApp } from "../../../stores/app";
import { Icon, MODULE_ICON } from "../../../ui/icons";
import { type LearnStatus, MODULES, type Skill, isRusty, skillById } from "../curriculum";
import {
  GAME_XP_PER_DAY, type Slot, UNLOCKABLES, type Unlockable, bestOf, bossBeaten, bossReady, equipped, isUnlocked, xpOf,
} from "../game";
import { GAMES } from "./QuickGames";
import { startBoss, startPaceRunner } from "./Speak";

const goGame = (game: string | null) => useApp.getState().set({ learnPath: { module: null, skill: null, game } });
type FullSkill = NonNullable<ReturnType<typeof skillById>>;
const goSkill = (s: FullSkill) => useApp.getState().set({ learnPath: { module: s.module.id, skill: s.id, game: null } });

/** Start a skill's normal practice (a review, for a rusty skill). */
export function startPractice(s: Skill) {
  const { set, go } = useApp.getState();
  set({ drill: { skill: s.id, check: s.check, prompt: s.practice.prompt, seconds: s.practice.seconds } });
  go("setup");
}

export const rustySkills = (st: LearnStatus | null) => MODULES.flatMap((m) => m.skills.map((s) => skillById(s.id)!)).filter((s) => isRusty(s, st));

export function PlaySection({ st, demo }: { st: LearnStatus | null; demo: boolean }) {
  const today = new Date().toDateString();
  const rusty = rustySkills(st);
  const pace = st?.paceRunner ?? [];
  const paceBest = pace.length ? Math.max(...pace.map((r) => r.inBandPct)) : null;
  const [len, setLen] = useState(60);
  const xp = xpOf(st);
  const unlockedCount = UNLOCKABLES.filter((u) => isUnlocked(u, st, xp, demo)).length;
  return (
    <div className="play">
      <section className="play-block">
        <h3 className="play-h"><span>Quick games</span><span className="micro">no recording · about 2 minutes</span></h3>
        <div className="play-games">
          {GAMES.map((g, n) => {
            const plays = st?.games?.[g.id] ?? [];
            const best = bestOf(plays);
            const left = Math.max(0, GAME_XP_PER_DAY - plays.filter((p) => new Date(p.at).toDateString() === today).length);
            const s = skillById(g.skills[0]);
            return (
              <button key={g.id} className={`play-game ${plays.length ? "" : "fresh"}`} onClick={() => goGame(g.id)} style={{ animationDelay: `${60 + n * 50}ms` }}>
                <span className="play-game-top">
                  <span className="play-game-icon"><Icon name={g.icon} size={20} /></span>
                  {!plays.length && <span className="new-tag">New</span>}
                </span>
                <b>{g.title}</b>
                <span className="small muted">{g.blurb}</span>
                <span className="play-game-foot">
                  {s && <span className="mchip" style={{ ["--chip" as string]: s.module.color }}>{s.module.title}</span>}
                  <span className="micro">{best ? `Best ${g.fmt(best)}` : "Not played"}</span>
                  <span className="micro xp-left" title="Plays that still earn XP today">{left ? `${left} XP play${left > 1 ? "s" : ""} left` : "XP done today"}</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <div className="play-row">
        <section className="card play-pace">
          <h3 className="play-h"><span><Icon name="speed" size={15} /> Pace Runner</span><span className="micro">records you</span></h3>
          <p className="small muted">Talk on a prompt while a live needle shows your speed. Keep it in the lane: pauses are free.</p>
          <div className="pace-history" aria-label="Your Pace Runner runs">
            {pace.slice(-12).map((r) => <i key={r.sessionId} style={{ height: `${Math.max(6, r.inBandPct)}%` }} title={`${r.inBandPct}% in band`} className={r.inBandPct === paceBest ? "best" : ""} />)}
            {!pace.length && <span className="micro">Your runs will show here</span>}
          </div>
          <div className="row">
            <div className="segmented small" role="radiogroup" aria-label="Length">
              {[60, 90].map((n) => <button key={n} role="radio" aria-checked={len === n} className={len === n ? "on" : ""} onClick={() => setLen(n)}>{n} s</button>)}
            </div>
            <span className="spacer" />
            {paceBest != null && <span className="micro">Best {paceBest}%</span>}
            <button className="btn primary" onClick={() => startPaceRunner(len)}><Icon name="mic" size={14} /> Run</button>
          </div>
        </section>

        <section className="card play-bosses">
          <h3 className="play-h"><span><Icon name="medal" size={15} /> Boss fights</span><span className="micro">optional · {MODULES.filter((m) => bossBeaten(m, st)).length}/{MODULES.length} defeated</span></h3>
          <div className="boss-grid">
            {MODULES.map((m) => {
              const beaten = bossBeaten(m, st), ready = bossReady(m, st, demo);
              return (
                <button key={m.id} className={`boss-tile ${beaten ? "beaten" : ready ? "ready" : "waiting"}`}
                  onClick={() => (ready ? startBoss(m) : useApp.getState().set({ learnPath: { module: m.id, skill: null, game: null } }))}
                  title={beaten ? `${m.title}: defeated. Rematch?` : ready ? `Fight the ${m.title} boss` : `Start every ${m.title} skill first`}>
                  <span className="boss-gem small"><Icon name={beaten ? "check" : ready ? MODULE_ICON[m.id] ?? "target" : "lock"} size={14} /></span>
                  <span>{m.title}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section className={`card play-review ${rusty.length ? "has" : ""}`}>
          <h3 className="play-h"><span><Icon name="retry" size={15} /> Review</span><span className="micro">{rusty.length ? `${rusty.length} rusty` : "all sharp"}</span></h3>
          {rusty.length ? (
            <ul className="rust-list">
              {rusty.slice(0, 3).map((s) => (
                <li key={s.id}>
                  <span className="rust-mark" aria-hidden />
                  <span className="rust-copy"><b>{s.title}</b><span className="micro">slipped in your recent talks</span></span>
                  <button className="btn small" onClick={() => goSkill(s)}>Lesson</button>
                  <button className="btn small primary" onClick={() => startPractice(s)}>Review</button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="small muted">Nothing rusty. A mastered skill turns rusty if it slips in your full talks; a quick review practice polishes it again.</p>
          )}
        </section>
      </div>

      <button className="locker-strip" onClick={() => goGame("locker")}>
        <Icon name="grid" size={16} />
        <b>Locker</b>
        <span className="micro">{unlockedCount} of {UNLOCKABLES.length} unlocked · accents, rings, XP bars and titles</span>
        <span className="spacer" />
        <span className="locker-swatches">{UNLOCKABLES.filter((u) => u.slot === "accent").map((u) => (
          <i key={u.id} style={{ background: u.value }} className={isUnlocked(u, st, xp, demo) ? "" : "off"} />
        ))}</span>
        <Icon name="arrowR" size={14} />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- Locker
const SLOT_LABEL: Record<Slot, string> = { accent: "Accent color", ring: "Ring style", xpBar: "XP bar", badge: "Title" };

export function Locker({ st, setSt, demo }: { st: LearnStatus | null; setSt: (s: LearnStatus) => void; demo: boolean }) {
  const xp = xpOf(st);
  const eq = equipped(st, xp, demo);
  const equip = async (u: Unlockable) => {
    if (st) setSt({ ...st, equipped: { ...st.equipped, [u.slot]: u.id } });
    if (!demo) await engine.request("learn.equip", { slot: u.slot, item: u.id }).catch(() => {});
  };
  return (
    <div className="page learn locker-page stagger">
      <header className="game-head">
        <button className="btn ghost" onClick={() => goGame("play")}><Icon name="arrowL" size={14} /> Play</button>
        <span className="game-head-title"><Icon name="grid" size={16} /> Locker</span>
        <span className="spacer" />
        <span className="micro">Cosmetic only: earned by playing, never bought</span>
      </header>
      <div className="locker scroll">
        {(Object.keys(SLOT_LABEL) as Slot[]).map((slot) => (
          <section key={slot} className="locker-slot">
            <h3 className="play-h"><span>{SLOT_LABEL[slot]}</span><span className="micro">Equipped: {eq[slot].name}</span></h3>
            <div className="locker-grid">
              {UNLOCKABLES.filter((u) => u.slot === slot).map((u) => {
                const open = isUnlocked(u, st, xp, demo);
                const on = eq[slot].id === u.id;
                const p = Math.round(u.progress(st, xp) * 100);
                return (
                  <button key={u.id} className={`locker-item ${open ? "open" : "locked"} ${on ? "on" : ""}`} disabled={!open || on} onClick={() => void equip(u)}>
                    <Preview u={u} />
                    <b>{u.name}</b>
                    {open ? <span className="micro">{on ? "Equipped" : "Equip"}</span> : (
                      <>
                        <span className="micro">{u.how}</span>
                        <span className="locker-progress"><span style={{ width: `${p}%` }} /></span>
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function Preview({ u }: { u: Unlockable }) {
  if (u.slot === "accent") return <span className="pv pv-accent" style={{ background: u.value, boxShadow: `0 0 16px -2px ${u.value}` }} />;
  if (u.slot === "ring") return <span className={`pv pv-ring ring-${u.value}`}><svg viewBox="0 0 36 36"><circle className="t" cx="18" cy="18" r="14" /><circle className="a" cx="18" cy="18" r="14" /></svg></span>;
  if (u.slot === "xpBar") return <span className={`pv pv-xp xp-${u.value}`}><span className="xp-bar"><span style={{ width: "64%" }} /></span></span>;
  return <span className="pv pv-badge">{u.value || "—"}</span>;
}
