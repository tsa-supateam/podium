// The two speaking games: Pace Runner (keep your live speed inside the band) and module bosses (one
// run that must pass every check in a module). Both record through the normal practice flow; the
// Setup screen only shows their own card (title, goal) when one of them is starting.
import { useEffect, useRef, useState } from "react";
import { engine } from "../../../lib/engine";
import { randomPrompt } from "../../../lib/prompts";
import { live, SPEED_BANDS, useApp } from "../../../stores/app";
import { Icon, MODULE_ICON } from "../../../ui/icons";
import { type LearnStatus, MODULES, type Module, skillById } from "../curriculum";
import { BADGE, BOSS_PROMPTS, XP, bossBeaten, bossChecks, bossSeconds } from "../game";

const skillOfCheck = (m: Module, check: string) => m.skills.find((s) => s.check === check);

// ---------------------------------------------------------------- launching
export function startPaceRunner(seconds = 60) {
  const { set, go, settings } = useApp.getState();
  const band = SPEED_BANDS[settings.speechType];
  set({ drill: {
    skill: "speed.target", check: "target_pace", prompt: randomPrompt().text, seconds, game: "paceRunner", title: "Pace Runner",
    instruction: "Talk on the prompt and keep the live needle inside the target band. Pauses don't count against you, so breathe.",
    target: `As much time as you can between ${band[0]} and ${band[1]} words per minute. It ends by itself after ${seconds} s.`,
  } });
  go("setup");
}

export function startBoss(m: Module) {
  const { set, go } = useApp.getState();
  const checks = bossChecks(m);
  set({ drill: {
    skill: m.skills[0].id, check: "boss", prompt: BOSS_PROMPTS[m.id], seconds: bossSeconds(m), game: "boss", boss: m.id, checks,
    title: `${m.title} boss`,
    instruction: `One run, every ${m.title.toLowerCase()} skill at once. Beat it to unlock the “${BADGE[m.id]}” title.`,
    target: checks.map((c) => skillOfCheck(m, c)?.practice.target).filter(Boolean).join(" · "),
  } });
  go("setup");
}

// ---------------------------------------------------------------- Setup card (only for these two games)
export function SpeakGameCard() {
  const { drill, set, go } = useApp();
  if (!drill?.title) return null;
  const m = drill.boss ? MODULES.find((x) => x.id === drill.boss) : null;
  const back = () => { set({ learnPath: { module: m?.id ?? null, skill: null, game: m ? null : "play" } }); go("learn"); };
  return (
    <section className={`card drill-card speak-card ${drill.game}`}>
      <span className="micro">{drill.game === "boss" ? "Boss fight" : "Play"} / {drill.seconds} s</span>
      <b className="drill-title">{drill.title}</b>
      <p>{drill.instruction}</p>
      <div className="practice-prompt"><span className="muted small">Your prompt</span><b>{drill.prompt}</b></div>
      {drill.game === "boss" && m ? (
        <ul className="boss-targets">
          {(drill.checks ?? []).map((c) => { const s = skillOfCheck(m, c); return s ? <li key={c}><Icon name="target" size={12} /> <b>{s.title}:</b> {s.practice.target}</li> : null; })}
        </ul>
      ) : <p className="small"><span className="muted">To win:</span> {drill.target}</p>}
      <div className="row">
        <button className="link-btn" onClick={back}><Icon name="arrowL" size={12} /> Back to {m ? m.title : "Play"}</button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- live overlays
/** Pace Runner HUD on the speaking screen: a lane you keep the needle in, time in band, streak. */
export function PaceRunnerLive({ elapsed, paused }: { elapsed: number; paused: boolean }) {
  const { drill, settings } = useApp();
  const band = SPEED_BANDS[settings.speechType];
  const acc = useRef({ last: 0, total: 0, inside: 0, streak: 0, best: 0, trail: [] as number[] });
  const [, force] = useState(0);
  const p = live.pace;
  const wpm = p && p.label !== "pause" ? p.wpmEma : null;
  useEffect(() => {
    const a = acc.current;
    const dt = Math.max(0, Math.min(1, elapsed - a.last));
    a.last = elapsed;
    if (paused || elapsed < 8 || wpm == null || !dt) return;
    a.total += dt;
    const ok = wpm >= band[0] && wpm <= band[1];
    if (ok) { a.inside += dt; a.streak += dt; a.best = Math.max(a.best, a.streak); } else a.streak = 0;
    if (Math.floor(elapsed) !== Math.floor(elapsed - dt)) { a.trail = [...a.trail, wpm].slice(-40); force((n) => n + 1); }
  }, [elapsed]); // eslint-disable-line react-hooks/exhaustive-deps
  const a = acc.current;
  const MIN = 60, MAX = 220, x = (v: number) => ((Math.max(MIN, Math.min(MAX, v)) - MIN) / (MAX - MIN)) * 100;
  const pct = a.total ? Math.round((100 * a.inside) / a.total) : null;
  const inBand = wpm != null && wpm >= band[0] && wpm <= band[1];
  const left = Math.max(0, (drill?.seconds ?? 60) - elapsed);
  return (
    <div className={`pace-run ${elapsed < 8 ? "warm" : inBand ? "in" : wpm == null ? "pause" : wpm < band[0] ? "slow" : "fast"}`} aria-live="off">
      <div className="pace-run-top">
        <span className="micro">Pace Runner</span>
        <b>{elapsed < 8 ? "Warm-up…" : wpm == null ? "Pause: fine" : inBand ? "In the lane" : wpm < band[0] ? "Speed up" : "Slow down"}</b>
        <span className="spacer" />
        <span className="micro">{Math.ceil(left)} s left</span>
      </div>
      <div className="pace-road">
        <span className="pace-band" style={{ left: `${x(band[0])}%`, width: `${x(band[1]) - x(band[0])}%` }} />
        <span className="pace-dash" />
        {a.trail.map((v, k) => <i key={k} className="pace-dot" style={{ left: `${x(v)}%`, bottom: `${(k / 40) * 100}%`, opacity: 0.15 + (k / a.trail.length) * 0.6 }} />)}
        {wpm != null && <span className="pace-car" style={{ left: `${x(wpm)}%` }}><small>{Math.round(wpm)}</small></span>}
        <span className="pace-scale l">{MIN}</span><span className="pace-scale r">{MAX} WPM</span>
      </div>
      <div className="pace-run-stats">
        <span><b>{pct ?? "–"}{pct != null && <small>%</small>}</b><span className="micro">in band</span></span>
        <span><b>{Math.round(a.streak)}<small>s</small></b><span className="micro">streak</span></span>
        <span><b>{Math.round(a.best)}<small>s</small></b><span className="micro">best streak</span></span>
      </div>
    </div>
  );
}

/** The boss's checklist on the speaking screen, so you know what you're aiming for. */
export function BossLive() {
  const drill = useApp((s) => s.drill);
  const m = MODULES.find((x) => x.id === drill?.boss);
  if (!m) return null;
  return (
    <div className="boss-live">
      <span className="kind"><Icon name={MODULE_ICON[m.id] ?? "target"} size={14} /> {m.title} boss</span>
      <span className="boss-live-list">{(drill!.checks ?? []).map((c) => <span key={c}>{skillOfCheck(m, c)?.title}</span>)}</span>
    </div>
  );
}

// ---------------------------------------------------------------- results (on the debrief)
export function PaceRunnerResult({ r, passed }: { r: { inBandPct: number; bestStreakSec: number; band: number[] }; passed?: boolean }) {
  const { set, go } = useApp();
  const [prevBest, setPrevBest] = useState<number | null | undefined>(undefined);
  const sid = useApp((s) => s.sessionId);
  useEffect(() => {
    engine.request<LearnStatus>("learn.status", {}).then((st) => {
      const others = (st.paceRunner ?? []).filter((x) => x.sessionId !== sid).map((x) => x.inBandPct);
      setPrevBest(others.length ? Math.max(...others) : null);
    }).catch(() => setPrevBest(null));
  }, [sid]);
  const best = prevBest != null && r.inBandPct > prevBest;
  return (
    <section className={`card drill-result speak-result ${r.inBandPct >= 70 ? "passed" : ""}`}>
      <span className="drill-mark"><Icon name="speed" size={22} /></span>
      <div>
        <span className="micro">Play / Pace Runner · {r.band[0]}–{r.band[1]} WPM</span>
        <b className="drill-title">{r.inBandPct}% in the lane{best ? " · new best!" : prevBest === null ? " · first run" : ""}</b>
        <span className="small">
          Longest streak {r.bestStreakSec} s{prevBest != null ? ` · your best before: ${prevBest}%` : " · the score to beat"}{best ? ` · +${XP.paceBest} XP` : ""}
          {passed != null && <> · Speed practice: {passed ? "passed" : "not yet"} (average inside the band)</>}
        </span>
      </div>
      <span className="spacer" />
      <button className="btn ghost" onClick={() => startPaceRunner()}><Icon name="retry" size={14} /> Play again</button>
      <button className="btn primary" onClick={() => { go("learn"); set({ learnPath: { module: null, skill: null, game: "play" } }); }}>Back to Play</button>
    </section>
  );
}

export function BossResult({ boss }: { boss: { module: string; results: { id: string; value: number | null; passed: boolean }[]; passed: boolean } }) {
  const { set, go } = useApp();
  const m = MODULES.find((x) => x.id === boss.module);
  if (!m) return null;
  const hit = boss.results.filter((r) => r.passed).length;
  return (
    <section className={`card boss-result ${boss.passed ? "won" : ""}`}>
      <div className="boss-result-head">
        <span className="boss-gem"><Icon name={MODULE_ICON[m.id] ?? "target"} size={22} /></span>
        <div>
          <span className="micro">Boss fight / {m.title}</span>
          <b className="drill-title">{boss.passed ? "Boss defeated!" : `${hit} of ${boss.results.length} hit`}</b>
          <span className="small">{boss.passed ? `+${XP.boss} XP on your first win · title unlocked: “${BADGE[m.id]}”. Equip it in the Locker.` : "Every check has to land in the same run. The ones you missed are below."}</span>
        </div>
      </div>
      <ul className="boss-checks">
        {boss.results.map((r) => {
          const s = skillOfCheck(m, r.id);
          if (!s) return null;
          const v = r.value == null ? "not found" : s.practice.unit ? s.practice.unit(r.value) : String(r.value);
          return (
            <li key={r.id} className={r.passed ? "ok" : "no"}>
              <Icon name={r.passed ? "check" : "cross"} size={13} /> <b>{s.title}</b>
              <span className="muted small">You: {v} · Target: {s.practice.target}</span>
              {!r.passed && <button className="link-btn" onClick={() => { go("learn"); set({ learnPath: { module: m.id, skill: s.id } }); }}>Lesson</button>}
            </li>
          );
        })}
      </ul>
      <div className="row">
        <button className="btn ghost" onClick={() => startBoss(m)}><Icon name="retry" size={14} /> Fight again</button>
        <button className="btn primary" onClick={() => { go("learn"); set({ learnPath: { module: m.id, skill: null } }); }}>Back to {m.title}</button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- boss card (module page and Play)
export function BossCard({ m, st, ready, demo }: { m: Module; st: LearnStatus | null; ready: boolean; demo: boolean }) {
  const tries = st?.bosses?.[m.id] ?? [];
  const beaten = bossBeaten(m, st);
  const last = tries.at(-1);
  const checks = bossChecks(m);
  return (
    <section className={`card boss-card ${beaten ? "beaten" : ready ? "ready" : "waiting"}`}>
      <span className="boss-gem" aria-hidden><Icon name={beaten ? "check" : MODULE_ICON[m.id] ?? "target"} size={20} /></span>
      <div className="boss-copy">
        <span className="micro">Optional · Boss fight · {bossSeconds(m)} s</span>
        <b>{beaten ? `${m.title} boss defeated` : `Face the ${m.title} boss`}</b>
        <span className="small muted">
          {beaten ? `Title “${BADGE[m.id]}” unlocked. Fight again any time to prove it still holds.`
            : ready ? `Pass all ${checks.length} ${m.title.toLowerCase()} checks in one run. Win: +${XP.boss} XP and the “${BADGE[m.id]}” title.`
            : "Start every skill in this module (read its lesson) to face the boss."}
        </span>
        <span className="boss-pips">
          {checks.map((c) => {
            const r = last?.results.find((x) => x.id === c);
            return <i key={c} className={r ? (r.passed ? "ok" : "no") : ""} title={`${skillOfCheck(m, c)?.title}${r ? (r.passed ? ": hit last time" : ": missed last time") : ""}`} />;
          })}
          {last && !beaten && <span className="micro">last try</span>}
        </span>
      </div>
      <button className={`btn ${ready && !beaten ? "primary" : ""}`} disabled={!ready} onClick={() => startBoss(m)}
        title={demo ? "Demo mode: this records a real run" : undefined}>
        <Icon name="mic" size={14} /> {beaten ? "Rematch" : tries.length ? "Try again" : "Fight"}
      </button>
    </section>
  );
}

export const skillTitle = (id: string) => skillById(id)?.title ?? id;
