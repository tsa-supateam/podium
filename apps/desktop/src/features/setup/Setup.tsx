import { useEffect, useRef, useState } from "react";
import { cameraStream, startCamera, tracker } from "../../lib/camera";
import { engine } from "../../lib/engine";
import { ZONE_NAMES } from "../../lib/types";
import { live, useApp, useTicker } from "../../stores/app";
import { startSession } from "../live/session";

export default function Setup() {
  const { settings, setSettings, go, calibrated, set } = useApp();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [camErr, setCamErr] = useState<string | null>(null);
  const [devices, setDevices] = useState<{ index: number; name: string; default: boolean }[]>([]);
  const [starting, setStarting] = useState(false);
  useTicker(8);

  useEffect(() => {
    startCamera()
      .then((s) => {
        if (videoRef.current) videoRef.current.srcObject = s;
      })
      .catch((e) => setCamErr(e.message ?? String(e)));
    engine.request("devices.list").then(setDevices).catch(() => {});
  }, []);

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

  return (
    <div className="page">
      <h1 style={{ marginBottom: 18 }}>Set up your practice run</h1>
      <div className="setup">
        <div className="grid">
          <div className="preview">
            <video ref={videoRef} autoPlay muted playsInline />
            <div className="badge">
              <span className={`pill ${faceOk ? "ok" : "warn"}`}>
                <span className="dot" /> {faceOk ? `Face found · looking at ${ZONE_NAMES[g!.zone]}` : "Looking for your face…"}
              </span>
            </div>
          </div>
          {camErr && <p style={{ color: "var(--bad)" }}>Camera unavailable: {camErr}. Eye contact will not be scored.</p>}
          <div className="card">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <h3>Gaze readout</h3>
              <span className="muted small mono">
                {tracker.fps.toFixed(0)} fps · {tracker.inferMs.toFixed(1)} ms/frame
              </span>
            </div>
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
          </div>
        </div>

        <div className="grid" style={{ alignContent: "start" }}>
          <div className="card grid">
            <div className="field">
              <label>Title</label>
              <input value={settings.title} onChange={(e) => setSettings({ title: e.target.value })} />
            </div>
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
              <div className="field" style={{ flex: 1 }}>
                <label>Audience size</label>
                <select value={settings.audienceSize} onChange={(e) => setSettings({ audienceSize: Number(e.target.value) })}>
                  {[9, 12, 15, 18].map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="field">
              <label>Microphone</label>
              <select
                value={settings.audioDevice ?? ""}
                onChange={(e) => setSettings({ audioDevice: e.target.value === "" ? null : Number(e.target.value) })}
              >
                <option value="">System default</option>
                {devices.map((d) => (
                  <option key={d.index} value={d.index}>
                    {d.name}
                    {d.default ? " (default)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <label className="check">
              <input type="checkbox" checked={settings.recordVideo} onChange={(e) => setSettings({ recordVideo: e.target.checked })} />
              Save a video of this run for playback (stays on this computer)
            </label>
          </div>

          <div className="card">
            <h3 style={{ marginBottom: 10 }}>Checklist</h3>
            <ul className="checklist">
              <Check ok={camOk} label="Camera on" />
              <Check ok={faceOk} label="Face visible and well lit" />
              <Check ok={calibrated} label="Gaze calibrated for this room (recommended)" />
            </ul>
          </div>

          <div className="row">
            <button className="btn big" onClick={() => go("calibrate")} disabled={!faceOk}>
              {calibrated ? "Recalibrate" : "Calibrate gaze (12 s)"}
            </button>
            <span className="spacer" />
            <button className="btn primary big" onClick={begin} disabled={starting}>
              {starting ? "Starting…" : "Start speaking"}
            </button>
          </div>
          {!calibrated && (
            <p className="muted small">
              Without calibration, Podium uses default angles: 12° left or right of center counts as the side
              audience, and looking down 15° counts as notes.
            </p>
          )}
        </div>
      </div>
    </div>
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
