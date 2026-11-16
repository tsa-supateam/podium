// Motion layer: tiny hooks on top of motion.css. No animation library; rAF + IntersectionObserver only.
import { useEffect, useRef, useState } from "react";

export const reducedMotion = (): boolean =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** True once the element has scrolled into view (stays true). */
export function useInView<T extends Element>(): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    if (typeof IntersectionObserver === "undefined") return setSeen(true);
    const io = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting)) {
        setSeen(true);
        io.disconnect();
      }
    }, { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  return [ref, seen];
}

const easeOutExpo = (x: number) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x));

/** Animate a number from 0 to `to` once `run` is true. */
export function useCountUp(to: number, run = true, ms = 900): number {
  const [v, setV] = useState(reducedMotion() ? to : 0);
  useEffect(() => {
    if (!run) return;
    if (reducedMotion()) return setV(to);
    let raf = 0;
    const t0 = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / ms);
      setV(to * easeOutExpo(p));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to, run, ms]);
  return v;
}

/** Damped spring from 0 to `to`: overshoots, then settles. Returns the current value. */
export function useSpring(to: number, run = true, stiffness = 90, damping = 9): number {
  const [v, setV] = useState(reducedMotion() ? to : 0);
  useEffect(() => {
    if (!run) return;
    if (reducedMotion()) return setV(to);
    let x = 0, vel = 0, last = performance.now(), raf = 0;
    const step = (now: number) => {
      const dt = Math.min(0.032, (now - last) / 1000);
      last = now;
      vel += (stiffness * (to - x) - damping * vel) * dt;
      x += vel * dt;
      setV(x);
      if (Math.abs(to - x) > 0.05 || Math.abs(vel) > 0.05) raf = requestAnimationFrame(step);
      else setV(to);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to, run, stiffness, damping]);
  return v;
}

/** Pointer-tracked light for dark cards: sets --mx/--my on the hovered .card (one delegated listener). */
export function installCardLight(): () => void {
  const onMove = (e: PointerEvent) => {
    const card = (e.target as Element | null)?.closest?.(".card, .tile") as HTMLElement | null;
    if (!card) return;
    const r = card.getBoundingClientRect();
    card.style.setProperty("--mx", `${e.clientX - r.left}px`);
    card.style.setProperty("--my", `${e.clientY - r.top}px`);
  };
  document.addEventListener("pointermove", onMove, { passive: true });
  return () => document.removeEventListener("pointermove", onMove);
}
