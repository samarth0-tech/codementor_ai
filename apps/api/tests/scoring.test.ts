import { describe, expect, it } from "vitest";
import {
  BANDS,
  RUBRIC,
  bandFor,
  computeAnswerScore,
  computeReportScores,
} from "@codementor/shared";

describe("scoring rubric (deterministic)", () => {
  it("criteria weights sum to exactly 1", () => {
    expect(RUBRIC.reduce((sum, c) => sum + c.weight, 0)).toBeCloseTo(1, 10);
  });

  it.each([
    [{ correctness: 10, depth: 10, clarity: 10 }, 100],
    [{ correctness: 0, depth: 0, clarity: 0 }, 0],
    [{ correctness: 10, depth: 0, clarity: 0 }, 50],
    [{ correctness: 0, depth: 10, clarity: 0 }, 30],
    [{ correctness: 0, depth: 0, clarity: 10 }, 20],
    [{ correctness: 6, depth: 5, clarity: 6 }, 57],
    [{ correctness: 9, depth: 8, clarity: 8 }, 85],
    [{ correctness: 2, depth: 2, clarity: 3 }, 22],
  ])("computeAnswerScore(%j) = %i", (ratings, expected) => {
    expect(computeAnswerScore(ratings)).toBe(expected);
  });

  it("clamps out-of-range ratings instead of trusting them", () => {
    expect(computeAnswerScore({ correctness: 99, depth: 99, clarity: 99 })).toBe(100);
    expect(computeAnswerScore({ correctness: -5, depth: -5, clarity: -5 })).toBe(0);
  });

  it("assigns bands at the documented boundaries", () => {
    expect(BANDS.map((b) => b.min)).toEqual([85, 70, 50, 0]);
    expect(bandFor(100)).toBe("Excellent");
    expect(bandFor(85)).toBe("Excellent");
    expect(bandFor(84.9)).toBe("Strong");
    expect(bandFor(70)).toBe("Strong");
    expect(bandFor(69.9)).toBe("Developing");
    expect(bandFor(50)).toBe("Developing");
    expect(bandFor(49.9)).toBe("Needs work");
    expect(bandFor(0)).toBe("Needs work");
  });

  it("averages evaluated answers into report scores", () => {
    const result = computeReportScores([
      { correctness: 8, depth: 6, clarity: 7, score: 72 },
      { correctness: 4, depth: 4, clarity: 5, score: 41 },
    ]);
    expect(result).toEqual({
      overall: 56.5,
      correctness: 60,
      depth: 50,
      clarity: 60,
      band: "Developing",
    });
  });

  it("refuses to score an interview with no evaluated answers", () => {
    expect(() => computeReportScores([])).toThrow(/no evaluated answers/);
  });
});
