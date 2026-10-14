-- CreateEnum
CREATE TYPE "Difficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD');

-- CreateEnum
CREATE TYPE "ProblemStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "Language" AS ENUM ('C', 'CPP', 'JAVA', 'PYTHON', 'JAVASCRIPT');

-- CreateTable
CREATE TABLE "StudentProfile" (
    "userId" UUID NOT NULL,
    "targetRole" TEXT,
    "experienceLevel" TEXT,
    "preferredLanguage" "Language",
    "goals" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentProfile_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "Topic" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,

    CONSTRAINT "Topic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Problem" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "inputFormat" TEXT NOT NULL DEFAULT '',
    "outputFormat" TEXT NOT NULL DEFAULT '',
    "constraints" TEXT NOT NULL DEFAULT '',
    "difficulty" "Difficulty" NOT NULL,
    "timeLimitMs" INTEGER NOT NULL DEFAULT 2000,
    "memoryLimitKb" INTEGER NOT NULL DEFAULT 256000,
    "status" "ProblemStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Problem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProblemTopic" (
    "problemId" UUID NOT NULL,
    "topicId" UUID NOT NULL,

    CONSTRAINT "ProblemTopic_pkey" PRIMARY KEY ("problemId","topicId")
);

-- CreateTable
CREATE TABLE "ProblemStarterCode" (
    "id" UUID NOT NULL,
    "problemId" UUID NOT NULL,
    "language" "Language" NOT NULL,
    "code" TEXT NOT NULL,

    CONSTRAINT "ProblemStarterCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TestCase" (
    "id" UUID NOT NULL,
    "problemId" UUID NOT NULL,
    "input" TEXT NOT NULL,
    "expectedOutput" TEXT NOT NULL,
    "isSample" BOOLEAN NOT NULL DEFAULT false,
    "weight" INTEGER NOT NULL DEFAULT 1,
    "orderIndex" INTEGER NOT NULL,
    "explanation" TEXT,

    CONSTRAINT "TestCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LanguageConfig" (
    "language" "Language" NOT NULL,
    "judge0LanguageId" INTEGER NOT NULL,
    "displayName" TEXT NOT NULL,
    "monacoId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "LanguageConfig_pkey" PRIMARY KEY ("language")
);

-- CreateIndex
CREATE UNIQUE INDEX "Topic_name_key" ON "Topic"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Topic_slug_key" ON "Topic"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Problem_slug_key" ON "Problem"("slug");

-- CreateIndex
CREATE INDEX "Problem_status_difficulty_idx" ON "Problem"("status", "difficulty");

-- CreateIndex
CREATE INDEX "ProblemTopic_topicId_idx" ON "ProblemTopic"("topicId");

-- CreateIndex
CREATE UNIQUE INDEX "ProblemStarterCode_problemId_language_key" ON "ProblemStarterCode"("problemId", "language");

-- CreateIndex
CREATE INDEX "TestCase_problemId_orderIndex_idx" ON "TestCase"("problemId", "orderIndex");

-- AddForeignKey
ALTER TABLE "StudentProfile" ADD CONSTRAINT "StudentProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Problem" ADD CONSTRAINT "Problem_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProblemTopic" ADD CONSTRAINT "ProblemTopic_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProblemTopic" ADD CONSTRAINT "ProblemTopic_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProblemStarterCode" ADD CONSTRAINT "ProblemStarterCode_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestCase" ADD CONSTRAINT "TestCase_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Extra safety nets that Prisma does not model (database-level constraints).
ALTER TABLE "Problem" ADD CONSTRAINT "Problem_limits_check" CHECK ("timeLimitMs" > 0 AND "memoryLimitKb" > 0);
ALTER TABLE "Problem" ADD CONSTRAINT "Problem_slug_format_check" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
ALTER TABLE "TestCase" ADD CONSTRAINT "TestCase_weight_check" CHECK ("weight" > 0 AND "orderIndex" >= 0);
