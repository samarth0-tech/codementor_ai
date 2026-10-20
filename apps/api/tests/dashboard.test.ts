import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import type { DashboardMetricsDto } from "@codementor/shared";
import { createUser, hasDb, makeTestContext, resetDb } from "./helpers.js";

describe.skipIf(!hasDb)("Dashboard API", () => {
  const ctx = makeTestContext();
  const { app, prisma } = ctx;
  let authA: string;
  let userAId: string;
  let authB: string;
  let userBId: string;

  beforeEach(async () => {
    await resetDb(prisma);
    const uA = await createUser(prisma, "user-a@example.com", "User A");
    authA = uA.auth;
    userAId = uA.user.id;

    const uB = await createUser(prisma, "user-b@example.com", "User B");
    authB = uB.auth;
    userBId = uB.user.id;
  });

  it("requires authentication note", async () => {
    const res = await request(app).get("/api/v1/dashboard/metrics");
    expect(res.status).toBe(401);
  });

  it("returns zeroed metrics for a new user with no activity", async () => {
    const res = await request(app).get("/api/v1/dashboard/metrics").set("Authorization", authA);

    expect(res.status).toBe(200);
    const data = res.body as DashboardMetricsDto;

    expect(data.problems.solved).toBe(0);
    expect(data.problems.attempted).toBe(0);
    expect(data.submissions.total).toBe(0);
    expect(data.submissions.accepted).toBe(0);
    expect(data.submissions.acceptanceRate).toBe(0);
    expect(data.submissions.verdictCounts.ACCEPTED).toBe(0);
    expect(data.interviews.total).toBe(0);
    expect(data.interviews.completed).toBe(0);
    expect(data.interviews.averageScore).toBeNull();
    expect(data.interviews.latest).toBeNull();
    expect(data.reviews.total).toBe(0);
    expect(data.reviews.averageScore).toBeNull();
    expect(data.reviews.latest).toBeNull();
    expect(data.resume.hasResume).toBe(false);
    expect(data.resume.latest).toBeNull();
    expect(data.recentActivity).toEqual([]);
  });

  it("calculates metrics correctly for populated user activity and isolates users", async () => {
    // 1. Create 2 published problems: 1 Easy, 1 Medium
    const p1 = await prisma.problem.create({
      data: {
        slug: "two-sum",
        title: "Two Sum",
        description: "Find two numbers",
        difficulty: "EASY",
        status: "PUBLISHED",
      },
    });

    const p2 = await prisma.problem.create({
      data: {
        slug: "add-two",
        title: "Add Two Numbers",
        description: "Add numbers",
        difficulty: "MEDIUM",
        status: "PUBLISHED",
      },
    });

    // 2. User A submissions: 1 Accepted on p1, 1 Wrong Answer on p2
    const s1 = await prisma.submission.create({
      data: {
        userId: userAId,
        problemId: p1.id,
        language: "PYTHON",
        sourceCode: "print('solved')",
        mode: "SUBMIT",
        status: "COMPLETED",
        verdict: "ACCEPTED",
        executor: "mock",
        totalCount: 5,
        passedCount: 5,
      },
    });

    await prisma.submission.create({
      data: {
        userId: userAId,
        problemId: p2.id,
        language: "PYTHON",
        sourceCode: "print('wrong')",
        mode: "SUBMIT",
        status: "COMPLETED",
        verdict: "WRONG_ANSWER",
        executor: "mock",
        totalCount: 5,
        passedCount: 2,
      },
    });

    // 3. User A interview
    await prisma.interview.create({
      data: {
        userId: userAId,
        topic: "Algorithms",
        difficulty: "MEDIUM",
        status: "COMPLETED",
        plannedQuestionCount: 3,
        durationMinutes: 30,
        overallScore: 84.5,
        plan: [],
      },
    });

    // 4. User A code review on s1
    await prisma.codeReview.create({
      data: {
        submissionId: s1.id,
        summary: "Clean solution",
        correctnessRating: 9,
        readabilityRating: 8,
        maintainabilityRating: 8,
        overallScore: 85,
        timeComplexity: "O(n)",
        spaceComplexity: "O(1)",
        complexityNote: "Linear scan",
        details: {},
        verdictAtReview: "ACCEPTED",
        promptVersion: "review.v1",
      },
    });

    // 5. User A resume
    await prisma.resume.create({
      data: {
        userId: userAId,
        fileName: "samarth_resume.pdf",
        fileSize: 10240,
        mimeType: "application/pdf",
        extractedText: "Skills: Python, TypeScript, React",
        skills: ["Python", "TypeScript", "React"],
        technologies: ["PostgreSQL", "Docker"],
        projects: [{ title: "CodeMentor", description: "Interview platform" }],
        experience: [],
        education: [],
      },
    });

    // 6. User B activity (to verify strict user isolation)
    await prisma.submission.create({
      data: {
        userId: userBId,
        problemId: p2.id,
        language: "JAVA",
        sourceCode: "class Solution {}",
        mode: "SUBMIT",
        status: "COMPLETED",
        verdict: "ACCEPTED",
        executor: "mock",
      },
    });

    // Fetch User A dashboard metrics
    const resA = await request(app).get("/api/v1/dashboard/metrics").set("Authorization", authA);

    expect(resA.status).toBe(200);
    const dataA = resA.body as DashboardMetricsDto;

    // Problems
    expect(dataA.problems.solved).toBe(1);
    expect(dataA.problems.attempted).toBe(2);
    expect(dataA.problems.totalAvailable).toBe(2);
    expect(dataA.problems.byDifficulty.easy.solved).toBe(1);
    expect(dataA.problems.byDifficulty.medium.solved).toBe(0);

    // Submissions
    expect(dataA.submissions.total).toBe(2);
    expect(dataA.submissions.accepted).toBe(1);
    expect(dataA.submissions.acceptanceRate).toBe(50);
    expect(dataA.submissions.verdictCounts.ACCEPTED).toBe(1);
    expect(dataA.submissions.verdictCounts.WRONG_ANSWER).toBe(1);

    // Interviews
    expect(dataA.interviews.total).toBe(1);
    expect(dataA.interviews.completed).toBe(1);
    expect(dataA.interviews.averageScore).toBe(84.5);
    expect(dataA.interviews.latest?.topic).toBe("Algorithms");

    // Reviews
    expect(dataA.reviews.total).toBe(1);
    expect(dataA.reviews.averageScore).toBe(85);
    expect(dataA.reviews.latest?.problemTitle).toBe("Two Sum");

    // Resume
    expect(dataA.resume.hasResume).toBe(true);
    expect(dataA.resume.latest?.fileName).toBe("samarth_resume.pdf");
    expect(dataA.resume.latest?.skillsCount).toBe(3);
    expect(dataA.resume.latest?.projectsCount).toBe(1);

    // Recent activity
    expect(dataA.recentActivity.length).toBeGreaterThan(0);
    const kinds = dataA.recentActivity.map((a) => a.kind);
    expect(kinds).toContain("SUBMISSION");
    expect(kinds).toContain("INTERVIEW");
    expect(kinds).toContain("REVIEW");

    // User B dashboard check (must not include User A's data)
    const resB = await request(app).get("/api/v1/dashboard/metrics").set("Authorization", authB);

    expect(resB.status).toBe(200);
    const dataB = resB.body as DashboardMetricsDto;

    expect(dataB.problems.solved).toBe(1);
    expect(dataB.problems.attempted).toBe(1);
    expect(dataB.problems.byDifficulty.easy.solved).toBe(0);
    expect(dataB.problems.byDifficulty.medium.solved).toBe(1);
    expect(dataB.interviews.total).toBe(0);
    expect(dataB.reviews.total).toBe(0);
    expect(dataB.resume.hasResume).toBe(false);
  });
});
