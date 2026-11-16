// 4-point gaze calibration (spec §4.3.3): fit one Gaussian per zone in (yaw, pitch) space.
import { useEffect, useMemo, useRef, useState } from "react";
import { tracker } from "../../lib/camera";
import { fitZoneModel, gazeAngles, irisReliability, type ZoneModel } from "../../lib/gaze";
import type { RawGaze } from "../../lib/faceTracker";
import { live, useApp } from "../../stores/app";
import { Icon } from "../../ui/icons";
import { Stepper } from "../../ui/kit";

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
  // Without notes there is no notes target: the downward zone keeps its default position.
  // Direct camera: only "at the lens" (and "down" with notes). No notes: no notes target.
  const steps = useMemo(() => {
    const base = settings.gazeMode === "camera"
      ? STEPS.filter((st) => st.zone === "C" || st.zone === "N").map((st) =>
          st.zone === "C" ? { ...st, label: "Camera", hint: "Look straight into the camera lens.", y: "6%" } : st)
      : STEPS;
    return settings.notes ? base : base.filter((st) => st.zone !== "N");
  }, [settings.notes, settings.gazeMode]);
  const [step, setStep] = useState(-1);
  const [progress, setProgress] = useState(0);
  const samples = useRef<Record<Z, RawGaze[]>>({ L: [], C: [], R: [], N: [] });

  useEffect(() => {
    const prev = tracker.onRaw;
    let current: Z | null = null;
    let collecting = false;
    tracker.onRaw = (r: RawGaze) => {
      prev(r);
      // Keep raw readings: blink cut-off and iris weight are set from them once calibration ends.
      if (collecting && current && r.face) samples.current[current].push({ ...r, landmarks: undefined });
    };
    let cancelled = false;
    (async () => {
      await sleep(1200);
      for (let i = 0; i < steps.length && !cancelled; i++) {
        setStep(i);
        current = steps[i].zone;
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
      setStep(steps.length);
      // Glasses: lenses lower the measured eye openness and glare makes the iris jumpy, so the
      // blink cut-off follows this person's eyes and the iris counts less when it is noisy.
      const { gains, minOpen, glasses } = irisReliability(samples.current);
      const pts = Object.fromEntries(Object.entries(samples.current).map(([z, rs]) => [
        z, rs.filter((r) => r.openness >= minOpen).map((r) => {
          const g = gazeAngles(r, r, gains, settings.flipYaw);
          return [g.gYaw, g.gPitch] as [number, number];
        }),
      ])) as Record<Z, [number, number][]>;
      const model: ZoneModel = fitZoneModel(pts);
      const ok = steps.every((st) => pts[st.zone].length >= 10);
      if (ok) {
        tracker.model = model;
        tracker.gains = gains;
        set({ zoneModel: model, gains, calibrated: true,
          toast: glasses ? "Gaze calibrated. Your eyes were hard to read (glasses?), so head direction counts more." : "Gaze calibrated for this room" });
      } else {
        set({ toast: "Calibration needs your face to stay visible. Please try again." });
      }
      await sleep(700);
      go("setup");
    })();
    return () => {
      cancelled = true;
      tracker.onRaw = prev;
    };
  }, [go, set, settings.flipYaw, steps]);

  const cur = steps[step];
  const g = live.gaze;
  const coord = (v: string) => String(Math.round(parseFloat(v) * 10)).padStart(4, "0");
  return (
    <div className="calib">
      {steps.map((s, i) => (
        <div
          key={s.zone}
          className={`calib-target ${i === step ? "active" : ""} ${i === step && progress > 0.05 ? "locked" : ""} ${i < step ? "done" : ""}`}
          style={{ left: s.x, top: s.y }}
        >
          <svg viewBox="0 0 140 140" aria-hidden>
            <g className="ret" fill="none" stroke="currentColor" strokeWidth="1.5">
              <g className="ret-ring"><circle cx="70" cy="70" r="46" strokeDasharray="3 7" /></g>
              <circle cx="70" cy="70" r="30" />
              <path d="M70 6v34M70 100v34M6 70h34M100 70h34" />
              <path d="M24 24h10M24 24v10M116 24h-10M116 24v10M24 116h10M24 116v-10M116 116h-10M116 116v-10" />
              {i === step && <circle cx="70" cy="70" r="30" stroke="var(--signal)" strokeWidth="3" pathLength={1} strokeDasharray="1" strokeDashoffset={1 - progress} transform="rotate(-90 70 70)" />}
            </g>
          </svg>
          {i < step ? <Icon name="check" size={22} /> : <span style={{ width: 6, height: 6, background: "currentColor" }} />}
          <span className="calib-label micro">
            <b>{s.label}</b>
            X {coord(s.x)} Y {coord(s.y)}
          </span>
        </div>
      ))}
      <div className="calib-panel grid">
        <h2>{step < 0 ? "Gaze calibration" : step >= steps.length ? "Done!" : `Look: ${cur.label}`}</h2>
        <p className="muted">
          {step < 0
            ? "Stand where you will speak. Follow each highlighted target with your eyes and head, the way you would naturally."
            : step >= steps.length
              ? "Saving your room layout…"
              : cur.hint}
        </p>
        {step >= 0 && step < steps.length && (
          <div className="progress">
            {Array.from({ length: 32 }, (_, i) => <i key={i} className={i < Math.round(progress * 32) ? "on" : ""} />)}
          </div>
        )}
        <div className="row" style={{ justifyContent: "center" }}>
          <Stepper index={Math.max(0, Math.min(step, steps.length - 1))} total={steps.length} label="TARGET" />
        </div>
        <span className="micro">
          {g?.face ? `GAZE X ${g.gYaw.toFixed(1).padStart(6, " ")}° Y ${g.gPitch.toFixed(1).padStart(6, " ")}°` : "NO FACE / HOLD STILL"}
        </span>
        <button className="btn ghost" onClick={() => go("setup")}>
          Cancel
        </button>
      </div>
    </div>
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
