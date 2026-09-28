# 英文带学学习闭环 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将英文带学学习页从长文播放器升级为真实逐句带学、单题练习、错题回炉和学习总结组成的完整学习闭环。

**Architecture:** 后端把原文稳定切分为语法句并为旧材料生成兼容句级时间轴；前端把可测试的学习状态计算放入独立工具模块，页面组件只负责媒体控制和界面状态。学习进度保存在当前浏览器，分享页仍保持无登录可访问。

**Tech Stack:** NestJS、Next.js App Router、React 19、TypeScript、TailwindCSS、Node Test Runner。

## Global Constraints

- 所有用户界面和错误提示使用简体中文。
- 复用现有 shadcn/ui 和 lucide-react，不新增运行时依赖。
- 不修改数据库 schema，不影响登录、支付和权限流程。
- 本轮不重构音频资产存储；临时签名 URL 转存由后续音频基础设施专项处理。

---

### Task 1: 真实逐句切分

**Files:**
- Create: `apps/api-core/src/english-guided-study/english-guided-study-segmentation.ts`
- Create: `apps/api-core/tests/english-guided-study-segmentation.test.ts`
- Modify: `apps/api-core/src/english-guided-study/english-guided-study.service.ts`

**Interfaces:**
- Produces: `buildEnglishStudySourceSegments(sourceText: string): EnglishStudySourceSegment[]`

- [ ] 写入测试，断言多个英语语法句不会再合并成一个学习单元，并覆盖引号、缩写和超长句。
- [ ] 运行 `pnpm --filter @xueleai/api-core exec node --import tsx --test tests/english-guided-study-segmentation.test.ts`，确认因模块不存在而失败。
- [ ] 使用 `Intl.Segmenter` 与标点回退实现稳定切分，服务改用新函数。
- [ ] 再次运行测试并确认通过。

### Task 2: 可测试的学习状态

**Files:**
- Create: `apps/web/src/lib/english-guided-study-learning.ts`
- Create: `apps/web/tests/english-guided-study-learning.test.ts`
- Modify: `apps/web/package.json`

**Interfaces:**
- Produces: `expandLegacyStudySentences`、`completedStudySentenceCount`、`practiceResult`、`nextPracticeQuestionIndex`。

- [ ] 写入测试，覆盖旧材料拆句、完成句数、未答题定位和错题统计。
- [ ] 运行前端单测并确认因工具模块不存在而失败。
- [ ] 实现最小工具函数并将前端测试脚本接入 Node Test Runner。
- [ ] 运行前端单测并确认通过。

### Task 3: 句级带学播放器

**Files:**
- Modify: `apps/web/src/components/experience/english-guided-study-learning-player.tsx`

**Interfaces:**
- Consumes: Task 2 的句级材料与进度工具。

- [ ] 使用兼容后的句子和时间轴渲染文章，当前句自动滚动到视口中部。
- [ ] 固定播放器增加上一句、重听本句、下一句和单句循环；保留倍速、全文循环和全局进度。
- [ ] 右侧学习进度改为桌面吸顶、移动端前置，分享和返回操作压缩为图标按钮。
- [ ] 使用 `localStorage` 持久化播放位置、速度、答案和练习结果。

### Task 4: 单题练习与错题回炉

**Files:**
- Modify: `apps/web/src/components/experience/english-guided-study-learning-player.tsx`

**Interfaces:**
- Consumes: Task 2 的练习结果和下一题计算函数。

- [ ] 每次只展示一道题，提供 1-10 题号导航、上一题、下一题和未答题定位。
- [ ] 提交后显示正确答案与讲解，并自动定位第一道错题。
- [ ] 提供“重做错题”，只清空错题答案；全部答对后展示完成总结和重点复习项。
- [ ] 为选项增加 `aria-pressed`，为学习阶段增加 `aria-current`，速度菜单支持 Esc 关闭。

### Task 5: 验收

**Files:**
- Verify only.

- [ ] 运行后端目标测试与 `pnpm --filter @xueleai/api-core typecheck`。
- [ ] 运行前端目标测试、`pnpm --filter @xueleai/web typecheck` 和目标文件 ESLint。
- [ ] 在 `http://localhost:3321/study/english-guided-study/<material-id>` 验证逐句、播放器、练习、错题和响应式布局。
- [ ] 检查 `git diff --check`，确认未改动无关文件。
