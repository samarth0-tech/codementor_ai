import { z } from "zod";
import { LANGUAGES, type Language } from "./constants.js";

export const SUBMISSION_MODES = ["RUN", "SUBMIT"] as const;
export type SubmissionMode = (typeof SUBMISSION_MODES)[number];

export const SUBMISSION_STATUSES = ["QUEUED", "RUNNING", "COMPLETED", "FAILED"] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

export const VERDICTS = [
  "ACCEPTED",
  "WRONG_ANSWER",
  "TIME_LIMIT",
  "MEMORY_LIMIT",
  "RUNTIME_ERROR",
  "COMPILE_ERROR",
  "INTERNAL_ERROR",
] as const;
export type Verdict = (typeof VERDICTS)[number];

export const MAX_SOURCE_BYTES = 64 * 1024;

const slug = z
  .string()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  .max(120);

export const createSubmissionSchema = z.object({
  problem: slug,
  language: z.enum(LANGUAGES),
  // Not trimmed on purpose: whitespace is meaningful (Python indentation).
  sourceCode: z
    .string()
    .refine((s) => s.trim().length > 0, "Write some code first")
    .refine(
      (s) => new TextEncoder().encode(s).length <= MAX_SOURCE_BYTES,
      `Code is too large (limit ${MAX_SOURCE_BYTES / 1024} KB)`,
    ),
  mode: z.enum(SUBMISSION_MODES),
});
export type CreateSubmissionInput = z.infer<typeof createSubmissionSchema>;

export const submissionListQuerySchema = z.object({
  problem: slug.optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export function isTerminalStatus(status: SubmissionStatus): boolean {
  return status === "COMPLETED" || status === "FAILED";
}

export interface CaseResultDto {
  /** 1-based position in this run. */
  index: number;
  isSample: boolean;
  verdict: Verdict;
  passed: boolean;
  timeMs: number | null;
  memoryKb: number | null;
  /** Present ONLY for sample cases. Hidden cases never reveal input, expected output or output. */
  input?: string;
  expectedOutput?: string;
  stdout?: string | null;
  stderr?: string | null;
}

export interface SubmissionSummary {
  id: string;
  problemSlug: string;
  language: Language;
  mode: SubmissionMode;
  status: SubmissionStatus;
  verdict: Verdict | null;
  passedCount: number;
  totalCount: number;
  maxTimeMs: number | null;
  maxMemoryKb: number | null;
  /** Which engine produced the result: "judge0" (real execution) or "mock" (simulation). */
  executor: string;
  /** Set when the run failed on OUR side (service down, busy...). Safe to show to the student. */
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface SubmissionDetail extends SubmissionSummary {
  sourceCode: string;
  compileOutput: string | null;
  results: CaseResultDto[];
}
