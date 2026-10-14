import type { Env } from "../../config/env.js";
import type { Logger } from "../../lib/logger.js";
import { HttpPistonClient } from "./client.js";
import { PistonExecutor } from "./executor.js";

export function createPistonExecutor(env: Env, logger: Logger): PistonExecutor {
  const client = new HttpPistonClient({
    baseUrl: env.PISTON_API_URL,
    apiKey: env.PISTON_API_KEY,
    timeoutMs: env.PISTON_TIMEOUT_MS,
    logger,
  });
  return new PistonExecutor(client, {
    timeoutMs: env.PISTON_TIMEOUT_MS,
    logger,
  });
}
