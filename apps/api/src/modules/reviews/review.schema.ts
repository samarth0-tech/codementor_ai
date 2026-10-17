import { z } from "zod";

// What we accept from the AI for a code review. Anything else is rejected (repair once, then fail).

const rating = z
  .number()
  .min(0)
  .max(10)
  .transform((n) => Math.round(n));

const text = (max: number) => z.string().trim().min(1).max(max);
const level = z.enum(["LOW", "MEDIUM", "HIGH"]);

/** Models sometimes give 0, a decimal or a negative number for "no specific line": treat as none. */
const lineNumber = z
  .number()
  .nullish()
  .transform((n) => (typeof n === "number" && Number.isInteger(n) && n >= 1 ? n : null));

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((s) => (s ? s : null));

export const reviewSchema = z.object({
  summary: text(800),
  correctness: z.object({ rating, note: text(600) }),
  readability: z.object({ rating, note: text(600) }),
  maintainability: z.object({ rating, note: text(600) }),
  complexity: z.object({ time: text(40), space: text(40), explanation: text(600) }),
  bugs: z
    .array(
      z.object({
        severity: level,
        title: text(120),
        description: text(500),
        line: lineNumber,
        fix: optionalText(400),
      }),
    )
    .max(8),
  suggestions: z.array(z.object({ priority: level, title: text(120), detail: text(500) })).max(8),
  strengths: z.array(text(300)).max(5),
});

export type AiReview = z.infer<typeof reviewSchema>;
