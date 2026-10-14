import { Router, type RequestHandler } from "express";
import { problemListQuerySchema } from "@codementor/shared";
import type { ProblemService } from "./problems.service.js";

export function createProblemsRouter(service: ProblemService, authenticate: RequestHandler) {
  const router = Router();
  router.use(authenticate);

  router.get("/", async (req, res) => {
    // Express 5: req.query is read-only, so parse it here instead of replacing it.
    const query = problemListQuerySchema.parse(req.query);
    res.json(await service.list(query));
  });

  router.get("/:slug", async (req, res) => {
    res.json({ problem: await service.getBySlug(String(req.params["slug"])) });
  });

  return router;
}

export function createCatalogRouter(service: ProblemService, authenticate: RequestHandler) {
  const router = Router();
  // authenticate is applied per route (not router.use) because this router is mounted at the
  // API root: a router-level guard would also swallow unknown paths and turn 404s into 401s.
  router.get("/topics", authenticate, async (_req, res) => {
    res.json({ topics: await service.topics() });
  });
  router.get("/languages", authenticate, async (_req, res) => {
    res.json({ languages: await service.languages() });
  });
  return router;
}
