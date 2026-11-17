// Learn: modules -> skills -> lesson + practice, like a course. Modules are the things the analysis
// scores, so practicing a skill here moves the same number on your results.
import { useEffect, useMemo, useRef, useState } from "react";
import { openSession } from "../../App";
import { engine } from "../../lib/engine";
import type { SessionRow } from "../../lib/types";
import { useApp } from "../../stores/app";
import {
  MASTERY, MODULES, type LearnStatus, type Mastery, type Module, type Skill, mastery, moduleProgress, skillById,
} from "./curriculum";
import { TREE, XP, demoStatus, level, lockReason, streak, testClaim, unlocked, xpOf } from "./game";
import { Icon, MODULE_ICON } from "../../ui/icons";
import { ScreenHeader, Stepper } from "../../ui/kit";

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
  const key = `${path.module ?? ""}/${path.skill ?? ""}`;
  return (
    <div key={key} className={`learn-view zoom-${dir}`} style={{ transformOrigin: origin }}>
      {skill && mod ? <SkillPage mod={mod} skill={skill} st={st} setSt={setSt} demo={demo} />
        : mod ? <ModulePage mod={mod} st={st} demo={demo} />
        : <Course st={st} demo={demo} />}
    </div>
  );
}

const nav = (module: string | null, skill: string | null = null, e?: { clientX: number; clientY: number }) => {
  origin = e ? `${Math.round((e.clientX / innerWidth) * 100)}% ${Math.round((e.clientY / innerHeight) * 100)}%` : "50% 30%";
  useApp.getState().set({ learnPath: { module, skill } });
};

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
function Course({ st, demo }: { st: LearnStatus | null; demo: boolean }) {
  const [last, setLast] = useState<SessionRow | null>(null);
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

  return (
    <div className="page learn stagger">
      <ScreenHeader title="Learn" meta={demo ? ["Judge demo mode: sample progress"] : undefined}>
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
        <div className={`hud-streak ${sk.days ? "lit" : ""}`} title={sk.today ? "You practiced today" : sk.days ? "Practice today to keep your streak" : "Practice today to start a streak"}>
          <Flame lit={sk.days > 0} />
          <b>{sk.days}</b>
          <span className="micro">day streak</span>
          <span className="streak-week">
            {sk.week.map((on, i) => <i key={i} className={on ? "on" : ""} />)}
          </span>
        </div>
      </section>

      <div className="skill-tree-wrap scroll">
        <SkillTree st={st} demo={demo} />
      </div>
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
        return (
          <button key={m.id} role="listitem" className={`tree-node ${open ? "open" : "locked"} ${pct >= 100 ? "maxed" : ""}`}
            style={{ left: `${X(t.col)}%`, top: `${Y(t.row)}%`, animationDelay: `${120 + i * 50}ms` }}
            onClick={(e) => nav(m.id, null, e)} title={open ? m.improves : lockReason(m)}>
            <Ring value={pct / 100} size={64} stroke={4} tone={pct >= 100 ? "good" : open ? "signal" : "dim"}>
              {open ? <Icon name={MODULE_ICON[m.id] ?? "target"} size={22} /> : <Icon name="lock" size={18} />}
            </Ring>
            <span className="node-text">
              <b>{m.title}</b>
              <span className="micro">{open ? `${pct}% · ${m.skills.length} skills` : "Locked"}</span>
              <MasterySquares mod={m} st={st} />
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- module page
function ModulePage({ mod, st, demo }: { mod: Module; st: LearnStatus | null; demo: boolean }) {
  const open = unlocked(mod, st, demo);
  return (
    <div className="page learn stagger">
      <ScreenHeader title={mod.title}>
        <button className="btn ghost" onClick={() => nav(null)}><Icon name="arrowL" size={14} /> All modules</button>
      </ScreenHeader>
      {!open && (
        <div className="lock-banner"><Icon name="lock" size={14} /> {lockReason(mod)}. You can read the lessons now; practices open once it's unlocked.</div>
      )}
      <div className="module-head">
        <ModuleIcon mod={mod} size={64} />
        <div>
          <p className="muted">{mod.blurb}</p>
          <span className="module-improves small">Improves: {mod.improves}</span>
        </div>
        <div className="learn-total">
          <Ring value={moduleProgress(mod, st) / 100} size={84} stroke={6}>
            <b className="ring-value small">{moduleProgress(mod, st)}<small>%</small></b>
          </Ring>
          <MasterySquares mod={mod} st={st} />
        </div>
      </div>

      <div className="skill-list scroll">
        {mod.skills.map((s, i) => {
          const m = mastery(s, st);
          const c = st?.checks[s.check];
          const lessonDone = !!st?.lessons.includes(s.id);
          const passed = !!c?.attempts.some((a) => a.passed);
          return (
            <section key={s.id} className="card skill-card">
              <div className="skill-head">
                <span className="skill-num">{String(i + 1).padStart(2, "0")}</span>
                <b className="skill-title">{s.title}</b>
                <MasteryChip m={m} />
              </div>
              <button className="skill-item" onClick={(e) => nav(mod.id, s.id, e)}>
                <span className={`item-dot ${lessonDone ? "done" : ""}`}><Icon name={lessonDone ? "check" : "book"} size={14} /></span>
                <span>Lesson: {s.title}</span>
                <span className="spacer" />
                <span className="muted small">{lessonDone ? "Read" : "2 min read"}</span>
              </button>
              <button className="skill-item" onClick={(e) => nav(mod.id, s.id, e)}>
                <span className={`item-dot ${passed ? "done" : ""}`}><Icon name={passed ? "check" : "mic"} size={14} /></span>
                <span>Practice: {s.practice.target}</span>
                <span className="spacer" />
                <span className="muted small">{passed ? "Passed" : c?.attempts.length ? `${c.attempts.length} tr${c.attempts.length === 1 ? "y" : "ies"}` : `${s.practice.seconds} s`}</span>
              </button>
            </section>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- skill page
function SkillPage({ mod, skill, st, setSt, demo }: { mod: Module; skill: Skill; st: LearnStatus | null; setSt: (s: LearnStatus) => void; demo: boolean }) {
  const { set, go, settings } = useApp();
  const open = unlocked(mod, st, demo);
  const m = mastery(skill, st);
  const c = st?.checks[skill.check];
  const lessonDone = !!st?.lessons.includes(skill.id);
  const L = skill.lesson, P = skill.practice;
  const recentPass = (c?.recent ?? []).filter((r) => r.passed).length;
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

      <div className="skill-layout">
        <article className="card lesson">
          <h3>Lesson</h3>
          <p className="lesson-intro">{L.intro}</p>
          {L.points.map((p) => (
            <div key={p.title} className="lesson-point">
              <b>{p.title}</b>
              <p>{p.body}</p>
            </div>
          ))}
          {L.example && (
            <div className="lesson-example">
              <div className="ex weak">
                <div className="ex-head"><span className="tag bad">Weak</span><ListenButton text={L.example.weak} style="weak" /></div>
                <p>“{L.example.weak}”</p>
              </div>
              <div className="ex strong">
                <div className="ex-head"><span className="tag good">Strong</span><ListenButton text={L.example.strong} style="strong" /></div>
                <p>“{L.example.strong}”</p>
              </div>
              <p className="muted small">{L.example.why}</p>
            </div>
          )}
          <p className="lesson-remember"><Icon name="idea" size={16} /> {L.remember}</p>
          <div className="row">
            {lessonDone ? (
              <button className="btn ghost" onClick={() => void markRead(false)}><Icon name="check" size={14} /> Lesson complete (undo)</button>
            ) : (
              <button className="btn" onClick={() => void markRead(true)}>Mark lesson complete</button>
            )}
          </div>
        </article>

        <aside className="grid" style={{ alignContent: "start" }}>
          <section className="card practice-card">
            <h3>Practice</h3>
            <p>{P.instruction}</p>
            <div className="practice-prompt">
              <span className="micro">Your prompt / {P.seconds} s</span>
              <b>{P.prompt}</b>
            </div>
            <p className="small"><span className="muted">To pass:</span> {P.target}</p>
            <ClaimTester prompt={P.prompt} />
            {open ? (
              <button className="btn primary big" onClick={practice}><Icon name="mic" size={14} /> Start practice <Icon name="arrowR" size={14} className="arw" /></button>
            ) : (
              <div className="lock-banner"><Icon name="lock" size={14} /> {lockReason(mod)}</div>
            )}
            {settings.difficulty === "judge" && <p className="muted small">Runs in Assessment mode, like your setting.</p>}
          </section>

          <section className="card">
            <h3>Your progress</h3>
            <ol className="mastery-steps">
              <li className={m >= 1 ? "done" : ""}><b>Familiar</b> <span className="muted small">read the lesson or try a practice</span></li>
              <li className={m >= 2 ? "done" : ""}><b>Proficient</b> <span className="muted small">pass the practice</span></li>
              <li className={m >= 3 ? "done" : ""}>
                <b>Mastered</b> <span className="muted small">also pass it in 2 of your last 3 full runs (now {recentPass} of {c?.recent.length ?? 0})</span>
              </li>
            </ol>
            {c && c.attempts.length > 0 && (
              <>
                <h4 className="muted small" style={{ margin: "12px 0 6px" }}>Practice attempts</h4>
                <ul className="attempts">
                  {[...c.attempts].reverse().map((a) => (
                    <li key={a.sessionId}>
                      <button className="link-btn" onClick={() => void openSession(a.sessionId)}>
                        <span className={`tag ${a.passed ? "good" : "bad"}`}>{a.passed ? <><Icon name="check" size={10} /> Passed</> : "Not yet"}</span>
                        <span>{fmt(a.value)}</span>
                        <span className="muted small">{a.at ? new Date(a.at).toLocaleDateString() : ""}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- listen (local TTS)
const voices = new Map<string, Promise<string>>();
function exampleVoice(text: string, style: "weak" | "strong"): Promise<string> {
  const k = `${style}|${text}`;
  if (!voices.has(k)) {
    const p = engine.request<ArrayBuffer>("tts.speak", { text, style }, 60000)
      .then((buf) => URL.createObjectURL(new Blob([buf], { type: "audio/wav" })));
    p.catch(() => voices.delete(k));
    voices.set(k, p);
  }
  return voices.get(k)!;
}
let playing: HTMLAudioElement | null = null;

/** Reads an example aloud with the on-device voice: slow and flat for Weak, brisk and lively for Strong. */
function ListenButton({ text, style }: { text: string; style: "weak" | "strong" }) {
  const [state, setState] = useState<"idle" | "loading" | "playing">("idle");
  const audio = useRef<HTMLAudioElement | null>(null);
  useEffect(() => () => audio.current?.pause(), []);
  const toggle = async () => {
    if (state === "playing") {
      audio.current?.pause();
      setState("idle");
      return;
    }
    setState("loading");
    try {
      const url = await exampleVoice(text, style);
      playing?.pause(); // one example at a time
      const a = new Audio(url);
      audio.current = playing = a;
      a.onended = a.onpause = () => setState("idle");
      await a.play();
      setState("playing");
    } catch {
      setState("idle");
      useApp.getState().set({ toast: "The on-device voice isn't available (run make setup to fetch it)." });
    }
  };
  return (
    <button className={`listen-btn ${state}`} onClick={() => void toggle()} aria-pressed={state === "playing"}
      title={style === "weak" ? "Hear it said weakly" : "Hear it said with conviction"}>
      <Icon name={state === "playing" ? "stop" : "speaker"} size={12} />
      {state === "loading" ? "Synthesizing…" : state === "playing" ? "Stop" : "Listen"}
      <span className="wave" aria-hidden>{Array.from({ length: 5 }, (_, i) => <i key={i} style={{ animationDelay: `${i * 90}ms` }} />)}</span>
    </button>
  );
}

// ---------------------------------------------------------------- claim tester
/** "Test your claim first": instant on-device feedback on a drafted claim before recording. */
function ClaimTester({ prompt }: { prompt: string }) {
  const [text, setText] = useState("");
  const { checks, verdict } = useMemo(() => testClaim(text, prompt), [text, prompt]);
  return (
    <details className="claim-tester">
      <summary><Icon name="target" size={14} /> Test your claim first <span className="micro">optional</span></summary>
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
