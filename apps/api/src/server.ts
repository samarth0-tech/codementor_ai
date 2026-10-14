import { createApp } from "./app.js";
import { loadEnv } from "./config/env.js";
import { createLogger } from "./lib/logger.js";
import { createPrisma } from "./lib/prisma.js";
import { createAiProvider } from "./modules/ai/factory.js";
import { createCodeExecutor } from "./modules/judge0/factory.js";
import type { SubmissionRunner } from "./modules/submissions/submission.runner.js";

const env = loadEnv();
const logger = createLogger(env.LOG_LEVEL);
const prisma = createPrisma(env.DATABASE_URL);
const app = createApp({
  env,
  logger,
  prisma,
  aiProvider: createAiProvider(env, logger),
  executor: createCodeExecutor(env, logger, prisma),
});

// Anything left "running" by a previous crash can never finish: fail it instead of leaving it hanging.
await (app.locals["submissionRunner"] as SubmissionRunner | null)?.recoverStale();

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, nodeEnv: env.NODE_ENV }, "API listening");
});

// Finish in-flight requests, close the DB pool, then exit (platforms send SIGTERM on redeploy).
function shutdown(signal: string): void {
  logger.info({ signal }, "Shutting down");
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// A bug we did not anticipate: log it and exit so the platform restarts a clean process.
process.on("unhandledRejection", (reason) => {
  logger.fatal({ err: reason }, "Unhandled promise rejection");
  process.exit(1);
});
process.on("uncaughtException", (err) => {
  logger.fatal({ err }, "Uncaught exception");
  process.exit(1);
});
