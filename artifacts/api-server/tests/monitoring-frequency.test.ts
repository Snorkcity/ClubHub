import { describe, expect, it } from "vitest";
import { sessionFrequencyFlag } from "../src/routes/monitoring";

describe("monitoring session-frequency flags", () => {
  it("does not flag a normal three-session week", () => {
    expect(sessionFrequencyFlag(3, 9, 0)).toBeNull();
  });

  it("watches five sessions when the player usually does three", () => {
    expect(sessionFrequencyFlag(5, 9, 2)).toEqual({
      metric: "sessions",
      severity: "watch",
      message: "Session frequency up: 5 this week vs usual ~3; 2 external",
    });
  });

  it("alerts on six sessions when the player usually does three", () => {
    expect(sessionFrequencyFlag(6, 9, 3)).toEqual({
      metric: "sessions",
      severity: "alert",
      message: "Session frequency up: 6 this week vs usual ~3; 3 external",
    });
  });

  it("does not invent a norm without prior history", () => {
    expect(sessionFrequencyFlag(5, 0, 3)).toBeNull();
  });
});