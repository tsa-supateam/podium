import { describe, expect, it } from "vitest";
import { pickCue, type CueInput } from "./Cue";

const base: CueInput = {
  now: 100, speaking: true, silenceSec: 0, wpm: 150, recentFillers: 0, lastFillerAgo: null, monotony: 0.2,
  face: true, zone: "C", zoneHeldSec: 1, sideShare: { L: 0.3, R: 0.3, samples: 400 }, notes: true,
};
const cue = (o: Partial<CueInput>) => pickCue({ ...base, ...o })?.text;

describe("coach cues", () => {
  it("says Good when nothing needs fixing", () => expect(cue({})).toBe("Good"));
  it("asks to slow down or speed up", () => {
    expect(cue({ wpm: 190 })).toBe("Slow down");
    expect(cue({ wpm: 95 })).toBe("Speed up");
  });
  it("calms filler words first", () => expect(cue({ recentFillers: 2, wpm: 190 })).toBe("Calm · pause"));
  it("looks up sooner without notes", () => {
    expect(cue({ zone: "N", zoneHeldSec: 2 })).toBe("Good");
    expect(cue({ zone: "N", zoneHeldSec: 2, notes: false })).toBe("Look up");
  });
  it("points at the ignored side of the room", () => {
    expect(cue({ sideShare: { L: 0.01, R: 0.5, samples: 400 } })).toBe("Look left");
    expect(cue({ sideShare: { L: 0.5, R: 0.02, samples: 400 } })).toBe("Look right");
  });
  it("prompts after a long silence", () => expect(cue({ speaking: false, silenceSec: 5 })).toBe("Keep going"));
});
