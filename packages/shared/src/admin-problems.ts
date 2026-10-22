import { z } from "zod";
import { DIFFICULTIES, type Difficulty, type Language } from "./constants.js";
import type { TopicDto } from "./problems.js";

export const PROBLEM_STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;
export type ProblemStatus = (typeof PROBLEM_STATUSES)[number];

// ── Admin Problem Listing Query ─────────────────────────────────────────────

export const adminProblemListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().max(200).optional(),
  difficulty: z.enum(DIFFICULTIES).optional(),
  status: z.enum(PROBLEM_STATUSES).optional(),
  topic: z.string().optional(),
  sortBy: z.enum(["createdAt", "title", "difficulty", "status"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});
export type AdminProblemListQuery = z.infer<typeof adminProblemListQuerySchema>;

export interface AdminProblemSummary {
  id: string;
  slug: string;
  title: string;
  difficulty: Difficulty;
  status: ProblemStatus;
  timeLimitMs: number;
  memoryLimitKb: number;
  topics: TopicDto[];
  testCaseCount: number;
  sampleTestCaseCount: number;
  submissionCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminProblemListResponse {
  data: AdminProblemSummary[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// ── Test Cases ──────────────────────────────────────────────────────────────

export const adminTestCaseSchema = z.object({
  input: z.string(),
  expectedOutput: z.string(),
  isSample: z.boolean().default(false),
  weight: z.coerce.number().int().min(1).max(100).default(1),
  orderIndex: z.coerce.number().int().min(0).default(0),
  explanation: z.string().nullable().optional(),
});
export type AdminTestCaseInput = z.infer<typeof adminTestCaseSchema>;

export interface AdminTestCaseDto {
  id: string;
  problemId: string;
  input: string;
  expectedOutput: string;
  isSample: boolean;
  weight: number;
  orderIndex: number;
  explanation: string | null;
}

// ── Create & Update Problem ─────────────────────────────────────────────────

export const adminCreateProblemSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(120),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Slug must be lowercase alphanumeric with hyphens")
    .optional(),
  description: z.string().trim().min(1, "Description is required"),
  inputFormat: z.string().default(""),
  outputFormat: z.string().default(""),
  constraints: z.string().default(""),
  difficulty: z.enum(DIFFICULTIES),
  timeLimitMs: z.coerce.number().int().min(100).max(10_000).default(2000),
  memoryLimitKb: z.coerce.number().int().min(16_000).max(512_000).default(256_000),
  status: z.enum(PROBLEM_STATUSES).default("DRAFT"),
  topicSlugs: z.array(z.string()).default([]),
  starterCode: z.record(z.string(), z.string()).optional(),
  testCases: z.array(adminTestCaseSchema).optional(),
});
export type AdminCreateProblemInput = z.infer<typeof adminCreateProblemSchema>;

export const adminUpdateProblemSchema = adminCreateProblemSchema.partial();
export type AdminUpdateProblemInput = z.infer<typeof adminUpdateProblemSchema>;

// ── Admin Full Problem Detail ───────────────────────────────────────────────

export interface AdminProblemDetail {
  id: string;
  slug: string;
  title: string;
  description: string;
  inputFormat: string;
  outputFormat: string;
  constraints: string;
  difficulty: Difficulty;
  timeLimitMs: number;
  memoryLimitKb: number;
  status: ProblemStatus;
  version: number;
  topics: TopicDto[];
  starterCode: Partial<Record<Language, string>>;
  testCases: AdminTestCaseDto[];
  createdAt: string;
  updatedAt: string;
}
