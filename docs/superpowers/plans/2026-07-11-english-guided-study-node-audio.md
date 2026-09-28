# 英文带学节点音频 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用真实节点音频身份直接驱动英文带学句子和词语高亮，彻底移除节点材料中的估算时间轴。

**Architecture:** 后端将 AI 输出解析为导入、逐句教学块和总结节点，为每个节点独立生成 TTS 并读取真实时长，全部成功后原子写入材料 JSON。前端通过当前节点的 `sentenceId` 和 `focus` 决定高亮，通过真实节点时长计算总进度；旧材料保留原音频，用户重新生成后切换到 V2。

**Tech Stack:** NestJS、Prisma JSON、现有 AudioService、ffprobe、Next.js、React、TypeScript、Node Test Runner。

## Global Constraints

- 所有界面、校验和错误提示使用简体中文。
- 不修改数据库 schema，不创建 migration。
- 新节点音频全部成功前不得覆盖材料旧音频。
- 节点材料禁止使用文本长度估算开始和结束时间。
- 复用现有 TTS 模型、音色、速度和语音任务计费流程。

---

### Task 1: 节点协议和严格解析

**Files:**
- Create: `apps/api-core/src/english-guided-study/english-guided-study-narration-nodes.ts`
- Create: `apps/api-core/tests/english-guided-study-narration-nodes.test.ts`

**Interfaces:**
- Produces: `parseEnglishNarrationNodeDrafts(aiText, sentences)`、`EnglishNarrationNodeDraft`、`EnglishNarrationNode`。

- [ ] 写失败测试，覆盖全文句子、焦点词归属、导入总结和非法 JSON。
- [ ] 运行目标测试并确认模块不存在导致失败。
- [ ] 实现严格解析器，每句一至四个节点，禁止缺句和未知 `focusPointId`。
- [ ] 运行目标测试并确认通过。

### Task 2: AI 节点文稿场景

**Files:**
- Modify: `apps/api-core/src/ai/ai.service.ts`

**Interfaces:**
- Produces: built-in scenario `english-guided-study-narration-nodes`。

- [ ] 在现有 AI 场景测试中加入新场景断言并观察失败。
- [ ] 增加场景注册、模型绑定、变量和严格 JSON Prompt。
- [ ] Prompt 要求每个句子完整覆盖，`focusPointId` 只能引用输入词语点。
- [ ] 运行 AI 场景相关测试和类型检查。

### Task 3: 节点 TTS、真实时长和原子切换

**Files:**
- Create: `apps/api-core/src/english-guided-study/english-guided-study-audio-duration.ts`
- Create: `apps/api-core/tests/english-guided-study-audio-duration.test.ts`
- Modify: `apps/api-core/src/english-guided-study/english-guided-study.service.ts`

**Interfaces:**
- Produces: `probeAudioDurationMs(url)`；材料 `content.narrationTimelineV2 = { version: 2, nodes }`。

- [ ] 写失败测试，验证真实时长解析和节点累计时长，不接受估算值。
- [ ] 实现 ffprobe 读取；Provider 有时长时优先使用 Provider，否则探测 URL。
- [ ] 音频接口先调用节点 AI 场景，再逐节点执行现有 TTS 任务。
- [ ] 所有节点成功后一次更新材料；失败时不更新材料旧音频字段。
- [ ] 更新公开材料判断，使 V2 首节点音频可分享。

### Task 4: 前端节点播放状态

**Files:**
- Modify: `apps/web/src/lib/english-guided-study-data.ts`
- Modify: `apps/web/src/lib/english-guided-study-api.ts`
- Modify: `apps/web/src/lib/english-guided-study-public-api.ts`
- Modify: `apps/web/src/lib/english-guided-study-learning.ts`
- Modify: `apps/web/tests/english-guided-study-learning.test.ts`

**Interfaces:**
- Produces: `narrationTimelineV2` 类型、`nodePositionAtGlobalTime`、`globalTimeForNode`、句级节点导航函数。

- [ ] 写失败测试，覆盖累计进度、拖动定位、上一句、下一句和单句循环边界。
- [ ] 实现节点播放纯函数并通过测试。
- [ ] API 映射保留 V2 数据，旧材料继续返回 legacy 字段。

### Task 5: 节点播放器和重新生成入口

**Files:**
- Modify: `apps/web/src/components/experience/english-guided-study-learning-player.tsx`
- Modify: `apps/web/src/components/experience/english-guided-study-console.tsx`

**Interfaces:**
- Consumes: V2 节点及 Task 4 播放纯函数。

- [ ] V2 播放器使用当前节点 `sentenceId/focus` 高亮，不读取旧句子时间。
- [ ] 节点结束自动切换；拖动、倍速、暂停、上一句、下一句和循环均保持正确节点。
- [ ] 导入和总结节点不高亮正文。
- [ ] 旧材料按钮显示“重新生成精准讲解音频”，成功后切换 V2。
- [ ] 运行前后端测试、类型检查、目标 Lint 和桌面/移动浏览器验证。
