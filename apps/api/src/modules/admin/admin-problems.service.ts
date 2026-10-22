import type {
  AdminCreateProblemInput,
  AdminProblemDetail,
  AdminProblemListQuery,
  AdminProblemListResponse,
  AdminProblemSummary,
  AdminTestCaseDto,
  AdminTestCaseInput,
  AdminUpdateProblemInput,
  Language,
  TopicDto,
} from "@codementor/shared";
import type { PrismaClient } from "../../lib/prisma.js";
import { AppError } from "../../lib/errors.js";

function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export class AdminProblemService {
  constructor(private readonly prisma: PrismaClient) {}

  // ── List problems with full admin filters ─────────────────────────────────

  async listProblems(query: AdminProblemListQuery): Promise<AdminProblemListResponse> {
    const { page, limit, search, difficulty, status, topic, sortBy, sortOrder } = query;

    const where: Record<string, unknown> = {};
    if (difficulty) where["difficulty"] = difficulty;
    if (status) where["status"] = status;
    if (topic) where["topics"] = { some: { topic: { slug: topic } } };
    if (search) {
      where["OR"] = [
        { title: { contains: search, mode: "insensitive" } },
        { slug: { contains: search, mode: "insensitive" } },
      ];
    }

    const [problems, total] = await Promise.all([
      this.prisma.problem.findMany({
        where,
        select: {
          id: true,
          slug: true,
          title: true,
          difficulty: true,
          status: true,
          timeLimitMs: true,
          memoryLimitKb: true,
          createdAt: true,
          updatedAt: true,
          topics: { select: { topic: { select: { name: true, slug: true } } } },
          _count: {
            select: {
              testCases: true,
              submissions: true,
            },
          },
          testCases: {
            where: { isSample: true },
            select: { id: true },
          },
        },
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.problem.count({ where }),
    ]);

    const data: AdminProblemSummary[] = problems.map((p) => ({
      id: p.id,
      slug: p.slug,
      title: p.title,
      difficulty: p.difficulty,
      status: p.status,
      timeLimitMs: p.timeLimitMs,
      memoryLimitKb: p.memoryLimitKb,
      topics: p.topics.map((t) => t.topic).sort((a, b) => a.name.localeCompare(b.name)),
      testCaseCount: p._count.testCases,
      sampleTestCaseCount: p.testCases.length,
      submissionCount: p._count.submissions,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    }));

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ── Get full problem details including hidden test cases ──────────────────

  async getProblem(id: string): Promise<AdminProblemDetail> {
    const p = await this.prisma.problem.findFirst({
      where: { OR: [{ id }, { slug: id }] },
      include: {
        topics: { select: { topic: { select: { name: true, slug: true } } } },
        starterCode: { select: { language: true, code: true } },
        testCases: {
          orderBy: { orderIndex: "asc" },
          select: {
            id: true,
            problemId: true,
            input: true,
            expectedOutput: true,
            isSample: true,
            weight: true,
            orderIndex: true,
            explanation: true,
          },
        },
      },
    });

    if (!p) throw AppError.notFound("Problem not found");

    const starterCode: Partial<Record<Language, string>> = {};
    for (const sc of p.starterCode) {
      starterCode[sc.language as Language] = sc.code;
    }

    return {
      id: p.id,
      slug: p.slug,
      title: p.title,
      description: p.description,
      inputFormat: p.inputFormat,
      outputFormat: p.outputFormat,
      constraints: p.constraints,
      difficulty: p.difficulty,
      timeLimitMs: p.timeLimitMs,
      memoryLimitKb: p.memoryLimitKb,
      status: p.status,
      version: p.version,
      topics: p.topics.map((t) => t.topic).sort((a, b) => a.name.localeCompare(b.name)),
      starterCode,
      testCases: p.testCases,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    };
  }

  // ── Create new problem ────────────────────────────────────────────────────

  async createProblem(
    input: AdminCreateProblemInput,
    createdById: string,
  ): Promise<AdminProblemDetail> {
    const slug = input.slug ? slugify(input.slug) : slugify(input.title);
    if (!slug) throw AppError.badRequest("Invalid problem title or slug");

    // Check slug collision
    const existing = await this.prisma.problem.findUnique({ where: { slug } });
    if (existing) {
      throw AppError.conflict(`A problem with slug "${slug}" already exists`);
    }

    // Resolve topics by slug (or create if not exist)
    const topicConnections: Array<{ topicId: string }> = [];
    if (input.topicSlugs && input.topicSlugs.length > 0) {
      for (const topicSlug of input.topicSlugs) {
        const cleanSlug = slugify(topicSlug);
        if (!cleanSlug) continue;
        const topic = await this.prisma.topic.upsert({
          where: { slug: cleanSlug },
          update: {},
          create: {
            slug: cleanSlug,
            name: topicSlug
              .split("-")
              .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
              .join(" "),
          },
        });
        topicConnections.push({ topicId: topic.id });
      }
    }

    // Create problem transaction
    const created = await this.prisma.$transaction(async (tx) => {
      const problem = await tx.problem.create({
        data: {
          title: input.title,
          slug,
          description: input.description,
          inputFormat: input.inputFormat ?? "",
          outputFormat: input.outputFormat ?? "",
          constraints: input.constraints ?? "",
          difficulty: input.difficulty,
          timeLimitMs: input.timeLimitMs ?? 2000,
          memoryLimitKb: input.memoryLimitKb ?? 256000,
          status: input.status ?? "DRAFT",
          createdById,
          topics: {
            create: topicConnections,
          },
        },
      });

      // Add starter code if provided
      if (input.starterCode) {
        const entries = Object.entries(input.starterCode) as [Language, string][];
        if (entries.length > 0) {
          await tx.problemStarterCode.createMany({
            data: entries.map(([language, code]) => ({
              problemId: problem.id,
              language,
              code,
            })),
          });
        }
      }

      // Add test cases if provided
      if (input.testCases && input.testCases.length > 0) {
        await tx.testCase.createMany({
          data: input.testCases.map((tc, idx) => ({
            problemId: problem.id,
            input: tc.input,
            expectedOutput: tc.expectedOutput,
            isSample: tc.isSample ?? false,
            weight: tc.weight ?? 1,
            orderIndex: tc.orderIndex ?? idx,
            explanation: tc.explanation ?? null,
          })),
        });
      }

      return problem;
    });

    return this.getProblem(created.id);
  }

  // ── Update problem ────────────────────────────────────────────────────────

  async updateProblem(id: string, input: AdminUpdateProblemInput): Promise<AdminProblemDetail> {
    const existing = await this.prisma.problem.findUnique({
      where: { id },
      include: { topics: true },
    });
    if (!existing) throw AppError.notFound("Problem not found");

    let newSlug = existing.slug;
    if (input.slug && input.slug !== existing.slug) {
      newSlug = slugify(input.slug);
      const conflict = await this.prisma.problem.findFirst({
        where: { slug: newSlug, id: { not: id } },
      });
      if (conflict) throw AppError.conflict(`A problem with slug "${newSlug}" already exists`);
    }

    await this.prisma.$transaction(async (tx) => {
      // Update core fields
      await tx.problem.update({
        where: { id },
        data: {
          ...(input.title ? { title: input.title } : {}),
          ...(input.slug ? { slug: newSlug } : {}),
          ...(input.description ? { description: input.description } : {}),
          ...(input.inputFormat !== undefined ? { inputFormat: input.inputFormat } : {}),
          ...(input.outputFormat !== undefined ? { outputFormat: input.outputFormat } : {}),
          ...(input.constraints !== undefined ? { constraints: input.constraints } : {}),
          ...(input.difficulty ? { difficulty: input.difficulty } : {}),
          ...(input.timeLimitMs ? { timeLimitMs: input.timeLimitMs } : {}),
          ...(input.memoryLimitKb ? { memoryLimitKb: input.memoryLimitKb } : {}),
          ...(input.status ? { status: input.status } : {}),
          version: { increment: 1 },
        },
      });

      // Update topics if explicitly provided
      if (input.topicSlugs !== undefined) {
        await tx.problemTopic.deleteMany({ where: { problemId: id } });
        for (const topicSlug of input.topicSlugs) {
          const cleanSlug = slugify(topicSlug);
          if (!cleanSlug) continue;
          const topic = await tx.topic.upsert({
            where: { slug: cleanSlug },
            update: {},
            create: {
              slug: cleanSlug,
              name: topicSlug
                .split("-")
                .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                .join(" "),
            },
          });
          await tx.problemTopic.create({
            data: { problemId: id, topicId: topic.id },
          });
        }
      }

      // Update starter code if provided
      if (input.starterCode !== undefined) {
        await tx.problemStarterCode.deleteMany({ where: { problemId: id } });
        const entries = Object.entries(input.starterCode) as [Language, string][];
        if (entries.length > 0) {
          await tx.problemStarterCode.createMany({
            data: entries.map(([language, code]) => ({
              problemId: id,
              language,
              code,
            })),
          });
        }
      }
    });

    return this.getProblem(id);
  }

  // ── Delete problem (or cascade delete if no submissions, else archive) ────

  async deleteProblem(id: string): Promise<{ success: boolean; message: string }> {
    const existing = await this.prisma.problem.findUnique({
      where: { id },
      include: { _count: { select: { submissions: true } } },
    });
    if (!existing) throw AppError.notFound("Problem not found");

    if (existing._count.submissions > 0) {
      // Problem has student submissions; archive it to preserve submission history integrity
      await this.prisma.problem.update({
        where: { id },
        data: { status: "ARCHIVED" },
      });
      return {
        success: true,
        message: "Problem has historical submissions and was safely archived.",
      };
    }

    await this.prisma.problem.delete({ where: { id } });
    return { success: true, message: "Problem deleted successfully." };
  }

  // ── Test Case Operations ──────────────────────────────────────────────────

  async addTestCase(problemId: string, input: AdminTestCaseInput): Promise<AdminTestCaseDto> {
    const problem = await this.prisma.problem.findUnique({ where: { id: problemId } });
    if (!problem) throw AppError.notFound("Problem not found");

    const created = await this.prisma.testCase.create({
      data: {
        problemId,
        input: input.input,
        expectedOutput: input.expectedOutput,
        isSample: input.isSample ?? false,
        weight: input.weight ?? 1,
        orderIndex: input.orderIndex ?? 0,
        explanation: input.explanation ?? null,
      },
    });

    return {
      id: created.id,
      problemId: created.problemId,
      input: created.input,
      expectedOutput: created.expectedOutput,
      isSample: created.isSample,
      weight: created.weight,
      orderIndex: created.orderIndex,
      explanation: created.explanation,
    };
  }

  async deleteTestCase(problemId: string, testCaseId: string): Promise<{ success: boolean }> {
    const tc = await this.prisma.testCase.findFirst({
      where: { id: testCaseId, problemId },
    });
    if (!tc) throw AppError.notFound("Test case not found");

    await this.prisma.testCase.delete({ where: { id: testCaseId } });
    return { success: true };
  }

  // ── List all topics ───────────────────────────────────────────────────────

  async listTopics(): Promise<TopicDto[]> {
    const topics = await this.prisma.topic.findMany({
      orderBy: { name: "asc" },
      select: { name: true, slug: true },
    });
    return topics;
  }
}
