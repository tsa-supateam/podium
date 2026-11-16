// Q&A round between the speech and its results. It starts once the speech is analyzed, so the
// questions come from the accurate transcript and what the analysis found in the content.
import { useEffect, useRef, useState } from "react";
import { engine } from "../../lib/engine";
import type { Question } from "../../lib/types";
import { useApp, useTicker } from "../../stores/app";
import { STAGES } from "../live/Analyzing";
import { finishQA, startSession } from "../live/session";
import { Icon } from "../../ui/icons";
import { ScreenHeader, Stepper } from "../../ui/kit";

const PREP_SECONDS = 10;
const KIND: Record<string, string> = {
  statistic: "Evidence", proposal: "Risk", causal: "Cause & effect", claim: "Support", comparison: "Comparison",
  under_explained: "Go deeper", definition: "Explain it", general: "Big picture", counter: "Other side",
  relevance: "On the prompt", thesis: "Your claim", commentary: "Why it matters",
};

const voiceCache = new Map<string, Promise<string>>();
function questionAudio(text: string): Promise<string> {
  if (!voiceCache.has(text)) {
    voiceCache.set(text, engine
      .request<ArrayBuffer>("tts.speak", { text }, 60000)
      .then((buf) => URL.createObjectURL(new Blob([buf], { type: "audio/wav" }))));
  }
  return voiceCache.get(text)!;
}

export default function QA() {
  const qa = useApp((s) => s.qa);
  if (!qa) return null;
  return qa.index < 0 ? <Pick /> : <Prep key={qa.index} />;
}

function AnalysisStatus() {
  const m = useApp((s) => s.mainAnalysis);
  if (!m) return null;
  return (
    <span className={`pill ${m.done ? "ok" : ""}`}>
      <span className="dot" /> {m.done ? "Speech results ready" : "Analyzing your speech in the background…"}
    </span>
  );
}


function Pick() {
  const { qa, set } = useApp();
  const main = useApp((s) => s.mainAnalysis);
  const ready = !main || main.done;
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!qa || qa.questions || !ready) return;
    engine
      .request<Question[]>("questions.quick", { sessionId: qa.parentId, k: 5 }, 30000)
      .then((questions) => {
        set({ qa: { ...useApp.getState().qa!, questions } });
        questions.forEach((q) => void questionAudio(q.question).catch(() => {})); // warm up the voice
      })
      .catch((e) => setError(e.message));
  }, [qa, set, ready]);

  if (!qa) return null;
  const toggle = (i: number) => {
    const picked = qa.picked.includes(i) ? qa.picked.filter((x) => x !== i) : qa.picked.length < 2 ? [...qa.picked, i] : qa.picked;
    if (picked === qa.picked && !qa.picked.includes(i)) set({ toast: "Pick up to two questions" });
    set({ qa: { ...qa, picked } });
  };

  return (
    <div className="page qa-page stagger">
      <ScreenHeader title="Quick Q&A" />
      <p className="muted qa-sub">Pick one or two. Answer each out loud, like a judge just asked.</p>

      {error && <p style={{ color: "var(--bad-ink)" }}><Icon name="warn" size={14} /> Could not build questions: {error}</p>}
      {!qa.questions && !error && (
        <div className="row muted">
          <div className="spinner small-spinner" />
          {ready ? "Writing questions from your speech…"
            : `Analyzing your speech first, so the questions come from what you said. ${STAGES.find(([k]) => k === main!.stage)?.[1] ?? ""}…`}
        </div>
      )}

      <div className="qa-list scroll">
        {qa.questions?.map((q, i) => {
          const order = qa.picked.indexOf(i);
          return (
            <button key={i} className={`qa-pick ${order >= 0 ? "on" : ""}`} onClick={() => toggle(i)} aria-pressed={order >= 0}
              style={{ animationDelay: `${i * 40}ms` }}>
              <span className="acc-idx micro">{String(i + 1).padStart(3, "0")}</span>
              <span>
                <span className="kind">{KIND[q.kind] ?? q.kind}</span>
                <span className="qa-q">{q.question}</span>
              </span>
              <span className="qa-check">{order >= 0 ? order + 1 : <Icon name="plus" size={14} />}</span>
            </button>
          );
        })}
      </div>

      <div className="row qa-actions">
        <div className="segmented" role="radiogroup" aria-label="Answer time" style={{ width: 240 }}>
          {[30, 60, 90].map((sec) => (
            <button key={sec} role="radio" aria-checked={qa.seconds === sec} className={qa.seconds === sec ? "on" : ""}
              onClick={() => set({ qa: { ...qa, seconds: sec } })}>
              {sec} s
            </button>
          ))}
        </div>
        <span className="spacer" />
        <button className="btn ghost" onClick={() => void finishQA()}>Skip to results</button>
        <button className="btn primary big" disabled={qa.picked.length === 0}
          onClick={() => set({ qa: { ...qa, index: 0 } })}>
          {qa.picked.length === 0 ? "Pick a question" : qa.picked.length === 2 ? "Answer 2 questions" : "Answer 1 question"} <Icon name="arrowR" size={14} className="arw" />
        </button>
      </div>
    </div>
  );
}

function Prep() {
  const { qa, set } = useApp();
  useTicker(4);
  const startAt = useRef(performance.now());
  const started = useRef(false);
  const autoTried = useRef(false); // the countdown starts recording once; after a failure, wait for a click
  const audio = useRef<HTMLAudioElement | null>(null);
  const q = qa && qa.questions ? qa.questions[qa.picked[qa.index]] : null;

  const begin = async () => {
    if (started.current || !qa || !q) return;
    started.current = true;
    audio.current?.pause();
    try {
      await startSession(null, { parentId: qa.parentId, question: q.question, seconds: qa.seconds });
    } catch (e) {
      started.current = false;
      set({ toast: (e as Error).message });
    }
  };

  useEffect(() => {
    if (!q) return;
    let cancelled = false;
    questionAudio(q.question)
      .then((url) => {
        if (cancelled) return;
        audio.current = new Audio(url);
        void audio.current.play().catch(() => {});
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      audio.current?.pause();
    };
  }, [q]);

  const left = Math.max(0, PREP_SECONDS - (performance.now() - startAt.current) / 1000);
  useEffect(() => {
    if (left <= 0 && !autoTried.current) {
      autoTried.current = true;
      void begin();
    }
  });

  if (!qa || !q) return null;
  const skip = () => {
    const next = qa.index + 1;
    if (next < qa.picked.length) set({ qa: { ...qa, index: next } });
    else void finishQA();
  };

  return (
    <div className="center-card qa-prep">
      <Stepper index={qa.index} total={qa.picked.length} label="QUESTION" />
      <span className="micro">{qa.seconds} s to answer</span>
      <h2 className="qa-prep-q">{q.question}</h2>
      <div className="qa-count" aria-live="off">{String(Math.ceil(left)).padStart(2, "0")}</div>
      <span className="muted small">Think about your answer. Recording starts automatically.</span>
      <div className="row">
        <button className="btn ghost" onClick={skip}>Skip this question</button>
        <button className="btn primary" onClick={() => void begin()}><Icon name="rec" size={14} /> Start now</button>
      </div>
      <AnalysisStatus />
    </div>
  );
}
