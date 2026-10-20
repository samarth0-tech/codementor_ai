import express, { Router, type Express } from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import type { Env } from "./config/env.js";
import type { Logger } from "./lib/logger.js";
import type { PrismaClient } from "./lib/prisma.js";
import { requireAssertion } from "./middleware/assertion.js";
import { createAuthenticate } from "./middleware/authenticate.js";
import { createErrorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { defaultLimits, type Limits } from "./middleware/rateLimit.js";
import { requestId } from "./middleware/requestId.js";
import { AuthService } from "./modules/auth/auth.service.js";
import { createAuthRouter } from "./modules/auth/auth.routes.js";
import { AiService, type AiServiceOptions } from "./modules/ai/ai.service.js";
import type { AiProvider } from "./modules/ai/provider.js";
import { EvaluationService } from "./modules/interviews/evaluation.service.js";
import { createInterviewsRouter } from "./modules/interviews/interviews.routes.js";
import { InterviewService } from "./modules/interviews/interviews.service.js";
import type { CodeExecutor } from "./modules/submissions/executor.js";
import { SubmissionRunner } from "./modules/submissions/submission.runner.js";
import { createSubmissionsRouter } from "./modules/submissions/submissions.routes.js";
import { SubmissionService } from "./modules/submissions/submissions.service.js";
import { createReviewsRouter } from "./modules/reviews/reviews.routes.js";
import { ReviewService } from "./modules/reviews/reviews.service.js";
import { createResumesRouter } from "./modules/resumes/resumes.routes.js";
import { ResumeService } from "./modules/resumes/resumes.service.js";
import { createDashboardRouter } from "./modules/dashboard/dashboard.routes.js";
import { DashboardService } from "./modules/dashboard/dashboard.service.js";
import { createPathsRouter } from "./modules/paths/paths.routes.js";
import { PathsService } from "./modules/paths/paths.service.js";
import { createHealthRouter } from "./modules/health/health.routes.js";
import { createCatalogRouter, createProblemsRouter } from "./modules/problems/problems.routes.js";
import { ProblemService } from "./modules/problems/problems.service.js";

export interface AppDeps {
  env: Env;
  logger: Logger;
  prisma: PrismaClient;
  limits?: Partial<Limits>;
  /** null (or omitted) = AI not configured: AI endpoints answer 503 AI_NOT_CONFIGURED. */
  aiProvider?: AiProvider | null;
  aiOptions?: Partial<AiServiceOptions>;
  /**
   * Runs submitted code. null/omitted = NOT configured: submitting answers 503 (it never falls back
   * to simulated results by itself; pass a MockExecutor explicitly if you want that).
   */
  executor?: CodeExecutor | null;
}

/**
 * Builds the Express app WITHOUT starting a server, so tests can call it directly.
 * (server.ts is the only file that opens a port.)
 */
export function createApp(deps: AppDeps): Express {
  const { env, logger, prisma } = deps;
  const limits: Limits = { ...defaultLimits, ...deps.limits };

  const app = express();
  app.disable("x-powered-by");

  app.use(requestId);
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req as express.Request).id,
      autoLogging: { ignore: (req) => req.url === "/health" },
      customLogLevel: (_req, res, err) =>
        err || res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info",
      // Log only what we need: never headers or bodies.
      serializers: {
        req: (req: { id: string; method: string; url: string }) => ({
          id: req.id,
          method: req.method,
          url: req.url,
        }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
    }),
  );
  app.use(helmet());

  // Public: no identity note needed.
  app.use(createHealthRouter(prisma));

  // Everything under /api/v1 requires a valid note from our Next.js server.
  const authenticate = createAuthenticate(prisma);
  const v1 = Router();
  v1.use(
    "/auth",
    createAuthRouter({ service: new AuthService(prisma, env.BCRYPT_COST), authenticate, limits }),
  );

  const aiService = new AiService(deps.aiProvider ?? null, prisma, logger, {
    timeoutMs: env.AI_TIMEOUT_MS,
    dailyCallLimit: env.AI_DAILY_CALL_LIMIT,
    ...deps.aiOptions,
  });
  v1.use(
    "/interviews",
    createInterviewsRouter({
      service: new InterviewService(prisma, aiService, new EvaluationService(aiService)),
      authenticate,
      limits,
    }),
  );

  const runner = deps.executor ? new SubmissionRunner(prisma, deps.executor, logger) : null;
  app.locals["submissionRunner"] = runner;
  v1.use(
    "/submissions",
    createSubmissionsRouter({
      service: new SubmissionService(prisma, runner),
      authenticate,
      limits,
    }),
  );
  // AI code review of a finished submission (reads stored results only; never runs code).
  v1.use(
    "/submissions",
    createReviewsRouter({ service: new ReviewService(prisma, aiService), authenticate, limits }),
  );

  // Resume upload, extraction, and management (Phase 11).
  v1.use(
    "/resumes",
    createResumesRouter({ service: new ResumeService(prisma, aiService), authenticate, limits }),
  );

  // User dashboard metrics and activity (Phase 12).
  v1.use(
    "/dashboard",
    createDashboardRouter({ service: new DashboardService(prisma), authenticate }),
  );

  // Learning paths with progress tracking (Phase 13).
  v1.use("/paths", createPathsRouter({ service: new PathsService(prisma), authenticate }));

  const problems = new ProblemService(
    prisma,
    async () => (await runner?.supportedLanguages()) ?? null,
  );
  v1.use("/problems", createProblemsRouter(problems, authenticate));
  v1.use("/", createCatalogRouter(problems, authenticate));

  app.use("/api/v1", requireAssertion(env.API_SHARED_SECRET), express.json({ limit: "256kb" }), v1);

  app.use(notFoundHandler);
  app.use(createErrorHandler(logger));
  return app;
}
