// 4-point gaze calibration (spec §4.3.3): fit one Gaussian per zone in (yaw, pitch) space.
import { useEffect, useRef, useState } from "react";
import { tracker } from "../../lib/camera";
import { fitZoneModel, gazeAngles, DEFAULT_GAINS, type ZoneModel } from "../../lib/gaze";
import type { RawGaze } from "../../lib/faceTracker";
import { useApp } from "../../stores/app";

type Z = "L" | "C" | "R" | "N";
const STEPS: { zone: Z; label: string; hint: string; x: string; y: string }[] = [
  { zone: "C", label: "Center", hint: "Look straight at the middle of your audience, just above the screen.", x: "50%", y: "22%" },
  { zone: "L", label: "Left", hint: "Turn and look at the LEFT side of your audience, as you would while speaking.", x: "10%", y: "30%" },
  { zone: "R", label: "Right", hint: "Now look at the RIGHT side of your audience.", x: "90%", y: "30%" },
  { zone: "N", label: "Notes", hint: "Look down at your notes or laptop screen.", x: "50%", y: "85%" },
];
const DWELL_MS = 2500;
const SETTLE_MS = 700;

export default function Calibration() {
  const { set, go, settings } = useApp();
  const [step, setStep] = useState(-1);
  const [progress, setProgress] = useState(0);
  const samples = useRef<Record<Z, [number, number][]>>({ L: [], C: [], R: [], N: [] });

  useEffect(() => {
    const prev = tracker.onRaw;
    let current: Z | null = null;
    let collecting = false;
    tracker.onRaw = (r: RawGaze) => {
      prev(r);
      if (!collecting || !current || !r.face || r.openness < 0.12) return;
      const g = gazeAngles(r, r, DEFAULT_GAINS, settings.flipYaw);
      samples.current[current].push([g.gYaw, g.gPitch]);
    };
    let cancelled = false;
    (async () => {
      await sleep(1200);
      for (let i = 0; i < STEPS.length && !cancelled; i++) {
        setStep(i);
        current = STEPS[i].zone;
        await sleep(SETTLE_MS);
        collecting = true;
        const t0 = performance.now();
        while (performance.now() - t0 < DWELL_MS && !cancelled) {
          setProgress((performance.now() - t0) / DWELL_MS);
          await sleep(50);
        }
        collecting = false;
        setProgress(1);
      }
      if (cancelled) return;
      setStep(STEPS.length);
      const model: ZoneModel = fitZoneModel(samples.current);
      const ok = (Object.keys(samples.current) as Z[]).every((z) => samples.current[z].length >= 10);
      if (ok) {
        tracker.model = model;
        set({ zoneModel: model, calibrated: true, toast: "Gaze calibrated for this room" });
      } else {
        set({ toast: "Calibration needs your face to stay visible. Using default angles." });
      }
      await sleep(700);
      go("setup");
    })();
    return () => {
      cancelled = true;
      tracker.onRaw = prev;
    };
  }, [go, set, settings.flipYaw]);

  const cur = STEPS[step];
  return (
    <div className="calib">
      {STEPS.map((s, i) => (
        <div
          key={s.zone}
          className={`calib-target ${i === step ? "active" : ""} ${i < step ? "done" : ""}`}
          style={{ left: s.x, top: s.y }}
        >
          {i < step ? "✓" : s.label}
        </div>
      ))}
      <div className="calib-panel grid">
        <h2>{step < 0 ? "Gaze calibration" : step >= STEPS.length ? "Done!" : `Look: ${cur.label}`}</h2>
        <p className="muted">
          {step < 0
            ? "Stand where you will speak. Follow each highlighted target with your eyes and head, the way you would naturally."
            : step >= STEPS.length
              ? "Saving your room layout…"
              : cur.hint}
        </p>
        {step >= 0 && step < STEPS.length && (
          <div className="progress">
            <div style={{ width: `${progress * 100}%` }} />
          </div>
        )}
        <button className="btn ghost" onClick={() => go("setup")}>
          Cancel
        </button>
      </div>
    </div>
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
