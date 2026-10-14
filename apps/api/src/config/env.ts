import { z } from "zod";
import { MIN_SECRET_LENGTH } from "@codementor/shared/assertion";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  API_SHARED_SECRET: z
    .string()
    .min(MIN_SECRET_LENGTH, `API_SHARED_SECRET must be at least ${MIN_SECRET_LENGTH} characters`),
  BCRYPT_COST: z.coerce.number().int().min(4).max(15).default(12),

  // --- AI (Claude). Without a key, AI endpoints answer 503 AI_NOT_CONFIGURED; the rest still works.
  AI_PROVIDER: z.enum(["anthropic", "fake"]).default("anthropic"),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  AI_MODEL_REASONING: z.string().min(1).default("claude-sonnet-5-5"),
  AI_MODEL_FAST: z.string().min(1).default("claude-haiku-4-5-20251001"),
  AI_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120_000).default(30_000),
  AI_DAILY_CALL_LIMIT: z.coerce.number().int().min(1).max(100_000).default(200),

  // --- Code execution. "judge0" = real sandboxed execution. "fake" = SIMULATED results for local
  // development only. "piston" = Piston execution engine. Without JUDGE0_API_URL, submitting code answers 503 (never silently fake).
  CODE_EXECUTOR: z.enum(["judge0", "fake", "piston"]).default("judge0"),
  JUDGE0_API_URL: z.url().optional(),
  // Self-hosted Judge0 with authentication enabled: sent as the X-Auth-Token header.
  JUDGE0_AUTH_TOKEN: z.string().min(1).optional(),
  // Judge0 on RapidAPI: sent as X-RapidAPI-Key (the host header is derived from the URL).
  JUDGE0_RAPIDAPI_KEY: z.string().min(1).optional(),
  JUDGE0_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60_000).default(15_000),
  JUDGE0_POLL_TIMEOUT_MS: z.coerce.number().int().min(5000).max(300_000).default(60_000),
  JUDGE0_MAX_BATCH: z.coerce.number().int().min(1).max(20).default(20),

  // --- Piston execution engine
  PISTON_API_URL: z.url().default("https://emkc.org/api/v2/piston"),
  PISTON_API_KEY: z.string().min(1).optional(),
  PISTON_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60_000).default(15_000),
});

const isLocalHost = (url: URL) => ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);

// Rules that involve more than one variable, or that protect production.
const checkedSchema = envSchema
  .refine((env) => !(env.NODE_ENV === "production" && env.AI_PROVIDER === "fake"), {
    message: "AI_PROVIDER=fake is a demo provider and is not allowed in production",
    path: ["AI_PROVIDER"],
  })
  .refine((env) => !(env.NODE_ENV === "production" && env.CODE_EXECUTOR === "fake"), {
    message: "CODE_EXECUTOR=fake only SIMULATES results and is not allowed in production",
    path: ["CODE_EXECUTOR"],
  })
  .refine((env) => !(env.JUDGE0_AUTH_TOKEN && env.JUDGE0_RAPIDAPI_KEY), {
    message: "Set either JUDGE0_AUTH_TOKEN or JUDGE0_RAPIDAPI_KEY, not both",
    path: ["JUDGE0_RAPIDAPI_KEY"],
  })
  .refine((env) => !(env.JUDGE0_RAPIDAPI_KEY && !env.JUDGE0_API_URL), {
    message: "JUDGE0_RAPIDAPI_KEY needs JUDGE0_API_URL (the RapidAPI endpoint)",
    path: ["JUDGE0_API_URL"],
  })
  .refine(
    (env) =>
      !env.JUDGE0_API_URL ||
      new URL(env.JUDGE0_API_URL).protocol === "https:" ||
      isLocalHost(new URL(env.JUDGE0_API_URL)),
    {
      message: "JUDGE0_API_URL must use https (plain http is only allowed for localhost)",
      path: ["JUDGE0_API_URL"],
    },
  )
  .refine(
    (env) =>
      !env.PISTON_API_URL ||
      new URL(env.PISTON_API_URL).protocol === "https:" ||
      isLocalHost(new URL(env.PISTON_API_URL)),
    {
      message: "PISTON_API_URL must use https (plain http is only allowed for localhost)",
      path: ["PISTON_API_URL"],
    },
  );

export type Env = z.infer<typeof envSchema>;

/** Validates environment variables once at startup so a bad config fails fast and loudly. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = checkedSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  return result.data;
}
