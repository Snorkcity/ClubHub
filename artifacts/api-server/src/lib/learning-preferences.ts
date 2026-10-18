export type LearningModality = "visual" | "auditory" | "kinesthetic";

export function scoreLearningPreferences(answers: LearningModality[]) {
  return answers.reduce(
    (scores, answer) => {
      scores[answer] += 1;
      return scores;
    },
    { visual: 0, auditory: 0, kinesthetic: 0 },
  );
}
