import type { Verdict } from "./submissions.js";

// Code review contracts and the deterministic parts of scoring. As in the interview feature, the
// AI only RATES and WRITES; every number the student sees as a total is computed here, and the real
// test result limits what the AI may claim about correctness. See docs/adr/0005-ai-code-review.md.

export const REVIEW_PROMPT_VERSION = "code-review.v1";

/** Reviews are refused for code longer than this (keeps AI cost and prompt size bounded). */
export const MAX_REVIEW_CODE_CHARS = 20_000;

export const SEVERITIES = ["LOW", "MEDIUM", "HIGH"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const REVIEW_CRITERIA = [
  {
    key: "correctness",
    label: "Correctness",
    weight: 0.5,
    description: "Does it solve the problem, including edge cases?",
  },
  {
    key: "readability",
    label: "Readability",
    weight: 0.25,
    description: "Naming, structure, clarity.",
  },
  {
    key: "maintainability",
    label: "Maintainability",
    weight: 0.25,
    description: "Easy to change, test and reuse?",
  },
] as const;

export interface ReviewRatings {
  correctness: number;
  readability: number;
  maintainability: number;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Ratings (each 0-10) -> overall score 0-100, using the weights above. */
export function computeOverallQuality(ratings: ReviewRatings): number {
  const weighted = REVIEW_CRITERIA.reduce(
    (sum, c) => sum + clamp(ratings[c.key], 0, 10) * c.weight,
    0,
  );
  return Math.round(weighted * 10);
}

/**
 * The code was really run against tests, so that evidence limits what the AI may say about
 * correctness: code that does not compile cannot be "correct", and code that passed everything is
 * at least mostly correct.
 */
export function limitCorrectness(
  aiRating: number,
  result: { verdict: Verdict; passed: number; total: number },
): { rating: number; adjusted: boolean } {
  const rating = clamp(Math.round(aiRating), 0, 10);
  let limited = rating;
  switch (result.verdict) {
    case "ACCEPTED":
      limited = Math.max(rating, 6);
      break;
    case "COMPILE_ERROR":
      limited = Math.min(rating, 2);
      break;
    case "RUNTIME_ERROR":
      limited = Math.min(rating, 4);
      break;
    case "TIME_LIMIT":
    case "MEMORY_LIMIT":
      limited = Math.min(rating, 5);
      break;
    case "WRONG_ANSWER": {
      const fraction = result.total > 0 ? clamp(result.passed / result.total, 0, 1) : 0;
      limited = Math.min(rating, Math.floor(3 + 4 * fraction)); // 0 tests passed -> 3, all but a few -> 6
      break;
    }
    default:
      break;
  }
  return { rating: limited, adjusted: limited !== rating };
}

export interface ReviewBug {
  severity: Severity;
  title: string;
  description: string;
  /** 1-based line in the submitted code, or null when not about one line. */
  line: number | null;
  fix: string | null;
}

export interface ReviewSuggestion {
  priority: Severity;
  title: string;
  detail: string;
}

export interface CodeReviewDto {
  id: string;
  submissionId: string;
  summary: string;
  ratings: ReviewRatings;
  /** 0-100, computed by the application. */
  overallScore: number;
  /** true when the real test result changed the AI's correctness rating. */
  correctnessAdjusted: boolean;
  notes: { correctness: string; readability: string; maintainability: string };
  complexity: { time: string; space: string; explanation: string };
  bugs: ReviewBug[];
  suggestions: ReviewSuggestion[];
  strengths: string[];
  verdictAtReview: Verdict;
  createdAt: string;
}
