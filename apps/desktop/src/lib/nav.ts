// Browser-style back navigation for the browsing screens, and the two-finger swipe that drives it.
import { BROWSE_SCREENS, useApp, type NavEntry } from "../stores/app";

let goingBack = false;

/** Record each move between browsing screens (including Learn's module and skill pages). */
export function installNavHistory(): () => void {
  return useApp.subscribe((s, prev) => {
    if (goingBack) return;
    // a Learn page change only counts while on Learn (resetting it from Home isn't a move)
    const moved = s.screen !== prev.screen || (s.screen === "learn" && prev.screen === "learn" && s.learnPath !== prev.learnPath);
    if (!moved) return;
    // starting a session (setup, live...) ends the browse trail
    if (!BROWSE_SCREENS.includes(s.screen)) {
      if (s.backStack.length) useApp.setState({ backStack: [] });
      return;
    }
    if (!BROWSE_SCREENS.includes(prev.screen)) return;
    const from: NavEntry = { screen: prev.screen, learnPath: prev.learnPath };
    const last = s.backStack[s.backStack.length - 1];
    if (last && last.screen === from.screen && last.learnPath === from.learnPath) return;
    useApp.setState({ backStack: [...s.backStack.slice(-30), from] });
  });
}

export function canGoBack(): boolean {
  const s = useApp.getState();
  return BROWSE_SCREENS.includes(s.screen) && s.backStack.length > 0;
}

export function goBack(): boolean {
  const s = useApp.getState();
  if (!canGoBack()) return false;
  const to = s.backStack[s.backStack.length - 1];
  goingBack = true;
  // a debrief needs its run loaded; if it isn't, fall back to the screen before it
  const target = to.screen === "debrief" && !s.bundle ? { ...to, screen: "history" as const } : to;
  useApp.setState({ backStack: s.backStack.slice(0, -1), screen: target.screen, learnPath: target.learnPath, drill: null });
  goingBack = false;
  return true;
}

/**
 * Two-finger horizontal swipe on a trackpad arrives as horizontal wheel events. A rightward swipe
 * (negative deltaX) past the threshold goes back, like a browser. `onProgress` drives the edge arrow.
 */
export function installSwipeBack(onProgress: (p: number) => void): () => void {
  const THRESHOLD = 160;
  let acc = 0, fired = false, idle: ReturnType<typeof setTimeout> | null = null;
  const reset = () => {
    acc = 0;
    fired = false;
    onProgress(0);
  };
  const onWheel = (e: WheelEvent) => {
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY) * 1.2 || e.ctrlKey) return;
    // let horizontally scrollable areas (tables, charts) scroll first
    for (let el = e.target as HTMLElement | null; el && el !== document.body; el = el.parentElement) {
      if (el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflowX.match(/auto|scroll/)) return;
    }
    if (idle) clearTimeout(idle);
    idle = setTimeout(reset, 220); // the gesture ended
    if (fired || !canGoBack()) return;
    acc = Math.min(0, acc + e.deltaX);
    onProgress(Math.min(1, -acc / THRESHOLD));
    if (-acc >= THRESHOLD) {
      fired = true;
      onProgress(0);
      goBack();
    }
  };
  // mouse back button and Cmd+[ do the same
  const onKey = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "[") goBack();
  };
  const onMouse = (e: MouseEvent) => {
    if (e.button === 3) goBack();
  };
  window.addEventListener("wheel", onWheel, { passive: true });
  window.addEventListener("keydown", onKey);
  window.addEventListener("mouseup", onMouse);
  return () => {
    window.removeEventListener("wheel", onWheel);
    window.removeEventListener("keydown", onKey);
    window.removeEventListener("mouseup", onMouse);
  };
}

let warpAt = -1e9;
/** When the last particle warp started (the shutter animation skips screen changes it covers). */
export const lastWarpAt = () => warpAt;

/** Play the particle warp and switch screens under it. */
export function warpTo(screen: "learn" | "home"): void {
  const s = useApp.getState();
  if (performance.now() - warpAt < 1200) return;
  warpAt = performance.now();
  useApp.setState({ warp: s.warp + 1 });
  setTimeout(() => {
    if (screen === "learn") useApp.getState().set({ learnPath: { module: null, skill: null } });
    useApp.getState().go(screen);
  }, 330);
}

/** A wheel handler that warps to `to` after a deliberate vertical scroll in `dir` (down: +1, up: -1).
 *  `ready()` gates it, e.g. only when a list is already scrolled to its top. */
export function wheelWarp(to: "learn" | "home", dir: 1 | -1, ready: () => boolean = () => true) {
  let acc = 0, idle: ReturnType<typeof setTimeout> | null = null;
  return (e: { deltaX: number; deltaY: number }) => {
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) || Math.sign(e.deltaY) !== dir || !ready()) return;
    if (idle) clearTimeout(idle);
    idle = setTimeout(() => (acc = 0), 250);
    acc += Math.abs(e.deltaY);
    if (acc > 90) {
      acc = 0;
      warpTo(to);
    }
  };
}
