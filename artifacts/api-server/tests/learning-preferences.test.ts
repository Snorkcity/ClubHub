import { describe, expect, it } from "vitest";
import { scoreLearningPreferences } from "../src/lib/learning-preferences";

describe("learning preference scoring", () => {
  it("counts each selected preference and preserves mixed results", () => {
    expect(
      scoreLearningPreferences([
        "visual",
        "auditory",
        "kinesthetic",
        "visual",
      ]),
    ).toEqual({ visual: 2, auditory: 1, kinesthetic: 1 });
  });

  it("keeps all three scores at zero for an empty set", () => {
    expect(scoreLearningPreferences([])).toEqual({
      visual: 0,
      auditory: 0,
      kinesthetic: 0,
    });
  });
});
