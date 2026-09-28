# 视频导学制作页自定义预览播放器 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用与学习页一致的自定义控制替换制作页原生媒体控制，并删除播放器下方三个重复信息区块。

**Architecture:** 新增独立的 `VideoGuidePreviewPlayer`，内部管理媒体播放状态、控制层显隐、字幕、循环和全屏；制作页只传入媒体地址、媒体类型和字幕时间轴。字幕匹配与单句循环的纯逻辑放入单独模块并用 Node 测试覆盖，学习页复杂的阶段播放逻辑保持不变。

**Tech Stack:** Next.js App Router、React、TypeScript、TailwindCSS、Lucide、Node test runner。

## Global Constraints

- 制作页和学习页采用相同的控制条排布、字幕规格和自动隐藏行为。
- 视频和音频均不得显示浏览器原生 `controls`。
- 不修改上传、字幕生成、课件生成、计费和数据库逻辑。
- 不修改学习页的阶段播放、逐句导航、互动讲解或跟读逻辑。
- 字幕编辑入口继续保留在右栏“校对”步骤。
- 不覆盖工作区中用户已有的未提交修改。

---

### Task 1: 字幕时间匹配与单句循环逻辑

**Files:**
- Create: `apps/web/src/lib/video-guide-preview-player.ts`
- Create: `apps/web/tests/video-guide-preview-player.test.ts`

**Interfaces:**
- Produces: `PreviewSubtitleCue`、`findPreviewSubtitleCue(cues, seconds)`、`findPreviewSubtitleLoopRange(cues, seconds)`。
- Consumes: 无。

- [ ] **Step 1: 写入失败测试**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  findPreviewSubtitleCue,
  findPreviewSubtitleLoopRange
} from "../src/lib/video-guide-preview-player.js";

const cues = [
  { startSeconds: 0, endSeconds: 2.5, text: "First sentence." },
  { startSeconds: 2.5, endSeconds: 5, text: "Second sentence." }
];

test("预览字幕按真实时间轴匹配当前句", () => {
  assert.equal(findPreviewSubtitleCue(cues, 3)?.text, "Second sentence.");
  assert.equal(findPreviewSubtitleCue(cues, 5), null);
});

test("单句循环返回当前字幕句的起止时间", () => {
  assert.deepEqual(findPreviewSubtitleLoopRange(cues, 3), {
    startSeconds: 2.5,
    endSeconds: 5
  });
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `pnpm --filter @xueleai/web exec tsx --test tests/video-guide-preview-player.test.ts`

Expected: FAIL，提示 `video-guide-preview-player.js` 不存在。

- [ ] **Step 3: 实现纯逻辑**

```ts
export interface PreviewSubtitleCue {
  endSeconds: number;
  startSeconds: number;
  text: string;
}

export function findPreviewSubtitleCue(cues: PreviewSubtitleCue[], seconds: number) {
  if (!Number.isFinite(seconds)) {
    return null;
  }

  return cues.find((cue) => seconds >= cue.startSeconds && seconds < cue.endSeconds) ?? null;
}

export function findPreviewSubtitleLoopRange(cues: PreviewSubtitleCue[], seconds: number) {
  const cue = findPreviewSubtitleCue(cues, seconds);

  return cue
    ? { startSeconds: cue.startSeconds, endSeconds: cue.endSeconds }
    : null;
}
```

- [ ] **Step 4: 运行测试并确认通过**

Run: `pnpm --filter @xueleai/web exec tsx --test tests/video-guide-preview-player.test.ts`

Expected: 2 tests pass。

---

### Task 2: 制作页自定义媒体播放器

**Files:**
- Create: `apps/web/src/components/experience/video-guide-preview-player.tsx`
- Reuse: `apps/web/src/lib/video-guide-player-controls.ts`
- Reuse: `apps/web/src/lib/video-guide-preview-player.ts`

**Interfaces:**
- Consumes: `PreviewSubtitleCue[]`、`VideoGuideLoopMode`、`VideoGuideSubtitleStyle`、学习页字幕排版工具。
- Produces:

```ts
interface VideoGuidePreviewPlayerProps {
  cues: PreviewSubtitleCue[];
  mediaType: "VIDEO" | "AUDIO";
  mediaUrl: string;
}

export function VideoGuidePreviewPlayer(props: VideoGuidePreviewPlayerProps): ReactNode;
```

- [ ] **Step 1: 创建播放器状态与媒体同步**

组件内部使用同一个 `HTMLMediaElement` ref 管理：

```ts
const [currentTime, setCurrentTime] = useState(0);
const [duration, setDuration] = useState(0);
const [isPlaying, setIsPlaying] = useState(false);
const [volume, setVolume] = useState(1);
const [isMuted, setIsMuted] = useState(false);
const [playbackRate, setPlaybackRate] = useState(1);
const [loopMode, setLoopMode] = useState<VideoGuideLoopMode>("NONE");
const [captionsEnabled, setCaptionsEnabled] = useState(cues.length > 0);
const [subtitleStyle, setSubtitleStyle] = useState<VideoGuideSubtitleStyle>("WHITE_OUTLINE");
```

`onTimeUpdate` 更新当前时间；单句循环到达字幕结束时间时跳回句首；整段循环由 `onEnded` 跳到零并继续播放。

- [ ] **Step 2: 创建与学习页一致的控制层**

控制层结构固定为：

```tsx
<div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/55 to-transparent px-3 pb-2 pt-10">
  <input aria-label="播放进度" type="range" />
  <div className="flex h-10 items-center justify-between">
    <div>{/* 播放、音量、时间 */}</div>
    <div>{/* 字幕、全屏、更多 */}</div>
  </div>
</div>
```

按钮使用 `Play`、`Pause`、`Volume2`、`VolumeX`、`Captions`、`CaptionsOff`、`Maximize2`、`Minimize2` 和 `MoreVertical`。播放时两秒无鼠标或触屏活动自动隐藏；暂停、更多菜单和音量调节展开时保持显示。

- [ ] **Step 3: 实现字幕、菜单和全屏**

字幕通过 `findPreviewSubtitleCue(cues, currentTime)` 获取，并使用：

```tsx
<p className={getSubtitleTypographyClassName(subtitleStyle, isFullscreen)}>
  {activeCue.text}
</p>
```

白字与黄字使用学习页相同黑描边，灰底白字使用 `bg-black/65`。更多菜单包含 `0.5x`、`0.75x`、`1x`、`1.25x`、`1.5x`、`2x`，循环包含不循环、单句、整段，字幕样式使用 `subtitleStyleOptions`。全屏优先调用容器 `requestFullscreen()`，失败时切换固定定位伪全屏。

- [ ] **Step 4: 保留移动浏览器属性和音频视图**

视频元素保留：

```tsx
<video playsInline preload="metadata" webkit-playsinline="true" x5-playsinline="true" />
```

音频元素隐藏原生界面，播放器中央显示音频图标和“音频预览”，底部仍使用同一套自定义控制。

- [ ] **Step 5: 类型检查**

Run: `pnpm --filter @xueleai/web typecheck`

Expected: exit 0。

---

### Task 3: 制作页接入与重复信息清理

**Files:**
- Modify: `apps/web/src/components/experience/video-guide-console.tsx`
- Test: `apps/web/tests/video-guide-preview-player.test.ts`

**Interfaces:**
- Consumes: `VideoGuidePreviewPlayer`、`PreviewSubtitleCue[]`。
- Produces: `/media-tutor` 中栏自定义预览体验。

- [ ] **Step 1: 替换原生播放器**

删除 `subtitleTrackUrl`、`mediaPreviewRef`、`activePreviewSubtitle` 和生成 VTT Blob 的副作用。将已有 `timedPreviewSubtitleCues` 传入：

```tsx
<VideoGuidePreviewPlayer
  cues={timedPreviewSubtitleCues}
  mediaType={mediaFile.kind === "video" ? "VIDEO" : "AUDIO"}
  mediaUrl={previewMediaUrl}
/>
```

媒体未就绪时继续显示原有上传空状态。

- [ ] **Step 2: 删除播放器下方重复区块**

完整移除以下 JSX：

```tsx
<FileSummary label="当前媒体" />
<InlineProgress label="上传进度" />
<div>字幕预览</div>
```

确认右栏 `WorkflowStep` 中的“编辑字幕文字”按钮保持不变。

- [ ] **Step 3: 运行 Web 测试、类型检查和 Lint**

Run:

```bash
pnpm --filter @xueleai/web test
pnpm --filter @xueleai/web typecheck
pnpm --filter @xueleai/web lint
```

Expected: 全部 exit 0。

- [ ] **Step 4: 运行生产构建**

Run: `pnpm --filter @xueleai/web build`

Expected: Next.js production build succeeds，`/media-tutor` 路由存在。

- [ ] **Step 5: 浏览器验收**

在 `http://localhost:3321/media-tutor` 验证：

- 视频和音频均不显示原生控制条。
- 进度条、播放暂停、音量、字幕、全屏、倍速与循环可操作。
- 字幕随进度同步，三种样式可切换。
- 控制层播放时自动隐藏，移动鼠标后恢复。
- 中栏播放器下方没有“当前媒体”“上传进度”“字幕预览”。
- 右栏“校对”仍可打开字幕编辑。

- [ ] **Step 6: 提交实现**

```bash
git add apps/web/src/components/experience/video-guide-preview-player.tsx \
  apps/web/src/components/experience/video-guide-console.tsx \
  apps/web/src/lib/video-guide-preview-player.ts \
  apps/web/tests/video-guide-preview-player.test.ts
git commit -m "feat(media-tutor): add custom preview player"
```
