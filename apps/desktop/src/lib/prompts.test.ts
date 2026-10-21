import { describe, expect, it } from "vitest";
import { CATEGORIES, PROMPTS, randomPrompt } from "./prompts";

describe("prompts", () => {
  it("has 200 unique prompts in 10 categories", () => {
    expect(PROMPTS).toHaveLength(200);
    expect(new Set(PROMPTS.map((p) => p.text)).size).toBe(200);
    expect(CATEGORIES).toHaveLength(10);
  });
  it("picks a different prompt than the current one, within a category", () => {
    const cur = PROMPTS[0];
    for (let i = 0; i < 50; i++) {
      const p = randomPrompt(cur.category, cur.text);
      expect(p.category).toBe(cur.category);
      expect(p.text).not.toBe(cur.text);
    }
  });
});
