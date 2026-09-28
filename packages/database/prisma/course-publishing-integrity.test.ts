import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { after, before, describe, test } from "node:test";
import { config as loadEnv } from "dotenv";
import { Client } from "pg";

loadEnv({ path: fileURLToPath(new URL("../../../.env", import.meta.url)), quiet: true });
loadEnv({ path: fileURLToPath(new URL("../.env", import.meta.url)), quiet: true });

const databaseUrl = process.env.DATABASE_URL;
assert.ok(databaseUrl, "运行课程发布数据库行为测试前必须配置 DATABASE_URL");

const runId = `course-integrity-${randomUUID()}`;
const fixture = {
  userId: `${runId}-user`,
  userEmail: `${runId}@example.com`,
  coverId: `${runId}-cover`,
  courseAId: `${runId}-course-a`,
  courseBId: `${runId}-course-b`,
  revisionAId: `${runId}-revision-a`,
  revisionBId: `${runId}-revision-b`,
  videoAId: `${runId}-video-a`,
  videoBId: `${runId}-video-b`,
  publicationId: `${runId}-publication`,
  itemId: `${runId}-item`
};

function createClient(): Client {
  return new Client({ connectionString: databaseUrl });
}

async function expectCheckViolation(
  client: Client,
  statement: string,
  values: unknown[],
  expectedConstraint: string
): Promise<void> {
  await client.query("BEGIN");
  try {
    await assert.rejects(client.query(statement, values), (error: unknown) => {
      const databaseError = error as { code?: string; constraint?: string };
      assert.equal(databaseError.code, "23514");
      assert.equal(databaseError.constraint, expectedConstraint);
      return true;
    });
  } finally {
    await client.query("ROLLBACK");
  }
}

async function cleanupFixture(client: Client): Promise<void> {
  await client.query(`DELETE FROM "course_review_requests" WHERE "submittedByUserId" = $1`, [fixture.userId]);
  await client.query(`DELETE FROM "courses" WHERE "userId" = $1`, [fixture.userId]);
  await client.query(`DELETE FROM "course_revisions" WHERE "id" IN ($1, $2)`, [fixture.revisionAId, fixture.revisionBId]);
  await client.query(`DELETE FROM "course_material_publications" WHERE "id" = $1`, [fixture.publicationId]);
  await client.query(`DELETE FROM "video_guide_lessons" WHERE "userId" = $1`, [fixture.userId]);
  await client.query(`DELETE FROM "media_assets" WHERE "id" = $1`, [fixture.coverId]);
  await client.query(`DELETE FROM "users" WHERE "id" = $1`, [fixture.userId]);
}

async function setupFixture(client: Client): Promise<void> {
  await client.query(
    `INSERT INTO "users" ("id", "email", "passwordHash", "nickname", "updatedAt")
     VALUES ($1, $2, 'hash', '完整性测试用户', now())`,
    [fixture.userId, fixture.userEmail]
  );
  await client.query(
    `INSERT INTO "media_assets" ("id", "filename", "originalName", "mimeType", "size", "url")
     VALUES ($1, 'cover.png', 'cover.png', 'image/png', 1, '/course-integrity-cover.png')`,
    [fixture.coverId]
  );
  await client.query(
    `INSERT INTO "courses" ("id", "userId", "updatedAt")
     VALUES ($1, $3, now()), ($2, $3, now())`,
    [fixture.courseAId, fixture.courseBId, fixture.userId]
  );
  await client.query(
    `INSERT INTO "course_revisions" ("id", "courseId", "coverMediaId", "name", "summary", "updatedAt")
     VALUES
       ($1, $3, $5, '版本 A', 'A', now()),
       ($2, $4, $5, '版本 B', 'B', now())`,
    [fixture.revisionAId, fixture.revisionBId, fixture.courseAId, fixture.courseBId, fixture.coverId]
  );
  await client.query(
    `INSERT INTO "video_guide_lessons" (
       "id", "userId", "title", "mediaName", "mediaType", "mediaSizeBytes",
       "shareToken", "content", "updatedAt"
     ) VALUES
       ($1, $3, '视频 A', 'a.mp4', 'VIDEO', 1, $4, '{}'::jsonb, now()),
       ($2, $3, '视频 B', 'b.mp4', 'VIDEO', 1, $5, '{}'::jsonb, now())`,
    [fixture.videoAId, fixture.videoBId, fixture.userId, `${runId}-video-a-token`, `${runId}-video-b-token`]
  );
  await client.query(
    `INSERT INTO "course_material_publications" (
       "id", "materialType", "videoGuideLessonId", "currentHash", "currentSnapshot", "updatedAt"
     ) VALUES ($1, 'VIDEO_GUIDE', $2, 'hash-a', '{}'::jsonb, now())`,
    [fixture.publicationId, fixture.videoAId]
  );
  await client.query(
    `INSERT INTO "course_revision_items" (
       "id", "revisionId", "publicationId", "materialType", "videoGuideLessonId", "displayName", "updatedAt"
     ) VALUES ($1, $2, $3, 'VIDEO_GUIDE', $4, '合法课件', now())`,
    [fixture.itemId, fixture.revisionAId, fixture.publicationId, fixture.videoAId]
  );
  await client.query(`UPDATE "courses" SET "approvedRevisionId" = $1 WHERE "id" = $2`, [
    fixture.revisionAId,
    fixture.courseAId
  ]);
}

async function withRollback(client: Client, action: () => Promise<void>): Promise<void> {
  await client.query("BEGIN");
  try {
    await action();
  } finally {
    await client.query("ROLLBACK");
  }
}

async function expectConcurrentUpdateToFinish(
  firstStatement: string,
  firstValues: unknown[],
  secondStatement: string,
  secondValues: unknown[]
): Promise<void> {
  const firstClient = createClient();
  const secondClient = createClient();
  await Promise.all([firstClient.connect(), secondClient.connect()]);

  try {
    await Promise.all([firstClient.query("BEGIN"), secondClient.query("BEGIN")]);
    await secondClient.query("SET LOCAL lock_timeout = '750ms'");
    await firstClient.query(firstStatement, firstValues);
    await secondClient.query(secondStatement, secondValues);
  } finally {
    await Promise.allSettled([firstClient.query("ROLLBACK"), secondClient.query("ROLLBACK")]);
    await Promise.allSettled([firstClient.end(), secondClient.end()]);
  }
}

async function runConcurrentStatements(
  firstStatement: string,
  firstValues: unknown[],
  secondStatement: string,
  secondValues: unknown[]
): Promise<PromiseSettledResult<unknown>[]> {
  const firstClient = createClient();
  const secondClient = createClient();
  await Promise.all([firstClient.connect(), secondClient.connect()]);

  try {
    return await Promise.allSettled([
      firstClient.query(firstStatement, firstValues),
      secondClient.query(secondStatement, secondValues)
    ]);
  } finally {
    await Promise.allSettled([firstClient.end(), secondClient.end()]);
  }
}

function assertOneConcurrentIdentityWriteSucceeded(results: PromiseSettledResult<unknown>[]): void {
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  const rejected = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
  assert.ok(rejected);
  assert.equal((rejected.reason as { code?: string }).code, "23514");
}

describe("课程发布 PostgreSQL 完整性约束", { concurrency: false }, () => {
  const client = createClient();

  before(async () => {
    await client.connect();
    await cleanupFixture(client);
    await setupFixture(client);
  });

  after(async () => {
    await cleanupFixture(client);
    await client.end();
  });

  test("立即拒绝 scope 与目标字段不一致的审核请求", async () => {
    await expectCheckViolation(
      client,
      `INSERT INTO "course_review_requests" (
         "id", "scope", "submittedByUserId", "afterSnapshot", "diff", "updatedAt"
       ) VALUES ($1, 'COURSE_REVISION', $2, '{}'::jsonb, '{}'::jsonb, now())`,
      [`${runId}-review-invalid-target`, fixture.userId],
      "course_review_requests_scope_targets_check"
    );
  });

  test("立即拒绝跨课程版本指针和审核请求", async () => {
    await expectCheckViolation(
      client,
      `UPDATE "courses" SET "approvedRevisionId" = $1 WHERE "id" = $2`,
      [fixture.revisionBId, fixture.courseAId],
      "courses_approved_revision_ownership_check"
    );
    await expectCheckViolation(
      client,
      `INSERT INTO "course_review_requests" (
         "id", "scope", "courseId", "courseRevisionId", "submittedByUserId",
         "afterSnapshot", "diff", "updatedAt"
       ) VALUES ($1, 'COURSE_REVISION', $2, $3, $4, '{}'::jsonb, '{}'::jsonb, now())`,
      [`${runId}-review-cross-course`, fixture.courseAId, fixture.revisionBId, fixture.userId],
      "course_review_requests_revision_course_check"
    );
  });

  test("课程加入关系按用户隔离、拒绝重复并随用户级联删除", async () => {
    await withRollback(client, async () => {
      const secondUserId = `${runId}-enrollment-user`;
      await client.query(
        `INSERT INTO "users" ("id", "email", "passwordHash", "nickname", "updatedAt")
         VALUES ($1, $2, 'hash', '加入课程测试用户', now())`,
        [secondUserId, `${secondUserId}@example.com`]
      );
      await client.query(
        `INSERT INTO "course_enrollments" ("id", "userId", "courseId")
         VALUES ($1, $2, $4), ($3, $5, $4)`,
        [
          `${runId}-enrollment-a`, fixture.userId,
          `${runId}-enrollment-b`, fixture.courseAId,
          secondUserId
        ]
      );

      await client.query("SAVEPOINT duplicate_enrollment");
      try {
        await assert.rejects(
          client.query(
            `INSERT INTO "course_enrollments" ("id", "userId", "courseId") VALUES ($1, $2, $3)`,
            [`${runId}-enrollment-duplicate`, fixture.userId, fixture.courseAId]
          ),
          (error: unknown) => (error as { code?: string }).code === "23505"
        );
      } finally {
        await client.query("ROLLBACK TO SAVEPOINT duplicate_enrollment");
      }

      await client.query(`DELETE FROM "users" WHERE "id" = $1`, [secondUserId]);
      const remaining = await client.query<{ userId: string }>(
        `SELECT "userId" FROM "course_enrollments" WHERE "courseId" = $1`,
        [fixture.courseAId]
      );
      assert.deepEqual(remaining.rows, [{ userId: fixture.userId }]);
    });
  });

  test("立即拒绝课件项和公开记录两侧的类型或来源不一致", async () => {
    await expectCheckViolation(
      client,
      `INSERT INTO "course_revision_items" (
         "id", "revisionId", "publicationId", "materialType", "videoGuideLessonId", "displayName", "updatedAt"
       ) VALUES ($1, $2, $3, 'VIDEO_GUIDE', $4, '错配课件', now())`,
      [`${runId}-item-mismatch`, fixture.revisionBId, fixture.publicationId, fixture.videoBId],
      "course_revision_items_publication_match_check"
    );
    await expectCheckViolation(
      client,
      `UPDATE "course_revision_items" SET "videoGuideLessonId" = $1 WHERE "id" = $2`,
      [fixture.videoBId, fixture.itemId],
      "course_revision_items_publication_match_check"
    );
    await expectCheckViolation(
      client,
      `UPDATE "course_material_publications" SET "videoGuideLessonId" = $1 WHERE "id" = $2`,
      [fixture.videoBId, fixture.publicationId],
      "course_material_publications_item_match_check"
    );
    await expectCheckViolation(
      client,
      `INSERT INTO "course_material_publications" (
         "id", "materialType", "videoGuideLessonId", "currentHash", "currentSnapshot", "updatedAt"
       ) VALUES ($1, 'ENGLISH_GUIDED_STUDY', $2, 'bad', '{}'::jsonb, now())`,
      [`${runId}-publication-bad-type`, fixture.videoBId],
      "course_material_publications_material_type_source_check"
    );
  });

  test("合法主键更新与级联删除保持关系一致", async () => {
    await withRollback(client, async () => {
      const updatedCourseId = `${fixture.courseAId}-updated`;
      const updatedVideoId = `${fixture.videoAId}-updated`;
      const reviewId = `${runId}-review-valid`;

      await client.query(
        `INSERT INTO "course_review_requests" (
           "id", "scope", "courseId", "courseRevisionId", "submittedByUserId",
           "afterSnapshot", "diff", "updatedAt"
         ) VALUES ($1, 'COURSE_REVISION', $2, $3, $4, '{}'::jsonb, '{}'::jsonb, now())`,
        [reviewId, fixture.courseAId, fixture.revisionAId, fixture.userId]
      );
      await client.query(`UPDATE "courses" SET "id" = $1 WHERE "id" = $2`, [updatedCourseId, fixture.courseAId]);
      await client.query(`UPDATE "video_guide_lessons" SET "id" = $1 WHERE "id" = $2`, [
        updatedVideoId,
        fixture.videoAId
      ]);

      const revision = await client.query<{ courseId: string }>(
        `SELECT "courseId" FROM "course_revisions" WHERE "id" = $1`,
        [fixture.revisionAId]
      );
      const review = await client.query<{ courseId: string }>(
        `SELECT "courseId" FROM "course_review_requests" WHERE "id" = $1`,
        [reviewId]
      );
      const publication = await client.query<{ videoGuideLessonId: string }>(
        `SELECT "videoGuideLessonId" FROM "course_material_publications" WHERE "id" = $1`,
        [fixture.publicationId]
      );
      const item = await client.query<{ videoGuideLessonId: string }>(
        `SELECT "videoGuideLessonId" FROM "course_revision_items" WHERE "id" = $1`,
        [fixture.itemId]
      );

      assert.equal(revision.rows[0]?.courseId, updatedCourseId);
      assert.equal(review.rows[0]?.courseId, updatedCourseId);
      assert.equal(publication.rows[0]?.videoGuideLessonId, updatedVideoId);
      assert.equal(item.rows[0]?.videoGuideLessonId, updatedVideoId);

      await client.query(`DELETE FROM "courses" WHERE "id" = $1`, [updatedCourseId]);
      const remaining = await client.query<{ revisions: string; reviews: string; items: string }>(
        `SELECT
           (SELECT count(*) FROM "course_revisions" WHERE "id" = $1)::text AS revisions,
           (SELECT count(*) FROM "course_review_requests" WHERE "id" = $2)::text AS reviews,
           (SELECT count(*) FROM "course_revision_items" WHERE "id" = $3)::text AS items`,
        [fixture.revisionAId, reviewId, fixture.itemId]
      );
      assert.deepEqual(remaining.rows[0], { revisions: "0", reviews: "0", items: "0" });
    });
  });

  test("身份触发器不可延迟且非法身份写入在语句内失败", async () => {
    const triggerNames = [
      "course_review_requests_targets_check",
      "courses_revision_ownership_check",
      "course_revisions_ownership_check",
      "course_revision_items_publication_match_check",
      "course_material_publications_item_match_check"
    ];
    const triggers = await client.query<{ tgname: string; tgdeferrable: boolean }>(
      `SELECT tgname, tgdeferrable
       FROM pg_trigger
       WHERE tgname = ANY($1::text[])
       ORDER BY tgname`,
      [triggerNames]
    );

    assert.equal(triggers.rowCount, triggerNames.length);
    for (const trigger of triggers.rows) {
      assert.equal(trigger.tgdeferrable, false, `${trigger.tgname} 不得可延迟`);
    }

    await expectCheckViolation(
      client,
      `UPDATE "courses" SET "workingRevisionId" = $1 WHERE "id" = $2`,
      [fixture.revisionBId, fixture.courseAId],
      "courses_working_revision_ownership_check"
    );
  });

  test("课程和版本普通字段并发更新不获取关系锁", async () => {
    await expectConcurrentUpdateToFinish(
      `UPDATE "courses" SET "reviewState" = 'PENDING_REVIEW' WHERE "id" = $1`,
      [fixture.courseAId],
      `UPDATE "course_revisions" SET "status" = 'PENDING' WHERE "id" = $1`,
      [fixture.revisionAId]
    );
  });

  test("公开记录和课件项普通字段并发更新不获取关系锁", async () => {
    await expectConcurrentUpdateToFinish(
      `UPDATE "course_material_publications" SET "currentHash" = 'hash-b' WHERE "id" = $1`,
      [fixture.publicationId],
      `UPDATE "course_revision_items" SET "displayName" = '新名称' WHERE "id" = $1`,
      [fixture.itemId]
    );
  });

  test("并发课程指针和版本归属变更不能绕过一致性", async () => {
    await client.query(`UPDATE "courses" SET "approvedRevisionId" = NULL WHERE "id" = $1`, [fixture.courseAId]);

    try {
      const results = await runConcurrentStatements(
        `UPDATE "courses" SET "approvedRevisionId" = $1 WHERE "id" = $2`,
        [fixture.revisionAId, fixture.courseAId],
        `UPDATE "course_revisions" SET "courseId" = $1 WHERE "id" = $2`,
        [fixture.courseBId, fixture.revisionAId]
      );
      assertOneConcurrentIdentityWriteSucceeded(results);

      const relation = await client.query<{ courseId: string; approvedRevisionId: string | null }>(
        `SELECT revision."courseId", course_record."approvedRevisionId"
         FROM "course_revisions" AS revision
         JOIN "courses" AS course_record ON course_record."id" = $1
         WHERE revision."id" = $2`,
        [fixture.courseAId, fixture.revisionAId]
      );
      const row = relation.rows[0];
      assert.ok(row);
      assert.ok(row.approvedRevisionId === null || row.courseId === fixture.courseAId);
    } finally {
      await client.query(`UPDATE "courses" SET "approvedRevisionId" = NULL WHERE "id" = $1`, [fixture.courseAId]);
      await client.query(`UPDATE "course_revisions" SET "courseId" = $1 WHERE "id" = $2`, [
        fixture.courseAId,
        fixture.revisionAId
      ]);
      await client.query(`UPDATE "courses" SET "approvedRevisionId" = $1 WHERE "id" = $2`, [
        fixture.revisionAId,
        fixture.courseAId
      ]);
    }
  });

  test("并发课件项插入和公开来源变更不能绕过一致性", async () => {
    await client.query(`DELETE FROM "course_revision_items" WHERE "id" = $1`, [fixture.itemId]);

    try {
      const results = await runConcurrentStatements(
        `INSERT INTO "course_revision_items" (
           "id", "revisionId", "publicationId", "materialType", "videoGuideLessonId", "displayName", "updatedAt"
         ) VALUES ($1, $2, $3, 'VIDEO_GUIDE', $4, '并发课件', now())`,
        [fixture.itemId, fixture.revisionAId, fixture.publicationId, fixture.videoAId],
        `UPDATE "course_material_publications" SET "videoGuideLessonId" = $1 WHERE "id" = $2`,
        [fixture.videoBId, fixture.publicationId]
      );
      assertOneConcurrentIdentityWriteSucceeded(results);

      const mismatch = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count
         FROM "course_revision_items" AS revision_item
         JOIN "course_material_publications" AS publication
           ON publication."id" = revision_item."publicationId"
         WHERE revision_item."id" = $1
           AND (
             revision_item."materialType" IS DISTINCT FROM publication."materialType"
             OR revision_item."videoGuideLessonId" IS DISTINCT FROM publication."videoGuideLessonId"
             OR revision_item."englishGuidedStudyMaterialId" IS DISTINCT FROM publication."englishGuidedStudyMaterialId"
             OR revision_item."learningFlashcardDeckId" IS DISTINCT FROM publication."learningFlashcardDeckId"
           )`,
        [fixture.itemId]
      );
      assert.equal(mismatch.rows[0]?.count, "0");
    } finally {
      await client.query(`DELETE FROM "course_revision_items" WHERE "id" = $1`, [fixture.itemId]);
      await client.query(`UPDATE "course_material_publications" SET "videoGuideLessonId" = $1 WHERE "id" = $2`, [
        fixture.videoAId,
        fixture.publicationId
      ]);
      await client.query(
        `INSERT INTO "course_revision_items" (
           "id", "revisionId", "publicationId", "materialType", "videoGuideLessonId", "displayName", "updatedAt"
         ) VALUES ($1, $2, $3, 'VIDEO_GUIDE', $4, '合法课件', now())`,
        [fixture.itemId, fixture.revisionAId, fixture.publicationId, fixture.videoAId]
      );
    }
  });

  test("素材源主键级联与课件项插入并发时不死锁且保持一致", async () => {
    const updatedVideoId = `${fixture.videoAId}-concurrent-updated`;
    await client.query(`DELETE FROM "course_revision_items" WHERE "id" = $1`, [fixture.itemId]);

    try {
      const results = await runConcurrentStatements(
        `UPDATE "video_guide_lessons" SET "id" = $1 WHERE "id" = $2`,
        [updatedVideoId, fixture.videoAId],
        `INSERT INTO "course_revision_items" (
           "id", "revisionId", "publicationId", "materialType", "videoGuideLessonId", "displayName", "updatedAt"
         ) VALUES ($1, $2, $3, 'VIDEO_GUIDE', $4, '级联并发课件', now())`,
        [fixture.itemId, fixture.revisionAId, fixture.publicationId, fixture.videoAId]
      );

      assert.equal(results[0]?.status, "fulfilled", "素材源主键更新必须完成");
      const insertResult = results[1];
      assert.ok(insertResult);
      if (insertResult.status === "rejected") {
        assert.ok(
          ["23503", "23514"].includes((insertResult.reason as { code?: string }).code ?? ""),
          "并发插入只能因旧身份已失效而被拒绝"
        );
      }

      const relation = await client.query<{
        publicationSourceId: string;
        itemSourceId: string | null;
      }>(
        `SELECT
           publication."videoGuideLessonId" AS "publicationSourceId",
           revision_item."videoGuideLessonId" AS "itemSourceId"
         FROM "course_material_publications" AS publication
         LEFT JOIN "course_revision_items" AS revision_item
           ON revision_item."id" = $1
         WHERE publication."id" = $2`,
        [fixture.itemId, fixture.publicationId]
      );
      assert.equal(relation.rows[0]?.publicationSourceId, updatedVideoId);
      assert.ok(
        relation.rows[0]?.itemSourceId === null || relation.rows[0]?.itemSourceId === updatedVideoId,
        "已插入课件项必须跟随素材源主键级联"
      );
    } finally {
      await client.query(`DELETE FROM "course_revision_items" WHERE "id" = $1`, [fixture.itemId]);
      await client.query(`UPDATE "video_guide_lessons" SET "id" = $1 WHERE "id" = $2`, [
        fixture.videoAId,
        updatedVideoId
      ]);
      await client.query(
        `INSERT INTO "course_revision_items" (
           "id", "revisionId", "publicationId", "materialType", "videoGuideLessonId", "displayName", "updatedAt"
         ) VALUES ($1, $2, $3, 'VIDEO_GUIDE', $4, '合法课件', now())`,
        [fixture.itemId, fixture.revisionAId, fixture.publicationId, fixture.videoAId]
      );
    }
  });
});
