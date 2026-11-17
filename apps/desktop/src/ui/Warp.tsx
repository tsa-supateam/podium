// Particle warp: the page breaks into sparks that stream upward, so moving Home → Learn by
// scrolling reads as one continuous motion and it's obvious the screen changed.
import { useEffect, useRef } from "react";

const DURATION = 950;

export default function Warp({ onDone }: { onDone: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current!;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(2, devicePixelRatio || 1);
    const W = (cv.width = innerWidth * dpr), H = (cv.height = innerHeight * dpr);
    const ctx = cv.getContext("2d")!;
    const css = getComputedStyle(document.documentElement);
    const colors = ["--signal", "--paper", "--concrete"].map((t) => css.getPropertyValue(t).trim() || "#ff5a36");
    const N = reduce ? 0 : 520;
    const ps = Array.from({ length: N }, () => ({
      x: Math.random() * W,
      y: Math.random() * H * 1.1,
      v: (0.6 + Math.random() * 2.4) * dpr, // base speed
      s: (0.6 + Math.random() * 1.6) * dpr, // size
      c: colors[Math.random() < 0.55 ? 0 : Math.random() < 0.7 ? 1 : 2],
      d: Math.random() * 0.35, // start delay (fraction)
    }));
    const t0 = performance.now();
    let raf = 0;
    const frame = (now: number) => {
      const p = Math.min(1, (now - t0) / DURATION);
      ctx.clearRect(0, 0, W, H);
      // a veil that rises and falls, covering the swap of screens at the midpoint
      const veil = Math.sin(Math.PI * Math.min(1, p * 1.15));
      ctx.fillStyle = `rgba(14,14,14,${0.78 * veil})`;
      ctx.fillRect(0, 0, W, H);
      for (const q of ps) {
        const k = Math.max(0, (p - q.d) / (1 - q.d));
        if (k <= 0) continue;
        const accel = q.v * (1 + 26 * k * k);
        const y = q.y - accel * 22 * k;
        const len = Math.min(80 * dpr, accel * 6);
        ctx.globalAlpha = Math.max(0, (1 - k) * 0.95);
        ctx.fillStyle = q.c;
        ctx.fillRect(q.x, y, q.s, len);
      }
      ctx.globalAlpha = 1;
      if (p < 1) raf = requestAnimationFrame(frame);
      else onDone();
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [onDone]);
  return <canvas ref={ref} className="warp" aria-hidden />;
}
