import { Router, type RequestHandler } from "express";
import type { PathsService } from "./paths.service.js";

interface PathsRouterDeps {
  service: PathsService;
  authenticate: RequestHandler;
}

export function createPathsRouter({ service, authenticate }: PathsRouterDeps): Router {
  const router = Router();
  router.use(authenticate);

  /** GET /api/v1/paths — list all learning paths with user progress */
  router.get("/", async (req, res, next) => {
    try {
      const user = req.user!;
      const paths = await service.listPaths(user.id);
      res.json(paths);
    } catch (err) {
      next(err);
    }
  });

  /** GET /api/v1/paths/:slug — single path detail with step statuses */
  router.get("/:slug", async (req, res, next) => {
    try {
      const user = req.user!;
      const detail = await service.getPath(user.id, req.params.slug);
      if (!detail) {
        res.status(404).json({ error: "PATH_NOT_FOUND" });
        return;
      }
      res.json(detail);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
