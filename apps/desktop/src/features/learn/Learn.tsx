// Learn: modules -> skills -> lesson + practice, like a course. Modules are the things the analysis
// scores, so practicing a skill here moves the same number on your results.
import { useEffect, useMemo, useRef, useState } from "react";
import { wheelWarp } from "../../lib/nav";
import { openSession } from "../../App";
import { engine } from "../../lib/engine";
import type { SessionRow } from "../../lib/types";
import { useApp } from "../../stores/app";
import {
  MASTERY, MODULES, type LearnStatus, type Mastery, type Module, type Skill, mastery, moduleProgress, skillById,
} from "./curriculum";
import { Icon, MODULE_ICON } from "../../ui/icons";
import { ScreenHeader, SegMeter, Stepper, StatTile } from "../../ui/kit";

function useLearnStatus(): [LearnStatus | null, (s: LearnStatus) => void] {
  const [st, setSt] = useState<LearnStatus | null>(null);
  useEffect(() => {
    engine.request<LearnStatus>("learn.status", {}).then(setSt).catch(() => setSt({ lessons: [], checks: {} }));
  }, []);
  return [st, setSt];
}

export default function Learn() {
  const path = useApp((s) => s.learnPath);
  const [st, setSt] = useLearnStatus();
  const skill = path.skill ? skillById(path.skill) : null;
  const mod = MODULES.find((m) => m.id === (skill?.module.id ?? path.module)) ?? null;
  if (skill && mod) return <SkillPage mod={mod} skill={skill} st={st} setSt={setSt} />;
  if (mod) return <ModulePage mod={mod} st={st} />;
  return <Course st={st} />;
}

const nav = (module: string | null, skill: string | null = null) => {
  useApp.getState().set({ learnPath: { module, skill } });
  window.scrollTo(0, 0);
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


// ---------------------------------------------------------------- course overview
function Course({ st }: { st: LearnStatus | null }) {
  // scrolling up past the top of the module list warps back to Home
  const gridRef = useRef<HTMLDivElement>(null);
  const onWheel = useMemo(() => wheelWarp("home", -1, () => (gridRef.current?.scrollTop ?? 0) <= 0), []);
  const [last, setLast] = useState<SessionRow | null>(null);
  useEffect(() => {
    engine.request<SessionRow[]>("sessions.list", { limit: 20 })
      .then((rows) => setLast(rows.find((r) => r.overall != null && !r.title.startsWith("Practice:")) ?? null))
      .catch(() => {});
  }, []);
  // Recommend the module behind the weakest score of your latest full run.
  const scores = (last?.scores ?? {}) as Record<string, number | null>;
  const rec = [...MODULES]
    .filter((m) => m.scoreKeys.some((k) => scores[k] != null))
    .sort((a, b) => Math.min(...a.scoreKeys.map((k) => scores[k] ?? 101)) - Math.min(...b.scoreKeys.map((k) => scores[k] ?? 101)))[0];
  const total = Math.round(MODULES.reduce((a, m) => a + moduleProgress(m, st), 0) / MODULES.length);

  return (
    <div className="page learn stagger" onWheel={onWheel}>
      <ScreenHeader title="Learn" />
      <div className="tiles">
        <StatTile value={`${total}%`} label="Course mastery" tone="signal" sub={<SegMeter value={total / 100} />} />
        <StatTile value={MODULES.length} label="Modules" />
        <StatTile value={st?.lessons.length ?? 0} label="Lessons read" tone="paper" />
        <StatTile value={Object.values(st?.checks ?? {}).filter((c) => c.attempts.some((a) => a.passed)).length} label="Practices passed" tone="concrete" />
      </div>

      {rec && (
        <button className="learn-rec" onClick={() => nav(rec.id)}>
          <ModuleIcon mod={rec} />
          <span>
            <span className="learn-rec-kicker">Recommended from your last run</span>
            <b>{rec.title}</b>
            <span className="muted small">{rec.improves}</span>
          </span>
          <span className="spacer" />
          <span className="hero-cta-title" style={{ padding: 0, fontSize: 22 }}>Start <Icon name="arrowR" size={22} /></span>
        </button>
      )}

      <div className="module-grid scroll" ref={gridRef}>
        {MODULES.map((m) => {
          const pct = moduleProgress(m, st);
          return (
            <button key={m.id} className="module-card" onClick={() => nav(m.id)}>
              <div className="row" style={{ gap: 12 }}>
                <ModuleIcon mod={m} />
                <span>
                  <b className="module-title">{m.title}</b>
                  <span className="micro">{String(m.skills.length).padStart(2, "0")} skills</span>
                </span>
              </div>
              <p className="muted small module-blurb">{m.blurb}</p>
              <span className="module-improves small">Improves: {m.improves}</span>
              <div className="module-foot">
                <MasterySquares mod={m} st={st} />
                <span className="micro">{String(pct).padStart(3, "0")}%</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- module page
function ModulePage({ mod, st }: { mod: Module; st: LearnStatus | null }) {
  return (
    <div className="page learn stagger">
      <ScreenHeader title={mod.title}>
        <button className="btn ghost" onClick={() => nav(null)}><Icon name="arrowL" size={14} /> All modules</button>
      </ScreenHeader>
      <div className="module-head">
        <ModuleIcon mod={mod} size={64} />
        <div>
          <p className="muted">{mod.blurb}</p>
          <span className="module-improves small">Improves: {mod.improves}</span>
        </div>
        <div className="learn-total">
          <b>{moduleProgress(mod, st)}%</b>
          <span className="micro">module mastery</span>
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
              <button className="skill-item" onClick={() => nav(mod.id, s.id)}>
                <span className={`item-dot ${lessonDone ? "done" : ""}`}><Icon name={lessonDone ? "check" : "book"} size={14} /></span>
                <span>Lesson: {s.title}</span>
                <span className="spacer" />
                <span className="muted small">{lessonDone ? "Read" : "2 min read"}</span>
              </button>
              <button className="skill-item" onClick={() => nav(mod.id, s.id)}>
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
function SkillPage({ mod, skill, st, setSt }: { mod: Module; skill: Skill; st: LearnStatus | null; setSt: (s: LearnStatus) => void }) {
  const { set, go, settings } = useApp();
  const m = mastery(skill, st);
  const c = st?.checks[skill.check];
  const lessonDone = !!st?.lessons.includes(skill.id);
  const L = skill.lesson, P = skill.practice;
  const recentPass = (c?.recent ?? []).filter((r) => r.passed).length;
  const idx = mod.skills.findIndex((s) => s.id === skill.id);
  const next = mod.skills[idx + 1];
  const fmt = (v: number | null) => (v == null ? "–" : P.unit ? P.unit(v) : String(v));

  const markRead = async (done: boolean) => {
    const r = await engine.request<{ lessons: string[] }>("learn.lesson", { lessonId: skill.id, done });
    if (st) setSt({ ...st, lessons: r.lessons });
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
              <div className="ex weak"><span className="tag bad">Weak</span><p>“{L.example.weak}”</p></div>
              <div className="ex strong"><span className="tag good">Strong</span><p>“{L.example.strong}”</p></div>
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
            <button className="btn primary big" onClick={practice}><Icon name="mic" size={14} /> Start practice <Icon name="arrowR" size={14} className="arw" /></button>
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
