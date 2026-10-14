import { Router } from "express";
import type { PrismaClient } from "../../lib/prisma.js";

export function createHealthRouter(prisma: PrismaClient): Router {
  const router = Router();

  // Liveness: is the process up? (No auth, no database.)
  router.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  // Readiness: can we reach the database?
  router.get("/health/ready", async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: "ready" });
    } catch {
      res.status(503).json({ status: "unavailable" });
    }
  });

  return router;
}
