# 学习场景 TTS 精确计费 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让带学、全文诵读、开卷导读和视频导学严格按实际 TTS 节点文本计费，并在界面区分准确 TTS 消耗与其他预估费用。

**Architecture:** 带学服务建立一个从已保存材料构造最终讲解节点的单一入口，报价、修订校验和合成均复用该入口；全文诵读直接按源单元数组计数。视频导学把现有 TTS 文本规范化提前为可复用的 prepared-node 入口，报价、断点结算和合成统一使用规范化节点。

**Tech Stack:** NestJS、TypeScript、Node test runner、Next.js、React。

**Spec:** `docs/superpowers/specs/2026-08-28-exact-learning-tts-billing-design.md`

## Global Constraints

- 不修改数据库 schema、点数单价环境变量或流水幂等键。
- 上传全文诵读音频不收 TTS 费用，独立按 ASR 每起算一分钟 2 点计费。
- 保留 API 字段 `estimatedCredits` 以兼容现有客户端。
- 保留当前 worktree 中右栏连续播放的未提交修改。
- 因同一前端文件包含上一项未提交修复，本计划不做中途提交；只在用户明确要求发布时统一提交。

---

### Task 1: 带学与全文诵读精确字符计划

**Files:**
- Modify: `apps/api-core/src/english-guided-study/english-guided-study-billing.ts`
- Modify: `apps/api-core/src/english-guided-study/english-guided-study.service.ts`
- Test: `apps/api-core/tests/english-guided-study-billing.test.ts`
- Test: `apps/api-core/tests/english-guided-study-regeneration.test.ts`

**Interfaces:**
- Produces: `englishGuidedStudyTtsBillingText(texts: string[])`，返回不含节点分隔符的准确计费文本信息。
- Produces: 服务内部讲解节点计划，供报价、修订和合成复用。

- [ ] **Step 1: 写失败测试**

  增加手算断言：`["甲", "乙丙"]` 的计费字符为 3 而不是拼接换行后的 4；全文诵读标题、作者、正文也按各单元长度求和。

- [ ] **Step 2: 验证测试因旧整稿计数失败**

  Run: `pnpm --filter @xueleai/api-core exec node --import tsx --test tests/english-guided-study-billing.test.ts tests/english-guided-study-regeneration.test.ts`

- [ ] **Step 3: 最小实现**

  把讲解报价输入从 `material.narration` 改为实际 `nodeDrafts.map(node => node.script)`；把全文诵读报价输入从 `units.map(...).join("\n")` 改为单元文本数组。局部编辑使用实际目标 drafts，并让修订值包含同一文本数组。

- [ ] **Step 4: 验证针对性测试通过**

  Run: `pnpm --filter @xueleai/api-core exec node --import tsx --test tests/english-guided-study-billing.test.ts tests/english-guided-study-regeneration.test.ts`

### Task 2: 视频导学使用规范化后的实际 TTS 节点

**Files:**
- Modify: `apps/api-core/src/video-guide/video-guide-generation-state.ts`
- Modify: `apps/api-core/src/video-guide/video-guide.service.ts`
- Test: `apps/api-core/tests/video-guide-narration-billing.test.ts`
- Test: `apps/api-core/tests/video-guide-narration-edit.test.ts`
- Test: `apps/api-core/tests/video-guide-narration-timeline.test.ts`

**Interfaces:**
- Produces: `preparedNarrationTtsNodes(content)` 或等价单一入口，节点脚本已经完成 Markdown 清理、空行规范化和长度限制。
- Consumes: 现有 `narrationTtsCreditsForCompletedNodes`，只替换其节点输入。

- [ ] **Step 1: 写失败测试**

  使用 `"# 标题\n- 内容"` 和超过 8000 字符的节点，手算实际 TTS 文本长度，断言完整报价与单句编辑报价不包含被清理或截断的字符。

- [ ] **Step 2: 验证测试因处理前计数失败**

  Run: `pnpm --filter @xueleai/api-core exec node --import tsx --test tests/video-guide-narration-billing.test.ts tests/video-guide-narration-edit.test.ts tests/video-guide-narration-timeline.test.ts`

- [ ] **Step 3: 最小实现**

  抽取并导出 TTS 文本规范化函数或 prepared-node 构造器，使报价、修订、断点已完成点数和 `synthesizeNarrationTimeline` 使用完全相同的节点脚本。

- [ ] **Step 4: 验证视频导学针对性测试通过**

  Run: `pnpm --filter @xueleai/api-core exec node --import tsx --test tests/video-guide-narration-billing.test.ts tests/video-guide-narration-edit.test.ts tests/video-guide-narration-timeline.test.ts`

### Task 3: TTS 确认界面使用准确消耗文案

**Files:**
- Modify: `apps/web/src/components/experience/english-guided-study-console.tsx`
- Modify: `apps/web/src/components/experience/reading-guide-console.tsx`
- Modify: `apps/web/src/components/experience/video-guide-console.tsx`
- Test: `apps/web/tests/english-guided-study-billing.test.ts`
- Test: `apps/web/tests/video-guide-billing.test.ts`

**Interfaces:**
- Consumes: 现有 estimate `operation` 字段判断是否为 TTS。
- Produces: TTS 显示“本次消耗”，非 TTS 保留“本次预计消耗”。

- [ ] **Step 1: 写失败测试**

  断言三个工作台对 TTS 操作显示准确消耗语义，同时文稿生成仍显示预计语义。

- [ ] **Step 2: 验证前端测试因旧“预计”文案失败**

  Run: `pnpm --filter @xueleai/web test -- english-guided-study-billing.test.ts video-guide-billing.test.ts`

- [ ] **Step 3: 最小修改界面条件文案**

  带学与开卷导读通过 `operation === "ENGLISH_GUIDED_STUDY_TTS"` 判断；视频导学通过 `operation === "VIDEO_GUIDE_NARRATION_TTS"` 判断。

- [ ] **Step 4: 验证前端针对性测试与类型检查通过**

  Run: `pnpm --filter @xueleai/web test -- english-guided-study-billing.test.ts video-guide-billing.test.ts`
  Run: `pnpm --filter @xueleai/web typecheck`

### Task 4: 严格回归与自查

**Files:**
- Verify all modified files from Tasks 1-3.

**Interfaces:**
- Consumes: Tasks 1-3 completed behavior.
- Produces: 可交付的计费修复及验证记录。

- [ ] **Step 1: 运行 API 全量测试和类型检查**

  Run: `pnpm --filter @xueleai/api-core test`
  Run: `pnpm --filter @xueleai/api-core typecheck`

- [ ] **Step 2: 运行 Web 全量测试和类型检查**

  Run: `pnpm --filter @xueleai/web test`
  Run: `pnpm --filter @xueleai/web typecheck`

- [ ] **Step 3: 运行相关 lint 与构建**

  Run: `pnpm --filter @xueleai/api-core lint`
  Run: `pnpm --filter @xueleai/web lint`
  Run: `pnpm --filter @xueleai/api-core build`
  Run: `pnpm --filter @xueleai/web build`

- [ ] **Step 4: 自查变更**

  核对上传音频按服务端真实时长每起算一分钟 2 点、识别失败释放冻结点数、没有数据库迁移，并确认 `git diff --check` 无格式错误。
