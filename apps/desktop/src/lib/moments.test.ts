import { describe, expect, it } from "vitest";
import { keyMoments } from "./moments";
import type { Summary } from "./types";

// Shape of a real run (2026-10-20): no "highlights", but plenty worth jumping to.
const s = {
  fillers: { clusters: [], events: [{ t0: 64.9, t1: 65.3, token: "umm" }, { t0: 69, t1: 69.2, token: "ah" }] },
  pacing: { longPauses: [{ t0: 30, t1: 34.5 }, { t0: 50, t1: 51 }], segments: [{ t0: -5, t1: 40, label: "drag" }, { t0: 40, t1: 70, label: "drag" }] },
  voice: { monotoneSegments: [] },
  gaze: { notesMode: false, notesStares: [{ t0: 80, t1: 84 }] },
  engagement: { lowPoints: [{ t: 90, E: 41, drivers: [] }], series: { t: [2, 20, 30], E: [80, 72, 60] } },
  highlights: [],
} as unknown as Summary;

describe("keyMoments", () => {
  it("finds moments even when nothing is severe", () => {
    const labels = keyMoments(s).map((m) => m.label);
    expect(labels).toEqual([
      "Slowed way down", "Audience most engaged", "5 s pause", "Said “umm”", "Said “ah”", "Looked down", "Audience drifted",
    ]);
  });
  it("marks the best moment as good and never goes below zero time", () => {
    const m = keyMoments(s);
    expect(m.find((x) => x.good)?.t).toBe(20);
    expect(Math.min(...m.map((x) => x.t))).toBeGreaterThanOrEqual(0);
  });
});
