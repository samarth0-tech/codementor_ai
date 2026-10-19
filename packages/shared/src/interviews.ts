import { z } from "zod";
import { DIFFICULTIES, type Difficulty } from "./constants.js";

export const INTERVIEW_STATUSES = ["IN_PROGRESS", "COMPLETED", "ABANDONED", "EXPIRED"] as const;
export type InterviewStatus = (typeof INTERVIEW_STATUSES)[number];

export const QUESTION_KINDS = ["CONCEPTUAL", "CODING", "BEHAVIORAL", "FOLLOW_UP"] as const;
export type QuestionKind = (typeof QUESTION_KINDS)[number];

export const MAX_ANSWER_CHARS = 4000;

export const createInterviewSchema = z.object({
  type: z.enum(["TOPIC", "RESUME"]).default("TOPIC"),
  topic: z.string().trim().min(2, "Topic is too short").max(80),
  difficulty: z.enum(DIFFICULTIES),
  questionCount: z.number().int().min(3).max(10).default(5),
  durationMinutes: z.number().int().min(10).max(120).default(30),
  resumeId: z.string().uuid().optional(),
});
export type CreateInterviewInput = z.infer<typeof createInterviewSchema>;

export const submitAnswerSchema = z.object({
  questionId: z.uuid(),
  answer: z.string().trim().min(1, "Please write an answer").max(MAX_ANSWER_CHARS),
  timeTakenSec: z.number().int().min(0).max(86_400).optional(),
});
export type SubmitAnswerInput = z.infer<typeof submitAnswerSchema>;

export const interviewListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export interface EvaluationDto {
  correctness: number;
  depth: number;
  clarity: number;
  /** 0-100, computed by the server from the three ratings (not by the AI). */
  score: number;
  strengths: string[];
  weaknesses: string[];
  feedback: string;
}

export interface QuestionDto {
  id: string;
  orderIndex: number;
  slotIndex: number;
  kind: QuestionKind;
  parentQuestionId: string | null;
  text: string;
  askedAt: string;
  answer: { text: string; answeredAt: string; evaluation: EvaluationDto | null } | null;
}

export interface ReportDto {
  overallScore: number;
  correctnessScore: number;
  depthScore: number;
  clarityScore: number;
  band: string;
  summary: string;
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
  /** false when the AI narrative failed and a plain fallback summary was stored instead. */
  aiNarrative: boolean;
  generatedAt: string;
}

export interface InterviewSummary {
  id: string;
  type?: "TOPIC" | "RESUME" | "MIXED";
  topic: string;
  difficulty: Difficulty;
  status: InterviewStatus;
  overallScore: number | null;
  plannedQuestionCount: number;
  answeredCount: number;
  startedAt: string;
  endedAt: string | null;
  resumeId?: string | null;
}

export interface InterviewDetail extends InterviewSummary {
  durationMinutes: number;
  /** When the time limit ends (startedAt + durationMinutes). */
  expiresAt: string;
  questions: QuestionDto[];
  /** The question waiting for an answer, or null. */
  currentQuestionId: string | null;
  /** true when the last answer was saved but the next step failed: call the retry endpoint. */
  needsRetry: boolean;
  report: ReportDto | null;
}
