import type {
  Language,
  LanguageDto,
  Paginated,
  ProblemDetail,
  ProblemListQuery,
  ProblemSummary,
  TopicDto,
} from "@codementor/shared";
import { AppError } from "../../lib/errors.js";
import type { PrismaClient } from "../../lib/prisma.js";

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const summarySelect = {
  id: true,
  slug: true,
  title: true,
  difficulty: true,
  topics: { select: { topic: { select: { name: true, slug: true } } } },
} as const;

type SummaryRow = {
  id: string;
  slug: string;
  title: string;
  difficulty: ProblemSummary["difficulty"];
  topics: { topic: TopicDto }[];
};

const toSummary = (row: SummaryRow): ProblemSummary => ({
  id: row.id,
  slug: row.slug,
  title: row.title,
  difficulty: row.difficulty,
  topics: row.topics.map((t) => t.topic).sort((a, b) => a.name.localeCompare(b.name)),
});

export class ProblemService {
  /**
   * `availability` (optional) says which languages the code executor can really run right now,
   * or null if unknown. Languages it cannot run are not offered in the editor.
   */
  constructor(
    private readonly prisma: PrismaClient,
    private readonly availability?: () => Promise<Language[] | null>,
  ) {}

  async list(query: ProblemListQuery): Promise<Paginated<ProblemSummary>> {
    const where = {
      status: "PUBLISHED" as const,
      ...(query.difficulty ? { difficulty: query.difficulty } : {}),
      ...(query.topic ? { topics: { some: { topic: { slug: query.topic } } } } : {}),
      ...(query.q ? { title: { contains: query.q, mode: "insensitive" as const } } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.problem.count({ where }),
      this.prisma.problem.findMany({
        where,
        select: summarySelect,
        orderBy: [{ difficulty: "asc" }, { title: "asc" }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);
    return {
      data: rows.map(toSummary),
      meta: { page: query.page, limit: query.limit, total },
    };
  }

  async getBySlug(slug: string): Promise<ProblemDetail> {
    if (!SLUG.test(slug)) throw AppError.notFound("Problem not found");
    const problem = await this.prisma.problem.findFirst({
      where: { slug, status: "PUBLISHED" },
      select: {
        ...summarySelect,
        description: true,
        inputFormat: true,
        outputFormat: true,
        constraints: true,
        timeLimitMs: true,
        memoryLimitKb: true,
        starterCode: { select: { language: true, code: true } },
        // ONLY sample test cases are ever selected here: hidden ones never leave the database
        // through this endpoint.
        testCases: {
          where: { isSample: true },
          orderBy: { orderIndex: "asc" },
          select: { input: true, expectedOutput: true, explanation: true },
        },
      },
    });
    if (!problem) throw AppError.notFound("Problem not found");

    return {
      ...toSummary(problem),
      description: problem.description,
      inputFormat: problem.inputFormat,
      outputFormat: problem.outputFormat,
      constraints: problem.constraints,
      timeLimitMs: problem.timeLimitMs,
      memoryLimitKb: problem.memoryLimitKb,
      samples: problem.testCases,
      starterCode: Object.fromEntries(
        problem.starterCode.map((s) => [s.language, s.code]),
      ) as Partial<Record<Language, string>>,
    };
  }

  async topics(): Promise<TopicDto[]> {
    return this.prisma.topic.findMany({
      select: { name: true, slug: true },
      orderBy: { name: "asc" },
    });
  }

  /** Judge0's internal language ids are deliberately NOT exposed. */
  async languages(): Promise<LanguageDto[]> {
    const rows = await this.prisma.languageConfig.findMany({
      where: { enabled: true },
      select: { language: true, displayName: true, monacoId: true },
      orderBy: { displayName: "asc" },
    });
    const runnable = (await this.availability?.()) ?? null;
    return runnable ? rows.filter((r) => runnable.includes(r.language)) : rows;
  }
}
