import type { Difficulty } from "@codementor/shared";

export interface PathDefinition {
  slug: string;
  title: string;
  description: string;
  category: string;
  difficulty: Difficulty;
  problemSlugs: { slug: string; estimatedMinutes: number; prerequisiteSlug: string | null }[];
}

export const PATH_DEFINITIONS: PathDefinition[] = [
  {
    slug: "foundations-and-arrays",
    title: "Programming Foundations & Arrays",
    description:
      "Master linear scan, pointer manipulation, and fundamental array patterns essential for technical interviews.",
    category: "Data Structures & Algorithms",
    difficulty: "EASY",
    problemSlugs: [
      { slug: "two-sum", estimatedMinutes: 20, prerequisiteSlug: null },
      { slug: "reverse-words", estimatedMinutes: 20, prerequisiteSlug: "two-sum" },
      { slug: "maximum-subarray", estimatedMinutes: 30, prerequisiteSlug: "reverse-words" },
    ],
  },
  {
    slug: "stacks-and-searching",
    title: "Linear Structures & Binary Search",
    description:
      "Deep dive into stack mechanics, string parsing, and logarithmic binary search paradigms.",
    category: "Core Problem Solving",
    difficulty: "EASY",
    problemSlugs: [
      { slug: "valid-parentheses", estimatedMinutes: 20, prerequisiteSlug: null },
      { slug: "binary-search", estimatedMinutes: 20, prerequisiteSlug: "valid-parentheses" },
    ],
  },
  {
    slug: "dynamic-programming-mastery",
    title: "Dynamic Programming & Optimization",
    description:
      "From 1D state transitions to 2D subproblems: master recursion with memoization and bottom-up DP.",
    category: "Algorithmic Paradigms",
    difficulty: "MEDIUM",
    problemSlugs: [
      { slug: "climbing-stairs", estimatedMinutes: 20, prerequisiteSlug: null },
      { slug: "coin-change", estimatedMinutes: 35, prerequisiteSlug: "climbing-stairs" },
      { slug: "longest-common-subsequence", estimatedMinutes: 40, prerequisiteSlug: "coin-change" },
    ],
  },
  {
    slug: "graphs-and-advanced",
    title: "Graph Traversal & Hard Optimization",
    description:
      "Tackle 2D grid matrix traversals and complex two-pointer optimization techniques.",
    category: "Advanced Algorithms",
    difficulty: "HARD",
    problemSlugs: [
      { slug: "number-of-islands", estimatedMinutes: 35, prerequisiteSlug: null },
      { slug: "trapping-rain-water", estimatedMinutes: 45, prerequisiteSlug: "number-of-islands" },
    ],
  },
];
