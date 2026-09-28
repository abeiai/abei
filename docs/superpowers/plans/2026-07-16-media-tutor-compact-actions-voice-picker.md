# 视频导学紧凑操作区与全站音色选择统一 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将视频导学右栏改成紧凑的图标操作流程，并让语音体验区、视频导学和英文带学共用完整音色选择交互。

**Architecture:** 把音色选项、筛选和本地收藏逻辑放入独立纯函数模块，把当前音色卡片与完整弹窗放入受控共享组件，各业务只负责提供可用音色和保存选中值。视频导学右栏继续复用现有上传、生成、编辑和计费函数，只重组视图并增加字幕下载函数，不改变后端数据流。

**Tech Stack:** Next.js App Router、React 19、TypeScript、TailwindCSS、lucide-react、Node test runner。

## Global Constraints

- 所有新增界面文字使用简体中文。
- 不修改后端接口、数据库 schema、计费规则、异步任务逻辑和学习页面。
- 不新增依赖，不升级现有依赖。
- 视频导学设置栏桌面宽度继续为 360px。
- 字幕操作固定为两列两行，使用图标加短文字。
- 视频导学只展示同时支持中文和英文的多语种音色。
- 全站共享音色收藏和最近使用，并迁移原语音体验区本地数据。
- 不修改或提交当前工作区中与本任务无关的字帖、钱包和学习播放器改动。
- 本次共享组件抽取已经用户确认，允许实现 diff 超过小修改默认的 150 行限制。

---

### Task 1: 共享音色筛选与本地状态逻辑

**Files:**
- Create: `apps/web/src/lib/voice-picker.ts`
- Create: `apps/web/tests/voice-picker.test.ts`

**Interfaces:**
- Produces: `VoicePickerOption`、`VoicePickerFilters`、`filterVoicePickerOptions()`、`parseStoredVoiceValues()`、`mergeStoredVoiceValues()`、`toggleStoredVoiceValue()`、共享 storage key 常量。
- Consumes: 无业务页面状态。

- [ ] **Step 1: 写筛选与存储迁移失败测试**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  filterVoicePickerOptions,
  mergeStoredVoiceValues,
  parseStoredVoiceValues,
  toggleStoredVoiceValue,
  type VoicePickerOption
} from "../src/lib/voice-picker.js";

const voices: VoicePickerOption[] = [
  {
    value: "system:teacher",
    name: "讲解女声",
    badge: "官方系统音色",
    description: "沉稳清晰",
    language: "中文、英文",
    languages: ["中文", "英文"],
    ageCategory: "青年",
    trait: "沉稳",
    scene: "教育",
    previewAudioUrl: "/teacher.mp3",
    ssmlSupported: true
  },
  {
    value: "voice:child",
    name: "儿童音色",
    badge: "我的音色",
    description: "活泼",
    language: "中文",
    languages: ["中文"],
    ageCategory: "儿童",
    previewAudioUrl: null
  }
];

test("音色选择同时支持关键词、语种、年龄、标签和能力筛选", () => {
  const result = filterVoicePickerOptions(voices, {
    keyword: "讲解",
    language: "英文",
    gender: "女声",
    age: "青年",
    tags: ["教育"],
    ssml: true,
    instruct: false,
    timestamp: false
  });
  assert.deepEqual(result.map((voice) => voice.value), ["system:teacher"]);
});

test("旧收藏和全站收藏合并去重并限制数量", () => {
  assert.deepEqual(mergeStoredVoiceValues(["a", "b"], ["b", "c"], 3), ["a", "b", "c"]);
  assert.deepEqual(parseStoredVoiceValues('["a",1,"b"]', 5), ["a", "b"]);
  assert.deepEqual(toggleStoredVoiceValue(["a", "b"], "a", 50), ["b"]);
  assert.deepEqual(toggleStoredVoiceValue(["a"], "b", 50), ["b", "a"]);
});
```

- [ ] **Step 2: 运行测试并确认因模块不存在失败**

Run: `pnpm --filter @xueleai/web exec node --import tsx --test tests/voice-picker.test.ts`

Expected: FAIL，提示无法找到 `src/lib/voice-picker.js`。

- [ ] **Step 3: 实现纯函数和统一类型**

```ts
export const voicePickerRecentKey = "xueleai:voice-picker:recent";
export const voicePickerFavoriteKey = "xueleai:voice-picker:favorite";
export const legacyVoiceRecentKey = "xueleai:experience-voice:recent";
export const legacyVoiceFavoriteKey = "xueleai:experience-voice:favorite";

export interface VoicePickerOption {
  value: string;
  name: string;
  badge: string;
  description?: string | null;
  previewAudioUrl?: string | null;
  language?: string | null;
  languages?: string[];
  trait?: string | null;
  scene?: string | null;
  ageCategory?: string | null;
  supportedModels?: string[];
  ssmlSupported?: boolean;
  instructSupported?: boolean;
  timestampSupported?: boolean;
  isDefault?: boolean;
}

export interface VoicePickerFilters {
  keyword: string;
  language: string;
  gender: string;
  age: string;
  tags: string[];
  ssml: boolean;
  instruct: boolean;
  timestamp: boolean;
}
```

实现 `filterVoicePickerOptions()` 时将名称、描述、badge、特征、场景和语种组成小写搜索文本；性别继续使用名称、描述和特征中的“男/女”或 `male/female` 推断。存储函数只接受非空字符串并按最近优先去重。

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter @xueleai/web exec node --import tsx --test tests/voice-picker.test.ts`

Expected: PASS，2 项测试通过。

- [ ] **Step 5: 提交**

```bash
git add apps/web/src/lib/voice-picker.ts apps/web/tests/voice-picker.test.ts
git commit -m "feat(audio): add shared voice picker state"
```

---

### Task 2: 抽取完整共享音色选择组件

**Files:**
- Create: `apps/web/src/components/audio/voice-picker.tsx`
- Modify: `apps/web/src/components/experience/voice-console.tsx`
- Test: `apps/web/tests/voice-picker.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `VoicePickerOption` 和筛选、存储函数。
- Produces: `VoicePicker` 受控组件。

`VoicePicker` 签名固定为：

```ts
interface VoicePickerProps {
  disabled?: boolean;
  label?: string;
  onChange: (value: string) => void;
  value: string;
  voices: VoicePickerOption[];
}

export function VoicePicker(props: VoicePickerProps): ReactNode;
```

- [ ] **Step 1: 扩展纯逻辑测试覆盖“我的音色”和“收藏/最近”列表来源**

在 `voice-picker.test.ts` 增加：

```ts
test("我的音色只包含用户资产，收藏页按收藏和最近值恢复顺序", () => {
  const mine = voices.filter((voice) => voice.value.startsWith("voice:") && !voice.badge.startsWith("平台"));
  const ordered = mergeStoredVoiceValues(["system:teacher"], ["voice:child"], 50)
    .map((value) => voices.find((voice) => voice.value === value)?.value)
    .filter(Boolean);
  assert.deepEqual(mine.map((voice) => voice.value), ["voice:child"]);
  assert.deepEqual(ordered, ["system:teacher", "voice:child"]);
});
```

- [ ] **Step 2: 运行测试并确认新增断言通过现有纯函数，作为组件数据基线**

Run: `pnpm --filter @xueleai/web exec node --import tsx --test tests/voice-picker.test.ts`

Expected: PASS，3 项测试通过。

- [ ] **Step 3: 创建共享组件**

组件必须包含：

```tsx
<button disabled={disabled} onClick={() => setOpen(true)} type="button">
  <Volume2 />
  <span>{selectedVoice?.name ?? "请选择音色"}</span>
  <span>{selectedVoice?.badge ?? "暂无可用音色"}</span>
  <ChevronRight />
</button>
```

弹窗复用现有 `/experience/voice` 的布局和文字，保留“音色库 / 我的音色 / 收藏音色”、搜索、语种、性别、年龄、标签、试听、收藏和选择。组件内部完成以下行为：

1. mount 时读取新 storage key，同时读取旧语音体验区 key，合并后写回新 key。
2. 选择音色时调用 `onChange(value)`，更新最近使用并关闭弹窗。
3. 收藏按钮更新共享收藏 key。
4. 使用一个 `HTMLAudioElement` 试听，切换试听前停止上一段。
5. Escape 和遮罩关闭弹窗；弹窗内容点击阻止冒泡。
6. disabled 或空音色集合时不能打开弹窗。

- [ ] **Step 4: 在语音体验区替换页面私有弹窗**

`voice-console.tsx` 从共享模块导入并保持现有页面 API：

```ts
import { VoicePicker } from "@/components/audio/voice-picker";
import type { VoicePickerOption } from "@/lib/voice-picker";

export type VoiceOption = VoicePickerOption;
```

用以下受控调用替换页面内 `VoicePickerModal`、试听、收藏和最近状态：

```tsx
<VoicePicker
  label="语音"
  onChange={setSelectedVoice}
  value={selectedVoice}
  voices={compatibleVoices}
/>
```

保留隐藏字段 `voiceChoice`、模型兼容过滤和草稿恢复逻辑。

- [ ] **Step 5: 运行测试与类型检查**

Run:

```bash
pnpm --filter @xueleai/web test
pnpm --filter @xueleai/web typecheck
```

Expected: 全部 PASS，无 TypeScript 错误。

- [ ] **Step 6: 提交**

```bash
git add apps/web/src/components/audio/voice-picker.tsx apps/web/src/components/experience/voice-console.tsx apps/web/tests/voice-picker.test.ts
git commit -m "refactor(audio): share full voice picker"
```

---

### Task 3: 视频导学与英文带学接入共享音色选择

**Files:**
- Modify: `apps/web/src/components/experience/video-guide-console.tsx`
- Modify: `apps/web/src/components/experience/english-guided-study-console.tsx`
- Modify: `apps/web/src/lib/voice-picker.ts`
- Test: `apps/web/tests/voice-picker.test.ts`

**Interfaces:**
- Consumes: Task 2 的 `VoicePicker`。
- Produces: 三个前台生成入口一致的音色选择方式。

- [ ] **Step 1: 增加多语种音色过滤失败测试**

在 `voice-picker.test.ts` 增加并导入 `supportsVoicePickerLanguages()`：

```ts
test("视频导学只保留同时支持中文和英文的音色", () => {
  assert.equal(supportsVoicePickerLanguages(voices[0]!, ["中文", "英文"]), true);
  assert.equal(supportsVoicePickerLanguages(voices[1]!, ["中文", "英文"]), false);
});
```

- [ ] **Step 2: 运行测试确认函数不存在而失败**

Run: `pnpm --filter @xueleai/web exec node --import tsx --test tests/voice-picker.test.ts`

Expected: FAIL，提示没有导出 `supportsVoicePickerLanguages`。

- [ ] **Step 3: 实现语言过滤并接入视频导学**

```ts
export function supportsVoicePickerLanguages(option: VoicePickerOption, required: string[]) {
  const languages = option.languages?.length ? option.languages : option.language ? [option.language] : [];
  const text = languages.join(" ");
  return required.every((language) =>
    language === "中文" ? /中文|普通话|粤语|闽南语/.test(text) : /英文|英语/.test(text)
  );
}
```

将 `VideoGuideVoiceOption` 映射成 `VoicePickerOption`，`value` 使用原 `providerVoiceId`，badge 使用“官方系统音色”，并把接口中的语种、特征、场景、年龄和能力字段透传。右栏调用：

```tsx
<VoicePicker
  disabled={isVoiceLoading || !videoGuideScriptReady(practiceLesson)}
  label="语音角色"
  onChange={setSelectedNarrationVoice}
  value={selectedNarrationVoice}
  voices={voiceOptions}
/>
```

- [ ] **Step 4: 接入英文带学**

让 `GuidedStudyVoiceOption` 使用 `VoicePickerOption`，保留 `system:` / `voice:` value。用共享组件替换 `<Select>` 和独立描述卡：

```tsx
<VoicePicker
  disabled={audioGenerationPending}
  label="音色"
  onChange={setAudioVoice}
  value={audioVoice}
  voices={voiceOptions}
/>
```

速度选择和音频生成按钮保持不变。

- [ ] **Step 5: 运行测试和类型检查**

Run:

```bash
pnpm --filter @xueleai/web test
pnpm --filter @xueleai/web typecheck
```

Expected: 全部 PASS。

- [ ] **Step 6: 提交**

```bash
git add apps/web/src/lib/voice-picker.ts apps/web/tests/voice-picker.test.ts apps/web/src/components/experience/video-guide-console.tsx apps/web/src/components/experience/english-guided-study-console.tsx
git commit -m "feat(audio): unify voice selection across tools"
```

---

### Task 4: 视频导学右栏紧凑操作与字幕下载

**Files:**
- Create: `apps/web/src/lib/video-guide-console-actions.ts`
- Create: `apps/web/tests/video-guide-console-actions.test.ts`
- Modify: `apps/web/src/components/experience/video-guide-console.tsx`

**Interfaces:**
- Produces: `subtitleDownloadFilename()`、`resolveSubtitleDownloadText()` 和 `downloadSubtitleText()`。
- Consumes: 现有 `MediaFileState`、`SubtitleFileState`、上传/生成/编辑函数和 Task 2 的 `VoicePicker`。

- [ ] **Step 1: 写字幕下载文件名失败测试**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveSubtitleDownloadText,
  subtitleDownloadFilename
} from "../src/lib/video-guide-console-actions.js";

test("字幕下载保留正确扩展名并清理非法文件名", () => {
  assert.equal(subtitleDownloadFilename("Fire lesson", ".srt"), "Fire lesson.srt");
  assert.equal(subtitleDownloadFilename("lesson.ass", ".ass"), "lesson.ass");
  assert.equal(subtitleDownloadFilename("a/b", ".srt"), "a-b.srt");
});

test("字幕下载优先读取服务器文本并在失败时回退当前文本", async () => {
  assert.equal(
    await resolveSubtitleDownloadText("https://cdn.example.com/a.srt", "local", async () => "server"),
    "server"
  );
  assert.equal(
    await resolveSubtitleDownloadText("https://cdn.example.com/a.srt", "local", async () => {
      throw new Error("failed");
    }),
    "local"
  );
});
```

- [ ] **Step 2: 运行测试确认模块不存在而失败**

Run: `pnpm --filter @xueleai/web exec node --import tsx --test tests/video-guide-console-actions.test.ts`

Expected: FAIL，提示找不到模块。

- [ ] **Step 3: 实现字幕下载辅助函数**

```ts
export function subtitleDownloadFilename(name: string, extension: ".srt" | ".ass") {
  const safeName = name.replace(/[\\/:*?"<>|]/g, "-").trim() || "subtitle";
  return safeName.toLowerCase().endsWith(extension) ? safeName : `${safeName}${extension}`;
}

export async function resolveSubtitleDownloadText(
  serverUrl: string | null | undefined,
  fallbackText: string,
  fetchText: (url: string) => Promise<string>
) {
  if (serverUrl) {
    try {
      const serverText = await fetchText(serverUrl);
      if (serverText.trim()) return serverText;
    } catch {
      // 回退到当前已加载的字幕文本。
    }
  }
  return fallbackText.trim() ? fallbackText : null;
}

export function downloadSubtitleText(text: string, filename: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 4: 重组视频导学中栏和右栏**

按规格完成以下精确变化：

1. 删除媒体预览的 `CardDescription`。
2. “媒体”改为“媒体素材”，删除 description，右侧使用单个 icon-only 上传/重新上传按钮及 hover/focus tooltip。
3. “字幕”改为“字幕处理”，用 `grid w-full grid-cols-2 gap-2` 放置上传字幕、生成字幕、编辑字幕、下载字幕。
4. 删除整个“校对” `WorkflowStep`。
5. 导学文案只显示“生成文案/重新生成”和“编辑文案”，不传 description。
6. 讲解语音不传 description，保留统一音色组件、合成按钮和进度。
7. 随堂练习按钮固定显示“生成练习”，不传 description。
8. 删除“查看学习页示例”。
9. `WorkflowStep` 删除 description 参数和渲染分支；action/children 布局保持稳定。

下载处理固定为：优先用已保存 URL 调用现有 `fetchSubtitleText()` 读取服务器文本，失败时回退 `subtitleFile.text`；两者都为空时显示错误 Toast，否则调用 `downloadSubtitleText()`。

- [ ] **Step 5: 运行定向测试、全量测试与类型检查**

Run:

```bash
pnpm --filter @xueleai/web exec node --import tsx --test tests/video-guide-console-actions.test.ts
pnpm --filter @xueleai/web test
pnpm --filter @xueleai/web typecheck
```

Expected: 全部 PASS。

- [ ] **Step 6: 提交**

```bash
git add apps/web/src/lib/video-guide-console-actions.ts apps/web/tests/video-guide-console-actions.test.ts apps/web/src/components/experience/video-guide-console.tsx
git commit -m "feat(media-tutor): compact generation actions"
```

---

### Task 5: 生产构建与浏览器视觉验收

**Files:**
- Modify only if verification exposes a defect in Task 2-4 files.

**Interfaces:**
- Consumes: 前四个任务的完整 UI。
- Produces: 可交付验证证据。

- [ ] **Step 1: 运行完整 Web 验收命令**

Run:

```bash
pnpm --filter @xueleai/web test
pnpm --filter @xueleai/web typecheck
pnpm --filter @xueleai/web build
git diff --check
```

Expected: 所有命令退出码为 0。

- [ ] **Step 2: 桌面浏览器验收视频导学**

打开 `http://localhost:3321/media-tutor`，使用 1440×900 视口确认：

- 中栏媒体预览没有说明文字。
- 右栏不存在“校对”和“查看学习页示例”。
- 字幕操作为稳定的两列两行。
- 禁用条件、文件状态和进度条正确。
- 音色卡片打开完整弹窗，搜索、筛选、试听、收藏和选择可用。

- [ ] **Step 3: 验收另外两个音色入口**

打开 `/experience/voice` 和 `/text2lesson`，确认使用同一当前音色卡片和弹窗；在一个入口收藏后，切换入口仍能在“收藏音色”看到该音色。

- [ ] **Step 4: 移动浏览器验收**

使用 390×844 视口确认右栏按钮和音色弹窗无横向溢出，字幕按钮文字不出现单字竖排，音色项操作可换行。

- [ ] **Step 5: 修复验收发现的问题并重跑对应命令**

只允许修改 Task 2-4 已列文件；每个修复先补充可复现测试，再修改实现。

- [ ] **Step 6: 提交最终视觉修正（仅有修正时）**

```bash
git add apps/web/src/components/audio/voice-picker.tsx apps/web/src/components/experience/video-guide-console.tsx apps/web/src/components/experience/voice-console.tsx apps/web/src/components/experience/english-guided-study-console.tsx apps/web/src/lib/voice-picker.ts apps/web/tests/voice-picker.test.ts
git commit -m "fix(media-tutor): polish compact action layout"
```
