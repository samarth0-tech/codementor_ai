import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import type { RequestHandler } from "express";
import type { Role } from "@codementor/shared";
import { createAdminProblemsRouter } from "../src/modules/admin/admin-problems.routes.js";
import { AdminProblemService } from "../src/modules/admin/admin-problems.service.js";
import { createErrorHandler } from "../src/middleware/errorHandler.js";
import { pino } from "pino";

// ── Mock authenticate middleware ──────────────────────────────────────────

function mockAuthenticate(user?: {
  id: string;
  email: string;
  name: string;
  role: Role;
}): RequestHandler {
  return (req, _res, next) => {
    req.user = user;
    next();
  };
}

// ── Mock prisma ──────────────────────────────────────────────────────────

function createMockPrisma() {
  const problem = {
    findMany: vi.fn().mockResolvedValue([]),
    findFirst: vi.fn().mockResolvedValue(null),
    findUnique: vi.fn().mockResolvedValue(null),
    count: vi.fn().mockResolvedValue(0),
    create: vi.fn().mockResolvedValue({ id: "prob-1", slug: "two-sum" }),
    update: vi.fn().mockResolvedValue({ id: "prob-1" }),
    delete: vi.fn().mockResolvedValue({ id: "prob-1" }),
  };

  const topic = {
    findMany: vi.fn().mockResolvedValue([]),
    upsert: vi.fn().mockResolvedValue({ id: "top-1", slug: "arrays", name: "Arrays" }),
  };

  const problemTopic = {
    create: vi.fn().mockResolvedValue({}),
    deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
  };

  const problemStarterCode = {
    createMany: vi.fn().mockResolvedValue({ count: 1 }),
    deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
  };

  const testCase = {
    create: vi.fn().mockResolvedValue({
      id: "tc-1",
      problemId: "prob-1",
      input: "1 2",
      expectedOutput: "3",
      isSample: true,
      weight: 1,
      orderIndex: 0,
      explanation: "Sample 1",
    }),
    createMany: vi.fn().mockResolvedValue({ count: 1 }),
    findFirst: vi.fn().mockResolvedValue(null),
    delete: vi.fn().mockResolvedValue({ id: "tc-1" }),
  };

  const tx = {
    problem,
    topic,
    problemTopic,
    problemStarterCode,
    testCase,
  };

  return {
    problem,
    topic,
    problemTopic,
    problemStarterCode,
    testCase,
    $transaction: vi.fn(async (cb: (prismaTx: typeof tx) => Promise<unknown>) => cb(tx)),
  };
}

// ── Build test app ──────────────────────────────────────────────────────

function buildApp(
  user: { id: string; email: string; name: string; role: Role } | undefined,
  prisma: ReturnType<typeof createMockPrisma>,
) {
  const app = express();
  app.use(express.json());
  const service = new AdminProblemService(prisma as never);
  app.use(
    "/admin/problems",
    createAdminProblemsRouter({
      service,
      authenticate: mockAuthenticate(user),
    }),
  );
  app.use(createErrorHandler(pino({ level: "silent" })));
  return app;
}

const ADMIN_USER = {
  id: "admin-001",
  email: "admin@test.com",
  name: "Admin",
  role: "ADMIN" as Role,
};
const STUDENT_USER = {
  id: "student-001",
  email: "student@test.com",
  name: "Student",
  role: "STUDENT" as Role,
};

describe("Phase 18: Admin Problem & Content Authoring", () => {
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
  });

  describe("RBAC enforcement", () => {
    it("returns 403 for STUDENT users on GET /admin/problems", async () => {
      const app = buildApp(STUDENT_USER, prisma);
      const res = await request(app).get("/admin/problems");
      expect(res.status).toBe(403);
    });

    it("returns 403 for STUDENT users on POST /admin/problems", async () => {
      const app = buildApp(STUDENT_USER, prisma);
      const res = await request(app).post("/admin/problems").send({
        title: "Test Problem",
        description: "Test description",
        difficulty: "EASY",
      });
      expect(res.status).toBe(403);
    });

    it("returns 403 for STUDENT users on PUT /admin/problems/:id", async () => {
      const app = buildApp(STUDENT_USER, prisma);
      const res = await request(app).put("/admin/problems/prob-1").send({ title: "Updated" });
      expect(res.status).toBe(403);
    });

    it("returns 403 for STUDENT users on DELETE /admin/problems/:id", async () => {
      const app = buildApp(STUDENT_USER, prisma);
      const res = await request(app).delete("/admin/problems/prob-1");
      expect(res.status).toBe(403);
    });

    it("returns 401 for unauthenticated requests", async () => {
      const app = buildApp(undefined, prisma);
      const res = await request(app).get("/admin/problems");
      expect(res.status).toBe(401);
    });
  });

  describe("GET /admin/problems", () => {
    it("returns paginated problems list with test case and submission counts", async () => {
      prisma.problem.findMany.mockResolvedValue([
        {
          id: "prob-1",
          slug: "two-sum",
          title: "Two Sum",
          difficulty: "EASY",
          status: "PUBLISHED",
          timeLimitMs: 2000,
          memoryLimitKb: 256000,
          createdAt: new Date("2026-01-01"),
          updatedAt: new Date("2026-01-02"),
          topics: [{ topic: { name: "Arrays", slug: "arrays" } }],
          _count: { testCases: 5, submissions: 12 },
          testCases: [{ id: "tc-1" }],
        },
      ]);
      prisma.problem.count.mockResolvedValue(1);

      const app = buildApp(ADMIN_USER, prisma);
      const res = await request(app).get("/admin/problems");
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].slug).toBe("two-sum");
      expect(res.body.data[0].testCaseCount).toBe(5);
      expect(res.body.data[0].sampleTestCaseCount).toBe(1);
      expect(res.body.data[0].submissionCount).toBe(12);
      expect(res.body.meta.total).toBe(1);
    });
  });

  describe("POST /admin/problems", () => {
    it("creates problem with generated slug, topics, starter code, and test cases", async () => {
      prisma.problem.findUnique.mockResolvedValueOnce(null); // slug availability
      prisma.problem.create.mockResolvedValueOnce({ id: "prob-new", slug: "reverse-string" });

      // Mock getProblem response called at the end of createProblem
      prisma.problem.findFirst.mockResolvedValueOnce({
        id: "prob-new",
        slug: "reverse-string",
        title: "Reverse String",
        description: "Reverse a given string",
        inputFormat: "string",
        outputFormat: "string",
        constraints: "length <= 100",
        difficulty: "EASY",
        timeLimitMs: 2000,
        memoryLimitKb: 256000,
        status: "DRAFT",
        version: 1,
        topics: [{ topic: { name: "Strings", slug: "strings" } }],
        starterCode: [{ language: "PYTHON", code: "def solution(): pass" }],
        testCases: [
          {
            id: "tc-1",
            problemId: "prob-new",
            input: "hello",
            expectedOutput: "olleh",
            isSample: true,
            weight: 1,
            orderIndex: 0,
            explanation: null,
          },
        ],
        createdAt: new Date("2026-01-01"),
        updatedAt: new Date("2026-01-01"),
      });

      const app = buildApp(ADMIN_USER, prisma);
      const res = await request(app)
        .post("/admin/problems")
        .send({
          title: "Reverse String",
          description: "Reverse a given string",
          difficulty: "EASY",
          topicSlugs: ["strings"],
          starterCode: { PYTHON: "def solution(): pass" },
          testCases: [{ input: "hello", expectedOutput: "olleh", isSample: true }],
        });

      expect(res.status).toBe(201);
      expect(res.body.problem).toHaveProperty("id", "prob-new");
      expect(res.body.problem.slug).toBe("reverse-string");
      expect(res.body.problem.topics[0].slug).toBe("strings");
      expect(res.body.problem.starterCode.PYTHON).toBe("def solution(): pass");
      expect(res.body.problem.testCases).toHaveLength(1);
    });

    it("rejects invalid difficulty with 400", async () => {
      const app = buildApp(ADMIN_USER, prisma);
      const res = await request(app).post("/admin/problems").send({
        title: "Test",
        description: "Desc",
        difficulty: "EXTREME",
      });
      expect(res.status).toBe(400);
    });
  });

  describe("PUT /admin/problems/:id", () => {
    it("updates problem details and increments version", async () => {
      prisma.problem.findUnique.mockResolvedValueOnce({
        id: "prob-1",
        slug: "two-sum",
        topics: [],
      });

      prisma.problem.findFirst.mockResolvedValueOnce({
        id: "prob-1",
        slug: "two-sum",
        title: "Two Sum (Updated)",
        description: "Updated description",
        inputFormat: "",
        outputFormat: "",
        constraints: "",
        difficulty: "MEDIUM",
        timeLimitMs: 2000,
        memoryLimitKb: 256000,
        status: "PUBLISHED",
        version: 2,
        topics: [],
        starterCode: [],
        testCases: [],
        createdAt: new Date("2026-01-01"),
        updatedAt: new Date("2026-01-02"),
      });

      const app = buildApp(ADMIN_USER, prisma);
      const res = await request(app).put("/admin/problems/prob-1").send({
        title: "Two Sum (Updated)",
        difficulty: "MEDIUM",
        status: "PUBLISHED",
      });

      expect(res.status).toBe(200);
      expect(res.body.problem.title).toBe("Two Sum (Updated)");
      expect(res.body.problem.difficulty).toBe("MEDIUM");
      expect(res.body.problem.status).toBe("PUBLISHED");
    });

    it("returns 404 for unknown problem", async () => {
      prisma.problem.findUnique.mockResolvedValueOnce(null);
      const app = buildApp(ADMIN_USER, prisma);
      const res = await request(app).put("/admin/problems/unknown").send({ title: "Updated" });
      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /admin/problems/:id", () => {
    it("deletes problem if it has no submissions", async () => {
      prisma.problem.findUnique.mockResolvedValueOnce({
        id: "prob-1",
        _count: { submissions: 0 },
      });

      const app = buildApp(ADMIN_USER, prisma);
      const res = await request(app).delete("/admin/problems/prob-1");
      expect(res.status).toBe(200);
      expect(prisma.problem.delete).toHaveBeenCalledWith({ where: { id: "prob-1" } });
    });

    it("archives problem if it has historical submissions", async () => {
      prisma.problem.findUnique.mockResolvedValueOnce({
        id: "prob-1",
        _count: { submissions: 5 },
      });

      const app = buildApp(ADMIN_USER, prisma);
      const res = await request(app).delete("/admin/problems/prob-1");
      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/archived/i);
      expect(prisma.problem.update).toHaveBeenCalledWith({
        where: { id: "prob-1" },
        data: { status: "ARCHIVED" },
      });
    });
  });

  describe("Test case management", () => {
    it("adds a test case to a problem", async () => {
      prisma.problem.findUnique.mockResolvedValueOnce({ id: "prob-1" });

      const app = buildApp(ADMIN_USER, prisma);
      const res = await request(app).post("/admin/problems/prob-1/test-cases").send({
        input: "1 2",
        expectedOutput: "3",
        isSample: true,
        explanation: "1 + 2 = 3",
      });

      expect(res.status).toBe(201);
      expect(res.body.testCase).toHaveProperty("id", "tc-1");
      expect(res.body.testCase.expectedOutput).toBe("3");
    });

    it("deletes a test case", async () => {
      prisma.testCase.findFirst.mockResolvedValueOnce({ id: "tc-1", problemId: "prob-1" });

      const app = buildApp(ADMIN_USER, prisma);
      const res = await request(app).delete("/admin/problems/prob-1/test-cases/tc-1");
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(prisma.testCase.delete).toHaveBeenCalledWith({ where: { id: "tc-1" } });
    });
  });

  describe("GET /admin/problems/topics", () => {
    it("returns list of topics", async () => {
      prisma.topic.findMany.mockResolvedValue([
        { name: "Arrays", slug: "arrays" },
        { name: "Dynamic Programming", slug: "dynamic-programming" },
      ]);

      const app = buildApp(ADMIN_USER, prisma);
      const res = await request(app).get("/admin/problems/topics");
      expect(res.status).toBe(200);
      expect(res.body.topics).toHaveLength(2);
      expect(res.body.topics[0].slug).toBe("arrays");
    });
  });
});
