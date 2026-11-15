// Learn: modules -> skills -> lesson + practice, like a course. Modules are the things the analysis
// scores, so practicing a skill here moves the same number on your results.
import { useEffect, useState } from "react";
import { openSession } from "../../App";
import { engine } from "../../lib/engine";
import type { SessionRow } from "../../lib/types";
import { useApp } from "../../stores/app";
import {
  MASTERY, MODULES, type LearnStatus, type Mastery, type Module, type Skill, mastery, moduleProgress, skillById,
} from "./curriculum";

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
    <span className="module-icon" style={{ width: size, height: size, background: `${mod.color}22`, color: mod.color, fontSize: size * 0.45 }}>
      {mod.glyph}
    </span>
  );
}

// ---------------------------------------------------------------- course overview
function Course({ st }: { st: LearnStatus | null }) {
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
    <div className="page learn">
      <div className="learn-hero">
        <div>
          <h1>Learn</h1>
          <p className="muted">
            Short lessons and practices for each thing Podium scores. Practice a skill here and it shows up in your results.
          </p>
        </div>
        <div className="learn-total">
          <b>{total}%</b>
          <span className="muted small">course mastery</span>
          <div className="ach-bar"><span style={{ width: `${total}%` }} /></div>
        </div>
      </div>

      <div className="mastery-legend muted small">
        {MASTERY.map((m, i) => (
          <span key={m.name}><span className={`msq m${i}`} /> {m.name}</span>
        ))}
      </div>

      {rec && (
        <button className="learn-rec" onClick={() => nav(rec.id)}>
          <ModuleIcon mod={rec} />
          <span>
            <span className="small learn-rec-kicker">Recommended from your last run</span>
            <b>{rec.title}</b>
            <span className="muted small">{rec.improves}</span>
          </span>
          <span className="spacer" />
          <span className="btn primary">Start</span>
        </button>
      )}

      <div className="module-grid">
        {MODULES.map((m) => {
          const pct = moduleProgress(m, st);
          return (
            <button key={m.id} className="module-card" onClick={() => nav(m.id)}>
              <div className="row" style={{ gap: 12 }}>
                <ModuleIcon mod={m} />
                <span>
                  <b className="module-title">{m.title}</b>
                  <span className="muted small">{m.skills.length} skills</span>
                </span>
              </div>
              <p className="muted small module-blurb">{m.blurb}</p>
              <span className="module-improves small">Improves: {m.improves}</span>
              <div className="module-foot">
                <MasterySquares mod={m} st={st} />
                <span className="small muted">{pct}%</span>
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
    <div className="page learn">
      <button className="link-btn" onClick={() => nav(null)}>← All modules</button>
      <div className="module-head">
        <ModuleIcon mod={mod} size={64} />
        <div>
          <h1>{mod.title}</h1>
          <p className="muted">{mod.blurb}</p>
          <span className="module-improves small">Improves: {mod.improves}</span>
        </div>
        <div className="learn-total">
          <b>{moduleProgress(mod, st)}%</b>
          <span className="muted small">module mastery</span>
          <MasterySquares mod={mod} st={st} />
        </div>
      </div>

      <div className="skill-list">
        {mod.skills.map((s, i) => {
          const m = mastery(s, st);
          const c = st?.checks[s.check];
          const lessonDone = !!st?.lessons.includes(s.id);
          const passed = !!c?.attempts.some((a) => a.passed);
          return (
            <section key={s.id} className="card skill-card">
              <div className="skill-head">
                <span className="skill-num">{i + 1}</span>
                <b className="skill-title">{s.title}</b>
                <MasteryChip m={m} />
              </div>
              <button className="skill-item" onClick={() => nav(mod.id, s.id)}>
                <span className={`item-dot ${lessonDone ? "done" : ""}`}>{lessonDone ? "✓" : "📖"}</span>
                <span>Lesson: {s.title}</span>
                <span className="spacer" />
                <span className="muted small">{lessonDone ? "Read" : "2 min read"}</span>
              </button>
              <button className="skill-item" onClick={() => nav(mod.id, s.id)}>
                <span className={`item-dot ${passed ? "done" : ""}`}>{passed ? "✓" : "🎤"}</span>
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
    <div className="page learn">
      <button className="link-btn" onClick={() => nav(mod.id)}>← {mod.title}</button>
      <div className="skill-page-head">
        <ModuleIcon mod={mod} size={52} />
        <div>
          <span className="muted small">{mod.title} · Skill {idx + 1} of {mod.skills.length}</span>
          <h1>{skill.title}</h1>
        </div>
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
          <p className="lesson-remember">💡 {L.remember}</p>
          <div className="row">
            {lessonDone ? (
              <button className="btn ghost" onClick={() => void markRead(false)}>✓ Lesson complete (undo)</button>
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
              <span className="muted small">Your prompt · {P.seconds} s</span>
              <b>{P.prompt}</b>
            </div>
            <p className="small"><span className="muted">To pass:</span> {P.target}</p>
            <button className="btn primary big" onClick={practice}>🎤 Start practice</button>
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
                        <span className={`tag ${a.passed ? "good" : "bad"}`}>{a.passed ? "✓ Passed" : "Not yet"}</span>
                        <span>{fmt(a.value)}</span>
                        <span className="muted small">{a.at ? new Date(a.at).toLocaleDateString() : ""}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          {next && (
            <button className="card learn-next" onClick={() => nav(mod.id, next.id)}>
              <span className="muted small">Next skill</span>
              <b>{next.title} →</b>
            </button>
          )}
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
      <span className="drill-mark">{drill.passed ? "✓" : "↻"}</span>
      <div>
        <span className="muted small">Practice · {skill.module.title}</span>
        <b className="drill-title">{skill.title}: {drill.passed ? "passed!" : "not yet"}</b>
        <span className="small">
          You: {drill.value == null ? "–" : P.unit ? P.unit(drill.value) : drill.value} · Target: {P.target}
        </span>
      </div>
      <span className="spacer" />
      <button className="btn ghost" onClick={again}>Try again</button>
      <button className="btn primary" onClick={back}>Back to skill</button>
    </section>
  );
}
