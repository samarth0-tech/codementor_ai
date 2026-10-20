import { Router, type RequestHandler } from "express";
import type { DashboardService } from "./dashboard.service.js";

interface DashboardRouterDeps {
  service: DashboardService;
  authenticate: RequestHandler;
}

export function createDashboardRouter({ service, authenticate }: DashboardRouterDeps): Router {
  const router = Router();
  router.use(authenticate);

  router.get("/metrics", async (req, res, next) => {
    try {
      const user = req.user!;
      const metrics = await service.getMetrics(user.id);
      res.json(metrics);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
