import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { SubmissionDetail } from "@codementor/shared";
import { seedDatabase } from "../src/seed/seed.js";
import { STARTER_CODE } from "../src/seed/starter-code.js";
import type { CodeExecutor, ExecutionRequest } from "../src/modules/submissions/executor.js";
import { MOCK_MARKERS } from "../src/modules/submissions/mock-executor.js";
import type { SubmissionRunner } from "../src/modules/submissions/submission.runner.js";
import { createUser, hasDb, makeTestContext, note, resetDb } from "./helpers.js";

const GOOD =
  "def solve(values):\n    total = 0\n    for value in values:\n        total += value * 2\n    return total\n\nprint(solve([1, 2, 3]))\n";

describe.skipIf(!hasDb)("submissions (mock executor)", () => {
  const ctx = makeTestContext();
  const { app, prisma } = ctx;
  let auth: string;

  beforeEach(async () => {
    await resetDb(prisma);
    await seedDatabase(prisma, { bcryptCost: 4 });
    ({ auth } = await createUser(prisma));
  });
  afterAll(() => prisma.$disconnect());

  const send = (body: object, header = auth, a = app) =>
    request(a).post("/api/v1/submissions").set("Authorization", header).send(body);
  const get = (path: string, header = auth) =>
    request(app).get(`/api/v1${path}`).set("Authorization", header);
  const body = (over: object = {}) => ({
    problem: "two-sum",
    language: "PYTHON",
    sourceCode: GOOD,
    mode: "RUN",
    ...over,
  });

  async function submitAndWait(over: object = {}, header = auth): Promise<SubmissionDetail> {
    const created = await send(body(over), header);
    expect(created.status, JSON.stringify(created.body)).toBe(202);
    for (let i = 0; i < 100; i++) {
      const res = await get(`/submissions/${created.body.submission.id}`, header);
      if (["COMPLETED", "FAILED"].includes(res.body.submission.status)) return res.body.submission;
      await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error("submission did not finish");
  }

  it("accepts a submission with 202, queued, and says the result is simulated", async () => {
    const res = await send(body());
    expect(res.status).toBe(202);
    expect(res.body.submission).toMatchObject({
      problemSlug: "two-sum",
      language: "PYTHON",
      mode: "RUN",
      executor: "mock",
      totalCount: 2,
    });
    expect(["QUEUED", "RUNNING", "COMPLETED"]).toContain(res.body.submission.status);
  });

  it("RUN judges the sample cases only; SUBMIT judges all of them", async () => {
    const run = await submitAndWait();
    expect(run).toMatchObject({
      status: "COMPLETED",
      verdict: "ACCEPTED",
      passedCount: 2,
      totalCount: 2,
    });
    expect(run.results.every((r) => r.isSample)).toBe(true);

    const full = await submitAndWait({ mode: "SUBMIT" });
    expect(full).toMatchObject({ verdict: "ACCEPTED", passedCount: 5, totalCount: 5 });
    expect(full.results.filter((r) => !r.isSample)).toHaveLength(3);
    expect(full.maxTimeMs).toBeGreaterThan(0);
    expect(full.completedAt).not.toBeNull();
    expect(full.sourceCode).toBe(GOOD);
  });

  it("fails an untouched starter template with WRONG_ANSWER", async () => {
    const sub = await submitAndWait({ sourceCode: STARTER_CODE.PYTHON, mode: "SUBMIT" });
    expect(sub).toMatchObject({ verdict: "WRONG_ANSWER", passedCount: 0, totalCount: 5 });
  });

  it.each([
    [MOCK_MARKERS.runtimeError, "RUNTIME_ERROR"],
    [MOCK_MARKERS.timeout, "TIME_LIMIT"],
    [MOCK_MARKERS.wrongAnswer, "WRONG_ANSWER"],
  ])("shows a %s result", async (marker, verdict) => {
    const sub = await submitAndWait({ sourceCode: `${GOOD}# ${marker}` });
    expect(sub.verdict).toBe(verdict);
    expect(sub.passedCount).toBe(0);
  });

  it("reports compile errors with the compiler output and no test results", async () => {
    const sub = await submitAndWait({
      sourceCode: `${GOOD}# ${MOCK_MARKERS.compileError}`,
      mode: "SUBMIT",
    });
    expect(sub).toMatchObject({ verdict: "COMPILE_ERROR", results: [], passedCount: 0 });
    expect(sub.compileOutput).toMatch(/compilation error/);
  });

  describe("hidden test cases stay hidden", () => {
    it("sample results show everything; hidden results show only pass/fail, time and memory", async () => {
      const problem = await prisma.problem.findUniqueOrThrow({ where: { slug: "two-sum" } });
      await prisma.testCase.create({
        data: {
          problemId: problem.id,
          input: "HIDDEN-INPUT-8842",
          expectedOutput: "HIDDEN-EXPECTED-8842",
          isSample: false,
          orderIndex: 99,
        },
      });
      const sub = await submitAndWait({ mode: "SUBMIT" });
      const samples = sub.results.filter((r) => r.isSample);
      const hidden = sub.results.filter((r) => !r.isSample);
      expect(samples[0]).toMatchObject({
        input: "4 9\n2 7 11 15\n",
        expectedOutput: "0 1",
        stdout: "0 1",
      });
      expect(hidden).toHaveLength(4);
      for (const h of hidden) {
        expect(Object.keys(h).sort()).toEqual([
          "index",
          "isSample",
          "memoryKb",
          "passed",
          "timeMs",
          "verdict",
        ]);
      }
      const text = JSON.stringify(sub);
      expect(text).not.toContain("HIDDEN-INPUT-8842");
      expect(text).not.toContain("HIDDEN-EXPECTED-8842");
      // ...but they ARE stored, so the judge really did use them
      expect(await prisma.submissionResult.count({ where: { submissionId: sub.id } })).toBe(6);
    });

    it("never exposes hidden data through the history list either", async () => {
      await submitAndWait({ mode: "SUBMIT" });
      const list = await get("/submissions");
      expect(JSON.stringify(list.body)).not.toMatch(/expectedOutput|stdout|sourceCode/);
    });
  });

  describe("validation", () => {
    it.each([
      ["unknown language", { language: "RUST" }],
      ["blank code", { sourceCode: "   " }],
      ["unknown mode", { mode: "DEBUG" }],
      ["code over 64 KB", { sourceCode: "x".repeat(64 * 1024 + 1) }],
      ["malformed slug", { problem: "../etc/passwd" }],
    ])("rejects %s with 400 and stores nothing", async (_n, over) => {
      const res = await send(body(over));
      expect(res.status).toBe(400);
      expect(await prisma.submission.count()).toBe(0);
    });

    it("accepts code just under the limit", async () => {
      const filler = "x".repeat(64 * 1024 - GOOD.length - 4); // "# " + filler + "\n" + GOOD = exactly 64 KB
      const res = await send(body({ sourceCode: `# ${filler}\n${GOOD}` }));
      expect(res.status).toBe(202);
    });

    it("404 for unknown or unpublished problems", async () => {
      expect((await send(body({ problem: "no-such-problem" }))).status).toBe(404);
      await prisma.problem.update({ where: { slug: "two-sum" }, data: { status: "DRAFT" } });
      expect((await send(body())).status).toBe(404);
    });

    it("rejects a disabled language with LANGUAGE_NOT_SUPPORTED", async () => {
      await prisma.languageConfig.update({
        where: { language: "PYTHON" },
        data: { enabled: false },
      });
      const res = await send(body());
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("LANGUAGE_NOT_SUPPORTED");
    });

    it("requires a signed-in user", async () => {
      expect((await send(body(), await note())).status).toBe(401);
    });
  });

  describe("history and ownership", () => {
    it("lists my submissions for a problem, newest first, with pagination and no source code", async () => {
      const first = await submitAndWait();
      const second = await submitAndWait({ mode: "SUBMIT" });
      await submitAndWait({ problem: "coin-change" });
      const res = await get("/submissions?problem=two-sum&limit=1");
      expect(res.body.meta).toEqual({ page: 1, limit: 1, total: 2 });
      expect(res.body.data[0]).toMatchObject({
        id: second.id,
        mode: "SUBMIT",
        verdict: "ACCEPTED",
      });
      expect(res.body.data[0]).not.toHaveProperty("sourceCode");
      expect((await get("/submissions?problem=two-sum&limit=1&page=2")).body.data[0].id).toBe(
        first.id,
      );
      expect((await get("/submissions?limit=500")).status).toBe(400);
    });

    it("hides other users' submissions (404) and keeps lists separate", async () => {
      const mine = await submitAndWait();
      const { auth: other } = await createUser(prisma, "mallory@example.com", "Mallory");
      expect((await get(`/submissions/${mine.id}`, other)).status).toBe(404);
      expect((await get("/submissions", other)).body.data).toEqual([]);
      expect((await get("/submissions/not-a-uuid")).status).toBe(404);
    });
  });

  describe("runner behaviour", () => {
    const withExecutor = (executor: CodeExecutor) => makeTestContext({ executor });
    const wait = async (a: typeof app, id: string, header = auth) => {
      const runner = a.locals["submissionRunner"] as SubmissionRunner;
      await runner.drain();
      return (await request(a).get(`/api/v1/submissions/${id}`).set("Authorization", header)).body
        .submission;
    };

    it("marks a submission FAILED with INTERNAL_ERROR if the executor crashes", async () => {
      const broken = withExecutor({
        name: "broken",
        execute: async () => Promise.reject(new Error("boom")),
      });
      const res = await send(body(), auth, broken.app);
      const sub = await wait(broken.app, res.body.submission.id);
      expect(sub).toMatchObject({
        status: "FAILED",
        verdict: "INTERNAL_ERROR",
        executor: "broken",
      });
      await broken.prisma.$disconnect();
    });

    it("never blames the student when the executor returns nothing", async () => {
      const empty = withExecutor({
        name: "empty",
        execute: async () => ({ compileOutput: null, results: [] }),
      });
      const res = await send(body(), auth, empty.app);
      const sub = await wait(empty.app, res.body.submission.id);
      expect(sub).toMatchObject({ status: "COMPLETED", verdict: "INTERNAL_ERROR" });
      await empty.prisma.$disconnect();
    });

    it("runs at most 4 submissions at once and finishes them all", async () => {
      let active = 0;
      let peak = 0;
      const slow = withExecutor({
        name: "slow",
        async execute(req: ExecutionRequest) {
          active++;
          peak = Math.max(peak, active);
          await new Promise((r) => setTimeout(r, 40));
          active--;
          return {
            compileOutput: null,
            results: req.cases.map((c) => ({
              testCaseId: c.testCaseId,
              verdict: "ACCEPTED" as const,
              stdout: c.expectedOutput,
              stderr: null,
              timeMs: 1,
              memoryKb: 1,
            })),
          };
        },
      });
      // Ten DIFFERENT students: one student may only have a few pending submissions at once.
      const headers = await Promise.all(
        Array.from(
          { length: 10 },
          async (_, i) => (await createUser(prisma, `s${i}@example.com`, `S${i}`)).auth,
        ),
      );
      const ids = await Promise.all(
        headers.map(async (h) => (await send(body(), h, slow.app)).body.submission.id as string),
      );
      await (slow.app.locals["submissionRunner"] as SubmissionRunner).drain();
      expect(peak).toBeLessThanOrEqual(4);
      expect(peak).toBeGreaterThan(1);
      const done = await prisma.submission.findMany({ where: { id: { in: ids } } });
      expect(done.every((s) => s.status === "COMPLETED")).toBe(true);
      await slow.prisma.$disconnect();
    });

    it("recoverStale fails abandoned queued/running submissions but leaves fresh ones alone", async () => {
      const problem = await prisma.problem.findUniqueOrThrow({ where: { slug: "two-sum" } });
      const user = await prisma.user.findFirstOrThrow();
      const base = {
        userId: user.id,
        problemId: problem.id,
        language: "PYTHON" as const,
        sourceCode: "x",
        mode: "RUN" as const,
        executor: "mock",
      };
      const old = await prisma.submission.create({
        data: { ...base, status: "RUNNING", createdAt: new Date(Date.now() - 3600_000) },
      });
      const fresh = await prisma.submission.create({ data: { ...base, status: "QUEUED" } });
      const runner = app.locals["submissionRunner"] as SubmissionRunner;
      expect(await runner.recoverStale()).toBe(1);
      expect(await prisma.submission.findUniqueOrThrow({ where: { id: old.id } })).toMatchObject({
        status: "FAILED",
        verdict: "INTERNAL_ERROR",
      });
      expect((await prisma.submission.findUniqueOrThrow({ where: { id: fresh.id } })).status).toBe(
        "QUEUED",
      );
    });
  });

  it("rate limits submissions per user", async () => {
    const limited = makeTestContext({
      limits: { submissionCreate: { windowMs: 60_000, limit: 2 } },
    });
    expect((await send(body(), auth, limited.app)).status).toBe(202);
    expect((await send(body(), auth, limited.app)).status).toBe(202);
    const third = await send(body(), auth, limited.app);
    expect(third.status).toBe(429);
    expect(third.body.error.code).toBe("RATE_LIMITED");
    await (limited.app.locals["submissionRunner"] as SubmissionRunner).drain();
    await limited.prisma.$disconnect();
  });
});
