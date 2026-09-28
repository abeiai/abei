# 视频导学逐句语音 R2 持久化与状态查验设计

## 目标

新生成的视频导学课件必须把导入、每句讲解和总结的 TTS 音频持久化到 Cloudflare R2。只有每个音频节点都完成生成、上传和对象校验后，课件才可以标记为生成成功并进入学习页播放。

## 已确认决策

- 采用“音频服务负责 R2 持久化，视频导学服务负责逐句进度”的实现方式。
- 只处理新生成或用户主动重新生成的课件，不迁移历史课件语音。
- 历史课件由用户重新生成后切换到新流程。
- 不新增数据库表，不修改 Prisma schema。
- 普通语音合成任务保持现有行为；强制 R2 持久化只应用于 `source: VIDEO_GUIDE` 的外部计费 TTS 任务。
- 学习页只接收 `https://cdn.xueleai.com` 下的持久化语音地址，不再写入阿里云临时 OSS 地址。

## 当前根因

当前 `AudioService.createOutputAudioAsset` 直接把 TTS Provider 返回的临时 `audioUrl` 保存为音频资产，并存在以下错误：

1. `storageProvider` 被写成 `LOCAL`，但文件并不在本地服务器。
2. `objectKey` 使用 `provider-output-{timestamp}` 伪值，不对应任何真实对象。
3. `sizeBytes` 固定为零，无法证明文件已经完整保存。
4. 阿里云地址包含过期时间和签名，不能作为课件长期播放地址。
5. 视频导学只在所有节点完成后一次性保存 `narrationTimeline`，某句失败时无法从课件记录判断失败发生在生成、上传还是校验阶段。
6. Provider 返回的 `audioBase64` 可能被合并进 `providerPayload`，造成数据库保存大体积二进制文本。

线上现有数据已经验证上述行为：新近视频导学 TTS 任务虽然为 `SUCCEEDED`，但音频资产均为 `LOCAL`、`sizeBytes = 0`，URL 指向带过期签名的 `dashscope-result-bj.oss-cn-beijing.aliyuncs.com`。

## 组件职责

### AudioService

负责单个 TTS 任务的完整成功语义：

1. 调用 TTS Provider 生成音频。
2. 优先解码 Provider 返回的 `audioBase64`；未返回 Base64 时下载临时 `audioUrl`。
3. 校验音频数据非空、大小在单节点限制内、格式与请求一致。
4. 上传到 R2。
5. 通过 R2 对象元数据校验上传结果。
6. 创建真实的 `AudioAsset`。
7. 只有以上步骤全部成功后，才把 `AudioTask` 标记为 `SUCCEEDED`。

普通 TTS 继续沿用现有输出处理。视频导学通过内部参数显式请求 R2 持久化，不依赖全局 `UPLOAD_DRIVER`，避免影响体验区和其他语音业务。

### VideoGuideService

负责课件级编排和逐节点状态：

1. 在 TTS 开始前初始化本轮 `narrationAudioProgress`。
2. 按导入、句子、总结的既定顺序生成音频。
3. 接收 AudioService 的状态回调并立即更新当前节点。
4. 每个节点成功后校验返回的音频任务与资产字段。
5. 所有节点成功后写入最终 `narrationTimeline`，并将课件标记为 `SUCCEEDED`。
6. 任意节点失败时保留本轮进度快照，将课件标记为 `FAILED` 并释放本轮冻结点数。

### R2 存储辅助模块

对象存储代码使用独立的、无 NestJS 状态依赖的辅助模块，负责：

- 从 `VIDEO_GUIDE_R2_*` 读取 R2 配置，并回退到对应的 `S3_*` 配置。
- 生成对象 Key 和 CDN URL。
- 执行带超时的 PUT 与 HEAD 请求。
- 返回真实 `objectKey`、`url`、`mimeType`、`sizeBytes` 和 `sha256`。
- 将对象存储错误转换为稳定的内部错误码，不向前台暴露密钥、签名或底层响应正文。

## 对象命名

新语音使用以下目录：

```text
video-guide/narration/{lessonId}/{generationId}/{nodeId}-{audioTaskId}.mp3
```

规则：

- `lessonId` 标识课件。
- `generationId` 标识一次生成，避免重新生成与 CDN 缓存互相污染。
- `nodeId` 对应导入、字幕句子或总结节点。
- `audioTaskId` 保证对象唯一并支持反向排查。
- 新增环境变量 `VIDEO_GUIDE_R2_NARRATION_PREFIX`，默认值为 `video-guide/narration/`。
- 对象 URL 由 `VIDEO_GUIDE_R2_PUBLIC_BASE_URL` 和 `objectKey` 组成。

## 音频数据获取

Provider 响应按以下优先级处理：

1. `audioBase64` 有效时直接解码，避免再次请求临时地址。
2. Base64 缺失时下载 `audioUrl`，请求必须有超时并限制响应体大小。
3. 两者都不存在时，任务以 `TTS_OUTPUT_MISSING` 失败。

单节点音频必须满足：

- 字节数大于零。
- 字节数不超过配置上限，默认二十五 MB。
- MIME 类型属于允许的音频格式。
- MP3 请求默认保存为 `audio/mpeg` 和 `.mp3`。

Provider 原始 `audioBase64` 和临时签名 URL 不得写入最终 `providerPayload`。数据库只保留 Provider 请求 ID、使用量、耗时和 R2 持久化结果摘要。

## R2 上传与校验

上传必须携带：

```text
Content-Type: audio/mpeg
Cache-Control: public, max-age=31536000, immutable
x-amz-meta-sha256: {本地音频 SHA-256}
```

PUT 成功后立即执行签名 HEAD 请求，只有同时满足以下条件才视为成功：

1. HEAD 返回成功状态。
2. `Content-Length` 与本地字节数完全一致。
3. `Content-Type` 与预期一致。
4. `x-amz-meta-sha256` 与本地 SHA-256 一致。

校验失败不得创建成功资产，也不得把音频任务标记为成功。

## 音频任务成功语义

视频导学 TTS 的 `AudioTask` 状态沿用现有数据库枚举：

```text
CREATED -> PROCESSING -> SUCCEEDED
                      -> FAILED
```

细分的存储阶段写入任务 `providerPayload.persistence`，并同步到课件逐句进度：

```text
PENDING -> GENERATING -> UPLOADING -> VERIFYING -> SUCCEEDED
                                                -> FAILED
```

成功的 `AudioAsset` 必须满足：

- `storageProvider = S3`
- `objectKey` 以 `VIDEO_GUIDE_R2_NARRATION_PREFIX` 开头
- `url` 为 R2 自定义域名地址
- `sizeBytes > 0`
- `mimeType = audio/mpeg`

任一字段不满足时，VideoGuideService 将该节点判定为失败，即使底层任务意外返回了 `SUCCEEDED`。

## 课件逐句进度数据

课件 `content` 新增运行时字段：

```ts
interface NarrationAudioProgress {
  version: 1;
  generationId: string;
  total: number;
  completed: number;
  failed: number;
  currentNodeId: string | null;
  updatedAt: string;
  nodes: NarrationAudioProgressNode[];
}

interface NarrationAudioProgressNode {
  nodeId: string;
  sentenceId: string | null;
  type: "INTRO" | "SENTENCE" | "SUMMARY";
  status: "PENDING" | "GENERATING" | "UPLOADING" | "VERIFYING" | "SUCCEEDED" | "FAILED";
  audioTaskId: string | null;
  audioAssetId: string | null;
  objectKey: string | null;
  audioUrl: string | null;
  sizeBytes: number | null;
  sha256: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  updatedAt: string;
}
```

每次状态变化只更新当前课件的 `content.narrationAudioProgress`，保留 `content` 中媒体、字幕和已生成文稿等其他字段。生成失败后不删除进度快照，便于后台和日志查验。

最终 `narrationTimeline` 节点继续保存播放器需要的字段，并增加可查验字段：

```ts
{
  audioTaskId: string;
  audioAssetId: string;
  audioUrl: string;
  audioObjectKey: string;
  audioSizeBytes: number;
  audioSha256: string;
}
```

## 错误处理

使用稳定错误码区分阶段：

- `TTS_OUTPUT_MISSING`：Provider 未返回音频数据。
- `TTS_OUTPUT_DOWNLOAD_FAILED`：临时地址下载失败或超时。
- `TTS_OUTPUT_INVALID`：音频为空、超限或格式不正确。
- `R2_UPLOAD_FAILED`：R2 PUT 失败或超时。
- `R2_VERIFY_FAILED`：R2 HEAD 失败，或大小、类型、哈希不一致。
- `R2_CONFIG_MISSING`：视频导学 R2 配置不完整。

前台继续显示简体中文友好错误；内部错误码、节点 ID、音频任务 ID 和对象 Key 保存在进度与日志中。任何错误都不得把阿里云临时 URL 回退写入学习页。

## 重新生成行为

- 用户重新生成时创建新的 `generationId` 并重置逐句进度。
- 新一轮生成不复用上一轮临时 URL 或成功资产。
- 新一轮所有节点成功后覆盖课件最终文稿、语音时间线和首节点兼容 URL。
- 本轮失败时课件保持 `FAILED`，保留本轮逐句状态；用户可以再次重新生成。
- 本次不迁移、不修复旧课件；旧课件只有重新生成后才进入新存储规则。

## 测试范围

### 存储辅助模块

- Base64 解码成功并生成正确对象 Key。
- Base64 缺失时从临时 URL 下载。
- 空文件、超限文件和非法 MIME 类型被拒绝。
- PUT 失败返回 `R2_UPLOAD_FAILED`。
- HEAD 大小、类型或 SHA-256 不一致返回 `R2_VERIFY_FAILED`。
- 成功结果只包含 R2 CDN URL 和真实对象元数据。

### AudioService

- 普通 TTS 不进入视频导学 R2 强制流程。
- 视频导学 TTS 只有 R2 校验成功后才创建 `S3` 音频资产并标记成功。
- 上传或校验失败时任务为 `FAILED`，不会留下伪成功 `AudioAsset`。
- 最终 `providerPayload` 不包含 `audioBase64` 和临时签名 URL。

### VideoGuideService

- 每次节点状态变化都会更新对应的逐句进度。
- 一个节点失败时后续节点不再执行，课件失败并保留已完成节点状态。
- 所有节点成功后 `completed = total`，最终时间线只包含 R2 CDN 地址。
- 任何伪成功资产字段缺失时课件不会标记成功。
- 空字幕节点继续跳过，不计入音频进度总数。

## 验收标准

1. 新生成课件的每个 `narrationTimeline[].audioUrl` 都以 `https://cdn.xueleai.com/` 开头。
2. 每个时间线节点都能关联到状态为 `SUCCEEDED` 的 `AudioTask` 和 `storageProvider = S3` 的 `AudioAsset`。
3. R2 中每个对象的大小、类型和 SHA-256 与数据库记录一致。
4. 任意一句上传或校验失败时，课件不会显示生成完成。
5. 失败课件可以查到具体节点、阶段、任务 ID、错误码和中文错误信息。
6. Provider 临时 URL 过期后，学习页仍能正常播放所有逐句语音。
7. 普通语音合成与历史视频导学课件不受本轮修改影响。
8. 新流程不向数据库写入 `audioBase64`，不向前台暴露 R2 凭证或签名请求。
