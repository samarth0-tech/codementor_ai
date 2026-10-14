import type { AiFeature } from "../../generated/prisma/enums.js";

/** "reasoning" = best quality (evaluation, reports); "fast" = cheap and quick (simple tasks). */
export type ModelTier = "reasoning" | "fast";

export interface AiMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AiRequest {
  feature: AiFeature;
  system: string;
  messages: AiMessage[];
  maxTokens: number;
  temperature: number;
  tier: ModelTier;
  /**
   * Structured copy of the inputs. Real providers IGNORE this; the fake provider uses it to
   * produce deterministic output without parsing prompt text.
   */
  meta?: Record<string, unknown>;
  signal?: AbortSignal;
}

export interface AiResponse {
  text: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

/**
 * The ONLY thing interview logic knows about an AI vendor. Swap Claude for anything else (or a
 * fake in tests) by implementing this one method.
 */
export interface AiProvider {
  readonly name: string;
  generate(request: AiRequest): Promise<AiResponse>;
}

export type AiFailureKind = "timeout" | "rate_limited" | "unavailable" | "bad_request";

/** What every provider throws on failure, so the service can decide whether to retry. */
export class AiProviderError extends Error {
  constructor(
    message: string,
    public readonly kind: AiFailureKind,
  ) {
    super(message);
    this.name = "AiProviderError";
  }

  get retryable(): boolean {
    return this.kind !== "bad_request";
  }
}
