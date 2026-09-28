# 视频导学旧文案兼容与文案编辑 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让旧视频导学课件直接匹配既有文案和语音，并为导入、逐句讲解、总结提供不打断现有学习页的文案编辑流程。

**Architecture:** API 和 Web 都把有效的旧 `narrationTimeline` 投影为文案草稿，优先使用新版 `narrationDraftTimeline`。人工编辑保存到草稿版本并标记语音过期，保留已发布语音时间线；重新合成全部成功后才用新文案和新语音替换学习页版本。

**Tech Stack:** NestJS 11、Prisma 7、Next.js 16 App Router、React 19、TypeScript 6、TailwindCSS、Node test runner。

## Global Constraints

- 所有前后台文案和错误提示使用简体中文。
- 不新增数据库字段或 migration；编辑状态继续保存在课件 `content` JSON 中。
- 旧 `narrationTimeline` 必须兼容为可用草稿，不能要求用户重新付费生成。
- 人工编辑时保留已发布 `narrationTimeline` 和旧语音，只有新语音全部成功后才整体发布。
- 编辑范围包含课程导入、全部逐句讲解和课程总结。
- 修改节点折叠为单个人工编辑 chunk 并清除该节点旧 overlay；未修改节点保留原 chunks 和 overlay。
- 不实现单句语音局部合成，不自动重新生成随堂练习。
- 不修改或提交工作区内与本功能无关的字帖、钱包、播放器和 copybook 文件。
- 手工提交必须使用明确文件路径，禁止 `git add -A`。

---

## File Structure

- `apps/api-core/src/video-guide/video-guide-generation-state.ts`：兼容读取旧时间线、判断文案就绪、合并人工编辑草稿、清理语音过期状态。
- `apps/api-core/src/video-guide/dto/video-guide.dto.ts`：定义逐节点文案编辑请求 DTO。
- `apps/api-core/src/video-guide/video-guide.service.ts`：校验所有权和任务状态，在课件行锁内保存文案草稿。
- `apps/api-core/src/video-guide/video-guide.controller.ts`：暴露文案保存接口。
- `apps/api-core/tests/video-guide-generation-state.test.ts`：覆盖旧数据兼容和纯函数数据变换。
- `apps/api-core/tests/video-guide-narration-edit.test.ts`：覆盖服务端保存、租约冲突和所有权检查。
- `apps/web/src/lib/video-guide-data.ts`：解析旧课件为可编辑草稿并暴露语音过期状态。
- `apps/web/src/lib/video-guide-narration-editor.ts`：文案编辑器的纯状态、导航、校验和请求载荷。
- `apps/web/src/app/api/video-guide/lessons/[id]/narration-script/route.ts`：将登录 Cookie 转发到 NestJS 文案保存接口。
- `apps/web/src/components/experience/video-guide-console.tsx`：增加编辑按钮、单节点弹窗、保存状态和语音过期提示。
- `apps/web/tests/video-guide-data.test.ts`：覆盖旧课件前端兼容判断。
- `apps/web/tests/video-guide-narration-editor.test.ts`：覆盖编辑器顺序、导航、校验和载荷。

---

### Task 1: API 端旧文案兼容

**Files:**
- Modify: `apps/api-core/src/video-guide/video-guide-generation-state.ts`
- Modify: `apps/api-core/tests/video-guide-generation-state.test.ts`

**Interfaces:**
- Produces: `narrationDraftFromContent(contentValue: unknown): VideoGuideNarrationDraftNode[]`，优先返回新草稿，否则返回去除音频字段后的旧时间线投影。
- Produces: `videoGuideScriptIsReady(contentValue: unknown): boolean`，只要求有效文案和有效草稿，不依赖新版进度字段。
- Consumes: `VideoGuideNarrationDraftNode` 和现有 `isRecord` 校验。

- [ ] **Step 1: 写旧时间线兼容失败测试**

在 `video-guide-generation-state.test.ts` 增加：

```ts
test("旧课件的已发布时间线可直接作为文案草稿", () => {
  const legacyNode = {
    id: "s_001",
    type: "SENTENCE" as const,
    title: "第 1 句",
    sentenceId: "s_001",
    subtitle: "There are lots of things.",
    script: "lots of 表示很多。",
    chunks: [{ id: "s_001-c1", type: "phrase", text: "lots of 表示很多。", overlay: null }],
    audioUrl: "https://cdn.example.com/s_001.mp3",
    audioTaskId: "audio-1",
    audioSha256: "hash"
  };
  const content = {
    narrationScript: legacyNode.script,
    narrationTimeline: [legacyNode]
  };

  assert.equal(videoGuideScriptIsReady(content), true);
  assert.deepEqual(narrationDraftFromContent(content), [
    {
      id: "s_001",
      type: "SENTENCE",
      title: "第 1 句",
      sentenceId: "s_001",
      subtitle: "There are lots of things.",
      script: "lots of 表示很多。",
      chunks: legacyNode.chunks
    }
  ]);
});

test("新版文案草稿优先于旧发布时间线", () => {
  assert.deepEqual(
    narrationDraftFromContent({
      narrationDraftTimeline: draftTimeline,
      narrationTimeline: [{ ...draftTimeline[0], script: "旧文案" }]
    }),
    draftTimeline
  );
});
```

- [ ] **Step 2: 运行测试并确认因旧时间线不被读取而失败**

Run:

```bash
pnpm --filter @xueleai/api-core exec node --import tsx --test tests/video-guide-generation-state.test.ts
```

Expected: FAIL，旧课件的 `videoGuideScriptIsReady` 返回 `false`。

- [ ] **Step 3: 实现兼容投影**

在 `video-guide-generation-state.ts` 中让草稿读取回退到旧时间线，并通过重建对象去除音频字段：

```ts
export function narrationDraftFromContent(contentValue: unknown): VideoGuideNarrationDraftNode[] {
  if (!isRecord(contentValue)) {
    return [];
  }

  const source = Array.isArray(contentValue.narrationDraftTimeline)
    ? contentValue.narrationDraftTimeline
    : Array.isArray(contentValue.narrationTimeline)
      ? contentValue.narrationTimeline
      : [];

  return source.filter(isNarrationDraftNode).map(toNarrationDraftNode);
}

function toNarrationDraftNode(node: VideoGuideNarrationDraftNode): VideoGuideNarrationDraftNode {
  return {
    id: node.id,
    type: node.type,
    title: node.title,
    script: node.script,
    chunks: node.chunks,
    ...(node.sentenceId ? { sentenceId: node.sentenceId } : {}),
    ...(node.timeRange ? { timeRange: node.timeRange } : {}),
    ...(node.startSeconds === undefined ? {} : { startSeconds: node.startSeconds }),
    ...(node.endSeconds === undefined ? {} : { endSeconds: node.endSeconds }),
    ...(node.subtitle ? { subtitle: node.subtitle } : {})
  };
}

export function videoGuideScriptIsReady(contentValue: unknown) {
  return (
    isRecord(contentValue) &&
    typeof contentValue.narrationScript === "string" &&
    contentValue.narrationScript.trim().length > 0 &&
    narrationDraftFromContent(contentValue).length > 0
  );
}
```

- [ ] **Step 4: 运行状态测试和 API 类型检查**

Run:

```bash
pnpm --filter @xueleai/api-core exec node --import tsx --test tests/video-guide-generation-state.test.ts
pnpm --filter @xueleai/api-core typecheck
```

Expected: PASS。

- [ ] **Step 5: 提交兼容层**

```bash
git add apps/api-core/src/video-guide/video-guide-generation-state.ts apps/api-core/tests/video-guide-generation-state.test.ts
git commit -m "fix(video-guide): recognize legacy narration scripts"
```

---

### Task 2: 人工编辑草稿数据变换

**Files:**
- Modify: `apps/api-core/src/video-guide/video-guide-generation-state.ts`
- Modify: `apps/api-core/tests/video-guide-generation-state.test.ts`

**Interfaces:**
- Produces: `mergeEditedNarrationDraftContent(contentValue, updates, now): Record<string, unknown>`。
- Produces: `VideoGuideNarrationScriptUpdate`，字段为 `id` 和 `script`。
- Consumes: Task 1 的 `narrationDraftFromContent`。

- [ ] **Step 1: 写双版本保存与节点校验失败测试**

增加测试，断言旧发布时间线保留、修改节点折叠、未修改节点 chunks 保留、语音被标记过期：

```ts
test("人工编辑写入草稿并保留已发布语音时间线", () => {
  const published = draftTimeline.map((node) => ({
    ...node,
    audioUrl: `https://cdn.example.com/${node.id}.mp3`
  }));
  const content = mergeEditedNarrationDraftContent(
    {
      narrationScript: draftTimeline.map((node) => node.script).join("\n\n"),
      narrationTimeline: published,
      narrationTtsGenerationProgress: { status: "SUCCEEDED" },
      narrationTtsGenerationJob: { jobId: "old-job" }
    },
    [
      { id: "intro", script: draftTimeline[0]!.script },
      { id: "sentence-s_001", script: "put out 在这里表示扑灭火焰。" }
    ],
    "2026-07-16T02:00:00.000Z"
  );

  assert.deepEqual(content.narrationTimeline, published);
  assert.equal(content.narrationAudioStale, true);
  assert.equal(content.narrationDraftUpdatedAt, "2026-07-16T02:00:00.000Z");
  assert.equal("narrationTtsGenerationJob" in content, false);
  assert.equal("narrationTtsGenerationProgress" in content, false);
  assert.deepEqual(content.narrationDraftTimeline[0]?.chunks, draftTimeline[0]?.chunks);
  assert.deepEqual(content.narrationDraftTimeline[1]?.chunks, [
    {
      id: "sentence-s_001-manual",
      type: "manual",
      text: "put out 在这里表示扑灭火焰。",
      overlay: null
    }
  ]);
});

test("人工编辑拒绝缺失、重复、未知和空文案节点", () => {
  const content = { narrationScript: "有效文案", narrationDraftTimeline: draftTimeline };

  assert.throws(
    () => mergeEditedNarrationDraftContent(content, [{ id: "intro", script: "只提交一项" }], "now"),
    /文案已发生变化/
  );
  assert.throws(
    () => mergeEditedNarrationDraftContent(content, [
      { id: "intro", script: "一" },
      { id: "intro", script: "二" }
    ], "now"),
    /文案节点不能重复/
  );
});
```

- [ ] **Step 2: 运行测试并确认缺少合并函数**

Run:

```bash
pnpm --filter @xueleai/api-core exec node --import tsx --test tests/video-guide-generation-state.test.ts
```

Expected: FAIL，`mergeEditedNarrationDraftContent` 尚未导出。

- [ ] **Step 3: 实现严格节点合并**

实现以下导出，并在修改节点时使用 `manual` chunk：

```ts
export interface VideoGuideNarrationScriptUpdate {
  id: string;
  script: string;
}

export function mergeEditedNarrationDraftContent(
  contentValue: unknown,
  updates: VideoGuideNarrationScriptUpdate[],
  now: string
) {
  const content = isRecord(contentValue) ? contentValue : {};
  const draft = narrationDraftFromContent(content);
  const updatesById = new Map<string, string>();

  for (const update of updates) {
    const id = update.id.trim();
    const script = update.script.trim();
    if (!id || !script) throw new Error("讲解文案不能为空");
    if (updatesById.has(id)) throw new Error("文案节点不能重复");
    updatesById.set(id, script);
  }

  if (draft.length === 0 || updatesById.size !== draft.length || draft.some((node) => !updatesById.has(node.id))) {
    throw new Error("文案已发生变化，请刷新后重试");
  }

  const narrationDraftTimeline = draft.map((node) => {
    const script = updatesById.get(node.id)!;
    if (script === node.script.trim()) return node;
    return {
      ...node,
      script,
      chunks: [{ id: `${node.id}-manual`, type: "manual", text: script, overlay: null }]
    };
  });
  const { narrationTtsGenerationJob: _job, narrationTtsGenerationProgress: _progress, ...retained } = content;

  return {
    ...retained,
    narrationDraftTimeline,
    narrationScript: narrationDraftTimeline.map((node) => node.script).join("\n\n"),
    narrationAudioStale: true,
    narrationDraftUpdatedAt: now
  };
}
```

- [ ] **Step 4: 运行测试与类型检查**

Run:

```bash
pnpm --filter @xueleai/api-core exec node --import tsx --test tests/video-guide-generation-state.test.ts
pnpm --filter @xueleai/api-core typecheck
```

Expected: PASS。

- [ ] **Step 5: 提交数据变换**

```bash
git add apps/api-core/src/video-guide/video-guide-generation-state.ts apps/api-core/tests/video-guide-generation-state.test.ts
git commit -m "feat(video-guide): merge edited narration drafts"
```

---

### Task 3: 文案保存 API 与语音发布状态

**Files:**
- Modify: `apps/api-core/src/video-guide/dto/video-guide.dto.ts`
- Modify: `apps/api-core/src/video-guide/video-guide.controller.ts`
- Modify: `apps/api-core/src/video-guide/video-guide.service.ts`
- Create: `apps/api-core/tests/video-guide-narration-edit.test.ts`
- Modify: `apps/api-core/tests/video-guide-generation-state.test.ts`

**Interfaces:**
- Produces: `UpdateVideoGuideNarrationScriptDto`，包含 `nodes: Array<{ id: string; script: string }>`。
- Produces: `VideoGuideService.updateLessonNarrationScript(userId, id, dto)`。
- Produces: `PATCH /video-guide/lessons/:id/narration-script`。
- Consumes: Task 2 的 `mergeEditedNarrationDraftContent`。

- [ ] **Step 1: 写服务端保存失败测试**

创建 `video-guide-narration-edit.test.ts`，使用 Prisma stub 验证所有权、行锁后的更新和活跃任务拒绝：

```ts
test("文案编辑在课件锁内保留已发布语音并返回更新课件", async () => {
  const updates: Array<Record<string, unknown>> = [];
  const current = lessonRecord({
    userId: "user-1",
    status: "SUCCEEDED",
    content: legacyNarrationContent()
  });
  const service = serviceWithTransaction(current, updates);

  const lesson = await service.updateLessonNarrationScript("user-1", current.id, {
    nodes: narrationUpdates("修改后的第一句讲解")
  });

  const data = updates[0]?.data as { content: Record<string, unknown> };
  assert.equal(data.content.narrationAudioStale, true);
  assert.deepEqual(data.content.narrationTimeline, current.content.narrationTimeline);
  assert.equal(lesson.id, current.id);
});

test("其他用户和活跃后台任务不能保存文案", async () => {
  await assert.rejects(
    () => serviceForOwner("owner-1").updateLessonNarrationScript("user-2", "lesson-1", { nodes: [] }),
    /导学课件不存在/
  );
  await assert.rejects(
    () => serviceForActiveJob().updateLessonNarrationScript("owner-1", "lesson-1", { nodes: narrationUpdates("新文案") }),
    /正在生成中/
  );
});
```

- [ ] **Step 2: 运行测试并确认方法不存在**

Run:

```bash
pnpm --filter @xueleai/api-core exec node --import tsx --test tests/video-guide-narration-edit.test.ts
```

Expected: FAIL，`updateLessonNarrationScript` 尚未实现。

- [ ] **Step 3: 增加 DTO 和 Controller**

在 DTO 中增加嵌套校验：

```ts
export class UpdateVideoGuideNarrationNodeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  id!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(12_000)
  script!: string;
}

export class UpdateVideoGuideNarrationScriptDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => UpdateVideoGuideNarrationNodeDto)
  nodes!: UpdateVideoGuideNarrationNodeDto[];
}
```

Controller 增加：

```ts
@Patch("lessons/:id/narration-script")
async updateLessonNarrationScript(
  @Req() request: unknown,
  @Param("id") id: string,
  @Body() dto: UpdateVideoGuideNarrationScriptDto
) {
  const user = await this.authService.me(request as never);
  return successResponse(await this.videoGuideService.updateLessonNarrationScript(user.id, id, dto));
}
```

- [ ] **Step 4: 在 Service 行锁内保存草稿**

实现 `updateLessonNarrationScript`：验证登录、锁定课件、按 `id + userId` 查询、调用 `assertLessonOperationAvailable` 检查四类任务，然后使用 Task 2 的纯函数更新 content。保持 `status` 为当前值，使旧学习页继续可用；清除 `errorMessage`。

将纯函数的三类校验错误映射为 `AppException(40001, error.message, HttpStatus.BAD_REQUEST)`，不得返回内部异常。

- [ ] **Step 5: 在语音成功事务清除过期标记**

在写入新 `narrationTimeline` 的成功 content 中增加：

```ts
narrationAudioStale: false,
```

并扩展状态测试，断言语音发布成功后该字段为 `false`。

- [ ] **Step 6: 运行 API 聚焦测试、类型检查和完整测试**

Run:

```bash
pnpm --filter @xueleai/api-core exec node --import tsx --test tests/video-guide-generation-state.test.ts tests/video-guide-narration-edit.test.ts
pnpm --filter @xueleai/api-core typecheck
pnpm --filter @xueleai/api-core test
```

Expected: PASS，完整测试零失败。

- [ ] **Step 7: 提交 API**

```bash
git add apps/api-core/src/video-guide/dto/video-guide.dto.ts apps/api-core/src/video-guide/video-guide.controller.ts apps/api-core/src/video-guide/video-guide.service.ts apps/api-core/tests/video-guide-generation-state.test.ts apps/api-core/tests/video-guide-narration-edit.test.ts
git commit -m "feat(video-guide): save narration script edits"
```

---

### Task 4: Web 旧数据兼容与编辑器纯状态

**Files:**
- Modify: `apps/web/src/lib/video-guide-data.ts`
- Create: `apps/web/src/lib/video-guide-narration-editor.ts`
- Modify: `apps/web/tests/video-guide-data.test.ts`
- Create: `apps/web/tests/video-guide-narration-editor.test.ts`

**Interfaces:**
- Produces: `createNarrationEditorState(content)`。
- Produces: `updateNarrationEditorScript(state, script)`、`moveNarrationEditor(state, direction)`、`narrationEditorSavePayload(state)`。
- Consumes: `NarrationTimelineNode` 和兼容后的 `narrationDraftTimeline`。

- [ ] **Step 1: 写 Web 兼容与编辑状态失败测试**

在 `video-guide-data.test.ts` 增加旧时间线就绪测试；创建 `video-guide-narration-editor.test.ts`：

```ts
test("旧课件解析后直接识别为文案已就绪", () => {
  const content = parseVideoGuideLessonContent({
    narrationScript: "旧文案",
    narrationTimeline: [legacyNarrationNode]
  });
  const lesson = storedLesson(content!);

  assert.equal(content?.narrationDraftTimeline?.[0]?.script, "旧文案");
  assert.equal(videoGuideScriptReady(lesson), true);
});

test("编辑器按导入、逐句、总结导航并保留本地修改", () => {
  let state = createNarrationEditorState(editorContent());
  assert.equal(state.items[0]?.sourceText, "课程导入");
  state = moveNarrationEditor(state, "NEXT");
  assert.equal(state.items[state.index]?.sourceText, "There are lots of things.");
  state = updateNarrationEditorScript(state, "修改后的逐句讲解");
  state = moveNarrationEditor(state, "NEXT");
  state = moveNarrationEditor(state, "PREVIOUS");
  assert.equal(state.items[state.index]?.script, "修改后的逐句讲解");
});

test("保存载荷拒绝空文案并只包含节点 ID 和 script", () => {
  const state = updateNarrationEditorScript(createNarrationEditorState(editorContent()), "   ");
  assert.throws(() => narrationEditorSavePayload(state), /讲解文案不能为空/);
  assert.deepEqual(narrationEditorSavePayload(createNarrationEditorState(editorContent())), {
    nodes: editorContent().narrationDraftTimeline.map(({ id, script }) => ({ id, script }))
  });
});
```

- [ ] **Step 2: 运行 Web 测试并确认编辑器模块缺失**

Run:

```bash
pnpm --filter @xueleai/web exec node --import tsx --test tests/video-guide-data.test.ts tests/video-guide-narration-editor.test.ts
```

Expected: FAIL，编辑器模块不存在，旧时间线没有投影到草稿。

- [ ] **Step 3: 扩展课件内容解析**

在 `VideoGuideLessonContent` 增加：

```ts
narrationAudioStale?: boolean;
narrationDraftUpdatedAt?: string | null;
```

`parseVideoGuideLessonContent` 先解析两个时间线，再令 `narrationDraftTimeline` 使用“新草稿优先、旧时间线回退”。`videoGuideScriptReady` 只检查有效文案和草稿，不要求新版进度字段。

- [ ] **Step 4: 实现纯编辑器状态**

创建 `video-guide-narration-editor.ts`，定义：

```ts
export interface NarrationEditorItem {
  id: string;
  type: NarrationTimelineNode["type"];
  sourceText: string;
  script: string;
}

export interface NarrationEditorState {
  index: number;
  items: NarrationEditorItem[];
}

export function createNarrationEditorState(content: VideoGuideLessonContent): NarrationEditorState {
  const items = (content.narrationDraftTimeline ?? []).map((node) => ({
    id: node.id,
    type: node.type,
    sourceText: node.type === "INTRO" ? "课程导入" : node.type === "SUMMARY" ? "课程总结" : node.subtitle?.trim() || node.title,
    script: node.script
  }));
  if (items.length === 0) throw new Error("当前课件没有可编辑的导学文案");
  return { index: 0, items };
}
```

导航函数将 index 限制在 `0..items.length - 1`；更新函数只替换当前 item；保存函数先找到第一个空文案并抛出带 `index` 的 `NarrationEditorValidationError`，再返回 `{ nodes: items.map(({ id, script }) => ({ id, script: script.trim() })) }`。

- [ ] **Step 5: 运行 Web 测试和类型检查**

Run:

```bash
pnpm --filter @xueleai/web exec node --import tsx --test tests/video-guide-data.test.ts tests/video-guide-narration-editor.test.ts
pnpm --filter @xueleai/web typecheck
```

Expected: PASS。

- [ ] **Step 6: 提交 Web 数据层**

```bash
git add apps/web/src/lib/video-guide-data.ts apps/web/src/lib/video-guide-narration-editor.ts apps/web/tests/video-guide-data.test.ts apps/web/tests/video-guide-narration-editor.test.ts
git commit -m "feat(video-guide): add narration editor state"
```

---

### Task 5: 文案编辑弹窗和保存代理

**Files:**
- Create: `apps/web/src/app/api/video-guide/lessons/[id]/narration-script/route.ts`
- Modify: `apps/web/src/components/experience/video-guide-console.tsx`

**Interfaces:**
- Consumes: Task 4 的编辑器纯函数。
- Calls: `PATCH /api/video-guide/lessons/:id/narration-script`，请求体由 `narrationEditorSavePayload` 生成。
- Produces: 导学文案步骤中的“编辑文案”按钮、单节点编辑弹窗、保存后语音过期提示。

- [ ] **Step 1: 创建 Next.js 保存代理**

实现与现有课件代理一致的 Cookie 转发：

```ts
import { headers } from "next/headers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const requestHeaders = await headers();
  const { id } = await params;
  const response = await fetch(
    `${process.env.API_BASE_URL ?? "http://localhost:3322/api"}/video-guide/lessons/${encodeURIComponent(id)}/narration-script`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: requestHeaders.get("cookie") ?? "" },
      body: await request.text(),
      cache: "no-store"
    }
  );
  return new Response(await response.text(), {
    status: response.status,
    headers: { "Content-Type": response.headers.get("content-type") ?? "application/json; charset=utf-8" }
  });
}
```

- [ ] **Step 2: 增加编辑器状态和打开/导航/保存处理器**

在 `video-guide-console.tsx` 中增加：

```ts
const [narrationEditor, setNarrationEditor] = useState<NarrationEditorState | null>(null);
const [isSavingNarrationEdit, setIsSavingNarrationEdit] = useState(false);
```

打开时使用当前 `practiceLesson.content` 建立状态。保存时调用 `narrationEditorSavePayload`，校验失败则跳到错误 index；请求成功后把返回课件写回当前课件和历史列表，并显示“文案已保存，请重新合成讲解语音”。

- [ ] **Step 3: 在导学文案步骤增加编辑按钮和过期状态**

文案就绪时 action 使用同一行按钮组：

```tsx
<Button onClick={openNarrationEditor} size="sm" variant="outline">
  <Pencil />
  编辑文案
</Button>
```

当 `practiceLesson.content?.narrationAudioStale` 为真时，讲解语音步骤说明显示“文案已修改，请重新合成”，合成按钮保持可用且文案生成按钮不再误显示首次生成状态。

- [ ] **Step 4: 实现单节点弹窗**

弹窗使用 `fixed inset-0 z-50` 遮罩和 `max-w-2xl` 内容区。顶部为标题、`当前项 / 总项` 和 `X` 关闭图标；只读区域显示 `currentItem.sourceText`；textarea 绑定当前 `script`；底部固定三个按钮：

```tsx
<Button disabled={narrationEditor.index === 0} onClick={() => moveNarration("PREVIOUS")} variant="outline">
  <ChevronLeft />
  上一句
</Button>
<Button disabled={narrationEditor.index === narrationEditor.items.length - 1} onClick={() => moveNarration("NEXT")} variant="outline">
  下一句
  <ChevronRight />
</Button>
<Button disabled={isSavingNarrationEdit} onClick={saveNarrationEditor}>
  {isSavingNarrationEdit ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
  确认保存
</Button>
```

移动端使用 `max-h-[92dvh]`，中间编辑区滚动，底部 `shrink-0`；字幕和文案都使用 `break-words`，避免横向溢出。

- [ ] **Step 5: 运行 Web 测试和类型检查**

Run:

```bash
pnpm --filter @xueleai/web test
pnpm --filter @xueleai/web typecheck
```

Expected: PASS。

- [ ] **Step 6: 提交弹窗功能**

```bash
git add 'apps/web/src/app/api/video-guide/lessons/[id]/narration-script/route.ts' apps/web/src/components/experience/video-guide-console.tsx
git commit -m "feat(video-guide): edit narration scripts"
```

---

### Task 6: 完整验证和浏览器验收

**Files:**
- Verify only; no planned source edits.

**Interfaces:**
- Consumes: Tasks 1-5 的 API、数据兼容和弹窗。
- Produces: 可发布的验证证据。

- [ ] **Step 1: 运行完整测试、类型检查和构建**

Run:

```bash
pnpm --filter @xueleai/api-core test
pnpm --filter @xueleai/api-core typecheck
pnpm --filter @xueleai/api-core build
pnpm --filter @xueleai/web test
pnpm --filter @xueleai/web typecheck
pnpm --filter @xueleai/web build
git diff --check
```

Expected: 全部退出码为 0。

- [ ] **Step 2: 在本地浏览器恢复旧课件**

打开：

```text
http://localhost:3321/media-tutor
```

登录后选择课件 `400e1ea319000517d6de5c84`，确认：

1. 导学文案显示已就绪，不要求重新生成。
2. 讲解语音显示已完成并允许重新合成。
3. “编辑文案”按钮可打开弹窗。

- [ ] **Step 3: 验证弹窗和双版本发布**

在弹窗依次检查导入、第一句和总结：

1. 导入显示只读“课程导入”。
2. 逐句项显示只读英文字幕。
3. 总结显示只读“课程总结”。
4. 修改第一句后前后切换，文本保持。
5. 确认保存后右栏显示“文案已修改，请重新合成”。
6. 未重新合成前，公开学习页仍播放旧文案和旧语音。

- [ ] **Step 4: 检查桌面和移动布局**

使用 1440×900 和 390×844 视口截图，确认弹窗文字不重叠、不横向溢出，底部三个按钮始终可见。

- [ ] **Step 5: 最终代码审查**

审查从本功能设计提交之后到 HEAD 的 diff，重点检查：旧数据不重复计费、编辑保存不破坏发布时间线、活跃任务租约、文案与 chunks 一致性、移动端按钮可用性。修复任何 Critical 或 Important finding 后重跑 Step 1。
