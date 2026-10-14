import type { AiProvider, AiRequest, AiResponse } from "../provider.js";

type Scripted = string | Error | ((request: AiRequest) => string);

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const answerLength = (m: Record<string, unknown>) => str(m["answer"]).trim().length;

/**
 * A deterministic stand-in for Claude. Used by automated tests and for demos without an API key
 * (AI_PROVIDER=fake, never allowed in production).
 *
 * Tests can also SCRIPT replies with enqueue(): a string (raw model text, even malformed), an
 * Error (simulates a provider failure) or a function. Scripted items are used first, in order.
 */
export class FakeAiProvider implements AiProvider {
  readonly name = "fake";
  /** Every request received, for assertions. */
  readonly calls: AiRequest[] = [];
  private readonly queue: Scripted[] = [];

  enqueue(...items: Scripted[]): this {
    this.queue.push(...items);
    return this;
  }

  reset(): void {
    this.calls.length = 0;
    this.queue.length = 0;
  }

  async generate(request: AiRequest): Promise<AiResponse> {
    this.calls.push(request);
    const next = this.queue.shift();
    if (next instanceof Error) throw next;
    const text =
      typeof next === "string"
        ? next
        : typeof next === "function"
          ? next(request)
          : this.defaultReply(request);
    const input =
      request.system.length + request.messages.reduce((n, m) => n + m.content.length, 0);
    return {
      text,
      model: `fake-${request.tier}`,
      inputTokens: Math.ceil(input / 4),
      outputTokens: Math.ceil(text.length / 4),
    };
  }

  private defaultReply(request: AiRequest): string {
    const m = request.meta ?? {};
    switch (request.feature) {
      case "INTERVIEW_PLAN": {
        const count = Number(m["questionCount"] ?? 5);
        const parts = [
          "fundamentals",
          "trade-offs",
          "edge cases",
          "performance",
          "best practices",
          "debugging",
          "design",
          "testing",
          "scaling",
          "security",
        ];
        const slots = Array.from({ length: count }, (_, i) => ({
          topic: `${str(m["topic"])}: ${parts[i % parts.length]}`,
          kind: count > 3 && i === count - 1 ? "BEHAVIORAL" : "CONCEPTUAL",
          focus: `Probe understanding of ${parts[i % parts.length]}`,
        }));
        return JSON.stringify({ slots });
      }
      case "QUESTION": {
        const slot = (m["slot"] ?? {}) as { topic?: string; focus?: string };
        const n = Number(m["slotIndex"] ?? 0) + 1;
        return JSON.stringify({
          question: `Question ${n} (${str(m["adjustment"])}): Explain ${slot.topic ?? "this concept"} and why it matters in practice.`,
        });
      }
      case "FOLLOW_UP": {
        const asked = Array.isArray(m["askedBefore"]) ? m["askedBefore"].length : 0;
        const lead = m["direction"] === "SIMPLER" ? "Let's simplify" : "Going deeper";
        return JSON.stringify({
          question: `${lead} (follow-up ${asked + 1}): can you give a concrete example that shows your point?`,
        });
      }
      case "EVALUATION": {
        const len = answerLength(m);
        const [correctness, depth, clarity] =
          len < 40 ? [2, 2, 3] : len < 160 ? [6, 5, 6] : [9, 8, 8];
        return JSON.stringify({
          correctness,
          depth,
          clarity,
          strengths: len < 40 ? [] : ["Addresses the question directly"],
          weaknesses: len >= 160 ? [] : ["Needs more detail and concrete examples"],
          feedback:
            len < 40
              ? "Your answer is too short to assess. Explain your reasoning."
              : "Reasonable answer. Keep adding examples and trade-offs.",
        });
      }
      case "REPORT":
        return JSON.stringify({
          summary: `You completed an interview on ${str(m["topic"])} and scored ${String(m["overall"])}/100 (${str(m["band"])}).`,
          strengths: ["Clear effort on every question"],
          weaknesses: ["Some answers lacked depth"],
          recommendations: ["Review the weakest sub-topics and practise explaining them aloud"],
        });
      default:
        return "{}";
    }
  }
}
