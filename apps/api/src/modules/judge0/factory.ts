import type { Language } from "@codementor/shared";
import type { Env } from "../../config/env.js";
import type { Logger } from "../../lib/logger.js";
import type { PrismaClient } from "../../lib/prisma.js";
import type { CodeExecutor } from "../submissions/executor.js";
import { MockExecutor } from "../submissions/mock-executor.js";
import { HttpJudge0Client, type Judge0Auth } from "./client.js";
import { Judge0Executor } from "./executor.js";
import { Judge0LanguageDirectory } from "./languages.js";
import { createPistonExecutor } from "../piston/factory.js";

/** Builds everything for real execution from configuration. Shared by the server and the CLI. */
export function createJudge0Executor(
  env: Env,
  logger: Logger,
  prisma: PrismaClient,
): Judge0Executor | null {
  if (!env.JUDGE0_API_URL) return null;

  let auth: Judge0Auth = { kind: "none" };
  if (env.JUDGE0_RAPIDAPI_KEY) {
    auth = {
      kind: "rapidapi",
      key: env.JUDGE0_RAPIDAPI_KEY,
      host: new URL(env.JUDGE0_API_URL).host,
    };
  } else if (env.JUDGE0_AUTH_TOKEN) {
    auth = { kind: "token", token: env.JUDGE0_AUTH_TOKEN };
  }

  const client = new HttpJudge0Client({
    baseUrl: env.JUDGE0_API_URL,
    auth,
    timeoutMs: env.JUDGE0_TIMEOUT_MS,
    maxAttempts: 3,
    retryBaseDelayMs: 500,
    logger,
  });
  const languages = new Judge0LanguageDirectory({
    client,
    logger,
    configured: async () => {
      const rows = await prisma.languageConfig.findMany({
        select: { language: true, judge0LanguageId: true },
      });
      return Object.fromEntries(rows.map((r) => [r.language, r.judge0LanguageId])) as Partial<
        Record<Language, number>
      >;
    },
  });
  return new Judge0Executor(client, languages, {
    pollTimeoutMs: env.JUDGE0_POLL_TIMEOUT_MS,
    pollIntervalMs: 300,
    maxBatch: env.JUDGE0_MAX_BATCH,
    logger,
  });
}

/**
 * Chooses the code executor from configuration. Returns null when real execution is selected but
 * not configured: submitting then answers 503 instead of quietly producing simulated results.
 */
export function createCodeExecutor(
  env: Env,
  logger: Logger,
  prisma: PrismaClient,
): CodeExecutor | null {
  if (env.CODE_EXECUTOR === "fake") {
    logger.warn(
      "CODE_EXECUTOR=fake: submissions get SIMULATED results. Nothing is really executed.",
    );
    return new MockExecutor();
  }
  if (env.CODE_EXECUTOR === "piston") {
    logger.info({ url: env.PISTON_API_URL }, "CODE_EXECUTOR=piston: using Piston execution engine");
    return createPistonExecutor(env, logger);
  }
  const executor = createJudge0Executor(env, logger, prisma);
  if (!executor) {
    logger.warn(
      "JUDGE0_API_URL is not set: submitting code will answer 503 CODE_EXECUTION_NOT_CONFIGURED " +
        "(set JUDGE0_API_URL, or CODE_EXECUTOR=fake for local simulated runs)",
    );
  }
  return executor;
}
