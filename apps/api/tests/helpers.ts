import type { Express } from "express";
import { signAssertion } from "@codementor/shared/assertion";
import { createApp, type AppDeps } from "../src/app.js";
import { loadEnv } from "../src/config/env.js";
import { createLogger } from "../src/lib/logger.js";
import { createPrisma, type PrismaClient } from "../src/lib/prisma.js";
import { FakeAiProvider } from "../src/modules/ai/providers/fake.js";
import { MockExecutor } from "../src/modules/submissions/mock-executor.js";

export const hasDb = Boolean(process.env.TEST_DATABASE_URL);
export const TEST_SECRET = process.env.API_SHARED_SECRET as string;

// Limits high enough that ordinary tests never trip them; rate-limit tests override these.
const relaxedLimits = {
  register: { windowMs: 60_000, limit: 10_000 },
  login: { windowMs: 60_000, limit: 10_000 },
  interviewCreate: { windowMs: 60_000, limit: 10_000 },
  interviewAnswer: { windowMs: 60_000, limit: 10_000 },
  submissionCreate: { windowMs: 60_000, limit: 10_000 },
  codeReview: { windowMs: 60_000, limit: 10_000 },
  resumeUpload: { windowMs: 60_000, limit: 10_000 },
};

export interface TestContext {
  app: Express;
  prisma: PrismaClient;
  deps: AppDeps;
  /** The scriptable fake AI used by this app instance. */
  ai: FakeAiProvider;
}

export function makeTestContext(overrides: Partial<AppDeps> = {}): TestContext {
  const env = loadEnv();
  const prisma = createPrisma(env.DATABASE_URL);
  const ai = new FakeAiProvider();
  const deps: AppDeps = {
    env,
    prisma,
    logger: createLogger("silent"),
    limits: relaxedLimits,
    aiProvider: ai,
    // Simulated execution, chosen explicitly: the app itself never falls back to it.
    executor: new MockExecutor(),
    // No waiting between retries in tests.
    aiOptions: { retryBaseDelayMs: 0 },
    ...overrides,
  };
  return { app: createApp(deps), prisma, deps, ai };
}

/** The "Authorization" header the Next.js server would send. Omit `sub` for anonymous calls. */
export async function note(sub?: string, ip = "203.0.113.7"): Promise<string> {
  const token = await signAssertion(TEST_SECRET, { ...(sub ? { sub } : {}), ip });
  return `Bearer ${token}`;
}

/** Empties every table (except Prisma's own bookkeeping) between tests. */
export async function resetDb(prisma: PrismaClient): Promise<void> {
  const rows = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (rows.length === 0) return;
  const list = rows.map((r) => `"${r.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

export const validRegistration = {
  name: "Asha Student",
  email: "asha@example.com",
  password: "correct-horse-battery",
};

/** Creates a user and returns the Authorization header the web app would send for them. */
export async function createUser(
  prisma: PrismaClient,
  email = "student@example.com",
  name = "Student",
) {
  const user = await prisma.user.create({ data: { email, name, passwordHash: "x" } });
  return { user, auth: await note(user.id) };
}
