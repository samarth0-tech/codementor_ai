import { z } from "zod";
import {
  MAX_REVIEW_CODE_CHARS,
  SEVERITIES,
  computeOverallQuality,
  limitCorrectness,
  type CodeReviewDto,
  type ReviewBug,
  type ReviewSuggestion,
} from "@codementor/shared";
import { AppError } from "../../lib/errors.js";
import type { PrismaClient } from "../../lib/prisma.js";
import type { Prisma } from "../../generated/prisma/client.js";
import type { AiService } from "../ai/ai.service.js";
import { buildReviewPrompt, countLines, type ReviewContext } from "../ai/prompts/review.js";
import { reviewSchema, type AiReview } from "./review.schema.js";

const uuid = z.uuid();

// Only fields that EVERY version of the submission pipeline stores (Phase 8 onwards). The review
// never depends on which executor ran the code (Judge0, Piston, mock...), and never calls one.
const submissionSelect = {
  id: true,
  language: true,
  sourceCode: true,
  status: true,
  verdict: true,
  passedCount: true,
  totalCount: true,
  compileOutput: true,
  problem: {
    select: {
      title: true,
      description: true,
      inputFormat: true,
      outputFormat: true,
      constraints: true,
    },
  },
  results: {
    select: {
      passed: true,
      stdout: true,
      stderr: true,
      testCase: { select: { isSample: true, orderIndex: true, input: true, expectedOutput: true } },
    },
  },
  review: true,
} satisfies Prisma.SubmissionSelect;

type SubmissionRow = Prisma.SubmissionGetPayload<{ select: typeof submissionSelect }>;
type ReviewRow = NonNullable<SubmissionRow["review"]>;

/** HIGH = 2, MEDIUM = 1, LOW = 0: sort descending to list the most serious first. */
const severityRank = (s: string) => SEVERITIES.indexOf(s as (typeof SEVERITIES)[number]);

/** What the AI is told. Hidden tests contribute only COUNTS: never their input or output. */
export function buildContext(row: SubmissionRow): ReviewContext {
  const sample = row.results.filter((r) => r.testCase.isSample);
  const hidden = row.results.filter((r) => !r.testCase.isSample);
  return {
    problem: row.problem,
    language: row.language,
    code: row.sourceCode,
    verdict: row.verdict as NonNullable<SubmissionRow["verdict"]>,
    passed: row.passedCount,
    total: row.totalCount,
    compileOutput: row.compileOutput,
    failedExamples: sample
      .filter((r) => !r.passed)
      .sort((a, b) => a.testCase.orderIndex - b.testCase.orderIndex)
      .slice(0, 2)
      .map((r) => ({
        input: r.testCase.input,
        expected: r.testCase.expectedOutput,
        actual: r.stdout ?? "",
        error: r.stderr,
      })),
    hiddenFailed: hidden.filter((r) => !r.passed).length,
    hiddenTotal: hidden.length,
  };
}

const detailsSchema = z.object({
  notes: z.object({
    correctness: z.string(),
    readability: z.string(),
    maintainability: z.string(),
  }),
  bugs: z.array(z.any()),
  suggestions: z.array(z.any()),
  strengths: z.array(z.string()),
  correctnessAdjusted: z.boolean(),
});

function toDto(row: ReviewRow): CodeReviewDto {
  const parsed = detailsSchema.safeParse(row.details);
  const d = parsed.success
    ? parsed.data
    : {
        notes: { correctness: "", readability: "", maintainability: "" },
        bugs: [],
        suggestions: [],
        strengths: [],
        correctnessAdjusted: false,
      };
  return {
    id: row.id,
    submissionId: row.submissionId,
    summary: row.summary,
    ratings: {
      correctness: row.correctnessRating,
      readability: row.readabilityRating,
      maintainability: row.maintainabilityRating,
    },
    overallScore: row.overallScore,
    correctnessAdjusted: d.correctnessAdjusted,
    notes: d.notes,
    complexity: {
      time: row.timeComplexity,
      space: row.spaceComplexity,
      explanation: row.complexityNote,
    },
    bugs: d.bugs as ReviewBug[],
    suggestions: d.suggestions as ReviewSuggestion[],
    strengths: d.strengths,
    verdictAtReview: row.verdictAtReview,
    createdAt: row.createdAt.toISOString(),
  };
}

export class ReviewService {
  /** Simultaneous requests for the same submission share ONE AI call (this server instance). */
  private readonly inflight = new Map<string, Promise<CodeReviewDto>>();

  constructor(
    private readonly prisma: PrismaClient,
    private readonly ai: AiService,
  ) {}

  /** Returns the stored review of one of MY submissions. Someone else's id looks like a missing one. */
  async get(userId: string, submissionId: string): Promise<CodeReviewDto> {
    if (!uuid.safeParse(submissionId).success) throw AppError.notFound("Review not found");
    const row = await this.prisma.codeReview.findFirst({
      where: { submissionId, submission: { userId } },
    });
    if (!row)
      throw new AppError(404, "REVIEW_NOT_FOUND", "This submission has not been reviewed yet");
    return toDto(row);
  }

  /** Creates the review (or returns the existing one: a submission is reviewed once). */
  async create(
    userId: string,
    submissionId: string,
  ): Promise<{ review: CodeReviewDto; created: boolean }> {
    if (!uuid.safeParse(submissionId).success) throw AppError.notFound("Submission not found");

    const row = await this.prisma.submission.findFirst({
      where: { id: submissionId, userId },
      select: submissionSelect,
    });
    if (!row) throw AppError.notFound("Submission not found");
    if (row.review) return { review: toDto(row.review), created: false };

    if (row.status !== "COMPLETED" || row.verdict === null || row.verdict === "INTERNAL_ERROR") {
      throw new AppError(
        409,
        "SUBMISSION_NOT_REVIEWABLE",
        "Wait for the submission to finish before asking for a review. Submissions that failed on our side cannot be reviewed.",
      );
    }
    if (row.sourceCode.length > MAX_REVIEW_CODE_CHARS) {
      throw new AppError(
        400,
        "CODE_TOO_LARGE_FOR_REVIEW",
        `Code longer than ${MAX_REVIEW_CODE_CHARS.toLocaleString("en-US")} characters cannot be reviewed.`,
      );
    }

    const running = this.inflight.get(submissionId);
    if (running) return { review: await running, created: false };

    const job = this.generate(userId, row).finally(() => this.inflight.delete(submissionId));
    this.inflight.set(submissionId, job);
    return { review: await job, created: true };
  }

  private async generate(userId: string, row: SubmissionRow): Promise<CodeReviewDto> {
    const verdict = row.verdict as NonNullable<SubmissionRow["verdict"]>;
    const prompt = buildReviewPrompt(buildContext(row));
    const ai = await this.ai.generateStructured<AiReview>({
      userId,
      feature: "CODE_REVIEW",
      tier: "reasoning",
      temperature: 0.3,
      schema: reviewSchema,
      ...prompt,
    });

    // Deterministic post-processing: the AI rates and writes; the application decides the numbers.
    const lineCount = countLines(row.sourceCode);
    const correctness = limitCorrectness(ai.correctness.rating, {
      verdict,
      passed: row.passedCount,
      total: row.totalCount,
    });
    const ratings = {
      correctness: correctness.rating,
      readability: ai.readability.rating,
      maintainability: ai.maintainability.rating,
    };
    const bugs: ReviewBug[] = ai.bugs
      .map((b) => ({
        ...b,
        // A line number the AI made up (beyond the end of the code) is dropped.
        line: b.line !== null && b.line <= lineCount ? b.line : null,
      }))
      .sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
    const suggestions: ReviewSuggestion[] = [...ai.suggestions].sort(
      (a, b) => severityRank(b.priority) - severityRank(a.priority),
    );

    const details = {
      notes: {
        correctness: ai.correctness.note,
        readability: ai.readability.note,
        maintainability: ai.maintainability.note,
      },
      bugs,
      suggestions,
      strengths: ai.strengths,
      correctnessAdjusted: correctness.adjusted,
    };

    try {
      const saved = await this.prisma.codeReview.create({
        data: {
          submissionId: row.id,
          summary: ai.summary,
          correctnessRating: ratings.correctness,
          readabilityRating: ratings.readability,
          maintainabilityRating: ratings.maintainability,
          overallScore: computeOverallQuality(ratings),
          timeComplexity: ai.complexity.time,
          spaceComplexity: ai.complexity.space,
          complexityNote: ai.complexity.explanation,
          // plain JSON (strings, numbers, arrays): safe to store as-is
          details: details as unknown as Prisma.InputJsonObject,
          verdictAtReview: verdict,
          promptVersion: prompt.promptVersion,
        },
      });
      return toDto(saved);
    } catch (err) {
      // Another server instance finished first: that review wins.
      if ((err as { code?: string }).code === "P2002") {
        const existing = await this.prisma.codeReview.findUniqueOrThrow({
          where: { submissionId: row.id },
        });
        return toDto(existing);
      }
      throw err;
    }
  }
}
