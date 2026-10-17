import { Router, type Request, type RequestHandler } from "express";
import { createLimiter, type Limits } from "../../middleware/rateLimit.js";
import type { ReviewService } from "./reviews.service.js";

interface Deps {
  service: ReviewService;
  authenticate: RequestHandler;
  limits: Limits;
}

/**
 * Mounted under /submissions next to the submissions router. `authenticate` is applied per route
 * (not router-wide) so it never runs twice for the plain submissions endpoints.
 */
export function createReviewsRouter({ service, authenticate, limits }: Deps): Router {
  const router = Router();
  // AI calls cost money: limited per signed-in USER (not per IP), on top of the daily AI quota.
  const reviewLimit = createLimiter({ ...limits.codeReview, keyBy: "user" });
  // The userId ALWAYS comes from the verified identity, never from the request.
  const me = (req: Request) => (req.user as NonNullable<Request["user"]>).id;

  router.post("/:id/review", authenticate, reviewLimit, async (req, res) => {
    const { review, created } = await service.create(me(req), String(req.params["id"]));
    res.status(created ? 201 : 200).json({ review });
  });

  router.get("/:id/review", authenticate, async (req, res) => {
    res.json({ review: await service.get(me(req), String(req.params["id"])) });
  });

  return router;
}
