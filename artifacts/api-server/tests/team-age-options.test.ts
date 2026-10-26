import { describe, expect, it } from "vitest";
import { normalizeTeamAgeGroup, teamFeatures, TEAM_AGE_GROUP_OPTIONS } from "@workspace/api-zod";

describe("team age-group choices", () => {
  it("offers U10 through U20, then U23 and Seniors", () => {
    expect(TEAM_AGE_GROUP_OPTIONS.slice(9)).toEqual([
      ...Array.from({ length: 11 }, (_, i) => `U${i + 10}`),
      "U23",
      "Seniors",
    ]);
  });

  it("retains younger age-group choices", () => {
    expect(TEAM_AGE_GROUP_OPTIONS.slice(0, 9)).toEqual(
      Array.from({ length: 9 }, (_, i) => `U${i + 1}`),
    );
  });

  it("keeps squad names separate from age classification", () => {
    for (const name of ["Firsts", "Reserves", "U14 Blue"]) {
      expect(TEAM_AGE_GROUP_OPTIONS).not.toContain(name);
      expect(normalizeTeamAgeGroup(name)).toBeNull();
    }
  });

  it("continues recognising existing age groups outside the suggested list", () => {
    for (const age of ["U21", "U22"]) {
      expect(TEAM_AGE_GROUP_OPTIONS).not.toContain(age);
      expect(normalizeTeamAgeGroup(age)).toBe(age);
      expect(teamFeatures(age)).toMatchObject({ monitoring: true, timekeeping: false });
    }
  });
});
