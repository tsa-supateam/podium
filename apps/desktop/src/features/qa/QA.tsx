// Q&A round between the speech and its results: questions built from what was just said,
// answered on the spot (impromptu / on-demand speaking practice).
import { useEffect, useRef, useState } from "react";
import { engine } from "../../lib/engine";
import type { Question } from "../../lib/types";
import { useApp, useTicker } from "../../stores/app";
import { finishQA, startSession } from "../live/session";

const PREP_SECONDS = 10;
const KIND: Record<string, string> = {
  statistic: "Evidence", proposal: "Risk", causal: "Cause & effect", claim: "Support", comparison: "Comparison",
  under_explained: "Go deeper", definition: "Explain it", general: "Big picture",
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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!qa || qa.questions) return;
    engine
      .request<Question[]>("questions.quick", { sessionId: qa.parentId, k: 5 }, 30000)
      .then((questions) => {
        set({ qa: { ...useApp.getState().qa!, questions } });
        questions.forEach((q) => void questionAudio(q.question).catch(() => {})); // warm up the voice
      })
      .catch((e) => setError(e.message));
  }, [qa, set]);

  if (!qa) return null;
  const toggle = (i: number) => {
    const picked = qa.picked.includes(i) ? qa.picked.filter((x) => x !== i) : qa.picked.length < 2 ? [...qa.picked, i] : qa.picked;
    if (picked === qa.picked && !qa.picked.includes(i)) set({ toast: "Pick up to two questions" });
    set({ qa: { ...qa, picked } });
  };

  return (
    <div className="page qa-page">
      <div className="row" style={{ flexWrap: "wrap", gap: 10 }}>
        <h1>Quick Q&amp;A</h1>
        <span className="spacer" />
        <AnalysisStatus />
      </div>
      <p className="muted qa-sub">Pick one or two. Answer each out loud, like a judge just asked.</p>

      {error && <p style={{ color: "var(--bad)" }}>Could not build questions: {error}</p>}
      {!qa.questions && !error && (
        <div className="row muted"><div className="spinner small-spinner" /> Writing questions from your speech…</div>
      )}

      <div className="qa-list">
        {qa.questions?.map((q, i) => {
          const order = qa.picked.indexOf(i);
          return (
            <button key={i} className={`qa-pick ${order >= 0 ? "on" : ""}`} onClick={() => toggle(i)} aria-pressed={order >= 0}>
              <span className="qa-check">{order >= 0 ? order + 1 : ""}</span>
              <span>
                <span className="kind">{KIND[q.kind] ?? q.kind}</span>
                <span className="qa-q">{q.question}</span>
              </span>
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
          {qa.picked.length === 0 ? "Pick a question" : qa.picked.length === 2 ? "Answer 2 questions" : "Answer 1 question"}
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
      <span className="muted small">Question {qa.index + 1} of {qa.picked.length} · {qa.seconds} s to answer</span>
      <h2 className="qa-prep-q">{q.question}</h2>
      <div className="qa-count">{Math.ceil(left)}</div>
      <span className="muted small">Think about your answer. Recording starts automatically.</span>
      <div className="row">
        <button className="btn ghost" onClick={skip}>Skip this question</button>
        <button className="btn primary" onClick={() => void begin()}>Start now</button>
      </div>
      <AnalysisStatus />
    </div>
  );
}
