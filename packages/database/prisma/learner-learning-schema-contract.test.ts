import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const schemaUrl = new URL("./schema.prisma", import.meta.url);
const migrationUrl = new URL(
  "./migrations/20260819110000_learner_learning_analytics/migration.sql",
  import.meta.url
);

test("学习分析 schema 包含五层数据模型和关键唯一键", async () => {
  const schema = await readFile(schemaUrl, "utf8");

  assert.match(schema, /model LearnerLearningSession \{/u);
  assert.match(schema, /model LearnerLearningTimeSlice \{/u);
  assert.match(schema, /model LearnerMaterialProgress \{/u);
  assert.match(schema, /model LearnerMaterialPartProgress \{/u);
  assert.match(schema, /model LearnerDailyLearningSummary \{/u);
  assert.match(schema, /@@unique\(\[learnerId, bucketStartedAt\]\)/u);
  assert.match(schema, /@@unique\(\[learnerId, materialType, materialId, contentVersion\]/u);
  assert.match(
    schema,
    /@@unique\(\[learnerId, summaryDate, scopeType, scopeKey\]/u
  );
});

test("学习分析迁移只做增量变更", async () => {
  const sql = await readFile(migrationUrl, "utf8");

  assert.doesNotMatch(sql, /DROP TABLE|DROP TYPE|TRUNCATE|DELETE FROM/iu);
  assert.match(sql, /CREATE TABLE "learner_learning_sessions"/u);
  assert.match(sql, /CREATE TABLE "learner_learning_time_slices"/u);
});
