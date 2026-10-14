import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { AppError } from "../src/lib/errors.js";
import { createLogger } from "../src/lib/logger.js";
import { createPrisma } from "../src/lib/prisma.js";
import { AiService } from "../src/modules/ai/ai.service.js";
import { AiProviderError } from "../src/modules/ai/provider.js";
import { FakeAiProvider } from "../src/modules/ai/providers/fake.js";
import { hasDb, resetDb } from "./helpers.js";

const schema = z.object({ n: z.number().min(0).max(10) });
const logger = createLogger("silent");

describe.skipIf(!hasDb)("AiService", () => {
  const prisma = createPrisma(process.env.DATABASE_URL as string);
  let userId: string;
  let fake: FakeAiProvider;
  let service: AiService;

  const ask = () =>
    service.generateStructured({
      userId,
      feature: "QUESTION",
      promptVersion: "test.v1",
      system: "SYSTEM-PROMPT-TEXT",
      user: "USER-PROMPT-TEXT",
      schema,
      maxTokens: 100,
    });
  const rows = () => prisma.aiCall.findMany({ orderBy: { createdAt: "asc" } });

  beforeEach(async () => {
    await resetDb(prisma);
    userId = (
      await prisma.user.create({ data: { email: "a@example.com", name: "A", passwordHash: "x" } })
    ).id;
    fake = new FakeAiProvider();
    service = new AiService(fake, prisma, logger, {
      retryBaseDelayMs: 0,
      maxAttempts: 3,
      dailyCallLimit: 100,
    });
  });
  afterAll(() => prisma.$disconnect());

  it("returns validated data and records the call (tokens, latency, version) but never the prompt", async () => {
    fake.enqueue('{"n": 7}');
    await expect(ask()).resolves.toEqual({ n: 7 });
    const [row] = await rows();
    expect(row).toMatchObject({
      userId,
      feature: "QUESTION",
      promptVersion: "test.v1",
      status: "SUCCESS",
      model: "fake-reasoning",
    });
    expect(row?.inputTokens).toBeGreaterThan(0);
    expect(row?.outputTokens).toBeGreaterThan(0);
    expect(JSON.stringify(row)).not.toContain("PROMPT-TEXT");
  });

  it("accepts JSON wrapped in markdown fences or chatter", async () => {
    fake.enqueue('Sure!\n```json\n{"n": 3}\n```');
    await expect(ask()).resolves.toEqual({ n: 3 });
  });

  it("repairs invalid output once, telling the model what was wrong", async () => {
    fake.enqueue('{"n": 99}', '{"n": 4}');
    await expect(ask()).resolves.toEqual({ n: 4 });
    expect(fake.calls).toHaveLength(2);
    const repair = fake.calls[1]?.messages ?? [];
    expect(repair).toHaveLength(3);
    expect(repair[1]).toMatchObject({ role: "assistant", content: '{"n": 99}' });
    expect(repair[2]?.content).toMatch(/not valid[\s\S]*n:/);
    expect((await rows()).map((r) => r.status)).toEqual(["INVALID_OUTPUT", "SUCCESS"]);
  });

  it("fails with AI_INVALID_OUTPUT (502) when the repair is also invalid", async () => {
    fake.enqueue("not json at all", '{"n": -5}');
    await expect(ask()).rejects.toMatchObject({ status: 502, code: "AI_INVALID_OUTPUT" });
    expect((await rows()).map((r) => r.status)).toEqual(["INVALID_OUTPUT", "INVALID_OUTPUT"]);
  });

  it("retries transient failures, then succeeds", async () => {
    fake.enqueue(
      new AiProviderError("x", "unavailable"),
      new AiProviderError("x", "rate_limited"),
      '{"n": 1}',
    );
    await expect(ask()).resolves.toEqual({ n: 1 });
    expect(fake.calls).toHaveLength(3);
    expect((await rows()).map((r) => r.status)).toEqual(["ERROR", "ERROR", "SUCCESS"]);
  });

  it("does NOT retry a non-retryable failure (bad request / bad key)", async () => {
    fake.enqueue(new AiProviderError("x", "bad_request"));
    await expect(ask()).rejects.toMatchObject({ status: 502, code: "AI_UNAVAILABLE" });
    expect(fake.calls).toHaveLength(1);
  });

  it("gives up with AI_TIMEOUT (504) after repeated timeouts", async () => {
    fake.enqueue(...Array.from({ length: 3 }, () => new AiProviderError("slow", "timeout")));
    await expect(ask()).rejects.toMatchObject({ status: 504, code: "AI_TIMEOUT" });
    expect((await rows()).map((r) => r.status)).toEqual(["TIMEOUT", "TIMEOUT", "TIMEOUT"]);
  });

  it("maps persistent rate limiting to AI_BUSY", async () => {
    fake.enqueue(...Array.from({ length: 3 }, () => new AiProviderError("busy", "rate_limited")));
    await expect(ask()).rejects.toMatchObject({ status: 502, code: "AI_BUSY" });
  });

  it("enforces the per-user daily quota BEFORE calling the provider", async () => {
    service = new AiService(fake, prisma, logger, { dailyCallLimit: 2, retryBaseDelayMs: 0 });
    fake.enqueue('{"n":1}', '{"n":2}');
    await ask();
    await ask();
    const err = await ask().catch((e: unknown) => e as AppError);
    expect(err).toMatchObject({ status: 429, code: "AI_QUOTA_EXCEEDED" });
    expect(fake.calls).toHaveLength(2);
  });

  it("does not count other users' calls or calls older than 24 hours against the quota", async () => {
    service = new AiService(fake, prisma, logger, { dailyCallLimit: 1, retryBaseDelayMs: 0 });
    const other = await prisma.user.create({
      data: { email: "b@example.com", name: "B", passwordHash: "x" },
    });
    const base = {
      feature: "QUESTION" as const,
      model: "m",
      promptVersion: "v",
      latencyMs: 1,
      status: "SUCCESS" as const,
    };
    await prisma.aiCall.create({ data: { ...base, userId: other.id } });
    await prisma.aiCall.create({
      data: { ...base, userId, createdAt: new Date(Date.now() - 25 * 3600_000) },
    });
    fake.enqueue('{"n":1}');
    await expect(ask()).resolves.toEqual({ n: 1 });
  });

  it("answers 503 AI_NOT_CONFIGURED when there is no provider", async () => {
    service = new AiService(null, prisma, logger);
    expect(service.configured).toBe(false);
    await expect(ask()).rejects.toMatchObject({ status: 503, code: "AI_NOT_CONFIGURED" });
  });
});
