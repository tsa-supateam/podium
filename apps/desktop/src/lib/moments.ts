import type { Summary } from "./types";

export interface Moment {
  t: number;
  label: string;
  good?: boolean;
}

/** Everything worth jumping to, built from the whole analysis (not only the severe highlights). */
export function keyMoments(s: Summary): Moment[] {
  const out: Moment[] = [];
  const notes = s.gaze?.notesMode ?? true;
  const clustered = (t: number) => s.fillers.clusters.some((c) => t >= c.t0 - 0.5 && t <= c.t1 + 0.5);
  for (const c of s.fillers.clusters) out.push({ t: c.t0, label: `${c.count} fillers close together` });
  for (const f of s.fillers.events) if (!clustered(f.t0)) out.push({ t: f.t0, label: `Said “${f.token}”` });
  for (const p of s.pacing.longPauses) if (p.t1 - p.t0 >= 3) out.push({ t: p.t0, label: `${Math.round(p.t1 - p.t0)} s pause` });
  let prevLabel = "";
  for (const seg of s.pacing.segments) {
    // one moment per stretch: consecutive slow (or fast) segments are the same problem
    if (seg.label === "drag" && prevLabel !== "drag") out.push({ t: Math.max(0, seg.t0), label: "Slowed way down" });
    if (seg.label === "rushing" && prevLabel !== "rushing") out.push({ t: Math.max(0, seg.t0), label: "Talking too fast" });
    prevLabel = seg.label;
  }
  for (const m of s.voice.monotoneSegments) out.push({ t: m.t0, label: "Voice went flat" });
  for (const st of s.gaze?.notesStares ?? []) out.push({ t: st.t0, label: notes ? "Long look at notes" : "Looked down" });
  for (const lp of s.engagement?.lowPoints ?? []) if (lp.E < 50) out.push({ t: lp.t, label: "Audience drifted" });
  const e = s.engagement?.series;
  if (e && e.E.length) {
    // skip the first 15 s: the audience starts out attentive, which says nothing about the speech
    const later = e.t.map((t, i) => [t, e.E[i]] as const).filter(([t]) => t >= 15);
    const best = later.reduce<readonly [number, number] | null>((b, x) => (!b || x[1] > b[1] ? x : b), null);
    if (best && best[1] >= 60) out.push({ t: best[0], label: "Audience most engaged", good: true });
  }
  // de-duplicate moments within 2 s with the same label, then sort by time
  const seen: Moment[] = [];
  for (const m of out.sort((a, b) => a.t - b.t)) {
    if (!seen.some((x) => x.label === m.label && Math.abs(x.t - m.t) < 2)) seen.push(m);
  }
  return seen.slice(0, 16);
}
