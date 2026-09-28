# AI 学习闪卡真实一期闭环 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `/experience/ai-learning-flashcards` 从前台交互原型升级为可登录、可生成、可保存、可学习的 AI 学习闪卡场景应用。

**Architecture:** 复用现有 `AiService.generateScenarioTextForExternalBilling`、教材 `LearningMaterialTextbook` 和 Next API 代理模式。新增 NestJS `learning-flashcards` 模块保存卡组、卡片和学习反馈；前端组件从本地模拟状态切到真实 API，并保留当前工作台与沉浸学习体验。

**Tech Stack:** Next.js App Router、TypeScript、TailwindCSS、NestJS、Prisma、PostgreSQL、现有 AI 场景扣点体系。

## Global Constraints

- 前台页面、按钮、错误提示和 seed/内置数据使用简体中文。
- 固定端口继续使用 `3321` Web、`3322` API Core、`3324` PostgreSQL。
- AI 工具页面继续遵循 `/experience/voice` 工作台布局：左栏 292px，中栏自适应，右栏 360px。
- 页面说明文字默认不常态展开，必要说明使用 `Info` 图标 tooltip/popover。
- 第一版不做多语言、Stripe/Paddle、复杂权限、RAG 知识库、APP、小程序。
- 第一版上传材料支持文本/Markdown 和导入 CSV/JSON；PDF/DOCX 解析后置。

---

### Task 1: 数据模型和结构化生成核心

**Files:**
- Modify: `packages/database/prisma/schema.prisma`
- Create: `packages/database/prisma/migrations/<timestamp>_learning_flashcards/migration.sql`
- Create: `apps/api-core/src/learning-flashcards/learning-flashcards-generator.ts`
- Test: `apps/api-core/tests/learning-flashcards-generator.test.ts`

**Interfaces:**
- Produces: `buildFallbackFlashcardDeck(input: FlashcardGenerationInput): GeneratedFlashcardDeck`
- Produces: `parseGeneratedFlashcardDeck(text: string, fallbackInput: FlashcardGenerationInput): GeneratedFlashcardDeck`
- Database produces `LearningFlashcardDeck`, `LearningFlashcard`, `LearningFlashcardReview`.

- [ ] Write failing tests for JSON parsing fallback and card normalization.
- [ ] Add Prisma enums/models and SQL migration.
- [ ] Implement generator helper with deterministic fallback.
- [ ] Run `pnpm --filter @xueleai/api-core test -- learning-flashcards-generator.test.ts`.

### Task 2: NestJS API 模块

**Files:**
- Create: `apps/api-core/src/learning-flashcards/dto/learning-flashcards.dto.ts`
- Create: `apps/api-core/src/learning-flashcards/learning-flashcards.service.ts`
- Create: `apps/api-core/src/learning-flashcards/learning-flashcards.controller.ts`
- Create: `apps/api-core/src/learning-flashcards/learning-flashcards.module.ts`
- Modify: `apps/api-core/src/app.module.ts`
- Modify: `apps/api-core/src/ai/ai.service.ts`
- Test: `apps/api-core/tests/learning-flashcards-generator.test.ts`

**Interfaces:**
- `GET /learning-flashcards/decks`
- `GET /learning-flashcards/decks/:id`
- `POST /learning-flashcards/decks/generate`
- `POST /learning-flashcards/decks/import`
- `PATCH /learning-flashcards/cards/:id`
- `POST /learning-flashcards/cards/:id/review`

- [ ] Add DTO validation for source, strategy, card types, range and review grade.
- [ ] Implement deck listing/detail scoped by `userId`.
- [ ] Generate deck from textbook markdown, uploaded text, or imported cards.
- [ ] Persist AI task id/provider/model on deck.
- [ ] Add built-in AI scenario `learning-flashcards-deck`.

### Task 3: Web API and真实前端数据流

**Files:**
- Create: `apps/web/src/lib/learning-flashcards-api.ts`
- Create: `apps/web/src/app/api/learning-flashcards/decks/route.ts`
- Create: `apps/web/src/app/api/learning-flashcards/decks/generate/route.ts`
- Create: `apps/web/src/app/api/learning-flashcards/decks/import/route.ts`
- Create: `apps/web/src/app/api/learning-flashcards/decks/[id]/route.ts`
- Create: `apps/web/src/app/api/learning-flashcards/cards/[id]/route.ts`
- Create: `apps/web/src/app/api/learning-flashcards/cards/[id]/review/route.ts`
- Modify: `apps/web/src/components/experience/learning-flashcards-console.tsx`
- Modify: `apps/web/src/app/experience/ai-learning-flashcards/page.tsx`

**Interfaces:**
- Frontend consumes `LearningFlashcardDeck`, `LearningFlashcard`, `generateLearningFlashcardDeck`, `importLearningFlashcardDeck`, `reviewLearningFlashcard`.

- [ ] Add Next proxy routes using the existing cookie forwarding pattern.
- [ ] Load user decks into left history.
- [ ] Use real textbook filters and selected textbook id.
- [ ] Generate/import decks through API.
- [ ] Save card edits and review grades through API.
- [ ] Keep fallback demo data only for anonymous/service-unavailable states.

### Task 4: Verification

**Commands:**
- `pnpm --filter @xueleai/database build`
- `pnpm --filter @xueleai/api-core test`
- `pnpm --filter @xueleai/api-core typecheck`
- `pnpm --filter @xueleai/web typecheck`
- `pnpm --filter @xueleai/web build`

**Browser checks:**
- `/experience/ai-learning-flashcards` loads.
- Logged-in user can generate a deck from an electronic textbook.
- Imported CSV/JSON cards create a deck.
- Left history opens saved decks.
- Study mode records `HARD` / `BLURRY` / `MASTERED`.
