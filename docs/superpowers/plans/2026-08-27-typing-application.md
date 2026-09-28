# 打字记词 `/typing` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use Markdown checkbox syntax for tracking.

**Goal:** 基于平台公共英文内容库实现可浏览、可练习、可恢复、可复习的“打字记词”首版闭环。

**Architecture:** 复用 `EnglishContentLibrary/Unit/Item/AcceptedAnswer/Media` 作为只读内容层，新增 `Typing*` 身份隔离业务表保存会话、尝试、偏好和记忆阶段。NestJS 统一执行授权、答案校验、幂等写入和调度；Next.js 通过同源 `/api/typing` 代理消费接口，并用独立沉浸式练习界面呈现横线输入、音频、图片、提示和讲解。

**Tech Stack:** Next.js 16 App Router、React 19、TypeScript、TailwindCSS、NestJS 11、Prisma 7、PostgreSQL、Node.js test。

**Spec:** `docs/typing-application-requirements.md`

## Global Constraints

- 前后台和错误提示只使用简体中文。
- `/typing` 可匿名浏览；创建与操作会话必须登录并使用服务端解析的 `ProfileSubject`。
- 学习者身份必须通过 `LearnerAccessService.assertScenarioAuthorized(subject, "typing")`。
- 客户端不得指定 `userId`、`learnerId`、`subjectKey`、正确性、记忆阶段或 `dueAt`。
- 当前题答对前不得返回标准答案、英文 token、音标或答案快照。
- `TypingAttempt` 不保存完整用户答案，只保存错误类型、错误位置、耗时和提示级别。
- 端口、统一 API 响应、现有支付/钱包/CMS/AI Gateway 均保持不变。
- 用户现有 AI 场景删除改动不得覆盖或重构。

---

### Task 1: Typing 业务模型与迁移

**Files:**
- Modify: `packages/database/prisma/schema.prisma`
- Modify: `packages/database/src/index.ts`
- Create: `packages/database/prisma/typing-schema-contract.test.ts`
- Create: `packages/database/prisma/migrations/20260827210000_typing_practice/migration.sql`

**Interfaces:**
- Consumes: `User`、`Learner`、`EnglishContentLibrary`、`EnglishContentUnit`、`EnglishContentItem`。
- Produces: `TypingLibraryProgress`、`TypingPracticeSession`、`TypingPracticeSessionItem`、`TypingAttempt`、`TypingReviewState`、`TypingPreference` 及相关枚举。

- [x] **Step 1: 写 schema contract 失败测试**

测试必须断言六个模型、`subjectKey + libraryId/itemId` 唯一键、`clientAttemptId` 唯一键、会话归属关系和级联删除规则。

- [x] **Step 2: 运行 RED**

Run: `pnpm --filter @xueleai/database exec node --import tsx --test prisma/typing-schema-contract.test.ts`

Expected: FAIL，提示缺少 `TypingPracticeSession`。

- [x] **Step 3: 添加模型和纯增量迁移**

会话保存 `clientSessionKey/currentIndex/activeSeconds`，会话题保存 `answerSnapshot/itemVersion/hintLevel/lastErrorTokenIndex`，尝试只保存结构化错误，复习状态保存 `algorithmVersion/stage/dueAt`。

- [x] **Step 4: 生成客户端并运行 GREEN**

Run: `pnpm db:generate && pnpm --filter @xueleai/database exec node --import tsx --test prisma/typing-schema-contract.test.ts`

Expected: PASS。

### Task 2: 答案比较与记忆调度纯函数

**Files:**
- Create: `apps/api-core/src/typing/typing-answer.ts`
- Create: `apps/api-core/src/typing/typing-review.ts`
- Create: `apps/api-core/src/typing/typing.types.ts`
- Create: `apps/api-core/tests/typing-answer.test.ts`
- Create: `apps/api-core/tests/typing-review.test.ts`

**Interfaces:**
- Produces: `tokenizeTypingAnswer(text)`、`compareTypingAnswer(expected, actual)`、`scheduleTypingReview(input)`。
- `compareTypingAnswer` 返回 `correct/errorTypes/tokenResults/firstErrorTokenIndex`，字符错误只返回下标和类型。

- [x] **Step 1: 写答案规范化和差异定位失败测试**

覆盖正确、拼写、大小写、标点、空格、不完整输入、连字符和撇号词。

- [x] **Step 2: 写阶段前进/后退失败测试**

覆盖新词首答、首次错误、阶段 0 重学、到期复习、提示阻止前进、阶段 6 顺延 90 天。

- [x] **Step 3: 运行 RED**

Run: `pnpm --filter @xueleai/api-core test -- typing-answer typing-review`

Expected: FAIL，模块不存在。

- [x] **Step 4: 实现纯函数并运行 GREEN**

Run: `pnpm --filter @xueleai/api-core test -- typing-answer typing-review`

Expected: PASS。

### Task 3: Typing 场景注册、身份路由与内容发布

**Files:**
- Create: `packages/database/prisma/typing-scenario.ts`
- Create: `packages/database/prisma/sync-typing-scenario.ts`
- Modify: `packages/database/prisma/seed.ts`
- Modify: `packages/database/prisma/import-typing-wordlist.ts`
- Modify: `packages/database/package.json`
- Modify: `package.json`
- Modify: `apps/api-core/src/profiles/learner-access.service.ts`
- Modify: `apps/web/src/lib/profile-routing.ts`
- Modify: `apps/web/src/components/profiles/learner-authorization-form.tsx`
- Modify: `apps/web/src/components/shell/public-shell.tsx`
- Test: `apps/api-core/tests/learner-access.test.ts`
- Test: `apps/web/tests/profile-routing.test.ts`

**Interfaces:**
- Produces: 内置场景 `slug=typing`、`costCredits=0`、`requiredCapabilities=[]`、入口 `/typing`。
- 导入器把目标公共内容库和单元写为 `PUBLISHED`，不改变媒体待生成状态。

- [x] **Step 1: 扩充路由/授权测试并确认 RED**

断言 `learnerScenarioHref("typing") === "/typing"`、`applicationRootForPath("/typing/practice/x") === "typing"`，且授权目录可返回 `/typing`。

- [x] **Step 2: 实现场景数据、同步脚本和路径映射**

Seed 与独立同步脚本复用同一份 `typingScenarioData`，不修改 `AiService` 的用户现有代码。

- [x] **Step 3: 发布目标内容库并同步本地数据**

Run: `pnpm typing:sync-scenario && pnpm typing:import-yl-7a --apply`

Expected: 场景可授权，内容库状态为 `PUBLISHED`。

### Task 4: 内容库与练习会话 API

**Files:**
- Create: `apps/api-core/src/typing/dto/typing.dto.ts`
- Create: `apps/api-core/src/typing/typing.controller.ts`
- Create: `apps/api-core/src/typing/typing.service.ts`
- Create: `apps/api-core/src/typing/typing.module.ts`
- Modify: `apps/api-core/src/app.module.ts`
- Create: `apps/api-core/tests/typing-service.test.ts`
- Create: `apps/api-core/tests/typing-privacy.test.ts`

**Interfaces:**
- Public: `GET /api/typing/libraries`、`GET /api/typing/libraries/:id`。
- Authorized: 创建/恢复/查询/提交/提示/前进/暂停/恢复/结束会话。
- 当前题只返回中文、媒体 URL、词槽长度和固定标点；答对或三级提示后才返回讲解。

- [x] **Step 1: 写隐私、身份和幂等失败测试**

测试当前题 DTO 不含答案；相同 `clientAttemptId` 只创建一次尝试；学习者无 `typing` 授权时拒绝。

- [x] **Step 2: 实现内容库查询和主体解析**

筛选项从已发布库关联教材推导；所有写操作经 `AuthService.me`、`ProfileContextService.requireSelected` 和场景授权。

- [x] **Step 3: 实现会话队列和当前题呈现**

到期复习优先，其次未学习内容；会话题固化答案和内容版本；同一 `subjectKey` 最多一个 ACTIVE/PAUSED 会话。

- [x] **Step 4: 实现提交、提示、前进与恢复**

事务内创建尝试、更新题目/会话/进度/复习状态；错误题最多附加一次至少间隔三题的重学项。

- [x] **Step 5: 运行 API 测试和类型检查**

Run: `pnpm --filter @xueleai/api-core test -- typing && pnpm --filter @xueleai/api-core typecheck`

Expected: PASS。

### Task 5: 复习、历史和偏好 API

**Files:**
- Modify: `apps/api-core/src/typing/typing.controller.ts`
- Modify: `apps/api-core/src/typing/typing.service.ts`
- Create: `apps/api-core/tests/typing-review-api.test.ts`

**Interfaces:**
- Produces: `/reviews/summary`、`/reviews`、`/reviews/sessions`、`/reviews/:itemId/reset`、`/history`、`GET/PUT /preferences`。
- 学习者身份通过 `LearnerActivityService` 写入不含答案正文的 `LEARNING_STARTED/PRACTICE_SUBMITTED/LEARNING_COMPLETED` 汇总事件。

- [x] **Step 1: 写身份隔离和汇总失败测试**

同一主账号下两个学习者必须得到不同的 due/mastered/history 结果。

- [x] **Step 2: 实现复习、历史、重置和偏好接口**

列表只使用当前服务端主体；重置接口要求正文 `{ "confirm": true }`，只删除当前身份与指定内容项的复习状态并重算内容库进度。学习活动指标只写正确性、错误类型计数、提示级别、耗时和阶段，不写用户输入或标准答案。

- [x] **Step 3: 运行 GREEN**

Run: `pnpm --filter @xueleai/api-core test -- typing-review-api`

Expected: PASS。

### Task 6: Next.js 数据层与同源代理

**Files:**
- Create: `apps/web/src/lib/typing-api.ts`
- Create: `apps/web/src/app/api/typing/[...path]/route.ts`
- Create: `apps/web/src/lib/typing-practice-state.ts`
- Create: `apps/web/tests/typing-practice-state.test.ts`

**Interfaces:**
- `typingApiFetch<T>(path, init)` 用于浏览器同源请求。
- `getTypingLibraries/getTypingLibrary` 用于 Server Component。
- `typingPracticeReducer` 管理 READY/TYPING/CHECKING/INCORRECT/CORRECT_REVEAL/COMPLETED。

- [x] **Step 1: 写状态机和代理路径失败测试**

覆盖 Enter 提交/下一题、错误回到输入、提示状态和完成状态。

- [x] **Step 2: 实现 API 类型、服务端请求和 catch-all 代理**

代理只允许 GET/POST/PUT，把 Cookie 转发到 `API_BASE_URL`，网络失败返回统一中文 JSON。

- [x] **Step 3: 实现纯状态机并运行测试**

Run: `pnpm --filter @xueleai/web test -- typing-practice-state`

Expected: PASS。

### Task 7: `/typing` 列表与详情页面

**Files:**
- Create: `apps/web/src/app/typing/page.tsx`
- Create: `apps/web/src/app/typing/libraries/[libraryId]/page.tsx`
- Create: `apps/web/src/components/typing/typing-library-browser.tsx`
- Create: `apps/web/src/components/typing/typing-library-detail.tsx`

**Interfaces:**
- 首页展示筛选、内容库卡片、今日复习入口。
- 详情页展示单元题量和练习按钮；匿名点击跳登录，已登录创建会话后跳练习页。

- [x] **Step 1: 实现列表页和筛选交互**

使用简洁内容页结构，不使用营销 Hero；卡片展示译林版、七年级、上册、8 单元和 410 题。

- [x] **Step 2: 实现详情页和创建会话交互**

题量支持 10/20/30/全部；处理可恢复会话冲突并提供继续入口。

- [x] **Step 3: 运行 Web 类型检查**

Run: `pnpm --filter @xueleai/web typecheck`

Expected: PASS。

### Task 8: 沉浸式练习、复习和历史页面

**Files:**
- Create: `apps/web/src/app/typing/practice/[sessionId]/page.tsx`
- Create: `apps/web/src/app/typing/review/page.tsx`
- Create: `apps/web/src/app/typing/history/page.tsx`
- Create: `apps/web/src/components/typing/typing-practice-console.tsx`
- Create: `apps/web/src/components/typing/typing-review-dashboard.tsx`
- Create: `apps/web/src/components/typing/typing-history-list.tsx`

**Interfaces:**
- 练习页实现多输入槽、自动播音、错误位置、三级提示、快捷键、讲解和 Enter 前进。
- 复习页显示今日/明日/掌握统计并可开始复习；历史页显示最近会话。

- [x] **Step 1: 实现练习控制台**

使用实际 `<input>`，关闭 spellCheck/autoCorrect/autoComplete；支持 Space 切槽、空槽 Backspace 回退、`Shift+Space`、`Ctrl/⌘+/`、`Esc` 和 `Enter`。

- [x] **Step 2: 实现讲解、错误和提示状态**

图片缺失时收拢；音频失败仅提示且不阻塞；颜色之外同时显示中文错误文字和图标。

- [x] **Step 3: 实现复习与历史页面**

页面只展示与当前操作有关的信息，复用现有卡片、按钮和徽章组件；单项重置必须先弹出二次确认，再调用确认参数接口。

- [x] **Step 4: 运行 Web 测试、类型检查和构建**

Run: `pnpm --filter @xueleai/web test && pnpm --filter @xueleai/web typecheck && pnpm --filter @xueleai/web build`

Expected: PASS。

### Task 9: 迁移、端到端和浏览器验收

**Files:**
- Modify: `docs/superpowers/plans/2026-08-27-typing-application.md`

**Interfaces:**
- Produces: 本地可访问 `/typing`、详情、练习、复习、历史闭环及验收证据。

- [x] **Step 1: 单独应用本任务迁移**

本地存在用户未完成迁移时，不运行会顺带应用它的 `migrate deploy`；使用 `prisma db execute` 和 `migrate resolve --applied` 只登记本任务迁移。

- [x] **Step 2: 运行针对性与全仓库类型检查**

Run: `pnpm --filter @xueleai/database test && pnpm --filter @xueleai/api-core test -- typing && pnpm --filter @xueleai/web test && pnpm typecheck`

Expected: PASS。

- [x] **Step 3: Chrome 浏览器验收核心闭环**

通过 `http://localhost:3321/typing` 验证库列表、Unit 1 图片与音频、错误提示、三级提示、答对讲解、Enter 下一题、暂停恢复、复习和历史；用参考截图组合对照验证桌面视觉状态。

- [x] **Step 4: 自审 diff 与隐私**

确认无答案正文进入 `TypingAttempt` 或日志、无密钥/环境变量入库、未改支付/钱包/CMS/AI Gateway、未覆盖用户 AI 场景改动。
