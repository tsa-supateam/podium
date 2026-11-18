import { describe, expect, it } from "vitest";
import { MODULES, type LearnStatus, mastery } from "./curriculum";
import {
  GAME_XP_PER_DAY, UNLOCKABLES, XP, bossBeaten, bossChecks, bossReady, demoStatus, equipped, gameXp, isUnlocked, longestStreak, rng,
  shuffle, unlocked, xpOf,
} from "./game";

const mod = (id: string) => MODULES.find((m) => m.id === id)!;
const skill = (id: string) => MODULES.flatMap((m) => m.skills).find((s) => s.id === id)!;
const pass = (check: string) => ({ id: check, value: 1, passed: true, sessionId: "x", at: null });

describe("quick-game XP", () => {
  it("pays for the first plays of a day only, with bonuses for 80%+ and a new best", () => {
    const day = (h: number, score: number, d = "2026-11-17") => ({ at: `${d}T${String(h).padStart(2, "0")}:00:00`, score, max: 10 });
    const xp = gameXp([day(9, 5), day(10, 9), day(11, 9), day(12, 10), day(9, 10, "2026-11-18")]);
    expect(xp[0]).toBe(XP.game); // first play: no "best" bonus yet
    expect(xp[1]).toBe(XP.game + XP.gameGood + XP.gameBest);
    expect(xp[2]).toBe(XP.game + XP.gameGood); // ties aren't a new best
    expect(xp[3]).toBe(0); // 4th play of the day
    expect(GAME_XP_PER_DAY).toBe(3);
    expect(xp[4]).toBe(XP.game + XP.gameGood); // next day earns again
  });
});

describe("rust", () => {
  it("keeps mastered XP when a skill gets rusty, and a cleared rust pays review XP", () => {
    const s = skill("fillers.fewer");
    const base = { attempts: [pass(s.check)], recent: [pass(s.check), pass(s.check)] };
    const mastered: LearnStatus = { lessons: [], checks: { [s.check]: { ...base, everMastered: true } } };
    const rusty: LearnStatus = { lessons: [], checks: { [s.check]: { ...base, recent: [], everMastered: true, rusty: true } } };
    expect(mastery(s, mastered)).toBe(3);
    expect(mastery(s, rusty)).toBe(2);
    expect(xpOf(rusty)).toBe(xpOf(mastered)); // XP never drops
    const cleared: LearnStatus = { lessons: [], checks: { [s.check]: { ...base, recent: [], everMastered: true, rustCleared: 1 } } };
    expect(mastery(s, cleared)).toBe(3); // a passed review shows it as mastered again
    expect(xpOf(cleared)).toBe(xpOf(mastered) + XP.review);
  });
});

describe("bosses", () => {
  const structure = mod("structure");
  it("are ready once every skill is started, and checked against every skill", () => {
    expect(bossChecks(structure)).toEqual(["claim_up_front", "signposts", "conclusion"]);
    expect(bossReady(structure, { lessons: [], checks: {} })).toBe(false);
    expect(bossReady(structure, { lessons: structure.skills.map((s) => s.id), checks: {} })).toBe(true);
  });
  it("are optional: beating one doesn't change what's unlocked, but pays XP and a title", () => {
    const tries = (ok: boolean[]) => ok.map((p, i) => ({ module: "structure", results: [], passed: p, sessionId: `b${i}`, at: null }));
    const lost: LearnStatus = { lessons: [], checks: {}, bosses: { structure: tries([false, false, false, false]) } };
    const won: LearnStatus = { lessons: [], checks: {}, bosses: { structure: tries([false, true, true]) } };
    expect(xpOf(lost)).toBe(3 * XP.bossTry); // capped at 3 tries
    expect(xpOf(won)).toBe(XP.bossTry + XP.boss); // one failed try, then the win (paid once)
    expect(bossBeaten(structure, won)).toBe(true);
    expect(unlocked(mod("evidence"), won)).toBe(false); // the tree still opens by practices
    const badge = UNLOCKABLES.find((u) => u.id === "badge.structure")!;
    expect(isUnlocked(badge, won, xpOf(won))).toBe(true);
    expect(isUnlocked(badge, lost, xpOf(lost))).toBe(false);
  });
});

describe("Locker", () => {
  it("falls back to the default when an equipped item isn't unlocked", () => {
    const st: LearnStatus = { lessons: [], checks: {}, equipped: { accent: "accent.gold", ring: "ring.nope" } };
    expect(equipped(st, 0).accent.id).toBe("accent.ember");
    expect(equipped(st, 0).ring.id).toBe("ring.solid");
    expect(equipped(st, 5 * 400).accent.id).toBe("accent.gold"); // LV 06
    expect(equipped(st, 0, true).accent.id).toBe("accent.gold"); // demo mode: everything unlocked
  });
  it("counts the longest daily streak", () => {
    expect(longestStreak(["2026-01-01T10:00", "2026-01-02T10:00", "2026-01-03T09:00", "2026-01-05T10:00"])).toBe(3);
    expect(longestStreak([])).toBe(0);
  });
});

describe("demo and shuffle", () => {
  it("demo shows rusty skills, beaten bosses and game history", () => {
    const d = demoStatus();
    expect(Object.values(d.checks).filter((c) => c.rusty).length).toBe(2);
    expect(MODULES.filter((m) => bossBeaten(m, d)).length).toBe(2);
    expect(Object.keys(d.games ?? {})).toHaveLength(4);
  });
  it("the same seed gives the same rounds", () => {
    const xs = Array.from({ length: 20 }, (_, i) => i);
    expect(shuffle(xs, rng(42))).toEqual(shuffle(xs, rng(42)));
    expect(shuffle(xs, rng(42))).not.toEqual(shuffle(xs, rng(43)));
  });
});
