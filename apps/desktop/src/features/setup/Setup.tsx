import { useEffect, useRef, useState } from "react";
import { cameraStream, startCamera, tracker } from "../../lib/camera";
import { listMics, micLevelDb, startMic } from "../../lib/mic";
import { CATEGORIES, randomPrompt } from "../../lib/prompts";
import { zoneNames } from "../../lib/types";
import { live, useApp, useTicker } from "../../stores/app";
import { startSession } from "../live/session";

export default function Setup() {
  const { settings, setSettings, go, calibrated, set } = useApp();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [camErr, setCamErr] = useState<string | null>(null);
  const [devices, setDevices] = useState<{ deviceId: string; label: string }[]>([]);
  const [micErr, setMicErr] = useState<string | null>(null);
  const deviceId = typeof settings.audioDevice === "string" ? settings.audioDevice : null;
  const [starting, setStarting] = useState(false);
  useTicker(8);

  useEffect(() => {
    startCamera()
      .then((s) => {
        if (videoRef.current) videoRef.current.srcObject = s;
      })
      .catch((e) => setCamErr(e.message ?? String(e)));
  }, []);

  useEffect(() => {
    setMicErr(null);
    startMic(deviceId)
      .then(() => listMics().then(setDevices))
      .catch((e) => setMicErr(e.message ?? String(e)));
  }, [deviceId]);

  // Track how long the mic has been at digital silence (a denied permission delivers exact zeros).
  const level = micLevelDb();
  const silentSince = useRef<number | null>(null);
  if (level > -95) silentSince.current = null;
  else if (silentSince.current == null) silentSince.current = performance.now();
  const micDead = silentSince.current != null && performance.now() - silentSince.current > 3000;

  const g = live.gaze;
  const faceOk = !!g?.face;
  const camOk = !!cameraStream();

  const begin = async () => {
    setStarting(true);
    try {
      await startSession(null);
    } catch (e) {
      set({ toast: `Could not start: ${(e as Error).message}` });
      setStarting(false);
    }
  };

  const camera = settings.gazeMode === "camera";
  return (
    <div className="page">
      <h1 style={{ marginBottom: 18 }}>Set up your practice run</h1>

      <PromptPicker />

      <div className="setup">
        <div className="grid" style={{ alignContent: "start" }}>
          <div className="preview">
            <video ref={videoRef} autoPlay muted playsInline />
            <div className="badge">
              <span className={`pill ${faceOk ? "ok" : "warn"}`}>
                <span className="dot" /> {faceOk ? `Face found · looking at ${zoneNames(settings.notes)[g!.zone]}` : "Looking for your face…"}
              </span>
            </div>
          </div>
          {camErr && <p style={{ color: "var(--bad)" }}>Camera unavailable: {camErr}. Eye contact will not be scored.</p>}
          <details className="card readout">
            <summary className="row" style={{ justifyContent: "space-between" }}>
              <span className="muted small">Gaze readout</span>
              <span className="muted small mono">
                {tracker.fps.toFixed(0)} fps · {tracker.inferMs.toFixed(1)} ms/frame
              </span>
            </summary>
            <div className="kv mono" style={{ marginTop: 10 }}>
              <span>Head yaw / pitch</span>
              <span>{g?.face ? `${g.yaw.toFixed(0)}° / ${g.pitch.toFixed(0)}°` : "–"}</span>
              <span>Gaze yaw / pitch (+ = your right / up)</span>
              <span>{g?.face ? `${g.gYaw.toFixed(0)}° / ${g.gPitch.toFixed(0)}°` : "–"}</span>
            </div>
            <label className="check small" style={{ marginTop: 10 }}>
              <input
                type="checkbox"
                checked={settings.flipYaw}
                onChange={(e) => {
                  setSettings({ flipYaw: e.target.checked });
                  tracker.flipYaw = e.target.checked;
                }}
              />
              Flip left/right (use if turning to your right shows a negative yaw)
            </label>
          </details>
          <div className="card">
            <h3 style={{ marginBottom: 10 }}>Checklist</h3>
            <ul className="checklist">
              <Check ok={camOk} label="Camera on" />
              <Check ok={faceOk} label="Face visible and well lit" />
              <Check ok={!micErr && !micDead && level > -95} label="Microphone picking up sound (say something)" />
              <Check ok={calibrated} label="Gaze calibrated (recommended)" />
            </ul>
          </div>
        </div>

        <div className="grid" style={{ alignContent: "start" }}>
          <div className="card grid">
            <Toggle
              label="Mode"
              value={settings.difficulty}
              options={[["coach", "Practice"], ["judge", "Assessment"]]}
              onChange={(v) => setSettings({ difficulty: v as "coach" | "judge" })}
              hint={settings.difficulty === "coach"
                ? "Live tips, a friendlier audience, and encouraging results."
                : "Test conditions: no tips, a strict audience, and scores out of 100."}
            />
            <Toggle
              label="Look at"
              value={settings.gazeMode}
              options={[["room", "Simulated audience"], ["camera", "Direct camera"]]}
              onChange={(v) => setSettings({ gazeMode: v as "room" | "camera" })}
              hint={camera
                ? "Like a video interview: eye contact means looking up at the camera."
                : "Like a room: sweep your eyes across the left, center and right of the audience."}
            />
            <Toggle
              label="Notes"
              value={settings.notes ? "yes" : "no"}
              options={[["yes", "Using notes or slides"], ["no", "No notes"]]}
              onChange={(v) => setSettings({ notes: v === "yes" })}
              hint={settings.notes
                ? "Glancing down at notes is expected. Looks over 5 s count against you."
                : "Looking down counts as looking away. Target: 85% eye contact."}
            />
            <div className="row">
              <div className="field" style={{ flex: 1 }}>
                <label>Target length (minutes)</label>
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={settings.targetMinutes ?? ""}
                  onChange={(e) => setSettings({ targetMinutes: e.target.value ? Number(e.target.value) : null })}
                />
              </div>
            </div>
            <div className="field">
              <label>Microphone</label>
              <select
                value={deviceId ?? ""}
                onChange={(e) => setSettings({ audioDevice: e.target.value === "" ? null : e.target.value })}
              >
                <option value="">System default</option>
                {devices.filter((d) => d.deviceId !== "default").map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label}
                  </option>
                ))}
              </select>
              <div className="meter" title={`${level.toFixed(0)} dBFS`}>
                <div style={{ width: `${Math.max(0, Math.min(100, (level + 70) * 1.6))}%` }} />
              </div>
              {micErr && <span className="small" style={{ color: "var(--bad)" }}>Microphone unavailable: {micErr}</span>}
              {!micErr && micDead && (
                <span className="small" style={{ color: "var(--bad)" }}>
                  No sound from this microphone. Pick another input, or check System Settings → Privacy &amp;
                  Security → Microphone.
                </span>
              )}
            </div>
            <label className="check">
              <input type="checkbox" checked={settings.recordVideo} onChange={(e) => setSettings({ recordVideo: e.target.checked })} />
              Save a video of this run for playback (stays on this computer)
            </label>
          </div>

          <div className="row">
            <button className="btn big" onClick={() => go("calibrate")} disabled={!faceOk}>
              {calibrated ? "Recalibrate" : camera ? "Calibrate gaze (6 s)" : "Calibrate gaze (12 s)"}
            </button>
            <span className="spacer" />
            <button className="btn primary big" onClick={begin} disabled={starting}>
              {starting ? "Starting…" : "Start speaking"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Toggle({ label, value, options, onChange, hint }: {
  label: string;
  value: string;
  options: [string, string][];
  onChange: (v: string) => void;
  hint: string;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <div className="segmented" role="radiogroup" aria-label={label}>
        {options.map(([v, text]) => (
          <button key={v} role="radio" aria-checked={value === v} className={value === v ? "on" : ""} onClick={() => onChange(v)}>
            {text}
          </button>
        ))}
      </div>
      <span className="muted small">{hint}</span>
    </div>
  );
}

function PromptPicker() {
  const { settings, setSettings } = useApp();
  const roll = () => setSettings({ prompt: randomPrompt(settings.promptCategory, settings.prompt).text });
  useEffect(() => {
    if (!settings.prompt) roll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <section className="card prompt-card">
      <div className="row prompt-head">
        <h3>Your topic</h3>
        <span className="spacer" />
        <select
          value={settings.promptCategory ?? ""}
          onChange={(e) => {
            const cat = e.target.value || null;
            setSettings({ promptCategory: cat, prompt: randomPrompt(cat).text });
          }}
          aria-label="Prompt category"
        >
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <button className="btn" onClick={roll} title="Pick another random prompt">🎲 New prompt</button>
      </div>
      <textarea
        className="prompt-input"
        value={settings.prompt}
        onChange={(e) => setSettings({ prompt: e.target.value })}
        placeholder="Type your own topic, or leave empty for free talk"
        rows={2}
      />
      <span className="muted small">
        {settings.prompt.trim()
          ? "Edit it or type your own. Your content is checked against this topic."
          : "Free talk: no topic, so content is judged on support, clarity and takeaway only."}{" "}
        {settings.prompt.trim() && (
          <button className="link-btn" onClick={() => setSettings({ prompt: "" })}>Free talk instead</button>
        )}
      </span>
    </section>
  );
}

function Check({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li>
      <span className={`ok-dot ${ok ? "ok" : "no"}`}>{ok ? "✓" : "•"}</span>
      <span className={ok ? "" : "muted"}>{label}</span>
    </li>
  );
}
