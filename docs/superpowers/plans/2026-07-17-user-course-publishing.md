# User Course Publishing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让登录用户把本人制作的视频导学、英文带读和学习闪卡组合成课程，经统一后台审核后匿名发布到 `/center` 与稳定的 `/c/{24位课程ID}`。

**Architecture:** 使用 `Course` 保存稳定身份，使用 `CourseRevision` 保存已审核版与工作版，使用 `CourseMaterialPublication` 独立跟踪原始课件公开审核状态，使用 `CourseReviewRequest` 将课程变更和课件变更汇入同一审核队列。公开课程始终读取最后审核通过的课程版本；课程复审锁定整份目录，单课件复审只锁定对应课件。

**Tech Stack:** pnpm Monorepo、Prisma 7/PostgreSQL、NestJS 11/TypeScript、Next.js 16 App Router、React 19、TailwindCSS 4、Node test runner

## Global Constraints

- 允许修改：`apps/web`、`apps/api-core`、`packages/database`、本计划文档。
- 禁止修改：`apps/ai-gateway`、支付、钱包、组织、多语言、复杂权限和无关业务模块。
- 所有新增页面、按钮、校验和错误提示必须使用简体中文。
- 所有 NestJS API 必须返回 `{ code, message, data }` 统一结构。
- 用户只能组合自己的课件；后端必须重新校验用户身份、课件归属和课件可学习状态。
- 管理员审核接口必须验证管理员身份并写入管理员操作日志。
- 课程 ID 必须是密码学安全随机生成的 24 位小写十六进制字符串，生成后永久稳定。
- 课程封面只允许 JPEG、PNG、WebP，最大 10MB，最终像素比例必须为 4:3。
- `/center`、`/c/{id}` 与已发布课程课件允许匿名访问。
- 首次审核前不公开；已发布课程复审时保留旧版和 URL，显示“审核中”并锁定整份目录。
- 已发布原始课件内容变化时，只锁定该课件；同一课件影响的所有课程共享一条课件审核请求。
- 课程变更与课件变更必须在 `/admin/course-reviews` 同一界面处理并展示结构化差异。
- 不引入新的图片处理依赖；使用受测试的 JPEG/PNG/WebP 文件头解析与浏览器 Canvas 中心裁切。
- 必须保留任务开始前已有的未提交修改，特别是 `public-shell.tsx`、闪卡控制台和 `apps/web/src/app/flashcard/`；不得覆盖、回退或纳入无关提交。
- 端口继续使用 Web `3321`、API `3322`、PostgreSQL `3324`、Redis `3325`。
- 严格执行测试先行：每个生产行为必须先有预期失败测试，再写最小实现。

---

### Task 1: 课程、版本、课件公开状态与统一审核数据模型

**Files:**
- Create: `packages/database/prisma/course-schema-contract.test.ts`
- Create: `packages/database/prisma/migrations/20260717180000_user_course_publishing/migration.sql`
- Modify: `packages/database/prisma/schema.prisma`
- Modify: `packages/database/src/index.ts`

**Interfaces:**
- Produces: Prisma models `Course`, `CourseRevision`, `CourseRevisionItem`, `CourseMaterialPublication`, `CourseReviewRequest`。
- Produces: enums `CourseReviewState`, `CourseRevisionStatus`, `CourseMaterialType`, `CourseMaterialPublicationStatus`, `CourseReviewScope`, `CourseReviewRequestStatus`。
- Produces: `MediaAsset.createdByUserId` 与用户、管理员、三类课件、审核管理员之间的关系字段。

- [ ] **Step 1: 写失败的 schema 合同测试**

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const schema = readFileSync(new URL("./schema.prisma", import.meta.url), "utf8");

test("课程发布 schema 包含版本、课件公开状态和统一审核模型", () => {
  for (const model of ["Course", "CourseRevision", "CourseRevisionItem", "CourseMaterialPublication", "CourseReviewRequest"]) {
    assert.match(schema, new RegExp(`model ${model} \\{`));
  }
  assert.match(schema, /enum CourseReviewScope[\s\S]*COURSE_REVISION[\s\S]*MATERIAL_CHANGE/);
  assert.match(schema, /createdByUserId\s+String\?/);
});
```

- [ ] **Step 2: 运行测试并确认因模型缺失而失败**

Run: `pnpm --filter @xueleai/database test`

Expected: FAIL，错误包含 `The input did not match the regular expression /model Course/`。

- [ ] **Step 3: 在 Prisma schema 中加入枚举和关系模型**

```prisma
enum CourseReviewState {
  DRAFT
  PENDING_REVIEW
  PUBLISHED
  REJECTED
}

enum CourseRevisionStatus {
  DRAFT
  PENDING
  APPROVED
  REJECTED
}

enum CourseMaterialType {
  VIDEO_GUIDE
  ENGLISH_GUIDED_STUDY
  LEARNING_FLASHCARD
}

enum CourseMaterialPublicationStatus {
  PENDING
  APPROVED
  REJECTED
}

enum CourseReviewScope {
  COURSE_REVISION
  MATERIAL_CHANGE
}

enum CourseReviewRequestStatus {
  PENDING
  APPROVED
  REJECTED
}

model Course {
  id                 String            @id
  userId             String
  approvedRevisionId String?           @unique
  workingRevisionId  String?           @unique
  reviewState        CourseReviewState @default(DRAFT)
  publishedAt        DateTime?
  createdAt          DateTime          @default(now())
  updatedAt          DateTime          @updatedAt
  user               User              @relation(fields: [userId], references: [id], onDelete: Cascade)
  approvedRevision   CourseRevision?   @relation("ApprovedCourseRevision", fields: [approvedRevisionId], references: [id], onDelete: SetNull)
  workingRevision    CourseRevision?   @relation("WorkingCourseRevision", fields: [workingRevisionId], references: [id], onDelete: SetNull)
  revisions          CourseRevision[]  @relation("CourseRevisions")
  reviewRequests     CourseReviewRequest[]

  @@index([userId, updatedAt])
  @@index([reviewState, publishedAt])
  @@map("courses")
}

model CourseRevision {
  id              String               @id @default(cuid())
  courseId        String
  coverMediaId    String
  name            String
  summary         String
  tags            String[]             @default([])
  status          CourseRevisionStatus @default(DRAFT)
  submittedAt     DateTime?
  reviewedAt      DateTime?
  rejectionReason String?
  createdAt       DateTime             @default(now())
  updatedAt       DateTime             @updatedAt
  course          Course               @relation("CourseRevisions", fields: [courseId], references: [id], onDelete: Cascade)
  coverMedia      MediaAsset            @relation(fields: [coverMediaId], references: [id], onDelete: Restrict)
  approvedFor     Course?               @relation("ApprovedCourseRevision")
  workingFor      Course?               @relation("WorkingCourseRevision")
  items           CourseRevisionItem[]
  reviewRequests  CourseReviewRequest[]

  @@index([courseId, createdAt])
  @@index([status, submittedAt])
  @@map("course_revisions")
}

model CourseRevisionItem {
  id                           String             @id @default(cuid())
  revisionId                   String
  publicationId                String
  materialType                 CourseMaterialType
  videoGuideLessonId           String?
  englishGuidedStudyMaterialId String?
  learningFlashcardDeckId      String?
  displayName                  String
  sortOrder                    Int                @default(0)
  createdAt                    DateTime           @default(now())
  updatedAt                    DateTime           @updatedAt
  revision                     CourseRevision     @relation(fields: [revisionId], references: [id], onDelete: Cascade)
  publication                  CourseMaterialPublication @relation(fields: [publicationId], references: [id], onDelete: Restrict)
  videoGuideLesson             VideoGuideLesson?          @relation(fields: [videoGuideLessonId], references: [id], onDelete: Restrict)
  englishGuidedStudyMaterial   EnglishGuidedStudyMaterial? @relation(fields: [englishGuidedStudyMaterialId], references: [id], onDelete: Restrict)
  learningFlashcardDeck        LearningFlashcardDeck?      @relation(fields: [learningFlashcardDeckId], references: [id], onDelete: Restrict)

  @@unique([revisionId, publicationId])
  @@index([revisionId, sortOrder])
  @@index([publicationId])
  @@map("course_revision_items")
}

model CourseMaterialPublication {
  id                           String                              @id @default(cuid())
  materialType                 CourseMaterialType
  videoGuideLessonId           String?                             @unique
  englishGuidedStudyMaterialId String?                             @unique
  learningFlashcardDeckId      String?                             @unique
  status                       CourseMaterialPublicationStatus     @default(PENDING)
  approvedHash                 String?
  currentHash                  String
  approvedSnapshot             Json?
  currentSnapshot              Json
  createdAt                    DateTime                            @default(now())
  updatedAt                    DateTime                            @updatedAt
  videoGuideLesson             VideoGuideLesson?                  @relation(fields: [videoGuideLessonId], references: [id], onDelete: Restrict)
  englishGuidedStudyMaterial   EnglishGuidedStudyMaterial?         @relation(fields: [englishGuidedStudyMaterialId], references: [id], onDelete: Restrict)
  learningFlashcardDeck        LearningFlashcardDeck?              @relation(fields: [learningFlashcardDeckId], references: [id], onDelete: Restrict)
  revisionItems                CourseRevisionItem[]
  reviewRequests               CourseReviewRequest[]

  @@index([status, updatedAt])
  @@map("course_material_publications")
}

model CourseReviewRequest {
  id                    String                    @id @default(cuid())
  scope                 CourseReviewScope
  status                CourseReviewRequestStatus @default(PENDING)
  courseId              String?
  courseRevisionId      String?
  materialPublicationId String?
  submittedByUserId     String
  reviewedByAdminId     String?
  beforeSnapshot        Json?
  afterSnapshot         Json
  diff                  Json
  reviewNote            String?
  submittedAt           DateTime                  @default(now())
  reviewedAt            DateTime?
  createdAt             DateTime                  @default(now())
  updatedAt             DateTime                  @updatedAt
  course                Course?                   @relation(fields: [courseId], references: [id], onDelete: Cascade)
  courseRevision        CourseRevision?           @relation(fields: [courseRevisionId], references: [id], onDelete: Cascade)
  materialPublication   CourseMaterialPublication? @relation(fields: [materialPublicationId], references: [id], onDelete: Cascade)
  submittedByUser       User                      @relation("SubmittedCourseReviews", fields: [submittedByUserId], references: [id], onDelete: Cascade)
  reviewedByAdmin       AdminUser?                @relation("ReviewedCourseReviews", fields: [reviewedByAdminId], references: [id], onDelete: SetNull)

  @@index([status, submittedAt])
  @@index([courseId, submittedAt])
  @@index([materialPublicationId, submittedAt])
  @@map("course_review_requests")
}
```

同时给 `User`、`AdminUser`、`MediaAsset`、`VideoGuideLesson`、`EnglishGuidedStudyMaterial`、`LearningFlashcardDeck` 增加上述反向关系；`MediaAsset` 增加 `createdByUserId String?`、`createdByUser User?` 和 `courseRevisionCovers CourseRevision[]`。

- [ ] **Step 4: 生成 migration 并补充数据库 CHECK/部分唯一索引**

Run: `pnpm db:migrate -- --name user_course_publishing`

在生成的 `migration.sql` 末尾加入：

```sql
ALTER TABLE "course_revision_items"
ADD CONSTRAINT "course_revision_items_one_source_check" CHECK (
  (("videoGuideLessonId" IS NOT NULL)::int +
   ("englishGuidedStudyMaterialId" IS NOT NULL)::int +
   ("learningFlashcardDeckId" IS NOT NULL)::int) = 1
);

ALTER TABLE "course_material_publications"
ADD CONSTRAINT "course_material_publications_one_source_check" CHECK (
  (("videoGuideLessonId" IS NOT NULL)::int +
   ("englishGuidedStudyMaterialId" IS NOT NULL)::int +
   ("learningFlashcardDeckId" IS NOT NULL)::int) = 1
);

CREATE UNIQUE INDEX "course_review_requests_pending_revision_key"
ON "course_review_requests"("courseRevisionId")
WHERE "status" = 'PENDING' AND "scope" = 'COURSE_REVISION';

CREATE UNIQUE INDEX "course_review_requests_pending_material_key"
ON "course_review_requests"("materialPublicationId")
WHERE "status" = 'PENDING' AND "scope" = 'MATERIAL_CHANGE';
```

- [ ] **Step 5: 导出新增 Prisma 类型并重新生成客户端**

在 `packages/database/src/index.ts` 导出六个新增枚举类型，然后运行：

Run: `pnpm db:generate && pnpm --filter @xueleai/database build`

Expected: Prisma Client 生成成功，database TypeScript build exit 0。

- [ ] **Step 6: 重新运行 schema 合同测试**

Run: `pnpm --filter @xueleai/database test`

Expected: PASS。

- [ ] **Step 7: 提交数据模型**

```bash
git add packages/database/prisma/schema.prisma packages/database/prisma/course-schema-contract.test.ts packages/database/prisma/migrations/20260717180000_user_course_publishing/migration.sql packages/database/src/index.ts packages/database/generated
git commit -m "feat(database): add course publishing models"
```

---

### Task 2: 课程 ID、内容快照、差异与封面校验基础函数

**Files:**
- Create: `apps/api-core/src/courses/course-domain.ts`
- Create: `apps/api-core/src/courses/course-cover.ts`
- Create: `apps/api-core/tests/course-domain.test.ts`
- Create: `apps/api-core/tests/course-cover.test.ts`

**Interfaces:**
- Produces: `createCourseId(): string`、`isCourseId(value: string): boolean`。
- Produces: `normalizeCourseTags(tags: string[]): string[]`。
- Produces: `snapshotCourseMaterial(type, record): CourseMaterialSnapshot`、`hashCourseSnapshot(snapshot): string`。
- Produces: `diffCourseRevision(before, after): CourseDiffEntry[]`、`diffCourseMaterial(before, after): CourseDiffEntry[]`。
- Produces: `inspectCourseCover(buffer, declaredMimeType): CourseCoverInfo`。

- [ ] **Step 1: 写课程 ID、标签、快照和差异失败测试**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  createCourseId,
  diffCourseRevision,
  hashCourseSnapshot,
  normalizeCourseTags,
  snapshotCourseMaterial
} from "../src/courses/course-domain.js";

test("课程 ID 是 24 位小写十六进制且每次不同", () => {
  const first = createCourseId();
  const second = createCourseId();
  assert.match(first, /^[0-9a-f]{24}$/);
  assert.notEqual(first, second);
});

test("课程标签去空白、去重并保留原顺序", () => {
  assert.deepEqual(normalizeCourseTags([" 英语 ", "小学", "英语", ""]), ["英语", "小学"]);
});

test("课程差异明确列出标题、标签、改名和排序", () => {
  const diff = diffCourseRevision(
    { name: "旧课程", coverUrl: "/old.jpg", summary: "旧简介", tags: ["英语"], items: [{ materialKey: "v:1", displayName: "第一课", sortOrder: 0 }] },
    { name: "新课程", coverUrl: "/new.jpg", summary: "新简介", tags: ["英语", "口语"], items: [{ materialKey: "v:1", displayName: "导学第一课", sortOrder: 1 }] }
  );
  assert.deepEqual(diff.map((item) => item.kind), ["NAME", "COVER", "SUMMARY", "TAG_ADDED", "ITEM_RENAMED", "ITEM_REORDERED"]);
});

test("课件快照忽略学习记录并生成稳定指纹", () => {
  const first = snapshotCourseMaterial("LEARNING_FLASHCARD", { id: "d1", title: "单词", cards: [{ id: "c1", front: "cat", back: "猫", tags: ["动物"], reviews: [{ grade: "MASTERED" }] }] });
  const second = snapshotCourseMaterial("LEARNING_FLASHCARD", { id: "d1", title: "单词", cards: [{ id: "c1", front: "cat", back: "猫", tags: ["动物"], reviews: [] }] });
  assert.equal(hashCourseSnapshot(first), hashCourseSnapshot(second));
});
```

- [ ] **Step 2: 运行测试并确认模块缺失**

Run: `pnpm --filter @xueleai/api-core test`

Expected: FAIL，错误包含 `Cannot find module '../src/courses/course-domain.js'`。

- [ ] **Step 3: 实现稳定快照、哈希和结构化差异**

核心签名必须保持为：

```ts
export type CourseDiffEntry = {
  kind: "NAME" | "COVER" | "SUMMARY" | "TAG_ADDED" | "TAG_REMOVED" | "ITEM_ADDED" | "ITEM_REMOVED" | "ITEM_RENAMED" | "ITEM_REORDERED" | "MATERIAL_FIELD" | "CARD_ADDED" | "CARD_REMOVED" | "CARD_CHANGED";
  label: string;
  before: unknown;
  after: unknown;
};

export function createCourseId() {
  return randomBytes(12).toString("hex");
}

export function normalizeCourseTags(tags: string[]) {
  return [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))];
}

export function hashCourseSnapshot(snapshot: unknown) {
  return createHash("sha256").update(stableJson(snapshot)).digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
```

`snapshotCourseMaterial` 必须只保留公开内容字段：视频导学保留标题、媒体公开地址、字幕、讲解、练习和音频字段；英文带读保留标题、原文、摘要、讲解、逐句内容和音频；闪卡保留卡组标题、摘要、知识图谱与按 `sortOrder/id` 排序的卡片内容，不保留复习记录、置顶、用户邮箱、任务内部字段和存储键。

- [ ] **Step 4: 写 JPEG、PNG、WebP 文件头和 4:3 校验失败测试**

```ts
test("封面拒绝伪造 MIME 和非 4:3 尺寸", () => {
  assert.throws(() => inspectCourseCover(Buffer.from("not-image"), "image/jpeg"), /有效的封面图片/);
  assert.throws(() => inspectCourseCover(pngFixture(800, 800), "image/png"), /比例必须为 4:3/);
});

test("封面识别真实 PNG 尺寸", () => {
  assert.deepEqual(inspectCourseCover(pngFixture(1200, 900), "image/png"), {
    height: 900,
    mimeType: "image/png",
    width: 1200
  });
});

function pngFixture(width: number, height: number) {
  const buffer = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer, 0);
  buffer.writeUInt32BE(13, 8);
  buffer.write("IHDR", 12, "ascii");
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}
```

- [ ] **Step 5: 实现无新增依赖的图片文件头解析**

`inspectCourseCover` 必须检查：JPEG SOI 与 SOF 尺寸、PNG signature 与 IHDR、WebP 的 RIFF/WEBP 及 VP8/VP8L/VP8X 尺寸；声明 MIME 必须等于检测 MIME；`width * 3 === height * 4`；零尺寸或超过 10MB 抛出中文 `AppException`。

- [ ] **Step 6: 运行基础函数测试**

Run: `pnpm --filter @xueleai/api-core test`

Expected: PASS，0 failures。

- [ ] **Step 7: 提交基础函数**

```bash
git add apps/api-core/src/courses/course-domain.ts apps/api-core/src/courses/course-cover.ts apps/api-core/tests/course-domain.test.ts apps/api-core/tests/course-cover.test.ts
git commit -m "feat(api): add course publishing domain helpers"
```

---

### Task 3: 用户课程草稿、课件选择与公开课程查询 API

**Files:**
- Create: `apps/api-core/src/courses/dto/course.dto.ts`
- Create: `apps/api-core/src/courses/courses.service.ts`
- Create: `apps/api-core/src/courses/courses.controller.ts`
- Create: `apps/api-core/src/courses/courses.module.ts`
- Create: `apps/api-core/tests/courses-service.test.ts`
- Modify: `apps/api-core/src/app.module.ts`
- Modify: `apps/api-core/src/media/media.service.ts`

**Interfaces:**
- Produces: `CoursesService.createCourse(userId, dto)`、`saveCourse(userId, id, dto)`、`listUserCourses(userId)`、`getUserCourse(userId, id)`。
- Produces: `listMaterialOptions(userId)`、`listPublicCourses()`、`getPublicCourse(id)`。
- Produces user endpoints `GET/POST /courses`、`GET/PUT /courses/:id`、`GET /courses/material-options`、`POST /courses/cover`。
- Produces public endpoints `GET /public/courses`、`GET /public/courses/:id`。

- [ ] **Step 1: 写课程归属、课件状态、版本保存和公开投影失败测试**

```ts
test("创建课程保存 24 位 ID、规范标签和有序课件", async () => {
  const service = serviceWithPrisma(coursePrismaFixture());
  const course = await service.createCourse("user-1", saveCourseInput());
  assert.match(course.id, /^[0-9a-f]{24}$/);
  assert.deepEqual(course.workingRevision.tags, ["英语", "小学"]);
  assert.deepEqual(course.workingRevision.items.map((item) => item.sortOrder), [0, 1, 2]);
});

test("不能选择其他用户或未完成课件", async () => {
  const service = serviceWithPrisma(coursePrismaFixture({ videoOwnerId: "user-2" }));
  await assert.rejects(() => service.createCourse("user-1", saveCourseInput()), /只能选择自己创建的课件/);
});

test("公开查询只读取已审核版本并按发布时间倒序", async () => {
  const service = serviceWithPrisma(publicCoursePrismaFixture());
  const courses = await service.listPublicCourses();
  assert.equal(courses[0]?.name, "已审核课程名称");
  assert.equal(courses[0]?.reviewing, true);
});
```

- [ ] **Step 2: 运行测试并确认服务缺失**

Run: `pnpm --filter @xueleai/api-core test`

Expected: FAIL，错误包含 `Cannot find module '../src/courses/courses.service.js'`。

- [ ] **Step 3: 实现 DTO 与输入限制**

```ts
export class CourseItemInputDto {
  @IsIn(["VIDEO_GUIDE", "ENGLISH_GUIDED_STUDY", "LEARNING_FLASHCARD"])
  materialType!: CourseMaterialType;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  materialId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  displayName!: string;
}

export class SaveCourseDto {
  @IsString() @MinLength(2) @MaxLength(80) name!: string;
  @IsString() @MinLength(1) @MaxLength(80) coverMediaId!: string;
  @IsString() @MinLength(1) @MaxLength(2000) summary!: string;
  @IsArray() @ArrayMaxSize(8) @IsString({ each: true }) @MaxLength(16, { each: true }) tags!: string[];
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => CourseItemInputDto) items!: CourseItemInputDto[];
}
```

- [ ] **Step 4: 实现用户课程保存和可选课件查询**

`CoursesService` 必须：

1. 对三类 `materialId` 分组批量查询。
2. 校验 `userId`；视频仅允许 `SUCCEEDED`，英文带读必须有可学习内容，闪卡仅允许 `READY`。
3. 校验封面 `MediaAsset.createdByUserId === userId` 且 `mediaType === IMAGE`。
4. 以事务创建或替换 `DRAFT/REJECTED` 工作版本及其条目。
5. 为每个来源课件 upsert `CourseMaterialPublication`，保存当前快照和指纹。
6. 已有 `PENDING_REVIEW` 工作版本时返回“课程正在审核中”。
7. `listMaterialOptions` 返回三类课件统一结构 `{ materialType, materialId, title, subtitle, updatedAt }`。

- [ ] **Step 5: 实现公开课程投影和课件启动链接**

公开返回类型必须包含：

```ts
type PublicCourse = {
  id: string;
  name: string;
  coverUrl: string;
  summary: string;
  tags: string[];
  author: { nickname: string };
  reviewing: boolean;
  publishedAt: Date;
  items: Array<{
    id: string;
    materialType: CourseMaterialType;
    displayName: string;
    sortOrder: number;
    reviewState: "READY" | "PENDING" | "REJECTED";
    launchHref: string | null;
  }>;
};
```

课程级 `reviewState === PENDING_REVIEW` 且已有 `approvedRevisionId` 时，所有 `launchHref` 返回 `null`。否则按课件当前指纹与 `approvedHash` 比较，只锁定不一致课件。启动路径分别是 `/media-tutor/{shareToken}`、`/text2lesson/{id}`、`/flashcard/{id}`。

- [ ] **Step 6: 扩展媒体服务并加入用户封面上传**

新增：

```ts
async uploadUserCourseCover(userId: string, file: UploadedFileLike | undefined) {
  if (!file) throw new AppException(40001, "请选择课程封面", HttpStatus.BAD_REQUEST);
  inspectCourseCover(file.buffer, file.mimetype);
  return this.persistFile({ createdByUserId: userId, file, mediaType: "IMAGE", sourceType: "USER_UPLOAD" });
}
```

复用现有 LOCAL/S3 写入函数，不改变管理员 `uploadFile` 的返回和行为。

- [ ] **Step 7: 实现控制器与模块注册**

`CoursesController` 每个用户方法先调用 `AuthService.me(request)`；`PublicCoursesController` 不读取登录态。`POST /courses/cover` 使用 `FileInterceptor("file", { limits: { fileSize: 10 * 1024 * 1024 } })`。在 `AppModule` 注册 `CoursesModule`。

- [ ] **Step 8: 运行用户与公开查询测试**

Run: `pnpm --filter @xueleai/api-core test`

Expected: PASS，0 failures。

- [ ] **Step 9: 提交课程草稿与公开 API**

```bash
git add apps/api-core/src/courses apps/api-core/src/app.module.ts apps/api-core/src/media/media.service.ts apps/api-core/tests/courses-service.test.ts
git commit -m "feat(api): add user course drafts and public queries"
```

---

### Task 4: 提交审核、统一审核队列和原子审核决策

**Files:**
- Create: `apps/api-core/src/courses/course-review.service.ts`
- Create: `apps/api-core/src/courses/admin-course-reviews.controller.ts`
- Create: `apps/api-core/tests/course-review-service.test.ts`
- Modify: `apps/api-core/src/courses/courses.controller.ts`
- Modify: `apps/api-core/src/courses/courses.module.ts`

**Interfaces:**
- Produces: `submitCourse(userId, courseId)`。
- Produces: `recordMaterialChange(materialType, materialId)`。
- Produces: `listReviews(filters)`、`getReview(id)`、`approve(adminId, id)`、`reject(adminId, id, reason)`。
- Produces: `POST /courses/:id/submit`。
- Produces: `GET /admin/course-reviews`、`GET /admin/course-reviews/:id`、`POST /admin/course-reviews/:id/approve`、`POST /admin/course-reviews/:id/reject`。

- [ ] **Step 1: 写首次审核、复审、单课件审核和并发保护失败测试**

```ts
test("首次课程审核通过同时批准课程版本和未审核课件", async () => {
  const { service, state } = reviewServiceFixture({ published: false });
  const request = await service.submitCourse("user-1", state.course.id);
  await service.approve("admin-1", request.id);
  assert.equal(state.course.reviewState, "PUBLISHED");
  assert.equal(state.course.approvedRevisionId, state.revision.id);
  assert.ok(state.publications.every((item) => item.status === "APPROVED" && item.approvedHash === item.currentHash));
});

test("已上线课程复审保留旧版并在通过后切换", async () => {
  const { service, state } = reviewServiceFixture({ published: true });
  const oldRevisionId = state.course.approvedRevisionId;
  const request = await service.submitCourse("user-1", state.course.id);
  assert.equal(state.course.approvedRevisionId, oldRevisionId);
  assert.equal(state.course.reviewState, "PENDING_REVIEW");
  await service.approve("admin-1", request.id);
  assert.notEqual(state.course.approvedRevisionId, oldRevisionId);
});

test("课件变更只生成一条待审请求并列出全部受影响课程", async () => {
  const { service, state } = reviewServiceFixture({ sharedMaterialCourseCount: 2 });
  await service.recordMaterialChange("LEARNING_FLASHCARD", state.materialId);
  await service.recordMaterialChange("LEARNING_FLASHCARD", state.materialId);
  assert.equal(state.pendingMaterialRequests.length, 1);
  assert.equal(state.pendingMaterialRequests[0]?.affectedCourses.length, 2);
});

test("两个管理员不能重复处理同一请求", async () => {
  const { service, state } = reviewServiceFixture();
  await service.approve("admin-1", state.request.id);
  await assert.rejects(() => service.approve("admin-2", state.request.id), /审核状态已发生变化/);
});
```

- [ ] **Step 2: 运行测试并确认审核服务缺失**

Run: `pnpm --filter @xueleai/api-core test`

Expected: FAIL，错误包含 `Cannot find module '../src/courses/course-review.service.js'`。

- [ ] **Step 3: 实现课程提交与结构化课程差异**

`submitCourse` 必须在事务中：锁定课程；验证作者和工作版本；重新校验至少一个课件、课件归属和状态；从 `approvedRevision` 或空快照计算 `beforeSnapshot`；从工作版本计算 `afterSnapshot`；调用 `diffCourseRevision`；将工作版本改为 `PENDING`；将课程改为 `PENDING_REVIEW`；创建唯一待审 `COURSE_REVISION` 请求。

- [ ] **Step 4: 实现课件变更记录与管理员队列对账**

`recordMaterialChange` 必须重新读取原始课件并生成当前快照。只有 `approvedHash` 非空且至少被一个已公开课程的已审核版本引用时才创建/更新 `MATERIAL_CHANGE` 请求。当前 hash 回到 `approvedHash` 时删除待审请求并恢复 `APPROVED`。

`listReviews` 调用 `reconcilePublishedMaterials()`，保证源服务写入审核记录失败后，后台打开队列仍会补齐当前 hash 与已审核 hash 不一致的请求。

- [ ] **Step 5: 实现原子通过和拒绝**

审核方法先使用 `updateMany({ where: { id, status: "PENDING" } })` 抢占请求；更新数量不是 1 时抛出 `AppException(40901, "审核状态已发生变化，请刷新后重试", CONFLICT)`。

课程通过：工作版本改 `APPROVED`，旧审核版本保留，`approvedRevisionId` 切换，`workingRevisionId` 清空，课程改 `PUBLISHED`，所有尚未批准的当前课件快照在同一事务中设为 approved。

课程拒绝：工作版本改 `REJECTED` 并保存原因；已有审核版本时课程恢复 `PUBLISHED`，否则课程改 `REJECTED`。

课件通过：当前 snapshot/hash 复制到 approved 字段并设 `APPROVED`。课件拒绝：设 `REJECTED`，不改变任何课程版本。

- [ ] **Step 6: 实现管理员控制器与操作日志**

每个管理员端点先调用 `AdminAuthService.me`。通过记录 `APPROVE_COURSE_REVIEW`，拒绝记录 `REJECT_COURSE_REVIEW`，`resourceType` 固定为 `COURSE_REVIEW_REQUEST`，拒绝 DTO 使用 `@MinLength(2) @MaxLength(500)`。

- [ ] **Step 7: 运行审核服务测试**

Run: `pnpm --filter @xueleai/api-core test`

Expected: PASS，0 failures。

- [ ] **Step 8: 提交审核后端**

```bash
git add apps/api-core/src/courses apps/api-core/tests/course-review-service.test.ts
git commit -m "feat(api): add unified course review workflow"
```

---

### Task 5: 三类课件变更接入审核与学习闪卡匿名读取

**Files:**
- Modify: `apps/api-core/src/video-guide/video-guide.module.ts`
- Modify: `apps/api-core/src/video-guide/video-guide.service.ts`
- Modify: `apps/api-core/src/english-guided-study/english-guided-study.module.ts`
- Modify: `apps/api-core/src/english-guided-study/english-guided-study.service.ts`
- Modify: `apps/api-core/src/learning-flashcards/learning-flashcards.module.ts`
- Modify: `apps/api-core/src/learning-flashcards/learning-flashcards.controller.ts`
- Modify: `apps/api-core/src/learning-flashcards/learning-flashcards.service.ts`
- Modify: `apps/api-core/tests/core-unit.test.ts`
- Modify: `apps/api-core/tests/video-guide-generation-lease.test.ts`
- Modify: `apps/api-core/tests/video-guide-narration-edit.test.ts`
- Modify: `apps/api-core/tests/video-guide-narration-generation.test.ts`
- Modify: `apps/api-core/tests/english-guided-study-billing.test.ts`
- Modify: `apps/api-core/tests/english-guided-study-regeneration.test.ts`
- Modify: `apps/api-core/tests/learning-flashcards-review-summary.test.ts`
- Create: `apps/api-core/tests/course-material-change-hooks.test.ts`
- Create: `apps/api-core/tests/public-course-flashcard.test.ts`

**Interfaces:**
- Consumes: `CourseReviewService.recordMaterialChange(materialType, materialId)` from Task 4。
- Produces: immediate material-review updates after public-content mutations。
- Produces: `GET /public/learning-flashcards/decks/:id` and `LearningFlashcardsService.getPublicCourseDeck(id)`。

- [ ] **Step 1: 写三类内容变更触发审核的失败测试**

```ts
test("编辑视频导学讲解后记录视频课件变更", async () => {
  const tracker = trackerSpy();
  const service = videoServiceFixture(tracker);
  await service.updateLessonNarrationScript("user-1", "video-1", narrationInput());
  assert.deepEqual(tracker.calls, [["VIDEO_GUIDE", "video-1"]]);
});

test("编辑英文带读讲解后记录英文课件变更", async () => {
  const tracker = trackerSpy();
  const service = englishServiceFixture(tracker);
  await service.updateMaterialScript("user-1", "english-1", { targetType: "INTRO", script: "新讲解" });
  assert.deepEqual(tracker.calls, [["ENGLISH_GUIDED_STUDY", "english-1"]]);
});

test("编辑闪卡内容会记录变更，复习反馈不会", async () => {
  const tracker = trackerSpy();
  const service = flashcardServiceFixture(tracker);
  await service.updateCard("user-1", "card-1", { front: "new front" });
  await service.reviewCard("user-1", "card-1", { grade: "MASTERED" });
  assert.deepEqual(tracker.calls, [["LEARNING_FLASHCARD", "deck-1"]]);
});
```

- [ ] **Step 2: 运行 hooks 测试并确认调用缺失**

Run: `pnpm --filter @xueleai/api-core test`

Expected: FAIL，实际 `tracker.calls` 为空。

- [ ] **Step 3: 注入 CourseReviewService 并在公开内容写入后记录变更**

三类模块导入 `CoursesModule`。服务构造函数增加 `CourseReviewService`。只在以下写操作成功持久化后调用：

- 视频导学：字幕替换、讲解文案保存、讲解音频生成完成、练习生成完成。
- 英文带读：已有材料重新生成、讲解文本保存、讲解音频生成完成。
- 学习闪卡：卡片正面、背面、类型、来源或标签更新。

不得在视频媒体规范化、英文材料置顶、闪卡复习反馈中调用。

- [ ] **Step 4: 更新现有服务构造测试夹具**

在列出的七个既有测试文件中，为 `VideoGuideService`、`EnglishGuidedStudyService`、`LearningFlashcardsService` 新构造参数传入：

```ts
const courseReviewService = {
  recordMaterialChange: async () => undefined
};
```

不得修改既有断言和业务测试数据。

- [ ] **Step 5: 写匿名学习闪卡失败测试**

```ts
test("至少审核通过过一次的课程闪卡允许匿名读取", async () => {
  const service = publicDeckServiceFixture({ approvedHash: "approved-hash", status: "PENDING" });
  const deck = await service.getPublicCourseDeck("deck-1");
  assert.equal(deck.id, "deck-1");
});

test("从未随课程审核通过的闪卡不允许匿名读取", async () => {
  const service = publicDeckServiceFixture({ approvedHash: null, status: "PENDING" });
  await assert.rejects(() => service.getPublicCourseDeck("deck-1"), /闪卡组不存在或尚未公开/);
});
```

- [ ] **Step 6: 实现公开闪卡查询和控制器**

`getPublicCourseDeck` 必须查询 `CourseMaterialPublication.learningFlashcardDeckId === id` 且 `approvedHash !== null`，然后复用现有 `toDeck` 投影。后续课件状态为 `PENDING` 或 `REJECTED` 时仍保留直接学习地址，仅由课程页面锁定入口。

新增 `PublicLearningFlashcardsController`：

```ts
@Controller("public/learning-flashcards")
export class PublicLearningFlashcardsController {
  @Get("decks/:id")
  async getDeck(@Param("id") id: string) {
    return successResponse(await this.learningFlashcardsService.getPublicCourseDeck(id));
  }
}
```

- [ ] **Step 7: 运行三类 hooks、公开闪卡和相关回归测试**

Run: `pnpm --filter @xueleai/api-core test`

Expected: PASS，0 failures。

- [ ] **Step 8: 提交课件审核接入**

```bash
git add apps/api-core/src/video-guide apps/api-core/src/english-guided-study apps/api-core/src/learning-flashcards apps/api-core/tests
git commit -m "feat(api): track published course material changes"
```

---

### Task 6: Web 课程类型、服务端操作与可测试的编辑状态

**Files:**
- Create: `apps/web/src/lib/course-types.ts`
- Create: `apps/web/src/lib/course-editor-state.ts`
- Create: `apps/web/src/lib/course-api.ts`
- Create: `apps/web/tests/course-editor-state.test.ts`

**Interfaces:**
- Produces: Web types `CourseSummary`、`CourseDetail`、`CourseMaterialOption`、`PublicCourse`、`CourseReviewRequest`。
- Produces: `moveCourseItem`、`normalizeEditorTags`、`centerCropRect`、`courseStatusLabel`。
- Produces server reads/actions for user courses, public courses and admin reviews。

- [ ] **Step 1: 写排序、标签、中心裁切与状态文案失败测试**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { centerCropRect, courseStatusLabel, moveCourseItem, normalizeEditorTags } from "../src/lib/course-editor-state.js";

test("课件可向上和向下排序且重新编号", () => {
  const items = [{ id: "a", sortOrder: 0 }, { id: "b", sortOrder: 1 }, { id: "c", sortOrder: 2 }];
  assert.deepEqual(moveCourseItem(items, "b", -1).map((item) => [item.id, item.sortOrder]), [["b", 0], ["a", 1], ["c", 2]]);
});

test("宽图中心裁切为 4:3", () => {
  assert.deepEqual(centerCropRect(1600, 900), { height: 900, width: 1200, x: 200, y: 0 });
});

test("标签按中文逗号、英文逗号和空格拆分去重", () => {
  assert.deepEqual(normalizeEditorTags("英语，小学 口语,英语"), ["英语", "小学", "口语"]);
});

test("课程状态使用简体中文", () => {
  assert.equal(courseStatusLabel("PENDING_REVIEW", true), "审核中");
  assert.equal(courseStatusLabel("REJECTED", false), "审核未通过");
});
```

- [ ] **Step 2: 运行测试并确认 helper 缺失**

Run: `pnpm --filter @xueleai/web test`

Expected: FAIL，错误包含 `Cannot find module '../src/lib/course-editor-state.js'`。

- [ ] **Step 3: 实现纯编辑状态 helper**

```ts
export function moveCourseItem<T extends { id: string; sortOrder: number }>(items: T[], id: string, delta: -1 | 1) {
  const ordered = [...items].sort((a, b) => a.sortOrder - b.sortOrder);
  const index = ordered.findIndex((item) => item.id === id);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= ordered.length) return ordered;
  [ordered[index], ordered[target]] = [ordered[target]!, ordered[index]!];
  return ordered.map((item, sortOrder) => ({ ...item, sortOrder }));
}

export function centerCropRect(width: number, height: number) {
  const targetRatio = 4 / 3;
  const sourceRatio = width / height;
  const cropWidth = sourceRatio > targetRatio ? height * targetRatio : width;
  const cropHeight = sourceRatio > targetRatio ? height : width / targetRatio;
  return { height: cropHeight, width: cropWidth, x: (width - cropWidth) / 2, y: (height - cropHeight) / 2 };
}
```

- [ ] **Step 4: 实现共享类型和服务端 API 包装**

`course-api.ts` 使用 `"use server"`、`cookies()` 和 `API_BASE_URL ?? "http://localhost:3322/api"`，提供：

```ts
getUserCourses(): Promise<CourseSummary[]>
getUserCourse(id: string): Promise<CourseDetail>
getCourseMaterialOptions(): Promise<CourseMaterialOption[]>
getPublicCourses(): Promise<PublicCourse[]>
getPublicCourse(id: string): Promise<PublicCourse>
getAdminCourseReviews(filters?: { status?: string; scope?: string }): Promise<CourseReviewRequest[]>
getAdminCourseReview(id: string): Promise<CourseReviewRequest>
createCourseAction(input: SaveCourseInput): Promise<ActionResult<CourseDetail>>
saveCourseAction(id: string, input: SaveCourseInput): Promise<ActionResult<CourseDetail>>
submitCourseAction(id: string): Promise<ActionResult<CourseDetail>>
uploadCourseCoverAction(formData: FormData): Promise<ActionResult<MediaAssetSummary>>
approveCourseReviewAction(id: string): Promise<ActionResult<void>>
rejectCourseReviewAction(id: string, reason: string): Promise<ActionResult<void>>
```

每个 action 捕获异常并返回中文 `message`，成功后只 revalidate `/dashboard/courses`、`/center`、`/c/{id}`、`/admin/course-reviews` 相关路径。

- [ ] **Step 5: 运行 Web helper 测试与类型检查**

Run: `pnpm --filter @xueleai/web test && pnpm --filter @xueleai/web typecheck`

Expected: PASS 且 typecheck exit 0。

- [ ] **Step 6: 提交 Web 数据层**

```bash
git add apps/web/src/lib/course-types.ts apps/web/src/lib/course-editor-state.ts apps/web/src/lib/course-api.ts apps/web/tests/course-editor-state.test.ts
git commit -m "feat(web): add course publishing data layer"
```

---

### Task 7: 用户“我的课程”与课程编辑器

**Files:**
- Create: `apps/web/src/components/courses/course-cover-uploader.tsx`
- Create: `apps/web/src/components/courses/course-material-picker.tsx`
- Create: `apps/web/src/components/courses/course-editor.tsx`
- Create: `apps/web/src/app/dashboard/courses/page.tsx`
- Create: `apps/web/src/app/dashboard/courses/new/page.tsx`
- Create: `apps/web/src/app/dashboard/courses/[id]/page.tsx`
- Create: `apps/web/src/app/dashboard/courses/[id]/preview/page.tsx`
- Modify: `apps/web/src/components/shell/dashboard-shell.tsx`

**Interfaces:**
- Consumes: Task 6 server reads/actions and editor helpers。
- Produces: `/dashboard/courses`、`/dashboard/courses/new`、`/dashboard/courses/{id}`、作者预览页。

- [ ] **Step 1: 在 DashboardShell 中加入“我的课程”入口**

将 `DashboardNavKey` 增加 `courses`，在“导学课件”之后加入：

```ts
{
  key: "courses",
  href: "/dashboard/courses",
  label: "我的课程",
  icon: LibraryBig
}
```

- [ ] **Step 2: 实现 4:3 中心裁切上传组件**

组件读取图片天然尺寸，调用 `centerCropRect`，使用 Canvas 输出固定 `1200 × 900` JPEG Blob，再通过 `uploadCourseCoverAction` 上传。必须展示 4:3 预览、上传中状态、替换按钮和中文错误。核心绘制代码：

```ts
const crop = centerCropRect(image.naturalWidth, image.naturalHeight);
canvas.width = 1200;
canvas.height = 900;
context.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, 1200, 900);
const blob = await new Promise<Blob>((resolve, reject) =>
  canvas.toBlob((value) => value ? resolve(value) : reject(new Error("课程封面处理失败")), "image/jpeg", 0.9)
);
```

- [ ] **Step 3: 实现三类本人课件选择器**

按“视频导学 / 英文带读 / 学习闪卡”分组显示 `CourseMaterialOption[]`。已选项禁用重复添加。每项只显示名称、类型、更新时间和“添加”按钮，不添加与当前选择无关的长说明。

- [ ] **Step 4: 实现课程编辑器**

编辑器包含课程名称、封面、简介、标签、已选课件目录。目录项提供名称输入、上移、下移、移除。使用 `moveCourseItem` 保持连续顺序。保存时生成：

```ts
{
  name: name.trim(),
  coverMediaId,
  summary: summary.trim(),
  tags: normalizeEditorTags(tagText),
  items: orderedItems.map(({ materialId, materialType, displayName }) => ({
    materialId,
    materialType,
    displayName: displayName.trim()
  }))
}
```

“保存草稿”与“提交审核”分开；新课程提交前先创建，再调用 submit action。待审时表单只读；拒绝时在顶部显示拒绝原因并允许修改。

- [ ] **Step 5: 实现课程列表与页面加载边界**

`/dashboard/courses` 使用 `DashboardShell active="courses"`，提供“创建课程”按钮和状态卡片。`new` 页并行读取课件选项；`[id]` 页并行读取课程和课件选项并验证作者；预览页读取工作版本，不暴露给匿名用户。

- [ ] **Step 6: 运行 Web 测试和类型检查**

Run: `pnpm --filter @xueleai/web test && pnpm --filter @xueleai/web typecheck`

Expected: PASS 且 typecheck exit 0。

- [ ] **Step 7: 提交用户课程界面**

```bash
git add apps/web/src/components/courses apps/web/src/app/dashboard/courses apps/web/src/components/shell/dashboard-shell.tsx
git commit -m "feat(web): add user course editor"
```

---

### Task 8: 资源中心、稳定课程页、公开闪卡加载与默认导航

**Files:**
- Create: `apps/web/src/components/courses/public-course-card.tsx`
- Create: `apps/web/src/components/courses/public-course-detail.tsx`
- Create: `apps/web/src/app/center/page.tsx`
- Create: `apps/web/src/app/c/[id]/page.tsx`
- Create: `apps/web/src/app/api/public/learning-flashcards/decks/[id]/route.ts`
- Modify: `apps/web/src/lib/course-editor-state.ts`
- Modify: `apps/web/src/lib/learning-flashcards-api.ts`
- Modify: `apps/web/src/components/shell/public-shell.tsx`
- Modify: `packages/database/prisma/seed.ts`
- Create: `apps/web/tests/public-course-presentation.test.ts`

**Interfaces:**
- Produces: `/center` 与 `/c/{24位ID}` server-rendered public pages。
- Produces: anonymous flashcard fallback for `LearningFlashcardStudyPage`。
- Produces: public presentation helper behavior for course-level and item-level locks。

- [ ] **Step 1: 写公开课程卡片状态和课件链接失败测试**

```ts
test("课程复审时所有课件禁用", () => {
  const course = publicCourseFixture({ reviewing: true });
  assert.deepEqual(course.items.map((item) => publicCourseItemPresentation(course, item).href), [null, null, null]);
});

test("单课件待审只禁用对应入口", () => {
  const course = publicCourseFixture({ reviewing: false, itemStates: ["READY", "PENDING", "READY"] });
  assert.deepEqual(course.items.map((item) => publicCourseItemPresentation(course, item).href), ["/media-tutor/share-1", null, "/flashcard/deck-1"]);
});
```

- [ ] **Step 2: 运行公开展示测试并确认 helper 缺失**

Run: `pnpm --filter @xueleai/web test`

Expected: FAIL，错误包含缺失的 `publicCourseItemPresentation`。

- [ ] **Step 3: 实现 `/center`**

先在 `course-editor-state.ts` 实现：

```ts
export function publicCourseItemPresentation(course: PublicCourse, item: PublicCourse["items"][number]) {
  const locked = course.reviewing || item.reviewState !== "READY";
  return {
    href: locked ? null : item.launchHref,
    statusLabel: course.reviewing ? "课程审核中" : item.reviewState === "PENDING" ? "课件审核中" : item.reviewState === "REJECTED" ? "审核未通过" : "可学习"
  };
}
```

使用 `PublicShell` 和响应式卡片网格。卡片固定 `aspect-[4/3]`、`object-cover`，展示名称、两行简介摘要、最多八个标签、课件数量和审核徽标。空状态只显示“暂无已发布课程”。

- [ ] **Step 4: 实现 `/c/[id]` 与 SEO metadata**

服务端验证 `/^[0-9a-f]{24}$/`，无效或首次未审核课程调用 `notFound()`。metadata 使用已审核课程名称和简介。详情页展示作者昵称、封面、简介、标签和有序目录；锁定项渲染为不可点击按钮并带“审核中/审核未通过”，正常项使用 `Link` 进入原生学习页。

- [ ] **Step 5: 实现学习闪卡匿名回退**

新增 BFF route 转发到 `/public/learning-flashcards/decks/:id`。把 `learning-flashcards-api.ts` 的既有 `getLearningFlashcardDeck` 改为先读取登录态接口，失败时读取公开接口：

```ts
export async function getLearningFlashcardDeck(id: string) {
  try {
    return await apiFetch<LearningFlashcardDeck>(`/api/learning-flashcards/decks/${encodeURIComponent(id)}`);
  } catch {
    return apiFetch<LearningFlashcardDeck>(`/api/public/learning-flashcards/decks/${encodeURIComponent(id)}`);
  }
}
```

`LearningFlashcardStudyPage` 无需修改，继续调用同名函数；复习反馈保持现有行为，匿名保存失败时继续显示“复习反馈暂未保存”，不阻断学习。

- [ ] **Step 6: 更新默认导航与 seed**

`public-shell.tsx` 的 `defaultNavItems` 在“首页”后加入 `{ href: "/center", label: "资源中心" }`。必须保留任务前已存在的 `/flashcard` 导航修改。`seed.ts` 的 `publicNavItems` 更新为包含 `资源中心|/center`。

提交 `public-shell.tsx` 时不得把任务前的 `/experience/ai-learning-flashcards` → `/flashcard` 修改纳入本功能提交；使用只包含 `defaultNavItems` 新增行的 index patch 分开暂存，并用 `git diff --cached` 核对。

- [ ] **Step 7: 运行公开页面测试、类型检查与构建**

Run: `pnpm --filter @xueleai/web test && pnpm --filter @xueleai/web typecheck && pnpm --filter @xueleai/web build`

Expected: PASS、typecheck exit 0、Next build exit 0，路由表包含 `/center` 与 `/c/[id]`。

- [ ] **Step 8: 提交公开课程界面**

```bash
git add apps/web/src/components/courses/public-course-card.tsx apps/web/src/components/courses/public-course-detail.tsx apps/web/src/app/center apps/web/src/app/c apps/web/src/app/api/public apps/web/src/lib/course-editor-state.ts apps/web/src/lib/learning-flashcards-api.ts packages/database/prisma/seed.ts apps/web/tests/public-course-presentation.test.ts
git commit -m "feat(web): publish courses in resource center"
```

单独暂存并提交 `public-shell.tsx` 的资源中心导航 hunk：

```bash
git apply --cached <<'PATCH'
diff --git a/apps/web/src/components/shell/public-shell.tsx b/apps/web/src/components/shell/public-shell.tsx
--- a/apps/web/src/components/shell/public-shell.tsx
+++ b/apps/web/src/components/shell/public-shell.tsx
@@ -21,7 +21,8 @@
 const defaultNavItems = [
   { href: "/", label: "首页" },
+  { href: "/center", label: "资源中心" },
   { href: "/tools", label: "场景应用" },
   { href: "/textbook", label: "教材" },
   { href: "/dict", label: "词典" },
PATCH
git diff --cached -- apps/web/src/components/shell/public-shell.tsx
git commit -m "feat(web): add resource center navigation"
```

---

### Task 9: 管理员统一课程审核界面

**Files:**
- Create: `apps/web/src/components/admin/course-review-manager.tsx`
- Create: `apps/web/src/app/admin/course-reviews/page.tsx`
- Create: `apps/web/src/lib/course-review-presentation.ts`
- Modify: `apps/web/src/lib/mock-data.ts`
- Create: `apps/web/tests/course-review-presentation.test.ts`

**Interfaces:**
- Consumes: Task 6 review reads/actions。
- Produces: `/admin/course-reviews` unified review queue and detail panel。
- Produces: `groupCourseReviewDiff(diff)` for stable Chinese presentation。

- [ ] **Step 1: 写结构化审核差异中文分组失败测试**

```ts
import { groupCourseReviewDiff } from "../src/lib/course-review-presentation.js";

test("课程和课件差异按资料、目录和内容分组", () => {
  const groups = groupCourseReviewDiff([
    { kind: "NAME", label: "课程名称", before: "旧", after: "新" },
    { kind: "ITEM_REORDERED", label: "课件顺序", before: 2, after: 1 },
    { kind: "CARD_CHANGED", label: "闪卡 c1 正面", before: "cat", after: "a cat" }
  ]);
  assert.deepEqual(groups.map((group) => group.title), ["课程资料", "课程目录", "课件内容"]);
});
```

- [ ] **Step 2: 运行测试并确认展示 helper 缺失**

Run: `pnpm --filter @xueleai/web test`

Expected: FAIL，错误包含缺失的 `groupCourseReviewDiff`。

- [ ] **Step 3: 在后台导航加入课程审核**

在 `adminNavGroups` 的“学习材料”分组首位加入：

```ts
{
  href: "/admin/course-reviews",
  label: "课程审核",
  icon: ClipboardCheck
}
```

- [ ] **Step 4: 实现统一审核列表和详情**

页面顶部只保留待审核数量、课程变更数量、课件变更数量三个指标。列表支持 `status` 和 `scope` 查询参数。详情展示提交用户、影响课程、提交时间、修改前后值；封面使用并排 4:3 预览；文本差异使用清晰的“修改前/修改后”；标签使用新增/删除徽标；课件顺序显示旧位置和新位置；课件内容按视频、英文、闪卡字段展示。

- [ ] **Step 5: 实现审核操作**

“审核通过”需要二次确认区域但不要求填写说明；“审核拒绝”必须填写 2–500 字原因。操作成功后 `router.refresh()` 并清空选择；409 冲突显示后刷新列表；其他错误显示后端中文消息。

- [ ] **Step 6: 运行后台展示测试和类型检查**

Run: `pnpm --filter @xueleai/web test && pnpm --filter @xueleai/web typecheck`

Expected: PASS 且 typecheck exit 0。

- [ ] **Step 7: 提交管理员审核界面**

```bash
git add apps/web/src/components/admin/course-review-manager.tsx apps/web/src/app/admin/course-reviews apps/web/src/lib/course-review-presentation.ts apps/web/src/lib/mock-data.ts apps/web/tests/course-review-presentation.test.ts
git commit -m "feat(admin): add unified course review page"
```

---

### Task 10: 数据库验收、全量验证、浏览器验收与独立代码审查

**Files:**
- Modify only if verification finds a proven defect: files already listed in Tasks 1–9。

**Interfaces:**
- Verifies: migration、seed、API、Web、匿名访问、审核状态、桌面与移动布局。
- Produces: independent review report with all Critical/Important issues resolved。

- [ ] **Step 1: 确认只保留预期改动并检查未提交用户工作**

Run: `git status --short && git diff --check && git log --oneline --decorate -12`

Expected: 课程功能提交均存在；任务开始前的未提交文件仍存在且没有被回退；没有新增空白错误。

- [ ] **Step 2: 应用 migration 与 seed**

Run: `docker compose up -d postgres redis && pnpm db:migrate && pnpm db:seed`

Expected: PostgreSQL `3324`、Redis `3325` 正常；migration 无 reset；seed 成功且不创建课程假数据。

- [ ] **Step 3: 运行完整静态和自动化验证**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`

Expected: 四条命令全部 exit 0，所有测试 0 failures，Next build 包含 `/dashboard/courses`、`/admin/course-reviews`、`/center`、`/c/[id]`。

- [ ] **Step 4: 启动本地服务并完成用户端浏览器验收**

Run: `pnpm dev`

使用浏览器依次检查：

1. 登录用户访问 `/dashboard/courses` 并创建课程。
2. 上传非 4:3 原图，确认前端裁切成 4:3 且后端接受。
3. 选择视频导学、英文带读、学习闪卡，分别改名并上下排序。
4. 保存草稿、刷新后数据不丢失、提交审核。
5. 待审版本只读，首次待审课程不出现在匿名 `/center`。

Expected: 无英文错误、无控制台异常、桌面和 390px 移动宽度无横向溢出。

- [ ] **Step 5: 完成管理员和公开页面浏览器验收**

1. 管理员访问 `/admin/course-reviews`，确认同页看到课程/课件类型和具体变更。
2. 拒绝一次并确认用户看到原因；修改后重新提交。
3. 审核通过，匿名窗口访问 `/center` 与 `/c/{id}`。
4. 匿名依次打开视频、英文、闪卡原生学习页。
5. 修改已发布课程资料，确认旧卡片和 URL 保留、显示“审核中”、全部目录禁用。
6. 审核通过课程复审，再修改单张闪卡，确认只有闪卡条目禁用，视频和英文仍可点击。
7. 在后台确认课件变更列出具体卡片字段和受影响课程。

Expected: 所有状态严格符合设计文档。

- [ ] **Step 6: 按 requesting-code-review 技能派发独立审查**

```bash
BASE_SHA=c2b4edc
HEAD_SHA=$(git rev-parse HEAD)
```

审查要求：对照 `docs/superpowers/specs/2026-07-17-user-course-publishing-design.md` 和本计划，检查权限绕过、未审核数据泄露、版本切换原子性、课件局部锁定、匿名访问、图片解析、并发审核、中文错误、现有未提交修改污染。修复全部 Critical 和 Important 问题；每个修复先增加失败测试。

- [ ] **Step 7: 修复审查问题后执行最终验真**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm build && git diff --check`

Expected: 全部 exit 0，0 failures，审查无未解决 Critical/Important 问题。

- [ ] **Step 8: 提交审查修复**

如审查产生修复，在每个 RED-GREEN 修复循环结束时暂存该循环实际修改的明确文件；提交前运行：

```bash
git diff --cached --name-only
git diff --cached --check
git commit -m "fix: address course publishing review findings"
```

如无修复，不创建空提交。
