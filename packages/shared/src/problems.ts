import { z } from "zod";
import { DIFFICULTIES, type Difficulty, type Language } from "./constants.js";

export const problemListQuerySchema = z.object({
  topic: z
    .string()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    .optional(),
  difficulty: z.enum(DIFFICULTIES).optional(),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type ProblemListQuery = z.infer<typeof problemListQuerySchema>;

export interface TopicDto {
  name: string;
  slug: string;
}

export interface ProblemSummary {
  id: string;
  slug: string;
  title: string;
  difficulty: Difficulty;
  topics: TopicDto[];
}

export interface ProblemSample {
  input: string;
  expectedOutput: string;
  explanation: string | null;
}

export interface ProblemDetail extends ProblemSummary {
  description: string;
  inputFormat: string;
  outputFormat: string;
  constraints: string;
  timeLimitMs: number;
  memoryLimitKb: number;
  /** Only sample test cases. Hidden test cases never leave the backend. */
  samples: ProblemSample[];
  starterCode: Partial<Record<Language, string>>;
}

export interface Paginated<T> {
  data: T[];
  meta: { page: number; limit: number; total: number };
}

export interface LanguageDto {
  language: Language;
  displayName: string;
  monacoId: string;
}
