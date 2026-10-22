import { Router, type RequestHandler } from "express";
import { adminUserListQuerySchema, adminUpdateUserSchema } from "@codementor/shared";
import type { AdminUpdateUserInput } from "@codementor/shared";
import { requireRole } from "../../middleware/requireRole.js";
import { validateBody } from "../../middleware/validate.js";
import type { AdminService } from "./admin.service.js";

interface AdminRouterDeps {
  service: AdminService;
  authenticate: RequestHandler;
}

export function createAdminRouter({ service, authenticate }: AdminRouterDeps): Router {
  const router = Router();

  // Every admin route requires authentication + ADMIN role.
  router.use(authenticate, requireRole("ADMIN"));

  // ── Platform stats ──────────────────────────────────────────────────────
  router.get("/stats", async (_req, res, next) => {
    try {
      const stats = await service.getPlatformStats();
      res.json(stats);
    } catch (err) {
      next(err);
    }
  });

  // ── List users ──────────────────────────────────────────────────────────
  router.get("/users", async (req, res, next) => {
    try {
      const query = adminUserListQuerySchema.parse(req.query);
      const result = await service.listUsers(query);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // ── Get user detail ─────────────────────────────────────────────────────
  router.get("/users/:id", async (req, res, next) => {
    try {
      const detail = await service.getUserDetail(String(req.params["id"]));
      res.json(detail);
    } catch (err) {
      next(err);
    }
  });

  // ── Update user (role / status) ─────────────────────────────────────────
  router.patch("/users/:id", validateBody(adminUpdateUserSchema), async (req, res, next) => {
    try {
      const updated = await service.updateUser(
        String(req.params["id"]),
        req.body as AdminUpdateUserInput,
        req.user!.id,
      );
      res.json(updated);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
