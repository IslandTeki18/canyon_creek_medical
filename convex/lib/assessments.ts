import type { FormDefinition, Answers } from "./forms";

export type AssessmentScoring = {
  fields: { key: string; weight: number }[];
  interpretations: { min: number; max: number; label: string }[];
};

export function validateAssessmentScoring(
  definition: FormDefinition,
  scoring: AssessmentScoring,
): AssessmentScoring {
  const numeric = new Set(
    definition.sections
      .flatMap((section) => section.fields)
      .filter((field) => field.type === "number")
      .map((field) => field.key),
  );
  if (
    scoring.fields.length === 0 ||
    scoring.fields.some(
      ({ key, weight }) => !numeric.has(key) || !Number.isFinite(weight),
    )
  ) {
    throw new Error("Assessment scoring must reference numeric form fields");
  }
  for (const range of scoring.interpretations) {
    if (
      !Number.isFinite(range.min) ||
      !Number.isFinite(range.max) ||
      range.min > range.max ||
      !range.label.trim()
    ) {
      throw new Error("Invalid interpretation range");
    }
  }
  return scoring;
}

export function scoreAssessment(
  scoring: AssessmentScoring,
  answers: Answers,
): { score: number; interpretation?: string } {
  const score = scoring.fields.reduce((total, { key, weight }) => {
    const answer = answers[key];
    return total + (typeof answer === "number" ? answer * weight : 0);
  }, 0);
  return {
    score,
    interpretation: scoring.interpretations.find(
      (range) => score >= range.min && score <= range.max,
    )?.label,
  };
}
