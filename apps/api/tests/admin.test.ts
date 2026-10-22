import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import type { RequestHandler } from "express";

import type { Role } from "@codementor/shared";

/*
 * Phase 17: Admin Panel & User Management tests.
 *
 * These tests verify:
 * 1. Only ADMIN users can access /admin/* endpoints.
 * 2. STUDENT users receive 403 Forbidden.
 * 3. Unauthenticated requests receive 401 Unauthorized.
 * 4. Admin can list users, get details, and update roles/status.
 * 5. Admin cannot self-modify (self-demotion/suspension guard).
 * 6. Platform-wide statistics endpoint returns expected shape.
 */

// ── Mock authenticate middleware ──────────────────────────────────────────

function mockAuthenticate(user: Express.Request["user"]): RequestHandler {
  return (req, _res, next) => {
    req.user = user;
    next();
  };
}

// ── Mock prisma ──────────────────────────────────────────────────────────

function createMockPrisma() {
  return {
    user: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(0),
      update: vi.fn().mockResolvedValue({}),
    },
    interview: {
      count: vi.fn().mockResolvedValue(0),
      aggregate: vi.fn().mockResolvedValue({ _avg: { overallScore: null } }),
    },
    submission: {
      count: vi.fn().mockResolvedValue(0),
    },
    codeReview: {
      count: vi.fn().mockResolvedValue(0),
      aggregate: vi.fn().mockResolvedValue({ _avg: { overallScore: null } }),
    },
    resume: {
      count: vi.fn().mockResolvedValue(0),
    },
    aiCall: {
      count: vi.fn().mockResolvedValue(0),
    },
    problem: {
      count: vi.fn().mockResolvedValue(0),
    },
  };
}

// ── Build test app ──────────────────────────────────────────────────────

import { createAdminRouter } from "../src/modules/admin/admin.routes.js";
import { AdminService } from "../src/modules/admin/admin.service.js";
import { createErrorHandler } from "../src/middleware/errorHandler.js";
import { pino } from "pino";

function buildApp(user: Express.Request["user"], prisma: ReturnType<typeof createMockPrisma>) {
  const app = express();
  app.use(express.json());
  const service = new AdminService(prisma as never);
  app.use(
    "/admin",
    createAdminRouter({
      service,
      authenticate: mockAuthenticate(user),
    }),
  );
  // Standard app error handler (handles ZodError, AppError, etc.)
  app.use(createErrorHandler(pino({ level: "silent" })));
  return app;
}

// ── Tests ────────────────────────────────────────────────────────────────

const ADMIN_USER: { id: string; email: string; name: string; role: Role } = {
  id: "admin-001",
  email: "admin@test.com",
  name: "Admin",
  role: "ADMIN",
};
const STUDENT_USER: { id: string; email: string; name: string; role: Role } = {
  id: "student-001",
  email: "student@test.com",
  name: "Student",
  role: "STUDENT",
};

describe("Phase 17: Admin Panel", () => {
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
  });

  describe("RBAC enforcement", () => {
    it("returns 403 for STUDENT users on GET /admin/stats", async () => {
      const app = buildApp(STUDENT_USER, prisma);
      const res = await request(app).get("/admin/stats");
      expect(res.status).toBe(403);
    });

    it("returns 403 for STUDENT users on GET /admin/users", async () => {
      const app = buildApp(STUDENT_USER, prisma);
      const res = await request(app).get("/admin/users");
      expect(res.status).toBe(403);
    });

    it("returns 403 for STUDENT users on GET /admin/users/:id", async () => {
      const app = buildApp(STUDENT_USER, prisma);
      const res = await request(app).get("/admin/users/some-id");
      expect(res.status).toBe(403);
    });

    it("returns 403 for STUDENT users on PATCH /admin/users/:id", async () => {
      const app = buildApp(STUDENT_USER, prisma);
      const res = await request(app).patch("/admin/users/some-id").send({ role: "ADMIN" });
      expect(res.status).toBe(403);
    });

    it("returns 401 for unauthenticated users", async () => {
      const app = buildApp(undefined, prisma);
      const res = await request(app).get("/admin/stats");
      expect(res.status).toBe(401);
    });
  });

  describe("GET /admin/stats", () => {
    it("returns platform stats for admin", async () => {
      const app = buildApp(ADMIN_USER, prisma);
      const res = await request(app).get("/admin/stats");
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("users");
      expect(res.body).toHaveProperty("interviews");
      expect(res.body).toHaveProperty("submissions");
      expect(res.body).toHaveProperty("reviews");
      expect(res.body).toHaveProperty("problems");
      expect(res.body).toHaveProperty("aiCalls");
      expect(res.body.users).toHaveProperty("total");
      expect(res.body.users).toHaveProperty("active");
      expect(res.body.users).toHaveProperty("suspended");
      expect(res.body.users).toHaveProperty("registeredToday");
    });
  });

  describe("GET /admin/users", () => {
    it("returns paginated user list for admin", async () => {
      prisma.user.findMany.mockResolvedValue([
        {
          id: "u-1",
          email: "user1@test.com",
          name: "User One",
          role: "STUDENT",
          status: "ACTIVE",
          lastLoginAt: null,
          createdAt: new Date("2026-01-01"),
          _count: { interviews: 3, submissions: 10 },
        },
      ]);
      prisma.user.count.mockResolvedValue(1);

      const app = buildApp(ADMIN_USER, prisma);
      const res = await request(app).get("/admin/users");
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].email).toBe("user1@test.com");
      expect(res.body.data[0].interviewCount).toBe(3);
      expect(res.body.data[0].submissionCount).toBe(10);
      expect(res.body.meta.total).toBe(1);
      expect(res.body.meta.page).toBe(1);
    });

    it("accepts filter query parameters", async () => {
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);

      const app = buildApp(ADMIN_USER, prisma);
      const res = await request(app).get("/admin/users?role=ADMIN&status=ACTIVE&search=admin");
      expect(res.status).toBe(200);

      // Verify the query was called with the right filters
      const callArgs = prisma.user.findMany.mock.calls[0]?.[0] as {
        where: Record<string, unknown>;
      };
      expect(callArgs.where).toHaveProperty("role", "ADMIN");
      expect(callArgs.where).toHaveProperty("status", "ACTIVE");
      expect(callArgs.where).toHaveProperty("OR");
    });
  });

  describe("GET /admin/users/:id", () => {
    it("returns user detail for existing user", async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: "u-1",
        email: "user1@test.com",
        name: "User One",
        role: "STUDENT",
        status: "ACTIVE",
        lastLoginAt: null,
        createdAt: new Date("2026-01-01"),
        updatedAt: new Date("2026-01-02"),
      });

      const app = buildApp(ADMIN_USER, prisma);
      const res = await request(app).get("/admin/users/u-1");
      expect(res.status).toBe(200);
      expect(res.body.id).toBe("u-1");
      expect(res.body.stats).toHaveProperty("totalInterviews");
      expect(res.body.stats).toHaveProperty("totalSubmissions");
      expect(res.body.stats).toHaveProperty("totalAiCalls");
    });

    it("returns 404 for non-existent user", async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      const app = buildApp(ADMIN_USER, prisma);
      const res = await request(app).get("/admin/users/nonexistent");
      expect(res.status).toBe(404);
    });
  });

  describe("PATCH /admin/users/:id", () => {
    it("updates user role", async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce({ id: "u-1" }) // existence check
        .mockResolvedValueOnce({
          // getUserDetail call after update
          id: "u-1",
          email: "user1@test.com",
          name: "User One",
          role: "ADMIN",
          status: "ACTIVE",
          lastLoginAt: null,
          createdAt: new Date("2026-01-01"),
          updatedAt: new Date("2026-01-02"),
        });

      const app = buildApp(ADMIN_USER, prisma);
      const res = await request(app).patch("/admin/users/u-1").send({ role: "ADMIN" });
      expect(res.status).toBe(200);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "u-1" },
        data: { role: "ADMIN" },
      });
    });

    it("updates user status to SUSPENDED", async () => {
      prisma.user.findUnique.mockResolvedValueOnce({ id: "u-1" }).mockResolvedValueOnce({
        id: "u-1",
        email: "user1@test.com",
        name: "User One",
        role: "STUDENT",
        status: "SUSPENDED",
        lastLoginAt: null,
        createdAt: new Date("2026-01-01"),
        updatedAt: new Date("2026-01-02"),
      });

      const app = buildApp(ADMIN_USER, prisma);
      const res = await request(app).patch("/admin/users/u-1").send({ status: "SUSPENDED" });
      expect(res.status).toBe(200);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "u-1" },
        data: { status: "SUSPENDED" },
      });
    });

    it("prevents admin from modifying self", async () => {
      const app = buildApp(ADMIN_USER, prisma);
      const res = await request(app)
        .patch(`/admin/users/${ADMIN_USER.id}`)
        .send({ status: "SUSPENDED" });
      expect(res.status).toBe(400);
      expect(res.body.error.message).toMatch(/cannot modify your own/i);
    });

    it("returns 404 for non-existent user", async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      const app = buildApp(ADMIN_USER, prisma);
      const res = await request(app).patch("/admin/users/nonexistent").send({ role: "ADMIN" });
      expect(res.status).toBe(404);
    });

    it("rejects empty body (no role or status)", async () => {
      const app = buildApp(ADMIN_USER, prisma);
      const res = await request(app).patch("/admin/users/u-1").send({});
      expect(res.status).toBe(400);
    });

    it("rejects invalid role", async () => {
      const app = buildApp(ADMIN_USER, prisma);
      const res = await request(app).patch("/admin/users/u-1").send({ role: "SUPERADMIN" });
      expect(res.status).toBe(400);
    });
  });
});
