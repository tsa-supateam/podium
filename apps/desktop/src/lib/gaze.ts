// Gaze math (spec §6.2): head pose + iris offset → gaze angles → smoothed zone.
// Pure functions so they can be unit-tested without a camera.
import type { Zone } from "./types";

export interface Point {
  x: number;
  y: number;
  z?: number;
}

const DEG = 180 / Math.PI;

/**
 * Head yaw/pitch from MediaPipe's 4x4 facial transformation matrix (column-major).
 * The face's forward axis in camera space is the matrix's third column. Camera space
 * is OpenGL-style (x right, y up, z toward the viewer), so:
 *   yawImg  > 0  → face turned toward image right
 *   pitchUp > 0  → face tilted up
 */
export function headPose(m: ArrayLike<number>): { yawImg: number; pitchUp: number; roll: number } {
  const r = (row: number, col: number) => m[col * 4 + row];
  const fx = r(0, 2), fy = r(1, 2), fz = r(2, 2);
  const yawImg = Math.atan2(fx, fz) * DEG;
  const pitchUp = Math.atan2(fy, Math.hypot(fx, fz)) * DEG;
  const roll = Math.atan2(r(1, 0), r(0, 0)) * DEG;
  return { yawImg, pitchUp, roll };
}

// MediaPipe Face Mesh indices (478-point model with irises).
export const EYES = [
  { left: 33, right: 133, top: 159, bottom: 145, iris: 468 }, // subject's right eye (image left)
  { left: 362, right: 263, top: 386, bottom: 374, iris: 473 }, // subject's left eye (image right)
];

/** Iris displacement inside each eye, image coordinates: dx>0 = iris toward image right, dy>0 = down. */
export function irisOffset(lm: Point[]): { dx: number; dy: number; openness: number } {
  let sx = 0, sy = 0, sw = 0, open = 0;
  for (const e of EYES) {
    const a = lm[e.left], b = lm[e.right], t = lm[e.top], d = lm[e.bottom], p = lm[e.iris];
    if (!a || !b || !t || !d || !p) continue;
    const ux = b.x - a.x, uy = b.y - a.y;
    const width = Math.hypot(ux, uy) || 1e-6;
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const vx = -uy / width, vy = ux / width; // perpendicular (image-down when the eye is level)
    const height = Math.hypot(t.x - d.x, t.y - d.y);
    const dx = ((p.x - mx) * ux + (p.y - my) * uy) / width / (width / 2);
    const dyRaw = ((p.x - (t.x + d.x) / 2) * vx + (p.y - (t.y + d.y) / 2) * vy) / Math.max(height / 2, 1e-6);
    const openness = height / width; // ~0.25–0.35 open, < 0.12 blink
    const w = Math.max(0, openness - 0.08);
    sx += dx * w;
    sy += dyRaw * w;
    sw += w;
    open += openness / 2;
  }
  return sw > 0 ? { dx: sx / sw, dy: sy / sw, openness: open } : { dx: 0, dy: 0, openness: 0 };
}

export interface GazeCalibrationGains {
  kx: number;
  ky: number;
}
export const DEFAULT_GAINS: GazeCalibrationGains = { kx: 30, ky: 20 };

/**
 * Combined gaze angles in the speaker's frame:
 *   gYaw > 0   → toward the SPEAKER's right (image left; the camera faces the speaker)
 *   gPitch > 0 → up
 */
export function gazeAngles(
  pose: { yawImg: number; pitchUp: number },
  iris: { dx: number; dy: number },
  gains = DEFAULT_GAINS,
  flipYaw = false,
): { gYaw: number; gPitch: number } {
  const yawImg = pose.yawImg + gains.kx * iris.dx;
  const gYaw = flipYaw ? yawImg : -yawImg;
  const gPitch = pose.pitchUp - gains.ky * iris.dy;
  return { gYaw, gPitch };
}

// ------------------------------------------------------------- One-Euro filter
export class OneEuro {
  private xPrev: number | null = null;
  private dxPrev = 0;
  private tPrev = 0;
  constructor(private minCutoff = 1.0, private beta = 0.02, private dCutoff = 1.0) {}
  private alpha(cutoff: number, dt: number) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }
  filter(x: number, t: number): number {
    if (this.xPrev === null) {
      this.xPrev = x;
      this.tPrev = t;
      return x;
    }
    const dt = Math.max(1e-3, t - this.tPrev);
    const dx = (x - this.xPrev) / dt;
    const aD = this.alpha(this.dCutoff, dt);
    this.dxPrev = aD * dx + (1 - aD) * this.dxPrev;
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dxPrev);
    const a = this.alpha(cutoff, dt);
    this.xPrev = a * x + (1 - a) * this.xPrev;
    this.tPrev = t;
    return this.xPrev;
  }
  reset() {
    this.xPrev = null;
  }
}

// ------------------------------------------------------------- zone model
export interface Gaussian2 {
  mu: [number, number];
  cov: [number, number, number]; // [sxx, sxy, syy]
}
export type ZoneModel = Record<Exclude<Zone, "X">, Gaussian2>;
const ZONE_KEYS: Exclude<Zone, "X">[] = ["L", "C", "R", "N"];

/** Uncalibrated defaults: equal-variance Gaussians whose boundaries sit near ±12.5° yaw and -12.5° pitch. */
export const DEFAULT_ZONE_MODEL: ZoneModel = {
  L: { mu: [-25, 2], cov: [100, 0, 100] },
  C: { mu: [0, 2], cov: [100, 0, 100] },
  R: { mu: [25, 2], cov: [100, 0, 100] },
  N: { mu: [0, -25], cov: [100, 0, 100] },
};

export const CHI2_99_2DOF = 9.21;

export function mahalanobis2(g: [number, number], z: Gaussian2): number {
  const [a, b, c] = z.cov;
  const det = a * c - b * b || 1e-6;
  const dx = g[0] - z.mu[0], dy = g[1] - z.mu[1];
  return (c * dx * dx - 2 * b * dx * dy + a * dy * dy) / det;
}

/** Soft zone probabilities. Outside every zone's 99% ellipse → mass moves to X (away). */
export function zoneProbabilities(g: [number, number], model: ZoneModel): Record<Zone, number> {
  const out: Record<Zone, number> = { L: 0, C: 0, R: 0, N: 0, X: 0 };
  let minD = Infinity, sum = 0;
  for (const z of ZONE_KEYS) {
    const d2 = mahalanobis2(g, model[z]);
    minD = Math.min(minD, d2);
    const [a, b, c] = model[z].cov;
    const lik = Math.exp(-0.5 * d2) / Math.sqrt(Math.max(a * c - b * b, 1e-6));
    out[z] = lik;
    sum += lik;
  }
  const away = minD > CHI2_99_2DOF ? Math.min(0.95, (minD - CHI2_99_2DOF) / 10 + 0.5) : 0.02;
  for (const z of ZONE_KEYS) out[z] = sum > 0 ? ((1 - away) * out[z]) / sum : (1 - away) / 4;
  out.X = away;
  return out;
}

export function fitGaussian(points: [number, number][], minVar = 9): Gaussian2 {
  const n = Math.max(points.length, 1);
  const mx = points.reduce((s, p) => s + p[0], 0) / n;
  const my = points.reduce((s, p) => s + p[1], 0) / n;
  let sxx = 0, sxy = 0, syy = 0;
  for (const [x, y] of points) {
    sxx += (x - mx) ** 2;
    sxy += (x - mx) * (y - my);
    syy += (y - my) ** 2;
  }
  // Inflate: calibration fixations are tighter than natural glances at the same zone.
  return { mu: [mx, my], cov: [Math.max(sxx / n, minVar) * 2.5, (sxy / n) * 2.5, Math.max(syy / n, minVar) * 2.5] };
}

export function fitZoneModel(samples: Record<Exclude<Zone, "X">, [number, number][]>): ZoneModel {
  const m = { ...DEFAULT_ZONE_MODEL };
  for (const z of ZONE_KEYS) if (samples[z]?.length >= 10) m[z] = fitGaussian(samples[z]);
  // Zones not calibrated (e.g. left/right in Direct camera mode) stay at their default offsets
  // from the calibrated center.
  const c = m.C.mu;
  for (const z of ZONE_KEYS) {
    if (z !== "C" && !(samples[z]?.length >= 10)) {
      const d = DEFAULT_ZONE_MODEL[z].mu, dc = DEFAULT_ZONE_MODEL.C.mu;
      m[z] = { ...m[z], mu: [c[0] + d[0] - dc[0], c[1] + d[1] - dc[1]] };
    }
  }
  return sanitizeZoneModel(m);
}

export const MIN_SIDE_SEP = 10;

/** A side zone measured too close to center (eyes barely moved during calibration) would make a tiny
 *  drift count as "left" or "right". Push it out. Mirrors engine scoring.zone_centers. */
export function sanitizeZoneModel(m: ZoneModel): ZoneModel {
  const [cx, cy] = m.C.mu;
  return {
    ...m,
    L: { ...m.L, mu: [Math.min(m.L.mu[0], cx - MIN_SIDE_SEP), m.L.mu[1]] },
    R: { ...m.R, mu: [Math.max(m.R.mu[0], cx + MIN_SIDE_SEP), m.R.mu[1]] },
    N: { ...m.N, mu: [m.N.mu[0], Math.min(m.N.mu[1], cy - MIN_SIDE_SEP)] },
  };
}

/** Online forward filter of a "sticky" HMM: glances shorter than ~150 ms don't flip the zone. */
export class StickyZoneFilter {
  private belief: Record<Zone, number> = { L: 0.1, C: 0.6, R: 0.1, N: 0.1, X: 0.1 };
  constructor(private stay = 0.97) {}
  step(emission: Record<Zone, number>): { zone: Zone; belief: Record<Zone, number> } {
    const zs = Object.keys(this.belief) as Zone[];
    const move = (1 - this.stay) / (zs.length - 1);
    const prior: Record<Zone, number> = { L: 0, C: 0, R: 0, N: 0, X: 0 };
    for (const to of zs) for (const from of zs) prior[to] += this.belief[from] * (from === to ? this.stay : move);
    let sum = 0;
    for (const z of zs) {
      prior[z] *= Math.max(emission[z], 1e-4);
      sum += prior[z];
    }
    for (const z of zs) this.belief[z] = prior[z] / sum;
    const zone = zs.reduce((a, b) => (this.belief[a] >= this.belief[b] ? a : b));
    return { zone, belief: { ...this.belief } };
  }
}
