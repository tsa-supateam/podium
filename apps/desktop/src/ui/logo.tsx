// Podium mark: a chamfered octagon "P" whose counter is a lectern seen from the front.
// scripts/make-icons.mjs reads OUTER and COUNTER from this file to rasterize the app icon.
import { useEffect, useState } from "react";
import { reducedMotion } from "./motion";

export const OUTER = "10,14 18,6 46,6 54,14 54,32 46,40 24,40 24,52 18,58 10,58";
export const COUNTER = "24,14 46,14 46,19 40,19 38,32 32,32 30,19 24,19";
const FRAME = "19,1 45,1 63,19 63,45 45,63 19,63 1,45 1,19";
const FRAME_PTS = FRAME.split(" ").map((p) => p.split(",").map(Number));

const pathOf = (pts: string) => `M${pts.replace(/ /g, "L")}Z`;

export function LogoMark({ size = 28, title = "Podium" }: { size?: number; title?: string }) {
  return (
    <svg className="logo-mark" width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={title}>
      <path d={`${pathOf(OUTER)}${pathOf(COUNTER)}`} fill="var(--signal)" fillRule="evenodd" />
    </svg>
  );
}

export function LogoLockup({ size = 28 }: { size?: number }) {
  return (
    <span className="logo-lockup">
      <LogoMark size={size} />
      <span className="logo-words">
        <span className="logo-word">PODIUM</span>
        <span className="micro">SPEECH.LAB / v0.1</span>
      </span>
    </span>
  );
}

/** Cold-start sequence (~3.2s): frame draws, corners lock, fill wipes up, counter cuts, wordmark types. */
export function BootSplash() {
  const [show, setShow] = useState(() => {
    try {
      if (sessionStorage.getItem("podium.booted")) return false;
      sessionStorage.setItem("podium.booted", "1");
    } catch {
      /* storage unavailable: play it */
    }
    return !reducedMotion();
  });
  const [typed, setTyped] = useState(0);
  useEffect(() => {
    if (!show) return;
    const word = "PODIUM";
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const e = now - t0;
      setTyped(Math.max(0, Math.min(word.length, Math.floor((e - 1500) / 80))));
      if (e > 3200) return setShow(false);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const skip = () => setShow(false);
    window.addEventListener("keydown", skip);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", skip);
    };
  }, [show]);
  if (!show) return null;
  return (
    <div className="boot" onClick={() => setShow(false)} role="presentation">
      <svg className="boot-mark" width="132" height="132" viewBox="-4 -4 72 72" aria-hidden>
        <path className="boot-frame" d={pathOf(FRAME)} pathLength={1} />
        {FRAME_PTS.map(([x, y], i) => (
          <rect key={i} className="boot-corner" x={x - 2} y={y - 2} width={4} height={4} style={{ animationDelay: `${420 + i * 55}ms` }} />
        ))}
        <path className="boot-fill" d={pathOf(OUTER)} />
        <path className="boot-cut" d={pathOf(COUNTER)} />
      </svg>
      <div className="boot-word">
        {"PODIUM".slice(0, typed)}
        <span className="boot-cursor" />
      </div>
      <span className="micro boot-meta">SPEECH.LAB / v0.1 · CLICK TO SKIP</span>
    </div>
  );
}
