// A lesson as four short steps instead of one wall of text:
//   1. Hear it      pick which of two versions lands, then see why (examples before rules)
//   2. The rule     the idea in one sentence, plus the few moves that make it work
//   3. Your speech  guess whether your last full run did it, then see your own words and the analysis' verdict
//   4. Ready        recap, lesson marked complete, straight into the practice
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { engine } from "../../lib/engine";
import type { SessionBundle, SessionRow } from "../../lib/types";
import { useApp } from "../../stores/app";
import type { CheckStatus, Skill } from "./curriculum";
import { XP } from "./game";
import { Icon } from "../../ui/icons";

type StepId = "hear" | "rule" | "mine" | "ready";
const STEP_LABEL: Record<StepId, string> = { hear: "Hear it", rule: "The rule", mine: "Your speech", ready: "Ready" };

export function LessonFlow({ skill, check, done, canPractice, onComplete, onPractice, onNextSkill }: {
  skill: Skill;
  check: CheckStatus | undefined;
  done: boolean;
  canPractice: boolean;
  onComplete: () => void;
  onPractice: () => void;
  onNextSkill?: () => void;
}) {
  const L = skill.lesson;
  const steps: StepId[] = L.example ? ["hear", "rule", "mine", "ready"] : ["rule", "mine", "ready"];
  const [i, setI] = useState(0);
  const [seen, setSeen] = useState(0); // furthest step reached, so the step bar can jump back and forth
  const [justEarned, setJustEarned] = useState(false);
  const step = steps[i];
  const bodyRef = useRef<HTMLDivElement>(null);

  const goTo = (n: number) => {
    const k = Math.max(0, Math.min(steps.length - 1, n));
    setI(k);
    setSeen((s) => Math.max(s, k));
    bodyRef.current?.scrollTo({ top: 0 });
  };
  // Reaching the last step completes the lesson (once).
  useEffect(() => {
    if (step === "ready" && !done) {
      onComplete();
      setJustEarned(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);
  // Arrow keys step through, unless you're typing.
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable]")) return;
      if (e.key === "ArrowRight" && i < steps.length - 1) goTo(i + 1);
      if (e.key === "ArrowLeft" && i > 0) goTo(i - 1);
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  });

  const [ready, setReady] = useState<Record<StepId, boolean>>({ hear: false, rule: true, mine: false, ready: true });
  const unlock = (s: StepId) => setReady((r) => (r[s] ? r : { ...r, [s]: true }));
  const canNext = ready[step] || done;

  return (
    <article className="card lesson lf">
      <nav className="lf-steps" aria-label="Lesson steps">
        {steps.map((s, k) => (
          <button key={s} className={`${k === i ? "on" : ""} ${k < i ? "done" : ""}`}
            disabled={k > seen && !done} onClick={() => goTo(k)} aria-current={k === i ? "step" : undefined}>
            <span className="lf-num">{k < i ? <Icon name="check" size={11} /> : k + 1}</span>
            {STEP_LABEL[s]}
          </button>
        ))}
      </nav>

      <div className="lf-body" ref={bodyRef} key={step}>
        {step === "hear" && L.example && <HearIt skill={skill} onAnswered={() => unlock("hear")} />}
        {step === "rule" && <TheRule skill={skill} />}
        {step === "mine" && <YourSpeech skill={skill} check={check} onAnswered={() => unlock("mine")} />}
        {step === "ready" && (
          <Ready skill={skill} earned={justEarned} canPractice={canPractice} onPractice={onPractice}
            onNextSkill={onNextSkill} onReview={() => goTo(0)} />
        )}
      </div>

      {step !== "ready" && (
        <footer className="lf-foot">
          <button className="btn ghost" onClick={() => goTo(i - 1)} disabled={i === 0}>
            <Icon name="arrowL" size={14} /> Back
          </button>
          <span className="lf-hint micro">{canNext ? "← → to move" : step === "hear" ? "Pick one to continue" : "Answer to continue"}</span>
          <button className="btn primary" onClick={() => goTo(i + 1)} disabled={!canNext}>
            {steps[i + 1] === "ready" ? "Finish lesson" : "Next"} <Icon name="arrowR" size={14} className="arw" />
          </button>
        </footer>
      )}
    </article>
  );
}

// ---------------------------------------------------------------- 1. hear it
function HearIt({ skill, onAnswered }: { skill: Skill; onAnswered: () => void }) {
  const ex = skill.lesson.example!;
  // A stable order per skill, so the strong one isn't always on the same side.
  const strongFirst = [...skill.id].reduce((a, c) => a + c.charCodeAt(0), 0) % 2 === 0;
  const opts = strongFirst ? (["strong", "weak"] as const) : (["weak", "strong"] as const);
  const [pick, setPick] = useState<"weak" | "strong" | null>(null);
  const choose = (k: "weak" | "strong") => {
    if (pick) return;
    setPick(k);
    onAnswered();
  };
  return (
    <section className="lf-step">
      <h2 className="lf-q">Which one would you remember?</h2>
      <p className="lf-sub">Listen or read both, then pick the one that lands.</p>
      <div className="lf-pair">
        {opts.map((k, n) => {
          const text = ex[k];
          const state = !pick ? "" : k === "strong" ? "is-strong" : "is-weak";
          return (
            <div key={k} className={`lf-opt ${state} ${pick === k ? "picked" : ""}`}>
              <div className="lf-opt-head">
                <span className="lf-letter">{pick ? (k === "strong" ? "Strong" : "Weak") : `Version ${"AB"[n]}`}</span>
                <ListenButton text={text} style={k} />
              </div>
              <p className="lf-quote">“{text}”</p>
              <button className="btn lf-pick" onClick={() => choose(k)} disabled={!!pick}>
                {pick === k ? <><Icon name="check" size={14} /> Your pick</> : "This one"}
              </button>
            </div>
          );
        })}
      </div>
      {pick && (
        <div className={`lf-verdict ${pick === "strong" ? "good" : "bad"}`} role="status">
          <b>{pick === "strong" ? "Right, that's the strong one." : "Not quite: the other one is stronger."}</b> {ex.why}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- 2. the rule
function TheRule({ skill }: { skill: Skill }) {
  const L = skill.lesson;
  return (
    <section className="lf-step">
      <p className="lf-lead">{L.intro}</p>
      <ol className="lf-points">
        {L.points.map((p, n) => (
          <li key={p.title} style={{ animationDelay: `${120 + n * 90}ms` }}>
            <span className="lf-pnum">{n + 1}</span>
            <div><b>{p.title}</b><p>{p.body}</p></div>
          </li>
        ))}
      </ol>
      <p className="lf-remember"><Icon name="idea" size={16} /> {L.remember}</p>
    </section>
  );
}

// ---------------------------------------------------------------- 3. your speech
/** How to look at your own transcript for each skill: which part, and which words to mark. */
type Lens = { ask: string; where?: "start" | "end" | "all"; mark?: RegExp; sentenceLen?: boolean };
const LENS: Record<string, Lens> = {
  claim_up_front: { ask: "Did your last talk state a clear position in the first 15 seconds?", where: "start" },
  signposts: { ask: "Did you signpost at least two separate points?", where: "all",
    mark: /\b(first(ly)?|second(ly)?|third(ly)?|next|another (reason|point)|finally|lastly|my (first|second|third|last|final) (reason|point))\b/gi },
  conclusion: { ask: "Did your last talk end with a clear, signalled conclusion?", where: "end",
    mark: /\b(in conclusion|to sum up|to conclude|in summary|overall|that's why|so remember)\b/gi },
  examples: { ask: "Did you give at least two concrete examples?", where: "all",
    mark: /\b(for example|for instance|such as|like when|imagine|one time)\b/gi },
  hard_evidence: { ask: "Did you use a number or a named source?", where: "all",
    mark: /\b(\d[\d,.]*\s?(%|percent)?|according to|stud(y|ies)|research|survey|data)\b/gi },
  support_every_point: { ask: "Did every point you made have its own support?", where: "all",
    mark: /\b(for example|for instance|according to|\d[\d,.]*)\b/gi },
  explain_evidence: { ask: "After your evidence, did you say what it proves?", where: "all",
    mark: /\b(this shows|which means|this means|that's why|that means)\b/gi },
  why_it_matters: { ask: "Did you say why it matters to your audience?", where: "all",
    mark: /\b(matters|important|which is why|so (you|we) (can|will|should))\b/gi },
  other_side: { ask: "Did you name the other side and answer it?", where: "all",
    mark: /\b(some (people )?(say|argue|think)|critics|opponents|on the other hand|admittedly|of course)\b/gi },
  direct: { ask: "Did you avoid hedges like “I think”, “kind of” and “just”?", where: "all",
    mark: /\b(i think|i guess|kind of|sort of|maybe|probably|just|i feel like)\b/gi },
  one_idea: { ask: "Were most of your sentences 10–20 words long?", where: "start", sentenceLen: true },
  takeaway: { ask: "Did you end by telling the audience what to think or do?", where: "end",
    mark: /\b(remember|next time|try|you should|we should|let's|take away)\b/gi },
  fewer_fillers: { ask: "Did you keep fillers under 4 per minute?", where: "all",
    mark: /\b(um+|uh+|erm|you know|i mean|basically)\b/gi },
  pause_not_fill: { ask: "Did you use pauses instead of fillers (under 1.5 per minute)?", where: "all",
    mark: /\b(um+|uh+|erm|you know|i mean|basically)\b/gi },
  target_pace: { ask: "Was your speaking speed inside the target range?" },
  steady_pace: { ask: "Did your speed stay steady, without big swings?" },
  pitch_range: { ask: "Did your voice move up and down, rather than staying flat?" },
  stress_words: { ask: "Did you hit your key words harder than the rest?" },
  hold_contact: { ask: "Did you hold eye contact most of the time?" },
  sweep_room: { ask: "Did you look at both sides of the room, not just the center?" },
};

/** The latest analyzed full run (not a Learn practice, Q&A or replay), fetched once per visit. */
let lastRun: Promise<SessionBundle | null> | null = null;
export function latestRun(): Promise<SessionBundle | null> {
  if (!lastRun) {
    lastRun = (async () => {
      const rows = await engine.request<SessionRow[]>("sessions.list", { limit: 12 });
      for (const r of rows.filter((x) => x.status === "analyzed" && x.mode !== "qa" && x.mode !== "replay").slice(0, 4)) {
        const b = await engine.request<SessionBundle>("session.get", { sessionId: r.sessionId });
        if (!b.session?.drill && b.summary && !b.summary.noSpeech && b.transcript?.sentences?.length) return b;
      }
      return null;
    })();
    lastRun.catch(() => { lastRun = null; });
    setTimeout(() => { lastRun = null; }, 60_000); // pick up new runs
  }
  return lastRun;
}

function YourSpeech({ skill, check, onAnswered }: { skill: Skill; check: CheckStatus | undefined; onAnswered: () => void }) {
  const lens = LENS[skill.check] ?? { ask: "Did your last talk do this?" };
  const [run, setRun] = useState<SessionBundle | null | undefined>(undefined);
  const [guess, setGuess] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    latestRun().then((b) => alive && setRun(b)).catch(() => alive && setRun(null));
    return () => { alive = false; };
  }, []);
  const verdict = check?.recent.length ? check.recent[check.recent.length - 1] : null;
  const noRun = run === null || (run !== undefined && !verdict);
  useEffect(() => { if (noRun) onAnswered(); }, [noRun]); // eslint-disable-line react-hooks/exhaustive-deps

  const answer = (g: boolean) => {
    setGuess(g);
    onAnswered();
  };
  const fmt = (v: number | null) => (v == null ? "–" : skill.practice.unit ? skill.practice.unit(v) : String(v));

  if (run === undefined) return <section className="lf-step"><p className="muted">Finding your last talk…</p></section>;
  if (noRun) {
    return (
      <section className="lf-step">
        <h2 className="lf-q">Check it on your own speech</h2>
        <div className="lf-empty">
          <Icon name="mic" size={18} />
          <p>Once you've done a full practice run, this step shows your own words and whether you did this. For now, carry on.</p>
        </div>
      </section>
    );
  }
  const right = guess != null && guess === verdict!.passed;
  return (
    <section className="lf-step">
      <span className="micro">From your last talk · {run!.summary?.title || "Untitled"}</span>
      <h2 className="lf-q">{lens.ask}</h2>
      {guess == null ? (
        <>
          <p className="lf-sub">Guess first, then see what the analysis found.</p>
          <div className="lf-guess">
            <button className="btn big" onClick={() => answer(true)}><Icon name="check" size={14} /> Yes, I did</button>
            <button className="btn big" onClick={() => answer(false)}><Icon name="cross" size={14} /> No, I didn't</button>
          </div>
        </>
      ) : (
        <>
          <div className={`lf-verdict ${verdict!.passed ? "good" : "bad"}`} role="status">
            <b>{verdict!.passed ? "You did it." : "Not yet."}</b>{" "}
            {verdict!.value == null ? "The analysis didn't find it in your talk." : <>The analysis found: {fmt(verdict!.value)}.</>}{" "}
            <span className="lf-match">{right ? "You called it." : "Your guess was off, which is exactly why it's worth checking."}</span>
          </div>
          {lens.where && <Excerpt bundle={run!} lens={lens} />}
        </>
      )}
    </section>
  );
}

function Excerpt({ bundle, lens }: { bundle: SessionBundle; lens: Lens }) {
  const sents = bundle.transcript?.sentences ?? [];
  const thesis = bundle.summary?.overview?.thesis ?? null;
  const has = (t: string) => !!lens.mark && new RegExp(lens.mark.source, "i").test(t);
  const picked = useMemo(() => {
    if (lens.where === "start") {
      const first = sents.filter((s) => s.t0 < 15).slice(0, 3);
      return first.length ? first : sents.slice(0, 2);
    }
    if (lens.where === "end") return sents.slice(-2);
    const hits = sents.filter((s) => has(s.text));
    return (hits.length ? hits : sents).slice(0, 4);
  }, [sents, lens]); // eslint-disable-line react-hooks/exhaustive-deps
  const anyHit = picked.some((s) => has(s.text));
  const isThesis = (s: { t0: number; t1: number }) => thesis != null && thesis.t >= s.t0 - 0.5 && thesis.t <= s.t1 + 0.5;
  const fmtT = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
  return (
    <div className="lf-excerpt">
      {picked.map((s, n) => {
        const words = s.text.trim().split(/\s+/).length;
        const claim = lens.where === "start" && !lens.sentenceLen && isThesis(s);
        return (
          <p key={n} className={claim ? "claim" : ""}>
            <span className="lf-t">{fmtT(s.t0)}</span>
            <span className="lf-text">{lens.mark ? highlight(s.text, lens.mark) : s.text}</span>
            {claim && <span className="lf-tag">Your claim</span>}
            {lens.sentenceLen && <span className={`lf-tag ${words >= 10 && words <= 20 ? "ok" : ""}`}>{words} words</span>}
          </p>
        );
      })}
      {lens.mark && (anyHit
        ? <p className="lf-legend"><mark>Highlighted</mark> words are what this skill listens for.</p>
        : <p className="lf-legend">None of the words this skill listens for showed up{lens.where === "end" ? " in your ending" : lens.where === "start" ? " in your opening" : ". This is how you started"}.</p>)}
    </div>
  );
}

function highlight(text: string, re: RegExp) {
  const out: ReactNode[] = [];
  const r = new RegExp(re.source, "gi");
  let last = 0, m: RegExpExecArray | null, k = 0;
  while ((m = r.exec(text))) {
    if (!m[0]) { r.lastIndex++; continue; }
    out.push(text.slice(last, m.index), <mark key={k++}>{m[0]}</mark>);
    last = m.index + m[0].length;
  }
  out.push(text.slice(last));
  return out;
}

// ---------------------------------------------------------------- 4. ready
function Ready({ skill, earned, canPractice, onPractice, onNextSkill, onReview }: {
  skill: Skill; earned: boolean; canPractice: boolean; onPractice: () => void; onNextSkill?: () => void; onReview: () => void;
}) {
  const L = skill.lesson, P = skill.practice;
  return (
    <section className="lf-step lf-ready">
      <div className="lf-done-mark" aria-hidden>
        <svg viewBox="0 0 52 52" width="64" height="64"><circle cx="26" cy="26" r="24" /><path d="M15 27l7 7 15-16" /></svg>
        {earned && <span className="lf-xp">+{XP.lesson} XP</span>}
      </div>
      <h2 className="lf-q">Lesson complete</h2>
      <ul className="lf-recap">
        {L.points.map((p) => <li key={p.title}><Icon name="check" size={12} /> {p.title}</li>)}
      </ul>
      <div className="lf-next">
        <span className="micro">Now try it · {P.seconds} s</span>
        <b>{P.prompt}</b>
        <span className="small muted">To pass: {P.target}</span>
      </div>
      <div className="row lf-ready-actions">
        {canPractice && (
          <button className="btn primary big" onClick={onPractice}>
            <Icon name="mic" size={14} /> Start practice <Icon name="arrowR" size={14} className="arw" />
          </button>
        )}
        {onNextSkill && <button className="btn big" onClick={onNextSkill}>Next skill <Icon name="arrowR" size={14} /></button>}
        <button className="btn ghost" onClick={onReview}><Icon name="retry" size={14} /> Review</button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- listen (local TTS)
const voices = new Map<string, Promise<string>>();
export function exampleVoice(text: string, style: "weak" | "strong"): Promise<string> {
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
export function ListenButton({ text, style }: { text: string; style: "weak" | "strong" }) {
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
      title="Hear it read aloud">
      <Icon name={state === "playing" ? "stop" : "speaker"} size={12} />
      {state === "loading" ? "Synthesizing…" : state === "playing" ? "Stop" : "Listen"}
      <span className="wave" aria-hidden>{Array.from({ length: 5 }, (_, i) => <i key={i} style={{ animationDelay: `${i * 90}ms` }} />)}</span>
    </button>
  );
}
