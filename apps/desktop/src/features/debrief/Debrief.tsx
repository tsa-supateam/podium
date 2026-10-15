import { useEffect, useMemo, useRef, useState } from "react";
import { engine } from "../../lib/engine";
import type { Question, SessionBundle, Summary } from "../../lib/types";
import { useApp } from "../../stores/app";
import { startSession } from "../live/session";
import { GazeHeatmap, ScoreRing, Timeline, ZoneBars, scoreColor } from "./charts";

type Tab = "overview" | "timeline" | "gaze" | "transcript" | "qa";
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

  const sub: [string, number | null, string][] = [
    ["Pacing", s.scores.pacing, `${Math.round(s.pacing.meanWpm)} WPM avg`],
    ["Fillers", s.scores.fillers, `${s.fillers.perMinute.toFixed(1)} / min`],
    ["Vocal variety", s.scores.vocalVariety, `${s.voice.f0StdSt.toFixed(1)} st spread`],
    ["Eye contact", s.scores.eyeContact, s.gaze ? `${Math.round(s.gaze.audiencePct)}% audience` : "no camera"],
    ["Structure", s.scores.structure, `${s.structure.transitions.length} signposts`],
  ];

  return (
    <div className="page">
      <div className="row" style={{ marginBottom: 14 }}>
        <div>
          <h1>{s.title || "Debrief"}</h1>
          <div className="muted small">
            {fmt(s.durationSec)} · {s.wordCount} words · analyzed on-device in {s.analysisSec}s
          </div>
        </div>
        <span className="spacer" />
        <button className="btn" onClick={() => startSession(sid!).catch((e) => set({ toast: e.message }))}>▶ Replay</button>
        <button className="btn primary" onClick={() => go("setup")}>Practice again</button>
      </div>

      <div className="debrief-head">
        <ScoreRing score={s.scores.overall} grade={s.scores.grade} />
        <div className="grid" style={{ gap: 14 }}>
          <div className="subscores">
            {sub.map(([name, v, note]) => (
              <div className="subscore" key={name}>
                <span className="muted small">{name}</span>
                <b style={{ color: v == null ? "var(--faint)" : scoreColor(v) }}>{v ?? "–"}</b>
                <span className="muted small">{note}</span>
              </div>
            ))}
          </div>
          <div className="card row" style={{ alignItems: "flex-start" }}>
            <button className="btn primary" onClick={playVoice} disabled={!voiceUrl} style={{ whiteSpace: "nowrap" }}>
              {speaking ? "■ Stop" : "🔊 Play debrief"}
            </button>
            <p style={{ margin: 0 }}>{s.debrief.text}</p>
            {voiceUrl && <audio ref={voiceRef} src={voiceUrl} onEnded={() => setSpeaking(false)} />}
          </div>
        </div>
      </div>

      <div className="tabs">
        {([["overview", "Overview"], ["timeline", "Timeline"], ["gaze", "Eye contact"], ["transcript", "Transcript"], ["qa", "Q&A practice"]] as [Tab, string][]).map(
          ([k, label]) => (
            <button key={k} className={tab === k ? "active" : ""} onClick={() => setTab(k)}>
              {label}
            </button>
          ),
        )}
      </div>

      <div className="two-col" style={{ gridTemplateColumns: tab === "timeline" ? "1fr" : undefined }}>
        <div className="grid" style={{ alignContent: "start" }}>
          {tab === "overview" && <Overview s={s} onSeek={seek} />}
          {tab === "timeline" && (
            <div className="card">
              <Timeline s={s} current={now} onSeek={seek} />
            </div>
          )}
          {tab === "gaze" && <GazeTab s={s} />}
          {tab === "transcript" && <TranscriptTab bundle={bundle} now={now} onSeek={seek} />}
          {tab === "qa" && <QATab sid={sid!} questions={bundle.questions?.questions ?? []} files={bundle.files} />}
        </div>
        <div className="grid" style={{ alignContent: "start" }}>
          <div className="card flush">
            {mediaUrl?.kind === "video" ? (
              <video ref={mediaRef} className="media" src={mediaUrl.url} controls onTimeUpdate={(e) => setNow(e.currentTarget.currentTime)} style={{ transform: "scaleX(-1)" }} />
            ) : mediaUrl ? (
              <div style={{ padding: 14 }}>
                <audio ref={mediaRef} src={mediaUrl.url} controls style={{ width: "100%" }} onTimeUpdate={(e) => setNow(e.currentTarget.currentTime)} />
              </div>
            ) : (
              <div style={{ padding: 14 }} className="muted small">Loading recording…</div>
            )}
          </div>
          {tab !== "timeline" && (
            <div className="card">
              <h3 style={{ marginBottom: 10 }}>Key moments</h3>
              <Moments s={s} onSeek={seek} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Overview({ s, onSeek }: { s: Summary; onSeek: (t: number) => void }) {
  return (
    <>
      <div className="card">
        <h3 style={{ marginBottom: 10 }}>Your feedback</h3>
        <ul className="growth">
          {s.debrief.strengths.slice(0, 1).map((g: any) => (
            <li key={g.key} className="strength">{g.text}</li>
          ))}
          {s.debrief.growth.map((g) => (
            <li key={g.text} onClick={() => g.t != null && onSeek(g.t)} style={{ cursor: g.t != null ? "pointer" : undefined }}>
              {g.text} {g.t != null && <span className="muted small">▶ {fmt(g.t)}</span>}
            </li>
          ))}
          {s.debrief.drill && <li>{s.debrief.drill}</li>}
        </ul>
      </div>
      <div className="grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div className="card">
          <h3 style={{ marginBottom: 10 }}>Pacing</h3>
          <div className="kv">
            <span>Average / median</span><span>{s.pacing.meanWpm} / {s.pacing.medianWpm} WPM</span>
            <span>Articulation rate</span><span>{s.pacing.articulationRate} WPM</span>
            <span>Variation (CV)</span><span>{s.pacing.cv}</span>
            <span>Jitter (nPVI)</span><span>{s.pacing.npvi}</span>
            <span>Pause ratio</span><span>{Math.round(s.pacing.pauseRatio * 100)}%</span>
            <span>Long pauses (&gt;2 s)</span><span>{s.pacing.longPauses.length}</span>
          </div>
        </div>
        <div className="card">
          <h3 style={{ marginBottom: 10 }}>Fillers &amp; voice</h3>
          <div className="kv">
            {Object.entries(s.fillers.byToken).flatMap(([k, v]) => [<span key={`${k}-k`}>“{k}”</span>, <span key={`${k}-v`}>{v}</span>])}
            <span>Burstiness</span><span>{s.fillers.burstiness}</span>
            <span>Median pitch</span><span>{s.voice.f0MedianHz} Hz</span>
            <span>Pitch spread</span><span>{s.voice.f0StdSt} st</span>
            <span>Loudness spread</span><span>{s.voice.rmsDbStd} dB</span>
          </div>
        </div>
      </div>
    </>
  );
}

function Moments({ s, onSeek }: { s: Summary; onSeek: (t: number) => void }) {
  const label: Record<string, string> = { filler_cluster: "Filler burst", monotone: "Monotone stretch", rush: "Rushing", notes_stare: "Long look at notes" };
  if (!s.highlights.length) return <p className="muted small">Nothing stood out. Nice and steady.</p>;
  return (
    <div className="grid" style={{ gap: 6 }}>
      {s.highlights.slice(0, 8).map((h, i) => (
        <button key={i} className="btn ghost row" style={{ justifyContent: "space-between" }} onClick={() => onSeek(h.t)}>
          <span>{label[h.kind] ?? h.kind}</span>
          <span className="mono muted">▶ {fmt(h.t)}</span>
        </button>
      ))}
    </div>
  );
}

function GazeTab({ s }: { s: Summary }) {
  const g = s.gaze;
  if (!g) return <div className="card muted">No camera data was recorded for this session.</div>;
  return (
    <>
      <div className="card">
        <h3 style={{ marginBottom: 10 }}>Gaze heatmap</h3>
        <GazeHeatmap g={g} />
        <p className="muted small">Where your gaze landed (your left is on the left), with the zone boundaries overlaid.</p>
      </div>
      <div className="card grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <ZoneBars pct={g.zonePct} />
        <div className="kv">
          <span>Audience eye contact</span><span>{g.audiencePct}%</span>
          <span>Spread across the room</span><span>{Math.round(g.balanceEntropy * 100)}%</span>
          <span>Longest look at notes</span><span>{g.longestNotesStareSec}s</span>
          <span>Notes stares &gt; 5 s</span><span>{g.notesStares.length}</span>
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
        <span className="muted small">Fillers highlighted · click any word to play from there</span>
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

function QATab({ sid, questions, files }: { sid: string; questions: Question[]; files: string[] }) {
  const [playing, setPlaying] = useState<number | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const play = async (i: number) => {
    audio.current?.pause();
    if (playing === i) return setPlaying(null);
    const name = `question_${i}.wav`;
    if (!files.includes(name)) return;
    const url = await engine.fileUrl(sid, name, "audio/wav");
    audio.current = new Audio(url);
    audio.current.onended = () => setPlaying(null);
    void audio.current.play();
    setPlaying(i);
  };
  const KIND: Record<string, string> = { statistic: "Evidence", proposal: "Risk", causal: "Cause & effect", claim: "Support", comparison: "Comparison", under_explained: "Depth", definition: "Clarity", general: "General" };
  return (
    <div className="card">
      <h3 style={{ marginBottom: 6 }}>Follow-up questions a judge might ask</h3>
      <p className="muted small" style={{ marginTop: 0 }}>
        Generated from your own transcript with keyphrase extraction and rule templates. No AI chatbot, no internet.
        Play each one and answer out loud.
      </p>
      <div className="qa">
        {questions.map((q, i) => (
          <div className="card q" key={i} style={{ background: "var(--panel-2)" }}>
            <button className="btn" onClick={() => void play(i)} disabled={!files.includes(`question_${i}.wav`)}>
              {playing === i ? "■" : "🔊"}
            </button>
            <div>
              <div className="kind">{KIND[q.kind] ?? q.kind}</div>
              <div>{q.question}</div>
            </div>
            {q.t != null && <span className="mono muted small">{fmt(q.t)}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
