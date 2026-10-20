import type { LearningPathDetailDto, LearningPathSummaryDto, StepStatus } from "@codementor/shared";
import type { PrismaClient } from "../../lib/prisma.js";
import { PATH_DEFINITIONS, type PathDefinition } from "./paths.catalog.js";

export class PathsService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Lists all learning paths with the authenticated user's completion progress.
   * One efficient query fetches all accepted submissions for any path problem,
   * then progress is computed in-memory.
   */
  async listPaths(userId: string): Promise<LearningPathSummaryDto[]> {
    const allSlugs = PATH_DEFINITIONS.flatMap((p) => p.problemSlugs.map((s) => s.slug));

    const acceptedSlugs = await this.getAcceptedSlugs(userId, allSlugs);

    return PATH_DEFINITIONS.map((def) => this.toSummary(def, acceptedSlugs));
  }

  /**
   * Returns a single learning path with step-by-step details and per-step status.
   */
  async getPath(userId: string, pathSlug: string): Promise<LearningPathDetailDto | null> {
    const def = PATH_DEFINITIONS.find((p) => p.slug === pathSlug);
    if (!def) return null;

    const stepSlugs = def.problemSlugs.map((s) => s.slug);

    // Fetch accepted slugs and problem metadata in parallel.
    const [acceptedSlugs, problems] = await Promise.all([
      this.getAcceptedSlugs(userId, stepSlugs),
      this.prisma.problem.findMany({
        where: { slug: { in: stepSlugs }, status: "PUBLISHED" },
        select: { slug: true, title: true, difficulty: true },
      }),
    ]);

    const problemMap = new Map(problems.map((p) => [p.slug, p]));

    const steps = def.problemSlugs.map((step, idx) => {
      const problem = problemMap.get(step.slug);
      const isCompleted = acceptedSlugs.has(step.slug);

      // Prerequisite met if there's no prerequisite or the prerequisite is completed.
      const prerequisiteMet =
        step.prerequisiteSlug === null || acceptedSlugs.has(step.prerequisiteSlug);

      let status: StepStatus;
      if (isCompleted) {
        status = "COMPLETED";
      } else if (prerequisiteMet) {
        status = "CURRENT";
      } else {
        status = "LOCKED";
      }

      const prereqProblem = step.prerequisiteSlug ? problemMap.get(step.prerequisiteSlug) : null;

      return {
        orderIndex: idx,
        problemSlug: step.slug,
        problemTitle: problem?.title ?? step.slug,
        difficulty: problem?.difficulty ?? def.difficulty,
        estimatedMinutes: step.estimatedMinutes,
        status,
        prerequisiteSlug: step.prerequisiteSlug,
        prerequisiteTitle: prereqProblem?.title ?? step.prerequisiteSlug,
      };
    });

    const completedCount = steps.filter((s) => s.status === "COMPLETED").length;
    const totalCount = steps.length;

    // Next problem is the first non-completed step that is CURRENT (not LOCKED).
    const nextStep = steps.find((s) => s.status === "CURRENT");

    return {
      slug: def.slug,
      title: def.title,
      description: def.description,
      category: def.category,
      difficulty: def.difficulty,
      totalProblems: totalCount,
      completedProblems: completedCount,
      progressPercent: totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0,
      steps,
      nextProblemSlug: nextStep?.problemSlug ?? null,
    };
  }

  // ── Helpers ────────────────────────────────────────────────────

  /** Returns the set of problem slugs the user has solved (ACCEPTED + SUBMIT mode). */
  private async getAcceptedSlugs(userId: string, slugs: string[]): Promise<Set<string>> {
    if (slugs.length === 0) return new Set();

    const rows = await this.prisma.submission.findMany({
      where: {
        userId,
        mode: "SUBMIT",
        status: "COMPLETED",
        verdict: "ACCEPTED",
        problem: { slug: { in: slugs } },
      },
      select: { problem: { select: { slug: true } } },
      distinct: ["problemId"],
    });

    return new Set(rows.map((r) => r.problem.slug));
  }

  private toSummary(def: PathDefinition, acceptedSlugs: Set<string>): LearningPathSummaryDto {
    const total = def.problemSlugs.length;
    const completed = def.problemSlugs.filter((s) => acceptedSlugs.has(s.slug)).length;

    // Next problem: first problem in the path whose prerequisite is met but not yet completed.
    let nextProblemSlug: string | null = null;
    for (const step of def.problemSlugs) {
      if (acceptedSlugs.has(step.slug)) continue;
      const prereqMet = step.prerequisiteSlug === null || acceptedSlugs.has(step.prerequisiteSlug);
      if (prereqMet) {
        nextProblemSlug = step.slug;
        break;
      }
    }

    return {
      slug: def.slug,
      title: def.title,
      description: def.description,
      category: def.category,
      difficulty: def.difficulty,
      totalProblems: total,
      completedProblems: completed,
      progressPercent: total > 0 ? Math.round((completed / total) * 100) : 0,
      nextProblemSlug,
    };
  }
}
