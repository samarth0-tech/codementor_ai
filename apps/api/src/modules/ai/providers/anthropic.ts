import type { AiProvider, AiRequest, AiResponse } from "../provider.js";
import { AiProviderError } from "../provider.js";

/** The slice of the Anthropic SDK we use, so tests can pass a stand-in. */
export interface MessagesClient {
  messages: {
    create(
      params: {
        model: string;
        max_tokens: number;
        temperature: number;
        system: string;
        messages: { role: "user" | "assistant"; content: string }[];
      },
      options?: { signal?: AbortSignal },
    ): Promise<{
      content: { type: string; text?: string }[];
      usage: { input_tokens: number; output_tokens: number };
      model: string;
    }>;
  };
}

export interface AnthropicModels {
  reasoning: string;
  fast: string;
}

/** Turns any SDK/network error into our small, vendor-neutral AiProviderError. */
export function classifyAnthropicError(err: unknown): AiProviderError {
  const e = err as { status?: number; name?: string; code?: string; message?: string };
  const name = e?.name ?? "";
  if (/abort|timeout/i.test(name) || e?.code === "ETIMEDOUT") {
    return new AiProviderError("The AI request timed out", "timeout");
  }
  if (e?.status === 429)
    return new AiProviderError("The AI service is rate limited", "rate_limited");
  if (typeof e?.status === "number" && (e.status >= 500 || e.status === 408)) {
    return new AiProviderError("The AI service is temporarily unavailable", "unavailable");
  }
  if (typeof e?.status === "number") {
    // 400/401/403/404...: our request or key is wrong. Retrying will not help.
    return new AiProviderError(`The AI service rejected the request (${e.status})`, "bad_request");
  }
  return new AiProviderError("Could not reach the AI service", "unavailable");
}

export class AnthropicProvider implements AiProvider {
  readonly name = "anthropic";

  constructor(
    private readonly client: MessagesClient,
    private readonly models: AnthropicModels,
  ) {}

  async generate(request: AiRequest): Promise<AiResponse> {
    const model = this.models[request.tier];
    try {
      const response = await this.client.messages.create(
        {
          model,
          max_tokens: request.maxTokens,
          temperature: request.temperature,
          system: request.system,
          messages: request.messages,
        },
        request.signal ? { signal: request.signal } : undefined,
      );
      const text = response.content
        .filter((block) => block.type === "text")
        .map((block) => block.text ?? "")
        .join("");
      return {
        text,
        model: response.model ?? model,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      };
    } catch (err) {
      throw classifyAnthropicError(err);
    }
  }
}
