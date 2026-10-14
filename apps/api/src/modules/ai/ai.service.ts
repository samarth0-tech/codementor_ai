import type { ZodType } from "zod";
import { AppError } from "../../lib/errors.js";
import type { Logger } from "../../lib/logger.js";
import type { PrismaClient } from "../../lib/prisma.js";
import type { AiCallStatus, AiFeature } from "../../generated/prisma/enums.js";
import { extractJson } from "./json.js";
import type { AiMessage, AiProvider, AiRequest, AiResponse, ModelTier } from "./provider.js";
import { AiProviderError } from "./provider.js";

export interface AiServiceOptions {
  timeoutMs: number;
  /** Total tries per provider call (1 = no retry). */
  maxAttempts: number;
  retryBaseDelayMs: number;
  /** Rolling 24-hour cap on provider calls per user (cost control). */
  dailyCallLimit: number;
}

export const defaultAiOptions: AiServiceOptions = {
  timeoutMs: 30_000,
  maxAttempts: 3,
  retryBaseDelayMs: 400,
  dailyCallLimit: 200,
};

export interface StructuredRequest<T> {
  userId: string;
  feature: AiFeature;
  promptVersion: string;
  tier?: ModelTier;
  system: string;
  user: string;
  schema: ZodType<T>;
  maxTokens: number;
  temperature?: number;
  meta?: Record<string, unknown>;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The one door to the AI. It guarantees four things for every caller:
 *  1. a per-user daily quota,
 *  2. timeouts and bounded retries for transient failures,
 *  3. the output is VALIDATED against a Zod schema (one automatic repair attempt, then failure),
 *  4. every provider call is recorded in the AiCall table (tokens, latency, status; never prompts).
 */
export class AiService {
  private readonly options: AiServiceOptions;

  constructor(
    private readonly provider: AiProvider | null,
    private readonly prisma: PrismaClient,
    private readonly logger: Logger,
    options: Partial<AiServiceOptions> = {},
  ) {
    this.options = { ...defaultAiOptions, ...options };
  }

  get configured(): boolean {
    return this.provider !== null;
  }

  async generateStructured<T>(req: StructuredRequest<T>): Promise<T> {
    if (!this.provider) {
      throw AppError.unavailable(
        "AI features are not configured on this server",
        "AI_NOT_CONFIGURED",
      );
    }
    await this.enforceQuota(req.userId);

    const base: AiMessage[] = [{ role: "user", content: req.user }];
    const first = await this.callProvider(req, base);
    const parsed = this.validate(first.text, req.schema);
    if (parsed.ok) {
      await this.record(req, first, "SUCCESS");
      return parsed.value;
    }
    await this.record(req, first, "INVALID_OUTPUT", "SCHEMA_MISMATCH");

    // One repair attempt: show the model what was wrong and ask for corrected JSON only.
    const repair: AiMessage[] = [
      ...base,
      { role: "assistant", content: first.text.slice(0, 4000) },
      {
        role: "user",
        content:
          `Your previous reply was not valid. Problems: ${parsed.issues}\n` +
          "Reply again with ONLY the corrected JSON object. No markdown, no commentary.",
      },
    ];
    const second = await this.callProvider(req, repair);
    const reparsed = this.validate(second.text, req.schema);
    if (reparsed.ok) {
      await this.record(req, second, "SUCCESS");
      return reparsed.value;
    }
    await this.record(req, second, "INVALID_OUTPUT", "SCHEMA_MISMATCH");
    this.logger.warn(
      { feature: req.feature, issues: reparsed.issues },
      "AI output failed validation twice",
    );
    throw AppError.upstream(
      "The AI returned an unusable response. Please try again.",
      "AI_INVALID_OUTPUT",
    );
  }

  private validate<T>(
    text: string,
    schema: ZodType<T>,
  ): { ok: true; value: T } | { ok: false; issues: string } {
    const json = extractJson(text);
    if (json === undefined) return { ok: false, issues: "The reply was not valid JSON." };
    const result = schema.safeParse(json);
    if (result.success) return { ok: true, value: result.data };
    const issues = result.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    return { ok: false, issues };
  }

  private async callProvider(
    req: StructuredRequest<unknown>,
    messages: AiMessage[],
  ): Promise<AiResponse & { latencyMs: number }> {
    const request: AiRequest = {
      feature: req.feature,
      system: req.system,
      messages,
      maxTokens: req.maxTokens,
      temperature: req.temperature ?? 0.3,
      tier: req.tier ?? "reasoning",
      ...(req.meta ? { meta: req.meta } : {}),
    };
    let lastError: AiProviderError | undefined;

    for (let attempt = 1; attempt <= this.options.maxAttempts; attempt++) {
      const started = Date.now();
      try {
        const response = await this.provider!.generate({
          ...request,
          signal: AbortSignal.timeout(this.options.timeoutMs),
        });
        return { ...response, latencyMs: Date.now() - started };
      } catch (err) {
        const failure =
          err instanceof AiProviderError
            ? err
            : new AiProviderError("Unexpected AI provider failure", "unavailable");
        lastError = failure;
        await this.recordFailure(req, request.tier, failure, Date.now() - started);
        if (!failure.retryable || attempt === this.options.maxAttempts) break;
        await sleep(this.options.retryBaseDelayMs * 2 ** (attempt - 1));
      }
    }

    this.logger.warn({ feature: req.feature, kind: lastError?.kind }, "AI call failed");
    if (lastError?.kind === "timeout") {
      throw new AppError(504, "AI_TIMEOUT", "The AI took too long to respond. Please try again.");
    }
    if (lastError?.kind === "rate_limited") {
      throw AppError.upstream("The AI service is busy. Please try again in a moment.", "AI_BUSY");
    }
    throw AppError.upstream(
      "The AI service is unavailable right now. Please try again.",
      "AI_UNAVAILABLE",
    );
  }

  private async enforceQuota(userId: string): Promise<void> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const used = await this.prisma.aiCall.count({ where: { userId, createdAt: { gte: since } } });
    if (used >= this.options.dailyCallLimit) {
      throw new AppError(
        429,
        "AI_QUOTA_EXCEEDED",
        "You have reached today's AI usage limit. Please try again tomorrow.",
      );
    }
  }

  private async record(
    req: StructuredRequest<unknown>,
    response: AiResponse & { latencyMs: number },
    status: AiCallStatus,
    errorCode?: string,
  ): Promise<void> {
    await this.write({
      userId: req.userId,
      feature: req.feature,
      model: response.model,
      promptVersion: req.promptVersion,
      inputTokens: response.inputTokens,
      outputTokens: response.outputTokens,
      latencyMs: response.latencyMs,
      status,
      errorCode: errorCode ?? null,
    });
  }

  private async recordFailure(
    req: StructuredRequest<unknown>,
    tier: ModelTier,
    failure: AiProviderError,
    latencyMs: number,
  ): Promise<void> {
    await this.write({
      userId: req.userId,
      feature: req.feature,
      model: `${this.provider?.name ?? "none"}:${tier}`,
      promptVersion: req.promptVersion,
      inputTokens: 0,
      outputTokens: 0,
      latencyMs,
      status: failure.kind === "timeout" ? "TIMEOUT" : "ERROR",
      errorCode: failure.kind.toUpperCase(),
    });
  }

  /** Audit logging must never break the user's request. */
  private async write(
    data: Parameters<PrismaClient["aiCall"]["create"]>[0]["data"],
  ): Promise<void> {
    try {
      await this.prisma.aiCall.create({ data });
    } catch (err) {
      this.logger.error({ err }, "Failed to record AiCall");
    }
  }
}
