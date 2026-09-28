CREATE INDEX "learner_learning_time_slices_scenarioId_bucketStartedAt_idx"
ON "learner_learning_time_slices"("scenarioId", "bucketStartedAt");

CREATE INDEX "learner_daily_learning_summaries_scenarioId_summaryDate_idx"
ON "learner_daily_learning_summaries"("scenarioId", "summaryDate");
