import Anthropic from "@anthropic-ai/sdk";
import type { Env } from "../../config/env.js";
import type { Logger } from "../../lib/logger.js";
import type { AiProvider } from "./provider.js";
import { AnthropicProvider, type MessagesClient } from "./providers/anthropic.js";
import { FakeAiProvider } from "./providers/fake.js";
import { GroqProvider } from "./providers/groq.js";
/** Chooses the AI provider from environment config. Returns null when AI is not configured. */
export function createAiProvider(env: Env, logger: Logger): AiProvider | null {
  if (env.AI_PROVIDER === "fake") {
    logger.warn("AI_PROVIDER=fake: using the DEMO AI provider (canned, deterministic output)");
    return new FakeAiProvider();
  }
  if (env.AI_PROVIDER === "groq") {
  if (!env.GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY is required when AI_PROVIDER=groq");
  }
  return new GroqProvider(env.GROQ_API_KEY);
}
  if (!env.ANTHROPIC_API_KEY) {
    logger.warn("ANTHROPIC_API_KEY is not set: AI endpoints will answer 503 AI_NOT_CONFIGURED");
    return null;
  }
  // maxRetries: 0 because AiService owns retrying (so retries are counted and logged once).
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 0 });
  return new AnthropicProvider(client as unknown as MessagesClient, {
    reasoning: env.AI_MODEL_REASONING,
    fast: env.AI_MODEL_FAST,
  });
}
