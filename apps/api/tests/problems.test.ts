import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { SEED_PROBLEMS } from "../src/seed/problems.js";
import { seedDatabase } from "../src/seed/seed.js";
import { hasDb, makeTestContext, note, resetDb } from "./helpers.js";

describe.skipIf(!hasDb)("problems API and seeding", () => {
  const { app, prisma } = makeTestContext();
  let auth: string;

  beforeAll(async () => {
    await resetDb(prisma);
  });
  beforeEach(async () => {
    await resetDb(prisma);
    await seedDatabase(prisma, { bcryptCost: 4 });
    const user = await prisma.user.create({
      data: { email: "s@example.com", name: "S", passwordHash: "x" },
    });
    auth = await note(user.id);
  });
  afterAll(() => prisma.$disconnect());

  const get = (path: string) => request(app).get(`/api/v1${path}`).set("Authorization", auth);

  describe("seeding", () => {
    it("creates all problems, topics, languages and is idempotent", async () => {
      expect(await prisma.problem.count()).toBe(SEED_PROBLEMS.length);
      const again = await seedDatabase(prisma, { bcryptCost: 4 });
      expect(again.problemsCreated).toBe(0);
      expect(await prisma.problem.count()).toBe(SEED_PROBLEMS.length);
      expect(await prisma.languageConfig.count()).toBe(5);
    });

    it("creates the first admin only when credentials are provided, and never twice", async () => {
      expect(await prisma.user.count({ where: { role: "ADMIN" } })).toBe(0);
      const first = await seedDatabase(prisma, {
        adminEmail: "Admin@Example.com",
        adminPassword: "a-strong-seed-password",
        bcryptCost: 4,
      });
      expect(first.adminCreated).toBe(true);
      const admin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@example.com" } });
      expect(admin.role).toBe("ADMIN");
      expect(admin.passwordHash).toMatch(/^\$2[aby]\$/);
      const second = await seedDatabase(prisma, {
        adminEmail: "admin@example.com",
        adminPassword: "another-password-123",
        bcryptCost: 4,
      });
      expect(second.adminCreated).toBe(false);
    });
  });

  describe("GET /problems", () => {
    it("requires a signed-in user", async () => {
      const res = await request(app)
        .get("/api/v1/problems")
        .set("Authorization", await note());
      expect(res.status).toBe(401);
    });

    it("lists published problems with pagination metadata, easiest first", async () => {
      const res = await get("/problems?limit=5");
      expect(res.status).toBe(200);
      expect(res.body.meta).toEqual({ page: 1, limit: 5, total: SEED_PROBLEMS.length });
      expect(res.body.data).toHaveLength(5);
      expect(res.body.data[0]).toMatchObject({ difficulty: "EASY" });
      expect(res.body.data[0].topics.length).toBeGreaterThan(0);
      const page2 = await get("/problems?limit=5&page=2");
      expect(page2.body.data[0].slug).not.toBe(res.body.data[0].slug);
    });

    it("filters by difficulty, topic and title search", async () => {
      const hard = await get("/problems?difficulty=HARD");
      expect(hard.body.data.map((p: { slug: string }) => p.slug)).toEqual(["trapping-rain-water"]);
      const dp = await get("/problems?topic=dynamic-programming");
      expect(dp.body.data.length).toBeGreaterThanOrEqual(4);
      const search = await get("/problems?q=ISLAND");
      expect(search.body.data.map((p: { slug: string }) => p.slug)).toEqual(["number-of-islands"]);
    });

    it("hides DRAFT and ARCHIVED problems", async () => {
      await prisma.problem.update({ where: { slug: "two-sum" }, data: { status: "DRAFT" } });
      await prisma.problem.update({ where: { slug: "coin-change" }, data: { status: "ARCHIVED" } });
      const res = await get("/problems?limit=50");
      const slugs = res.body.data.map((p: { slug: string }) => p.slug);
      expect(slugs).not.toContain("two-sum");
      expect(slugs).not.toContain("coin-change");
      expect((await get("/problems/two-sum")).status).toBe(404);
    });

    it.each(["limit=0", "limit=500", "page=0", "difficulty=IMPOSSIBLE", "topic=Bad%20Slug"])(
      "rejects invalid query %s with 400",
      async (qs) => {
        const res = await get(`/problems?${qs}`);
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe("VALIDATION_FAILED");
      },
    );
  });

  describe("GET /problems/:slug", () => {
    it("returns the statement, sample cases and starter code for all languages", async () => {
      const res = await get("/problems/two-sum");
      expect(res.status).toBe(200);
      const p = res.body.problem;
      expect(p).toMatchObject({ slug: "two-sum", difficulty: "EASY", timeLimitMs: 2000 });
      expect(p.samples).toHaveLength(2);
      expect(p.samples[0]).toEqual({
        input: "4 9\n2 7 11 15\n",
        expectedOutput: "0 1",
        explanation: "2 + 7 = 9",
      });
      expect(Object.keys(p.starterCode).sort()).toEqual([
        "C",
        "CPP",
        "JAVA",
        "JAVASCRIPT",
        "PYTHON",
      ]);
    });

    it("NEVER exposes hidden test cases", async () => {
      const problem = await prisma.problem.findUniqueOrThrow({ where: { slug: "two-sum" } });
      await prisma.testCase.create({
        data: {
          problemId: problem.id,
          input: "SECRET-HIDDEN-INPUT-7731",
          expectedOutput: "SECRET-HIDDEN-ANSWER-9954",
          isSample: false,
          orderIndex: 99,
        },
      });
      const res = await get("/problems/two-sum");
      const text = JSON.stringify(res.body);
      expect(text).not.toContain("SECRET-HIDDEN");
      expect(res.body.problem.samples).toHaveLength(2);
      // also not via the list endpoint
      expect(JSON.stringify((await get("/problems?limit=50")).body)).not.toContain("SECRET-HIDDEN");
    });

    it("returns 404 for unknown or malformed slugs", async () => {
      expect((await get("/problems/does-not-exist")).status).toBe(404);
      expect((await get("/problems/Bad_Slug!")).status).toBe(404);
    });
  });

  describe("catalog", () => {
    it("lists topics and enabled languages without Judge0 internals", async () => {
      const topics = await get("/topics");
      expect(topics.body.topics.length).toBeGreaterThanOrEqual(8);
      const languages = await get("/languages");
      expect(languages.body.languages).toHaveLength(5);
      expect(JSON.stringify(languages.body)).not.toMatch(/judge0/i);
      await prisma.languageConfig.update({ where: { language: "C" }, data: { enabled: false } });
      expect((await get("/languages")).body.languages).toHaveLength(4);
    });
  });
});
