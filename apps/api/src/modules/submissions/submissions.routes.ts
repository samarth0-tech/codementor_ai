import { Router, type Request, type RequestHandler } from "express";
import {
  createSubmissionSchema,
  submissionListQuerySchema,
  type CreateSubmissionInput,
} from "@codementor/shared";
import { createLimiter, type Limits } from "../../middleware/rateLimit.js";
import { validateBody } from "../../middleware/validate.js";
import type { SubmissionService } from "./submissions.service.js";

interface Deps {
  service: SubmissionService;
  authenticate: RequestHandler;
  limits: Limits;
}

export function createSubmissionsRouter({ service, authenticate, limits }: Deps): Router {
  const router = Router();
  router.use(authenticate);
  const createLimit = createLimiter({ ...limits.submissionCreate, keyBy: "user" });
  // The userId ALWAYS comes from the verified identity, never from the request body.
  const me = (req: Request) => (req.user as NonNullable<Request["user"]>).id;

  // 202 Accepted: the submission is queued; the client polls GET /submissions/:id for the result.
  router.post("/", createLimit, validateBody(createSubmissionSchema), async (req, res) => {
    const submission = await service.create(me(req), req.body as CreateSubmissionInput);
    res.status(202).json({ submission });
  });

  router.get("/", async (req, res) => {
    res.json(await service.list(me(req), submissionListQuerySchema.parse(req.query)));
  });

  router.get("/:id", async (req, res) => {
    res.json({ submission: await service.get(me(req), String(req.params["id"])) });
  });

  return router;
}
