# 学习者学习过程记录与学习情况分析 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (\`- [ ]\`) syntax for tracking.

**Goal:** 建立服务端可信的学习者在线时长、学习时长、三类课件分段进度和双端学习看板，为后续可配置学习打卡提供长期数据基础。

**Architecture:** PostgreSQL 保存学习会话、规范时间片、材料进度、分段进度、详细事件和每日汇总；NestJS 独立 learner-learning 模块负责身份、授权、幂等、去重、进度和统计；Next.js 统一采集器与三个播放器适配器只上报学习事实。学习者学习中心和主账号看板共享同一服务端统计口径。

**Tech Stack:** pnpm Monorepo、Prisma 7.8、PostgreSQL、NestJS 11、TypeScript 6、Next.js 16 App Router、React 19、TailwindCSS、Node.js test runner

**Spec:** docs/superpowers/specs/2026-08-19-learner-learning-analytics-design.md

## Global Constraints

- 所有页面、接口错误和空状态只使用简体中文。
- 允许修改 packages/database、apps/api-core、apps/web、docs；不修改 apps/ai-gateway、支付、钱包、CMS 和现有登录凭证语义。
- 本功能需要 Prisma migration，不需要 seed 更新；生产环境禁止 prisma migrate reset 和删除 PostgreSQL/Redis volume。
- 固定使用现有 3321 Web、3322 API、3324 PostgreSQL、3325 Redis 端口，不新增端口。
- API 继续返回 { code, message, data }，不得暴露 Prisma、SQL、JWT、堆栈或内部错误。
- 服务端只从可信 ProfileSubject 和 refresh session 解析 userId、learnerId，不接受客户端指定记录归属。
- 心跳间隔 30 秒；页面隐藏或空闲超过 120 秒不计时；同一学习者同一 30 秒规范时间桶只累计一次。
- 按 Asia/Shanghai 自然日汇总；原始会话、时间片和学习事件保留 180 天；当前进度和每日汇总长期保留。
- 不记录答案正文、课文正文、录音、提示词、密码、Cookie、Token 或其他敏感原文。
- 第一版不引入外部分析 SDK、图表依赖、消息队列或数据仓库。
- 每个任务先写失败测试，再写最小实现；每次提交只包含该任务文件。
- 执行前必须使用 superpowers:using-git-worktrees 建立独立工作树，避免覆盖当前工作区未提交修改。

## File Map

### Database

- packages/database/prisma/schema.prisma：增加学习会话、时间片、进度、每日汇总和事件上下文。
- packages/database/prisma/migrations/20260819110000_learner_learning_analytics/migration.sql：只增量创建枚举、表、外键和索引。
- packages/database/prisma/learner-learning-schema-contract.test.ts：验证模型、唯一键、索引和迁移无破坏性语句。

### API Core

- apps/api-core/src/learner-learning/learner-learning.constants.ts：30 秒、120 秒、180 天和时区常量。
- apps/api-core/src/learner-learning/learner-learning.types.ts：服务内部上下文、事件、进度和查询类型。
- apps/api-core/src/learner-learning/learner-learning-time.ts：有效活动、时间裁剪、时间桶、跨午夜拆分。
- apps/api-core/src/learner-learning/learner-learning-progress.ts：区间并集、稳定 ID 集合和三类课件完成规则。
- apps/api-core/src/learner-learning/learner-learning-context.service.ts：校验授权并解析课程项、材料 ID 和内容版本。
- apps/api-core/src/learner-learning/learner-learning-session.service.ts：创建会话、心跳、结束和时间片去重。
- apps/api-core/src/learner-learning/learner-learning-event.service.ts：幂等事件、服务端练习判定和进度事务更新。
- apps/api-core/src/learner-learning/learner-learning-query.service.ts：学习者和主账号共用的概览、趋势和明细查询。
- apps/api-core/src/learner-learning/learner-learning-maintenance.service.ts：过期会话、近期校准和 180 天清理。
- apps/api-core/src/learner-learning/learner-learning.controller.ts：学习者写入/读取和主账号只读接口。
- apps/api-core/src/learner-learning/learner-learning.module.ts：模块装配。
- apps/api-core/src/learner-learning/dto/learner-learning.dto.ts：严格限制的 DTO。
- apps/api-core/src/learner-learning/backfill-learner-learning.ts：只回填可证明的闪卡和完成事实，不生成时长。
- apps/api-core/tests/helpers/learner-learning-fixture.ts：学习分析服务测试共用的确定性内存 Prisma fixture。
- apps/api-core/src/profiles/profile-context.service.ts：增加返回可信 refreshTokenId 的读取方法。
- apps/api-core/src/profiles/profiles.module.ts：导出 ProfileContextService。
- apps/api-core/src/app.module.ts：注册 LearnerLearningModule。
- apps/api-core/src/learning-flashcards/learning-flashcards.service.ts：继续返回服务端复习记录 ID，供统一进度事件引用。

### Web

- apps/web/src/lib/learner-learning-types.ts：Web 端请求、概览、明细和展示类型。
- apps/web/src/lib/learner-learning-client.ts：客户端会话、心跳、事件和重试队列。
- apps/web/src/lib/learner-learning-tracker.ts：可单测的活动状态、标签页选举和事件序号逻辑。
- apps/web/src/lib/learner-learning-api.ts：Server Component 的学习统计读取函数。
- apps/web/src/components/learning/learner-learning-provider.tsx：统一采集器。
- apps/web/src/components/learning/learning-trend.tsx：无新依赖的趋势条形图。
- apps/web/src/components/learning/material-progress-list.tsx：课件及分段进度。
- apps/web/src/components/learning/account-learning-dashboard.tsx：主账号学习看板。
- apps/web/src/components/shell/learner-shell.tsx：学习者壳挂载统一采集器。
- apps/web/src/components/shell/public-shell.tsx：公共课件页在学习者模式下挂载统一采集器。
- apps/web/src/components/profiles/learner-center.tsx：替换旧的完成活动卡片，增加趋势和最近学习。
- apps/web/src/components/profiles/learner-manager.tsx：增加“学习情况”入口。
- apps/web/src/components/courses/public-course-detail.tsx：课程课件链接携带 courseId 和 itemId。
- apps/web/src/lib/course-editor-state.ts：构造可验证的课程学习上下文链接。
- apps/web/src/components/experience/video-guide-learning-player.tsx：视频导学适配器。
- apps/web/src/components/experience/english-guided-study-learning-player.tsx：英文/古诗文伴学适配器。
- apps/web/src/components/courses/public-flashcard-player.tsx：学习者等级反馈和闪卡适配器。
- apps/web/src/app/api/profiles/learner/learning/[...segments]/route.ts：浏览器到 NestJS 的受限同源代理。
- apps/web/src/app/learn/center/page.tsx：读取新概览。
- apps/web/src/app/learn/center/materials/[materialType]/[materialId]/page.tsx：学习者课件明细。
- apps/web/src/app/dashboard/learners/learning/page.tsx：主账号学习看板。

---

## Phase 1：有效在线与学习时长

### Task 1: 数据库学习分析骨架

**Files:**
- Create: packages/database/prisma/learner-learning-schema-contract.test.ts
- Create: packages/database/prisma/migrations/20260819110000_learner_learning_analytics/migration.sql
- Modify: packages/database/prisma/schema.prisma

**Interfaces:**
- Produces: LearnerLearningSession、LearnerLearningTimeSlice、LearnerMaterialProgress、LearnerMaterialPartProgress、LearnerDailyLearningSummary Prisma delegates。
- Produces: LearnerLearningStatus、LearnerLearningSignal、LearnerLearningSessionEndReason、LearnerLearningSummaryScope 枚举。
- Preserves: 现有 LearnerActivityEvent 字段和历史行。

- [ ] **Step 1: 写 schema 合约失败测试**

~~~ts
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
  assert.match(schema, /@@unique\(\[learnerId, materialType, materialId, contentVersion\]\)/u);
  assert.match(schema, /@@unique\(\[learnerId, summaryDate, scopeType, scopeKey\]\)/u);
});

test("学习分析迁移只做增量变更", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.doesNotMatch(sql, /DROP TABLE|DROP TYPE|TRUNCATE|DELETE FROM/iu);
  assert.match(sql, /CREATE TABLE "learner_learning_sessions"/u);
  assert.match(sql, /CREATE TABLE "learner_learning_time_slices"/u);
});
~~~

- [ ] **Step 2: 运行测试确认因模型和迁移不存在而失败**

Run:

~~~bash
pnpm --filter @xueleai/database exec node --import tsx --test prisma/learner-learning-schema-contract.test.ts
~~~

Expected: FAIL，提示缺少 LearnerLearningSession 或 migration.sql。

- [ ] **Step 3: 在 Prisma schema 增加枚举和模型**

模型必须包含以下稳定字段和唯一键：

~~~prisma
enum LearnerLearningStatus {
  NOT_STARTED
  IN_PROGRESS
  COMPLETED
}

enum LearnerLearningSignal {
  INTERACTION
  MEDIA_PLAYING
  PRACTICE
  READ_ALONG
  FLASHCARD
}

enum LearnerLearningSessionEndReason {
  LEFT
  PROFILE_SWITCHED
  SIGNED_OUT
  TIMED_OUT
  AUTHORIZATION_REVOKED
}

enum LearnerLearningSummaryScope {
  TOTAL
  SCENARIO
  COURSE
  RESOURCE
  MATERIAL
  PART
}

model LearnerLearningSession {
  id                String    @id @default(cuid())
  userId            String
  learnerId         String
  profileSessionId  String
  clientSessionKey  String
  startedAt         DateTime  @default(now())
  lastHeartbeatAt   DateTime
  endedAt           DateTime?
  endReason         LearnerLearningSessionEndReason?
  lastSequence      Int       @default(0)
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt
  timeSlices        LearnerLearningTimeSlice[]

  @@unique([profileSessionId, clientSessionKey])
  @@index([learnerId, startedAt])
  @@index([lastHeartbeatAt, endedAt])
  @@map("learner_learning_sessions")
}

model LearnerLearningTimeSlice {
  id                   String   @id @default(cuid())
  userId               String
  learnerId            String
  sessionId            String
  bucketStartedAt      DateTime
  durationSeconds      Int
  isLearning           Boolean
  activitySignal       LearnerLearningSignal
  scenarioId           String?
  courseId             String?
  courseRevisionId     String?
  courseRevisionItemId String?
  resourceType         String?
  resourceId           String?
  materialType         CourseMaterialType?
  materialId           String?
  contentVersion       String?
  partKey              String?
  createdAt            DateTime @default(now())
  updatedAt            DateTime @updatedAt

  @@unique([learnerId, bucketStartedAt])
  @@index([learnerId, bucketStartedAt])
  @@index([courseId, bucketStartedAt])
  @@index([materialType, materialId, bucketStartedAt])
  @@map("learner_learning_time_slices")
}
~~~

材料进度、部分进度和每日汇总使用以下字段：

~~~prisma
model LearnerMaterialProgress {
  id                 String                @id @default(cuid())
  userId             String
  learnerId          String
  materialType       CourseMaterialType
  materialId         String
  contentVersion     String
  status             LearnerLearningStatus @default(NOT_STARTED)
  progressPercent    Int                   @default(0)
  activeStudySeconds Int                   @default(0)
  firstStartedAt     DateTime?
  lastStudiedAt      DateTime?
  completedAt        DateTime?
  studyCount         Int                   @default(0)
  completionCount    Int                   @default(0)
  lastPosition       Json?
  progressData       Json?
  createdAt          DateTime              @default(now())
  updatedAt          DateTime              @updatedAt
  parts              LearnerMaterialPartProgress[]

  @@unique([learnerId, materialType, materialId, contentVersion])
  @@index([userId, learnerId, lastStudiedAt])
  @@index([materialType, materialId])
  @@map("learner_material_progress")
}

model LearnerMaterialPartProgress {
  id                 String                @id @default(cuid())
  materialProgressId String
  partKey            String
  status             LearnerLearningStatus @default(NOT_STARTED)
  progressPercent    Int                   @default(0)
  activeStudySeconds Int                   @default(0)
  firstStartedAt     DateTime?
  lastStudiedAt      DateTime?
  completedAt        DateTime?
  progressData       Json?
  metrics            Json?
  createdAt          DateTime              @default(now())
  updatedAt          DateTime              @updatedAt
  materialProgress   LearnerMaterialProgress @relation(fields: [materialProgressId], references: [id], onDelete: Cascade)

  @@unique([materialProgressId, partKey])
  @@index([partKey, lastStudiedAt])
  @@map("learner_material_part_progress")
}

model LearnerDailyLearningSummary {
  id                     String                      @id @default(cuid())
  userId                 String
  learnerId              String
  summaryDate            DateTime                    @db.Date
  scopeType              LearnerLearningSummaryScope
  scopeKey               String
  scenarioId             String?
  courseId               String?
  resourceType           String?
  resourceId             String?
  materialType           CourseMaterialType?
  materialId             String?
  partKey                String?
  onlineSeconds          Int                         @default(0)
  studySeconds           Int                         @default(0)
  meaningfulActionCount  Int                         @default(0)
  startedMaterialCount   Int                         @default(0)
  completedPartCount     Int                         @default(0)
  completedMaterialCount Int                         @default(0)
  practiceSubmittedCount Int                         @default(0)
  practiceCorrectCount   Int                         @default(0)
  readAlongCompletedCount Int                        @default(0)
  flashcardReviewedCount Int                         @default(0)
  createdAt              DateTime                    @default(now())
  updatedAt              DateTime                    @updatedAt

  @@unique([learnerId, summaryDate, scopeType, scopeKey])
  @@index([userId, learnerId, summaryDate])
  @@index([courseId, summaryDate])
  @@index([materialType, materialId, summaryDate])
  @@map("learner_daily_learning_summaries")
}
~~~

为 Session 和 TimeSlice 增加 user、learner、profileSession、session 的显式 Prisma relation；user、learner、profileSession 使用 Restrict，TimeSlice 到 Session 使用 Cascade。为 User、Learner、RefreshToken 增加对应反向数组。外部课程、材料和部分 ID 只作为经过服务端校验的上下文保存，不建立会随内容删除而级联历史统计的外键。

- [ ] **Step 4: 扩展 LearnerActivityEvent**

新增事件枚举：

~~~prisma
MATERIAL_STARTED
MEDIA_PROGRESS
NODE_LEARNED
PRACTICE_SUBMITTED
READ_ALONG_COMPLETED
FLASHCARD_REVIEWED
PART_COMPLETED
MATERIAL_COMPLETED
~~~

新增可空上下文字段 courseRevisionId、courseRevisionItemId、materialType、materialId、contentVersion、partKey、itemKey，并增加 learnerId + materialType + materialId + occurredAt 索引。itemKey 只保存服务端已验证的节点、题目、句子、cue 或卡片稳定 ID。保留已有事件枚举和列。

- [ ] **Step 5: 生成 migration 并人工检查**

Run:

~~~bash
pnpm db:migrate --name learner_learning_analytics
pnpm db:generate
~~~

Expected: 新迁移目录名为 20260819110000_learner_learning_analytics；SQL 不含 DROP、TRUNCATE、DELETE 和现有列重写。

- [ ] **Step 6: 运行数据库验证**

Run:

~~~bash
pnpm --filter @xueleai/database test
pnpm --filter @xueleai/database build
~~~

Expected: PASS，Prisma Client 生成后 TypeScript 构建成功。

- [ ] **Step 7: 提交**

~~~bash
git add packages/database/prisma/schema.prisma packages/database/prisma/migrations/20260819110000_learner_learning_analytics/migration.sql packages/database/prisma/learner-learning-schema-contract.test.ts
git commit -m "feat(database): add learner learning analytics schema"
~~~

### Task 2: 服务端时间口径纯函数

**Files:**
- Create: apps/api-core/src/learner-learning/learner-learning.constants.ts
- Create: apps/api-core/src/learner-learning/learner-learning.types.ts
- Create: apps/api-core/src/learner-learning/learner-learning-time.ts
- Create: apps/api-core/tests/learner-learning-time.test.ts

**Interfaces:**
- Produces: heartbeatIsActive(input, now): boolean
- Produces: heartbeatDeltaSeconds(previousAt, now): number
- Produces: canonicalBucketStart(now): Date
- Produces: shanghaiDateKey(now): string
- Produces: preferTimeSlice(current, candidate): TimeSliceCandidate

- [ ] **Step 1: 写时间规则失败测试**

~~~ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalBucketStart,
  heartbeatDeltaSeconds,
  heartbeatIsActive,
  shanghaiDateKey
} from "../src/learner-learning/learner-learning-time.js";

test("空闲 120 秒、页面隐藏和失焦停止计时，媒体播放可维持活动", () => {
  const now = new Date("2026-08-19T08:00:00.000Z");
  const base = {
    pageVisible: true,
    hasFocus: true,
    mediaPlaying: false,
    lastInteractionAt: "2026-08-19T07:59:00.000Z"
  };
  assert.equal(heartbeatIsActive(base, now), true);
  assert.equal(heartbeatIsActive({ ...base, pageVisible: false }, now), false);
  assert.equal(heartbeatIsActive({ ...base, hasFocus: false }, now), false);
  assert.equal(heartbeatIsActive({ ...base, hasFocus: false, mediaPlaying: true }, now), true);
  assert.equal(heartbeatIsActive({ ...base, lastInteractionAt: "2026-08-19T07:57:59.000Z" }, now), false);
});

test("心跳最多增加 30 秒并按北京时间分日", () => {
  assert.equal(
    heartbeatDeltaSeconds(new Date("2026-08-19T07:59:00.000Z"), new Date("2026-08-19T08:01:00.000Z")),
    30
  );
  assert.equal(
    canonicalBucketStart(new Date("2026-08-19T08:00:44.000Z")).toISOString(),
    "2026-08-19T08:00:30.000Z"
  );
  assert.equal(shanghaiDateKey(new Date("2026-08-18T16:00:01.000Z")), "2026-08-19");
});
~~~

- [ ] **Step 2: 运行测试确认模块不存在**

Run:

~~~bash
pnpm --filter @xueleai/api-core exec node --import tsx --test tests/learner-learning-time.test.ts
~~~

Expected: FAIL with ERR_MODULE_NOT_FOUND。

- [ ] **Step 3: 实现常量和纯函数**

~~~ts
export const learnerHeartbeatSeconds = 30;
export const learnerIdleSeconds = 120;
export const learnerRawRetentionDays = 180;
export const learnerLearningTimeZone = "Asia/Shanghai";

export function heartbeatDeltaSeconds(previousAt: Date, now: Date) {
  const elapsed = Math.floor((now.getTime() - previousAt.getTime()) / 1000);
  return Math.max(0, Math.min(learnerHeartbeatSeconds, elapsed));
}

export function canonicalBucketStart(now: Date) {
  const size = learnerHeartbeatSeconds * 1000;
  return new Date(Math.floor(now.getTime() / size) * size);
}
~~~

heartbeatIsActive 必须拒绝未来交互时间和超过 120 秒的时间；preferTimeSlice 使用 PRACTICE、READ_ALONG、FLASHCARD、MEDIA_PLAYING、INTERACTION 的固定优先级，相同优先级选择较新的服务端接收记录。

- [ ] **Step 4: 增加边界测试并运行**

增加以下边界断言：

~~~ts
assert.equal(heartbeatIsActive({
  pageVisible: true,
  hasFocus: true,
  mediaPlaying: false,
  lastInteractionAt: "2026-08-19T07:58:00.001Z"
}, new Date("2026-08-19T08:00:00.000Z")), true);
assert.equal(heartbeatIsActive({
  pageVisible: true,
  hasFocus: true,
  mediaPlaying: false,
  lastInteractionAt: "2026-08-19T07:57:59.999Z"
}, new Date("2026-08-19T08:00:00.000Z")), false);
assert.equal(heartbeatDeltaSeconds(
  new Date("2026-08-19T08:00:01.000Z"),
  new Date("2026-08-19T08:00:00.000Z")
), 0);
assert.equal(shanghaiDateKey(new Date("2026-08-19T15:59:59.000Z")), "2026-08-19");
assert.equal(shanghaiDateKey(new Date("2026-08-19T16:00:01.000Z")), "2026-08-20");
assert.equal(
  preferTimeSlice(
    {
      activitySignal: "INTERACTION",
      receivedAt: new Date("2026-08-19T08:00:10.000Z")
    },
    {
      activitySignal: "PRACTICE",
      receivedAt: new Date("2026-08-19T08:00:09.000Z")
    }
  ).activitySignal,
  "PRACTICE"
);
~~~

Run:

~~~bash
pnpm --filter @xueleai/api-core exec node --import tsx --test tests/learner-learning-time.test.ts
~~~

Expected: PASS。

- [ ] **Step 5: 提交**

~~~bash
git add apps/api-core/src/learner-learning/learner-learning.constants.ts apps/api-core/src/learner-learning/learner-learning.types.ts apps/api-core/src/learner-learning/learner-learning-time.ts apps/api-core/tests/learner-learning-time.test.ts
git commit -m "feat(api): define learner learning time rules"
~~~

### Task 3: 会话、上下文校验与心跳 API

**Files:**
- Create: apps/api-core/src/learner-learning/dto/learner-learning.dto.ts
- Create: apps/api-core/src/learner-learning/learner-learning-context.service.ts
- Create: apps/api-core/src/learner-learning/learner-learning-session.service.ts
- Create: apps/api-core/src/learner-learning/learner-learning.controller.ts
- Create: apps/api-core/src/learner-learning/learner-learning.module.ts
- Create: apps/api-core/tests/helpers/learner-learning-fixture.ts
- Create: apps/api-core/tests/learner-learning-session.test.ts
- Modify: apps/api-core/src/profiles/profile-context.service.ts
- Modify: apps/api-core/src/profiles/profiles.module.ts
- Modify: apps/api-core/src/app.module.ts

**Interfaces:**
- Produces: ProfileContextService.requireSelectedSession(request, userId): Promise<{ subject: ProfileSubject; refreshTokenId: string }>
- Produces: LearnerLearningContextService.resolve(subject, input): Promise<ResolvedLearningContext>
- Produces: LearnerLearningSessionService.start(subject, refreshTokenId, dto, now)
- Produces: LearnerLearningSessionService.heartbeat(subject, refreshTokenId, sessionId, dto, now)
- Produces: POST /profiles/learner/learning/sessions
- Produces: POST /profiles/learner/learning/sessions/:id/heartbeat
- Produces: POST /profiles/learner/learning/sessions/:id/end
- Produces: createSessionFixture(options)、activeHeartbeat(sequence)、subject、accountSubject、now 测试工具。
- Produces: learnerLearningEnabled(env): boolean，只有 LEARNER_LEARNING_ENABLED === "1" 时为真。

- [ ] **Step 1: 写可信身份和心跳失败测试**

~~~ts
import {
  accountSubject,
  activeHeartbeat,
  createSessionFixture,
  now,
  subject
} from "./helpers/learner-learning-fixture.js";

test("会话所有权来自 ProfileSubject 且相同时间桶不叠加", async () => {
  const fixture = createSessionFixture();
  const session = await fixture.service.start(
    { userId: "user-1", learnerId: "learner-1", mode: "LEARNER" },
    "refresh-1",
    { clientSessionKey: "client-1" },
    new Date("2026-08-19T08:00:00.000Z")
  );

  await fixture.service.heartbeat(
    { userId: "user-1", learnerId: "learner-1", mode: "LEARNER" },
    "refresh-1",
    session.id,
    activeHeartbeat(1),
    new Date("2026-08-19T08:00:30.000Z")
  );
  await fixture.service.heartbeat(
    { userId: "user-1", learnerId: "learner-1", mode: "LEARNER" },
    "refresh-1",
    session.id,
    activeHeartbeat(2),
    new Date("2026-08-19T08:00:35.000Z")
  );

  assert.equal(fixture.timeSlices.length, 1);
  assert.equal(fixture.timeSlices[0]?.durationSeconds, 30);
  assert.equal(fixture.timeSlices[0]?.learnerId, "learner-1");
});
~~~

测试 helper 固定导出以下类型，内部用数组实现 Prisma 的 findUnique、findFirst、upsert、update 和 transaction，所有测试时间由 now 参数传入，不调用真实系统时钟：

~~~ts
export interface SessionFixtureOptions {
  endedAt?: Date | null;
  authorizedCourseId?: string;
  approvedItemId?: string;
}

export interface SessionFixture {
  context: LearnerLearningContextService;
  service: LearnerLearningSessionService;
  sessions: Array<Record<string, unknown>>;
  timeSlices: Array<{
    learnerId: string;
    bucketStartedAt: Date;
    durationSeconds: number;
  }>;
}

export const subject = {
  userId: "user-1",
  learnerId: "learner-1",
  mode: "LEARNER"
} as const;
export const accountSubject = {
  userId: "user-1",
  learnerId: null,
  mode: "ACCOUNT"
} as const;
export const now = new Date("2026-08-19T08:00:30.000Z");

export function activeHeartbeat(sequence: number) {
  return {
    sequence,
    clientSentAt: now.toISOString(),
    pageVisible: true,
    hasFocus: true,
    mediaPlaying: false,
    lastInteractionAt: now.toISOString(),
    context: { isLearning: false }
  };
}
~~~

同文件写入以下独立测试，测试本地 fixture 明确提供 sessions、timeSlices、courseAuthorizations 和 courseRevisionItems 四个内存集合：

~~~ts
test("错误 refresh session 不能继续已有学习会话", async () => {
  const fixture = createSessionFixture();
  await assert.rejects(
    () => fixture.service.heartbeat(subject, "refresh-forged", "session-1", activeHeartbeat(1), now),
    (error: unknown) => error instanceof AppException && error.code === 40301
  );
});

test("账号身份和已结束会话不能写学习时间", async () => {
  const fixture = createSessionFixture({ endedAt: new Date("2026-08-19T07:59:00.000Z") });
  await assert.rejects(
    () => fixture.service.heartbeat(accountSubject, "refresh-1", "session-1", activeHeartbeat(1), now)
  );
  await assert.rejects(
    () => fixture.service.heartbeat(subject, "refresh-1", "session-1", activeHeartbeat(1), now)
  );
  assert.equal(fixture.timeSlices.length, 0);
});

test("课程项必须属于当前授权课程的已批准版本", async () => {
  const fixture = createSessionFixture({
    authorizedCourseId: "course-1",
    approvedItemId: "item-1"
  });
  await assert.rejects(
    () => fixture.context.resolve(subject, {
      isLearning: true,
      courseId: "course-1",
      courseRevisionItemId: "item-of-other-course",
      materialType: "VIDEO_GUIDE",
      materialId: "video-1"
    }),
    (error: unknown) => error instanceof AppException && error.code === 40004
  );
});

test("重复和未来 sequence 不增加时间", async () => {
  const fixture = createSessionFixture();
  await fixture.service.heartbeat(subject, "refresh-1", "session-1", activeHeartbeat(2), now);
  await assert.rejects(
    () => fixture.service.heartbeat(subject, "refresh-1", "session-1", activeHeartbeat(2), now)
  );
  await assert.rejects(
    () => fixture.service.heartbeat(
      subject,
      "refresh-1",
      "session-1",
      { ...activeHeartbeat(3), clientSentAt: "2026-08-20T08:00:00.000Z" },
      now
    )
  );
  assert.equal(fixture.timeSlices.length, 1);
});
~~~

- [ ] **Step 2: 运行测试确认服务不存在**

Run:

~~~bash
pnpm --filter @xueleai/api-core exec node --import tsx --test tests/learner-learning-session.test.ts
~~~

Expected: FAIL with ERR_MODULE_NOT_FOUND。

- [ ] **Step 3: 增加严格 DTO**

~~~ts
export class StartLearnerLearningSessionDto {
  @IsString()
  @Length(16, 80)
  clientSessionKey!: string;
}

export class LearnerLearningContextDto {
  @IsBoolean()
  isLearning!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  courseId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  courseRevisionItemId?: string;

  @IsOptional()
  @IsIn(["VIDEO_GUIDE", "ENGLISH_GUIDED_STUDY", "LEARNING_FLASHCARD"])
  materialType?: "VIDEO_GUIDE" | "ENGLISH_GUIDED_STUDY" | "LEARNING_FLASHCARD";

  @IsOptional()
  @IsString()
  @MaxLength(128)
  materialId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  partKey?: string;
}
~~~

Heartbeat DTO 增加 sequence 正安全整数、clientSentAt ISO 时间、pageVisible、hasFocus、mediaPlaying、lastInteractionAt 和 context。DTO 不包含 userId、learnerId、durationSeconds、progressPercent、isCorrect 或 completed。

- [ ] **Step 4: 实现可信 refresh session 读取**

在 ProfileContextService 中复用现有 requireUserRefreshSession 和 resolveSelectedSubject：

~~~ts
async requireSelectedSession(request: RequestLike, userId: string) {
  const session = await this.authService.requireUserRefreshSession(request, userId);
  if (session.profileMode === "UNSELECTED") {
    throw new AppException(40301, "请先选择使用身份", HttpStatus.FORBIDDEN);
  }
  return {
    subject: await this.resolveSelectedSubject(request, userId, session),
    refreshTokenId: session.id
  };
}
~~~

从 ProfilesModule 导出 ProfileContextService。

- [ ] **Step 5: 实现上下文解析**

ResolvedLearningContext 固定为：

~~~ts
export interface ResolvedLearningContext {
  isLearning: boolean;
  scenarioId: string | null;
  courseId: string | null;
  courseRevisionId: string | null;
  courseRevisionItemId: string | null;
  resourceType: string | null;
  resourceId: string | null;
  materialType: "VIDEO_GUIDE" | "ENGLISH_GUIDED_STUDY" | "LEARNING_FLASHCARD" | null;
  materialId: string | null;
  contentVersion: string | null;
  partKey: string | null;
}
~~~

有 courseId 时调用 LearnerAccessService.assertCourseAuthorized，再从当前 approvedRevision 查询 courseRevisionItemId，服务端解析材料 ID 和 publication.approvedHash。有材料但无课程时，根据材料类型分别验证 video-guide-narration、english-guided-study-material 或 learning-flashcards-deck 场景授权，并从数据库解析实际材料和当前安全版本。任一关系不匹配返回中文 40301 或 40004。

- [ ] **Step 6: 实现会话事务**

start 使用 profileSessionId + clientSessionKey upsert。heartbeat 在事务中：

1. 锁定并验证 session 的 userId、learnerId、profileSessionId 和 endedAt。
2. 无论活动是否有效都更新 lastHeartbeatAt 和 lastSequence，防止网络恢复补时。
3. 使用服务端 now 与上次心跳计算 0–30 秒。
4. 仅 heartbeatIsActive 为真时写入规范时间桶。
5. 同桶冲突调用 preferTimeSlice，durationSeconds 取较大值而不是相加。
6. 跨北京时间零点时拆成两段。

- [ ] **Step 7: 装配控制器与模块**

Controller 先调用 learnerLearningEnabled；关闭时返回中文 40401“学习记录功能暂未开放”，且不创建任何行。启用后统一先调用 AuthService.me，再调用 requireSelectedSession，并拒绝非 LEARNER 主体。结束接口只允许 LEFT，身份切换和超时原因由服务端产生。LearnerLearningModule 导入 ProfilesModule并在 AppModule 注册。

- [ ] **Step 8: 运行针对性测试和类型检查**

Run:

~~~bash
pnpm --filter @xueleai/database build
pnpm --filter @xueleai/api-core exec node --import tsx --test tests/profile-context-service.test.ts tests/learner-learning-session.test.ts
pnpm --filter @xueleai/api-core typecheck
~~~

Expected: PASS。

- [ ] **Step 9: 提交**

~~~bash
git add apps/api-core/src/learner-learning apps/api-core/src/profiles/profile-context.service.ts apps/api-core/src/profiles/profiles.module.ts apps/api-core/src/app.module.ts apps/api-core/tests/helpers/learner-learning-fixture.ts apps/api-core/tests/learner-learning-session.test.ts
git commit -m "feat(api): collect learner learning sessions"
~~~

### Task 4: Web 统一采集器

**Files:**
- Create: apps/web/src/lib/learner-learning-types.ts
- Create: apps/web/src/lib/learner-learning-client.ts
- Create: apps/web/src/lib/learner-learning-tracker.ts
- Create: apps/web/src/components/learning/learner-learning-provider.tsx
- Create: apps/web/src/app/api/profiles/learner/learning/[...segments]/route.ts
- Create: apps/web/tests/learner-learning-tracker.test.ts
- Modify: apps/web/src/components/shell/learner-shell.tsx
- Modify: apps/web/src/components/shell/public-shell.tsx
- Modify: .env.example
- Modify: .env.production.example

**Interfaces:**
- Produces: LearningContext、LearningEventInput Web 类型。
- Produces: createLearningTracker(options): LearningTracker。
- Produces: LearnerLearningProvider({ children, enabled, context }).
- Produces: window CustomEvent 名 xueleai:learning-context 和 xueleai:learning-event。
- Consumes: LEARNER_LEARNING_ENABLED 服务端环境开关。

类型固定为：

~~~ts
export type LearningMaterialType =
  | "VIDEO_GUIDE"
  | "ENGLISH_GUIDED_STUDY"
  | "LEARNING_FLASHCARD";

export interface LearningContext {
  isLearning: boolean;
  scenarioId?: string;
  courseId?: string;
  courseRevisionItemId?: string;
  resourceType?: string;
  resourceId?: string;
  materialType?: LearningMaterialType;
  materialId?: string;
  partKey?: string;
}

export type LearningEventInput =
  | { type: "MATERIAL_STARTED"; partKey: string }
  | { type: "MEDIA_PROGRESS"; partKey: string; startSeconds: number; endSeconds: number; mediaDurationSeconds: number }
  | { type: "NODE_LEARNED"; partKey: string; itemId: string }
  | { type: "PRACTICE_SUBMITTED"; partKey: string; itemId: string; selectedIndex: number }
  | { type: "READ_ALONG_COMPLETED"; partKey: string; itemId: string }
  | { type: "FLASHCARD_REVIEWED"; partKey: "FLASHCARD_ROUND"; reviewId: string };

export interface LearningTracker {
  start(): Promise<void>;
  stop(): Promise<void>;
  recordInteraction(at: Date): void;
  updateContext(context: LearningContext): void;
  enqueue(event: LearningEventInput): void;
}
~~~

- [ ] **Step 1: 写采集状态机失败测试**

~~~ts
test("采集器隐藏和空闲后停止心跳，恢复交互后继续", () => {
  const state = createTrackerState(new Date("2026-08-19T08:00:00.000Z"));
  assert.equal(heartbeatPayload(state, new Date("2026-08-19T08:01:59.000Z")).pageVisible, true);
  assert.equal(heartbeatPayload(state, new Date("2026-08-19T08:02:01.000Z")).active, false);
  const resumed = recordInteraction(state, new Date("2026-08-19T08:02:02.000Z"));
  assert.equal(heartbeatPayload(resumed, new Date("2026-08-19T08:02:03.000Z")).active, true);
});

test("事件序号单调递增且重试保持同一事件 ID", () => {
  const first = nextLearningEvent(emptyEventQueue(), { type: "MATERIAL_STARTED" });
  const retry = retryLearningEvent(first.queue, first.event.eventId);
  assert.equal(first.event.sequence, 1);
  assert.equal(retry?.eventId, first.event.eventId);
  assert.equal(retry?.sequence, 1);
});
~~~

- [ ] **Step 2: 运行测试确认模块不存在**

Run:

~~~bash
pnpm --filter @xueleai/web exec node --import tsx --test tests/learner-learning-tracker.test.ts
~~~

Expected: FAIL with ERR_MODULE_NOT_FOUND。

- [ ] **Step 3: 实现客户端 API 和受限代理**

客户端只请求同源路径：

~~~ts
export function startLearningSession(clientSessionKey: string) {
  return learningFetch<{ id: string }>("/api/profiles/learner/learning/sessions", {
    method: "POST",
    body: JSON.stringify({ clientSessionKey })
  });
}
~~~

learningFetch 的实现固定为：

~~~ts
async function learningFetch<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init.headers },
    credentials: "same-origin",
    keepalive: init.keepalive
  });
  const payload = await response.json() as {
    code: number;
    message: string;
    data: T | null;
  };
  if (!response.ok || payload.code !== 0 || payload.data === null) {
    throw new Error(payload.message || "学习记录同步失败，请稍后重试");
  }
  return payload.data;
}
~~~

Catch-all Route Handler 只允许以下段和 POST 方法：

~~~ts
const allowed = [
  /^sessions$/u,
  /^sessions\/[^/]+\/heartbeat$/u,
  /^sessions\/[^/]+\/events$/u,
  /^sessions\/[^/]+\/end$/u
];
~~~

代理转发 Cookie，不记录请求体，不把 NestJS 内部错误直接返回；网络失败返回统一中文响应。

- [ ] **Step 4: 实现标签页选举与重试队列**

使用 BroadcastChannel 名 xueleai-learner-learning。每个标签生成稳定 clientSessionKey；最早活动且可见的标签为 leader。sessionStorage 队列最多 200 个低敏事件，使用 eventId 幂等重试；退避为 1、2、4、8、16 秒，上限 30 秒。离线心跳丢弃，不补算在线时间；明确业务事件联网后重试。

- [ ] **Step 5: 实现 Provider**

Provider 监听 visibilitychange、focus、blur、pointerdown、keydown、scroll、route context 事件；30 秒心跳。mediaPlaying 为真时即使窗口失焦仍可保持活动。卸载时使用 keepalive 请求结束会话，但服务端不依赖该请求保证正确性。

Provider 暴露以下事件助手：

~~~ts
export function publishLearningContext(context: LearningContext) {
  window.dispatchEvent(new CustomEvent("xueleai:learning-context", { detail: context }));
}

export function publishLearningEvent(event: LearningEventInput) {
  window.dispatchEvent(new CustomEvent("xueleai:learning-event", { detail: event }));
}
~~~

- [ ] **Step 6: 挂载到两个 Shell并增加发布开关**

LearnerShell 和 PublicShell 都读取服务端 LEARNER_LEARNING_ENABLED。只有开关为 1 且 profile.mode === "LEARNER" 时 enabled；ACCOUNT、GUEST 和开关关闭时不创建会话。两个 Shell 都只挂载一个 Provider。

开发示例启用，生产示例默认关闭，完成迁移和回填演练后再打开：

~~~dotenv
# .env.example
LEARNER_LEARNING_ENABLED="1"

# .env.production.example
LEARNER_LEARNING_ENABLED="0"
~~~

- [ ] **Step 7: 运行测试和类型检查**

Run:

~~~bash
pnpm --filter @xueleai/web exec node --import tsx --test tests/learner-learning-tracker.test.ts tests/profile-presentation.test.ts tests/learner-public-header.test.ts
pnpm --filter @xueleai/web typecheck
~~~

Expected: PASS。

- [ ] **Step 8: 提交**

~~~bash
git add apps/web/src/lib/learner-learning-types.ts apps/web/src/lib/learner-learning-client.ts apps/web/src/lib/learner-learning-tracker.ts apps/web/src/components/learning/learner-learning-provider.tsx apps/web/src/app/api/profiles/learner/learning apps/web/src/components/shell/learner-shell.tsx apps/web/src/components/shell/public-shell.tsx apps/web/tests/learner-learning-tracker.test.ts .env.example .env.production.example
git commit -m "feat(web): track learner active sessions"
~~~

### Task 5: 基础概览与学习中心时长

**Files:**
- Create: apps/api-core/src/learner-learning/learner-learning-query.service.ts
- Create: apps/api-core/tests/learner-learning-query.test.ts
- Create: apps/web/src/lib/learner-learning-api.ts
- Create: apps/web/src/components/learning/learning-trend.tsx
- Create: apps/web/tests/learner-learning-center.test.ts
- Modify: apps/api-core/src/learner-learning/learner-learning.controller.ts
- Modify: apps/api-core/src/learner-learning/learner-learning.module.ts
- Modify: apps/web/src/components/profiles/learner-center.tsx
- Modify: apps/web/src/app/learn/center/page.tsx
- Modify: apps/web/src/lib/profile-api.ts

**Interfaces:**
- Produces: GET /profiles/learner/learning/overview?from=YYYY-MM-DD&to=YYYY-MM-DD
- Produces: LearnerLearningOverview，包含 totals、daily、recentMaterials。
- Preserves: GET /profiles/learner/statistics，暂不删除以避免未完成页面断裂。

- [ ] **Step 1: 写查询口径失败测试**

~~~ts
test("概览总计使用规范时间片且返回连续日期", async () => {
  const result = await service.getOverview({
    userId: "user-1",
    learnerId: "learner-1",
    from: "2026-08-17",
    to: "2026-08-19"
  });
  assert.deepEqual(result.totals, {
    onlineSeconds: 180,
    studySeconds: 120,
    learningDays: 2,
    startedMaterialCount: 0,
    completedMaterialCount: 0
  });
  assert.deepEqual(result.daily.map((day) => day.date), [
    "2026-08-17",
    "2026-08-18",
    "2026-08-19"
  ]);
});
~~~

增加以下日期和隔离断言：

~~~ts
await assert.rejects(() => service.getOverview({
  userId: "user-1",
  learnerId: "learner-1",
  from: "2025-08-18",
  to: "2026-08-19"
}));
await assert.rejects(() => service.getOverview({
  userId: "user-1",
  learnerId: "learner-1",
  from: "2026-08-20",
  to: "2026-08-19"
}));
const isolated = await service.getOverview({
  userId: "user-1",
  learnerId: "learner-1",
  from: "2026-08-19",
  to: "2026-08-19"
});
assert.equal(isolated.totals.onlineSeconds, 30);
assert.equal(isolated.totals.studySeconds, 0);
assert.equal(isolated.totals.completionRate, null);
~~~

- [ ] **Step 2: 运行测试确认失败**

Run:

~~~bash
pnpm --filter @xueleai/api-core exec node --import tsx --test tests/learner-learning-query.test.ts
~~~

Expected: FAIL with service module not found。

- [ ] **Step 3: 实现概览查询**

当天读取规范时间片，历史优先读取 TOTAL 每日汇总；结果固定为：

~~~ts
export interface LearnerLearningOverview {
  range: { from: string; to: string };
  totals: {
    onlineSeconds: number;
    studySeconds: number;
    learningDays: number;
    startedMaterialCount: number;
    completedMaterialCount: number;
    completionRate: number | null;
  };
  daily: Array<{
    date: string;
    onlineSeconds: number;
    studySeconds: number;
  }>;
  recentMaterials: LearnerMaterialSummary[];
}

export interface LearnerMaterialSummary {
  materialType: "VIDEO_GUIDE" | "ENGLISH_GUIDED_STUDY" | "LEARNING_FLASHCARD";
  materialId: string;
  title: string;
  status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
  progressPercent: number;
  activeStudySeconds: number;
  lastStudiedAt: string;
  course: { id: string; name: string } | null;
  continueHref: string;
  detailHref: string;
}
~~~

查询必须同时限定 userId 和 learnerId。当前没有进度数据时 recentMaterials 返回空数组。

- [ ] **Step 4: 增加学习者概览接口**

Controller 使用当前 LEARNER subject，日期默认最近 7 个北京时间自然日。查询参数只接受 YYYY-MM-DD。

- [ ] **Step 5: 更新 Web 类型和学习中心**

删除旧卡片“累计完成活动、近 7 天完成活动、最近活动”，替换为：

- 今日有效在线时长
- 今日学习时长
- 本周学习天数
- 已学习课件数
- 已完成课件数
- 最近 7 天学习趋势

formatDuration 使用小时和分钟，少于 1 分钟显示“少于 1 分钟”，零显示“0 分钟”。趋势使用 CSS 宽度/高度，不增加图表依赖，并为每天提供可读文本。

- [ ] **Step 6: 运行 Phase 1 验证**

Run:

~~~bash
pnpm --filter @xueleai/api-core exec node --import tsx --test tests/learner-learning-time.test.ts tests/learner-learning-session.test.ts tests/learner-learning-query.test.ts
pnpm --filter @xueleai/web exec node --import tsx --test tests/learner-learning-tracker.test.ts tests/learner-learning-center.test.ts tests/profile-presentation.test.ts
pnpm --filter @xueleai/api-core typecheck
pnpm --filter @xueleai/web typecheck
~~~

Expected: PASS。浏览器验收 /learn/center 能在一个心跳周期内显示今日时长；隐藏页面和空闲 2 分钟后不继续增加。

- [ ] **Step 7: 提交**

~~~bash
git add apps/api-core/src/learner-learning/learner-learning-query.service.ts apps/api-core/src/learner-learning/learner-learning.controller.ts apps/api-core/src/learner-learning/learner-learning.module.ts apps/api-core/tests/learner-learning-query.test.ts apps/web/src/lib/learner-learning-api.ts apps/web/src/lib/profile-api.ts apps/web/src/components/learning/learning-trend.tsx apps/web/src/components/profiles/learner-center.tsx apps/web/src/app/learn/center/page.tsx apps/web/tests/learner-learning-center.test.ts
git commit -m "feat: show learner online and study time"
~~~

## Phase 2：三类课件分段进度

### Task 6: 课件进度纯函数

**Files:**
- Create: apps/api-core/src/learner-learning/learner-learning-progress.ts
- Create: apps/api-core/tests/learner-learning-progress.test.ts

**Interfaces:**
- Produces: mergePlaybackRanges(current, incoming): PlaybackRange[]
- Produces: coveragePercent(ranges, durationSeconds): number
- Produces: mergeStableIds(current, incoming, allowed): string[]
- Produces: evaluatePartProgress(input): PartProgressResult
- Produces: evaluateMaterialProgress(parts): MaterialProgressResult
- Produces: materialProgressKey(learnerId, materialType, materialId, contentVersion): string
- Produces: learningSecondsForPlayback(input): number

类型固定为：

~~~ts
export interface PlaybackRange {
  startSeconds: number;
  endSeconds: number;
}

export interface PartProgressResult {
  status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
  progressPercent: number;
}

export interface MaterialProgressResult {
  status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
  progressPercent: number;
}
~~~

- [ ] **Step 1: 写三类课件规则失败测试**

~~~ts
test("播放区间按并集合并，拖到结尾不等于完整播放", () => {
  const ranges = mergePlaybackRanges([], [
    { startSeconds: 0, endSeconds: 20 },
    { startSeconds: 15, endSeconds: 30 },
    { startSeconds: 90, endSeconds: 100 }
  ]);
  assert.deepEqual(ranges, [
    { startSeconds: 0, endSeconds: 30 },
    { startSeconds: 90, endSeconds: 100 }
  ]);
  assert.equal(coveragePercent(ranges, 100), 40);
});

test("媒体和跟读达到 80%，练习全部提交，闪卡完成全轮", () => {
  assert.equal(evaluatePartProgress({ kind: "COVERAGE", completed: 8, total: 10 }).status, "COMPLETED");
  assert.equal(evaluatePartProgress({ kind: "PRACTICE", completed: 9, total: 10 }).status, "IN_PROGRESS");
  assert.equal(evaluatePartProgress({ kind: "FLASHCARD_ROUND", completed: 10, total: 10 }).status, "COMPLETED");
});

test("总体完成要求所有实际存在部分完成", () => {
  const result = evaluateMaterialProgress([
    { status: "COMPLETED", progressPercent: 100 },
    { status: "IN_PROGRESS", progressPercent: 80 }
  ]);
  assert.equal(result.status, "IN_PROGRESS");
  assert.equal(result.progressPercent, 90);
});
~~~

- [ ] **Step 2: 运行测试确认失败**

Run:

~~~bash
pnpm --filter @xueleai/api-core exec node --import tsx --test tests/learner-learning-progress.test.ts
~~~

Expected: FAIL with ERR_MODULE_NOT_FOUND。

- [ ] **Step 3: 实现区间、稳定 ID 和完成规则**

区间先裁剪到 0–duration，再排序合并；重复播放不增加覆盖率。稳定 ID 集合只接收服务端当前版本 allowed 集合中的值，排序后最多保存当前版本的实际节点数。完成阈值固定：

~~~ts
const coverageCompletionPercent = 80;

export function evaluateMaterialProgress(parts: PartProgressResult[]) {
  if (parts.length === 0) {
    return { status: "NOT_STARTED" as const, progressPercent: 0 };
  }
  const progressPercent = Math.round(
    parts.reduce((total, part) => total + part.progressPercent, 0) / parts.length
  );
  return {
    status: parts.every((part) => part.status === "COMPLETED")
      ? "COMPLETED" as const
      : parts.some((part) => part.progressPercent > 0)
        ? "IN_PROGRESS" as const
        : "NOT_STARTED" as const,
    progressPercent
  };
}
~~~

- [ ] **Step 4: 写倍速、重复、空可选部分和版本隔离断言并运行**

~~~ts
assert.equal(coveragePercent([
  { startSeconds: 0, endSeconds: 80 },
  { startSeconds: 0, endSeconds: 80 }
], 100), 80);
assert.deepEqual(evaluateMaterialProgress([]), {
  status: "NOT_STARTED",
  progressPercent: 0
});
assert.notEqual(
  materialProgressKey("learner-1", "VIDEO_GUIDE", "video-1", "hash-v1"),
  materialProgressKey("learner-1", "VIDEO_GUIDE", "video-1", "hash-v2")
);
assert.equal(
  learningSecondsForPlayback({ wallClockSeconds: 40, playbackRate: 2 }),
  40
);
~~~

Run:

~~~bash
pnpm --filter @xueleai/api-core exec node --import tsx --test tests/learner-learning-progress.test.ts
~~~

Expected: PASS。

- [ ] **Step 5: 提交**

~~~bash
git add apps/api-core/src/learner-learning/learner-learning-progress.ts apps/api-core/tests/learner-learning-progress.test.ts
git commit -m "feat(api): calculate learner material progress"
~~~

### Task 7: 幂等学习事件与服务端进度事务

**Files:**
- Create: apps/api-core/src/learner-learning/learner-learning-event.service.ts
- Create: apps/api-core/tests/learner-learning-events.test.ts
- Modify: apps/api-core/tests/helpers/learner-learning-fixture.ts
- Modify: apps/api-core/src/learner-learning/dto/learner-learning.dto.ts
- Modify: apps/api-core/src/learner-learning/learner-learning.controller.ts
- Modify: apps/api-core/src/learner-learning/learner-learning.module.ts
- Modify: apps/api-core/src/profiles/learner-activity.service.ts

**Interfaces:**
- Produces: LearnerLearningEventService.recordBatch(subject, refreshTokenId, sessionId, dto, now)
- Produces: POST /profiles/learner/learning/sessions/:id/events
- Consumes: LearnerLearningContextService.resolve、mergePlaybackRanges、evaluatePartProgress。
- Produces: createEventFixture() 和 mediaEvent(eventId, startSeconds, endSeconds) 测试工具。

- [ ] **Step 1: 写幂等、服务端判定和版本隔离失败测试**

~~~ts
test("客户端不能提交完成状态或正确率，练习由服务端判定", async () => {
  const fixture = createEventFixture();
  const result = await fixture.service.recordBatch(subject, "refresh-1", "session-1", {
    events: [{
      eventId: "event-000000000001",
      sequence: 1,
      type: "PRACTICE_SUBMITTED",
      occurredAt: "2026-08-19T08:01:00.000Z",
      partKey: "PRACTICE",
      itemId: "question-1",
      selectedIndex: 2
    }]
  }, now);
  assert.equal(result.acceptedCount, 1);
  assert.equal(fixture.events[0]?.metrics.isCorrect, true);
  assert.equal(Object.hasOwn(fixture.events[0]?.metrics ?? {}, "selectedIndex"), false);
});

test("同一 eventId 重试不重复增加进度", async () => {
  const fixture = createEventFixture();
  await fixture.record(mediaEvent("event-000000000002", 0, 30));
  await fixture.record(mediaEvent("event-000000000002", 0, 30));
  assert.equal(fixture.activityEvents.length, 1);
  assert.deepEqual(fixture.partProgress.progressData.playedRanges, [
    { startSeconds: 0, endSeconds: 30 }
  ]);
});
~~~

- [ ] **Step 2: 运行测试确认失败**

Run:

~~~bash
pnpm --filter @xueleai/api-core exec node --import tsx --test tests/learner-learning-events.test.ts
~~~

Expected: FAIL with service module not found。

- [ ] **Step 3: 定义事件 DTO 白名单**

允许事件：

~~~ts
type LearningEventType =
  | "MATERIAL_STARTED"
  | "MEDIA_PROGRESS"
  | "NODE_LEARNED"
  | "PRACTICE_SUBMITTED"
  | "READ_ALONG_COMPLETED"
  | "FLASHCARD_REVIEWED";
~~~

公共字段为 eventId、sequence、occurredAt、partKey。MEDIA_PROGRESS 只允许 startSeconds、endSeconds、mediaDurationSeconds；NODE_LEARNED 和 READ_ALONG_COMPLETED 只允许 itemId；PRACTICE_SUBMITTED 只允许 itemId 和 selectedIndex；FLASHCARD_REVIEWED 只允许 reviewId。批量最多 50 条，正文和最终状态字段无法通过 DTO。

- [ ] **Step 4: 实现原子事件和进度更新**

单个数据库事务执行：

1. 验证 session 归属、refreshTokenId、sequence 和未结束状态。
2. 重新解析授权和当前内容版本。
3. 以 sessionId + eventId 构造 idempotencyKey。
4. 服务端从 approvedSnapshot 或当前可学习内容读取节点、题目、卡片和正确答案。
5. PRACTICE_SUBMITTED 把服务端验证后的 itemId 写入 LearnerActivityEvent.itemKey，只在 metrics 持久化 isCorrect，不持久化 selectedIndex。
6. FLASHCARD_REVIEWED 根据 reviewId 查询 learnerId、deckId、cardId 和 grade。
7. upsert 材料与部分进度，计算状态；首次完成时写 PART_COMPLETED 和 MATERIAL_COMPLETED。
8. 事件重试命中已有 idempotencyKey 时返回原结果，不再次增加计数。

- [ ] **Step 5: 扩展 LearnerActivityService 安全字段**

RecordLearnerActivityInput 增加经过服务端解析的课程版本、课程项、材料、版本和 partKey。字符串继续限制长度；metrics 仍只允许低敏标量。新增 key 如 isCorrect、startSeconds、endSeconds、coveragePercent、reviewCount 必须通过白名单，正文 key 继续拒绝。

- [ ] **Step 6: 运行测试**

Run:

~~~bash
pnpm --filter @xueleai/api-core exec node --import tsx --test tests/learner-activity.test.ts tests/learner-learning-progress.test.ts tests/learner-learning-events.test.ts
pnpm --filter @xueleai/api-core typecheck
~~~

Expected: PASS。

- [ ] **Step 7: 提交**

~~~bash
git add apps/api-core/src/learner-learning/learner-learning-event.service.ts apps/api-core/src/learner-learning/dto/learner-learning.dto.ts apps/api-core/src/learner-learning/learner-learning.controller.ts apps/api-core/src/learner-learning/learner-learning.module.ts apps/api-core/src/profiles/learner-activity.service.ts apps/api-core/tests/helpers/learner-learning-fixture.ts apps/api-core/tests/learner-learning-events.test.ts apps/api-core/tests/learner-activity.test.ts
git commit -m "feat(api): persist learner material progress"
~~~

### Task 8: 课程启动上下文

**Files:**
- Modify: apps/web/src/lib/course-editor-state.ts
- Modify: apps/web/src/components/courses/public-course-detail.tsx
- Modify: apps/web/tests/public-course-presentation.test.ts
- Modify: apps/api-core/tests/learner-learning-session.test.ts

**Interfaces:**
- Produces: learningLaunchHref(href, courseId, courseRevisionItemId): string
- Consumes: Heartbeat context 的 courseId 和 courseRevisionItemId。

- [ ] **Step 1: 写课程链接失败测试**

~~~ts
test("课程课件启动链接携带课程和课程项上下文", () => {
  assert.equal(
    learningLaunchHref("/media-tutor/share-1", "course-1", "item-1"),
    "/media-tutor/share-1?courseId=course-1&courseRevisionItemId=item-1"
  );
});
~~~

并在 API 测试中断言 item-1 不属于 course-1、不是当前 approvedRevision 或材料 ID 不一致时返回 40301/40004。

- [ ] **Step 2: 运行测试确认失败**

Run:

~~~bash
pnpm --filter @xueleai/web exec node --import tsx --test tests/public-course-presentation.test.ts
pnpm --filter @xueleai/api-core exec node --import tsx --test tests/learner-learning-session.test.ts
~~~

Expected: FAIL，链接缺少查询参数。

- [ ] **Step 3: 实现上下文链接**

使用 URLSearchParams 编码，不拼接未经编码的值：

~~~ts
export function learningLaunchHref(href: string, courseId: string, itemId: string) {
  const separator = href.includes("?") ? "&" : "?";
  const query = new URLSearchParams({
    courseId,
    courseRevisionItemId: itemId
  });
  return href + separator + query.toString();
}
~~~

publicCourseItemPresentation 使用传入 course.id 和 item.id 包装 READY 状态的 launchHref；创作者和管理员预览也可带上下文，但只有 LEARNER Provider 会写学习数据。

- [ ] **Step 4: 运行测试和类型检查**

Run:

~~~bash
pnpm --filter @xueleai/web exec node --import tsx --test tests/public-course-presentation.test.ts
pnpm --filter @xueleai/api-core exec node --import tsx --test tests/learner-learning-session.test.ts
pnpm --filter @xueleai/web typecheck
~~~

Expected: PASS。

- [ ] **Step 5: 提交**

~~~bash
git add apps/web/src/lib/course-editor-state.ts apps/web/src/components/courses/public-course-detail.tsx apps/web/tests/public-course-presentation.test.ts apps/api-core/tests/learner-learning-session.test.ts
git commit -m "feat: preserve learner course launch context"
~~~

### Task 9: 视频导学采集适配器

**Files:**
- Create: apps/web/src/lib/video-guide-learning-tracking.ts
- Create: apps/web/tests/video-guide-learning-tracking.test.ts
- Modify: apps/web/src/components/experience/video-guide-learning-player.tsx
- Modify: apps/web/src/app/media-tutor/[id]/page.tsx

**Interfaces:**
- Produces: videoGuidePartKey(stageIndex): AUTONOMOUS | GUIDED | HIGHLIGHTS | PRACTICE | READ_ALONG
- Produces: flushVideoPlaybackRange(previous, current, playing): MEDIA_PROGRESS | null
- Consumes: publishLearningContext、publishLearningEvent。

- [ ] **Step 1: 写阶段映射和播放区间失败测试**

~~~ts
test("视频导学五阶段映射固定", () => {
  assert.deepEqual([0, 1, 2, 3, 4].map(videoGuidePartKey), [
    "AUTONOMOUS",
    "GUIDED",
    "HIGHLIGHTS",
    "PRACTICE",
    "READ_ALONG"
  ]);
});

test("跳播不生成跨越区间", () => {
  assert.equal(flushVideoPlaybackRange(10, 90, true), null);
  assert.deepEqual(flushVideoPlaybackRange(10, 14, true), {
    startSeconds: 10,
    endSeconds: 14
  });
});
~~~

- [ ] **Step 2: 运行测试确认失败**

Run:

~~~bash
pnpm --filter @xueleai/web exec node --import tsx --test tests/video-guide-learning-tracking.test.ts
~~~

Expected: FAIL with module not found。

- [ ] **Step 3: 页面传递稳定材料 ID**

MediaTutor 页面把公开 API 返回的 lesson.id 作为 learningMaterialId 传入播放器，shareToken 只用于路由，不作为材料统计 ID。

- [ ] **Step 4: 接入五阶段事件**

- activeStage 变化时发布 isLearning、materialType、materialId、partKey 和 URL 中的课程上下文。
- 自主观看每连续 5–10 秒或 pause/ended/seek 前发送实际播放区间。
- 互动讲解在讲解节点完整播放后发送 NODE_LEARNED。
- 重点学习在词汇/重点被有效查看后发送 NODE_LEARNED。
- 练习选择提交发送 PRACTICE_SUBMITTED，只传 questionId 和 selectedIndex。
- 跟读完成一个现有句子后发送 READ_ALONG_COMPLETED，只传 sentenceId。
- 媒体暂停、页面隐藏和阶段切换时立即刷新未上报区间。

- [ ] **Step 5: 运行测试和播放器回归**

Run:

~~~bash
pnpm --filter @xueleai/web exec node --import tsx --test tests/video-guide-learning-tracking.test.ts tests/video-guide-player-controls.test.ts tests/video-guide-data.test.ts
pnpm --filter @xueleai/web typecheck
~~~

Expected: PASS。

- [ ] **Step 6: 提交**

~~~bash
git add apps/web/src/lib/video-guide-learning-tracking.ts apps/web/tests/video-guide-learning-tracking.test.ts apps/web/src/components/experience/video-guide-learning-player.tsx apps/web/src/app/media-tutor/[id]/page.tsx
git commit -m "feat(web): track video guide learning progress"
~~~

### Task 10: 英文与古诗文伴学采集适配器

**Files:**
- Create: apps/web/src/lib/english-guided-study-tracking.ts
- Create: apps/web/tests/english-guided-study-tracking.test.ts
- Modify: apps/web/src/components/experience/english-guided-study-learning-player.tsx
- Modify: apps/web/src/app/text2lesson/[id]/page.tsx
- Modify: apps/web/src/app/gushiwen/[id]/page.tsx

**Interfaces:**
- Produces: guidedStudyPartKey(view): DEMONSTRATION | GUIDED | PRACTICE | READ_ALONG
- Produces: completedGuidedNodeIds(previousPosition, currentPosition, validIds): string[]
- Consumes: publishLearningContext、publishLearningEvent。

- [ ] **Step 1: 写视图映射和恢复进度失败测试**

~~~ts
test("英文和古诗文共用四部分映射", () => {
  assert.equal(guidedStudyPartKey("demonstration"), "DEMONSTRATION");
  assert.equal(guidedStudyPartKey("guided"), "GUIDED");
  assert.equal(guidedStudyPartKey("practice"), "PRACTICE");
  assert.equal(guidedStudyPartKey("readAlong"), "READ_ALONG");
});

test("本地恢复位置不会直接标记服务端节点完成", () => {
  assert.deepEqual(
    completedGuidedNodeIds({ restored: true, index: 0 }, { restored: true, index: 8 }, ["n1", "n2"]),
    []
  );
});
~~~

- [ ] **Step 2: 运行测试确认失败**

Run:

~~~bash
pnpm --filter @xueleai/web exec node --import tsx --test tests/english-guided-study-tracking.test.ts
~~~

Expected: FAIL with module not found。

- [ ] **Step 3: 接入四部分事件**

- 示范朗读发送实际播放区间，达到 80% 由服务端判断。
- 逐句学习只在节点真实播放到结尾或用户完成该节点交互后发送 NODE_LEARNED。
- 练习提交发送 questionId 和 selectedIndex，由服务端 approvedSnapshot 判定。
- 跟读播放或录制完成一个 cue 后只发送 cueId；不发送录音、波形或文本。
- localStorage 继续只用于体验恢复，恢复动作本身不生成完成事件；后续真实学习事件再同步服务端进度。
- 英文和古诗文使用相同 materialType，scene 只作为展示，不作为客户端授权依据。

- [ ] **Step 4: 运行测试和现有学习逻辑回归**

Run:

~~~bash
pnpm --filter @xueleai/web exec node --import tsx --test tests/english-guided-study-tracking.test.ts tests/english-guided-study-learning.test.ts tests/english-guided-study-node-timeline.test.ts
pnpm --filter @xueleai/web typecheck
~~~

Expected: PASS。

- [ ] **Step 5: 提交**

~~~bash
git add apps/web/src/lib/english-guided-study-tracking.ts apps/web/tests/english-guided-study-tracking.test.ts apps/web/src/components/experience/english-guided-study-learning-player.tsx apps/web/src/app/text2lesson/[id]/page.tsx apps/web/src/app/gushiwen/[id]/page.tsx
git commit -m "feat(web): track guided study progress"
~~~

### Task 11: 闪卡反馈与牌组进度

**Files:**
- Create: apps/web/src/lib/flashcard-learning-tracking.ts
- Create: apps/web/tests/flashcard-learning-tracking.test.ts
- Modify: apps/web/src/components/courses/public-flashcard-player.tsx
- Modify: apps/web/src/app/learn/flashcards/[id]/page.tsx
- Modify: apps/web/src/lib/learning-flashcards-api.ts
- Modify: apps/api-core/tests/learner-learning-events.test.ts
- Modify: apps/api-core/tests/learning-flashcards-review-summary.test.ts

**Interfaces:**
- Produces: FlashcardRoundState 和 recordFlashcardGrade(state, cardId, grade)。
- Consumes: reviewLearningFlashcard 返回的 reviewId。
- Produces: FLASHCARD_REVIEWED 事件，只引用服务端 reviewId。

~~~ts
export interface FlashcardRoundState {
  cardIds: string[];
  reviewedCardIds: string[];
  completed: boolean;
  counts: {
    blurry: number;
    hard: number;
    mastered: number;
  };
}
~~~

- [ ] **Step 1: 写一轮完成失败测试**

~~~ts
test("每张卡完成一次等级反馈后完成一轮", () => {
  let state = createFlashcardRound(["card-1", "card-2"]);
  state = recordFlashcardGrade(state, "card-1", "HARD");
  assert.equal(state.completed, false);
  state = recordFlashcardGrade(state, "card-2", "MASTERED");
  assert.equal(state.completed, true);
  assert.deepEqual(state.counts, { blurry: 0, hard: 1, mastered: 1 });
});
~~~

API 测试增加：reviewId 必须属于当前 learner 和当前 deck；客户端传 grade 与实际 review 不一致时忽略客户端值。

- [ ] **Step 2: 运行测试确认失败**

Run:

~~~bash
pnpm --filter @xueleai/web exec node --import tsx --test tests/flashcard-learning-tracking.test.ts
pnpm --filter @xueleai/api-core exec node --import tsx --test tests/learner-learning-events.test.ts
~~~

Expected: FAIL。

- [ ] **Step 3: 为学习者播放器增加等级反馈**

仅在答案已显示且当前为学习者模式时展示“模糊、需加强、已掌握”。点击后：

1. 调用现有 cards/:id/review 接口。
2. 成功返回 reviewId 后发布 FLASHCARD_REVIEWED。
3. 更新本轮集合并自动移动到下一张。
4. 所有卡完成后显示本轮报告和“再学一轮”。
5. 请求失败保持当前卡，不伪造进度。

游客和主账号继续允许只读浏览，不展示会写复习记录的等级按钮。

- [ ] **Step 4: 服务端使用 reviewId 更新牌组进度**

查询 LearningFlashcardReview 的 learnerId、deckId、cardId 和 grade；按每张卡最新反馈计算掌握分布。当当前学习者对牌组每张现有卡至少有一条反馈时，牌组状态为 COMPLETED。牌组内容版本使用 publication.approvedHash；非课程直接学习使用当前牌组安全版本。

- [ ] **Step 5: 运行回归**

Run:

~~~bash
pnpm --filter @xueleai/web exec node --import tsx --test tests/flashcard-learning-tracking.test.ts tests/public-course-presentation.test.ts
pnpm --filter @xueleai/api-core exec node --import tsx --test tests/learner-learning-events.test.ts tests/learning-flashcards-review-summary.test.ts
pnpm --filter @xueleai/web typecheck
pnpm --filter @xueleai/api-core typecheck
~~~

Expected: PASS。

- [ ] **Step 6: 提交**

~~~bash
git add apps/web/src/lib/flashcard-learning-tracking.ts apps/web/tests/flashcard-learning-tracking.test.ts apps/web/src/components/courses/public-flashcard-player.tsx apps/web/src/app/learn/flashcards/[id]/page.tsx apps/web/src/lib/learning-flashcards-api.ts apps/api-core/tests/learner-learning-events.test.ts apps/api-core/tests/learning-flashcards-review-summary.test.ts
git commit -m "feat: track learner flashcard rounds"
~~~

### Task 12: 学习者课件列表和分段明细

**Files:**
- Create: apps/web/src/components/learning/material-progress-list.tsx
- Create: apps/web/src/app/learn/center/materials/[materialType]/[materialId]/page.tsx
- Create: apps/web/tests/learner-material-progress.test.ts
- Modify: apps/api-core/src/learner-learning/learner-learning-query.service.ts
- Modify: apps/api-core/src/learner-learning/learner-learning.controller.ts
- Modify: apps/api-core/tests/learner-learning-query.test.ts
- Modify: apps/web/src/lib/learner-learning-api.ts
- Modify: apps/web/src/components/profiles/learner-center.tsx

**Interfaces:**
- Produces: GET /profiles/learner/learning/materials
- Produces: GET /profiles/learner/learning/materials/:materialType/:materialId
- Produces: LearnerMaterialDetail。

~~~ts
export interface LearnerMaterialDetail extends LearnerMaterialSummary {
  contentVersion: string;
  firstStartedAt: string | null;
  completedAt: string | null;
  parts: Array<{
    key: string;
    label: string;
    status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
    progressPercent: number;
    activeStudySeconds: number;
    metrics: Record<string, number>;
  }>;
}
~~~

- [ ] **Step 1: 写明细权限和展示失败测试**

~~~ts
test("学习者材料详情只返回自己的当前版本进度", async () => {
  const detail = await service.getMaterialDetail({
    userId: "user-1",
    learnerId: "learner-1",
    materialType: "VIDEO_GUIDE",
    materialId: "video-1"
  });
  assert.equal(detail.materialId, "video-1");
  assert.deepEqual(detail.parts.map((part) => part.key), [
    "AUTONOMOUS",
    "GUIDED",
    "HIGHLIGHTS",
    "PRACTICE",
    "READ_ALONG"
  ]);
});
~~~

Web 测试断言最近学习列表、状态中文标签、百分比、各部分指标和继续学习链接存在。

- [ ] **Step 2: 运行测试确认失败**

Run:

~~~bash
pnpm --filter @xueleai/api-core exec node --import tsx --test tests/learner-learning-query.test.ts
pnpm --filter @xueleai/web exec node --import tsx --test tests/learner-material-progress.test.ts
~~~

Expected: FAIL。

- [ ] **Step 3: 实现材料列表和详情查询**

列表按 lastStudiedAt 倒序，默认 20 条，最多 100 条。详情返回标题、类型、状态、百分比、累计学习时长、首次/最近/完成时间、继续学习 URL、部分列表和经过白名单转换的指标。学习者无记录或不属于自己时返回 40401，不允许通过参数读取兄弟姐妹数据。

- [ ] **Step 4: 更新学习中心**

在趋势下增加“最近学习”列表，卡片显示课件名、所属课程、进度、最近学习时间和“继续学习/查看详情”。明细页显示五段、四段或闪卡统计；不展示原始事件和答案内容。

- [ ] **Step 5: 运行 Phase 2 验证**

Run:

~~~bash
pnpm --filter @xueleai/api-core exec node --import tsx --test tests/learner-learning-progress.test.ts tests/learner-learning-events.test.ts tests/learner-learning-query.test.ts
pnpm --filter @xueleai/web exec node --import tsx --test tests/video-guide-learning-tracking.test.ts tests/english-guided-study-tracking.test.ts tests/flashcard-learning-tracking.test.ts tests/learner-material-progress.test.ts
pnpm --filter @xueleai/api-core typecheck
pnpm --filter @xueleai/web typecheck
~~~

Expected: PASS。浏览器分别完成三类课件的一个部分，/learn/center 能显示相同进度。

- [ ] **Step 6: 提交**

~~~bash
git add apps/api-core/src/learner-learning/learner-learning-query.service.ts apps/api-core/src/learner-learning/learner-learning.controller.ts apps/api-core/tests/learner-learning-query.test.ts apps/web/src/components/learning/material-progress-list.tsx apps/web/src/app/learn/center/materials apps/web/src/lib/learner-learning-api.ts apps/web/src/components/profiles/learner-center.tsx apps/web/tests/learner-material-progress.test.ts
git commit -m "feat: show learner material progress"
~~~

## Phase 3：主账号学习看板

### Task 13: 主账号统计接口与筛选

**Files:**
- Modify: apps/api-core/src/learner-learning/dto/learner-learning.dto.ts
- Modify: apps/api-core/src/learner-learning/learner-learning-query.service.ts
- Modify: apps/api-core/src/learner-learning/learner-learning.controller.ts
- Create: apps/api-core/tests/learner-learning-account-query.test.ts

**Interfaces:**
- Produces: GET /profiles/learners/:learnerId/learning/overview
- Produces: GET /profiles/learners/:learnerId/learning/materials
- Produces: GET /profiles/learners/:learnerId/learning/materials/:materialType/:materialId
- Query filters: from、to、scenarioId、courseId、resourceType、resourceId、materialType、materialId。

- [ ] **Step 1: 写所有权和筛选失败测试**

~~~ts
test("主账号只能查询自己创建的学习者", async () => {
  await assert.rejects(
    () => service.getAccountOverview("user-1", "learner-of-user-2", {
      from: "2026-08-01",
      to: "2026-08-19"
    }),
    (error: unknown) => error instanceof AppException && error.code === 40301
  );
});

test("课程筛选只返回该课程启动上下文的数据", async () => {
  const result = await service.getAccountOverview("user-1", "learner-1", {
    from: "2026-08-01",
    to: "2026-08-19",
    courseId: "course-1"
  });
  assert.equal(result.totals.studySeconds, 600);
  assert.equal(result.courseBreakdown.every((row) => row.courseId === "course-1"), true);
});
~~~

- [ ] **Step 2: 运行测试确认失败**

Run:

~~~bash
pnpm --filter @xueleai/api-core exec node --import tsx --test tests/learner-learning-account-query.test.ts
~~~

Expected: FAIL。

- [ ] **Step 3: 实现账号身份和查询限制**

Controller 使用 requireAccount；service 首先查询 Learner where id + userId，不存在统一返回 40301。日期最多 366 天；courseId 必须属于主账号可访问课程；materialType 固定三种；materialId 最长 128。所有条件同时应用于总计、趋势、课程分解和材料列表。

- [ ] **Step 4: 返回课程和材料分解**

返回：

~~~ts
courseBreakdown: Array<{
  courseId: string;
  courseName: string;
  studySeconds: number;
  startedMaterialCount: number;
  completedMaterialCount: number;
}>;
materialBreakdown: Array<{
  materialType: CourseMaterialType;
  materialId: string;
  title: string;
  studySeconds: number;
  progressPercent: number;
  status: LearnerLearningStatus;
}>;
scenarioBreakdown: Array<{
  scenarioId: string;
  scenarioName: string;
  onlineSeconds: number;
  studySeconds: number;
  meaningfulActionCount: number;
}>;
resourceBreakdown: Array<{
  resourceType: string;
  resourceId: string;
  resourceName: string;
  studySeconds: number;
  startedMaterialCount: number;
  completedMaterialCount: number;
}>;
~~~

总计时间来自 TOTAL 行或规范时间片，不对各课程分解直接求和。

- [ ] **Step 5: 运行测试和权限回归**

Run:

~~~bash
pnpm --filter @xueleai/api-core exec node --import tsx --test tests/learner-learning-account-query.test.ts tests/learner-route-authorization.test.ts tests/learner-access.test.ts
pnpm --filter @xueleai/api-core typecheck
~~~

Expected: PASS。

- [ ] **Step 6: 提交**

~~~bash
git add apps/api-core/src/learner-learning/dto/learner-learning.dto.ts apps/api-core/src/learner-learning/learner-learning-query.service.ts apps/api-core/src/learner-learning/learner-learning.controller.ts apps/api-core/tests/learner-learning-account-query.test.ts
git commit -m "feat(api): expose account learner analytics"
~~~

### Task 14: 主账号学习情况页面

**Files:**
- Create: apps/web/src/components/learning/account-learning-dashboard.tsx
- Create: apps/web/src/app/dashboard/learners/learning/page.tsx
- Create: apps/web/tests/account-learning-dashboard.test.ts
- Modify: apps/web/src/lib/learner-learning-api.ts
- Modify: apps/web/src/components/profiles/learner-manager.tsx
- Modify: apps/web/tests/learner-management.test.ts

**Interfaces:**
- Consumes: 主账号 overview、materials 和 material detail 接口。
- Produces: /dashboard/learners/learning?learnerId=...&from=...&to=...&courseId=...

- [ ] **Step 1: 写页面保护和筛选失败测试**

~~~ts
test("学习者管理为每个有效学习者提供学习情况入口", async () => {
  const source = await readFile(
    new URL("../src/components/profiles/learner-manager.tsx", import.meta.url),
    "utf8"
  );
  assert.match(source, /dashboard\/learners\/learning/u);
  assert.match(source, /学习情况/u);
});

test("主账号看板要求账号身份并保留筛选参数", async () => {
  const source = await readFile(
    new URL("../src/app/dashboard/learners/learning/page.tsx", import.meta.url),
    "utf8"
  );
  assert.match(source, /requireAccountProfile/u);
  assert.match(source, /learnerId/u);
  assert.match(source, /from/u);
  assert.match(source, /to/u);
  assert.match(source, /courseId/u);
});
~~~

- [ ] **Step 2: 运行测试确认失败**

Run:

~~~bash
pnpm --filter @xueleai/web exec node --import tsx --test tests/account-learning-dashboard.test.ts tests/learner-management.test.ts
~~~

Expected: FAIL。

- [ ] **Step 3: 实现 Server Component 数据加载**

先 requireAccountProfile，再 getLearners；learnerId 缺失时选择第一个 ACTIVE 学习者；没有学习者时显示“暂无学习者”。传入其他账号 learnerId 时由 API 拒绝，页面显示简洁中文错误，不回退到其他学习者造成误读。

- [ ] **Step 4: 实现看板**

页面包括：

- 学习者选择器。
- 今日、本周、本月和自定义日期。
- 有效在线、学习时长、学习天数、课件开始/完成数。
- 每日趋势。
- 已学习应用及有效使用时间。
- 课程投入表。
- 学习资源投入表。
- 课件进度表。
- 应用、课程、资源、材料类型、材料筛选。
- 进入课件分段明细。

使用原生表格、CSS 条形图和现有 Card、Button、Select、Input；指标说明放在 Info 图标 tooltip，不添加常驻长解释。

- [ ] **Step 5: 运行 Phase 3 验证**

Run:

~~~bash
pnpm --filter @xueleai/web exec node --import tsx --test tests/account-learning-dashboard.test.ts tests/learner-management.test.ts tests/profile-presentation.test.ts
pnpm --filter @xueleai/web typecheck
pnpm --filter @xueleai/web build
~~~

Expected: PASS。浏览器验收主账号能逐个选择学习者，日期和课程筛选更新 URL 与数据；学习者身份直接访问被重定向到 /learn。

- [ ] **Step 6: 提交**

~~~bash
git add apps/web/src/components/learning/account-learning-dashboard.tsx apps/web/src/app/dashboard/learners/learning/page.tsx apps/web/src/lib/learner-learning-api.ts apps/web/src/components/profiles/learner-manager.tsx apps/web/tests/account-learning-dashboard.test.ts apps/web/tests/learner-management.test.ts
git commit -m "feat(web): add account learner analytics dashboard"
~~~

## Phase 4：汇总、保留与上线治理

### Task 15: 每日汇总、过期会话、清理与历史回填

**Files:**
- Create: apps/api-core/src/learner-learning/learner-learning-maintenance.service.ts
- Create: apps/api-core/src/learner-learning/backfill-learner-learning.ts
- Create: apps/api-core/tests/learner-learning-maintenance.test.ts
- Modify: apps/api-core/tests/helpers/learner-learning-fixture.ts
- Modify: apps/api-core/src/learner-learning/learner-learning.module.ts
- Modify: apps/api-core/package.json
- Modify: .env.example
- Modify: .env.production.example

**Interfaces:**
- Produces: reconcileDate(dateKey): Promise<ReconcileResult>
- Produces: expireStaleSessions(now): Promise<number>
- Produces: deleteExpiredRawData(now): Promise<RetentionResult>
- Produces: pnpm --filter @xueleai/api-core learner-learning:backfill
- Produces: createMaintenanceFixture() 和 backfillFixture() 测试工具。

~~~ts
export interface ReconcileResult {
  date: string;
  totalRows: number;
  dimensionRows: number;
}

export interface RetentionResult {
  deletedAggregatedCount: number;
  deletedUnaggregatedCount: 0;
}
~~~

- [ ] **Step 1: 写校准、清理和回填失败测试**

~~~ts
test("汇总幂等重跑且使用北京时间日期", async () => {
  const { service, fixture } = createMaintenanceFixture();
  const first = await service.reconcileDate("2026-08-19");
  const second = await service.reconcileDate("2026-08-19");
  assert.deepEqual(second, first);
  assert.equal(fixture.totalSummary.summaryDate, "2026-08-19");
});

test("只删除 180 天前且已汇总的原始数据", async () => {
  const { service } = createMaintenanceFixture();
  const result = await service.deleteExpiredRawData(new Date("2026-08-19T00:00:00.000Z"));
  assert.equal(result.deletedUnaggregatedCount, 0);
  assert.equal(result.deletedAggregatedCount, 3);
});

test("历史回填不生成在线或学习时长", async () => {
  const fixture = backfillFixture();
  const result = await backfill(fixture.prisma);
  assert.equal(result.createdProgressCount, 1);
  assert.equal(fixture.dailySummary.onlineSeconds, 0);
  assert.equal(fixture.dailySummary.studySeconds, 0);
});
~~~

- [ ] **Step 2: 运行测试确认失败**

Run:

~~~bash
pnpm --filter @xueleai/api-core exec node --import tsx --test tests/learner-learning-maintenance.test.ts
~~~

Expected: FAIL。

- [ ] **Step 3: 实现增量汇总和每日校准**

每次接受时间片或进度事件后 upsert 当日 TOTAL 和相应维度汇总。维护服务每小时：

1. 使用 PostgreSQL advisory lock 保证多实例只有一个执行者。
2. 关闭最后心跳超过 2 分钟的会话，endedAt 使用 lastHeartbeatAt，原因为 TIMED_OUT。
3. 重算今天和昨天的 TOTAL、SCENARIO、COURSE、RESOURCE、MATERIAL、PART 行。
4. 记录处理数量、耗时和失败类型，不记录请求体或学习正文。

- [ ] **Step 4: 实现 180 天分批清理**

只清理 cutoff 之前且对应日期已有 TOTAL 汇总的 LearnerLearningTimeSlice、LearnerLearningSession，以及以下详细学习事件类型：

~~~ts
const expirableLearningEventTypes = [
  "MATERIAL_STARTED",
  "MEDIA_PROGRESS",
  "NODE_LEARNED",
  "PRACTICE_SUBMITTED",
  "READ_ALONG_COMPLETED",
  "FLASHCARD_REVIEWED",
  "PART_COMPLETED",
  "MATERIAL_COMPLETED"
] as const;
~~~

已有 CREATE_STARTED、CREATE_COMPLETED、LEARNING_STARTED、LEARNING_COMPLETED、REVIEW_COMPLETED 不由本清理任务删除。每批最多 1000 行并循环到不足一批。LearnerMaterialProgress、LearnerMaterialPartProgress、LearningFlashcardReview 和 LearnerDailyLearningSummary 不清理。

- [ ] **Step 5: 实现幂等历史回填脚本**

脚本只处理：

- 现有 REVIEW_COMPLETED 和 LearningFlashcardReview 可证明的卡片反馈。
- 现有 LEARNING_COMPLETED 可证明的材料完成。

使用 upsert 和稳定 idempotencyKey；onlineSeconds、studySeconds 均为 0。输出扫描数、创建数、跳过数和失败数，不输出用户昵称、答案或内容。

- [ ] **Step 6: 增加配置**

~~~dotenv
LEARNER_LEARNING_MAINTENANCE_ENABLED="1"
LEARNER_LEARNING_MAINTENANCE_INTERVAL_MS="3600000"
LEARNER_LEARNING_RAW_RETENTION_DAYS="180"
~~~

LEARNER_LEARNING_ENABLED 不为 1 时维护任务和回填后的实时汇总写入保持关闭。测试环境设置 maintenance enabled=0。生产 retention 小于 180 时拒绝启动并记录配置错误。

- [ ] **Step 7: 运行维护测试**

Run:

~~~bash
pnpm --filter @xueleai/api-core exec node --import tsx --test tests/learner-learning-maintenance.test.ts
pnpm --filter @xueleai/api-core typecheck
~~~

Expected: PASS。

- [ ] **Step 8: 提交**

~~~bash
git add apps/api-core/src/learner-learning/learner-learning-maintenance.service.ts apps/api-core/src/learner-learning/backfill-learner-learning.ts apps/api-core/src/learner-learning/learner-learning.module.ts apps/api-core/tests/helpers/learner-learning-fixture.ts apps/api-core/tests/learner-learning-maintenance.test.ts apps/api-core/package.json .env.example .env.production.example
git commit -m "feat(api): govern learner analytics retention"
~~~

### Task 16: 全量验真、迁移演练与发布检查

**Files:**
- Modify only if verification reveals a defect: files already listed in Tasks 1–15
- Do not create unrelated cleanup commits

**Interfaces:**
- Verifies: schema、权限、三类播放器、双端看板、汇总、清理和生产发布前置条件。

- [ ] **Step 1: 从空数据库验证迁移**

Run:

~~~bash
pnpm db:migrate
pnpm db:generate
pnpm db:seed
~~~

Expected: migration 成功；seed 保持现有简体中文数据，不需要新增学习分析 seed。

- [ ] **Step 2: 从含历史数据的备份副本验证迁移和回填**

在隔离的 3324 测试数据库执行：

~~~bash
pnpm db:migrate
pnpm --filter @xueleai/api-core learner-learning:backfill
pnpm --filter @xueleai/api-core learner-learning:backfill
~~~

Expected: 第二次回填创建数为 0；历史在线和学习时长仍为 0；现有活动、复习和课程行数不减少。

- [ ] **Step 3: 运行全量静态与自动化验证**

Run:

~~~bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
~~~

Expected: 全部 exit 0，无跳过的学习分析核心测试；只有显式需要独立数据库环境的并发测试可按现有约定跳过。

- [ ] **Step 4: 浏览器验收学习者路径**

在本地 3321：

1. 进入学习者身份，确认未授权课程和资源不显示。
2. 打开 /learn/center，记录起始时长。
3. 学习视频导学，验证五部分进度、拖到结尾不完成、实际覆盖 80% 完成。
4. 学习英文和古诗文，验证四部分和练习服务端判定。
5. 完成闪卡一轮，验证三种等级和牌组完成。
6. 隐藏页面和空闲 2 分钟，确认时长停止。
7. 同时打开两个标签页，确认总时长未翻倍。
8. 切换学习者或返回我的账号，确认原会话停止。

- [ ] **Step 5: 浏览器验收主账号路径**

1. 进入 /dashboard/learners/learning。
2. 逐个选择学习者。
3. 验证今日、本周、本月、自定义日期。
4. 验证课程、资源、课件筛选和分段明细。
5. 使用其他账号 learnerId 修改 URL，确认被拒绝。
6. 对比同一学习者的学习中心与主账号看板，总时长和进度一致。

- [ ] **Step 6: 安全和隐私扫描**

Run:

~~~bash
rg -n "prompt|password|token|cookie|transcript|sourceText|answerText|recording" apps/api-core/src/learner-learning apps/web/src/lib/learner-learning-client.ts
~~~

Expected: 只出现明确拒绝字段、身份会话内部命名或安全测试；事件、日志和浏览器队列不保存敏感原文。

- [ ] **Step 7: 发布前检查**

Run:

~~~bash
pnpm release:check
pnpm release:test
~~~

Expected: PASS。发布时先 GitHub 后服务器；生产只执行 prisma migrate deploy 和幂等回填，禁止 reset。

- [ ] **Step 8: 记录验证结论并处理失败**

如果 Step 1–7 全部通过，不创建空提交。如果任一步失败，立即停止发布检查，回到负责该行为的 Task，先在该 Task 已列出的测试文件中增加失败用例，再修改该 Task 已列出的生产文件，重复失败命令和全量验证；验证重新全部通过后使用该 Task 的精确 git add 文件列表提交。

## Final Acceptance

- 学习者有效在线和学习时长误差不超过一个 30 秒心跳周期。
- 页面隐藏、空闲 120 秒、重复标签和重复设备不会虚增总时长。
- 服务端不接受客户端 userId、learnerId、最终时长、正确率、进度或完成状态。
- 视频导学五部分、英文/古诗文四部分、闪卡一轮均按设计规则计算。
- 同一材料的统一进度和课程启动上下文同时保留。
- 学习者只能读取自己，主账号只能读取自己的学习者。
- 学习中心和主账号看板口径一致，且能看到明确页面变化。
- 原始数据 180 天后可安全清理，当前进度和每日汇总长期保留。
- 历史回填不制造在线或学习时长。
- 所有错误和页面文案使用简体中文，无敏感学习原文进入事件、日志或重试队列。
