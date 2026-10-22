-- CreateIndex
CREATE INDEX "Submission_userId_status_idx" ON "Submission"("userId", "status");

-- CreateIndex
CREATE INDEX "Submission_userId_mode_verdict_idx" ON "Submission"("userId", "mode", "verdict");

-- CreateIndex
CREATE INDEX "TestCase_problemId_isSample_idx" ON "TestCase"("problemId", "isSample");
