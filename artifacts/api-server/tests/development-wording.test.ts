import { describe, expect, it } from "vitest";
import { DEVELOPMENT_RUBRIC, familyCategories, type RatingKey } from "../src/lib/development";

const areas = [
  "technical competency",
  "tactical understanding",
  "physical development",
  "coachability and mindset",
  "effort and consistency",
  "teamwork and communication",
  "attendance and reliability",
];

describe("broad, score-based family report wording", () => {
  it.each([1, 2, 3, 4, 5])("covers all seven categories at score %i without invented observations", (score) => {
    const ratings = Object.fromEntries(DEVELOPMENT_RUBRIC.map(({ key }) => [key, score])) as Record<RatingKey, number>;
    const categories = familyCategories(ratings);
    expect(categories).toHaveLength(7);
    categories.forEach((category, index) => {
      expect(category.key).toBe(DEVELOPMENT_RUBRIC[index].key);
      expect(category.label).toBe(DEVELOPMENT_RUBRIC[index].label);
      expect(category.score).toBe(score);
      expect(category.narrative).toContain(areas[index]);
      expect(category.narrative).toContain("the team's age and competition level");
      expect(category.narrative).not.toMatch(/first touch|passing|arrives|asks questions|standout|selection|exceptional/i);
      if (score === 1) expect(category.narrative).toContain("significant development needed");
      if (score === 2) expect(category.narrative).toContain("with improvement needed");
      if (score === 3) expect(category.narrative).toMatch(/^Meets the expected standard/);
      if (score === 4) expect(category.narrative).toMatch(/^Above the expected standard/);
      if (score === 5) expect(category.narrative).toContain("consistently strong");
    });
  });

  it("uses each category's own rating and keeps generated snapshots independent", () => {
    const ratings = {
      technical: 3, tactical: 2, physical: 1, coachabilityMindset: 4,
      effortConsistency: 5, teamworkCommunication: 3, attendanceReliability: 2,
    };
    const first = familyCategories(ratings);
    expect(first.map(({ score }) => score)).toEqual([3, 2, 1, 4, 5, 3, 2]);
    first[0].narrative = "Coach-reviewed wording";
    expect(familyCategories(ratings)[0].narrative).toBe(
      "Meets the expected standard in technical competency for the team's age and competition level.",
    );
  });
});
