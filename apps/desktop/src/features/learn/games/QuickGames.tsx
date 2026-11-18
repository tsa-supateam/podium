// The four quick games. Each round gives instant feedback with the reason, so every answer teaches;
// rounds get harder as you go (obvious flaws first, subtle ones last). Fully keyboard-playable.
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../../../ui/icons";
import { rng, shuffle, testClaim } from "../game";
import { ListenButton, exampleVoice } from "../LessonFlow";
import {
  BUCKET_LABEL, type Bucket, CLAIM_PAIRS, EVIDENCE_CARDS, FINISHER_PROMPTS, FLAW_DIFFICULTY, FLAW_LABEL, HEDGE_LINES, LANES,
  type Lane, SPEECHES, UPGRADES, hedgeWords, plain,
} from "./content";
import { type GameDef, type Miss, Pips, type PlayProps } from "./GameShell";

/** Window keydown listener that ignores typing in fields. */
function useKeys(fn: (e: KeyboardEvent) => void) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea")) return;
      ref.current(e);
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);
}

const strip = (t: string) => t.replace(/[^\w']/g, "").toLowerCase();

// ---------------------------------------------------------------- Claim Duel
function ClaimDuel({ seed, onDone }: PlayProps) {
  const R = 9;
  const rounds = useMemo(() => {
    const rand = rng(seed);
    // one pair per prompt where possible, then sorted easy → subtle
    const seen = new Set<string>();
    const picked = shuffle(CLAIM_PAIRS, rand).filter((p) => (seen.has(p.prompt) ? false : (seen.add(p.prompt), true))).slice(0, R);
    return picked.sort((a, b) => FLAW_DIFFICULTY[a.flaw] - FLAW_DIFFICULTY[b.flaw]).map((p) => ({ ...p, strongLeft: rand() < 0.5 }));
  }, [seed]);
  const finisher = useMemo(() => FINISHER_PROMPTS[Math.floor(rng(seed + 1)() * FINISHER_PROMPTS.length)], [seed]);
  const [i, setI] = useState(0);
  const [pick, setPick] = useState<"strong" | "weak" | null>(null);
  const [marks, setMarks] = useState<(boolean | null)[]>([]);
  const [misses, setMisses] = useState<Miss[]>([]);
  const [draft, setDraft] = useState("");
  const r = rounds[i];

  const choose = (k: "strong" | "weak") => {
    if (pick || !r) return;
    setPick(k);
    setMarks((m) => [...m, k === "strong"]);
    if (k === "weak") setMisses((ms) => [...ms, { text: `“${r.weak}”`, detail: `${FLAW_LABEL[r.flaw]}. ${r.why}` }]);
  };
  const next = () => { if (pick) { setPick(null); setI(i + 1); } };
  useKeys((e) => {
    if (!r) return;
    if (!pick && (e.key === "1" || e.key === "2")) choose((e.key === "1") === r.strongLeft ? "strong" : "weak");
    if (pick && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); next(); }
  });

  const graded = useMemo(() => testClaim(draft, finisher), [draft, finisher]);
  if (!r) {
    const submit = () => {
      const ok = graded.verdict.tone === "good";
      const score = marks.filter(Boolean).length + (ok ? 1 : 0);
      onDone({ score, max: R + 1, misses: ok ? misses : [...misses, { text: `Your claim: “${draft.trim()}”`, detail: graded.checks.filter((c) => c.tone !== "good").map((c) => c.detail).join(" ") }] });
    };
    return (
      <section className="card duel">
        <Pips n={R + 1} i={R} marks={marks} />
        <span className="micro">Final round · write your own</span>
        <h2 className="duel-prompt">{finisher}</h2>
        <p className="muted">Write the one sentence you'd open with. It's graded live by the same rules as the rounds you just played.</p>
        <textarea className="duel-input" autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} rows={2} maxLength={300}
          placeholder="Your claim…" aria-label="Your claim"
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && draft.trim()) { e.preventDefault(); submit(); } }} />
        {draft.trim() && (
          <div className="claim-result" aria-live="polite">
            <span className={`claim-verdict ${graded.verdict.tone}`}>{graded.verdict.label}</span>
            <ul>{graded.checks.map((c) => <li key={c.label} className={c.tone}><Icon name={c.tone === "good" ? "check" : c.tone === "bad" ? "cross" : "warn"} size={12} /><b>{c.label}</b> <span className="muted">{c.detail}</span></li>)}</ul>
          </div>
        )}
        <div className="row"><button className="btn primary" disabled={!draft.trim()} onClick={submit}>Submit claim <Icon name="arrowR" size={14} /></button>
          <span className="micro">“Strong claim” scores the point</span></div>
      </section>
    );
  }
  const sides = r.strongLeft ? (["strong", "weak"] as const) : (["weak", "strong"] as const);
  const flaws = testClaim(r.weak, r.prompt).checks.filter((c) => c.tone !== "good");
  return (
    <section className="card duel">
      <Pips n={R + 1} i={i} marks={marks} />
      <span className="micro">Round {i + 1} · which claim is stronger?</span>
      <h2 className="duel-prompt">{r.prompt}</h2>
      <div className="duel-pair">
        {sides.map((k, n) => (
          <button key={k} className={`duel-opt ${pick ? (k === "strong" ? "win" : "lose") : ""} ${pick === k ? "picked" : ""}`}
            onClick={() => choose(k)} disabled={!!pick} aria-keyshortcuts={String(n + 1)}>
            <span className="duel-key">{n + 1}</span>
            <span className="duel-text">“{r[k]}”</span>
            {pick && k === "weak" && (
              <span className="duel-flaws">{flaws.map((f) => <span key={f.label} className={`flaw ${f.tone}`}>{f.label}</span>)}</span>
            )}
          </button>
        ))}
      </div>
      {pick && (
        <div className={`lf-verdict ${pick === "strong" ? "good" : "bad"}`} role="status">
          <b>{pick === "strong" ? "Right." : "Not this time."}</b> {r.why}
          <button className="btn primary" onClick={next} autoFocus>Next <Icon name="arrowR" size={14} /></button>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- Spot the Hedge
function SpotHedge({ seed, onDone }: PlayProps) {
  const R = 8;
  const rounds = useMemo(() => {
    const all = shuffle(HEDGE_LINES, rng(seed));
    const traps = all.filter((h) => !hedgeWords(h.text).some((w) => w.target)).slice(0, 1);
    const real = all.filter((h) => hedgeWords(h.text).some((w) => w.target)).slice(0, R - traps.length);
    const out = [...real];
    traps.forEach((t) => out.splice(2 + Math.floor(rng(seed + 2)() * (out.length - 2)), 0, t)); // never first
    return out;
  }, [seed]);
  const [i, setI] = useState(0);
  const [stage, setStage] = useState<"listen" | "tap" | "reveal">("listen");
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [scores, setScores] = useState<number[]>([]);
  const [misses, setMisses] = useState<Miss[]>([]);
  const [noVoice, setNoVoice] = useState(false);
  const [needTap, setNeedTap] = useState(false); // the browser blocked autoplay: one tap plays it
  const [replays, setReplays] = useState(0);
  const audio = useRef<HTMLAudioElement | null>(null);
  const r = rounds[i];
  const words = useMemo(() => (r ? hedgeWords(r.text) : []), [r]);

  // Synthesize the rounds one after another (each is its own Piper run), so later rounds are ready.
  useEffect(() => {
    let chain = Promise.resolve();
    rounds.forEach((h) => { chain = chain.then(() => exampleVoice(plain(h.text), "weak").then(() => {}, () => {})); });
  }, [rounds]);
  const play = async () => {
    if (!r) return;
    let url: string;
    try {
      url = await exampleVoice(plain(r.text), "weak");
    } catch {
      setNoVoice(true); // reading mode: show the line briefly instead
      setTimeout(() => setStage((s) => (s === "listen" ? "tap" : s)), 4000);
      return;
    }
    audio.current?.pause();
    const a = new Audio(url);
    audio.current = a;
    a.onended = () => setStage((s) => (s === "listen" ? "tap" : s));
    try {
      await a.play();
      setNeedTap(false);
    } catch {
      setNeedTap(true);
    }
  };
  useEffect(() => {
    if (r) { setStage("listen"); setSel(new Set()); void play(); }
    return () => audio.current?.pause();
  }, [i]); // eslint-disable-line react-hooks/exhaustive-deps

  const check = () => {
    const targets = words.map((w, k) => (w.target ? k : -1)).filter((k) => k >= 0);
    const hits = targets.filter((k) => sel.has(k)).length;
    const wrong = [...sel].filter((k) => !words[k].target).length;
    const s = targets.length ? Math.max(0, hits - wrong) / targets.length : wrong ? 0 : 1;
    setScores((x) => [...x, s]);
    if (s < 1) setMisses((m) => [...m, { text: `“${plain(r.text)}”`, detail: targets.length
      ? `The hedges and fillers: ${targets.map((k) => `“${strip(words[k].word)}”`).join(", ")}. Clean: “${r.clean}”`
      : "Nothing to cut here: “like” and “just” can be real words, not fillers." }]);
    setStage("reveal");
    audio.current?.pause();
  };
  const next = () => {
    if (i + 1 >= rounds.length) {
      const total = [...scores].reduce((a, b) => a + b, 0);
      onDone({ score: Math.round(total * 10) / 10, max: rounds.length, misses });
    } else setI(i + 1);
  };
  useKeys((e) => {
    if (e.key.toLowerCase() === "r" && stage !== "reveal" && replays < 1) { setReplays((n) => n + 1); void play(); }
    if (e.key === "Enter") { e.preventDefault(); if (stage === "tap") check(); else if (stage === "reveal") next(); }
  });
  useEffect(() => setReplays(0), [i]);
  if (!r) return null;
  return (
    <section className="card hedge">
      <Pips n={rounds.length} i={i} marks={scores.map((s) => s >= 1)} />
      <span className="micro">Round {i + 1} · {stage === "listen" ? "listen" : stage === "tap" ? "tap every hedge or filler you heard" : "answer"}</span>
      {stage === "listen" && !noVoice ? (
        <div className="hedge-listen">
          <span className="hedge-wave" aria-hidden>{Array.from({ length: 9 }, (_, k) => <i key={k} style={{ animationDelay: `${k * 80}ms` }} />)}</span>
          {needTap
            ? <button className="btn primary big" onClick={() => void play()}><Icon name="play" size={14} /> Play the sentence</button>
            : <p className="muted">Listening… the words appear when it finishes.</p>}
          <button className="btn ghost" onClick={() => setStage("tap")}>Show the words now</button>
        </div>
      ) : (
        <div className="hedge-words" role="group" aria-label="Words in the sentence">
          {words.map((w, k) => {
            const on = sel.has(k);
            const cls = stage !== "reveal" ? (on ? "on" : "") : w.target ? (on ? "hit" : "missed") : on ? "wrong" : "";
            return (
              <button key={k} className={`word ${cls}`} disabled={stage === "reveal" || (stage === "listen")}
                aria-pressed={on} onClick={() => setSel((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; })}>
                {w.word}
              </button>
            );
          })}
        </div>
      )}
      {noVoice && <span className="micro">Reading mode: the on-device voice isn't installed.</span>}
      {stage === "tap" && (
        <div className="row">
          <button className="btn primary" onClick={check}>Check <Icon name="arrowR" size={14} /></button>
          {!noVoice && replays < 1 && <button className="btn ghost" onClick={() => { setReplays(1); void play(); }}><Icon name="replay" size={14} /> Hear it again (R)</button>}
          <span className="micro">Tap nothing if it's clean</span>
        </div>
      )}
      {stage === "reveal" && (
        <div className={`lf-verdict ${scores.at(-1)! >= 1 ? "good" : "bad"}`} role="status">
          <div className="hedge-clean">
            <span><b>{scores.at(-1)! >= 1 ? "Clean catch." : "Close."}</b> Without them: “{r.clean}”</span>
            {!noVoice && <ListenButton text={r.clean} style="strong" />}
          </div>
          <button className="btn primary" onClick={next} autoFocus>{i + 1 >= rounds.length ? "See results" : "Next"} <Icon name="arrowR" size={14} /></button>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- Signpost Sorter
function SignpostSorter({ seed, onDone }: PlayProps) {
  const speeches = useMemo(() => shuffle(SPEECHES, rng(seed)).slice(0, 3), [seed]);
  const [i, setI] = useState(0);
  const sp = speeches[i];
  const order = useMemo(() => (sp ? shuffle(sp.sentences.map((_, k) => k), rng(seed + i + 7)) : []), [sp, seed, i]);
  const [place, setPlace] = useState<Record<number, Lane | null>>({});
  const [checks, setChecks] = useState(0);
  const [solved, setSolved] = useState<null | "first" | "second" | "shown">(null);
  const [wiggle, setWiggle] = useState<number[]>([]);
  const [cursor, setCursor] = useState(0);
  const [bonus, setBonus] = useState<null | boolean>(null);
  const [stars, setStars] = useState<number[]>([]);
  const [misses, setMisses] = useState<Miss[]>([]);
  const dragging = useRef<number | null>(null);

  const pool = order.filter((k) => !place[k]);
  const put = (k: number, lane: Lane | null) => setPlace((p) => ({ ...p, [k]: lane }));
  const check = () => {
    const wrong = sp.sentences.map((s, k) => (place[k] !== s.lane ? k : -1)).filter((k) => k >= 0);
    const n = checks + 1;
    setChecks(n);
    if (!wrong.length) { setSolved(n === 1 ? "first" : "second"); return; }
    if (n >= 2) { // second miss: show the answer
      setPlace(Object.fromEntries(sp.sentences.map((s, k) => [k, s.lane])));
      setSolved("shown");
      setMisses((m) => [...m, { text: sp.prompt, detail: "Look for the signpost words (First, Another reason, So) that open each point and the ending." }]);
      return;
    }
    setWiggle(wrong);
    setTimeout(() => setWiggle([]), 600);
    setPlace((p) => ({ ...p, ...Object.fromEntries(wrong.map((k) => [k, null])) }));
  };
  // The bonus: tap the word that signals the second point.
  const bonusIdx = sp ? sp.sentences.findIndex((s) => s.lane === "p2" && /\[/.test(s.text)) : -1;
  const bonusWords = bonusIdx >= 0 ? hedgeWords(sp.sentences[bonusIdx].text) : [];
  const roundStars = () => (solved === "first" ? 2 : solved === "second" ? 1 : 0) + (bonus ? 1 : 0);
  const next = () => {
    const all = [...stars, roundStars()];
    if (i + 1 >= speeches.length) onDone({ score: all.reduce((a, b) => a + b, 0), max: speeches.length * 3, misses });
    else { setStars(all); setI(i + 1); setPlace({}); setChecks(0); setSolved(null); setBonus(null); setCursor(0); }
  };
  useKeys((e) => {
    if (solved) { if (e.key === "Enter" && bonus !== null) next(); return; }
    if (e.key === "ArrowDown" || e.key === "ArrowRight") { e.preventDefault(); setCursor((c) => Math.min(pool.length - 1, c + 1)); }
    if (e.key === "ArrowUp" || e.key === "ArrowLeft") { e.preventDefault(); setCursor((c) => Math.max(0, c - 1)); }
    const lane = LANES[Number(e.key) - 1];
    if (lane && pool[cursor] != null) { put(pool[cursor], lane.id); setCursor((c) => Math.max(0, Math.min(c, pool.length - 2))); }
    if (e.key === "Enter" && !pool.length) check();
  });
  if (!sp) return null;
  return (
    <section className="card sorter">
      <Pips n={speeches.length} i={i} marks={stars.map((s) => s >= 2)} />
      <span className="micro">Speech {i + 1} · “{sp.prompt}” · drag each sentence into place (or arrows, then 1–4)</span>
      <div className="sorter-pool" onDragOver={(e) => e.preventDefault()} onDrop={() => { if (dragging.current != null) put(dragging.current, null); }}>
        {pool.length ? pool.map((k, n) => (
          <button key={k} className={`sentence ${n === cursor ? "cursor" : ""}`} draggable
            onDragStart={() => { dragging.current = k; }} onClick={() => setCursor(n)}>
            {plain(sp.sentences[k].text)}
          </button>
        )) : !solved && <span className="muted small">All placed. Check your structure.</span>}
      </div>
      <div className="lanes">
        {LANES.map((l, n) => (
          <div key={l.id} className="lane" onDragOver={(e) => e.preventDefault()}
            onDrop={() => { if (dragging.current != null) put(dragging.current, l.id); dragging.current = null; }}
            onClick={() => { const k = pool[cursor]; if (k != null && !solved) put(k, l.id); }}>
            <span className="lane-label"><span className="duel-key">{n + 1}</span> {l.label}</span>
            {sp.sentences.map((s, k) => (place[k] === l.id ? (
              <button key={k} className={`sentence placed ${wiggle.includes(k) ? "wiggle" : ""} ${solved ? "ok" : ""}`} draggable={!solved}
                onDragStart={() => { dragging.current = k; }}
                onClick={(e) => { e.stopPropagation(); if (!solved) put(k, null); }} title={solved ? undefined : "Send back"}>
                {solved && (bonus !== null || bonusIdx < 0) ? highlightSignpost(s.text) : plain(s.text)}
              </button>
            ) : null))}
          </div>
        ))}
      </div>
      {!solved && <div className="row"><button className="btn primary" disabled={!!pool.length} onClick={check}>Check <Icon name="arrowR" size={14} /></button>
        {checks === 1 && <span className="micro">Wrong ones went back to the top. One more try.</span>}</div>}
      {solved && (
        <div className={`lf-verdict ${solved === "shown" ? "bad" : "good"}`} role="status">
          <b>{solved === "first" ? "Perfect structure, first try." : solved === "second" ? "Fixed it." : "Here's how it's built."}</b>{" "}
          {bonus === null && bonusIdx >= 0 ? (
            <div className="bonus">
              <span>Bonus: which word tells you a new point is starting?</span>
              <div className="hedge-words">
                {bonusWords.map((w, k) => <button key={k} className="word" onClick={() => setBonus(w.target)}>{w.word}</button>)}
              </div>
            </div>
          ) : (
            <>
              <span>{bonus ? "Yes, that's the signpost. Listeners use it to keep their place." : "The signpost was the opening words: listeners use them to keep their place."}</span>
              <button className="btn primary" onClick={next} autoFocus>{i + 1 >= speeches.length ? "See results" : "Next speech"} <Icon name="arrowR" size={14} /></button>
            </>
          )}
          {bonusIdx < 0 && bonus === null && <button className="btn primary" onClick={() => setBonus(false)}>Continue</button>}
        </div>
      )}
    </section>
  );
}

function highlightSignpost(text: string) {
  const m = text.match(/^(.*?)\[([^\]]+)\](.*)$/);
  return m ? <>{m[1]}<mark>{m[2]}</mark>{m[3]}</> : text;
}

// ---------------------------------------------------------------- Evidence or Anecdote
type EvRound = { kind: "sort"; card: (typeof EVIDENCE_CARDS)[number] } | { kind: "upgrade"; set: (typeof UPGRADES)[number] };
const SWIPE: Record<Bucket, { key: string; dir: string }> = { anecdote: { key: "←", dir: "left" }, hard: { key: "→", dir: "right" }, none: { key: "↓", dir: "down" } };

function EvidenceSort({ seed, onDone }: PlayProps) {
  const rounds = useMemo<EvRound[]>(() => {
    const rand = rng(seed);
    const by = (b: Bucket) => shuffle(EVIDENCE_CARDS.filter((c) => c.bucket === b), rand);
    const sorts = shuffle([...by("hard").slice(0, 3), ...by("anecdote").slice(0, 3), ...by("none").slice(0, 2)], rand);
    return [...sorts.map((card) => ({ kind: "sort" as const, card })), ...shuffle(UPGRADES, rand).slice(0, 4).map((set) => ({ kind: "upgrade" as const, set }))];
  }, [seed]);
  const [i, setI] = useState(0);
  const [answer, setAnswer] = useState<Bucket | number | null>(null);
  const [marks, setMarks] = useState<boolean[]>([]);
  const [misses, setMisses] = useState<Miss[]>([]);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const r = rounds[i];

  const decide = (a: Bucket | number) => {
    if (answer !== null || !r) return;
    setAnswer(a);
    const ok = r.kind === "sort" ? a === r.card.bucket : a === r.set.answer;
    setMarks((m) => [...m, ok]);
    if (!ok) setMisses((m) => [...m, r.kind === "sort"
      ? { text: `“${r.card.text}”`, detail: `${BUCKET_LABEL[r.card.bucket]}: ${r.card.why}` }
      : { text: `Upgrade: “${r.set.anecdote}”`, detail: `${r.set.options[r.set.answer]} ${r.set.why}` }]);
  };
  const next = () => {
    if (i + 1 >= rounds.length) onDone({ score: marks.filter(Boolean).length, max: rounds.length, misses });
    else { setI(i + 1); setAnswer(null); setDrag(null); }
  };
  useKeys((e) => {
    if (!r) return;
    if (answer !== null) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); next(); } return; }
    if (r.kind === "sort") {
      if (e.key === "ArrowLeft") decide("anecdote");
      if (e.key === "ArrowRight") decide("hard");
      if (e.key === "ArrowDown") { e.preventDefault(); decide("none"); }
    } else if (["1", "2", "3"].includes(e.key)) decide(Number(e.key) - 1);
  });
  if (!r) return null;
  const lean = drag ? (Math.abs(drag.x) > Math.abs(drag.y) ? (drag.x < 0 ? "anecdote" : "hard") : drag.y > 0 ? "none" : null) : null;
  return (
    <section className="card evsort">
      <Pips n={rounds.length} i={i} marks={marks} />
      {r.kind === "sort" ? (
        <>
          <span className="micro">Card {i + 1} · does this support the claim?</span>
          <p className="ev-claim">Claim: <b>{r.card.claim}</b></p>
          <div className="ev-table">
            <span className={`ev-bin left ${lean === "anecdote" ? "lean" : ""}`}>← Anecdote</span>
            <div className={`ev-card ${answer !== null ? (answer === r.card.bucket ? "ok" : "no") : ""}`}
              style={drag ? { transform: `translate(${drag.x}px, ${Math.max(0, drag.y)}px) rotate(${drag.x / 18}deg)` } : undefined}
              onPointerDown={(e) => {
                if (answer !== null) return;
                e.preventDefault();
                const s0 = { x: e.clientX, y: e.clientY };
                let d = { x: 0, y: 0 };
                const move = (ev: PointerEvent) => { d = { x: ev.clientX - s0.x, y: ev.clientY - s0.y }; setDrag(d); };
                const up = () => {
                  window.removeEventListener("pointermove", move);
                  window.removeEventListener("pointerup", up);
                  window.removeEventListener("pointercancel", up);
                  setDrag(null);
                  if (Math.max(Math.abs(d.x), d.y) > 80) decide(Math.abs(d.x) > Math.abs(d.y) ? (d.x < 0 ? "anecdote" : "hard") : "none");
                };
                window.addEventListener("pointermove", move);
                window.addEventListener("pointerup", up);
                window.addEventListener("pointercancel", up);
              }}>
              “{r.card.text}”
            </div>
            <span className={`ev-bin right ${lean === "hard" ? "lean" : ""}`}>Hard evidence →</span>
          </div>
          <span className={`ev-bin down ${lean === "none" ? "lean" : ""}`}>↓ Not support at all</span>
          {answer === null && (
            <div className="row ev-buttons">
              {(["anecdote", "none", "hard"] as Bucket[]).map((b) => (
                <button key={b} className="btn" onClick={() => decide(b)}>{SWIPE[b].key} {BUCKET_LABEL[b]}</button>
              ))}
            </div>
          )}
          {answer !== null && (
            <div className={`lf-verdict ${answer === r.card.bucket ? "good" : "bad"}`} role="status">
              <b>{answer === r.card.bucket ? "Right:" : `It's ${BUCKET_LABEL[r.card.bucket].toLowerCase()}:`}</b> {r.card.why}
              <button className="btn primary" onClick={next} autoFocus>Next <Icon name="arrowR" size={14} /></button>
            </div>
          )}
        </>
      ) : (
        <>
          <span className="micro">Card {i + 1} · upgrade it to hard evidence</span>
          <p className="ev-claim">Claim: <b>{r.set.claim}</b></p>
          <p className="ev-anecdote">Anecdote: “{r.set.anecdote}”</p>
          <div className="ev-options">
            {r.set.options.map((o, n) => (
              <button key={n} className={`duel-opt ${answer !== null ? (n === r.set.answer ? "win" : answer === n ? "lose picked" : "") : ""}`}
                onClick={() => decide(n)} disabled={answer !== null}>
                <span className="duel-key">{n + 1}</span><span className="duel-text">{o}</span>
              </button>
            ))}
          </div>
          {answer !== null && (
            <div className={`lf-verdict ${answer === r.set.answer ? "good" : "bad"}`} role="status">
              <b>{answer === r.set.answer ? "Upgraded." : "Not quite."}</b> {r.set.why}
              <button className="btn primary" onClick={next} autoFocus>{i + 1 >= rounds.length ? "See results" : "Next"} <Icon name="arrowR" size={14} /></button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- registry
export const GAMES: GameDef[] = [
  { id: "claimDuel", title: "Claim Duel", icon: "target", minutes: "~2 min",
    blurb: "Two claims, one prompt. Pick the one that would win the room, then write your own.",
    skills: ["structure.claim", "clarity.direct"],
    rules: ["Pick the stronger claim (or press 1 / 2)", "See exactly what weakens the other one", "Final round: write a claim, graded live"],
    fmt: (p) => `${p.score}/${p.max}`, Play: (p) => <ClaimDuel {...p} /> },
  { id: "spotHedge", title: "Spot the Hedge", icon: "speaker", minutes: "~2 min",
    blurb: "Hear a sentence, then tap every hedge and filler you caught. Train your ear before you speak.",
    skills: ["clarity.direct", "fillers.fewer"],
    rules: ["Listen first: the words appear when it ends", "Tap the hedges and fillers, then Check", "Careful: “like” and “just” aren't always fillers"],
    fmt: (p) => `${p.score}/${p.max}`, Play: (p) => <SpotHedge {...p} /> },
  { id: "signpostSorter", title: "Signpost Sorter", icon: "structure", minutes: "~3 min",
    blurb: "A speech, shuffled. Rebuild it: claim, two points, conclusion. The signposts are your map.",
    skills: ["structure.signposts", "structure.conclusion"],
    rules: ["Drag each sentence into its lane (or arrows, then 1–4)", "Right first time: 2 stars. Fixed on the second try: 1", "Bonus star: spot the signpost word"],
    fmt: (p) => `${p.score}/${p.max}★`, Play: (p) => <SignpostSorter {...p} /> },
  { id: "evidenceSort", title: "Evidence or Anecdote", icon: "evidence", minutes: "~2 min",
    blurb: "Swipe each piece of support: hard evidence, a personal story, or no support at all.",
    skills: ["evidence.hard", "evidence.examples"],
    rules: ["Swipe or press ← anecdote, → hard evidence, ↓ not support", "Restating the claim isn't support", "Last cards: upgrade an anecdote to evidence"],
    fmt: (p) => `${p.score}/${p.max}`, Play: (p) => <EvidenceSort {...p} /> },
];
