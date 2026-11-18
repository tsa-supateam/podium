// Learn: modules -> skills -> lesson + practice, like a course. Modules are the things the analysis
// scores, so practicing a skill here moves the same number on your results.
import { useEffect, useMemo, useRef, useState } from "react";
import { openSession } from "../../App";
import { engine } from "../../lib/engine";
import type { SessionRow } from "../../lib/types";
import { useApp } from "../../stores/app";
import {
  MASTERY, MODULES, type LearnStatus, type Mastery, type Module, type Skill, isRusty, mastery, moduleProgress, skillById,
} from "./curriculum";
import {
  TREE, UNLOCKABLES, XP, bossBeaten, bossReady, demoStatus, equipped, isUnlocked, level, lockReason, streak, testClaim, unlocked, xpOf,
} from "./game";
import { GameShell } from "./games/GameShell";
import { Locker, PlaySection, rustySkills, startPractice } from "./games/Play";
import { GAMES } from "./games/QuickGames";
import { BossCard } from "./games/Speak";
import { Icon, MODULE_ICON } from "../../ui/icons";
import { ScreenHeader, Stepper } from "../../ui/kit";
import { LessonFlow, latestRun } from "./LessonFlow";

function useLearnStatus(): [LearnStatus | null, (s: LearnStatus) => void, boolean] {
  const demo = useApp((s) => !!s.settings.demoMode);
  const [st, setSt] = useState<LearnStatus | null>(null);
  const [demoSt, setDemoSt] = useState<LearnStatus>(() => demoStatus());
  useEffect(() => {
    engine.request<LearnStatus>("learn.status", {}).then(setSt).catch(() => setSt({ lessons: [], checks: {} }));
  }, []);
  // Judge Demo Mode: rich made-up progress, kept in memory only (your real progress is untouched)
  return demo ? [demoSt, setDemoSt, true] : [st, setSt, false];
}

/** Depth of a Learn view: course 0, module 1, skill 2 (for the zoom direction). */
const depthOf = (p: { module: string | null; skill: string | null }) => (p.skill ? 2 : p.module ? 1 : 0);
let origin = "50% 30%"; // where the last click was, so a view zooms out of the node you picked

export default function Learn() {
  const path = useApp((s) => s.learnPath);
  const [st, setSt, demo] = useLearnStatus();
  const skill = path.skill ? skillById(path.skill) : null;
  const mod = MODULES.find((m) => m.id === (skill?.module.id ?? path.module)) ?? null;
  const depth = depthOf(path);
  const prev = useRef(depth);
  const dir = depth >= prev.current ? "in" : "out";
  useEffect(() => {
    prev.current = depth;
  }, [depth]);
  const game = GAMES.find((g) => g.id === path.game);
  const key = `${path.module ?? ""}/${path.skill ?? ""}/${game || path.game === "locker" ? path.game : ""}`;
  // Cosmetics from the Locker: accent color, ring style and XP bar style for all of Learn.
  const eq = equipped(st, xpOf(st), false);
  const look = { transformOrigin: origin, ["--accent-pick" as string]: eq.accent.value };
  return (
    <div key={key} className={`learn-view zoom-${dir} ring-${eq.ring.value} xp-${eq.xpBar.value}`} style={look}>
      {game ? <GameShell def={game} st={st} setSt={setSt} demo={demo} onExit={() => nav(null, null, undefined, "play")}
          onLesson={(id) => nav(skillById(id)!.module.id, id)} />
        : path.game === "locker" ? <Locker st={st} setSt={setSt} demo={demo} />
        : skill && mod ? <SkillPage mod={mod} skill={skill} st={st} setSt={setSt} demo={demo} />
        : mod ? <ModulePage mod={mod} st={st} demo={demo} />
        : <Course st={st} setSt={setSt} demo={demo} tab={path.game === "play" ? "play" : null} />}
    </div>
  );
}

const nav = (module: string | null, skill: string | null = null, e?: { clientX: number; clientY: number }, game: string | null = null) => {
  origin = e ? `${Math.round((e.clientX / innerWidth) * 100)}% ${Math.round((e.clientY / innerHeight) * 100)}%` : "50% 30%";
  useApp.getState().set({ learnPath: { module, skill, game } });
};

/** Path (the skill tree) or Play (games), remembered per viewer. */
type Tab = "path" | "play";
const savedTab = (): Tab => { try { return localStorage.getItem("learn.tab") === "play" ? "play" : "path"; } catch { return "path"; } };
const saveTab = (t: Tab) => { try { localStorage.setItem("learn.tab", t); } catch { /* private window */ } };

function MasteryChip({ m }: { m: Mastery }) {
  return <span className={`mastery-chip m${m}`}>{MASTERY[m].name}</span>;
}

function MasterySquares({ mod, st }: { mod: Module; st: LearnStatus | null }) {
  return (
    <span className="mastery-squares">
      {mod.skills.map((s) => {
        const m = mastery(s, st);
        return <span key={s.id} className={`msq m${m}`} title={`${s.title}: ${MASTERY[m].name}`} />;
      })}
    </span>
  );
}

function ModuleIcon({ mod, size = 44 }: { mod: Module; size?: number }) {
  return (
    <span className="module-icon" style={{ width: size, height: size }} aria-hidden>
      <Icon name={MODULE_ICON[mod.id] ?? "target"} size={Math.round(size * 0.5)} />
    </span>
  );
}

/** Glowing circular progress meter; the arc draws itself in on mount. */
export function Ring({ value, size = 120, stroke = 8, children, tone = "signal" }: {
  value: number; size?: number; stroke?: number; children?: React.ReactNode; tone?: "signal" | "good" | "dim";
}) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const color = tone === "good" ? "var(--good)" : tone === "dim" ? "var(--concrete-dim)" : "var(--learn-accent)";
  return (
    <span className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--charcoal-600)" strokeWidth={stroke} />
        {Array.from({ length: 40 }, (_, i) => {
          const a = (i / 40) * 2 * Math.PI - Math.PI / 2;
          return <line key={i} x1={size / 2 + Math.cos(a) * (r - stroke)} y1={size / 2 + Math.sin(a) * (r - stroke)}
            x2={size / 2 + Math.cos(a) * (r - stroke - 3)} y2={size / 2 + Math.sin(a) * (r - stroke - 3)}
            stroke="var(--concrete)" strokeOpacity={0.18} strokeWidth={1} />;
        })}
        <circle className="ring-arc" cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeLinecap="butt" strokeDasharray={c} style={{ ["--ring-off" as string]: c * (1 - Math.max(0, Math.min(1, value))), ["--ring-c" as string]: c }}
          transform={`rotate(-90 ${size / 2} ${size / 2})`} filter={value > 0 ? "url(#ring-glow)" : undefined} />
        <defs>
          <filter id="ring-glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="2.5" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
      </svg>
      <span className="ring-body">{children}</span>
    </span>
  );
}

// ---------------------------------------------------------------- course overview
function Course({ st, setSt, demo, tab: forced }: { st: LearnStatus | null; setSt: (s: LearnStatus) => void; demo: boolean; tab: Tab | null }) {
  const [last, setLast] = useState<SessionRow | null>(null);
  const [tab, setTabState] = useState<Tab>(() => forced ?? savedTab());
  const setTab = (t: Tab) => { setTabState(t); saveTab(t); if (forced) useApp.getState().set({ learnPath: { module: null, skill: null, game: null } }); };
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea, select") || e.metaKey || e.ctrlKey) return;
      if (e.key.toLowerCase() === "p") setTab(tab === "path" ? "play" : "path");
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  });
  useUnlockToast(st, demo, setSt);
  useEffect(() => {
    engine.request<SessionRow[]>("sessions.list", { limit: 20 })
      .then((rows) => setLast(rows.find((r) => r.overall != null && !r.title.startsWith("Practice:")) ?? null))
      .catch(() => {});
  }, []);
  // Recommend the module behind the weakest score of your latest full run (or what unlocks it).
  const scores = (last?.scores ?? {}) as Record<string, number | null>;
  const weakest = [...MODULES]
    .filter((m) => m.scoreKeys.some((k) => scores[k] != null))
    .sort((a, b) => Math.min(...a.scoreKeys.map((k) => scores[k] ?? 101)) - Math.min(...b.scoreKeys.map((k) => scores[k] ?? 101)))[0];
  const rec = weakest && !unlocked(weakest, st, demo)
    ? MODULES.find((m) => TREE[weakest.id].needs.includes(m.id) && unlocked(m, st, demo)) ?? weakest : weakest;
  const total = Math.round(MODULES.reduce((a, m) => a + moduleProgress(m, st), 0) / MODULES.length);
  const xp = xpOf(st), lv = level(xp);
  const sk = streak(st?.activity);
  const passed = Object.values(st?.checks ?? {}).filter((c) => c.attempts.some((a) => a.passed)).length;
  const rusty = rustySkills(st);
  const badge = equipped(st, xp, demo).badge;
  const playNew = rusty.length > 0 || GAMES.some((g) => !(st?.games?.[g.id]?.length));

  return (
    <div className="page learn stagger">
      <ScreenHeader title="Learn" meta={demo ? ["Judge demo mode: sample progress"] : undefined}>
        <div className="segmented learn-tabs" role="tablist" aria-label="Learn view">
          {(["path", "play"] as Tab[]).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "on" : ""} onClick={() => setTab(t)} title="Press P to switch">
              {t === "path" ? "Path" : "Play"}{t === "play" && playNew && tab !== "play" && <i className="tab-dot" aria-label="Something new" />}
            </button>
          ))}
        </div>
        {rec && (
          <button className="rec-orb" onClick={(e) => nav(rec.id, null, e)} title={`Recommended from your last run: ${rec.title}. ${rec.improves}`}
            aria-label={`Start recommended module: ${rec.title}`}>
            <span className="rec-orb-text">
              <span className="micro">Recommended</span>
              <b>{rec.title}</b>
            </span>
            <span className="rec-orb-circle"><Icon name={MODULE_ICON[rec.id] ?? "target"} size={20} /></span>
          </button>
        )}
      </ScreenHeader>
      <section className="learn-hud">
        <div className="hud-ring">
          <Ring value={total / 100} size={132} stroke={9}>
            <b className="ring-value">{total}<small>%</small></b>
            <span className="micro">Mastery</span>
          </Ring>
        </div>
        <div className="hud-xp">
          <div className="row" style={{ gap: 10, alignItems: "baseline" }}>
            <span className="hud-level">LV {String(lv.level).padStart(2, "0")}</span>
            <b className="hud-rank">{lv.rank}</b>
            {badge.value && <span className="hud-badge">{badge.value}</span>}
            <span className="spacer" />
            <span className="micro">{xp.toLocaleString()} XP</span>
          </div>
          <div className="xp-bar" role="meter" aria-label="XP to next level" aria-valuenow={lv.into} aria-valuemax={lv.need}>
            <span style={{ width: `${(lv.into / lv.need) * 100}%` }} />
          </div>
          <span className="micro">{lv.need - lv.into} XP to LV {String(lv.level + 1).padStart(2, "0")} · lesson +{XP.lesson} · pass +{XP.pass} · mastered +{XP.mastered}</span>
          <div className="hud-stats">
            <span><b>{st?.lessons.length ?? 0}</b><span className="micro">lessons</span></span>
            <span><b>{passed}</b><span className="micro">practices passed</span></span>
            <span><b>{MODULES.filter((m) => unlocked(m, st, demo)).length}/{MODULES.length}</b><span className="micro">modules unlocked</span></span>
          </div>
        </div>
        {rusty.length > 0 && (
          <button className="hud-rust" onClick={() => setTab("play")} title={`Rusty: ${rusty.map((s) => s.title).join(", ")}. Review them in Play.`}>
            <span className="rust-mark" aria-hidden /><b>{rusty.length}</b><span className="micro">rusty</span>
          </button>
        )}
        <div className={`hud-streak ${sk.days ? "lit" : ""}`} title={sk.today ? "You practiced today" : sk.days ? "Practice today to keep your streak" : "Practice today to start a streak"}>
          <Flame lit={sk.days > 0} />
          <b>{sk.days}</b>
          <span className="micro">day streak</span>
          <span className="streak-week">
            {sk.week.map((on, i) => <i key={i} className={on ? "on" : ""} />)}
          </span>
        </div>
      </section>

      {tab === "path" ? (
        <div className="skill-tree-wrap scroll">
          <SkillTree st={st} demo={demo} />
        </div>
      ) : (
        <div className="play-wrap scroll">
          <PlaySection st={st} demo={demo} />
        </div>
      )}
    </div>
  );
}

function Flame({ lit }: { lit: boolean }) {
  return (
    <svg className={`flame ${lit ? "lit" : ""}`} width="30" height="36" viewBox="0 0 24 30" aria-hidden>
      <path d="M12 1c1 5 7 8 7 16a7 7 0 0 1-14 0c0-4 2-6 3-8 0 3 1 5 3 5-1-5 0-9 1-13z" fill="currentColor" />
      <path d="M12 14c.5 3 3.5 4 3.5 8a3.5 3.5 0 0 1-7 0c0-2 1-3 1.5-4 .3 1.5 1 2.2 2 2.2-.4-2.6 0-4.5 0-6.2z" fill="var(--paper)" opacity="0.85" />
    </svg>
  );
}

/** Interconnected skill tree: argument branch on top, delivery below; paths glow once unlocked. */
function SkillTree({ st, demo }: { st: LearnStatus | null; demo: boolean }) {
  const cols = 3, rows = 4;
  const X = (c: number) => 9 + (c / (cols - 1)) * 64; // percent; leaves room for the right column's labels
  const Y = (r: number) => 11 + (r / (rows - 1)) * 78;
  const edges = MODULES.flatMap((m) => TREE[m.id].needs.map((from) => ({ from, to: m.id, live: unlocked(m, st, demo) })));
  return (
    <div className="skill-tree" role="list" aria-label="Skill tree">
      <span className="tree-branch micro" style={{ top: `${Y(0) - 9}%` }}>Branch A / Argument</span>
      <span className="tree-branch micro" style={{ top: `${Y(2) - 9}%` }}>Branch B / Delivery</span>
      <svg className="tree-links" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        {edges.map(({ from, to, live }) => {
          const a = TREE[from], b = TREE[to];
          const x1 = X(a.col), y1 = Y(a.row), x2 = X(b.col), y2 = Y(b.row), mx = (x1 + x2) / 2;
          const d = `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
          return (
            <g key={`${from}-${to}`} className={live ? "live" : ""}>
              <path d={d} className="link-base" vectorEffect="non-scaling-stroke" />
              {live && <path d={d} className="link-flow" pathLength={100} vectorEffect="non-scaling-stroke" />}
            </g>
          );
        })}
      </svg>
      {MODULES.map((m, i) => {
        const t = TREE[m.id];
        const open = unlocked(m, st, demo);
        const pct = moduleProgress(m, st);
        const rust = m.skills.some((s) => isRusty(s, st));
        const boss = bossBeaten(m, st) ? "beaten" : open && bossReady(m, st, demo) ? "ready" : "";
        return (
          <button key={m.id} role="listitem" className={`tree-node ${open ? "open" : "locked"} ${pct >= 100 ? "maxed" : ""} ${rust ? "rusty" : ""}`}
            style={{ left: `${X(t.col)}%`, top: `${Y(t.row)}%`, animationDelay: `${120 + i * 50}ms` }}
            onClick={(e) => nav(m.id, null, e)} title={open ? m.improves : lockReason(m)}>
            <Ring value={pct / 100} size={64} stroke={4} tone={pct >= 100 ? "good" : open ? "signal" : "dim"}>
              {open ? <Icon name={MODULE_ICON[m.id] ?? "target"} size={22} /> : <Icon name="lock" size={18} />}
            </Ring>
            <span className="node-text">
              <b>{m.title}</b>
              <span className="micro">{open ? `${pct}% · ${m.skills.length} skills` : "Locked"}</span>
              <span className="node-marks">
                <MasterySquares mod={m} st={st} />
                {boss && <i className={`boss-diamond ${boss}`} title={boss === "beaten" ? "Boss defeated" : "Boss ready"} />}
                {rust && <i className="rust-mark" title="A skill here is rusty" />}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- module page
/** Where a skill stands: lesson read, practice passed, mastered in full runs. */
function skillState(s: Skill, st: LearnStatus | null) {
  const c = st?.checks[s.check];
  const lesson = !!st?.lessons.includes(s.id);
  const passed = !!c?.attempts.some((a) => a.passed);
  const m = mastery(s, st);
  const last = c?.recent.length ? c.recent[c.recent.length - 1] : null;
  const xpLeft = (lesson ? 0 : XP.lesson) + (passed ? 0 : XP.pass) + (m >= 3 ? 0 : XP.mastered);
  return { c, lesson, passed, m, last, xpLeft };
}

/** Three dots: lesson, practice, mastered. */
function SkillPips({ s, st }: { s: Skill; st: LearnStatus | null }) {
  const k = skillState(s, st);
  const pips: [boolean, string][] = [[k.lesson, "Lesson read"], [k.passed, "Practice passed"], [k.m >= 3, "Mastered in your talks"]];
  return (
    <span className="pips" aria-label={pips.map(([on, t]) => `${t}: ${on ? "yes" : "no"}`).join(", ")}>
      {pips.map(([on, t]) => <i key={t} className={on ? "on" : ""} title={t} />)}
    </span>
  );
}

/** What your last full talk showed for this skill. */
function LastTalk({ s, st }: { s: Skill; st: LearnStatus | null }) {
  const { last } = skillState(s, st);
  if (!last) return <span className="last-talk none">No full talk yet</span>;
  const v = last.value == null ? "not found" : s.practice.unit ? s.practice.unit(last.value) : String(last.value);
  return (
    <span className={`last-talk ${last.passed ? "ok" : "no"}`} title="From your most recent full talk">
      <Icon name={last.passed ? "check" : "cross"} size={11} /> Last talk: {v}
    </span>
  );
}

function ModulePage({ mod, st, demo }: { mod: Module; st: LearnStatus | null; demo: boolean }) {
  const open = unlocked(mod, st, demo);
  const states = mod.skills.map((s) => skillState(s, st));
  // Up next: the first skill whose practice isn't passed yet, else the first not yet mastered.
  let cur = states.findIndex((k) => !k.passed);
  if (cur < 0) cur = states.findIndex((k) => k.m < 3);
  const done = states.filter((k) => k.passed).length;
  const xpLeft = states.reduce((a, k) => a + k.xpLeft, 0);
  const [score, setScore] = useState<number | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    latestRun().then((b) => {
      const v = b?.summary?.scores?.[mod.scoreKeys[0] as keyof typeof b.summary.scores];
      if (alive) setScore(typeof v === "number" ? Math.round(v) : null);
    }).catch(() => alive && setScore(null));
    return () => { alive = false; };
  }, [mod.scoreKeys]);
  const pct = moduleProgress(mod, st);

  return (
    <div className="page learn module-page stagger">
      <ScreenHeader title={mod.title}>
        <button className="btn ghost" onClick={() => nav(null)}><Icon name="arrowL" size={14} /> All modules</button>
      </ScreenHeader>
      {!open && (
        <div className="lock-banner"><Icon name="lock" size={14} /> {lockReason(mod)}. You can read the lessons now; practices open once it's unlocked.</div>
      )}
      <div className="module-head mod-hero">
        <ModuleIcon mod={mod} size={64} />
        <div className="mod-hero-copy">
          <p>{mod.blurb}</p>
          <div className="mod-stats">
            <span><b>{done}</b> of {mod.skills.length} skills passed</span>
            {xpLeft > 0 ? <span><b>+{xpLeft}</b> XP to earn</span> : <span><b>All</b> XP earned</span>}
            {score != null && <span>Your {mod.title} score <b>{score}</b>{score < 70 ? <> · aim for 70+</> : <> · strong</>}</span>}
          </div>
        </div>
        <div className="learn-total">
          <Ring value={pct / 100} size={84} stroke={6}>
            <b className="ring-value small">{pct}<small>%</small></b>
          </Ring>
          <span className="micro">mastery</span>
        </div>
      </div>

      <ol className="skill-path scroll">
        {mod.skills.map((s, i) => {
          const k = states[i];
          const isCur = i === cur;
          const steps = s.lesson.example ? 4 : 3;
          const node = k.m >= 3 ? "mastered" : k.passed ? "passed" : isCur ? "current" : "todo";
          const go = (e: React.MouseEvent) => nav(mod.id, s.id, e);
          return (
            <li key={s.id} className={`path-step ${node} ${i > 0 && states[i - 1].passed ? "prev-done" : ""}`} style={{ animationDelay: `${80 + i * 70}ms` }}>
              <span className="path-node" aria-hidden>
                {k.passed ? <Icon name="check" size={14} /> : String(i + 1)}
              </span>
              {isCur ? (
                <section className="up-next" onClick={go} role="button" tabIndex={0}
                  onKeyDown={(e) => { if (e.key === "Enter") nav(mod.id, s.id); }}>
                  <div className="up-next-top">
                    <span className="up-next-kicker">Up next · Skill {String(i + 1).padStart(2, "0")}</span>
                    <SkillPips s={s} st={st} />
                  </div>
                  <b className="up-next-title">{s.title}</b>
                  {s.lesson.example && <p className="up-next-quote">“{s.lesson.example.strong}”</p>}
                  <div className="up-next-foot">
                    <LastTalk s={s} st={st} />
                    <span className="up-next-meta">{steps} steps · ~2 min, then a {s.practice.seconds} s talk</span>
                    <span className="spacer" />
                    <button className="btn primary" onClick={(e) => { e.stopPropagation(); nav(mod.id, s.id, e); }}>
                      {!k.lesson ? <><Icon name="book" size={14} /> Start lesson</> : open ? <><Icon name="mic" size={14} /> Practice</> : <><Icon name="book" size={14} /> Review lesson</>}
                      <Icon name="arrowR" size={14} className="arw" />
                    </button>
                  </div>
                </section>
              ) : (
                <button className="path-row" onClick={go}>
                  <span className="path-row-main">
                    <b>{s.title}</b>
                    <span className="path-row-sub">{s.practice.target}</span>
                  </span>
                  {isRusty(s, st) && <span className="rust-tag"><span className="rust-mark" aria-hidden /> Rusty</span>}
                  <LastTalk s={s} st={st} />
                  <SkillPips s={s} st={st} />
                  <span className="path-go">{k.passed ? "Review" : "Start"} <Icon name="arrowR" size={12} /></span>
                </button>
              )}
            </li>
          );
        })}
        <li className="path-step boss-step"><span className="path-node boss-node" aria-hidden><i className="boss-diamond" /></span>
          <BossCard m={mod} st={st} ready={open && bossReady(mod, st, demo)} demo={demo} /></li>
      </ol>
    </div>
  );
}

// ---------------------------------------------------------------- skill page
function SkillPage({ mod, skill, st, setSt, demo }: { mod: Module; skill: Skill; st: LearnStatus | null; setSt: (s: LearnStatus) => void; demo: boolean }) {
  const { set, go } = useApp();
  const open = unlocked(mod, st, demo);
  const m = mastery(skill, st);
  const c = st?.checks[skill.check];
  const lessonDone = !!st?.lessons.includes(skill.id);
  const P = skill.practice;
  const idx = mod.skills.findIndex((s) => s.id === skill.id);
  const next = mod.skills[idx + 1];
  const fmt = (v: number | null) => (v == null ? "–" : P.unit ? P.unit(v) : String(v));

  const markRead = async (done: boolean) => {
    if (demo) { // demo progress lives in memory only
      if (st) setSt({ ...st, lessons: done ? [...st.lessons, skill.id] : st.lessons.filter((x) => x !== skill.id) });
      return;
    }
    const r = await engine.request<{ lessons: string[] }>("learn.lesson", { lessonId: skill.id, done });
    if (st) setSt({ ...st, lessons: r.lessons, activity: done ? [...(st.activity ?? []), new Date().toISOString()] : st.activity });
  };
  const practice = () => {
    set({ drill: { skill: skill.id, check: skill.check, prompt: P.prompt, seconds: P.seconds } });
    if (!lessonDone) void markRead(true);
    go("setup");
  };

  return (
    <div className="page learn stagger">
      <ScreenHeader title={skill.title}>
        <button className="btn ghost" onClick={() => nav(mod.id)}><Icon name="arrowL" size={14} /> {mod.title}</button>
      </ScreenHeader>
      <div className="skill-page-head">
        <ModuleIcon mod={mod} size={52} />
        <Stepper index={idx} total={mod.skills.length} label="SKILL"
          onPrev={() => idx > 0 && nav(mod.id, mod.skills[idx - 1].id)}
          onNext={() => next && nav(mod.id, next.id)} />
        <span className="spacer" />
        <MasteryChip m={m} />
      </div>

      {isRusty(skill, st) && (
        <div className="rust-banner">
          <span className="rust-mark" aria-hidden />
          <span><b>Rusty.</b> You mastered this, then it slipped in your recent full talks. Pass one review practice to polish it (+{XP.review} XP).</span>
          <button className="btn small primary" onClick={() => startPractice(skillById(skill.id)!)}>Review now</button>
        </div>
      )}
      <div className="skill-layout">
        <LessonFlow key={skill.id} skill={skill} check={c} done={lessonDone} canPractice={open}
          onComplete={() => void markRead(true)} onPractice={practice}
          onNextSkill={next ? () => nav(mod.id, next.id) : undefined} />

        <aside className="grid" style={{ alignContent: "start" }}>
          <section className={`card practice-card ${lessonDone ? "" : "waiting"}`}>
            <div className="practice-top">
              <h3>Practice</h3>
              <span className="practice-time"><Icon name="mic" size={12} /> {P.seconds} s talk</span>
            </div>
            <p className="practice-q">{P.prompt}</p>
            <p className="practice-goal"><Icon name="target" size={14} /> {P.target}</p>
            {open ? (
              <button className="btn primary big" onClick={practice}>Start practice <Icon name="arrowR" size={14} className="arw" /></button>
            ) : (
              <div className="lock-banner"><Icon name="lock" size={14} /> {lockReason(mod)}</div>
            )}
            {skill.check === "claim_up_front" && <ClaimTester prompt={P.prompt} />}
            {GAMES.filter((g) => g.skills.includes(skill.id)).map((g) => (
              <button key={g.id} className="warmup" onClick={(e) => nav(null, null, e, g.id)}>
                <Icon name={g.icon} size={14} /> <span>Warm up first: <b>{g.title}</b></span> <span className="micro">{g.minutes}</span>
              </button>
            ))}
            {c && c.attempts.length > 0 && (
              <div className="practice-tries">
                <span className="micro">Your tries</span>
                {c.attempts.slice(-6).map((a) => (
                  <button key={a.sessionId} className={`try ${a.passed ? "ok" : "no"}`} onClick={() => void openSession(a.sessionId)}
                    title={`${a.passed ? "Passed" : "Not yet"}: ${fmt(a.value)}${a.at ? ` · ${new Date(a.at).toLocaleDateString()}` : ""}`}>
                    <Icon name={a.passed ? "check" : "cross"} size={11} />
                  </button>
                ))}
              </div>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- claim tester
/** "Test your claim first": instant on-device feedback on a drafted claim before recording. */
function ClaimTester({ prompt }: { prompt: string }) {
  const [text, setText] = useState("");
  const { checks, verdict } = useMemo(() => testClaim(text, prompt), [text, prompt]);
  return (
    <details className="claim-tester">
      <summary><Icon name="idea" size={14} /> Draft your opening line first</summary>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={400}
        placeholder="Type the one sentence you'll open with…" aria-label="Your drafted claim" />
      {text.trim() && (
        <div className="claim-result" aria-live="polite">
          <span className={`claim-verdict ${verdict.tone}`}>{verdict.label}</span>
          <ul>
            {checks.map((c) => (
              <li key={c.label} className={c.tone}>
                <Icon name={c.tone === "good" ? "check" : c.tone === "bad" ? "cross" : "warn"} size={12} />
                <b>{c.label}</b> <span className="muted">{c.detail}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </details>
  );
}

/** Results-screen banner for a Learn practice: passed or not, with the way back. */
export function DrillResult({ drill }: { drill: { id: string; value: number | null; passed: boolean } }) {
  const { set, go } = useApp();
  const skill = MODULES.flatMap((m) => m.skills.map((s) => ({ ...s, module: m }))).find((s) => s.check === drill.id);
  if (!skill) return null;
  const P = skill.practice;
  const again = () => {
    set({ drill: { skill: skill.id, check: skill.check, prompt: P.prompt, seconds: P.seconds } });
    go("setup");
  };
  const back = () => {
    go("learn");
    set({ learnPath: { module: skill.module.id, skill: skill.id } });
  };
  return (
    <section className={`card drill-result ${drill.passed ? "passed" : ""}`}>
      <span className="drill-mark"><Icon name={drill.passed ? "check" : "retry"} size={22} /></span>
      <div>
        <span className="micro">Practice / {skill.module.title}</span>
        <b className="drill-title">{skill.title}: {drill.passed ? "passed!" : "not yet"}</b>
        <span className="small">
          You: {drill.value == null ? "–" : P.unit ? P.unit(drill.value) : drill.value} · Target: {P.target}
        </span>
      </div>
      <span className="spacer" />
      <button className="btn ghost" onClick={again}><Icon name="retry" size={14} /> Try again</button>
      <button className="btn primary" onClick={back}>Back to skill</button>
    </section>
  );
}

// ---------------------------------------------------------------- unlock toast
/** Tells you once when something new lands in the Locker. */
function useUnlockToast(st: LearnStatus | null, demo: boolean, setSt: (s: LearnStatus) => void) {
  useEffect(() => {
    if (!st || demo || !st.seenUnlocks) return;
    const xp = xpOf(st);
    const fresh = UNLOCKABLES.filter((u) => u.how !== "Default" && isUnlocked(u, st, xp) && !st.seenUnlocks!.includes(u.id));
    if (!fresh.length) return;
    useApp.getState().set({ toast: `Unlocked in the Locker: ${fresh.map((u) => u.name).join(", ")}` });
    const ids = [...st.seenUnlocks, ...fresh.map((u) => u.id)];
    setSt({ ...st, seenUnlocks: ids });
    void engine.request("learn.seen", { ids: fresh.map((u) => u.id) }).catch(() => {});
  }, [st, demo]); // eslint-disable-line react-hooks/exhaustive-deps
}
