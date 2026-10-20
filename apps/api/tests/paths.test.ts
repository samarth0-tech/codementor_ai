import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import type { LearningPathDetailDto, LearningPathSummaryDto } from "@codementor/shared";
import { createUser, hasDb, makeTestContext, resetDb } from "./helpers.js";

describe.skipIf(!hasDb)("Paths API", () => {
  const ctx = makeTestContext();
  const { app, prisma } = ctx;
  let authA: string;
  let userAId: string;
  let authB: string;

  beforeEach(async () => {
    await resetDb(prisma);
    const uA = await createUser(prisma, "alice@example.com", "Alice");
    authA = uA.auth;
    userAId = uA.user.id;

    const uB = await createUser(prisma, "bob@example.com", "Bob");
    authB = uB.auth;

    // Create the seed problems that the path catalog references.
    const slugs = [
      { slug: "two-sum", title: "Two Sum", difficulty: "EASY" as const },
      { slug: "reverse-words", title: "Reverse Words", difficulty: "EASY" as const },
      { slug: "maximum-subarray", title: "Maximum Subarray", difficulty: "MEDIUM" as const },
      { slug: "valid-parentheses", title: "Valid Parentheses", difficulty: "EASY" as const },
      { slug: "binary-search", title: "Binary Search", difficulty: "EASY" as const },
      { slug: "climbing-stairs", title: "Climbing Stairs", difficulty: "EASY" as const },
      { slug: "coin-change", title: "Coin Change", difficulty: "MEDIUM" as const },
      {
        slug: "longest-common-subsequence",
        title: "Longest Common Subsequence",
        difficulty: "MEDIUM" as const,
      },
      { slug: "number-of-islands", title: "Number of Islands", difficulty: "MEDIUM" as const },
      {
        slug: "trapping-rain-water",
        title: "Trapping Rain Water",
        difficulty: "HARD" as const,
      },
    ];

    for (const s of slugs) {
      await prisma.problem.create({
        data: {
          slug: s.slug,
          title: s.title,
          description: `Solve ${s.title}`,
          difficulty: s.difficulty,
          status: "PUBLISHED",
        },
      });
    }
  });

  it("requires authentication", async () => {
    const res = await request(app).get("/api/v1/paths");
    expect(res.status).toBe(401);
  });

  it("lists all paths with 0% progress for a new user", async () => {
    const res = await request(app).get("/api/v1/paths").set("Authorization", authA);

    expect(res.status).toBe(200);
    const paths = res.body as LearningPathSummaryDto[];
    expect(paths).toHaveLength(4);

    for (const p of paths) {
      expect(p.completedProblems).toBe(0);
      expect(p.progressPercent).toBe(0);
      // First problem has no prerequisite so it should be the next.
      expect(p.nextProblemSlug).toBeTruthy();
    }

    // Check specific path details.
    const foundations = paths.find((p) => p.slug === "foundations-and-arrays");
    expect(foundations?.totalProblems).toBe(3);
    expect(foundations?.nextProblemSlug).toBe("two-sum");
    expect(foundations?.difficulty).toBe("EASY");
  });

  it("marks a step as COMPLETED after an ACCEPTED submission", async () => {
    // Alice solves "two-sum".
    const problem = await prisma.problem.findUniqueOrThrow({ where: { slug: "two-sum" } });
    await prisma.submission.create({
      data: {
        userId: userAId,
        problemId: problem.id,
        language: "PYTHON",
        sourceCode: "print('ok')",
        mode: "SUBMIT",
        status: "COMPLETED",
        verdict: "ACCEPTED",
        executor: "mock",
      },
    });

    const res = await request(app)
      .get("/api/v1/paths/foundations-and-arrays")
      .set("Authorization", authA);

    expect(res.status).toBe(200);
    const detail = res.body as LearningPathDetailDto;

    expect(detail.completedProblems).toBe(1);
    expect(detail.progressPercent).toBe(33); // 1/3 rounded

    // Step 0 (two-sum) = COMPLETED
    expect(detail.steps[0]!.status).toBe("COMPLETED");
    expect(detail.steps[0]!.problemSlug).toBe("two-sum");

    // Step 1 (reverse-words) = CURRENT (prerequisite two-sum is met)
    expect(detail.steps[1]!.status).toBe("CURRENT");
    expect(detail.steps[1]!.problemSlug).toBe("reverse-words");

    // Step 2 (maximum-subarray) = LOCKED (prerequisite reverse-words not met)
    expect(detail.steps[2]!.status).toBe("LOCKED");
    expect(detail.steps[2]!.problemSlug).toBe("maximum-subarray");

    // Next problem should be reverse-words.
    expect(detail.nextProblemSlug).toBe("reverse-words");
  });

  it("locks steps with unmet prerequisites", async () => {
    const res = await request(app)
      .get("/api/v1/paths/foundations-and-arrays")
      .set("Authorization", authA);

    expect(res.status).toBe(200);
    const detail = res.body as LearningPathDetailDto;

    // First step has no prerequisite -> CURRENT
    expect(detail.steps[0]!.status).toBe("CURRENT");

    // Later steps are LOCKED
    expect(detail.steps[1]!.status).toBe("LOCKED");
    expect(detail.steps[2]!.status).toBe("LOCKED");
  });

  it("returns 404 for an invalid path slug", async () => {
    const res = await request(app)
      .get("/api/v1/paths/nonexistent-path")
      .set("Authorization", authA);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("PATH_NOT_FOUND");
  });

  it("isolates progress between users", async () => {
    // Alice solves "two-sum", Bob does not.
    const problem = await prisma.problem.findUniqueOrThrow({ where: { slug: "two-sum" } });
    await prisma.submission.create({
      data: {
        userId: userAId,
        problemId: problem.id,
        language: "PYTHON",
        sourceCode: "print('ok')",
        mode: "SUBMIT",
        status: "COMPLETED",
        verdict: "ACCEPTED",
        executor: "mock",
      },
    });

    // Alice sees progress.
    const resA = await request(app).get("/api/v1/paths").set("Authorization", authA);
    const pathsA = resA.body as LearningPathSummaryDto[];
    const foundA = pathsA.find((p) => p.slug === "foundations-and-arrays")!;
    expect(foundA.completedProblems).toBe(1);

    // Bob sees zero progress.
    const resB = await request(app).get("/api/v1/paths").set("Authorization", authB);
    const pathsB = resB.body as LearningPathSummaryDto[];
    const foundB = pathsB.find((p) => p.slug === "foundations-and-arrays")!;
    expect(foundB.completedProblems).toBe(0);
  });

  it("does not count RUN mode or non-ACCEPTED submissions as progress", async () => {
    const problem = await prisma.problem.findUniqueOrThrow({ where: { slug: "two-sum" } });

    // RUN mode ACCEPTED — should NOT count.
    await prisma.submission.create({
      data: {
        userId: userAId,
        problemId: problem.id,
        language: "PYTHON",
        sourceCode: "print('ok')",
        mode: "RUN",
        status: "COMPLETED",
        verdict: "ACCEPTED",
        executor: "mock",
      },
    });

    // SUBMIT mode WRONG_ANSWER — should NOT count.
    await prisma.submission.create({
      data: {
        userId: userAId,
        problemId: problem.id,
        language: "PYTHON",
        sourceCode: "print('wrong')",
        mode: "SUBMIT",
        status: "COMPLETED",
        verdict: "WRONG_ANSWER",
        executor: "mock",
      },
    });

    const res = await request(app).get("/api/v1/paths").set("Authorization", authA);
    const paths = res.body as LearningPathSummaryDto[];
    const found = paths.find((p) => p.slug === "foundations-and-arrays")!;
    expect(found.completedProblems).toBe(0);
    expect(found.progressPercent).toBe(0);
  });
});
