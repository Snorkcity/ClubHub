export const DEVELOPMENT_RUBRIC = [
  { key: "technical", label: "Technical", description: "Execution and control of the sport's core skills." },
  { key: "tactical", label: "Tactical", description: "Game understanding, decisions, and positioning." },
  { key: "physical", label: "Physical", description: "Movement, athletic readiness, and physical application." },
  { key: "coachabilityMindset", label: "Coachability & mindset", description: "Response to feedback, learning, and resilience." },
  { key: "effortConsistency", label: "Effort & consistency", description: "Reliable application across training and competition." },
  { key: "teamworkCommunication", label: "Teamwork & communication", description: "Positive contribution and communication with teammates." },
  { key: "attendanceReliability", label: "Attendance & reliability", description: "Dependable attendance, preparation, and punctuality." },
] as const;

export type RatingKey = (typeof DEVELOPMENT_RUBRIC)[number]["key"];

// Describe each whole category, not skills or behaviours the coach has not
// recorded. Specific observations belong in the coach's family comments.
const CATEGORY_AREAS: Record<RatingKey, string> = {
  technical: "technical competency",
  tactical: "tactical understanding",
  physical: "physical development",
  coachabilityMindset: "coachability and mindset",
  effortConsistency: "effort and consistency",
  teamworkCommunication: "teamwork and communication",
  attendanceReliability: "attendance and reliability",
};

const TEAM_STANDARD = "the team's age and competition level";
const SCORE_WORDING = {
  1: (area: string) => `Currently below the expected standard in ${area} for ${TEAM_STANDARD}, with significant development needed.`,
  2: (area: string) => `Developing towards the expected standard in ${area} for ${TEAM_STANDARD}, with improvement needed.`,
  3: (area: string) => `Meets the expected standard in ${area} for ${TEAM_STANDARD}.`,
  4: (area: string) => `Above the expected standard in ${area} for ${TEAM_STANDARD}.`,
  5: (area: string) => `Demonstrates a consistently strong standard of ${area} for ${TEAM_STANDARD}.`,
} as const;

export function familyCategories(ratings: Record<RatingKey, number>) {
  return DEVELOPMENT_RUBRIC.map((category) => {
    const score = ratings[category.key] as 1 | 2 | 3 | 4 | 5;
    return {
      key: category.key,
      label: category.label,
      score,
      narrative: SCORE_WORDING[score](CATEGORY_AREAS[category.key]),
    };
  });
}

export const DEVELOPMENT_DISCLOSURE =
  "This report reflects ratings agreed by the coaching team against the team's age and competition standard. Nahreo generated the category wording from those ratings.";