import { useEffect, useMemo, useRef, useState } from "react";
import { engine } from "../../lib/engine";
import type { AnswerBundle, DebriefItem, SessionBundle, SessionRow, Summary } from "../../lib/types";
import { useApp } from "../../stores/app";
import { CONTENT_PARTS, DELIVERY_METRICS, OVERALL_HOW, TOP_METRICS, clusteringWord, coachLevel, firstSentence, speedChangeWord, steadinessWord, strengthLine, stripDrillLabel, voiceWord } from "../../lib/metrics";
import { keyMoments } from "../../lib/moments";
import { EngagementChart, GazeHeatmap, ScoreRing, Timeline, ZoneBars, engagementHeadline, scoreColor } from "./charts";

type Tab = "overview" | "timeline" | "gaze" | "transcript";
const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

export default function Debrief() {
  const { bundle, go, set } = useApp();
  const [tab, setTab] = useState<Tab>("overview");
  const [mediaUrl, setMediaUrl] = useState<{ url: string; kind: "video" | "audio" } | null>(null);
  const [now, setNow] = useState(0);
  const mediaRef = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  const voiceRef = useRef<HTMLAudioElement>(null);
  const [voiceUrl, setVoiceUrl] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);

  const s = bundle?.summary;
  const sid = bundle?.sessionId;

  useEffect(() => {
    if (!sid || !bundle) return;
    const hasVideo = bundle.files.includes("video.webm");
    (hasVideo ? engine.fileUrl(sid, "video.webm", "video/webm") : engine.fileUrl(sid, "audio.wav", "audio/wav"))
      .then((url) => setMediaUrl({ url, kind: hasVideo ? "video" : "audio" }))
      .catch(() => {});
    if (bundle.files.includes("debrief.wav")) engine.fileUrl(sid, "debrief.wav", "audio/wav").then(setVoiceUrl).catch(() => {});
  }, [sid, bundle]);

  // Refresh once if the video upload finished after the analysis did.
  useEffect(() => {
    if (!sid || !bundle || bundle.files.includes("video.webm") || bundle.session?.mode === "replay") return;
    const id = setTimeout(async () => {
      const b = await engine.request<SessionBundle>("session.get", { sessionId: sid });
      if (b.files.includes("video.webm")) set({ bundle: b });
    }, 2500);
    return () => clearTimeout(id);
  }, [sid, bundle, set]);

  if (!bundle || !s) {
    return (
      <div className="center-card">
        <h2>No analysis yet</h2>
        <button className="btn" onClick={() => sid && engine.request("session.analyze", { sessionId: sid }).then(() => go("analyzing"))}>
          Analyze now
        </button>
      </div>
    );
  }

  const seek = (t: number) => {
    const m = mediaRef.current;
    if (!m) return;
    m.currentTime = Math.max(0, t - 0.5);
    void m.play();
  };

  const playVoice = () => {
    const a = voiceRef.current;
    if (!a) return;
    if (speaking) {
      a.pause();
      setSpeaking(false);
    } else {
      a.currentTime = 0;
      void a.play();
      setSpeaking(true);
    }
  };

  // Practice mode ("coach", the default) shows levels and encouragement; Assessment ("judge") shows raw scores.
  // Sessions recorded before the mode existed show scores.
  const coach = bundle.session?.difficulty === "coach";
  const tabs: [Tab, string][] = [
    ["overview", "Overview"],
    ["gaze", "Eye contact"],
    ["timeline", "Timeline"],
    ["transcript", "Transcript"],
  ];

  return (
    <div className="page debrief">
      <div className="row debrief-title">
        <div>
          <h1>{s.title || "Debrief"}</h1>
          <div className="muted small">
            {fmt(s.durationSec)} · {s.wordCount} words
          </div>
        </div>
        <span className="spacer" />
        <button className="btn primary" onClick={() => go("setup")}>Practice again</button>
      </div>

      {s.noSpeech && (
        <div className="card warn-card">
          <b>No speech detected.</b> <span className="muted">Check the mic meter on the setup screen and System Settings → Privacy &amp; Security → Microphone.</span>
        </div>
      )}

      <section className="hero-row">
        <div className="hero-score">
          {coach ? <CoachBadge score={s.scores.overall} /> : <ScoreRing score={s.scores.overall} grade={s.scores.grade} />}
          <Progress sessionId={sid!} overall={s.scores.overall} coach={coach} />
          <div className="chips chips-top">
            {TOP_METRICS.map((m) => {
              const v = s.scores[m.key];
              const lvl = v == null ? null : coachLevel(v);
              return (
                <div className="chip" key={m.key} title={m.what}>
                  <span className="chip-label">{m.short}</span>
                  {coach ? (
                    <b className="chip-word" style={{ color: lvl ? lvl.color : "var(--faint)" }}>{lvl ? lvl.word : "–"}</b>
                  ) : (
                    <b style={{ color: v == null ? "var(--faint)" : scoreColor(v) }}>{v ?? "–"}</b>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <div className="card flush hero-media">
          {mediaUrl?.kind === "video" ? (
            <video ref={mediaRef} className="media" src={mediaUrl.url} controls onTimeUpdate={(e) => setNow(e.currentTarget.currentTime)} />
          ) : mediaUrl ? (
            <div className="audio-only">
              <audio ref={mediaRef} src={mediaUrl.url} controls onTimeUpdate={(e) => setNow(e.currentTarget.currentTime)} />
            </div>
          ) : (
            <div className="audio-only muted small">Loading recording…</div>
          )}
        </div>
      </section>

      {s.engagement && s.engagement.series.t.length > 1 && (
        <EngagementSection e={s.engagement} duration={s.durationSec} current={now} onSeek={seek} />
      )}

      <FixNext s={s} coach={coach} onSeek={seek} onPlay={playVoice} speaking={speaking} canPlay={!!voiceUrl} />
      {voiceUrl && <audio ref={voiceRef} src={voiceUrl} onEnded={() => setSpeaking(false)} />}


      <div className="tabs">
        {tabs.map(([k, label]) => (
          <button key={k} className={tab === k ? "active" : ""} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>

      <div className="grid" style={{ alignContent: "start" }}>
        {tab === "overview" && (
          <>
            {s.overview && <ArgumentCard o={s.overview} onSeek={seek} />}
            <div className="side-by-side">
              {s.content && <ContentCard s={s} coach={coach} />}
              <DeliveryCard s={s} coach={coach} />
            </div>
            <AnswerFeedback s={s} coach={coach} answers={bundle.answers ?? []} />
            <Moments s={s} onSeek={seek} />
          </>
        )}
        {tab === "gaze" && <GazeTab s={s} />}
        {tab === "timeline" && (
          <div className="card">
            <Timeline s={s} current={now} onSeek={seek} />
          </div>
        )}
        {tab === "transcript" && <TranscriptTab bundle={bundle} now={now} onSeek={seek} />}
      </div>

      <DetailedStats s={s} />
    </div>
  );
}

function TimeChip({ t, onSeek }: { t: number | null; onSeek: (t: number) => void }) {
  if (t == null) return null;
  return (
    <button className="ts-chip" onClick={() => onSeek(t)} title="Play from here">
      ▶ {fmt(t)}
    </button>
  );
}

function EngagementSection({ e, duration, current, onSeek }: {
  e: NonNullable<Summary["engagement"]>;
  duration: number;
  current: number;
  onSeek: (t: number) => void;
}) {
  const dips = e.dips ?? [];
  return (
    <section className="card engagement-card">
      <div className="row eng-head">
        <h3>Audience engagement</h3>
        <span className="muted small eng-headline">{engagementHeadline(e)}</span>
      </div>
      <EngagementChart e={e} duration={duration} current={current} onSeek={onSeek} />
      {(dips.length > 0 || e.peak) && (
        <div className="eng-rows">
          {dips.map((d, i) => (
            <button key={i} className="eng-row" onClick={() => onSeek(d.t0)} title={d.said ? `You said: “${d.said}”` : undefined}>
              <span className="eng-num">{i + 1}</span>
              <span className="eng-line">{d.line}</span>
              <span className="mono muted">▶ {fmt(d.t)}</span>
            </button>
          ))}
          {e.peak && (
            <button className="eng-row good" onClick={() => onSeek(e.peak!.t0)}>
              <span className="eng-num">★</span>
              <span className="eng-line">{e.peak.line}</span>
              <span className="mono muted">▶ {fmt(e.peak.t0)}</span>
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function CoachBadge({ score }: { score: number }) {
  const lvl = coachLevel(score);
  return (
    <div className="coach-badge">
      <div className="stars" aria-label={`${lvl.stars} of 5 stars`}>
        {"★★★★★".slice(0, lvl.stars)}
        <span className="stars-off">{"★★★★★".slice(lvl.stars)}</span>
      </div>
      <b style={{ color: lvl.color }}>{lvl.word}</b>
      <span className="muted small">Practice mode</span>
    </div>
  );
}

/** Compare with the previous analyzed run. Coach mode only mentions improvements. */
function Progress({ sessionId, overall, coach }: { sessionId: string; overall: number; coach: boolean }) {
  const [prev, setPrev] = useState<{ overall: number; best: number } | null>(null);
  useEffect(() => {
    engine
      .request<SessionRow[]>("sessions.list", { limit: 100 })
      .then((rows) => {
        const i = rows.findIndex((r) => r.sessionId === sessionId);
        const older = rows.slice(i + 1).filter((r) => r.overall != null && r.mode === "practice");
        if (older.length) setPrev({ overall: older[0].overall!, best: Math.max(...older.map((r) => r.overall!)) });
      })
      .catch(() => {});
  }, [sessionId]);
  if (!prev) return null;
  const delta = overall - prev.overall;
  if (overall > prev.best) return <span className="progress-note good">🏆 Personal best!</span>;
  if (delta > 0) return <span className="progress-note good">↑ {coach ? "Better" : `+${delta}`} than last run</span>;
  if (coach) return null;
  return <span className="progress-note">{delta === 0 ? "Same as last run" : `${delta} vs last run`}</span>;
}

function FixNext({ s, coach, onSeek, onPlay, speaking, canPlay }: {
  s: Summary;
  coach: boolean;
  onSeek: (t: number) => void;
  onPlay: () => void;
  speaking: boolean;
  canPlay: boolean;
}) {
  // Older sessions: up to 2 items in `growth`, one shared drill, no `more`.
  const all = [...s.debrief.growth, ...(s.debrief.more ?? [])];
  const headline = all.slice(0, 2);
  const smaller = all.slice(2);
  const drillOf = (g: DebriefItem, i: number) => g.drill ?? (i === 0 ? s.debrief.drill : null);
  const strength = s.debrief.strengths[0];
  return (
    <section className="card fix-next">
      {coach && strength && <p className="fix-win">✓ {strengthLine(strength.metric, s, strength.text)}</p>}
      <div className="row fix-head">
        <h3>{coach ? "Next time, try this" : headline.length > 1 ? "Fix these next" : "Fix this next"}</h3>
        <span className="spacer" />
        <button className="icon-btn" onClick={onPlay} disabled={!canPlay} title="Spoken debrief">
          {speaking ? "■ Stop" : "🔊 Play"}
        </button>
      </div>
      {headline.length === 0 && (
        <p className="fix-main">{s.noSpeech ? "Get your mic working, then run again." : "Nothing major. Keep practicing."}</p>
      )}
      <ol className="fix-list">
        {headline.map((g, i) => {
          const drill = drillOf(g, i);
          return (
            <li key={g.key + g.text}>
              <p className="fix-main">
                {firstSentence(g.text)} <TimeChip t={g.t} onSeek={onSeek} />
              </p>
              {drill && (
                <p className="fix-try">
                  <span className="try-label">Try:</span> {stripDrillLabel(drill)}
                </p>
              )}
            </li>
          );
        })}
      </ol>
      {!coach && strength && <p className="fix-strength">✓ {strengthLine(strength.metric, s, strength.text)}</p>}
      {smaller.length > 0 && (
        <details className="fix-more">
          <summary>+{smaller.length} smaller {smaller.length === 1 ? "tip" : "tips"}</summary>
          <ul>
            {smaller.map((g) => (
              <li key={g.key + g.text}>
                {g.text} <TimeChip t={g.t} onSeek={onSeek} />
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function Moments({ s, onSeek }: { s: Summary; onSeek: (t: number) => void }) {
  const moments = keyMoments(s);
  if (!moments.length) return <p className="muted">No key moments. Nice and steady.</p>;
  return (
    <div className="moments">
      {moments.map((m, i) => (
        <button key={i} className={`moment ${m.good ? "good" : ""}`} onClick={() => onSeek(m.t)}>
          <span>{m.good ? "★ " : ""}{m.label}</span>
          <span className="mono muted">▶ {fmt(m.t)}</span>
        </button>
      ))}
    </div>
  );
}

function DetailedStats({ s }: { s: Summary }) {
  return (
    <details className="card detailed-stats">
      <summary>Detailed stats</summary>
      <div className="stats-grid">
        <div>
          <h3>Speaking speed</h3>
          <div className="kv">
            <span>Average</span><span>{Math.round(s.pacing.meanWpm)} words/min</span>
            <span>Target</span><span>{(s.pacing.band ?? [130, 170]).join("–")} words/min</span>
            <span>While talking</span><span>{Math.round(s.pacing.articulationRate)} words/min</span>
            <span>Speed changes</span><span>{speedChangeWord(s.pacing.cv)}</span>
            <span>Rhythm</span><span>{steadinessWord(s.pacing.npvi)}</span>
            <span>Time pausing</span><span>{Math.round(s.pacing.pauseRatio * 100)}%</span>
            <span>Pauses &gt; 2 s</span><span>{s.pacing.longPauses.length}</span>
          </div>
        </div>
        <div>
          <h3>Fillers &amp; voice</h3>
          <div className="kv">
            {Object.entries(s.fillers.byToken).flatMap(([k, v]) => [<span key={`${k}-k`}>“{k}”</span>, <span key={`${k}-v`}>{v}×</span>])}
            <span>Per minute</span><span>{s.fillers.perMinute.toFixed(1)}</span>
            <span>Pattern</span><span>{clusteringWord(s.fillers.burstiness, s.fillers.total)}</span>
            <span>Burstiness</span><span>{s.fillers.burstiness}</span>
            <span>Pitch movement</span><span>{voiceWord(s.voice.f0StdSt)} ({s.voice.f0StdSt} st)</span>
            <span>Volume changes</span><span>{s.voice.rmsDbStd} dB</span>
            <span>Typical pitch</span><span>{Math.round(s.voice.f0MedianHz)} Hz</span>
          </div>
        </div>
      </div>
      <h3 style={{ marginTop: 18 }}>How it's scored</h3>
      <p className="muted small" style={{ marginTop: 0 }}>{OVERALL_HOW}</p>
      <div className="how-grid">
        {[...TOP_METRICS, ...DELIVERY_METRICS].map((m) => (
          <div key={m.key}>
            <b>
              {m.title} · {s.scores[m.key] ?? "–"}/100
            </b>
            <ul>
              {m.how.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </details>
  );
}

function GazeTab({ s }: { s: Summary }) {
  const g = s.gaze;
  if (!g) return <div className="card muted">No camera data was recorded for this session.</div>;
  const notes = g.notesMode ?? true;
  return (
    <>
      <div className="card">
        <h3 style={{ marginBottom: 10 }}>Where you looked</h3>
        <GazeHeatmap g={g} />
        {!notes && <p className="muted small" style={{ marginBottom: 0 }}>No-notes run: looking down counts as looking away.</p>}
      </div>
      <div className="card grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <ZoneBars pct={g.zonePct} notes={notes} camera={g.mode === "camera"} />
        <div className="kv">
          <span>{g.mode === "camera" ? "Looking at camera" : "On audience"}</span><span>{g.audiencePct}%</span>
          {g.mode !== "camera" && <><span>Spread across room</span><span>{Math.round(g.balanceEntropy * 100)}%</span></>}
          <span>{notes ? "Longest notes look" : "Longest look down"}</span><span>{g.longestNotesStareSec}s</span>
          <span>{notes ? "Notes looks > 5 s" : "Looks down > 2.5 s"}</span><span>{g.notesStares.length}</span>
          <span>Face visible</span><span>{Math.round(g.faceVisibleFrac * 100)}%</span>
        </div>
      </div>
    </>
  );
}

function TranscriptTab({ bundle, now, onSeek }: { bundle: SessionBundle; now: number; onSeek: (t: number) => void }) {
  const s = bundle.summary!;
  const words = bundle.transcript?.words ?? [];
  const fillerAt = useMemo(() => s.fillers.events.map((f) => [f.t0 - 0.05, f.t1 + 0.05]), [s]);
  const isFiller = (w: { t0: number; t1: number }) => fillerAt.some(([a, b]) => w.t0 >= a && w.t1 <= b);
  return (
    <div className="card">
      <div className="row" style={{ marginBottom: 10 }}>
        <h3>Transcript</h3>
        <span className="spacer" />
        <span className="muted small">Fillers in red · click a word to play</span>
      </div>
      <div className="transcript">
        {words.map((w, i) => (
          <span key={i}>
            <span
              className={`w ${isFiller(w) ? "filler" : ""} ${now >= w.t0 && now < w.t1 ? "now" : ""}`}
              onClick={() => onSeek(w.t0)}
            >
              {w.w}
            </span>{" "}
          </span>
        ))}
      </div>
      {(bundle.answers ?? []).map((a, i) => (
        <div key={a.sessionId} className="transcript-qa">
          <h3>Q&amp;A {i + 1}: {a.question}</h3>
          <p>{a.text || <span className="muted">No answer was heard.</span>}</p>
        </div>
      ))}
      {s.keyphrases.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <h3 style={{ marginBottom: 8 }}>Key phrases</h3>
          <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
            {s.keyphrases.map((k) => (
              <span key={k.phrase} className="tag" style={{ fontSize: 12 }}>{k.phrase} ×{k.count}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}


const SUPPORT_LABEL: Record<string, string> = {
  stat: "Statistic",
  source: "Source",
  story: "Personal story",
  example: "Example",
  hypothetical: "Hypothetical",
};

const DIMENSIONS: { key: "structure" | "evidence" | "commentary"; title: string; what: string }[] = [
  { key: "structure", title: "Structure", what: "Claim up front, signposted points, a conclusion that ties back" },
  { key: "evidence", title: "Evidence", what: "Stats and sources score highest; stories and examples alone top out at 3" },
  { key: "commentary", title: "Commentary", what: "Explaining how your evidence proves your point, why it matters, and answering the other side" },
];
const RATING = ["", "Missing", "Weak", "Developing", "Strong", "Excellent"];

function Rating({ score }: { score: number }) {
  const color = score >= 4 ? "var(--good)" : score === 3 ? "var(--accent)" : "var(--bad)";
  return (
    <span className="rating" aria-label={`${score} out of 5`}>
      <span className="rating-dots">
        {[1, 2, 3, 4, 5].map((i) => (
          <span key={i} className="dot" style={i <= score ? { background: color, borderColor: color } : undefined} />
        ))}
      </span>
      <b style={{ color }}>{score}/5</b>
      <span className="muted small">{RATING[score]}</span>
    </span>
  );
}

/** What the speech argued, then Structure / Evidence / Commentary rated 1-5 with feedback, then its outline. */
function ArgumentCard({ o, onSeek }: { o: NonNullable<Summary["overview"]>; onSeek: (t: number) => void }) {
  const ordinal = ["First", "Second", "Third", "Fourth", "Fifth", "Sixth"];
  const dims = o.dimensions;
  return (
    <section className="card argument-card">
      <h3>Overview</h3>
      {dims ? (
        <>
          <p className="argument-summary">{o.summary}</p>
          <div className="dimensions">
            {DIMENSIONS.map((d) => (
              <div className="dimension" key={d.key} title={d.what}>
                <div className="dim-head">
                  <span className="dim-title">{d.title}</span>
                  <Rating score={dims[d.key].score} />
                </div>
                <ul>
                  {dims[d.key].feedback.map((f, i) => <li key={i}>{f}</li>)}
                </ul>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="argument-text">
          {(o.lines?.length ? o.lines : [o.text]).map((l, i) => <p key={i}>{l}</p>)}
        </div>
      )}
      {(o.thesis || o.points.length > 0) && (
        <ol className="argument-outline">
          {o.thesis && (
            <li>
              <span className="ao-label">{o.persuasive ? "Claim" : "Main idea"}</span>
              <span className="ao-text">{o.thesis.text}</span>
              <TimeChip t={o.thesis.t} onSeek={onSeek} />
            </li>
          )}
          {o.points.map((p, i) => (
            <li key={i}>
              <span className="ao-label">{ordinal[i] ?? `#${i + 1}`} point</span>
              <span className="ao-text">
                {p.text}{" "}
                {p.support.length ? (
                  p.support.map((k) => (
                    <span key={k} className={`tag ${k === "stat" || k === "source" ? "good" : ""}`}>{SUPPORT_LABEL[k] ?? k}</span>
                  ))
                ) : (
                  <span className="tag bad">No support</span>
                )}
              </span>
              <TimeChip t={p.t} onSeek={onSeek} />
            </li>
          ))}
          <li>
            <span className="ao-label">Conclusion</span>
            <span className="ao-text">
              {o.concluded ? <span className="tag good">✓ Wrapped up</span> : <span className="tag bad">Missing</span>}
              {o.persuasive && (
                o.counterargument ? <span className="tag good">✓ Addressed the other side</span> : <span className="tag">Other side not addressed</span>
              )}
            </span>
          </li>
        </ol>
      )}
    </section>
  );
}

function Level({ v, coach }: { v: number | null | undefined; coach: boolean }) {
  if (v == null) return <b className="muted">–</b>;
  const lvl = coachLevel(v);
  return coach ? <b style={{ color: lvl.color }}>{lvl.word}</b> : <b style={{ color: scoreColor(v) }}>{v}</b>;
}

function contentDetail(key: string, part: any): string {
  switch (key) {
    case "relevance":
      return `${part.covered.length} of ${part.terms.length} key ideas` + (part.missing.length ? ` · missing ${part.missing.slice(0, 3).map((w: string) => `“${w}”`).join(", ")}` : "");
    case "evidence":
      return `${part.count} piece${part.count === 1 ? "" : "s"} of support` + (part.count && part.hard === false ? " · stories/examples only" : "");
    case "directness":
      return part.total ? `${part.total} hedges · ${part.top.map(([h, c]: [string, number]) => `“${h}” ×${c}`).join(", ")}` : "No hedging";
    case "clarity":
      return `Sentences average ${part.avgWords} words`;
    case "vocabulary":
      return part.overused.length ? `Over-used: ${part.overused.map(([w, c]: [string, number]) => `“${w}” ×${c}`).join(", ")}` : "Varied wording";
    case "takeaway":
      return part.found ? `“${part.sentence}”` : "No clear closing point";
    case "qa": {
      const on = part.answers.filter((a: any) => a.onTopic).length;
      return `${on} of ${part.answers.length} answer${part.answers.length === 1 ? "" : "s"} on topic`;
    }
    default:
      return "";
  }
}

function ContentCard({ s, coach }: { s: Summary; coach: boolean }) {
  const c = s.content!;
  return (
    <section className="card content-card">
      <div className="row eng-head">
        <h3>Content</h3>
        {c.prompt && <span className="muted small content-prompt">“{c.prompt}”</span>}
      </div>
      <div className="content-parts">
        {Object.entries(c.parts).map(([k, part]) => (
          <div className="content-part" key={k}>
            <span className="cp-name">{CONTENT_PARTS[k] ?? k}</span>
            <Level v={part.score} coach={coach} />
            <span className="cp-detail muted">{contentDetail(k, part)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Each Q&A answer, analyzed the same way as the speech: argument, content and delivery. */
function AnswerFeedback({ s, coach, answers }: { s: Summary; coach: boolean; answers: AnswerBundle[] }) {
  const [playing, setPlaying] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const play = async (id: string) => {
    audio.current?.pause();
    if (playing === id) return setPlaying(null);
    audio.current = new Audio(await engine.fileUrl(id, "audio.wav", "audio/wav"));
    audio.current.onended = () => setPlaying(null);
    void audio.current.play();
    setPlaying(id);
  };
  const qa = s.qaRound ?? [];
  if (!qa.length) return null;
  return (
    <section className="card answer-feedback">
      <h3>Answer feedback</h3>
      {qa.map((a, n) => {
        const has = answers.find((x) => x.sessionId === a.sessionId)?.files.includes("audio.wav");
        const silent = !a.words;
        return (
          <div className="answer-fb" key={a.sessionId}>
            <div className="afb-head">
              <span className="afb-num">Q{n + 1}</span>
              <span className="afb-q">{a.question}</span>
              <button className="icon-btn" onClick={() => void play(a.sessionId)} disabled={!has}>
                {playing === a.sessionId ? "■ Stop" : "▶ Listen"}
              </button>
            </div>
            <div className="afb-meta muted small">
              <span className={`tag ${a.onTopic ? "good" : "bad"}`}>{a.onTopic ? "✓ On topic" : "✗ Off topic"}</span>
              {Math.round(a.durationSec)} s · {a.words} words · {Math.round(a.wpm)} words/min · {a.fillers} filler{a.fillers === 1 ? "" : "s"}
            </div>
            {silent ? (
              <p className="muted">No answer was recorded.</p>
            ) : (
              <>
                <div className="afb-scores">
                  {a.content && (
                    <span className="afb-score"><span className="cp-name">Content</span><Level v={a.content.score} coach={coach} /></span>
                  )}
                  {a.scores && DELIVERY_METRICS.map((m) => (
                    <span className="afb-score" key={m.key}><span className="cp-name">{m.title}</span><Level v={a.scores![m.key]} coach={coach} /></span>
                  ))}
                </div>
                {a.dimensions && (
                  <div className="afb-dims">
                    {DIMENSIONS.map((d) => (
                      <span className="afb-dim" key={d.key} title={a.dimensions![d.key].feedback.join(" ")}>
                        <span className="dim-title">{d.title}</span>
                        <Rating score={a.dimensions![d.key].score} />
                      </span>
                    ))}
                  </div>
                )}
                {(a.strengths?.length || a.tips?.length) ? (
                  <ul className="afb-notes">
                    {a.strengths?.slice(0, 1).map((t, i) => <li key={`s${i}`} className="good-note">✓ {t}</li>)}
                    {a.tips?.map((t, i) => <li key={`t${i}`}>→ {t}</li>)}
                  </ul>
                ) : null}
              </>
            )}
          </div>
        );
      })}
    </section>
  );
}

function DeliveryCard({ s, coach }: { s: Summary; coach: boolean }) {
  return (
    <section className="card delivery-card">
      <h3>Delivery</h3>
      <div className="delivery-grid">
        {DELIVERY_METRICS.map((m) => (
          <div className="delivery-item" key={m.key} title={m.what}>
            <span className="cp-name">{m.title}</span>
            <Level v={s.scores[m.key]} coach={coach} />
            <span className="muted small">{m.measured(s)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
