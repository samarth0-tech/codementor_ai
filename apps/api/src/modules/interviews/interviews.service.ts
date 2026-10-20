import {
  generateImprovementPlan,
  type CreateInterviewInput,
  type Difficulty,
  type EvaluationDto,
  type InterviewDetail,
  type InterviewSummary,
  type Paginated,
  type QuestionDto,
  type ReportDto,
  type SubmitAnswerInput,
} from "@codementor/shared";
import { z } from "zod";
import { AppError } from "../../lib/errors.js";
import type { PrismaClient } from "../../lib/prisma.js";
import type { Prisma } from "../../generated/prisma/client.js";
import type { AiService } from "../ai/ai.service.js";
import {
  buildFollowUpPrompt,
  buildPlanPrompt,
  buildQuestionPrompt,
  type DifficultyAdjustment,
  type PlanSlot,
} from "../ai/prompts/interview.js";
import { planSchemaFor, questionSchema } from "../ai/schemas.js";
import { decideNextStep, difficultyAdjustment } from "./adaptive.js";
import type { EvaluationService } from "./evaluation.service.js";

const detailInclude = {
  questions: {
    orderBy: { orderIndex: "asc" },
    include: { answer: { include: { evaluation: true } } },
  },
  report: true,
} satisfies Prisma.InterviewInclude;

type InterviewRow = Prisma.InterviewGetPayload<{ include: typeof detailInclude }>;
type QuestionRow = InterviewRow["questions"][number];

const uuid = z.uuid();
const strings = (json: unknown): string[] =>
  Array.isArray(json) ? json.filter((v): v is string => typeof v === "string") : [];

const isUniqueViolation = (err: unknown) => (err as { code?: string })?.code === "P2002";

function isExpired(row: { startedAt: Date; durationMinutes: number }, now = new Date()): boolean {
  return now.getTime() > row.startedAt.getTime() + row.durationMinutes * 60_000;
}

function toEvaluation(
  e: NonNullable<NonNullable<QuestionRow["answer"]>["evaluation"]>,
): EvaluationDto {
  return {
    correctness: e.correctness,
    depth: e.depth,
    clarity: e.clarity,
    score: e.score,
    strengths: strings(e.strengths),
    weaknesses: strings(e.weaknesses),
    feedback: e.feedback,
  };
}

function toQuestion(q: QuestionRow): QuestionDto {
  return {
    id: q.id,
    orderIndex: q.orderIndex,
    slotIndex: q.slotIndex,
    kind: q.kind,
    parentQuestionId: q.parentQuestionId,
    text: q.text,
    askedAt: q.askedAt.toISOString(),
    answer: q.answer
      ? {
          text: q.answer.text,
          answeredAt: q.answer.answeredAt.toISOString(),
          evaluation: q.answer.evaluation ? toEvaluation(q.answer.evaluation) : null,
        }
      : null,
  };
}

function toReport(
  r: NonNullable<InterviewRow["report"]>,
  topic = "General Technical Interview",
  difficulty: Difficulty = "MEDIUM",
): ReportDto {
  const weaknesses = strings(r.weaknesses);
  const recommendations = strings(r.recommendations);
  return {
    overallScore: r.overallScore,
    correctnessScore: r.correctnessScore,
    depthScore: r.depthScore,
    clarityScore: r.clarityScore,
    band: r.band,
    summary: r.summary,
    strengths: strings(r.strengths),
    weaknesses,
    recommendations,
    aiNarrative: r.aiNarrative,
    generatedAt: r.generatedAt.toISOString(),
    improvementPlan: generateImprovementPlan({
      topic,
      weaknesses,
      recommendations,
      difficulty,
    }),
  };
}

function toDetail(row: InterviewRow): InterviewDetail {
  const last = row.questions.at(-1);
  const active = row.status === "IN_PROGRESS";
  return {
    id: row.id,
    type: row.type,
    topic: row.topic,
    difficulty: row.difficulty,
    status: row.status,
    overallScore: row.overallScore,
    plannedQuestionCount: row.plannedQuestionCount,
    answeredCount: row.questions.filter((q) => q.answer).length,
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt?.toISOString() ?? null,
    resumeId: row.resumeId,
    durationMinutes: row.durationMinutes,
    expiresAt: new Date(row.startedAt.getTime() + row.durationMinutes * 60_000).toISOString(),
    questions: row.questions.map(toQuestion),
    currentQuestionId: active && last && !last.answer ? last.id : null,
    needsRetry: active && !!last?.answer,
    report: row.report ? toReport(row.report, row.topic, row.difficulty) : null,
  };
}

export class InterviewService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly ai: AiService,
    private readonly evaluation: EvaluationService,
  ) {}

  // ---------------------------------------------------------------- queries

  async list(userId: string, page: number, limit: number): Promise<Paginated<InterviewSummary>> {
    const where = { userId };
    const [total, rows] = await Promise.all([
      this.prisma.interview.count({ where }),
      this.prisma.interview.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: { questions: { select: { answer: { select: { id: true } } } } },
      }),
    ]);
    return {
      data: rows.map((r) => ({
        id: r.id,
        topic: r.topic,
        difficulty: r.difficulty,
        status: r.status,
        overallScore: r.overallScore,
        plannedQuestionCount: r.plannedQuestionCount,
        answeredCount: r.questions.filter((q) => q.answer).length,
        startedAt: r.startedAt.toISOString(),
        endedAt: r.endedAt?.toISOString() ?? null,
      })),
      meta: { page, limit, total },
    };
  }

  async get(userId: string, id: string): Promise<InterviewDetail> {
    return toDetail(await this.loadOwned(userId, id));
  }

  async getReport(userId: string, id: string): Promise<ReportDto> {
    const row = await this.loadOwned(userId, id);
    if (!row.report) throw AppError.notFound("The report is not available yet");
    return toReport(row.report, row.topic, row.difficulty);
  }

  // --------------------------------------------------------------- commands

  async create(userId: string, input: CreateInterviewInput): Promise<InterviewDetail> {
    await this.expireStale(userId);
    await this.assertNoActive(userId);

    // If resumeId is supplied, verify ownership and construct background context
    let resumeContext: string | undefined;
    let resumeId: string | null = null;
    if (input.resumeId) {
      const resume = await this.prisma.resume.findFirst({
        where: { id: input.resumeId, userId },
        select: {
          id: true,
          skills: true,
          technologies: true,
          projects: true,
          experience: true,
          education: true,
        },
      });
      if (!resume) {
        throw AppError.notFound("Resume not found");
      }
      resumeId = resume.id;
      const skills = Array.isArray(resume.skills) ? resume.skills.join(", ") : "";
      const tech = Array.isArray(resume.technologies) ? resume.technologies.join(", ") : "";
      const proj = Array.isArray(resume.projects)
        ? (resume.projects as Array<{ title?: string; technologies?: string[] }>)
            .map((p) => `${p.title || "Project"}: ${(p.technologies || []).join(", ")}`)
            .join("; ")
        : "";
      const exp = Array.isArray(resume.experience)
        ? (resume.experience as Array<{ role?: string; company?: string }>)
            .map((e) => `${e.role || "Role"} at ${e.company || "Company"}`)
            .join("; ")
        : "";

      resumeContext = [
        skills ? `Skills: ${skills}` : null,
        tech ? `Technologies: ${tech}` : null,
        proj ? `Projects: ${proj}` : null,
        exp ? `Experience: ${exp}` : null,
      ]
        .filter(Boolean)
        .join("\n");
    }

    // AI work happens BEFORE anything is written, so a failure leaves no half-created interview.
    const plan = await this.ai.generateStructured({
      userId,
      feature: "INTERVIEW_PLAN",
      tier: "reasoning",
      temperature: 0.5,
      schema: planSchemaFor(input.questionCount),
      ...buildPlanPrompt({ ...input, resumeContext }),
    });
    const firstSlot = plan.slots[0] as PlanSlot;
    const text = await this.writeQuestion(userId, input, firstSlot, 0, "same", []);

    const created = await this.prisma.$transaction(async (tx) => {
      // Serialize concurrent creates by the same user (double-click, two tabs).
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;
      const active = await tx.interview.findFirst({
        where: { userId, status: "IN_PROGRESS" },
        select: { id: true },
      });
      if (active) this.throwActive(active.id);
      return tx.interview.create({
        data: {
          userId,
          type: input.type === "RESUME" ? "RESUME" : "TOPIC",
          topic: input.topic,
          difficulty: input.difficulty,
          plan: plan.slots,
          plannedQuestionCount: input.questionCount,
          durationMinutes: input.durationMinutes,
          resumeId,
          questions: { create: { orderIndex: 0, slotIndex: 0, kind: firstSlot.kind, text } },
        },
        include: detailInclude,
      });
    });
    return toDetail(created);
  }

  async submitAnswer(
    userId: string,
    id: string,
    input: SubmitAnswerInput,
  ): Promise<InterviewDetail> {
    const row = await this.loadOwned(userId, id);
    this.assertActive(row);
    const last = row.questions.at(-1);
    if (!last || last.id !== input.questionId) {
      throw AppError.conflict("That is not the current question", "QUESTION_NOT_CURRENT");
    }
    if (last.answer)
      throw AppError.conflict("This question was already answered", "ALREADY_ANSWERED");

    // Save the answer FIRST: an AI failure later must never lose what the candidate wrote.
    try {
      await this.prisma.interviewAnswer.create({
        data: {
          questionId: last.id,
          text: input.answer,
          ...(input.timeTakenSec !== undefined ? { timeTakenSec: input.timeTakenSec } : {}),
        },
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw AppError.conflict("This question was already answered", "ALREADY_ANSWERED");
      }
      throw err;
    }

    await this.advance(userId, id);
    return this.get(userId, id);
  }

  /** After an AI failure: re-run the step that failed (evaluate and/or ask the next question). */
  async retry(userId: string, id: string): Promise<InterviewDetail> {
    const row = await this.loadOwned(userId, id);
    this.assertActive(row);
    if (!row.questions.at(-1)?.answer) {
      throw AppError.conflict("There is nothing to retry", "NOTHING_TO_RETRY");
    }
    await this.advance(userId, id);
    return this.get(userId, id);
  }

  /** End early (or after the time limit) and produce the report from the answers so far. */
  async complete(userId: string, id: string): Promise<InterviewDetail> {
    const row = await this.loadOwned(userId, id);
    if (row.status === "COMPLETED") return toDetail(row);
    if (row.status === "ABANDONED") {
      throw AppError.conflict("This interview was abandoned", "INTERVIEW_NOT_ACTIVE");
    }
    await this.ensureLastEvaluated(userId, id);
    await this.finalize(userId, id);
    return this.get(userId, id);
  }

  async abandon(userId: string, id: string): Promise<InterviewDetail> {
    const row = await this.loadOwned(userId, id);
    this.assertActive(row);
    await this.prisma.interview.update({
      where: { id },
      data: { status: "ABANDONED", endedAt: new Date() },
    });
    return this.get(userId, id);
  }

  // ------------------------------------------------------------- the engine

  /**
   * Runs after an answer is saved. Idempotent: it only does the parts that are still missing, so
   * it is safe to call again (retry) after an AI failure.
   *   1. evaluate the answer (AI rates, the app computes the score)
   *   2. decide what happens next (deterministic rules)
   *   3. ask the next question (AI), or finish the interview
   */
  private async advance(userId: string, interviewId: string): Promise<void> {
    const pending = await this.loadInternal(interviewId);
    if (!pending.questions.at(-1)?.answer) return;

    const evaluation = await this.ensureLastEvaluated(userId, interviewId);
    // Reload AFTER evaluating: the snapshot above would not include the score we just stored,
    // and the adaptive rules must see it.
    const interview = await this.loadInternal(interviewId);
    const last = interview.questions.at(-1) as QuestionRow & {
      answer: NonNullable<QuestionRow["answer"]>;
    };
    const plan = interview.plan as unknown as PlanSlot[];
    const askedBefore = interview.questions.map((q) => q.text);
    const followUpsAsked = interview.questions.filter(
      (q) => q.slotIndex === last.slotIndex && q.kind === "FOLLOW_UP",
    ).length;

    const step = decideNextStep({
      score: evaluation.score,
      followUpsAsked,
      slotIndex: last.slotIndex,
      totalSlots: plan.length,
    });

    if (step.action === "FINISH") {
      await this.finalize(userId, interviewId);
      return;
    }

    const ctx = { topic: interview.topic, difficulty: interview.difficulty };
    let text: string;
    let slotIndex = last.slotIndex;
    let kind: QuestionRow["kind"] = "FOLLOW_UP";
    let parentQuestionId: string | null = last.parentQuestionId ?? last.id;

    if (step.action === "FOLLOW_UP") {
      const prompt = buildFollowUpPrompt({
        ...ctx,
        direction: step.direction,
        question: last.text,
        answer: last.answer.text,
        weaknesses: strings(evaluation.weaknesses),
        askedBefore,
      });
      text = (
        await this.ai.generateStructured({
          userId,
          feature: "FOLLOW_UP",
          tier: "reasoning",
          temperature: 0.6,
          schema: questionSchema,
          ...prompt,
        })
      ).question;
    } else {
      slotIndex = last.slotIndex + 1;
      const slot = plan[slotIndex] as PlanSlot;
      kind = slot.kind;
      parentQuestionId = null;
      const scores = interview.questions.flatMap((q) =>
        q.answer?.evaluation ? [q.answer.evaluation.score] : [],
      );
      text = await this.writeQuestion(
        userId,
        ctx,
        slot,
        slotIndex,
        difficultyAdjustment(scores),
        askedBefore,
      );
    }

    try {
      await this.prisma.interviewQuestion.create({
        data: {
          interviewId,
          orderIndex: last.orderIndex + 1,
          slotIndex,
          kind,
          parentQuestionId,
          text,
        },
      });
    } catch (err) {
      // Two requests raced to ask the next question: the other one won, which is fine.
      if (!isUniqueViolation(err)) throw err;
    }
  }

  private async ensureLastEvaluated(userId: string, interviewId: string) {
    const interview = await this.loadInternal(interviewId);
    const last = interview.questions.at(-1);
    const answer = last?.answer;
    if (!last || !answer) {
      // Nothing waiting for evaluation (e.g. completing while a question is unanswered).
      const evaluated = interview.questions.flatMap((q) =>
        q.answer?.evaluation ? [q.answer.evaluation] : [],
      );
      return evaluated.at(-1) as NonNullable<(typeof evaluated)[number]>;
    }
    if (answer.evaluation) return answer.evaluation;

    const result = await this.evaluation.evaluateAnswer({
      userId,
      topic: interview.topic,
      difficulty: interview.difficulty,
      question: last.text,
      answer: answer.text,
    });
    try {
      return await this.prisma.answerEvaluation.create({
        data: {
          answerId: answer.id,
          correctness: result.correctness,
          depth: result.depth,
          clarity: result.clarity,
          score: result.score,
          strengths: result.strengths,
          weaknesses: result.weaknesses,
          feedback: result.feedback,
          rubricVersion: result.rubricVersion,
        },
      });
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      return this.prisma.answerEvaluation.findUniqueOrThrow({ where: { answerId: answer.id } });
    }
  }

  private async finalize(userId: string, interviewId: string): Promise<void> {
    const interview = await this.loadInternal(interviewId);
    const evaluated = interview.questions.flatMap((q) =>
      q.answer?.evaluation
        ? [
            {
              question: q.text,
              correctness: q.answer.evaluation.correctness,
              depth: q.answer.evaluation.depth,
              clarity: q.answer.evaluation.clarity,
              score: q.answer.evaluation.score,
              strengths: strings(q.answer.evaluation.strengths),
              weaknesses: strings(q.answer.evaluation.weaknesses),
            },
          ]
        : [],
    );
    if (evaluated.length === 0) {
      throw AppError.conflict("Answer at least one question before finishing", "NO_ANSWERS");
    }

    const report = await this.evaluation.buildReport({
      userId,
      topic: interview.topic,
      difficulty: interview.difficulty,
      evaluated,
    });

    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.interviewReport.findUnique({ where: { interviewId } });
      if (!existing) await tx.interviewReport.create({ data: { interviewId, ...report } });
      await tx.interview.update({
        where: { id: interviewId },
        data: {
          status: "COMPLETED",
          endedAt: new Date(),
          overallScore: existing?.overallScore ?? report.overallScore,
        },
      });
    });

    try {
      const score = Math.round(report.overallScore);
      await this.prisma.notification.upsert({
        where: { userId_dedupeKey: { userId, dedupeKey: `interview-${interviewId}` } },
        create: {
          userId,
          type: "INTERVIEW_COMPLETED",
          title: "Mock Interview Completed",
          message: `Your interview on "${interview.topic}" is complete. Score: ${score}/100 with an improvement plan ready.`,
          link: `/interviews/${interviewId}`,
          dedupeKey: `interview-${interviewId}`,
        },
        update: {},
      });
    } catch {
      // Notification is best-effort and never breaks interview completion
    }
  }

  private writeQuestion(
    userId: string,
    ctx: { topic: string; difficulty: CreateInterviewInput["difficulty"] },
    slot: PlanSlot,
    slotIndex: number,
    adjustment: DifficultyAdjustment,
    askedBefore: string[],
  ): Promise<string> {
    return this.ai
      .generateStructured({
        userId,
        feature: "QUESTION",
        tier: "reasoning",
        temperature: 0.7,
        schema: questionSchema,
        ...buildQuestionPrompt({ ...ctx, slot, slotIndex, adjustment, askedBefore }),
      })
      .then((r) => r.question);
  }

  // ---------------------------------------------------------------- helpers

  /** Loads an interview the user OWNS. Someone else's id looks exactly like a missing one (404). */
  private async loadOwned(userId: string, id: string): Promise<InterviewRow> {
    if (!uuid.safeParse(id).success) throw AppError.notFound("Interview not found");
    let row = await this.prisma.interview.findFirst({
      where: { id, userId },
      include: detailInclude,
    });
    if (!row) throw AppError.notFound("Interview not found");
    if (row.status === "IN_PROGRESS" && isExpired(row)) {
      // The time limit passed: stop accepting answers. They can still finish to get a report.
      row = await this.prisma.interview.update({
        where: { id },
        data: { status: "EXPIRED" },
        include: detailInclude,
      });
    }
    return row;
  }

  private loadInternal(id: string): Promise<InterviewRow> {
    return this.prisma.interview.findUniqueOrThrow({ where: { id }, include: detailInclude });
  }

  private assertActive(row: InterviewRow): void {
    if (row.status === "EXPIRED") {
      throw AppError.conflict("The time limit for this interview has passed", "INTERVIEW_EXPIRED");
    }
    if (row.status !== "IN_PROGRESS") {
      throw AppError.conflict("This interview is no longer active", "INTERVIEW_NOT_ACTIVE");
    }
  }

  private async expireStale(userId: string): Promise<void> {
    const open = await this.prisma.interview.findMany({
      where: { userId, status: "IN_PROGRESS" },
      select: { id: true, startedAt: true, durationMinutes: true },
    });
    const stale = open.filter((i) => isExpired(i)).map((i) => i.id);
    if (stale.length > 0) {
      await this.prisma.interview.updateMany({
        where: { id: { in: stale } },
        data: { status: "EXPIRED" },
      });
    }
  }

  private async assertNoActive(userId: string): Promise<void> {
    const active = await this.prisma.interview.findFirst({
      where: { userId, status: "IN_PROGRESS" },
      select: { id: true },
    });
    if (active) this.throwActive(active.id);
  }

  private throwActive(interviewId: string): never {
    throw new AppError(
      409,
      "INTERVIEW_ALREADY_ACTIVE",
      "You already have an interview in progress",
      {
        interviewId,
      },
    );
  }
}
