# 多学习者档案、授权与身份上下文 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为一个主账号交付多学习者档案、严格应用/课程白名单、登录后身份选择、安全切换、身份级历史归属和后续学习分析事件基础。

**Architecture:** 保留 `User` 作为登录、所有权和计费主体，以新的 `Learner`、授权关系和签名 `HttpOnly` 身份上下文表达当前使用者。后端从身份上下文派生 `learnerId` 并统一执行授权，业务主记录以 `userId + learnerId?` 保存归属，追加式活动事件在真实服务端成功节点幂等写入。

**Tech Stack:** pnpm Monorepo、Prisma 7、PostgreSQL、NestJS 11、Next.js 16 App Router、TypeScript 6、TailwindCSS、Node Test Runner。

## Global Constraints

- 第一阶段所有新页面、菜单、按钮、校验和错误提示必须使用简体中文。
- 系统中不建立或显示“创作者”；主账号入口固定显示“我的账号”。
- 学段年级固定为 14 项，其中“大学和工作”为一个合并选项。
- 一个主账号共用一个恰好 6 位的纯数字切换密码；不实现输错锁定。
- 从“我的账号”选择学习者无需验证；学习者之间切换验证共享切换密码；学习者返回“我的账号”只验证主账号登录密码。
- 学习者的场景应用与课程授权均为严格白名单并允许为空。
- `userId` 始终是所有者和计费主体；客户端不得指定可信 `learnerId`。
- 现有历史记录保持 `learnerId = null`，不得猜测或回填到学习者。
- 本期不实现打卡、统计聚合、学习分析看板、课程购买、子账号登录、多语言、支付或钱包改造。
- 所有 API 保持 `{ code, message, data }` 统一响应结构，所有可见错误使用简体中文。
- 本地端口继续使用 3321 Web、3322 API、3324 PostgreSQL、3325 Redis；不得引入端口段外服务。
- 数据库迁移必须向前兼容；禁止 `prisma migrate reset`，禁止删除生产 volume。
- 当前工作区已有与本功能无关的未提交改动；每个任务开始先执行 `git status --short`，只暂存该任务明确列出的文件，不覆盖或格式化无关文件。
- 这是权限与数据迁移任务：每个生产行为先写测试并观察预期失败，再写最小实现；完成前执行全量相关测试、类型检查、lint、build、独立代码审查和最终验真。

---

## File Structure

### Database

- `packages/database/prisma/schema.prisma`：学习者、授权、事件、密码能力和业务记录归属。
- `packages/database/prisma/migrations/20260813160000_learner_profiles_and_context/migration.sql`：向前兼容 DDL、历史密码能力标记和跨表所属关系约束。
- `packages/database/prisma/learner-profile-schema-contract.test.ts`：schema 与 migration 行为契约。

### API Core

- `apps/api-core/src/profiles/profile-context-token.ts`：身份上下文签名、验证和过期判断。
- `apps/api-core/src/profiles/profile-context.types.ts`：`ProfileSubject`、公开上下文和服务返回类型。
- `apps/api-core/src/profiles/profile-context.service.ts`：读取、选择和安全切换当前身份。
- `apps/api-core/src/profiles/learner-access.service.ts`：学习者档案、白名单和课程访问解析。
- `apps/api-core/src/profiles/learner-activity.service.ts`：幂等追加学习活动事件。
- `apps/api-core/src/profiles/profiles.controller.ts`：身份、档案、授权、头像和学习者首页 API。
- `apps/api-core/src/profiles/profiles.module.ts`：导出身份、授权和活动服务供业务模块复用。
- `apps/api-core/src/profiles/dto/profile.dto.ts`：所有身份与学习者请求 DTO。
- `apps/api-core/src/profiles/learner-grade.ts`：14 个稳定枚举值与中文标签。
- `apps/api-core/src/security/cookies.ts`：身份上下文 Cookie 常量和清理能力。
- `apps/api-core/src/auth/auth.service.ts`、`auth.controller.ts`：密码能力、登录重置身份和退出清理。
- 现有 AI、音频、视频导学、英文带学、闪卡、字帖与课程模块：从可信上下文写入归属并执行白名单。
- `apps/api-core/tests/profile-context-token.test.ts`、`profile-context-service.test.ts`、`learner-profiles.test.ts`、`learner-access.test.ts`、`learner-record-attribution.test.ts`、`learner-activity.test.ts`：新增针对性测试。
- `apps/api-core/tests/learner-profile.e2e.test.ts`：真实 HTTP、Cookie、数据库与跨身份权限闭环。

### Web

- `apps/web/src/lib/profile-api.ts`：身份、学习者、授权和学习者首页服务端 API 客户端与 Server Actions。
- `apps/web/src/lib/profile-routing.ts`：安全 `next`、身份目标和导航可见性纯函数。
- `apps/web/src/app/select-profile/page.tsx`：登录后身份选择页。
- `apps/web/src/components/profiles/profile-selector.tsx`：身份卡片。
- `apps/web/src/app/dashboard/learners/page.tsx`：学习者管理页。
- `apps/web/src/components/profiles/learner-manager.tsx`：学习者资料、头像、授权、停用和恢复界面。
- `apps/web/src/app/learn/page.tsx`：学习者首页。
- `apps/web/src/components/profiles/learner-home.tsx`：授权内容与身份级最近记录。
- `apps/web/src/components/profiles/profile-switcher.tsx`：两种密码切换弹窗。
- `apps/web/src/components/shell/learner-shell.tsx`：学习者模式导航壳。
- `apps/web/src/components/shell/dashboard-shell.tsx`、`user-account-menu.tsx`、`public-shell.tsx`：主账号守卫和当前学习者入口。
- `apps/web/src/lib/auth-actions.ts`、`apps/web/src/proxy.ts`：登录后选择和身份 Cookie 生命周期。
- `apps/web/tests/profile-routing.test.ts`、`profile-presentation.test.ts`、`learner-management.test.ts`：纯逻辑和页面呈现契约。

---

### Task 1: 建立数据库模型与向前兼容迁移

**Files:**
- Create: `packages/database/prisma/learner-profile-schema-contract.test.ts`
- Create: `packages/database/prisma/migrations/20260813160000_learner_profiles_and_context/migration.sql`
- Modify: `packages/database/prisma/schema.prisma`

**Interfaces:**
- Produces: `Learner`, `LearnerScenarioAuthorization`, `LearnerCourseAuthorization`, `LearnerActivityEvent` Prisma 模型。
- Produces: `LearnerGrade`, `LearnerStatus`, `LearnerActivityEventType` Prisma 枚举。
- Produces: `User.passwordLoginEnabled: boolean`、`User.learnerSwitchPasswordHash: string | null`。
- Produces: `RefreshToken.profileMode: "UNSELECTED" | "ACCOUNT" | "LEARNER"`、`RefreshToken.profileLearnerId: string | null`。
- Produces: 七类业务主记录的 `learnerId: string | null`。
- Database invariant: 任一业务记录的 `learnerId` 非空时，该学习者的 `userId` 必须等于记录的 `userId`。

- [ ] **Step 1: 写 schema/migration 失败契约测试**

创建测试并使用手写字面量验证 14 个枚举值、四个模型、七个归属列、复合唯一授权键和所属关系触发器：

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

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
```

- [ ] **Step 2: 运行数据库测试并确认因模型和迁移缺失而失败**

Run: `pnpm --filter @xueleai/database exec node --import tsx --test prisma/learner-profile-schema-contract.test.ts`

Expected: FAIL，错误指向 `LearnerGrade`、`Learner` 或迁移文件缺失，而不是语法错误。

- [ ] **Step 3: 在 Prisma schema 写入最小完整数据模型**

使用下列稳定类型和关系名：

```prisma
enum LearnerStatus {
  ACTIVE
  INACTIVE
}

enum UserProfileMode {
  UNSELECTED
  ACCOUNT
  LEARNER
}

enum LearnerGrade {
  PRESCHOOL
  GRADE_1
  GRADE_2
  GRADE_3
  GRADE_4
  GRADE_5
  GRADE_6
  GRADE_7
  GRADE_8
  GRADE_9
  HIGH_1
  HIGH_2
  HIGH_3
  UNIVERSITY_OR_WORK
}

enum LearnerActivityEventType {
  CREATE_STARTED
  CREATE_COMPLETED
  LEARNING_STARTED
  LEARNING_COMPLETED
  REVIEW_COMPLETED
}

model Learner {
  id                     String   @id @default(cuid())
  userId                 String
  nickname               String
  grade                  LearnerGrade
  avatarUrl              String?
  status                 LearnerStatus @default(ACTIVE)
  deactivatedAt          DateTime?
  createdAt              DateTime @default(now())
  updatedAt              DateTime @updatedAt
  user                    User @relation(fields: [userId], references: [id], onDelete: Restrict)
  scenarioAuthorizations LearnerScenarioAuthorization[]
  courseAuthorizations   LearnerCourseAuthorization[]
  activityEvents         LearnerActivityEvent[]
  profileSessions        RefreshToken[]
  aiTasks                AiTask[]
  audioTasks             AudioTask[]
  videoGuideLessons      VideoGuideLesson[]
  guidedStudyMaterials   EnglishGuidedStudyMaterial[]
  flashcardDecks         LearningFlashcardDeck[]
  flashcardReviews       LearningFlashcardReview[]
  copybookRecords        CopybookRecord[]

  @@index([userId, status, createdAt])
  @@map("learners")
}

model LearnerScenarioAuthorization {
  learnerId   String
  scenarioId  String
  authorizedAt DateTime @default(now())
  learner     Learner @relation(fields: [learnerId], references: [id], onDelete: Restrict)
  scenario    AiScenario @relation(fields: [scenarioId], references: [id], onDelete: Restrict)

  @@id([learnerId, scenarioId])
  @@index([scenarioId])
  @@map("learner_scenario_authorizations")
}

model LearnerCourseAuthorization {
  learnerId   String
  courseId    String
  authorizedAt DateTime @default(now())
  learner     Learner @relation(fields: [learnerId], references: [id], onDelete: Restrict)
  course      Course @relation(fields: [courseId], references: [id], onDelete: Restrict)

  @@id([learnerId, courseId])
  @@index([courseId])
  @@map("learner_course_authorizations")
}

model LearnerActivityEvent {
  id             String @id @default(cuid())
  userId         String
  learnerId      String
  eventType      LearnerActivityEventType
  scenarioId     String?
  courseId       String?
  resourceType   String?
  resourceId     String?
  idempotencyKey String? @unique
  occurredAt     DateTime @default(now())
  metrics        Json?
  createdAt      DateTime @default(now())
  user           User @relation(fields: [userId], references: [id], onDelete: Restrict)
  learner        Learner @relation(fields: [learnerId], references: [id], onDelete: Restrict)
  scenario       AiScenario? @relation(fields: [scenarioId], references: [id], onDelete: SetNull)
  course         Course? @relation(fields: [courseId], references: [id], onDelete: SetNull)

  @@index([learnerId, occurredAt])
  @@index([userId, occurredAt])
  @@index([scenarioId, occurredAt])
  @@index([courseId, occurredAt])
  @@index([resourceType, resourceId])
  @@map("learner_activity_events")
}
```

在 `User` 增加 `passwordLoginEnabled Boolean @default(true)`、`learnerSwitchPasswordHash String?` 和学习者/事件反向关系。在 `RefreshToken` 增加 `profileMode UserProfileMode @default(UNSELECTED)`、`profileLearnerId String?`、`profileLearner Learner? @relation(fields: [profileLearnerId], references: [id], onDelete: Restrict)`；在 `Learner` 增加 `profileSessions RefreshToken[]`。在 `AiScenario` 增加学习者授权、活动事件与 AudioTask 反向关系，在 `Course` 增加学习者授权和活动事件反向关系，保证 Prisma schema 可生成。数据库同时增加形状约束：`UNSELECTED`/`ACCOUNT` 必须没有学习者，`LEARNER` 必须有学习者；另以专用触发器保证学习者属于该 `USER` 类型刷新会话的同一 `userId`。在七个业务主模型增加 `learnerId String?`、`learner Learner? @relation(fields: [learnerId], references: [id], onDelete: Restrict)` 以及 `@@index([userId, learnerId, createdAt])`；`AudioTask` 额外增加可空 `scenarioId`/`scenario` 与索引，用于证明直接音频和内部音频子任务经过哪个已授权根场景。保留已有索引，不删除现有关系。

- [ ] **Step 4: 写向前兼容 migration 与所属关系触发器**

迁移显式创建枚举、表、索引、外键和七个可空列。对既有手机号占位账号执行：

```sql
ALTER TABLE "users" ADD COLUMN "passwordLoginEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "users" ADD COLUMN "learnerSwitchPasswordHash" TEXT;
ALTER TABLE "refresh_tokens" ADD COLUMN "profileMode" "UserProfileMode" NOT NULL DEFAULT 'UNSELECTED';
ALTER TABLE "refresh_tokens" ADD COLUMN "profileLearnerId" TEXT;

UPDATE "users"
SET "passwordLoginEnabled" = false
WHERE "email" LIKE 'phone-%@users.xueleai.local';
```

业务归属触发器函数使用 `NEW."learnerId" IS NULL` 直接放行，否则查询 `learners` 并比较 `userId`。分别挂到 `ai_tasks`、`audio_tasks`、`video_guide_lessons`、`english_guided_study_materials`、`learning_flashcard_decks`、`learning_flashcard_reviews`、`copybook_records` 和 `learner_activity_events` 的 `BEFORE INSERT OR UPDATE OF "userId", "learnerId"`。刷新会话另建 `profile_context_shape_check` 和 `enforce_refresh_profile_ownership()` / `refresh_profile_ownership_check`，拒绝管理员 refresh token 带 profile、模式与 learner 空值不匹配、或跨用户 `profileLearnerId`。不更新任何旧业务行，因此旧记录自然保持 `NULL`。

- [ ] **Step 5: 生成 Prisma Client 并运行数据库验证**

Run:

```bash
pnpm --filter @xueleai/database db:generate
pnpm --filter @xueleai/database exec node --import tsx --test prisma/learner-profile-schema-contract.test.ts
pnpm --filter @xueleai/database typecheck
```

Expected: 三条命令退出码均为 0；14 个枚举值顺序准确，migration 契约通过。

- [ ] **Step 6: 在本地开发库应用迁移并检查历史归属**

Run:

```bash
pnpm db:migrate
```

Expected: 创建 `20260813160000_learner_profiles_and_context`；Prisma 不要求 reset。使用 Prisma 查询确认七张业务表的既有行 `learnerId` 均为 `null`。

- [ ] **Step 7: 提交数据库任务**

```bash
git add packages/database/prisma/schema.prisma packages/database/prisma/migrations/20260813160000_learner_profiles_and_context/migration.sql packages/database/prisma/learner-profile-schema-contract.test.ts
git commit -m "feat(database): add learner profiles and attribution"
```

---

### Task 2: 实现签名身份上下文与登录生命周期

**Files:**
- Create: `apps/api-core/src/profiles/profile-context.types.ts`
- Create: `apps/api-core/src/profiles/profile-context-token.ts`
- Create: `apps/api-core/src/profiles/profile-context.service.ts`
- Create: `apps/api-core/src/profiles/dto/profile.dto.ts`
- Create: `apps/api-core/tests/profile-context-token.test.ts`
- Create: `apps/api-core/tests/profile-context-service.test.ts`
- Create: `apps/api-core/tests/auth-password-capability.test.ts`
- Modify: `apps/api-core/src/security/cookies.ts`
- Modify: `apps/api-core/src/security/rate-limit.interceptor.ts`
- Modify: `apps/api-core/src/auth/auth.service.ts`
- Modify: `apps/api-core/src/auth/auth.controller.ts`
- Modify: `apps/api-core/tests/rate-limit.test.ts`
- Modify: `.env.example`
- Modify: `.env.production.example`
- Modify: `docker-compose.prod.yml`

**Interfaces:**
- Produces: `type ProfileSubject = { userId: string; mode: "ACCOUNT"; learnerId: null } | { userId: string; mode: "LEARNER"; learnerId: string }`.
- Produces: `ProfileContextService.optional(request, userId)`, `requireSelected`, `requireAccount`, `select`, `enterLearner`, `switchLearner`, `returnToAccount`。
- Produces: internal `ProfileContextTransition { token: string; maxAgeSeconds: number; context: PublicProfileContext }`; HTTP JSON 只返回 `context`，token 只进入 `Set-Cookie` 响应头。
- Consumes: `User.passwordLoginEnabled`、`User.learnerSwitchPasswordHash`、`Learner.status`。

- [ ] **Step 1: 写 token 篡改、过期和跨用户失败测试**

```ts
test("身份 token 被篡改或跨用户复用时无效", () => {
  const token = signProfileContextToken(
    { userId: "user-a", refreshTokenId: "refresh-a", mode: "LEARNER", learnerId: "learner-a" },
    "test-secret",
    600,
    new Date("2026-08-13T10:00:00Z")
  );
  assert.equal(verifyProfileContextToken(`${token}x`, "test-secret", new Date("2026-08-13T10:01:00Z")), null);
  assert.equal(profileContextForUser(token, "user-b", "test-secret", new Date("2026-08-13T10:01:00Z")), null);
});

test("身份 token 到期后无效", () => {
  const token = signProfileContextToken(
    { userId: "user-a", refreshTokenId: "refresh-a", mode: "ACCOUNT", learnerId: null },
    "test-secret",
    60,
    new Date("2026-08-13T10:00:00Z")
  );
  assert.equal(verifyProfileContextToken(token, "test-secret", new Date("2026-08-13T10:01:01Z")), null);
});
```

- [ ] **Step 2: 运行 token 测试并确认导入缺失失败**

Run: `DATABASE_URL="postgresql://xueleai:xueleai_dev_password@localhost:3324/xueleai?schema=public" REDIS_URL="redis://localhost:3325" pnpm --filter @xueleai/api-core exec node --import tsx --test tests/profile-context-token.test.ts`

Expected: FAIL，提示 `profile-context-token` 模块不存在。

- [ ] **Step 3: 实现专用 HMAC token 与 Cookie 常量**

`profile-context-token.ts` 使用 `HMAC-SHA256`、Base64URL 和 `timingSafeEqual`，payload 固定为：

```ts
interface ProfileContextTokenPayload {
  userId: string;
  refreshTokenId: string;
  mode: "ACCOUNT" | "LEARNER";
  learnerId: string | null;
  issuedAt: number;
  expiresAt: number;
}
```

拒绝未知字段类型、空 `refreshTokenId`、`LEARNER` 无 `learnerId`、`ACCOUNT` 带 `learnerId`、空 `userId`、签名不符和过期 token。密钥读取 `PROFILE_CONTEXT_SECRET`，未配置时仅在非生产环境回退到 `JWT_ACCESS_SECRET`；生产环境两者都为空时抛出内部配置错误。

在 `security/cookies.ts` 增加：

```ts
export const profileContextCookie = "xueleai_profile_context";
export function setProfileContextCookie(response: ResponseLike, transition: ProfileContextTransition) {
  response.cookie(profileContextCookie, transition.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureCookies(),
    path: "/",
    maxAge: transition.maxAgeSeconds * 1000
  });
}
export function clearProfileContextCookie(response: ResponseLike) {
  response.clearCookie(profileContextCookie, {
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureCookies(),
    path: "/"
  });
}
```

在 `.env.example` 和 `.env.production.example` 增加空值/占位 `PROFILE_CONTEXT_SECRET`，生产示例要求至少 32 位随机字符串，并增加 `RATE_LIMIT_PROFILE_SWITCH_MAX="20"`、`RATE_LIMIT_PROFILE_RETURN_ACCOUNT_MAX="20"`；在 `docker-compose.prod.yml` 的 `api-core.environment` 透传这三个变量。本地 Compose 不新增服务或端口。

- [ ] **Step 4: 写身份解析与切换失败测试**

覆盖以下可观察行为：

```ts
test("已停用学习者使原身份上下文失效", async () => {
  const service = serviceWithLearner({ id: "learner-1", userId: "user-1", status: "INACTIVE" });
  await assert.rejects(
    service.requireSelected(requestWithLearnerToken("user-1", "learner-1"), "user-1"),
    (error: AppException) => error.message === "登录状态已失效，请重新登录"
  );
  assert.equal(service.revokedRefreshTokenId, "refresh-1");
});

test("学习者之间切换验证共享六位密码", async () => {
  const service = serviceWithActiveLearnersAndSwitchHash();
  const result = await service.switchLearner(
    requestWithLearnerToken("user-1", "learner-1"),
    "user-1",
    { learnerId: "learner-2", switchPassword: "123456" }
  );
  assert.deepEqual(result.context, {
    mode: "LEARNER",
    learnerId: "learner-2",
    learner: { id: "learner-2", nickname: "小小", grade: "GRADE_2", gradeLabel: "二年级", avatarUrl: null }
  });
});
```

另测 `UNSELECTED` 报“请先选择使用身份”、账号模式进学习者无需密码、学习者返回账号拒绝切换密码并只接受登录密码、验证失败不产生新 token、删除身份 Cookie 后请求被拒绝且不能免密重新选择、旧 Cookie 与数据库会话模式不一致时拒绝访问。

- [ ] **Step 5: 实现 `ProfileContextService` 最小行为**

公开方法签名固定为：

```ts
optional(request: RequestLike, userId: string): Promise<PublicProfileContext | null>;
requireSelected(request: RequestLike, userId: string): Promise<ProfileSubject>;
requireAccount(request: RequestLike, userId: string): Promise<ProfileSubject & { mode: "ACCOUNT" }>;
select(request: RequestLike, userId: string, dto: SelectProfileDto): Promise<ProfileContextTransition>;
enterLearner(request: RequestLike, userId: string, dto: EnterLearnerDto): Promise<ProfileContextTransition>;
switchLearner(request: RequestLike, userId: string, dto: SwitchLearnerDto): Promise<ProfileContextTransition>;
returnToAccount(request: RequestLike, userId: string, dto: ReturnToAccountDto): Promise<ProfileContextTransition>;
```

`optional` 和所有 require 方法先通过当前 refresh Cookie 定位未撤销的 `RefreshToken`，以数据库 `profileMode/profileLearnerId` 为事实来源；Cookie 缺失时不会把已选身份降级为 `UNSELECTED`，而是返回“身份状态已失效，请重新登录”。Cookie 与刷新会话的 ID、模式或学习者不一致时同样拒绝。`select` 只允许数据库会话为 `UNSELECTED`；目标为账号时原子更新为 `ACCOUNT`，目标为学习者时验证所属和 `ACTIVE` 后更新为 `LEARNER`。`enterLearner` 只允许当前 `ACCOUNT`，验证目标所属和有效后无密码更新为 `LEARNER`。`switchLearner` 要求当前为学习者且目标不同，使用数据库中的 `learnerSwitchPasswordHash` 调用现有 `verifyPassword`。`returnToAccount` 要求当前为学习者，先调用公开的 `AuthService.verifyUserPassword(userId, password)`。每次状态更新完成后才签发与该刷新会话匹配的新 Cookie token。若当前学习者已停用、不存在或不再属于该用户，撤销当前刷新会话并要求重新登录，不写回 `UNSELECTED`。

每次签发前调用 `AuthService.requireUserRefreshSession(request, userId)`，返回 `{ id, expiresAt, profileMode, profileLearnerId }`。身份选择与安全切换只支持浏览器刷新会话，不允许仅凭 Bearer access token 改变身份。token 与 Cookie 的 `maxAgeSeconds` 取刷新会话剩余秒数，保证身份上下文不会超过当前用户会话；小于等于 0 时返回“登录状态已失效，请重新登录”。

- [ ] **Step 6: 写并实现登录密码能力契约**

测试手机号验证码首次创建写入 `passwordLoginEnabled: false`，邮箱注册写入 `true`，密码重置后更新为 `true`，`AuthService.toPublicUser` 返回 `hasLoginPassword`。将内部 `assertUserPassword` 重命名并公开为：

```ts
async verifyUserPassword(userId: string, password: string, errorMessage = "登录密码错误"): Promise<void>
```

当 `passwordLoginEnabled` 为 `false` 时返回“请先设置主账号登录密码”。`updateUserPasswordAndRevokeSessions` 同一事务设置 `passwordLoginEnabled: true`。

- [ ] **Step 7: 登录、续期、退出和安全切换限流形成完整生命周期**

创建新的用户 refresh token 时显式写入 `profileMode: "UNSELECTED"`；refresh 续期保留原模式和学习者，并在延长 refresh 到期时间后同步重签身份 Cookie。若续期时当前学习者已失效，则撤销该 refresh token、清理三类 Cookie并返回“登录状态已失效，请重新登录”。logout 撤销该 refresh token。在 `AuthController` 的三种登录成功入口和 `logout` 中调用 `clearProfileContextCookie(response)`。Web 层后续也会清理同名 Cookie，因为当前登录表单通过 Server Action 调用 API，API 响应的 Cookie 不会自动传到浏览器。

在 `RateLimitInterceptor` 增加 `POST /api/profiles/switch-learner` 与 `POST /api/profiles/return-account` 规则，分别使用独立环境变量、默认每 IP 每分钟 20 次；这只是通用速率限制，不写 `LoginFailure`、不产生账号锁定。`rate-limit.test.ts` 断言第 21 次固定返回 429 中文提示。

- [ ] **Step 8: 运行身份上下文针对性测试和类型检查**

Run:

```bash
DATABASE_URL="postgresql://xueleai:xueleai_dev_password@localhost:3324/xueleai?schema=public" REDIS_URL="redis://localhost:3325" pnpm --filter @xueleai/api-core exec node --import tsx --test tests/profile-context-token.test.ts tests/profile-context-service.test.ts tests/auth-password-capability.test.ts tests/rate-limit.test.ts
pnpm --filter @xueleai/api-core typecheck
```

Expected: 所有测试通过，类型检查退出码 0。

- [ ] **Step 9: 提交身份上下文任务**

```bash
git add apps/api-core/src/profiles/profile-context.types.ts apps/api-core/src/profiles/profile-context-token.ts apps/api-core/src/profiles/profile-context.service.ts apps/api-core/src/profiles/dto/profile.dto.ts apps/api-core/src/security/cookies.ts apps/api-core/src/security/rate-limit.interceptor.ts apps/api-core/src/auth/auth.service.ts apps/api-core/src/auth/auth.controller.ts apps/api-core/tests/profile-context-token.test.ts apps/api-core/tests/profile-context-service.test.ts apps/api-core/tests/auth-password-capability.test.ts apps/api-core/tests/rate-limit.test.ts .env.example .env.production.example docker-compose.prod.yml
git commit -m "feat(api): add secure profile context"
```

---

### Task 3: 实现学习者档案、头像和白名单管理 API

**Files:**
- Create: `apps/api-core/src/profiles/learner-grade.ts`
- Create: `apps/api-core/src/profiles/learner-profiles.service.ts`
- Create: `apps/api-core/src/profiles/learner-access.service.ts`
- Create: `apps/api-core/src/profiles/profiles.controller.ts`
- Create: `apps/api-core/src/profiles/profiles.module.ts`
- Create: `apps/api-core/tests/learner-profiles.test.ts`
- Create: `apps/api-core/tests/learner-access.test.ts`
- Modify: `apps/api-core/src/profiles/dto/profile.dto.ts`
- Modify: `apps/api-core/src/profiles/profile-context.service.ts`
- Modify: `apps/api-core/src/app.module.ts`
- Modify: `apps/api-core/src/media/media.service.ts`

**Interfaces:**
- Produces: `GET /profiles/selection`, `POST /profiles/select`, `POST /profiles/enter-learner`, `POST /profiles/switch-learner`, `POST /profiles/return-account`。
- Produces: `GET /profiles/grades`、`GET/POST /profiles/learners`、`PATCH /profiles/learners/:id`、停用、恢复、头像、授权和授权选项 API。
- Produces: `LearnerAccessService.assertScenarioAuthorized(subject, scenarioIdOrSlug)`、`assertCourseAuthorized(subject, courseId)`、`listAuthorizedHome(subject)`。
- Consumes: Task 2 `ProfileContextService` 与 `AuthService.verifyUserPassword`。

- [ ] **Step 1: 写 14 个学段标签和首个学习者失败测试**

```ts
test("学段 API 顺序返回十四个固定中文标签", () => {
  assert.deepEqual(learnerGradeOptions, [
    { value: "PRESCHOOL", label: "学龄前" },
    { value: "GRADE_1", label: "一年级" },
    { value: "GRADE_2", label: "二年级" },
    { value: "GRADE_3", label: "三年级" },
    { value: "GRADE_4", label: "四年级" },
    { value: "GRADE_5", label: "五年级" },
    { value: "GRADE_6", label: "六年级" },
    { value: "GRADE_7", label: "七年级" },
    { value: "GRADE_8", label: "八年级" },
    { value: "GRADE_9", label: "九年级" },
    { value: "HIGH_1", label: "高一" },
    { value: "HIGH_2", label: "高二" },
    { value: "HIGH_3", label: "高三" },
    { value: "UNIVERSITY_OR_WORK", label: "大学和工作" }
  ]);
});

test("没有可输入登录密码的账号不能创建首个学习者", async () => {
  const service = learnersServiceWithUser({ passwordLoginEnabled: false, learnerSwitchPasswordHash: null });
  await assert.rejects(
    service.create("user-1", firstLearnerInput({ switchPassword: "123456" })),
    (error: AppException) => error.message === "请先设置主账号登录密码"
  );
});
```

另测昵称空白、非法学段、首个学习者缺切换密码、非 6 位数字、后续学习者不要求密码、跨用户更新拒绝、停用和恢复保留授权。

- [ ] **Step 2: 运行档案测试并确认服务缺失失败**

Run: `DATABASE_URL="postgresql://xueleai:xueleai_dev_password@localhost:3324/xueleai?schema=public" REDIS_URL="redis://localhost:3325" pnpm --filter @xueleai/api-core exec node --import tsx --test tests/learner-profiles.test.ts`

Expected: FAIL，提示学习者服务或学段常量不存在。

- [ ] **Step 3: 实现 DTO 与档案事务**

DTO 使用 `class-validator`，稳定请求形状为：

```ts
class CreateLearnerDto {
  nickname!: string;
  grade!: LearnerGradeValue;
  switchPassword?: string;
  scenarioIds?: string[];
  courseIds?: string[];
}

class UpdateLearnerDto {
  nickname?: string;
  grade?: LearnerGradeValue;
}

class UpdateLearnerAuthorizationsDto {
  scenarioIds!: string[];
  courseIds!: string[];
}

class UpdateSwitchPasswordDto {
  currentPassword!: string;
  switchPassword!: string;
}
```

创建首个学习者时在一个事务中校验 `passwordLoginEnabled`、哈希切换密码、创建学习者并写入可为空的两类授权。后续学习者禁止通过 `switchPassword` 覆盖共享密码。昵称标准化为 `trim()` 后 1–30 字符。

- [ ] **Step 4: 写严格白名单与课程可授权范围失败测试**

```ts
test("学习者授权为空时没有任何可用场景和课程", async () => {
  const service = accessServiceWithAuthorizations({ scenarios: [], courses: [] });
  assert.deepEqual(await service.listAuthorizedHome(learnerSubject), { scenarios: [], courses: [], recentRecords: [] });
  await assert.rejects(
    service.assertScenarioAuthorized(learnerSubject, "scenario-1"),
    (error: AppException) => error.message === "当前学习者未获得此应用授权"
  );
});

test("只能授权本人已发布课程或已加入课程", async () => {
  const service = accessServiceWithCourses({ ownedPublished: ["course-owned"], enrolled: ["course-enrolled"] });
  await service.replaceAuthorizations("user-1", "learner-1", {
    scenarioIds: [], courseIds: ["course-owned", "course-enrolled"]
  });
  await assert.rejects(
    service.replaceAuthorizations("user-1", "learner-1", { scenarioIds: [], courseIds: ["course-foreign"] }),
    (error: AppException) => error.message === "包含当前账号不可授权的课程"
  );
});
```

- [ ] **Step 5: 实现授权解析与完整集合替换**

`replaceAuthorizations` 在事务中：验证学习者属于 `userId`；验证所有场景 `isEnabled=true`，排除下面根映射中的内部子场景，并要求有可见分类或属于集中定义的独立入口根场景（四个 experience、视频导学、英文带学、古诗文、闪卡）；验证课程满足“本人创建且 `approvedRevisionId` 非空且 `publishedAt` 非空”或存在 `CourseEnrollment(userId, courseId)` 且课程同样有审核通过版本和发布时间；删除不在新集合中的授权；`createMany({ skipDuplicates: true })` 写入新集合。

`assertScenarioAuthorized` 和 `assertCourseAuthorized` 对 `ACCOUNT` 直接放行，对 `LEARNER` 同时验证学习者有效、授权行存在、目标当前启用或可学习。场景 slug 家族使用集中映射：

```ts
export const learnerScenarioRoots = new Map([
  ["video-guide-practice-questions", "video-guide-narration"],
  ["video-guide-narration-timeline", "video-guide-narration"],
  ["english-guided-study-practice", "english-guided-study-material"],
  ["english-guided-study-narration-nodes", "english-guided-study-material"],
  ["english-guided-study-image-extraction", "english-guided-study-material"],
  ["gushiwen-guided-study-practice", "gushiwen-guided-study-material"]
]);
```

先把内部场景归一到根场景，再检查根 `AiScenario.id` 的授权，避免一个应用的内部步骤需要重复授权。

- [ ] **Step 6: 复用现有头像校验并实现 Controller**

在 `MediaService` 增加语义明确的 `uploadLearnerAvatar(userId, file)`，内部复用 `inspectUserAvatar` 和 `persistFile`。Controller 在上传前调用 `requireAccount` 并验证学习者所属，保存 `asset.url`。

Controller 所有管理写操作先执行 `authService.me`，再执行 `profileContextService.requireAccount`。身份选择和切换接口接收 `@Res({ passthrough: true })`，把 transition 的 token 写入 `xueleai_profile_context` HttpOnly Cookie；JSON `data` 只返回公开 context，不返回 token。`POST /profiles/select` 只处理 `UNSELECTED`；`POST /profiles/enter-learner` 单独处理 `ACCOUNT → LEARNER`，不复用首次选择权限分支。

- [ ] **Step 7: 注册模块并运行测试**

Run:

```bash
DATABASE_URL="postgresql://xueleai:xueleai_dev_password@localhost:3324/xueleai?schema=public" REDIS_URL="redis://localhost:3325" pnpm --filter @xueleai/api-core exec node --import tsx --test tests/learner-profiles.test.ts tests/learner-access.test.ts tests/profile-context-service.test.ts
pnpm --filter @xueleai/api-core typecheck
```

Expected: 全部通过。

- [ ] **Step 8: 提交学习者 API 任务**

```bash
git add apps/api-core/src/profiles/learner-grade.ts apps/api-core/src/profiles/learner-profiles.service.ts apps/api-core/src/profiles/learner-access.service.ts apps/api-core/src/profiles/profiles.controller.ts apps/api-core/src/profiles/profiles.module.ts apps/api-core/src/profiles/dto/profile.dto.ts apps/api-core/src/profiles/profile-context.service.ts apps/api-core/src/app.module.ts apps/api-core/src/media/media.service.ts apps/api-core/tests/learner-profiles.test.ts apps/api-core/tests/learner-access.test.ts apps/api-core/tests/profile-context-service.test.ts
git commit -m "feat(api): manage learners and authorizations"
```

---

### Task 4: 交付登录后身份选择与身份 Cookie 的 Web 闭环

**Files:**
- Create: `apps/web/src/lib/profile-api.ts`
- Create: `apps/web/src/lib/profile-routing.ts`
- Create: `apps/web/src/app/select-profile/page.tsx`
- Create: `apps/web/src/components/profiles/profile-selector.tsx`
- Create: `apps/web/tests/profile-routing.test.ts`
- Create: `apps/web/tests/profile-presentation.test.ts`
- Modify: `apps/web/src/lib/auth-actions.ts`
- Modify: `apps/web/src/proxy.ts`
- Modify: `apps/web/src/app/login/page.tsx`
- Modify: `apps/web/src/app/register/page.tsx`

**Interfaces:**
- Consumes: Task 3 `/profiles/selection`、`/profiles/select` 和 API 的 `Set-Cookie: xueleai_profile_context=...` 响应头。
- Produces: `getProfileSelection()`、`selectProfileAction()`、`applyProfileContextSetCookie()`。
- Produces: `/select-profile?next=%2Ftext2lesson` 这类仅含编码后安全站内路径的目标。

- [ ] **Step 1: 写安全 next 与身份目标失败测试**

```ts
test("登录后的目标先经过身份选择且拒绝外部和后台地址", () => {
  assert.equal(profileSelectionHref("/text2lesson"), "/select-profile?next=%2Ftext2lesson");
  assert.equal(profileSelectionHref("https://evil.example"), "/select-profile");
  assert.equal(profileSelectionHref("//evil.example"), "/select-profile");
  assert.equal(profileSelectionHref("/admin/users"), "/select-profile");
});

test("学习者只能继续授权入口返回的站内目标", () => {
  assert.equal(selectionDestination("LEARNER", "/text2lesson", ["/text2lesson"]), "/text2lesson");
  assert.equal(selectionDestination("LEARNER", "/dashboard/billing", ["/text2lesson"]), "/learn");
  assert.equal(selectionDestination("ACCOUNT", "/dashboard/billing", []), "/dashboard/billing");
});
```

- [ ] **Step 2: 运行 Web 测试并确认路由模块缺失失败**

Run: `pnpm --filter @xueleai/web exec node --import tsx --test tests/profile-routing.test.ts`

Expected: FAIL，提示 `profile-routing` 不存在。

- [ ] **Step 3: 实现 Server API 客户端和 Cookie 写入**

`profile-api.ts` 复用 `auth-actions.ts` 当前 API base、Cookie 转发和统一响应处理模式，但 profile transition fetch 还必须读取 API 响应的 `headers.getSetCookie()`（不可用时读取单个 `set-cookie`），只接受名为 `xueleai_profile_context` 且带 `HttpOnly`、`SameSite=Lax`、`Path=/` 的一条 Cookie。拒绝重复同名 Cookie、缺失安全属性、控制字符或不合法 `Max-Age`，再把解析出的值写入浏览器：

```ts
cookieStore.set("xueleai_profile_context", parsed.value, {
  httpOnly: true,
  sameSite: "lax",
  secure: shouldUseSecureCookies(),
  path: "/",
  maxAge: parsed.maxAge
});
```

API JSON 不包含签名 token。给 `profile-routing.test.ts` 增加 Set-Cookie 解析测试，覆盖缺失 HttpOnly、重复 Cookie、错误名称和 CR/LF 注入均被拒绝。

`Max-Age` 按秒解析并原样传给 Next `cookies().set`；API 侧 Express `response.cookie` 使用毫秒，因此两端单位不能复用同一数值字段。现有 `app/api/video-guide/**` 与 `app/api/english-guided-study/**` 代理已经转发完整浏览器 Cookie，实施时用代码审查和 E2E 确认身份 Cookie 未被删减，不做无意义的批量改写。不得把 HMAC token 放进普通 JSON 或客户端 JavaScript 状态。

`selectProfileAction` 接收 `target: "ACCOUNT" | "LEARNER"`、可选 `learnerId` 和 `next`，仅调用首次选择 API；成功后写 Cookie、`revalidatePath("/", "layout")` 并按 `selectionDestination` 跳转。账号状态下进入学习者由后续 `enterLearnerAction` 调用 `/profiles/enter-learner`，不能调用首次选择 API。

- [ ] **Step 4: 所有用户登录方式改为先进入身份选择**

邮箱登录、邮箱注册和手机号登录成功后都删除旧 `xueleai_profile_context`，再跳转 `profileSelectionHref(next)`。退出登录清理访问、刷新和身份三个 Cookie。登录页与注册页继续保留安全 `next`，不改变管理员登录。

Next proxy matcher增加 `/select-profile` 与 `/learn`：没有用户 access cookie 时进入登录页；`/dashboard` 仅做初步 Cookie 存在检查，最终模式权限由页面服务端 API 校验，proxy 不尝试自行验证 HMAC。

- [ ] **Step 5: 实现身份选择页面**

页面服务端获取当前用户和 `/profiles/selection`。`ProfileSelector` 展示一个“我的账号”卡片和有效学习者卡片；没有学习者时显示“还没有学习者”以及选择“我的账号”后添加的按钮。卡片只使用昵称、头像、学段标签和选择动作，不加入长篇说明。

- [ ] **Step 6: 写并运行页面呈现测试**

测试纯呈现模型：停用学习者不生成卡片；账号卡片始终第一项；默认头像取昵称首字符；“大学和工作”保持单一标签。Run:

```bash
pnpm --filter @xueleai/web exec node --import tsx --test tests/profile-routing.test.ts tests/profile-presentation.test.ts
pnpm --filter @xueleai/web typecheck
```

Expected: 测试和类型检查通过。

- [ ] **Step 7: 提交身份选择 Web 任务**

```bash
git add apps/web/src/lib/profile-api.ts apps/web/src/lib/profile-routing.ts apps/web/src/app/select-profile/page.tsx apps/web/src/components/profiles/profile-selector.tsx apps/web/src/lib/auth-actions.ts apps/web/src/proxy.ts apps/web/src/app/login/page.tsx apps/web/src/app/register/page.tsx apps/web/tests/profile-routing.test.ts apps/web/tests/profile-presentation.test.ts
git commit -m "feat(web): add profile selection flow"
```

---

### Task 5: 交付“我的账号”学习者管理页面

**Files:**
- Create: `apps/web/src/app/dashboard/learners/page.tsx`
- Create: `apps/web/src/components/profiles/learner-manager.tsx`
- Create: `apps/web/src/components/profiles/learner-form.tsx`
- Create: `apps/web/src/components/profiles/learner-authorization-form.tsx`
- Create: `apps/web/tests/learner-management.test.ts`
- Modify: `apps/web/src/lib/profile-api.ts`
- Modify: `apps/web/src/components/shell/dashboard-shell.tsx`
- Modify: `apps/web/src/components/shell/user-account-menu.tsx`
- Modify: `apps/web/src/app/dashboard/profile/page.tsx`

**Interfaces:**
- Consumes: Task 3 学习者 CRUD、头像、授权选项、授权替换和切换密码 API。
- Produces: `/dashboard/learners` 可见管理闭环。
- Produces: `requireAccountProfile()`，学习者模式访问账号页面时跳转 `/learn`。

- [ ] **Step 1: 写表单状态与权限呈现失败测试**

测试以下纯逻辑：首个学习者表单显示 6 位切换密码；后续添加不显示；授权空数组可提交；停用操作生成二次确认文案；没有登录密码时动作指向 `/forgot-password?next=/dashboard/learners`；已停用学习者进入独立筛选列表。

```ts
test("首个学习者要求六位切换密码但允许空授权", () => {
  const model = learnerFormModel({ learnerCount: 0, hasLoginPassword: true });
  assert.equal(model.requiresSwitchPassword, true);
  assert.deepEqual(normalizeAuthorizationSelection([], []), { scenarioIds: [], courseIds: [] });
});
```

- [ ] **Step 2: 运行测试并确认组件模型缺失失败**

Run: `pnpm --filter @xueleai/web exec node --import tsx --test tests/learner-management.test.ts`

Expected: FAIL，提示学习者管理呈现函数不存在。

- [ ] **Step 3: 扩展 `profile-api.ts` Server Actions**

实现 `createLearnerAction`、`updateLearnerAction`、`uploadLearnerAvatarAction`、`replaceLearnerAuthorizationsAction`、`deactivateLearnerAction`、`restoreLearnerAction` 和 `updateSwitchPasswordAction`。所有 action 返回统一 `{ error?: string; success?: string }`，成功后只 revalidate `/dashboard/learners`、`/select-profile` 和 `/learn`。

- [ ] **Step 4: 实现管理页面与主账号守卫**

`DashboardShell` 调用 `requireAccountProfile()`；`UNSELECTED` 跳 `/select-profile`，`LEARNER` 跳 `/learn`。导航增加“学习者管理”。页面提供有效/已停用切换、添加、编辑、头像、两类勾选授权、停用、恢复和切换密码修改。

字段旁只有必要的即时校验；授权用途说明放在信息图标 tooltip，空授权直接允许保存。停用确认固定为“停用后将无法选择该学习者，已有学习记录仍会保留。”

- [ ] **Step 5: 接入无登录密码引导**

当 `PublicUser.hasLoginPassword=false` 且当前没有学习者时，隐藏创建提交并显示“先设置主账号登录密码”。链接进入现有手机号/邮箱密码重置流程并带回跳地址；密码重置成功后要求重新登录，再次经过身份选择。

- [ ] **Step 6: 运行 Web 针对性验证**

Run:

```bash
pnpm --filter @xueleai/web exec node --import tsx --test tests/learner-management.test.ts tests/profile-routing.test.ts
pnpm --filter @xueleai/web typecheck
```

Expected: 全部通过。

- [ ] **Step 7: 提交学习者管理页面**

```bash
git add apps/web/src/app/dashboard/learners/page.tsx apps/web/src/components/profiles/learner-manager.tsx apps/web/src/components/profiles/learner-form.tsx apps/web/src/components/profiles/learner-authorization-form.tsx apps/web/src/lib/profile-api.ts apps/web/src/components/shell/dashboard-shell.tsx apps/web/src/components/shell/user-account-menu.tsx apps/web/src/app/dashboard/profile/page.tsx apps/web/tests/learner-management.test.ts
git commit -m "feat(web): manage learner profiles"
```

---

### Task 6: 执行场景应用、课程和账号页面的服务端授权

**Files:**
- Create: `apps/api-core/tests/learner-route-authorization.test.ts`
- Modify: `apps/api-core/src/ai/ai.controller.ts`
- Modify: `apps/api-core/src/ai/advanced-ai.controller.ts`
- Modify: `apps/api-core/src/ai/ai.service.ts`
- Modify: `apps/api-core/src/audio/audio.controller.ts`
- Modify: `apps/api-core/src/audio/dto/audio.dto.ts`
- Modify: `apps/api-core/src/courses/courses.controller.ts`
- Modify: `apps/api-core/src/courses/courses.service.ts`
- Modify: `apps/api-core/src/wallet/wallet.controller.ts`
- Modify: `apps/api-core/src/organizations/organizations.controller.ts`
- Modify: `apps/api-core/src/ai/knowledge.controller.ts`
- Modify: `apps/api-core/src/auth/auth.controller.ts`
- Modify: `apps/api-core/src/payment/payment.controller.ts`
- Modify: `apps/api-core/src/copybook-fonts/copybook-fonts.controller.ts`
- Modify: `apps/api-core/src/video-guide/video-guide.controller.ts`
- Modify: `apps/api-core/src/english-guided-study/english-guided-study.controller.ts`
- Modify: `apps/api-core/src/learning-flashcards/learning-flashcards.controller.ts`
- Modify: `apps/api-core/src/copybooks/copybooks.controller.ts`
- Modify: `apps/api-core/src/render-engine/render-engine.controller.ts`
- Modify: `apps/api-core/src/ai/ai.module.ts`
- Modify: `apps/api-core/src/audio/audio.module.ts`
- Modify: `apps/api-core/src/video-guide/video-guide.module.ts`
- Modify: `apps/api-core/src/english-guided-study/english-guided-study.module.ts`
- Modify: `apps/api-core/src/learning-flashcards/learning-flashcards.module.ts`
- Modify: `apps/api-core/src/copybooks/copybooks.module.ts`
- Modify: `apps/api-core/src/copybook-fonts/copybook-fonts.module.ts`
- Modify: `apps/api-core/src/render-engine/render-engine.module.ts`
- Modify: `apps/api-core/src/profiles/learner-access.service.ts`
- Modify: `apps/api-core/src/profiles/profiles.controller.ts`
- Modify: `apps/api-core/src/profiles/profiles.module.ts`
- Modify: `apps/api-core/src/courses/courses.module.ts`
- Modify: `apps/api-core/src/wallet/wallet.module.ts`
- Modify: `apps/api-core/src/payment/payment.module.ts`
- Modify: `apps/api-core/src/organizations/organizations.module.ts`

**Interfaces:**
- Consumes: `ProfileContextService.requireSelected/requireAccount`、`LearnerAccessService.assertScenarioAuthorized/assertCourseAuthorized`。
- Produces: 学习者无法通过直接 URL 或 API 绕过白名单与账号模式限制。

- [ ] **Step 1: 写未授权直接 API 调用失败测试**

覆盖：学习者调用 `POST /ai/tasks` 未授权场景返回“当前学习者未获得此应用授权”；`GET /ai/tools` 只返回授权根场景；通用 TTS 缺场景或伪造非 TTS 场景被拒绝；学习者访问 `/wallet`、组织写接口、课程编排、知识库管理、Agent Tool、字帖渲染和资料修改返回“当前学习者不能访问此功能”；账号模式保持原行为。

```ts
test("学习者不能通过直接任务接口使用未授权场景", async () => {
  const controller = aiControllerWithLearnerContext({ authorizedScenarioIds: [] });
  await assert.rejects(
    controller.createTask(learnerRequest, { scenarioId: "scenario-1", input: "测试" } as never),
    (error: AppException) => error.message === "当前学习者未获得此应用授权"
  );
});
```

- [ ] **Step 2: 运行授权测试并确认现有 Controller 未检查上下文而失败**

Run: `DATABASE_URL="postgresql://xueleai:xueleai_dev_password@localhost:3324/xueleai?schema=public" REDIS_URL="redis://localhost:3325" pnpm --filter @xueleai/api-core exec node --import tsx --test tests/learner-route-authorization.test.ts`

Expected: FAIL，因为未授权请求仍进入现有 service 或未注入 profile service。

- [ ] **Step 3: 给场景 API 增加统一白名单**

`GET /ai/scenarios`、`GET /ai/tools`、`GET /ai/tools/:slug` 在未登录公开场景保持现有公开展示；当请求具有 `LEARNER` 上下文时只返回获授权根场景。所有生成和任务创建接口先解析 `ProfileSubject`，再按实际或归一后的场景检查授权。内部业务服务发起的子场景也必须通过根场景映射检查，不能只保护 `/ai/tasks`。企业计费在学习者模式固定拒绝，学习者任务仍只使用主账号个人钱包。

现有 `/public/video-guide`、`/public/english-guided-study`、`/public/learning-flashcards` 和 `/public/courses` 是分享/公开学习路由，不改成登录专属；其公开可见性继续由现有分享 token、发布状态和审核通过版本决定。学习者首页和账号内历史绝不通过这些 public 接口取私有记录，所有创作、编辑、复习写入仍走带身份上下文的受保护接口。

- [ ] **Step 4: 给课程学习与课程编排分离入口**

现有 `/courses` 创建、编辑、加入、封面、课件选项和审核提交全部要求 `ACCOUNT`。在 Profiles 模块增加学习者只读接口：

```text
GET /profiles/learner/courses
GET /profiles/learner/courses/:id
```

它们要求 `LEARNER` 且执行 `assertCourseAuthorized`，只返回最后审核通过版本和可学习课件，不返回作者编辑字段、工作版本或审核意见。

- [ ] **Step 5: 保护主账号专属 API**

在钱包、支付订单/充值产品、支付 JSAPI 授权、组织、知识库管理、Agent Tool、资料/头像/邮箱/手机号/密码变更、用户字体写操作、课程编排、字帖记录与渲染和学习者管理 Controller 的入口调用 `requireAccount`。支付异步 notify、公开充值产品和管理员接口不依赖 profile context。学习者仍可读取获授权音频场景执行所需的模型、系统/平台音色和账号共享音色；默认音色设置、音色改名/删除、独立音频资产管理仍仅限账号。获授权的声音复刻允许通过带固定场景校验的上传和创建接口产生共享账号音色，但学习者不能绕过该执行链单独管理资产。

- [ ] **Step 6: 给独立学习应用入口映射根场景**

视频导学入口检查 `video-guide-narration`；英文带学检查 `english-guided-study-material`；古诗文带学检查 `gushiwen-guided-study-material`；学习闪卡检查 `learning-flashcards-deck`。通用 `POST /audio/tasks/tts` 给 DTO 增加可选 `scenarioId`：账号模式可不传；学习者模式必传并验证其已授权、启用且 `requiredCapabilities` 同时含 `AUDIO` 与 `TTS`。`voice-clone` 固定检查 `my-voice-clone`，样本上传也携带并校验该场景；`voice-design` 固定检查 `brand-voice-design`。`/experience/voice` 固定使用 `article-to-speech`。字帖当前没有对应 `AiScenario`，因此本期只允许 `ACCOUNT` 使用字帖和 `/render/*`，直到后台存在可授权的字帖场景；不伪造场景或绕过严格白名单。

- [ ] **Step 7: 运行授权回归**

Run:

```bash
DATABASE_URL="postgresql://xueleai:xueleai_dev_password@localhost:3324/xueleai?schema=public" REDIS_URL="redis://localhost:3325" pnpm --filter @xueleai/api-core exec node --import tsx --test tests/learner-route-authorization.test.ts tests/learner-access.test.ts tests/courses-service.test.ts tests/core-unit.test.ts
pnpm --filter @xueleai/api-core typecheck
```

Expected: 账号原行为与学习者白名单测试都通过。

- [ ] **Step 8: 提交服务端授权任务**

```bash
git add apps/api-core/src/ai/ai.controller.ts apps/api-core/src/ai/advanced-ai.controller.ts apps/api-core/src/ai/ai.service.ts apps/api-core/src/ai/knowledge.controller.ts apps/api-core/src/ai/ai.module.ts apps/api-core/src/audio/audio.controller.ts apps/api-core/src/audio/audio.module.ts apps/api-core/src/audio/dto/audio.dto.ts apps/api-core/src/courses/courses.controller.ts apps/api-core/src/courses/courses.service.ts apps/api-core/src/courses/courses.module.ts apps/api-core/src/wallet/wallet.controller.ts apps/api-core/src/wallet/wallet.module.ts apps/api-core/src/payment/payment.controller.ts apps/api-core/src/payment/payment.module.ts apps/api-core/src/organizations/organizations.controller.ts apps/api-core/src/organizations/organizations.module.ts apps/api-core/src/auth/auth.controller.ts apps/api-core/src/video-guide/video-guide.controller.ts apps/api-core/src/video-guide/video-guide.module.ts apps/api-core/src/english-guided-study/english-guided-study.controller.ts apps/api-core/src/english-guided-study/english-guided-study.module.ts apps/api-core/src/learning-flashcards/learning-flashcards.controller.ts apps/api-core/src/learning-flashcards/learning-flashcards.module.ts apps/api-core/src/copybooks/copybooks.controller.ts apps/api-core/src/copybooks/copybooks.module.ts apps/api-core/src/copybook-fonts/copybook-fonts.controller.ts apps/api-core/src/copybook-fonts/copybook-fonts.module.ts apps/api-core/src/render-engine/render-engine.controller.ts apps/api-core/src/render-engine/render-engine.module.ts apps/api-core/src/profiles/learner-access.service.ts apps/api-core/src/profiles/profiles.controller.ts apps/api-core/src/profiles/profiles.module.ts apps/api-core/tests/learner-route-authorization.test.ts
git commit -m "feat(api): enforce learner access boundaries"
```

---

### Task 7: 接入 AI、音频和字帖记录归属

**Files:**
- Create: `apps/api-core/tests/learner-record-attribution.test.ts`
- Modify: `apps/api-core/src/audio/dto/audio.dto.ts`
- Modify: `apps/api-core/src/ai/ai.controller.ts`
- Modify: `apps/api-core/src/ai/ai.service.ts`
- Modify: `apps/api-core/src/audio/audio.controller.ts`
- Modify: `apps/api-core/src/audio/audio.service.ts`
- Modify: `apps/api-core/src/copybooks/copybooks.controller.ts`
- Modify: `apps/api-core/src/copybooks/copybooks.service.ts`
- Modify: `apps/api-core/tests/core-unit.test.ts`
- Modify: `apps/api-core/tests/audio-task-final-state.test.ts`
- Modify: `apps/api-core/tests/copybook-pricing.test.ts`
- Modify: `apps/web/src/lib/audio-api.ts`

**Interfaces:**
- Consumes: `ProfileSubject` from Task 2。
- Produces: 新建记录从服务端上下文写入 `learnerId`；列表/详情按当前身份隔离。
- Query rule: `ACCOUNT` 默认查看当前用户全部记录；`LEARNER` 固定查看自己的 `learnerId`。

- [ ] **Step 1: 写账号与学习者归属失败测试**

```ts
test("AI 任务从服务端身份写入学习者且忽略请求体伪造值", async () => {
  const prisma = taskCapturePrisma();
  const service = aiServiceWithPrisma(prisma);
  await service.createTask(learnerSubject, { scenarioId: "scenario-1", input: "学习" } as never);
  assert.equal(prisma.createdTask.data.userId, "user-1");
  assert.equal(prisma.createdTask.data.learnerId, "learner-1");
});

test("学习者任务查询同时约束主账号和学习者", async () => {
  const prisma = queryCapturePrisma();
  await aiServiceWithPrisma(prisma).listTasks(learnerSubject);
  assert.deepEqual(prisma.lastWhere, { userId: "user-1", learnerId: "learner-1" });
});
```

为 AudioTask 和 CopybookRecord 写同样的真实 query/data 断言；账号创建断言 `learnerId: null`，账号列表只约束 `userId`。

- [ ] **Step 2: 运行归属测试并确认现有签名无法满足**

Run: `DATABASE_URL="postgresql://xueleai:xueleai_dev_password@localhost:3324/xueleai?schema=public" REDIS_URL="redis://localhost:3325" pnpm --filter @xueleai/api-core exec node --import tsx --test tests/learner-record-attribution.test.ts`

Expected: FAIL，因为 service 仍只接收 `userId` 或 create data 没有 `learnerId`。

- [ ] **Step 3: 将 AI 用户入口改为接收 `ProfileSubject`**

用户可见方法采用：

```ts
createTask(subject: ProfileSubject, dto: CreateAiTaskDto)
listTasks(subject: ProfileSubject)
getTask(subject: ProfileSubject, id: string)
```

保留 provider、计费和组织底层方法的 `userId` 参数；应用编排会调用并可能创建 `AiTask` 的内部入口统一接收 `AttributionContext = Pick<ProfileSubject, "userId" | "learnerId"> & { rootScenarioId?: string | null }`，禁止降级为裸 `userId`。`rootScenarioId` 只来自已通过 `LearnerAccessService` 的 Controller 或服务端固定场景映射，绝不从未校验请求体直接复制。在入口解构 `const { userId, learnerId } = subject`。任务详情 `where` 同时包含 userId 和身份过滤，不能先按 ID 查询再在内存判断。

- [ ] **Step 4: 将音频任务入口改为接收 `ProfileSubject`**

任务创建、列表和详情写入/过滤 `learnerId`。`AudioTask` 同时新增可空 `scenarioId` 外键：学习者直接 TTS 保存已校验的授权场景；复刻/设计保存各自固定场景；视频导学和英文带学子任务保存调用链的授权根场景。账号的旧调用可为空。业务服务调用的 TTS/ASR 创建入口同样接收 `AttributionContext`，保证英文带学和视频导学子任务继承最初学习者和根场景。音频资产和音色继续属于主账号；学习者只能读取获授权应用执行所需资产，不把资产本身归属为学习过程。后台管理员任务查询不加学习者过滤。

`audio-api.ts` 的动态工具 action 把已经由服务端 `getAiTool(scenarioSlug)` 得到的 `tool.id` 作为 `scenarioId` 传给 TTS；固定体验页传 `article-to-speech` 对应 ID。账号旧入口保持兼容。学习者直接伪造 scenarioId 仍由 API 的白名单和能力检查拒绝。

- [ ] **Step 5: 将字帖记录接入归属但保持账号专属**

Task 6 已把字帖限制为 `ACCOUNT`，因此新 `CopybookRecord.learnerId` 当前总是 `null`。仍在 service create data 和查询接口采用 `ProfileSubject`，为以后正式加入字帖场景授权留下同一安全路径，客户端不能提交 learnerId。

- [ ] **Step 6: 更新受影响测试并运行回归**

只更新调用签名与完整 fixture，不放宽原断言。Run:

```bash
DATABASE_URL="postgresql://xueleai:xueleai_dev_password@localhost:3324/xueleai?schema=public" REDIS_URL="redis://localhost:3325" pnpm --filter @xueleai/api-core exec node --import tsx --test tests/learner-record-attribution.test.ts tests/ai-text-generation-options.test.ts tests/audio-task-final-state.test.ts tests/copybook-pricing.test.ts
pnpm --filter @xueleai/api-core typecheck
```

Expected: 全部通过。

- [ ] **Step 7: 提交第一批记录归属**

```bash
git add apps/api-core/src/ai/ai.controller.ts apps/api-core/src/ai/ai.service.ts apps/api-core/src/audio/audio.controller.ts apps/api-core/src/audio/audio.service.ts apps/api-core/src/audio/dto/audio.dto.ts apps/api-core/src/copybooks/copybooks.controller.ts apps/api-core/src/copybooks/copybooks.service.ts apps/api-core/tests/learner-record-attribution.test.ts apps/api-core/tests/core-unit.test.ts apps/api-core/tests/ai-text-generation-options.test.ts apps/api-core/tests/audio-task-final-state.test.ts apps/api-core/tests/copybook-pricing.test.ts apps/web/src/lib/audio-api.ts
git commit -m "feat(api): attribute generated tasks to learners"
```

---

### Task 8: 接入视频导学、英文带学和闪卡记录归属

**Files:**
- Modify: `apps/api-core/tests/learner-record-attribution.test.ts`
- Modify: `apps/api-core/src/video-guide/video-guide.controller.ts`
- Modify: `apps/api-core/src/video-guide/video-guide.service.ts`
- Modify: `apps/api-core/src/english-guided-study/english-guided-study.controller.ts`
- Modify: `apps/api-core/src/english-guided-study/english-guided-study.service.ts`
- Modify: `apps/api-core/src/learning-flashcards/learning-flashcards.controller.ts`
- Modify: `apps/api-core/src/learning-flashcards/learning-flashcards.service.ts`
- Modify: `apps/api-core/tests/video-guide-user-isolation.test.ts`
- Modify: `apps/api-core/tests/course-material-change-hooks.test.ts`
- Modify: `apps/api-core/tests/english-guided-study-async.test.ts`
- Modify: `apps/api-core/tests/english-guided-study-regeneration.test.ts`
- Modify: `apps/api-core/tests/learning-flashcards-generator.test.ts`
- Modify: `apps/api-core/tests/learning-flashcards-review-summary.test.ts`

**Interfaces:**
- Consumes: Task 6 root scenario authorization and Task 2 `ProfileSubject`。
- Produces: 三类学习主记录、闪卡复习记录的创建与查询隔离。

- [ ] **Step 1: 扩展失败测试覆盖三类学习记录**

分别断言：学习者新建视频草稿/课程写 `learnerId`；英文材料初始排队记录写 `learnerId` 且异步最终更新不改变归属；闪卡生成与导入写 `learnerId`；复习记录写当前学习者并拒绝为其他学习者卡组写入。

```ts
test("闪卡复习记录使用当前学习者而不是卡组请求参数", async () => {
  const prisma = flashcardReviewCapturePrisma({ deckLearnerId: "learner-1" });
  await flashcardsServiceWithPrisma(prisma).reviewCard(learnerSubject, "card-1", { grade: "GOOD" });
  assert.deepEqual(prisma.createdReview.data, {
    userId: "user-1", learnerId: "learner-1", deckId: "deck-1", cardId: "card-1", grade: "GOOD"
  });
});
```

- [ ] **Step 2: 运行扩展归属测试并确认失败**

Run: `DATABASE_URL="postgresql://xueleai:xueleai_dev_password@localhost:3324/xueleai?schema=public" REDIS_URL="redis://localhost:3325" pnpm --filter @xueleai/api-core exec node --import tsx --test tests/learner-record-attribution.test.ts`

Expected: 新增视频、英文或闪卡断言失败。

- [ ] **Step 3: 改造视频导学入口**

`listLessons`、`getUserLesson`、`createDraftLesson`、`createLesson` 以及所有从用户路由修改某课程的方法使用 `ProfileSubject`。调用 AI 或 Audio 时传递 `{ userId: lesson.userId, learnerId: lesson.learnerId }`。异步作业只从已持久化 Lesson 读取 `learnerId`，不从后来变化的 Cookie 重新解析，保证切换身份后后台任务和子任务仍归原学习者。

- [ ] **Step 4: 改造英文带学入口**

首次 `submitMaterialGeneration` 创建材料时写入 learnerId；练习、音频、跟读、置顶、编辑和删除都要求材料同时匹配当前 subject。每个 AI/Audio 子任务传递材料已持久化的 `{ userId, learnerId }`。账号模式可操作账号下全部材料；学习者模式只操作自己的材料。后台恢复任务从材料读取 learnerId，不能使用运行恢复进程时的请求身份。

- [ ] **Step 5: 改造闪卡入口和课程闪卡复习权限**

生成、导入、列表、详情和卡片编辑使用 `ProfileSubject`。学习者复习允许两类目标：自己 `learnerId` 的卡组，或当前学习者已授权课程审核通过版本中引用的闪卡卡组；第二种只创建当前用户/学习者的 `LearningFlashcardReview`，不允许修改共享卡片内容。账号模式保留本人卡组编辑，并允许复习自己加入课程的公开卡组。

- [ ] **Step 6: 运行三模块针对性回归**

Run:

```bash
DATABASE_URL="postgresql://xueleai:xueleai_dev_password@localhost:3324/xueleai?schema=public" REDIS_URL="redis://localhost:3325" pnpm --filter @xueleai/api-core exec node --import tsx --test tests/learner-record-attribution.test.ts tests/video-guide-user-isolation.test.ts tests/english-guided-study-async.test.ts tests/english-guided-study-regeneration.test.ts tests/learning-flashcards-generator.test.ts tests/learning-flashcards-review-summary.test.ts
pnpm --filter @xueleai/api-core typecheck
```

Expected: 全部通过，异步恢复与原用户隔离测试无回归。

- [ ] **Step 7: 提交第二批记录归属**

```bash
git add apps/api-core/src/video-guide/video-guide.controller.ts apps/api-core/src/video-guide/video-guide.service.ts apps/api-core/src/english-guided-study/english-guided-study.controller.ts apps/api-core/src/english-guided-study/english-guided-study.service.ts apps/api-core/src/learning-flashcards/learning-flashcards.controller.ts apps/api-core/src/learning-flashcards/learning-flashcards.service.ts apps/api-core/tests/learner-record-attribution.test.ts apps/api-core/tests/video-guide-user-isolation.test.ts apps/api-core/tests/course-material-change-hooks.test.ts apps/api-core/tests/english-guided-study-async.test.ts apps/api-core/tests/english-guided-study-regeneration.test.ts apps/api-core/tests/learning-flashcards-generator.test.ts apps/api-core/tests/learning-flashcards-review-summary.test.ts
git commit -m "feat(api): isolate learner study records"
```

---

### Task 9: 写入幂等学习活动事件并提供学习者首页聚合

**Files:**
- Create: `apps/api-core/src/profiles/learner-activity.service.ts`
- Create: `apps/api-core/tests/learner-activity.test.ts`
- Modify: `apps/api-core/src/profiles/profiles.module.ts`
- Modify: `apps/api-core/src/profiles/profiles.controller.ts`
- Modify: `apps/api-core/src/profiles/learner-access.service.ts`
- Modify: `apps/api-core/src/ai/ai.service.ts`
- Modify: `apps/api-core/src/audio/audio.service.ts`
- Modify: `apps/api-core/src/video-guide/video-guide.service.ts`
- Modify: `apps/api-core/src/english-guided-study/english-guided-study.service.ts`
- Modify: `apps/api-core/src/learning-flashcards/learning-flashcards.service.ts`
- Modify: `apps/api-core/src/copybooks/copybooks.service.ts`

**Interfaces:**
- Produces: `LearnerActivityService.record(input, transaction?)` 幂等写入。
- Produces: `GET /profiles/learner/home` 返回当前学习者、授权场景、授权课程和最近记录。
- Event contract: 不接受公开客户端“完成”上报；只在既有业务真实成功节点写事件。

- [ ] **Step 1: 写事件幂等和低敏 metrics 失败测试**

```ts
test("相同完成幂等键只产生一条学习者事件", async () => {
  const prisma = activityPrismaFixture();
  const service = activityServiceWithPrisma(prisma);
  const input = {
    subject: learnerSubject,
    eventType: "CREATE_COMPLETED" as const,
    scenarioId: "scenario-1",
    resourceType: "AI_TASK",
    resourceId: "task-1",
    idempotencyKey: "ai-task:task-1:create-completed",
    metrics: { totalTokens: 120 }
  };
  await service.record(input);
  await service.record(input);
  assert.equal(prisma.events.length, 1);
});

test("账号模式不写学习者活动事件", async () => {
  const prisma = activityPrismaFixture();
  assert.equal(await activityServiceWithPrisma(prisma).record({ subject: accountSubject, eventType: "CREATE_STARTED" }), null);
  assert.equal(prisma.events.length, 0);
});
```

另测 metrics 拒绝字符串正文、对象深度超过 2、键数超过 20，只允许 boolean、有限 number 和长度不超过 80 的状态字符串。

- [ ] **Step 2: 运行事件测试并确认服务缺失失败**

Run: `DATABASE_URL="postgresql://xueleai:xueleai_dev_password@localhost:3324/xueleai?schema=public" REDIS_URL="redis://localhost:3325" pnpm --filter @xueleai/api-core exec node --import tsx --test tests/learner-activity.test.ts`

Expected: FAIL，提示 activity service 不存在。

- [ ] **Step 3: 实现活动事件服务**

接口固定为：

```ts
record(input: {
  subject: ProfileSubject;
  eventType: LearnerActivityEventType;
  scenarioId?: string | null;
  courseId?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  idempotencyKey?: string | null;
  occurredAt?: Date;
  metrics?: Record<string, boolean | number | string> | null;
}, transaction?: Prisma.TransactionClient): Promise<LearnerActivityEvent | null>;
```

账号模式返回 `null`。有幂等键时使用 `upsert` 且 update 为空，避免重试覆盖首次事件；无幂等键时 `create`。验证资源类型和 ID 最长 80 字符，幂等键最长 160 字符。

- [ ] **Step 4: 在真实业务成功节点写事件**

使用以下稳定幂等键：

```text
ai-task:{id}:create-started
ai-task:{id}:create-completed
audio-task:{id}:create-started
audio-task:{id}:create-completed
video-guide:{id}:create-completed
guided-study:{id}:create-completed
flashcard-deck:{id}:create-completed
flashcard-review:{id}:review-completed
copybook:{id}:create-completed
```

创建开始事件与主记录在同一事务写入。同步完成在完成事务写入；异步完成在最终状态由非成功变为成功的同一事务写入。失败任务不写 `CREATE_COMPLETED`。本期不让客户端直接创建 `LEARNING_COMPLETED`。

- [ ] **Step 5: 实现学习者首页聚合**

`GET /profiles/learner/home` 要求 `LEARNER`。返回：

```ts
{
  learner: PublicLearner;
  scenarios: AuthorizedScenarioSummary[];
  courses: AuthorizedCourseSummary[];
  recentRecords: Array<{
    id: string;
    type: "AI_TASK" | "AUDIO_TASK" | "VIDEO_GUIDE" | "GUIDED_STUDY" | "FLASHCARD_DECK" | "COPYBOOK";
    title: string;
    status: string;
    href: string;
    createdAt: string;
  }>;
}
```

各表按 `userId + learnerId` 最多取 5 条，在服务层合并按时间倒序截取 12 条。授权为空返回空数组，不回退到全站内容。

- [ ] **Step 6: 运行事件与归属回归**

Run:

```bash
DATABASE_URL="postgresql://xueleai:xueleai_dev_password@localhost:3324/xueleai?schema=public" REDIS_URL="redis://localhost:3325" pnpm --filter @xueleai/api-core exec node --import tsx --test tests/learner-activity.test.ts tests/learner-record-attribution.test.ts tests/learner-access.test.ts
pnpm --filter @xueleai/api-core typecheck
```

Expected: 幂等、隐私约束与首页隔离全部通过。

- [ ] **Step 7: 提交活动事件任务**

```bash
git add apps/api-core/src/profiles/learner-activity.service.ts apps/api-core/src/profiles/profiles.module.ts apps/api-core/src/profiles/profiles.controller.ts apps/api-core/src/profiles/learner-access.service.ts apps/api-core/src/ai/ai.service.ts apps/api-core/src/audio/audio.service.ts apps/api-core/src/video-guide/video-guide.service.ts apps/api-core/src/english-guided-study/english-guided-study.service.ts apps/api-core/src/learning-flashcards/learning-flashcards.service.ts apps/api-core/src/copybooks/copybooks.service.ts apps/api-core/tests/learner-activity.test.ts apps/api-core/tests/learner-record-attribution.test.ts apps/api-core/tests/learner-access.test.ts
git commit -m "feat(api): record learner activity events"
```

---

### Task 10: 交付学习者首页、受限导航和安全切换交互

**Files:**
- Create: `apps/web/src/app/learn/page.tsx`
- Create: `apps/web/src/components/profiles/learner-home.tsx`
- Create: `apps/web/src/components/profiles/profile-switcher.tsx`
- Create: `apps/web/src/components/shell/learner-shell.tsx`
- Modify: `apps/web/src/lib/profile-api.ts`
- Modify: `apps/web/src/lib/profile-routing.ts`
- Modify: `apps/web/src/components/shell/public-shell.tsx`
- Modify: `apps/web/src/components/shell/user-account-menu.tsx`
- Modify: `apps/web/src/app/tools/page.tsx`
- Modify: `apps/web/src/app/tools/[slug]/page.tsx`
- Modify: `apps/web/src/app/media-tutor/page.tsx`
- Modify: `apps/web/src/app/media-tutor/creator/[id]/page.tsx`
- Modify: `apps/web/src/app/text2lesson/page.tsx`
- Modify: `apps/web/src/app/text2lesson/creator/[id]/page.tsx`
- Modify: `apps/web/src/app/gushiwen/page.tsx`
- Modify: `apps/web/src/app/gushiwen/creator/[id]/page.tsx`
- Modify: `apps/web/src/app/flashcard/[[...segments]]/page.tsx`
- Modify: `apps/web/src/app/experience/chat/page.tsx`
- Modify: `apps/web/src/app/experience/image/page.tsx`
- Modify: `apps/web/src/app/experience/video/page.tsx`
- Modify: `apps/web/src/app/experience/voice/page.tsx`
- Modify: `apps/web/tests/profile-routing.test.ts`
- Modify: `apps/web/tests/profile-presentation.test.ts`

**Interfaces:**
- Consumes: `/profiles/learner/home`、`/profiles/switch-learner`、`/profiles/return-account`。
- Produces: `/learn`、学习者之间切换弹窗、返回“我的账号”弹窗、退出登录。

- [ ] **Step 1: 写学习者导航和空状态失败测试**

测试：应用授权为空显示“暂无可用应用”；课程授权为空显示“暂无可学课程”；最近记录只使用 API 已过滤数据；学习者导航不含账单、组织、个人资料、学习者管理和课程编排；切换学习者表单要求 `switchPassword`；返回账号表单要求 `password`。

```ts
test("学习者菜单不暴露主账号管理入口", () => {
  const labels = learnerNavigationItems.map((item) => item.label);
  assert.deepEqual(labels, ["学习首页", "场景应用", "我的课程"]);
  for (const forbidden of ["账单明细", "组织账号", "个人资料", "学习者管理", "课程编排"]) {
    assert.equal(labels.includes(forbidden), false);
  }
});
```

- [ ] **Step 2: 运行 Web 测试并确认失败**

Run: `pnpm --filter @xueleai/web exec node --import tsx --test tests/profile-routing.test.ts tests/profile-presentation.test.ts`

Expected: FAIL，提示学习者导航或首页模型不存在。

- [ ] **Step 3: 实现两种安全切换 Server Action**

`enterLearnerAction` 从账号状态调用 `/profiles/enter-learner`，只提交目标 learnerId 且不提交密码。`switchLearnerAction` 只提交目标 learnerId 和 6 位 switchPassword；`returnToAccountAction` 只提交登录 password。成功时 Server Action 只读取 API 的安全 `Set-Cookie` 并覆盖浏览器 HttpOnly Cookie，然后跳转：学习者到 `/learn`，账号到 `/dashboard`；JSON 中没有 token。失败时不修改 Cookie，弹窗显示固定中文错误。

- [ ] **Step 4: 实现 `LearnerShell` 与学习者首页**

页面服务端调用 `requireLearnerProfile()`，账号模式访问 `/learn` 时跳 `/dashboard`，未选择时跳 `/select-profile`。首页按桌面和移动自然响应布局展示当前学习者、授权应用、授权课程和最近记录。空状态保持简短，不展示设计说明。

- [ ] **Step 5: 公共 Shell 显示当前身份并过滤场景应用页**

登录用户的账号菜单显示当前“我的账号”或学习者昵称。学习者访问 `/tools` 时从授权首页数据渲染场景卡片；账号或游客保留现有公开工具展示。每个授权场景的 href 使用服务端场景展示映射；未知自定义场景走 `/tools/{slug}`，不得把内部场景暴露为重复卡片。

给 `/tools/[slug]`、三个 `/creator/[id]`、`/media-tutor`、`/text2lesson`、`/gushiwen`、`/flashcard` 和四个 `/experience/*` 入口增加服务端身份守卫：`UNSELECTED` 去身份选择，`ACCOUNT` 保持原行为，`LEARNER` 必须命中对应授权根场景，否则显示/重定向到学习者首页的无权限状态。公开分享详情保持现有分享规则；账号私有详情和所有写 API 继续由后端按资源归属或课程授权校验，不能只保护列表页。

- [ ] **Step 6: 运行 Web 针对性测试与类型检查**

Run:

```bash
pnpm --filter @xueleai/web exec node --import tsx --test tests/profile-routing.test.ts tests/profile-presentation.test.ts tests/learner-management.test.ts
pnpm --filter @xueleai/web typecheck
```

Expected: 全部通过。

- [ ] **Step 7: 提交学习者界面任务**

```bash
git add apps/web/src/app/learn/page.tsx apps/web/src/components/profiles/learner-home.tsx apps/web/src/components/profiles/profile-switcher.tsx apps/web/src/components/shell/learner-shell.tsx apps/web/src/lib/profile-api.ts apps/web/src/lib/profile-routing.ts apps/web/src/components/shell/public-shell.tsx apps/web/src/components/shell/user-account-menu.tsx apps/web/src/app/tools/page.tsx 'apps/web/src/app/tools/[slug]/page.tsx' apps/web/src/app/media-tutor/page.tsx 'apps/web/src/app/media-tutor/creator/[id]/page.tsx' apps/web/src/app/text2lesson/page.tsx 'apps/web/src/app/text2lesson/creator/[id]/page.tsx' apps/web/src/app/gushiwen/page.tsx 'apps/web/src/app/gushiwen/creator/[id]/page.tsx' 'apps/web/src/app/flashcard/[[...segments]]/page.tsx' apps/web/src/app/experience/chat/page.tsx apps/web/src/app/experience/image/page.tsx apps/web/src/app/experience/video/page.tsx apps/web/src/app/experience/voice/page.tsx apps/web/tests/profile-routing.test.ts apps/web/tests/profile-presentation.test.ts
git commit -m "feat(web): add learner workspace and switching"
```

---

### Task 11: 完成真实 HTTP 闭环、主账号汇总筛选与浏览器验收

**Files:**
- Create: `apps/api-core/tests/learner-profile.e2e.test.ts`
- Modify: `apps/web/src/app/dashboard/page.tsx`
- Modify: `apps/web/src/app/dashboard/tasks/page.tsx`
- Modify: `apps/web/src/app/dashboard/video-guides/page.tsx`
- Modify: `apps/web/src/lib/ai-api.ts`
- Modify: `apps/web/src/lib/audio-api.ts`
- Modify: `apps/web/src/lib/video-guide-api.ts`
- Create: `apps/web/tests/learner-history-filter.test.ts`

**Interfaces:**
- Produces: 真实注册/登录 → 身份选择 → 管理 → 授权 → 切换 → 记录隔离 HTTP 验收。
- Produces: “我的账号”按全部、我的账号、具体学习者筛选历史。

- [ ] **Step 1: 写 e2e 失败流程**

沿用现有单进程 E2E 的真实 Nest app 与 Cookie jar 模式，但放入独立 `learner-profile.e2e.test.ts`，创建用户、钱包、两个学习者、两个场景和两门已发布/已加入课程。断言：

1. 新登录没有 profile Cookie，受保护业务返回“请先选择使用身份”。
2. 选择账号后创建两个学习者，授权可为空。
3. 账号无密码进入学习者 A。
4. A 无法使用未授权场景；授权后可创建记录且数据库 learnerId 为 A。
5. A 用错误/正确切换密码切到 B；B 看不到 A 记录。
6. B 用切换密码不能回账号，用登录密码可以。
7. 停用 B 后原 Cookie 失效；B 的历史仍可由账号查询。
8. 退出并重新登录后必须再次选择身份。

- [ ] **Step 2: 运行 e2e 并确认缺失闭环失败**

Run: `DATABASE_URL="postgresql://xueleai:xueleai_dev_password@localhost:3324/xueleai?schema=public" REDIS_URL="redis://localhost:3325" pnpm --filter @xueleai/api-core exec node --import tsx --test --test-concurrency=1 tests/learner-profile.e2e.test.ts`

Expected: 新增 profile 流程断言失败，测试清理逻辑仍能删除本文件创建的全部用户、学习者、授权、事件和业务记录。

- [ ] **Step 3: 实现主账号历史筛选 API 与 Web 查询参数**

账号历史筛选只允许：

```text
profile=all
profile=account
profile=learner:{属于当前用户的learnerId}
```

默认 `all`。`account` 转为 `learnerId: null`；具体学习者先验证所属再过滤；非法或跨用户值返回“学习者筛选无效”。Dashboard 最近任务、任务历史和视频导学列表接入同一筛选器，筛选控件显示“全部”“我的账号”和有效/已停用学习者分组。

- [ ] **Step 4: 运行 E2E 与 Web 历史测试**

Run:

```bash
DATABASE_URL="postgresql://xueleai:xueleai_dev_password@localhost:3324/xueleai?schema=public" REDIS_URL="redis://localhost:3325" pnpm --filter @xueleai/api-core exec node --import tsx --test --test-concurrency=1 tests/learner-profile.e2e.test.ts
pnpm --filter @xueleai/web exec node --import tsx --test tests/learner-history-filter.test.ts
```

Expected: 身份、授权、记录隔离和筛选测试全部通过。

- [ ] **Step 5: 启动本地服务执行浏览器验收**

Run:

```bash
docker compose -p xueleai up -d postgres redis
pnpm --filter @xueleai/api-core dev
pnpm --filter @xueleai/web dev
```

使用浏览器逐项验证设计文档第 14.2 节十个场景，重点查看 `/select-profile`、`/dashboard/learners`、`/learn`、密码弹窗、未授权直达和身份级历史。记录截图或逐项结果；不修改生产服务器。

- [ ] **Step 6: 提交闭环任务**

```bash
git add apps/api-core/tests/learner-profile.e2e.test.ts apps/web/src/app/dashboard/page.tsx apps/web/src/app/dashboard/tasks/page.tsx apps/web/src/app/dashboard/video-guides/page.tsx apps/web/src/lib/ai-api.ts apps/web/src/lib/audio-api.ts apps/web/src/lib/video-guide-api.ts apps/web/tests/learner-history-filter.test.ts
git commit -m "test: cover learner identity end to end"
```

---

### Task 12: 独立审查与最终验真

**Files:**
- Modify only files required by concrete review findings.

**Interfaces:**
- Consumes: Tasks 1–11 完整实现。
- Produces: 规格逐条覆盖证据、无未解决高优先级发现、全量验证结果。

- [ ] **Step 1: 执行工作区和迁移安全审查**

Run:

```bash
git status --short
git diff HEAD~11 --check
git diff HEAD~11 --stat
pnpm --filter @xueleai/database db:generate
pnpm --filter @xueleai/database typecheck
```

确认没有把原有无关改动纳入本功能提交；确认 migration 不含 DROP、TRUNCATE、reset 或旧记录 learnerId 回填。

- [ ] **Step 2: 请求独立代码审查**

调用 `superpowers:requesting-code-review`，要求审查者重点检查：身份 Cookie 可伪造性、跨用户 learnerId、未授权直达、账号专属 API、异步任务身份漂移、课程访问、历史泄漏、密码明文、迁移破坏性和事件重复计数。对每条发现先复现或验证，再按 `superpowers:receiving-code-review` 处理。

- [ ] **Step 3: 运行完整数据库与 API 验证**

Run:

```bash
pnpm --filter @xueleai/database test
pnpm --filter @xueleai/api-core test
pnpm --filter @xueleai/database typecheck
pnpm --filter @xueleai/api-core typecheck
pnpm --filter @xueleai/database lint
pnpm --filter @xueleai/api-core lint
pnpm --filter @xueleai/api-core build
```

Expected: 每条命令退出码 0，无失败测试和 TypeScript/ESLint 错误。

- [ ] **Step 4: 运行完整 Web 验证**

Run:

```bash
pnpm --filter @xueleai/web test
pnpm --filter @xueleai/web typecheck
pnpm --filter @xueleai/web lint
pnpm --filter @xueleai/web build
```

Expected: 每条命令退出码 0，Next build 成功生成 `/select-profile`、`/dashboard/learners` 和 `/learn`。

- [ ] **Step 5: 对照规格逐项验真**

逐条重读 `docs/superpowers/specs/2026-08-13-learner-profiles-and-context-design.md`，把每个要求映射到代码、测试或浏览器验收结果。若任何要求没有证据，回到对应任务补测试和实现，不以“测试大部分通过”替代规格覆盖。

- [ ] **Step 6: 提交审查修复**

若有修复，先为每条确认的问题补一条会失败的测试，并在该条审查记录中写明准确文件路径；实现和验证后仅用这些准确路径逐个 `git add`，再执行 `git commit -m "fix: harden learner identity boundaries"`。不得使用 `git add -A`、`git add .` 或预先猜测文件范围。若无修复，不创建空提交。

- [ ] **Step 7: 使用 verification-before-completion 做最终报告**

报告必须包含：修改文件分组、数据库 migration、测试/类型检查/lint/build 的最新命令和结果、浏览器十项验收结果、未执行的线上发布。没有执行 GitHub 推送和服务器部署时，明确说明“未发布”，不得说明线上已完成。
