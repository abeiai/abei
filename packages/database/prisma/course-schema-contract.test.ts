import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

const schema = readFileSync(new URL("./schema.prisma", import.meta.url), "utf8");
const migrationsRoot = new URL("./migrations/", import.meta.url);
const enrollmentMigration = readFileSync(
  new URL("./migrations/20260720110000_user_course_enrollments/migration.sql", import.meta.url),
  "utf8"
);
const migrations = readdirSync(migrationsRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .sort((left, right) => left.name.localeCompare(right.name))
  .map((entry) => readFileSync(new URL(`${entry.name}/migration.sql`, migrationsRoot), "utf8"))
  .join("\n");

test("课程发布 schema 包含版本、课件公开状态和统一审核模型", () => {
  for (const model of ["Course", "CourseRevision", "CourseRevisionItem", "CourseMaterialPublication", "CourseReviewRequest"]) {
    assert.match(schema, new RegExp(`model ${model} \\{`));
  }
  assert.match(schema, /enum CourseReviewScope[\s\S]*COURSE_REVISION[\s\S]*MATERIAL_CHANGE/);
  assert.match(schema, /createdByUserId\s+String\?/);
});

test("资源审核记录持久化 AI 预审进度、结果和触发方式", () => {
  assert.match(schema, /enum CourseAiPrecheckStatus[\s\S]*NOT_STARTED[\s\S]*RUNNING[\s\S]*PASSED[\s\S]*REJECTED[\s\S]*FAILED/);
  assert.match(schema, /enum CourseAiPrecheckTrigger[\s\S]*MANUAL[\s\S]*AUTOMATIC/);
  assert.match(schema, /aiPrecheckStatus\s+CourseAiPrecheckStatus\s+@default\(NOT_STARTED\)/);
  assert.match(schema, /aiPrecheckProgress\s+Int\s+@default\(0\)/);
  assert.match(schema, /aiPrecheckResult\s+Json\?/);
  assert.match(schema, /aiPrecheckTrigger\s+CourseAiPrecheckTrigger\?/);
  assert.match(migrations, /ADD COLUMN "aiPrecheckStatus" "CourseAiPrecheckStatus" NOT NULL DEFAULT 'NOT_STARTED'/);
  assert.match(migrations, /ADD COLUMN "aiPrecheckProgress" INTEGER NOT NULL DEFAULT 0/);
});

test("用户课程库使用独立加入关系并禁止重复加入", () => {
  assert.match(schema, /model CourseEnrollment \{/);
  assert.match(schema, /enrolledCourses\s+CourseEnrollment\[\]/);
  assert.match(schema, /enrollments\s+CourseEnrollment\[\]/);
  assert.match(migrations, /CREATE TABLE "course_enrollments"/);
  assert.match(migrations, /CREATE UNIQUE INDEX "course_enrollments_userId_courseId_key"/);
  assert.match(migrations, /FOREIGN KEY \("userId"\) REFERENCES "users"\("id"\) ON DELETE CASCADE/);
  assert.match(migrations, /FOREIGN KEY \("courseId"\) REFERENCES "courses"\("id"\) ON DELETE CASCADE/);
  assert.match(enrollmentMigration, /^BEGIN;/u);
  assert.match(enrollmentMigration, /COMMIT;\s*$/u);
});

test("课程发布迁移保留课件单一来源和待审唯一约束", () => {
  assert.match(migrations, /CONSTRAINT "course_revision_items_one_source_check" CHECK/);
  assert.match(migrations, /CONSTRAINT "course_material_publications_one_source_check" CHECK/);
  assert.match(migrations, /CREATE UNIQUE INDEX "course_review_requests_pending_revision_key"/);
  assert.match(migrations, /CREATE UNIQUE INDEX "course_review_requests_pending_material_key"/);
  assert.match(migrations, /WHERE "status" = 'PENDING' AND "scope" = 'COURSE_REVISION'/);
  assert.match(migrations, /WHERE "status" = 'PENDING' AND "scope" = 'MATERIAL_CHANGE'/);
});

test("审核请求范围和目标字段具有一致性约束", () => {
  assert.match(migrations, /CONSTRAINT "course_review_requests_scope_targets_check" CHECK/);
  assert.match(migrations, /"scope" = 'COURSE_REVISION'[\s\S]*"courseId" IS NOT NULL[\s\S]*"courseRevisionId" IS NOT NULL[\s\S]*"materialPublicationId" IS NULL/);
  assert.match(migrations, /"scope" = 'MATERIAL_CHANGE'[\s\S]*"courseId" IS NULL[\s\S]*"courseRevisionId" IS NULL[\s\S]*"materialPublicationId" IS NOT NULL/);
  assert.match(migrations, /FUNCTION enforce_course_review_request_targets\(\)/);
  assert.match(migrations, /TRIGGER "course_review_requests_targets_check"/);
});

test("课程当前版本指针具有双向课程归属约束", () => {
  assert.match(migrations, /FUNCTION enforce_course_revision_ownership_on_course\(\)/);
  assert.match(migrations, /TRIGGER "courses_revision_ownership_check"/);
  assert.match(migrations, /FUNCTION enforce_course_revision_ownership_on_revision\(\)/);
  assert.match(migrations, /TRIGGER "course_revisions_ownership_check"/);
});

test("课程课件项与公开记录具有双向一致性约束", () => {
  assert.match(migrations, /CONSTRAINT "course_revision_items_material_type_source_check" CHECK/);
  assert.match(migrations, /CONSTRAINT "course_material_publications_material_type_source_check" CHECK/);
  assert.match(migrations, /FUNCTION enforce_course_revision_item_publication_match\(\)/);
  assert.match(migrations, /TRIGGER "course_revision_items_publication_match_check"/);
  assert.match(migrations, /FUNCTION enforce_course_material_publication_item_match\(\)/);
  assert.match(migrations, /TRIGGER "course_material_publications_item_match_check"/);
});

test("身份一致性触发器仅监听相关字段并在行锁前使用统一 advisory lock", () => {
  assert.match(migrations, /FUNCTION lock_course_revision_integrity_keys\(keys text\[\]\)/);
  assert.match(migrations, /FUNCTION lock_course_material_publication_integrity_keys\(keys text\[\]\)/);
  assert.match(migrations, /DROP TRIGGER "courses_revision_ownership_check" ON "courses"/);
  assert.match(migrations, /CREATE TRIGGER "courses_revision_ownership_check"[\s\S]*BEFORE INSERT OR UPDATE OF "id", "approvedRevisionId", "workingRevisionId"/);
  assert.match(migrations, /CREATE TRIGGER "course_revisions_ownership_check"[\s\S]*BEFORE UPDATE OF "id", "courseId"/);
  assert.match(migrations, /CREATE TRIGGER "course_revision_items_publication_match_check"[\s\S]*BEFORE INSERT OR UPDATE OF "publicationId", "materialType"/);
  assert.match(migrations, /CREATE TRIGGER "course_material_publications_item_match_check"[\s\S]*BEFORE UPDATE OF "id", "materialType"/);
  assert.match(migrations, /FUNCTION lock_course_revision_integrity_statement\(\)/);
  assert.match(migrations, /CREATE TRIGGER "courses_revision_ownership_statement_lock"[\s\S]*BEFORE INSERT OR UPDATE OF "id", "approvedRevisionId", "workingRevisionId"[\s\S]*FOR EACH STATEMENT/);
  assert.match(migrations, /FUNCTION lock_course_material_publication_integrity_statement\(\)/);
  assert.match(migrations, /CREATE TRIGGER "course_revision_items_publication_statement_lock"[\s\S]*BEFORE INSERT OR UPDATE OF "publicationId", "materialType"[\s\S]*FOR EACH STATEMENT/);
  assert.match(migrations, /CREATE TRIGGER "video_guide_lessons_course_publication_statement_lock"[\s\S]*BEFORE UPDATE OF "id"[\s\S]*FOR EACH STATEMENT/);
  assert.match(migrations, /CREATE TRIGGER "english_guided_study_materials_course_publication_statement_lock"[\s\S]*BEFORE UPDATE OF "id"[\s\S]*FOR EACH STATEMENT/);
  assert.match(migrations, /CREATE TRIGGER "learning_flashcard_decks_course_publication_statement_lock"[\s\S]*BEFORE UPDATE OF "id"[\s\S]*FOR EACH STATEMENT/);
  assert.match(migrations, /CREATE TRIGGER "courses_revision_ownership_delete_statement_lock"[\s\S]*BEFORE DELETE[\s\S]*FOR EACH STATEMENT/);
  assert.match(migrations, /CREATE TRIGGER "course_material_publications_item_delete_statement_lock"[\s\S]*BEFORE DELETE[\s\S]*FOR EACH STATEMENT/);
});
