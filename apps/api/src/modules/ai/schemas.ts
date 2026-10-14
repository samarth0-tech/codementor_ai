import { z } from "zod";

// What we accept from the AI. Anything else is rejected (and repaired or failed), never trusted.

const rating = z
  .number()
  .min(0)
  .max(10)
  .transform((n) => Math.round(n));

const shortList = (max: number, itemMax = 300) =>
  z.array(z.string().trim().min(1).max(itemMax)).max(max);

export const planSchemaFor = (questionCount: number) =>
  z.object({
    slots: z
      .array(
        z.object({
          topic: z.string().trim().min(2).max(100),
          kind: z.enum(["CONCEPTUAL", "BEHAVIORAL"]),
          focus: z.string().trim().min(2).max(200),
        }),
      )
      .length(questionCount),
  });
export type InterviewPlan = z.infer<ReturnType<typeof planSchemaFor>>;

export const questionSchema = z.object({
  question: z.string().trim().min(10).max(800),
});

export const evaluationSchema = z.object({
  correctness: rating,
  depth: rating,
  clarity: rating,
  strengths: shortList(3),
  weaknesses: shortList(3),
  feedback: z.string().trim().min(1).max(1200),
});
export type AiEvaluation = z.infer<typeof evaluationSchema>;

export const narrativeSchema = z.object({
  summary: z.string().trim().min(1).max(1500),
  strengths: shortList(5),
  weaknesses: shortList(5),
  recommendations: z.array(z.string().trim().min(1).max(300)).min(1).max(5),
});
export type AiNarrative = z.infer<typeof narrativeSchema>;
