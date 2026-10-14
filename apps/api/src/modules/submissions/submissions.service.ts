import { z } from "zod";
import type {
  CaseResultDto,
  CreateSubmissionInput,
  Paginated,
  SubmissionDetail,
  SubmissionSummary,
} from "@codementor/shared";
import { AppError } from "../../lib/errors.js";
import type { PrismaClient } from "../../lib/prisma.js";
import type { Prisma } from "../../generated/prisma/client.js";
import type { SubmissionRunner } from "./submission.runner.js";

const uuid = z.uuid();

const summarySelect = {
  id: true,
  language: true,
  mode: true,
  status: true,
  verdict: true,
  passedCount: true,
  totalCount: true,
  maxTimeMs: true,
  maxMemoryKb: true,
  executor: true,
  errorMessage: true,
  createdAt: true,
  completedAt: true,
  problem: { select: { slug: true } },
} satisfies Prisma.SubmissionSelect;

type SummaryRow = Prisma.SubmissionGetPayload<{ select: typeof summarySelect }>;

const toSummary = (row: SummaryRow): SubmissionSummary => ({
  id: row.id,
  problemSlug: row.problem.slug,
  language: row.language,
  mode: row.mode,
  status: row.status,
  verdict: row.verdict,
  passedCount: row.passedCount,
  totalCount: row.totalCount,
  maxTimeMs: row.maxTimeMs,
  maxMemoryKb: row.maxMemoryKb,
  executor: row.executor,
  errorMessage: row.errorMessage,
  createdAt: row.createdAt.toISOString(),
  completedAt: row.completedAt?.toISOString() ?? null,
});

/** Each student may have at most this many submissions waiting or running at once. */
export const MAX_PENDING_PER_USER = 3;

export class SubmissionService {
  /** `runner` is null when no code executor is configured: history still works, running does not. */
  constructor(
    private readonly prisma: PrismaClient,
    private readonly runner: SubmissionRunner | null,
  ) {}

  async create(userId: string, input: CreateSubmissionInput): Promise<SubmissionDetail> {
    const runner = this.runner;
    if (!runner) {
      throw AppError.unavailable(
        "Code execution is not configured on this server",
        "CODE_EXECUTION_NOT_CONFIGURED",
      );
    }

    const problem = await this.prisma.problem.findFirst({
      where: { slug: input.problem, status: "PUBLISHED" },
      select: { id: true },
    });
    if (!problem) throw AppError.notFound("Problem not found");

    const language = await this.prisma.languageConfig.findUnique({
      where: { language: input.language },
    });
    if (!language?.enabled) {
      throw new AppError(400, "LANGUAGE_NOT_SUPPORTED", "That language is not available right now");
    }

    // Ask the executor which languages it can REALLY run (Judge0 instances differ). null = unknown.
    const supported = await runner.supportedLanguages();
    if (supported && !supported.includes(input.language)) {
      throw new AppError(400, "LANGUAGE_NOT_SUPPORTED", "That language is not available right now");
    }

    // A student cannot flood the queue: a few submissions at a time, finish one to start another.
    const pending = await this.prisma.submission.count({
      where: { userId, status: { in: ["QUEUED", "RUNNING"] } },
    });
    if (pending >= MAX_PENDING_PER_USER) {
      throw new AppError(
        429,
        "TOO_MANY_PENDING",
        "You already have submissions running. Please wait for them to finish.",
      );
    }

    const totalCount = await this.prisma.testCase.count({
      where: { problemId: problem.id, ...(input.mode === "RUN" ? { isSample: true } : {}) },
    });
    const created = await this.prisma.submission.create({
      data: {
        userId,
        problemId: problem.id,
        language: input.language,
        sourceCode: input.sourceCode,
        mode: input.mode,
        executor: runner.executorName,
        totalCount,
      },
      select: { id: true },
    });
    runner.enqueue(created.id);
    return this.get(userId, created.id);
  }

  async get(userId: string, id: string): Promise<SubmissionDetail> {
    if (!uuid.safeParse(id).success) throw AppError.notFound("Submission not found");
    // `userId` in the WHERE clause is the ownership check: someone else's id looks like a missing one.
    const row = await this.prisma.submission.findFirst({
      where: { id, userId },
      select: {
        ...summarySelect,
        sourceCode: true,
        compileOutput: true,
        results: {
          select: {
            verdict: true,
            passed: true,
            stdout: true,
            stderr: true,
            timeMs: true,
            memoryKb: true,
            testCase: {
              select: { isSample: true, orderIndex: true, input: true, expectedOutput: true },
            },
          },
        },
      },
    });
    if (!row) throw AppError.notFound("Submission not found");

    const results: CaseResultDto[] = [...row.results]
      .sort((a, b) => a.testCase.orderIndex - b.testCase.orderIndex)
      .map((r, i) => {
        const base = {
          index: i + 1,
          isSample: r.testCase.isSample,
          verdict: r.verdict,
          passed: r.passed,
          timeMs: r.timeMs,
          memoryKb: r.memoryKb,
        };
        // Hidden test cases reveal ONLY pass/fail, time and memory: never input, expected
        // output, the program's output or stderr (those could leak the test data).
        return r.testCase.isSample
          ? {
              ...base,
              input: r.testCase.input,
              expectedOutput: r.testCase.expectedOutput,
              stdout: r.stdout,
              stderr: r.stderr,
            }
          : base;
      });

    return {
      ...toSummary(row),
      sourceCode: row.sourceCode,
      compileOutput: row.compileOutput,
      results,
    };
  }

  async list(
    userId: string,
    query: { problem?: string | undefined; page: number; limit: number },
  ): Promise<Paginated<SubmissionSummary>> {
    const where = { userId, ...(query.problem ? { problem: { slug: query.problem } } : {}) };
    const [total, rows] = await Promise.all([
      this.prisma.submission.count({ where }),
      this.prisma.submission.findMany({
        where,
        select: summarySelect,
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);
    return { data: rows.map(toSummary), meta: { page: query.page, limit: query.limit, total } };
  }
}
