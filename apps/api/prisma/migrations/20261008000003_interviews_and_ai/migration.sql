-- CreateEnum
CREATE TYPE "InterviewType" AS ENUM ('TOPIC', 'RESUME', 'MIXED');

-- CreateEnum
CREATE TYPE "InterviewStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'ABANDONED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "QuestionKind" AS ENUM ('CONCEPTUAL', 'CODING', 'BEHAVIORAL', 'FOLLOW_UP');

-- CreateEnum
CREATE TYPE "AiFeature" AS ENUM ('INTERVIEW_PLAN', 'QUESTION', 'FOLLOW_UP', 'EVALUATION', 'REPORT', 'CODE_REVIEW', 'RESUME_PARSE', 'RECOMMENDATION');

-- CreateEnum
CREATE TYPE "AiCallStatus" AS ENUM ('SUCCESS', 'INVALID_OUTPUT', 'TIMEOUT', 'ERROR');

-- CreateTable
CREATE TABLE "Interview" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" "InterviewType" NOT NULL DEFAULT 'TOPIC',
    "topic" TEXT NOT NULL,
    "difficulty" "Difficulty" NOT NULL,
    "status" "InterviewStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "plan" JSONB NOT NULL,
    "plannedQuestionCount" INTEGER NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "overallScore" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Interview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterviewQuestion" (
    "id" UUID NOT NULL,
    "interviewId" UUID NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "slotIndex" INTEGER NOT NULL,
    "kind" "QuestionKind" NOT NULL,
    "parentQuestionId" UUID,
    "text" TEXT NOT NULL,
    "askedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InterviewQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterviewAnswer" (
    "id" UUID NOT NULL,
    "questionId" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "timeTakenSec" INTEGER,
    "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InterviewAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnswerEvaluation" (
    "id" UUID NOT NULL,
    "answerId" UUID NOT NULL,
    "correctness" INTEGER NOT NULL,
    "depth" INTEGER NOT NULL,
    "clarity" INTEGER NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "strengths" JSONB NOT NULL,
    "weaknesses" JSONB NOT NULL,
    "feedback" TEXT NOT NULL,
    "rubricVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnswerEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterviewReport" (
    "id" UUID NOT NULL,
    "interviewId" UUID NOT NULL,
    "overallScore" DOUBLE PRECISION NOT NULL,
    "correctnessScore" DOUBLE PRECISION NOT NULL,
    "depthScore" DOUBLE PRECISION NOT NULL,
    "clarityScore" DOUBLE PRECISION NOT NULL,
    "band" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "strengths" JSONB NOT NULL,
    "weaknesses" JSONB NOT NULL,
    "recommendations" JSONB NOT NULL,
    "aiNarrative" BOOLEAN NOT NULL DEFAULT true,
    "rubricVersion" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InterviewReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiCall" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "feature" "AiFeature" NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "latencyMs" INTEGER NOT NULL,
    "status" "AiCallStatus" NOT NULL,
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiCall_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Interview_userId_createdAt_idx" ON "Interview"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Interview_userId_status_idx" ON "Interview"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "InterviewQuestion_interviewId_orderIndex_key" ON "InterviewQuestion"("interviewId", "orderIndex");

-- CreateIndex
CREATE UNIQUE INDEX "InterviewAnswer_questionId_key" ON "InterviewAnswer"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "AnswerEvaluation_answerId_key" ON "AnswerEvaluation"("answerId");

-- CreateIndex
CREATE UNIQUE INDEX "InterviewReport_interviewId_key" ON "InterviewReport"("interviewId");

-- CreateIndex
CREATE INDEX "AiCall_userId_createdAt_idx" ON "AiCall"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AiCall_feature_createdAt_idx" ON "AiCall"("feature", "createdAt");

-- AddForeignKey
ALTER TABLE "Interview" ADD CONSTRAINT "Interview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewQuestion" ADD CONSTRAINT "InterviewQuestion_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "Interview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewQuestion" ADD CONSTRAINT "InterviewQuestion_parentQuestionId_fkey" FOREIGN KEY ("parentQuestionId") REFERENCES "InterviewQuestion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewAnswer" ADD CONSTRAINT "InterviewAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "InterviewQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnswerEvaluation" ADD CONSTRAINT "AnswerEvaluation_answerId_fkey" FOREIGN KEY ("answerId") REFERENCES "InterviewAnswer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewReport" ADD CONSTRAINT "InterviewReport_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "Interview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiCall" ADD CONSTRAINT "AiCall_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Extra safety nets that Prisma does not model (database-level constraints).
ALTER TABLE "Interview" ADD CONSTRAINT "Interview_counts_check" CHECK ("plannedQuestionCount" BETWEEN 1 AND 20 AND "durationMinutes" BETWEEN 5 AND 180);
ALTER TABLE "InterviewQuestion" ADD CONSTRAINT "InterviewQuestion_index_check" CHECK ("orderIndex" >= 0 AND "slotIndex" >= 0);
ALTER TABLE "AnswerEvaluation" ADD CONSTRAINT "AnswerEvaluation_range_check" CHECK ("correctness" BETWEEN 0 AND 10 AND "depth" BETWEEN 0 AND 10 AND "clarity" BETWEEN 0 AND 10 AND "score" BETWEEN 0 AND 100);
ALTER TABLE "InterviewReport" ADD CONSTRAINT "InterviewReport_range_check" CHECK ("overallScore" BETWEEN 0 AND 100 AND "correctnessScore" BETWEEN 0 AND 100 AND "depthScore" BETWEEN 0 AND 100 AND "clarityScore" BETWEEN 0 AND 100);
