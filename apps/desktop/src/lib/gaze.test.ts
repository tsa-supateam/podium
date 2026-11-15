import { describe, expect, it } from "vitest";
import {
  DEFAULT_GAINS, DEFAULT_ZONE_MODEL, OneEuro, StickyZoneFilter, fitGaussian, gazeAngles, headPose, irisOffset, irisReliability, mahalanobis2,
  zoneProbabilities, type Point,
} from "./gaze";
import type { Zone } from "./types";

/** Column-major 4x4 rotation about Y (turning the face toward image right for positive angles). */
function rotY(deg: number): number[] {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1];
}
function rotX(deg: number): number[] {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  // rotating the forward axis (0,0,1) up toward +y
  return [1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0, 0, 0, 0, 1];
}

describe("headPose", () => {
  it("is zero for the identity", () => {
    const p = headPose([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    expect(p.yawImg).toBeCloseTo(0);
    expect(p.pitchUp).toBeCloseTo(0);
  });
  it("reads yaw and pitch from the forward axis", () => {
    expect(headPose(rotY(20)).yawImg).toBeCloseTo(20, 4);
    expect(headPose(rotX(15)).pitchUp).toBeCloseTo(15, 4);
  });
});

describe("gazeAngles", () => {
  it("maps image-right to the speaker's left (negative gYaw) because the camera faces the speaker", () => {
    expect(gazeAngles({ yawImg: 20, pitchUp: 0 }, { dx: 0, dy: 0 }).gYaw).toBeCloseTo(-20);
    expect(gazeAngles({ yawImg: 20, pitchUp: 0 }, { dx: 0, dy: 0 }, undefined, true).gYaw).toBeCloseTo(20);
  });
  it("adds eye rotation to head rotation", () => {
    const g = gazeAngles({ yawImg: 0, pitchUp: 0 }, { dx: 0.5, dy: 0.5 }, { kx: 30, ky: 20 });
    expect(g.gYaw).toBeCloseTo(-15);
    expect(g.gPitch).toBeCloseTo(-10); // iris low in the eye = looking down
  });
});

describe("irisOffset", () => {
  it("is ~0 when the iris is centred and positive when it moves toward image right", () => {
    const lm: Point[] = [];
    const eye = (l: number, r: number, t: number, b: number, iris: number, cx: number) => {
      lm[l] = { x: cx - 0.03, y: 0.5 };
      lm[r] = { x: cx + 0.03, y: 0.5 };
      lm[t] = { x: cx, y: 0.49 };
      lm[b] = { x: cx, y: 0.51 };
      lm[iris] = { x: cx, y: 0.5 };
    };
    eye(33, 133, 159, 145, 468, 0.4);
    eye(362, 263, 386, 374, 473, 0.6);
    expect(irisOffset(lm).dx).toBeCloseTo(0);
    lm[468] = { x: 0.415, y: 0.5 };
    lm[473] = { x: 0.615, y: 0.5 };
    expect(irisOffset(lm).dx).toBeCloseTo(0.5);
  });
});

describe("zone classification", () => {
  const best = (p: Record<Zone, number>) => (Object.keys(p) as Zone[]).reduce((a, b) => (p[a] >= p[b] ? a : b));
  it("uses the default layout when uncalibrated", () => {
    expect(best(zoneProbabilities([-25, 0], DEFAULT_ZONE_MODEL))).toBe("L");
    expect(best(zoneProbabilities([0, 3], DEFAULT_ZONE_MODEL))).toBe("C");
    expect(best(zoneProbabilities([22, 4], DEFAULT_ZONE_MODEL))).toBe("R");
    expect(best(zoneProbabilities([0, -28], DEFAULT_ZONE_MODEL))).toBe("N");
  });
  it("sends far-off gaze to Away via the chi-square gate", () => {
    expect(best(zoneProbabilities([80, 40], DEFAULT_ZONE_MODEL))).toBe("X");
  });
  it("computes Mahalanobis distance", () => {
    expect(mahalanobis2([3, 4], { mu: [0, 0], cov: [1, 0, 1] })).toBeCloseTo(25);
  });
  it("fits a Gaussian with a variance floor", () => {
    const g = fitGaussian([[10, 0], [10, 0], [10, 0]], 9);
    expect(g.mu).toEqual([10, 0]);
    expect(g.cov[0]).toBeGreaterThanOrEqual(9);
  });
});

describe("StickyZoneFilter", () => {
  const center: Record<Zone, number> = { L: 0.02, C: 0.94, R: 0.02, N: 0.01, X: 0.01 };
  const right: Record<Zone, number> = { L: 0.01, C: 0.02, R: 0.95, N: 0.01, X: 0.01 };
  it("ignores a one-frame glance but follows a sustained look", () => {
    const f = new StickyZoneFilter(0.97);
    for (let i = 0; i < 30; i++) f.step(center);
    expect(f.step(right).zone).toBe("C");
    let z: Zone = "C";
    for (let i = 0; i < 8; i++) z = f.step(right).zone;
    expect(z).toBe("R");
  });
});

describe("OneEuro", () => {
  it("smooths jitter on a still signal", () => {
    const f = new OneEuro(1.0, 0.02);
    let out = 0;
    for (let i = 0; i < 60; i++) out = f.filter(10 + (i % 2 ? 1 : -1), i / 30);
    expect(Math.abs(out - 10)).toBeLessThan(0.6);
  });
});

describe("calibration guard", () => {
  it("pushes side zones that were measured too close to center", async () => {
    const { fitZoneModel } = await import("./gaze");
    const pts = (x: number, y: number) => Array.from({ length: 20 }, () => [x, y] as [number, number]);
    // real calibration from 2026-10-20: left +12, center +22.7, right +27.6
    const m = fitZoneModel({ L: pts(12, -6.7), C: pts(22.7, -5.9), R: pts(27.6, -6.5), N: [] });
    expect(m.L.mu[0]).toBeCloseTo(12);
    expect(m.R.mu[0]).toBeCloseTo(32.7);
    expect(m.N.mu[1]).toBeLessThanOrEqual(-15.9); // default "down" offset kept relative to center
  });
});

describe("irisReliability", () => {
  const steady = (n: number, jitter: number, openness: number) =>
    Array.from({ length: n }, (_, i) => ({ dx: (i % 2 ? 1 : -1) * jitter, dy: (i % 2 ? 1 : -1) * jitter * 2, openness }));

  it("keeps full iris weight for steady bare eyes", () => {
    const r = irisReliability({ C: steady(30, 0.02, 0.3), L: steady(30, 0.02, 0.3) });
    expect(r.gains).toEqual(DEFAULT_GAINS);
    expect(r.glasses).toBe(false);
  });

  it("leans on head direction when the iris is noisy and eyes look narrow (glasses)", () => {
    const r = irisReliability({ C: steady(30, 0.15, 0.1), L: steady(30, 0.15, 0.1) });
    expect(r.gains.kx).toBeLessThan(DEFAULT_GAINS.kx * 0.5);
    expect(r.glasses).toBe(true);
    expect(r.minOpen).toBeLessThan(0.1); // narrow-looking eyes aren't dropped as blinks
  });
});
