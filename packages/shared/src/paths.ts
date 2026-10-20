import type { Difficulty } from "./constants.js";

export type StepStatus = "COMPLETED" | "CURRENT" | "LOCKED";

export interface PathStepDto {
  orderIndex: number;
  problemSlug: string;
  problemTitle: string;
  difficulty: Difficulty;
  estimatedMinutes: number;
  status: StepStatus;
  prerequisiteSlug: string | null;
  prerequisiteTitle: string | null;
}

export interface LearningPathSummaryDto {
  slug: string;
  title: string;
  description: string;
  category: string;
  difficulty: Difficulty;
  totalProblems: number;
  completedProblems: number;
  progressPercent: number;
  nextProblemSlug: string | null;
}

export interface LearningPathDetailDto {
  slug: string;
  title: string;
  description: string;
  category: string;
  difficulty: Difficulty;
  totalProblems: number;
  completedProblems: number;
  progressPercent: number;
  steps: PathStepDto[];
  nextProblemSlug: string | null;
}
