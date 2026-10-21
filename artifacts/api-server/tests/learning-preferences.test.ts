import { describe, expect, it } from "vitest";
import { scoreLearningPreferences } from "../src/lib/learning-preferences";

describe("learning preference scoring", () => {
  it("preserves legacy single-choice scores", () => {
    expect(
      scoreLearningPreferences([
        ...Array(15).fill("visual"),
        ...Array(10).fill("auditory"),
        ...Array(5).fill("kinesthetic"),
      ]),
    ).toEqual({ visual: 15, auditory: 10, kinesthetic: 5 });
  });

  it("normalizes mixed selections and ignores depends answers", () => {
    const scores = scoreLearningPreferences([
      ["visual", "auditory"],
      "visual",
      "visual",
      "visual",
      "auditory",
      "auditory",
      "kinesthetic",
      "kinesthetic",
      "depends",
      "depends",
    ]);

    expect(scores).toEqual({ visual: 13, auditory: 9, kinesthetic: 8 });
    expect(scores.visual + scores.auditory + scores.kinesthetic).toBe(30);
  });

  it("returns zero scores when every answer depends on the situation", () => {
    expect(scoreLearningPreferences(Array(15).fill("depends"))).toEqual({
      visual: 0,
      auditory: 0,
      kinesthetic: 0,
    });
  });

  it("gives every answered question equal weight when multiple choices fit", () => {
    expect(
      scoreLearningPreferences([
        ["visual", "auditory", "kinesthetic"],
        ["visual"],
        ["auditory"],
      ]),
    ).toEqual({ visual: 14, auditory: 13, kinesthetic: 3 });
  });

  it("keeps all three scores at zero for an empty set", () => {
    expect(scoreLearningPreferences([])).toEqual({
      visual: 0,
      auditory: 0,
      kinesthetic: 0,
    });
  });
});
