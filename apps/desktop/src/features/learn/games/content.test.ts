import { describe, expect, it } from "vitest";
import { testClaim } from "../game";
import { CLAIM_PAIRS, EVIDENCE_CARDS, HEDGE_LINES, LANES, SPEECHES, UPGRADES, hedgeWords, plain } from "./content";

describe("quick-game content", () => {
  it("Claim Duel answers agree with the claim grader players meet in the finisher", () => {
    for (const p of CLAIM_PAIRS) {
      expect(testClaim(p.strong, p.prompt).verdict.tone, `${p.id} strong: ${JSON.stringify(testClaim(p.strong, p.prompt).checks.filter((c) => c.tone !== "good"))}`).toBe("good");
      expect(testClaim(p.weak, p.prompt).verdict.tone, `${p.id} weak`).not.toBe("good");
    }
  });
  it("every hedge line has words to tap, except the deliberate traps, and a clean version", () => {
    for (const h of HEDGE_LINES) {
      const ws = hedgeWords(h.text);
      expect(ws.map((w) => w.word).join(" ")).toBe(plain(h.text));
      expect(h.clean).not.toMatch(/[[\]]/);
    }
    expect(HEDGE_LINES.filter((h) => hedgeWords(h.text).some((w) => w.target)).length).toBeGreaterThanOrEqual(25);
    expect(hedgeWords("[I think] we [kind of] agree.").filter((w) => w.target).map((w) => w.word)).toEqual(["I", "think", "kind", "of"]);
  });
  it("every speech has all four lanes and one signpost per point", () => {
    for (const s of SPEECHES) {
      for (const l of LANES) expect(s.sentences.some((x) => x.lane === l.id), `${s.id} ${l.id}`).toBe(true);
      expect(s.sentences.filter((x) => /\[/.test(x.text)).length).toBeGreaterThanOrEqual(3);
    }
  });
  it("evidence cards cover all three buckets and upgrades point at a real option", () => {
    for (const b of ["hard", "anecdote", "none"]) expect(EVIDENCE_CARDS.filter((c) => c.bucket === b).length).toBeGreaterThanOrEqual(10);
    for (const u of UPGRADES) expect(u.options[u.answer]).toBeTruthy();
    expect(new Set([...CLAIM_PAIRS, ...HEDGE_LINES, ...SPEECHES, ...EVIDENCE_CARDS, ...UPGRADES].map((x) => x.id)).size)
      .toBe(CLAIM_PAIRS.length + HEDGE_LINES.length + SPEECHES.length + EVIDENCE_CARDS.length + UPGRADES.length);
  });
});
