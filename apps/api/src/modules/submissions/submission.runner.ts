import type { Logger } from "../../lib/logger.js";
import type { PrismaClient } from "../../lib/prisma.js";
import type { Language } from "@codementor/shared";
import { ExecutionError, type CodeExecutor } from "./executor.js";
import { aggregateVerdict } from "./verdict.js";

const max = (values: (number | null)[]): number | null => {
  const numbers = values.filter((v): v is number => v !== null);
  return numbers.length ? Math.max(...numbers) : null;
};

/**
 * Runs queued submissions in the background so the HTTP request can return immediately
 * (202 Accepted) and the browser polls for the result.
 *
 * It lives inside the API process for now. If submissions ever need to survive restarts or scale
 * across servers, replace this class with a durable queue (e.g. BullMQ + Redis) behind the same
 * enqueue() call. recoverStale() covers the gap today: anything left unfinished by a crash is
 * marked failed on the next startup instead of staying "running" forever.
 */
export class SubmissionRunner {
  private readonly pending: string[] = [];
  private readonly inflight = new Set<Promise<void>>();
  private active = 0;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly executor: CodeExecutor,
    private readonly logger: Logger,
    private readonly maxConcurrent = 4,
  ) {}

  get executorName(): string {
    return this.executor.name;
  }

  enqueue(submissionId: string): void {
    this.pending.push(submissionId);
    this.pump();
  }

  /** Languages the executor can really run right now, or null if unknown. */
  async supportedLanguages(): Promise<Language[] | null> {
    try {
      return (await this.executor.supportedLanguages?.()) ?? null;
    } catch {
      return null;
    }
  }

  /** Resolves when everything queued so far has finished. Used by tests and graceful shutdown. */
  async drain(): Promise<void> {
    while (this.pending.length > 0 || this.inflight.size > 0) {
      await Promise.allSettled([...this.inflight]);
    }
  }

  /** Marks submissions that were queued/running when the server last stopped as failed. */
  async recoverStale(olderThanMs = 5 * 60_000): Promise<number> {
    const result = await this.prisma.submission.updateMany({
      where: {
        status: { in: ["QUEUED", "RUNNING"] },
        createdAt: { lt: new Date(Date.now() - olderThanMs) },
      },
      data: {
        status: "FAILED",
        verdict: "INTERNAL_ERROR",
        errorMessage:
          "The submission was interrupted when the server restarted. Please submit again.",
        completedAt: new Date(),
      },
    });
    if (result.count > 0) this.logger.warn({ count: result.count }, "Recovered stale submissions");
    return result.count;
  }

  private pump(): void {
    while (this.active < this.maxConcurrent && this.pending.length > 0) {
      const id = this.pending.shift() as string;
      this.active++;
      const job = this.run(id)
        .catch((err: unknown) =>
          this.logger.error({ err, submissionId: id }, "Submission runner crashed"),
        )
        .finally(() => {
          this.active--;
          this.inflight.delete(job);
          this.pump();
        });
      this.inflight.add(job);
    }
  }

  private async run(id: string): Promise<void> {
    try {
      const submission = await this.prisma.submission.update({
        where: { id },
        data: { status: "RUNNING" },
        include: { problem: { select: { timeLimitMs: true, memoryLimitKb: true } } },
      });
      const cases = await this.prisma.testCase.findMany({
        where: {
          problemId: submission.problemId,
          ...(submission.mode === "RUN" ? { isSample: true } : {}),
        },
        orderBy: { orderIndex: "asc" },
        select: { id: true, input: true, expectedOutput: true },
      });

      const starter = await this.prisma.problemStarterCode.findUnique({
        where: {
          problemId_language: { problemId: submission.problemId, language: submission.language },
        },
        select: { code: true },
      });

      const outcome = await this.executor.execute({
        language: submission.language,
        sourceCode: submission.sourceCode,
        cases: cases.map((c) => ({
          testCaseId: c.id,
          input: c.input,
          expectedOutput: c.expectedOutput,
        })),
        timeLimitMs: submission.problem.timeLimitMs,
        memoryLimitKb: submission.problem.memoryLimitKb,
        starterCode: starter?.code ?? null,
      });

      const verdict = aggregateVerdict(outcome.compileOutput, outcome.results);
      await this.prisma.$transaction([
        this.prisma.submissionResult.createMany({
          data: outcome.results.map((r) => ({
            submissionId: id,
            testCaseId: r.testCaseId,
            verdict: r.verdict,
            stdout: r.stdout,
            stderr: r.stderr,
            timeMs: r.timeMs,
            memoryKb: r.memoryKb,
            passed: r.verdict === "ACCEPTED",
          })),
        }),
        this.prisma.submission.update({
          where: { id },
          data: {
            status: "COMPLETED",
            verdict,
            totalCount: cases.length,
            passedCount: outcome.results.filter((r) => r.verdict === "ACCEPTED").length,
            maxTimeMs: max(outcome.results.map((r) => r.timeMs)),
            maxMemoryKb: max(outcome.results.map((r) => r.memoryKb)),
            compileOutput: outcome.compileOutput,
            completedAt: new Date(),
          },
        }),
      ]);
    } catch (err) {
      // Whatever went wrong, the submission must not stay "running" forever, and the student is
      // never blamed: the verdict is INTERNAL_ERROR with a short, safe explanation. Details go to
      // the server log only.
      let errorMessage =
        "Something went wrong on our side while running your code. Please try again.";
      if (err instanceof ExecutionError) {
        errorMessage = err.userMessage;
        const needsAttention = !["UNAVAILABLE", "RATE_LIMITED", "TIMEOUT"].includes(err.kind);
        this.logger[needsAttention ? "error" : "warn"](
          { kind: err.kind, submissionId: id, detail: err.message },
          "Code execution failed",
        );
      } else {
        this.logger.error({ err, submissionId: id }, "Submission failed");
      }
      await this.prisma.submission
        .update({
          where: { id },
          data: {
            status: "FAILED",
            verdict: "INTERNAL_ERROR",
            errorMessage,
            completedAt: new Date(),
          },
        })
        .catch(() => undefined);
    }
  }
}
