import { Router, type Request, type RequestHandler } from "express";
import {
  createInterviewSchema,
  interviewListQuerySchema,
  submitAnswerSchema,
  type CreateInterviewInput,
  type SubmitAnswerInput,
} from "@codementor/shared";
import { createLimiter, type Limits } from "../../middleware/rateLimit.js";
import { validateBody } from "../../middleware/validate.js";
import type { InterviewService } from "./interviews.service.js";

interface Deps {
  service: InterviewService;
  authenticate: RequestHandler;
  limits: Limits;
}

export function createInterviewsRouter({ service, authenticate, limits }: Deps): Router {
  const router = Router();
  router.use(authenticate);

  const createLimit = createLimiter({ ...limits.interviewCreate, keyBy: "user" });
  const answerLimit = createLimiter({ ...limits.interviewAnswer, keyBy: "user" });
  // The userId ALWAYS comes from the verified identity (req.user), never from the request body.
  const me = (req: Request) => (req.user as NonNullable<Request["user"]>).id;
  const id = (req: Request) => String(req.params["id"]);

  router.get("/", async (req, res) => {
    const { page, limit } = interviewListQuerySchema.parse(req.query);
    res.json(await service.list(me(req), page, limit));
  });

  router.post("/", createLimit, validateBody(createInterviewSchema), async (req, res) => {
    const interview = await service.create(me(req), req.body as CreateInterviewInput);
    res.status(201).json({ interview });
  });

  router.get("/:id", async (req, res) => {
    res.json({ interview: await service.get(me(req), id(req)) });
  });

  router.post("/:id/answers", answerLimit, validateBody(submitAnswerSchema), async (req, res) => {
    res.json({
      interview: await service.submitAnswer(me(req), id(req), req.body as SubmitAnswerInput),
    });
  });

  router.post("/:id/retry", answerLimit, async (req, res) => {
    res.json({ interview: await service.retry(me(req), id(req)) });
  });

  router.post("/:id/complete", answerLimit, async (req, res) => {
    res.json({ interview: await service.complete(me(req), id(req)) });
  });

  router.post("/:id/abandon", async (req, res) => {
    res.json({ interview: await service.abandon(me(req), id(req)) });
  });

  router.get("/:id/report", async (req, res) => {
    res.json({ report: await service.getReport(me(req), id(req)) });
  });

  return router;
}
