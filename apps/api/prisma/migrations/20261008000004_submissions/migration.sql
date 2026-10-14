-- CreateEnum
CREATE TYPE "SubmissionMode" AS ENUM ('RUN', 'SUBMIT');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "Verdict" AS ENUM ('ACCEPTED', 'WRONG_ANSWER', 'TIME_LIMIT', 'MEMORY_LIMIT', 'RUNTIME_ERROR', 'COMPILE_ERROR', 'INTERNAL_ERROR');

-- CreateTable
CREATE TABLE "Submission" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "problemId" UUID NOT NULL,
    "language" "Language" NOT NULL,
    "sourceCode" TEXT NOT NULL,
    "mode" "SubmissionMode" NOT NULL,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'QUEUED',
    "verdict" "Verdict",
    "passedCount" INTEGER NOT NULL DEFAULT 0,
    "totalCount" INTEGER NOT NULL DEFAULT 0,
    "maxTimeMs" INTEGER,
    "maxMemoryKb" INTEGER,
    "compileOutput" TEXT,
    "executor" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Submission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubmissionResult" (
    "id" UUID NOT NULL,
    "submissionId" UUID NOT NULL,
    "testCaseId" UUID NOT NULL,
    "verdict" "Verdict" NOT NULL,
    "stdout" TEXT,
    "stderr" TEXT,
    "timeMs" INTEGER,
    "memoryKb" INTEGER,
    "passed" BOOLEAN NOT NULL,

    CONSTRAINT "SubmissionResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Submission_userId_problemId_createdAt_idx" ON "Submission"("userId", "problemId", "createdAt");

-- CreateIndex
CREATE INDEX "Submission_status_idx" ON "Submission"("status");

-- CreateIndex
CREATE INDEX "SubmissionResult_submissionId_idx" ON "SubmissionResult"("submissionId");

-- CreateIndex
CREATE INDEX "SubmissionResult_testCaseId_idx" ON "SubmissionResult"("testCaseId");

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmissionResult" ADD CONSTRAINT "SubmissionResult_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmissionResult" ADD CONSTRAINT "SubmissionResult_testCaseId_fkey" FOREIGN KEY ("testCaseId") REFERENCES "TestCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Extra safety nets that Prisma does not model (database-level constraints).
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_counts_check" CHECK ("passedCount" >= 0 AND "totalCount" >= 0 AND "passedCount" <= "totalCount");
