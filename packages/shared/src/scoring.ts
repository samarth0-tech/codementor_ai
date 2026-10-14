// Deterministic scoring. The AI only RATES each criterion from 0 to 10; every number the user
// sees (answer score, interview score, band) is computed here, by plain arithmetic that is
// unit-tested and identical on the server and in the UI. See docs/adr/0002-ai-architecture.md.

export const RUBRIC_VERSION = "v1";

export interface RubricCriterion {
  key: "correctness" | "depth" | "clarity";
  label: string;
  /** Weights sum to 1. */
  weight: number;
  description: string;
}

export const RUBRIC: readonly RubricCriterion[] = [
  {
    key: "correctness",
    label: "Technical correctness",
    weight: 0.5,
    description: "Are the statements accurate, and does the answer address what was asked?",
  },
  {
    key: "depth",
    label: "Depth of understanding",
    weight: 0.3,
    description: "Does it explain why, and mention trade-offs, edge cases and real-world concerns?",
  },
  {
    key: "clarity",
    label: "Clarity of communication",
    weight: 0.2,
    description: "Is the answer well structured, concise and easy to follow?",
  },
];

export const BANDS = [
  { min: 85, label: "Excellent" },
  { min: 70, label: "Strong" },
  { min: 50, label: "Developing" },
  { min: 0, label: "Needs work" },
] as const;

export interface CriterionRatings {
  correctness: number;
  depth: number;
  clarity: number;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const round1 = (n: number) => Math.round(n * 10) / 10;

/** Ratings (each 0-10) -> a whole-number score from 0 to 100. */
export function computeAnswerScore(ratings: CriterionRatings): number {
  const weighted = RUBRIC.reduce((sum, c) => sum + clamp(ratings[c.key], 0, 10) * c.weight, 0);
  return Math.round(weighted * 10);
}

export function bandFor(score: number): string {
  return (BANDS.find((b) => score >= b.min) ?? BANDS[BANDS.length - 1]!).label;
}

export interface EvaluatedAnswer extends CriterionRatings {
  score: number;
}

export interface ReportScores {
  overall: number;
  correctness: number;
  depth: number;
  clarity: number;
  band: string;
}

const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;

/** Averages over every evaluated answer (main questions and follow-ups count equally). */
export function computeReportScores(answers: EvaluatedAnswer[]): ReportScores {
  if (answers.length === 0) throw new Error("Cannot score an interview with no evaluated answers");
  const overall = round1(mean(answers.map((a) => a.score)));
  return {
    overall,
    correctness: round1(mean(answers.map((a) => a.correctness)) * 10),
    depth: round1(mean(answers.map((a) => a.depth)) * 10),
    clarity: round1(mean(answers.map((a) => a.clarity)) * 10),
    band: bandFor(overall),
  };
}
