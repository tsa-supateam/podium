import { describe, expect, it } from "vitest";
import { MODULES, type LearnStatus } from "./curriculum";
import { demoStatus, level, streak, testClaim, unlocked, xpOf } from "./game";

const mod = (id: string) => MODULES.find((m) => m.id === id)!;
const empty: LearnStatus = { lessons: [], checks: {} };

describe("skill tree", () => {
  it("unlocks a module once a practice in its prerequisite is passed", () => {
    expect(unlocked(mod("structure"), empty)).toBe(true);
    expect(unlocked(mod("evidence"), empty)).toBe(false);
    const st: LearnStatus = { lessons: [], checks: { claim_up_front: { attempts: [{ id: "claim_up_front", value: 3, passed: true, sessionId: "a", at: null }], recent: [] } } };
    expect(unlocked(mod("evidence"), st)).toBe(true);
    expect(unlocked(mod("commentary"), st)).toBe(false);
    expect(unlocked(mod("commentary"), empty, true)).toBe(true); // demo mode
  });
});

describe("xp and streak", () => {
  it("adds XP for lessons and passes, and levels up every 400", () => {
    const st: LearnStatus = { lessons: ["structure.claim"], checks: { claim_up_front: { attempts: [{ id: "claim_up_front", value: 3, passed: true, sessionId: "a", at: null }], recent: [] } } };
    expect(xpOf(st)).toBe(50 + 10 + 120);
    expect(level(850)).toMatchObject({ level: 3, into: 50 });
  });
  it("counts consecutive days, kept alive until today ends", () => {
    const now = new Date(2026, 10, 16, 12);
    const day = (n: number) => new Date(2026, 10, 16 - n, 9).toISOString();
    expect(streak([day(1), day(2), day(3), day(5)], now)).toMatchObject({ days: 3, today: false });
    expect(streak([day(0), day(1)], now).days).toBe(2);
    expect(streak([day(2)], now).days).toBe(0);
  });
  it("demo data unlocks a rich, varied state", () => {
    const st = demoStatus();
    expect(xpOf(st)).toBeGreaterThan(2000);
    expect(streak(st.activity).days).toBeGreaterThanOrEqual(10);
  });
});

describe("claim tester", () => {
  it("flags topic announcements, hedges and fillers", () => {
    const weak = testClaim("Um, today I want to talk about phones and I think stuff", "Should phones be banned in class?");
    expect(weak.verdict.tone).toBe("bad");
    expect(weak.checks.map((c) => c.label)).toEqual(expect.arrayContaining(["No clear stance", "Announces a topic", "Filler words", "Hedging"]));
  });
  it("passes a direct, on-topic claim with a reason", () => {
    const strong = testClaim("Schools should ban phones in class because they cost students focus and sleep.", "Should phones be banned in class?");
    expect(strong.verdict).toEqual({ tone: "good", label: "Strong claim" });
  });
});
