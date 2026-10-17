-- CreateTable
CREATE TABLE "CodeReview" (
    "id" UUID NOT NULL,
    "submissionId" UUID NOT NULL,
    "summary" TEXT NOT NULL,
    "correctnessRating" INTEGER NOT NULL,
    "readabilityRating" INTEGER NOT NULL,
    "maintainabilityRating" INTEGER NOT NULL,
    "overallScore" DOUBLE PRECISION NOT NULL,
    "timeComplexity" TEXT NOT NULL,
    "spaceComplexity" TEXT NOT NULL,
    "complexityNote" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "verdictAtReview" "Verdict" NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CodeReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CodeReview_submissionId_key" ON "CodeReview"("submissionId");

-- AddForeignKey
ALTER TABLE "CodeReview" ADD CONSTRAINT "CodeReview_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Extra safety nets that Prisma does not model (database-level constraints).
ALTER TABLE "CodeReview" ADD CONSTRAINT "CodeReview_range_check" CHECK ("correctnessRating" BETWEEN 0 AND 10 AND "readabilityRating" BETWEEN 0 AND 10 AND "maintainabilityRating" BETWEEN 0 AND 10 AND "overallScore" BETWEEN 0 AND 100);
