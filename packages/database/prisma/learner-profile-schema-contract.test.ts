import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { config as loadEnv } from "dotenv";
import { Client } from "pg";

loadEnv({ path: fileURLToPath(new URL("../../../.env", import.meta.url)), quiet: true });

const schema = readFileSync(new URL("./schema.prisma", import.meta.url), "utf8");
const migration = readFileSync(
  new URL("./migrations/20260813160000_learner_profiles_and_context/migration.sql", import.meta.url),
  "utf8"
);

test("学习者学段固定为十四项并合并大学和工作", () => {
  const block = schema.match(/enum LearnerGrade \{([\s\S]*?)\}/)?.[1] ?? "";
  const values = block.split("\n").map((line) => line.trim()).filter(Boolean);
  assert.deepEqual(values, [
    "PRESCHOOL", "GRADE_1", "GRADE_2", "GRADE_3", "GRADE_4", "GRADE_5",
    "GRADE_6", "GRADE_7", "GRADE_8", "GRADE_9", "HIGH_1", "HIGH_2",
    "HIGH_3", "UNIVERSITY_OR_WORK"
  ]);
});

test("学习者授权使用严格去重关系且业务主记录可保存学习者归属", () => {
  assert.match(schema, /model LearnerScenarioAuthorization \{[\s\S]*@@id\(\[learnerId, scenarioId\]\)/);
  assert.match(schema, /model LearnerCourseAuthorization \{[\s\S]*@@id\(\[learnerId, courseId\]\)/);
  for (const model of ["AiTask", "AudioTask", "VideoGuideLesson", "EnglishGuidedStudyMaterial", "LearningFlashcardDeck", "LearningFlashcardReview", "CopybookRecord"]) {
    assert.match(schema, new RegExp(`model ${model} \\{[\\s\\S]*learnerId\\s+String\\?`));
  }
  assert.match(migration, /FUNCTION enforce_learner_user_ownership\(\)/);
  assert.match(migration, /learner_user_ownership_check/);
});

const databaseUrl = process.env.DATABASE_URL;
assert.ok(databaseUrl, "运行学习者归属并发测试前必须配置 DATABASE_URL");

type AttributionKind = "business" | "profile";

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

async function setSearchPath(client: Client, schemaName: string): Promise<void> {
  await client.query(`SET search_path TO ${quoteIdentifier(schemaName)}`);
}

function createClient(): Client {
  return new Client({ connectionString: databaseUrl });
}

async function createMigratedFixture(): Promise<{
  schemaName: string;
  admin: Client;
  userAId: string;
  userBId: string;
  learnerId: string;
}> {
  const suffix = randomUUID().replaceAll("-", "");
  const schemaName = `learner_concurrency_${suffix}`;
  const userAId = `${suffix}-user-a`;
  const userBId = `${suffix}-user-b`;
  const learnerId = `${suffix}-learner`;
  const admin = createClient();
  await admin.connect();

  try {
    await admin.query(`CREATE SCHEMA ${quoteIdentifier(schemaName)}`);
    await setSearchPath(admin, schemaName);
    await admin.query(`CREATE TYPE "RefreshTokenType" AS ENUM ('USER', 'ADMIN')`);
    await admin.query(`CREATE TABLE "users" ("id" TEXT PRIMARY KEY, "email" TEXT NOT NULL)`);
    await admin.query(`CREATE TABLE "refresh_tokens" (
      "id" TEXT PRIMARY KEY,
      "userId" TEXT,
      "adminUserId" TEXT,
      "tokenHash" TEXT NOT NULL,
      "type" "RefreshTokenType" NOT NULL,
      "expiresAt" TIMESTAMP(3) NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "revokedAt" TIMESTAMP(3)
    )`);
    await admin.query(`CREATE TABLE "ai_scenarios" ("id" TEXT PRIMARY KEY)`);
    await admin.query(`CREATE TABLE "courses" ("id" TEXT PRIMARY KEY)`);
    for (const tableName of [
      "ai_tasks",
      "audio_tasks",
      "video_guide_lessons",
      "english_guided_study_materials",
      "learning_flashcard_decks",
      "learning_flashcard_reviews",
      "copybook_records"
    ]) {
      await admin.query(`CREATE TABLE ${quoteIdentifier(tableName)} (
        "id" TEXT PRIMARY KEY,
        "userId" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`);
    }
    await admin.query(migration);
    await admin.query(
      `INSERT INTO "users" ("id", "email") VALUES ($1, $2), ($3, $4)`,
      [userAId, `${suffix}-a@example.com`, userBId, `${suffix}-b@example.com`]
    );
    await admin.query(
      `INSERT INTO "learners" ("id", "userId", "nickname", "grade", "updatedAt")
       VALUES ($1, $2, '并发测试学习者', 'GRADE_1', now())`,
      [learnerId, userAId]
    );
    return { schemaName, admin, userAId, userBId, learnerId };
  } catch (error) {
    await admin.query(`DROP SCHEMA IF EXISTS ${quoteIdentifier(schemaName)} CASCADE`);
    await admin.end();
    throw error;
  }
}

async function destroyMigratedFixture(schemaName: string, admin: Client): Promise<void> {
  try {
    await admin.query(`DROP SCHEMA IF EXISTS ${quoteIdentifier(schemaName)} CASCADE`);
  } finally {
    await admin.end();
  }
}

async function assertAttributionPreventsConcurrentLearnerReassignment(kind: AttributionKind): Promise<void> {
  const fixture = await createMigratedFixture();
  const attributionClient = createClient();
  const reassignmentClient = createClient();
  let attributionTransactionOpen = false;
  let reassignmentTransactionOpen = false;

  try {
    await Promise.all([attributionClient.connect(), reassignmentClient.connect()]);
    await Promise.all([
      setSearchPath(attributionClient, fixture.schemaName),
      setSearchPath(reassignmentClient, fixture.schemaName)
    ]);
    await attributionClient.query("BEGIN");
    attributionTransactionOpen = true;

    if (kind === "business") {
      await attributionClient.query(
        `INSERT INTO "ai_tasks" ("id", "userId", "learnerId") VALUES ($1, $2, $3)`,
        [`${fixture.learnerId}-task`, fixture.userAId, fixture.learnerId]
      );
    } else {
      await attributionClient.query(
        `INSERT INTO "refresh_tokens" (
          "id", "userId", "tokenHash", "type", "expiresAt", "profileMode", "profileLearnerId"
        ) VALUES ($1, $2, 'hash', 'USER', now() + interval '1 hour', 'LEARNER', $3)`,
        [`${fixture.learnerId}-token`, fixture.userAId, fixture.learnerId]
      );
    }

    await reassignmentClient.query("BEGIN");
    reassignmentTransactionOpen = true;
    await reassignmentClient.query("SET LOCAL lock_timeout = '250ms'");

    let reassignmentError: { code?: string } | undefined;
    try {
      await reassignmentClient.query(`UPDATE "learners" SET "userId" = $1 WHERE "id" = $2`, [
        fixture.userBId,
        fixture.learnerId
      ]);
    } catch (error) {
      reassignmentError = error as { code?: string };
    }

    if (reassignmentError) {
      assert.equal(reassignmentError.code, "55P03");
      return;
    }

    await reassignmentClient.query("COMMIT");
    reassignmentTransactionOpen = false;
    await attributionClient.query("COMMIT");
    attributionTransactionOpen = false;

    const mismatchQuery = kind === "business"
      ? `SELECT count(*)::text AS count
         FROM "ai_tasks" AS record
         JOIN "learners" AS learner ON learner."id" = record."learnerId"
         WHERE record."userId" IS DISTINCT FROM learner."userId"`
      : `SELECT count(*)::text AS count
         FROM "refresh_tokens" AS session
         JOIN "learners" AS learner ON learner."id" = session."profileLearnerId"
         WHERE session."userId" IS DISTINCT FROM learner."userId"`;
    const mismatch = await fixture.admin.query<{ count: string }>(mismatchQuery);
    assert.equal(
      mismatch.rows[0]?.count,
      "0",
      "FOR KEY SHARE 会允许学习者改属与归属记录同时提交，破坏同一用户不变量"
    );
  } finally {
    if (reassignmentTransactionOpen) {
      await reassignmentClient.query("ROLLBACK");
    }
    if (attributionTransactionOpen) {
      await attributionClient.query("ROLLBACK");
    }
    await Promise.allSettled([attributionClient.end(), reassignmentClient.end()]);
    await destroyMigratedFixture(fixture.schemaName, fixture.admin);
  }
}

test("FOR KEY SHARE 会允许学习者改属与业务归属同时提交，生产变更必须改为 FOR NO KEY UPDATE", async () => {
  await assertAttributionPreventsConcurrentLearnerReassignment("business");
});

test("FOR KEY SHARE 会允许学习者改属与刷新会话 profile 同时提交，生产变更必须改为 FOR NO KEY UPDATE", async () => {
  await assertAttributionPreventsConcurrentLearnerReassignment("profile");
});
