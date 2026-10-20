import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import type { InterviewDetail, ReportDto } from "@codementor/shared";
import { AiProviderError } from "../src/modules/ai/provider.js";
import { createUser, hasDb, makeTestContext, resetDb } from "./helpers.js";

const ANSWER_TEXT =
  "A closure is a function bundled with its lexical environment. It allows access to an outer function's scope from an inner function even after the outer function has returned. Common uses include data privacy, factory functions, and event handlers.";

describe.skipIf(!hasDb)("Phase 14: Interview Reports & Improvement Plans API", () => {
  const ctx = makeTestContext();
  const { app, prisma, ai } = ctx;
  let authA: string;
  let authB: string;

  beforeEach(async () => {
    await resetDb(prisma);
    ai.reset();

    const uA = await createUser(prisma, "alice.interview@example.com", "Alice");
    authA = uA.auth;

    const uB = await createUser(prisma, "bob.interview@example.com", "Bob");
    authB = uB.auth;
  });

  async function createAndAnswerInterview(): Promise<InterviewDetail> {
    // 1. Create interview
    const createRes = await request(app)
      .post("/api/v1/interviews")
      .set("Authorization", authA)
      .send({
        topic: "Data Structures & Dynamic Programming",
        difficulty: "MEDIUM",
        questionCount: 3,
        durationMinutes: 30,
      });

    expect(createRes.status).toBe(201);
    const interview = createRes.body.interview as InterviewDetail;

    // 2. Submit answer to question 1
    const ansRes = await request(app)
      .post(`/api/v1/interviews/${interview.id}/answers`)
      .set("Authorization", authA)
      .send({
        questionId: interview.currentQuestionId,
        answer: ANSWER_TEXT,
      });

    expect(ansRes.status).toBe(200);
    return ansRes.body.interview as InterviewDetail;
  }

  it("completing an interview generates a comprehensive report with improvement plan and disclaimer", async () => {
    const interview = await createAndAnswerInterview();

    // Complete interview
    const completeRes = await request(app)
      .post(`/api/v1/interviews/${interview.id}/complete`)
      .set("Authorization", authA);

    expect(completeRes.status).toBe(200);
    const finished = completeRes.body.interview as InterviewDetail;
    expect(finished.status).toBe("COMPLETED");

    // Fetch report via dedicated endpoint
    const reportRes = await request(app)
      .get(`/api/v1/interviews/${interview.id}/report`)
      .set("Authorization", authA);

    expect(reportRes.status).toBe(200);
    const report = reportRes.body.report as ReportDto;

    // Verify deterministic scoring fields
    expect(report.overallScore).toBeGreaterThanOrEqual(0);
    expect(report.overallScore).toBeLessThanOrEqual(100);
    expect(report.correctnessScore).toBeGreaterThanOrEqual(0);
    expect(report.depthScore).toBeGreaterThanOrEqual(0);
    expect(report.clarityScore).toBeGreaterThanOrEqual(0);
    expect(report.band).toBeTruthy();
    expect(report.summary).toBeTruthy();

    // Verify improvement plan
    expect(report.improvementPlan).toBeDefined();
    const plan = report.improvementPlan!;

    // Disclaimer clearly distinguishes AI rubric evaluation from objective execution
    expect(plan.disclaimer).toContain("AI evaluation model based on interview rubrics");
    expect(plan.disclaimer).toContain("objective compiler or automated test runner verdicts");

    // Target areas
    expect(plan.targetAreas.length).toBeGreaterThan(0);

    // Suggested practice problems
    expect(plan.suggestedProblems.length).toBeGreaterThan(0);
    for (const prob of plan.suggestedProblems) {
      expect(prob.slug).toBeTruthy();
      expect(prob.title).toBeTruthy();
      expect(prob.difficulty).toBeTruthy();
      expect(prob.reason).toBeTruthy();
    }

    // Key advice
    expect(plan.keyAdvice.length).toBeGreaterThan(0);
  });

  it("returns 404 when requesting report for an interview that has not been completed", async () => {
    const interview = await createAndAnswerInterview();

    const reportRes = await request(app)
      .get(`/api/v1/interviews/${interview.id}/report`)
      .set("Authorization", authA);

    expect(reportRes.status).toBe(404);
  });

  it("enforces strict user ownership (IDOR isolation) on report endpoint", async () => {
    const interview = await createAndAnswerInterview();

    await request(app)
      .post(`/api/v1/interviews/${interview.id}/complete`)
      .set("Authorization", authA);

    // User B tries to view User A's report
    const resB = await request(app)
      .get(`/api/v1/interviews/${interview.id}/report`)
      .set("Authorization", authB);

    expect(resB.status).toBe(404);
  });

  it("preserves report, scores, and improvement plan when AI narrative call fails", async () => {
    const interview = await createAndAnswerInterview();

    // Enqueue errors so AI report narrative fails
    ai.enqueue(...Array.from({ length: 3 }, () => new AiProviderError("down", "unavailable")));

    const completeRes = await request(app)
      .post(`/api/v1/interviews/${interview.id}/complete`)
      .set("Authorization", authA);

    expect(completeRes.status).toBe(200);
    const finished = completeRes.body.interview as InterviewDetail;
    expect(finished.status).toBe("COMPLETED");

    const report = finished.report!;
    expect(report.aiNarrative).toBe(false);
    expect(report.overallScore).toBeGreaterThan(0);
    expect(report.summary).toContain("/100");
    expect(report.improvementPlan).toBeDefined();
    expect(report.improvementPlan?.suggestedProblems.length).toBeGreaterThan(0);
    expect(report.improvementPlan?.disclaimer).toBeTruthy();
  });
});
