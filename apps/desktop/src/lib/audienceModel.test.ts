import { describe, expect, it } from "vitest";
import { avatarBoredom, countStates, makeAudience, stepAudience } from "./audienceModel";

const run = (secs: number, B: number, zone = {}) => {
  const a = makeAudience(15, 7);
  for (let t = 0; t < secs; t += 0.25) stepAudience(a, 0.25, B, zone, false);
  return a;
};

describe("audience", () => {
  it("is deterministic for a seed", () => {
    expect(makeAudience(15, 7).map((a) => a.theta)).toEqual(makeAudience(15, 7).map((a) => a.theta));
  });
  it("gets bored when the Boredom Index stays high, engaged when low", () => {
    expect(countStates(run(10, 0.9)).bored).toBeGreaterThan(10);
    expect(countStates(run(10, 0.1)).engaged).toBeGreaterThan(10);
  });
  it("does not flicker: needs the condition to hold before switching", () => {
    expect(countStates(run(1, 0.95)).bored).toBe(0);
  });
  it("sections the speaker ignores get more bored than ones they look at", () => {
    const a = makeAudience(15, 7)[0]; // section L
    const lookedAt = avatarBoredom(0.5, { L: 0.8, C: 0.2, R: 0 }, { ...a, theta: 0 });
    const ignored = avatarBoredom(0.5, { L: 0, C: 0.5, R: 0.5 }, { ...a, theta: 0 });
    expect(ignored).toBeGreaterThan(0.5);
    expect(lookedAt).toBeLessThan(0.5);
  });
});
