import { describe, expect, it } from "vitest";
import { AI_EVALUATION_DISCLAIMER, generateImprovementPlan } from "@codementor/shared";

describe("generateImprovementPlan", () => {
  it("includes the standard AI evaluation disclaimer", () => {
    const plan = generateImprovementPlan({
      topic: "System Design",
      weaknesses: ["Trade-off analysis"],
      recommendations: ["Learn caching strategies"],
      difficulty: "MEDIUM",
    });

    expect(plan.disclaimer).toBe(AI_EVALUATION_DISCLAIMER);
    expect(plan.disclaimer).toContain("AI evaluation model based on interview rubrics");
  });

  it("recommends dynamic programming problems when topic or weaknesses involve DP", () => {
    const plan = generateImprovementPlan({
      topic: "Dynamic Programming and Recursion",
      weaknesses: ["Memoization state transitions", "Unbounded subproblems"],
      recommendations: ["Practice bottom-up table building"],
      difficulty: "MEDIUM",
    });

    const slugs = plan.suggestedProblems.map((p) => p.slug);
    expect(
      slugs.includes("climbing-stairs") ||
        slugs.includes("coin-change") ||
        slugs.includes("longest-common-subsequence"),
    ).toBe(true);
  });

  it("recommends graph and tree problems for traversal weaknesses", () => {
    const plan = generateImprovementPlan({
      topic: "Graph Traversal",
      weaknesses: ["BFS queue handling", "Grid matrix boundaries"],
      recommendations: ["Review visited set techniques"],
      difficulty: "MEDIUM",
    });

    const slugs = plan.suggestedProblems.map((p) => p.slug);
    expect(slugs).toContain("number-of-islands");
  });

  it("provides fallback advice and target areas when empty lists provided", () => {
    const plan = generateImprovementPlan({
      topic: "General Algorithms",
      weaknesses: [],
      recommendations: [],
      difficulty: "EASY",
    });

    expect(plan.targetAreas.length).toBeGreaterThan(0);
    expect(plan.keyAdvice.length).toBeGreaterThan(0);
    expect(plan.suggestedProblems).toHaveLength(3);
  });
});
