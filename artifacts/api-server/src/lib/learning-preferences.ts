export type LearningModality = "visual" | "auditory" | "kinesthetic";
export type LearningPreferenceAnswer = LearningModality | LearningModality[] | "depends";

export function scoreLearningPreferences(answers: LearningPreferenceAnswer[]) {
  const totals: Record<LearningModality, number> = {
    visual: 0,
    auditory: 0,
    kinesthetic: 0,
  };

  for (const answer of answers) {
    if (answer === "depends") continue;
    const selected = Array.isArray(answer) ? answer : [answer];
    if (selected.length === 0) continue;
    const pointsInSixths = 6 / selected.length;
    for (const modality of selected) {
      totals[modality] += pointsInSixths;
    }
  }

  const total = totals.visual + totals.auditory + totals.kinesthetic;
  if (total === 0) return { visual: 0, auditory: 0, kinesthetic: 0 };

  const modalities: LearningModality[] = ["visual", "auditory", "kinesthetic"];
  const scaledNumerators = modalities.map((modality) => totals[modality] * 30);
  const scores = scaledNumerators.map((numerator) => Math.floor(numerator / total));
  let remaining = 30 - scores.reduce((sum, score) => sum + score, 0);

  const remainderOrder = scaledNumerators
    .map((numerator, index) => ({ index, remainder: numerator % total }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);

  for (const { index } of remainderOrder) {
    if (remaining === 0) break;
    scores[index] += 1;
    remaining -= 1;
  }

  return {
    visual: scores[0],
    auditory: scores[1],
    kinesthetic: scores[2],
  };
}
