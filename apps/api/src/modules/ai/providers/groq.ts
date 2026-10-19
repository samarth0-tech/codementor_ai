import type { AiProvider, AiRequest, AiResponse } from "../provider.js";
import { AiProviderError } from "../provider.js";

export class GroqProvider implements AiProvider {
  readonly name = "groq";

  constructor(private readonly apiKey: string) {}

  async generate(request: AiRequest): Promise<AiResponse> {
    const messages = [
      ...(request.system ? [{ role: "system", content: request.system }] : []),
      ...request.messages.map((m) => ({ role: m.role, content: m.content })),
    ];

    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "qwen/qwen3.8-27b",
          messages,
          temperature: request.temperature ?? 0.2,
          max_tokens: request.maxTokens,
        }),
        signal: request.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        if (response.status === 429) {
          throw new AiProviderError("The Groq service is rate limited", "rate_limited");
        }
        if (response.status >= 500 || response.status === 408) {
          throw new AiProviderError("The Groq service is temporarily unavailable", "unavailable");
        }
        throw new AiProviderError(
          `Groq API error (${response.status}): ${errorText}`,
          "bad_request",
        );
      }

      const data = (await response.json()) as {
        model?: string;
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };

      const text = data.choices?.[0]?.message?.content ?? "";
      return {
        text,
        model: data.model ?? "llama-3.3-70b-versatile",
        inputTokens: data.usage?.prompt_tokens ?? 0,
        outputTokens: data.usage?.completion_tokens ?? 0,
      };
    } catch (err) {
      if (err instanceof AiProviderError) throw err;
      const e = err as { name?: string; message?: string };
      if (/abort|timeout/i.test(e?.name ?? "") || /abort|timeout/i.test(e?.message ?? "")) {
        throw new AiProviderError("The AI request timed out", "timeout");
      }
      throw new AiProviderError("Could not reach Groq AI service", "unavailable");
    }
  }
}
