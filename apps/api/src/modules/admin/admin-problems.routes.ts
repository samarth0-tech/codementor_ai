import { Router, type RequestHandler } from "express";
import {
  adminCreateProblemSchema,
  adminProblemListQuerySchema,
  adminTestCaseSchema,
  adminUpdateProblemSchema,
  type AdminCreateProblemInput,
  type AdminTestCaseInput,
  type AdminUpdateProblemInput,
} from "@codementor/shared";
import { requireRole } from "../../middleware/requireRole.js";
import { validateBody } from "../../middleware/validate.js";
import type { AdminProblemService } from "./admin-problems.service.js";

interface AdminProblemsRouterDeps {
  service: AdminProblemService;
  authenticate: RequestHandler;
}

export function createAdminProblemsRouter({
  service,
  authenticate,
}: AdminProblemsRouterDeps): Router {
  const router = Router();

  // All endpoints require signed-in authentication + ADMIN role
  router.use(authenticate, requireRole("ADMIN"));

  // ── Topics ───────────────────────────────────────────────────────────────
  router.get("/topics", async (_req, res, next) => {
    try {
      const topics = await service.listTopics();
      res.json({ topics });
    } catch (err) {
      next(err);
    }
  });

  // ── Problem CRUD ──────────────────────────────────────────────────────────
  router.get("/", async (req, res, next) => {
    try {
      const query = adminProblemListQuerySchema.parse(req.query);
      const result = await service.listProblems(query);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  router.post("/", validateBody(adminCreateProblemSchema), async (req, res, next) => {
    try {
      const problem = await service.createProblem(
        req.body as AdminCreateProblemInput,
        req.user!.id,
      );
      res.status(201).json({ problem });
    } catch (err) {
      next(err);
    }
  });

  router.get("/:id", async (req, res, next) => {
    try {
      const problem = await service.getProblem(String(req.params["id"]));
      res.json({ problem });
    } catch (err) {
      next(err);
    }
  });

  router.put("/:id", validateBody(adminUpdateProblemSchema), async (req, res, next) => {
    try {
      const problem = await service.updateProblem(
        String(req.params["id"]),
        req.body as AdminUpdateProblemInput,
      );
      res.json({ problem });
    } catch (err) {
      next(err);
    }
  });

  router.delete("/:id", async (req, res, next) => {
    try {
      const result = await service.deleteProblem(String(req.params["id"]));
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // ── Test Cases ────────────────────────────────────────────────────────────
  router.post("/:id/test-cases", validateBody(adminTestCaseSchema), async (req, res, next) => {
    try {
      const testCase = await service.addTestCase(
        String(req.params["id"]),
        req.body as AdminTestCaseInput,
      );
      res.status(201).json({ testCase });
    } catch (err) {
      next(err);
    }
  });

  router.delete("/:id/test-cases/:testCaseId", async (req, res, next) => {
    try {
      const result = await service.deleteTestCase(
        String(req.params["id"]),
        String(req.params["testCaseId"]),
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
