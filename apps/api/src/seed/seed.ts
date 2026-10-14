import bcrypt from "bcryptjs";
import { LANGUAGES, type Language } from "@codementor/shared";
import type { PrismaClient } from "../lib/prisma.js";
import { SEED_PROBLEMS, SEED_TOPICS } from "./problems.js";
import { STARTER_CODE } from "./starter-code.js";

// Judge0 CE language ids. These can differ between Judge0 versions: check GET /languages on your
// Judge0 server and update them here (or in the LanguageConfig table) if needed.
const LANGUAGE_CONFIG: Record<
  Language,
  { judge0LanguageId: number; displayName: string; monacoId: string }
> = {
  C: { judge0LanguageId: 50, displayName: "C (GCC)", monacoId: "c" },
  CPP: { judge0LanguageId: 54, displayName: "C++ (GCC)", monacoId: "cpp" },
  JAVA: { judge0LanguageId: 62, displayName: "Java", monacoId: "java" },
  PYTHON: { judge0LanguageId: 71, displayName: "Python 3", monacoId: "python" },
  JAVASCRIPT: { judge0LanguageId: 63, displayName: "JavaScript (Node.js)", monacoId: "javascript" },
};

export interface SeedOptions {
  adminEmail?: string | undefined;
  adminPassword?: string | undefined;
  bcryptCost?: number;
}

export interface SeedResult {
  languages: number;
  topics: number;
  problemsCreated: number;
  adminCreated: boolean;
}

/** Idempotent: safe to run many times. Existing problems are left alone (admins may have edited them). */
export async function seedDatabase(
  prisma: PrismaClient,
  options: SeedOptions = {},
): Promise<SeedResult> {
  for (const language of LANGUAGES) {
    await prisma.languageConfig.upsert({
      where: { language },
      update: {},
      create: { language, ...LANGUAGE_CONFIG[language] },
    });
  }

  for (const topic of SEED_TOPICS) {
    await prisma.topic.upsert({ where: { slug: topic.slug }, update: {}, create: topic });
  }
  const topics = await prisma.topic.findMany({ select: { id: true, slug: true } });
  const topicId = new Map(topics.map((t) => [t.slug, t.id]));

  let problemsCreated = 0;
  for (const problem of SEED_PROBLEMS) {
    const exists = await prisma.problem.findUnique({ where: { slug: problem.slug } });
    if (exists) continue;
    await prisma.problem.create({
      data: {
        slug: problem.slug,
        title: problem.title,
        difficulty: problem.difficulty,
        description: problem.description,
        inputFormat: problem.inputFormat,
        outputFormat: problem.outputFormat,
        constraints: problem.constraints,
        status: "PUBLISHED",
        topics: {
          create: problem.topics.map((slug) => ({
            topic: { connect: { id: topicId.get(slug) as string } },
          })),
        },
        starterCode: {
          create: LANGUAGES.map((language) => ({ language, code: STARTER_CODE[language] })),
        },
        testCases: {
          create: problem.cases.map((c, index) => ({
            input: c.input,
            expectedOutput: c.expected,
            isSample: c.sample ?? false,
            orderIndex: index,
            explanation: c.explanation ?? null,
          })),
        },
      },
    });
    problemsCreated++;
  }

  let adminCreated = false;
  if (options.adminEmail && options.adminPassword) {
    const email = options.adminEmail.trim().toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email } });
    if (!existing) {
      await prisma.user.create({
        data: {
          email,
          name: "Administrator",
          role: "ADMIN",
          passwordHash: await bcrypt.hash(options.adminPassword, options.bcryptCost ?? 12),
        },
      });
      adminCreated = true;
    }
  }

  return { languages: LANGUAGES.length, topics: SEED_TOPICS.length, problemsCreated, adminCreated };
}
