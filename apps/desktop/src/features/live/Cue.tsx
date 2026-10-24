// Coach-mode cue word at the bottom of the stage: one short instruction at a time.
import { useRef } from "react";
import { live, SPEED_BANDS, useApp, useTicker } from "../../stores/app";

export interface CueInput {
  now: number; // seconds (performance clock)
  speaking: boolean;
  silenceSec: number;
  wpm: number | null; // smoothed; null while pausing
  band?: readonly [number, number]; // target words per minute
  recentFillers: number; // fillers in the last 12 s
  lastFillerAgo: number | null; // seconds
  monotony: number | null; // 0..1
  face: boolean;
  zone: string | null;
  zoneHeldSec: number; // how long the current zone has lasted
  sideShare: { L: number; R: number; samples: number }; // audience-zone shares over the last 15 s
  notes: boolean;
  camera?: boolean; // Direct camera mode: no left/right sweeping
}

export type Cue = { text: string; tone: "warn" | "good" };

/** Pick the most urgent cue. Order = priority. */
export function pickCue(c: CueInput): Cue | null {
  if (!c.speaking && c.silenceSec > 4) return { text: "Keep going", tone: "warn" };
  if (c.recentFillers >= 2 || (c.lastFillerAgo !== null && c.lastFillerAgo < 2.5)) return { text: "Calm · pause", tone: "warn" };
  const [lo, hi] = c.band ?? [130, 170];
  if (c.wpm !== null && c.wpm > hi + 5) return { text: "Slow down", tone: "warn" };
  if (c.wpm !== null && c.wpm < lo - 20) return { text: "Speed up", tone: "warn" };
  if (c.face && c.zone === "N" && c.zoneHeldSec > (c.notes ? 3 : 1.5)) return { text: "Look up", tone: "warn" };
  if (c.face && c.zone === "X" && c.zoneHeldSec > 2) return { text: c.camera ? "Look at the camera" : "Eye contact", tone: "warn" };
  if (!c.face && c.zoneHeldSec > 3) return { text: "Face the room", tone: "warn" };
  if (!c.camera && c.sideShare.samples > 200) {
    if (c.sideShare.L < 0.05) return { text: "Look left", tone: "warn" };
    if (c.sideShare.R < 0.05) return { text: "Look right", tone: "warn" };
  }
  if (c.monotony !== null && c.monotony > 0.7) return { text: "More energy", tone: "warn" };
  if (c.speaking) return { text: "Good", tone: "good" };
  return null;
}

const HOLD_SEC = 2.5;

export default function CueWord() {
  useTicker(5);
  const notes = useApp((s) => s.settings.notes);
  const camera = useApp((s) => s.settings.gazeMode === "camera");
  const answering = useApp((s) => !!s.qa?.answering);
  const speechType = useApp((s) => s.settings.speechType);
  const band = SPEED_BANDS[answering ? "impromptu" : speechType];
  const shown = useRef<{ cue: Cue | null; since: number }>({ cue: null, since: 0 });
  const zoneRun = useRef<{ zone: string | null; face: boolean; since: number }>({ zone: null, face: true, since: 0 });

  const now = performance.now() / 1000;
  const tick = live.tick;
  const g = live.gaze;
  const zone = g ? g.zone : null;
  const face = g ? g.face : true;
  if (zone !== zoneRun.current.zone || face !== zoneRun.current.face) zoneRun.current = { zone, face, since: now };

  const recent = live.gazeHistory.filter((h) => h.t > (g?.t ?? now) - 15);
  const aud = recent.filter((h) => h.zone === "L" || h.zone === "C" || h.zone === "R");
  const share = (z: string) => (aud.length ? aud.filter((h) => h.zone === z).length / aud.length : 1 / 3);
  const audioNow = tick?.t ?? 0;
  const pace = live.pace;

  const next = pickCue({
    now,
    speaking: !!tick?.speaking,
    silenceSec: tick?.c.silence != null ? 3 + tick.c.silence * 10 : 0, // engine: (silence - 3 s) / 10
    // the first readings include the silence before you started talking
    band,
    wpm: pace && pace.label !== "pause" && audioNow > 15 ? pace.wpmEma : null,
    recentFillers: live.fillers.filter((f) => f.t0 > audioNow - 12).length,
    lastFillerAgo: live.lastFiller ? (performance.now() - live.lastFiller.at) / 1000 : null,
    monotony: tick?.c.monotony ?? null,
    face,
    zone,
    zoneHeldSec: now - zoneRun.current.since,
    sideShare: { L: share("L"), R: share("R"), samples: aud.length },
    notes: answering ? false : notes,
    camera,
  });

  // Hold each cue long enough to read, unless a warning replaces a "Good".
  const cur = shown.current;
  const changed = next?.text !== cur.cue?.text;
  if (changed && (now - cur.since > HOLD_SEC || (cur.cue?.tone === "good" && next?.tone === "warn") || !cur.cue)) {
    shown.current = { cue: next, since: now };
  }
  const cue = shown.current.cue;
  if (!cue) return null;
  return (
    <div className={`cue ${cue.tone}`} key={cue.text} role="status" aria-live="polite">
      {cue.text}
    </div>
  );
}
