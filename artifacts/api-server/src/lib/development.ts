export const DEVELOPMENT_RUBRIC = [
  { key: "technical", label: "Technical", description: "Execution and control of the sport's core skills." },
  { key: "tactical", label: "Tactical", description: "Game understanding, decisions, and positioning." },
  { key: "physical", label: "Physical", description: "Movement, athletic readiness, and physical application." },
  { key: "coachabilityMindset", label: "Coachability & mindset", description: "Response to feedback, learning, and resilience." },
  { key: "effortConsistency", label: "Effort & consistency", description: "Reliable application across training and competition." },
  { key: "teamworkCommunication", label: "Teamwork & communication", description: "Positive contribution and communication with teammates." },
  { key: "attendanceReliability", label: "Attendance & reliability", description: "Dependable attendance, preparation, and punctuality." },
] as const;

const SCORE_WORDING = {
  1: "is beginning to build this area and will benefit from patient, regular practice",
  2: "is developing in this area and is showing foundations to build on",
  3: "meets the expected team standard in this area and contributes reliably",
  4: "is performing above the expected team standard in this area with strong consistency",
  5: "is a standout at the team standard in this area and models it consistently",
} as const;

export type RatingKey = (typeof DEVELOPMENT_RUBRIC)[number]["key"];

export function familyCategories(ratings: Record<RatingKey, number>) {
  return DEVELOPMENT_RUBRIC.map((category) => {
    const score = ratings[category.key] as 1 | 2 | 3 | 4 | 5;
    return {
      key: category.key,
      label: category.label,
      score,
      narrative: `${category.label} ${SCORE_WORDING[score]}.`,
    };
  });
}

export const DEVELOPMENT_DISCLOSURE =
  "This report reflects ratings agreed by the coaching team against the team's age and competition standard. Nahreo generated the category wording from those ratings.";