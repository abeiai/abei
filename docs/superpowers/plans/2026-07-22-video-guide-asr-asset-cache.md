# 视频导学媒体资产级识别音频缓存实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在媒体上传阶段生成可复用的轻量识别音频，并让字幕任务优先复用媒体资产缓存，消除大视频每次从 R2 远程提取导致的三十分钟超时。

**Architecture:** `VideoGuideAsset` 保存稳定 ASR 缓存元数据，R2 对象 key 由原始媒体 SHA-256 决定。新媒体从上传缓冲区本地提取；历史媒体首次字幕任务远程回填并持久化；字幕检查点区分可复用缓存和任务临时对象，只有临时对象会被清理。

**Tech Stack:** NestJS、TypeScript、Prisma、PostgreSQL、Cloudflare R2 S3 API、ffmpeg、Node test runner、pnpm。

## Global Constraints

- 媒体上传上限保持三百 MB。
- 识别音频固定为单声道、十六千赫兹、四十八 kbps AAC，MIME 为 `audio/mp4`。
- 稳定对象 key 为 `video-guide/asr-cache/sha256/{hash 前两位}/{完整 hash}.m4a`。
- 新增数据库字段全部可空，历史记录不做批量数据更新。
- 字幕失败必须释放冻结点数，可复用缓存不得随字幕任务成功或失败删除。
- 所有用户可见错误使用简体中文，不输出签名 URL、R2 密钥或内部堆栈。
- 不修改课程模块和前端页面的现有未提交文件。

---

### Task 1: 媒体资产 ASR 缓存数据模型

**Files:**
- Create: `packages/database/prisma/migrations/20260722160000_video_guide_asr_asset_cache/migration.sql`
- Modify: `packages/database/prisma/schema.prisma`
- Create: `apps/api-core/src/video-guide/video-guide-asr-cache.ts`
- Create: `apps/api-core/tests/video-guide-asr-cache.test.ts`

**Interfaces:**
- Produces: `VideoGuideAsrCache`, `videoGuideAsrCacheFromAsset(value)`, `videoGuideAsrCacheObjectKey(hash)`。
- Produces Prisma fields: `asrObjectKey`, `asrMimeType`, `asrSizeBytes`, `asrPreparedAt`。

- [ ] **Step 1: Write the failing cache metadata test**

```ts
test("只有完整的媒体资产识别音频字段才可复用", () => {
  assert.equal(videoGuideAsrCacheFromAsset({ asrObjectKey: null }), null);
  assert.deepEqual(videoGuideAsrCacheFromAsset({
    asrObjectKey: "video-guide/asr-cache/sha256/ab/abcdef.m4a",
    asrMimeType: "audio/mp4",
    asrSizeBytes: 1024,
    asrPreparedAt: new Date("2026-07-22T08:00:00.000Z")
  }), {
    objectKey: "video-guide/asr-cache/sha256/ab/abcdef.m4a",
    mimeType: "audio/mp4",
    sizeBytes: 1024
  });
});

test("识别音频 key 由媒体哈希稳定生成", () => {
  const hash = "ab" + "1".repeat(62);
  assert.equal(
    videoGuideAsrCacheObjectKey(hash),
    `video-guide/asr-cache/sha256/ab/${hash}.m4a`
  );
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `pnpm --filter @xueleai/api-core exec node --import tsx --test tests/video-guide-asr-cache.test.ts`

Expected: FAIL because `video-guide-asr-cache.ts` does not exist.

- [ ] **Step 3: Add nullable Prisma fields and migration**

```prisma
model VideoGuideAsset {
  asrObjectKey  String?   @unique
  asrMimeType  String?
  asrSizeBytes Int?
  asrPreparedAt DateTime?
}
```

```sql
ALTER TABLE "video_guide_assets"
ADD COLUMN "asrObjectKey" TEXT,
ADD COLUMN "asrMimeType" TEXT,
ADD COLUMN "asrSizeBytes" INTEGER,
ADD COLUMN "asrPreparedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "video_guide_assets_asrObjectKey_key"
ON "video_guide_assets"("asrObjectKey");
```

- [ ] **Step 4: Implement cache parsing and deterministic key generation**

```ts
export interface VideoGuideAsrCache {
  objectKey: string;
  mimeType: string;
  sizeBytes: number;
}

export function videoGuideAsrCacheObjectKey(hash: string) {
  const normalized = hash.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalized)) throw new Error("无效的媒体文件哈希");
  return `video-guide/asr-cache/sha256/${normalized.slice(0, 2)}/${normalized}.m4a`;
}
```

- [ ] **Step 5: Generate Prisma client and verify GREEN**

Run: `pnpm --filter @xueleai/database db:generate && pnpm --filter @xueleai/api-core exec node --import tsx --test tests/video-guide-asr-cache.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/database/prisma/schema.prisma packages/database/prisma/migrations/20260722160000_video_guide_asr_asset_cache/migration.sql apps/api-core/src/video-guide/video-guide-asr-cache.ts apps/api-core/tests/video-guide-asr-cache.test.ts
git commit -m "feat(video-guide): add ASR cache metadata"
```

### Task 2: 从上传缓冲区提取轻量音频

**Files:**
- Modify: `apps/api-core/src/video-guide/video-guide-media-transcode.ts`
- Create: `apps/api-core/tests/video-guide-media-transcode.test.ts`

**Interfaces:**
- Produces: `extractVideoGuideAsrAudioFromBuffer(file): Promise<VideoGuideTranscodeFileLike>`。
- Retains: `extractVideoGuideAsrAudio({ mediaName, mediaUrl, onHeartbeat })` for historical fallback.

- [ ] **Step 1: Write failing local extraction test**

```ts
test("上传缓冲区可直接生成十六千赫兹单声道识别音频", async () => {
  const source = createFixtureMp4WithAudio();
  const result = await extractVideoGuideAsrAudioFromBuffer({
    buffer: source,
    mimetype: "video/mp4",
    originalname: "lesson.mp4",
    size: source.length
  });
  assert.equal(result.mimetype, "audio/mp4");
  assert.equal(result.originalname, "lesson.asr.m4a");
  assert.ok(result.size > 0);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `pnpm --filter @xueleai/api-core exec node --import tsx --test tests/video-guide-media-transcode.test.ts`

Expected: FAIL because `extractVideoGuideAsrAudioFromBuffer` is missing.

- [ ] **Step 3: Refactor extraction around a shared ffmpeg source helper**

```ts
async function extractVideoGuideAsrAudioFromSource(input: {
  mediaName: string;
  source: string;
  onHeartbeat?: () => Promise<void>;
}) { /* run ffmpeg and return validated m4a */ }

export async function extractVideoGuideAsrAudioFromBuffer(file: VideoGuideTranscodeFileLike) {
  // Write the trusted upload buffer to a temporary input file, then call the shared helper.
}
```

- [ ] **Step 4: Verify GREEN and existing transcode behavior**

Run: `pnpm --filter @xueleai/api-core exec node --import tsx --test tests/video-guide-media-transcode.test.ts tests/core-unit.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api-core/src/video-guide/video-guide-media-transcode.ts apps/api-core/tests/video-guide-media-transcode.test.ts
git commit -m "feat(video-guide): extract ASR audio during upload"
```

### Task 3: 新上传媒体生成并保存稳定缓存

**Files:**
- Modify: `apps/api-core/src/video-guide/video-guide.service.ts`
- Modify: `apps/api-core/tests/video-guide-generation-lease.test.ts`

**Interfaces:**
- Consumes: `extractVideoGuideAsrAudioFromBuffer`, `videoGuideAsrCacheObjectKey`。
- Produces: private `prepareUploadedMediaAsrCache(hash, file)` and `uploadVideoGuideAsrCacheToR2(hash, file)`。
- Extends: `CreateOrReferenceVideoGuideAssetInput` with optional ASR cache fields.

- [ ] **Step 1: Write failing service test for asset persistence**

```ts
test("创建媒体资产时原子保存识别音频缓存字段", async () => {
  const result = await service.createOrReferenceVideoGuideAsset({
    assetType: "MEDIA",
    hash: "ab" + "1".repeat(62),
    mediaType: "VIDEO",
    mimeType: "video/mp4",
    objectKey: "video-guide/media/sha256/ab/video.mp4",
    originalName: "lesson.mp4",
    sizeBytes: 2048,
    source: "UPLOAD",
    storageProvider: "S3",
    url: "https://cdn.xueleai.com/video-guide/media/sha256/ab/video.mp4",
    userId: "user-1",
    asrCache: {
      objectKey: "video-guide/asr-cache/sha256/ab/cache.m4a",
      mimeType: "audio/mp4",
      sizeBytes: 512
    }
  });
  assert.equal(createdData.asrObjectKey, "video-guide/asr-cache/sha256/ab/cache.m4a");
  assert.equal(createdData.asrSizeBytes, 512);
  assert.ok(createdData.asrPreparedAt instanceof Date);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `pnpm --filter @xueleai/api-core exec node --import tsx --test tests/video-guide-generation-lease.test.ts`

Expected: FAIL because the service input and persistence do not accept `asrCache`.

- [ ] **Step 3: Implement stable R2 upload and one-byte validation**

```ts
async function uploadVideoGuideAsrCacheToR2(hash: string, file: UploadedVideoGuideFileLike) {
  const objectKey = videoGuideAsrCacheObjectKey(hash);
  const uploaded = await uploadVideoGuideMediaToR2(objectKey, file, "");
  const signedUrl = signedVideoGuideR2UrlFromObjectKey(uploaded.objectKey);
  if (!signedUrl) throw new AppException(50001, "识别音频缓存地址生成失败", HttpStatus.BAD_GATEWAY);
  await assertVideoGuideAsrUrlReadable(signedUrl);
  return { objectKey: uploaded.objectKey, mimeType: file.mimetype, sizeBytes: file.size };
}
```

- [ ] **Step 4: Integrate cache preparation before creating a new media asset**

`uploadMediaFile` must extract from the original upload buffer, upload and validate the cache, then pass the cache fields into `createOrReferenceVideoGuideAsset`. If any cache step fails, do not create a new media asset. Stable hash-derived keys are not deleted in the request failure path because a concurrent upload may already reference the same key; the next identical upload overwrites the same object idempotently, so failures cannot create an unbounded set of orphan keys.

- [ ] **Step 5: Verify GREEN**

Run: `pnpm --filter @xueleai/api-core exec node --import tsx --test tests/video-guide-generation-lease.test.ts tests/video-guide-media-transcode.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api-core/src/video-guide/video-guide.service.ts apps/api-core/tests/video-guide-generation-lease.test.ts
git commit -m "feat(video-guide): cache upload-time ASR audio"
```

### Task 4: 字幕任务优先复用缓存并回填历史资产

**Files:**
- Modify: `apps/api-core/src/video-guide/video-guide-subtitle-checkpoint.ts`
- Modify: `apps/api-core/src/video-guide/video-guide.service.ts`
- Modify: `apps/api-core/tests/video-guide-subtitle-checkpoint.test.ts`
- Modify: `apps/api-core/tests/video-guide-generation-lease.test.ts`

**Interfaces:**
- Extends: `VideoGuideSubtitleCheckpoint.asrReusable: boolean`。
- Produces: private `findReusableVideoGuideAsrCache(dto)` and `persistVideoGuideAsrCache(assetId, cache)`。

- [ ] **Step 1: Write failing checkpoint cleanup test**

```ts
test("检查点保留可复用缓存标记", () => {
  const restored = videoGuideSubtitleCheckpointFromValue({
    ...createVideoGuideSubtitleCheckpoint({ jobId: "job-1", now }),
    asrObjectKey: "video-guide/asr-cache/sha256/ab/cache.m4a",
    asrReusable: true
  }, "job-1");
  assert.equal(restored?.asrReusable, true);
});
```

- [ ] **Step 2: Write failing cache-hit service test**

```ts
test("字幕任务命中媒体资产缓存时不执行远程视频提取", async () => {
  const prepared = await service.prepareVideoGuideAsrMediaForTest({
    mediaStorageKey: "video-guide/media/sha256/ab/video.mp4"
  });
  assert.equal(prepared.reusable, true);
  assert.equal(remoteExtractionCalls, 0);
});
```

- [ ] **Step 3: Run tests and verify RED**

Run: `pnpm --filter @xueleai/api-core exec node --import tsx --test tests/video-guide-subtitle-checkpoint.test.ts tests/video-guide-generation-lease.test.ts`

Expected: FAIL because `asrReusable` and cache lookup do not exist.

- [ ] **Step 4: Implement cache lookup, validation and invalidation**

Find the `MEDIA` asset by `objectKey = mediaStorageKey`. Complete cache fields produce a signed URL and one-byte preflight. Failed preflight clears the four ASR fields with a conditional update before falling back.

- [ ] **Step 5: Persist historical fallback as stable cache**

When a media asset exists but has no valid cache, remote extraction uploads to `videoGuideAsrCacheObjectKey(asset.hash)`, validates it, updates the asset, and returns `{ reusable: true }`. Only DTOs that cannot be matched to a media asset continue to use `video-guide/asr-temp/`.

- [ ] **Step 6: Protect reusable cache from task cleanup**

```ts
if (failureCommitted && checkpoint.asrObjectKey && !checkpoint.asrReusable) {
  await deleteVideoGuideR2Object(checkpoint.asrObjectKey).catch((cleanupError) => {
    logger.warn(`字幕识别临时文件清理失败：${videoGuideGenerationErrorMessage(cleanupError)}`);
  });
}
```

Apply the same condition to success cleanup. Set historical preprocessing fallback to ninety minutes while leaving provider polling limits unchanged.

- [ ] **Step 7: Verify GREEN**

Run: `pnpm --filter @xueleai/api-core exec node --import tsx --test tests/video-guide-subtitle-checkpoint.test.ts tests/video-guide-generation-lease.test.ts tests/core-unit.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/api-core/src/video-guide/video-guide-subtitle-checkpoint.ts apps/api-core/src/video-guide/video-guide.service.ts apps/api-core/tests/video-guide-subtitle-checkpoint.test.ts apps/api-core/tests/video-guide-generation-lease.test.ts
git commit -m "fix(video-guide): reuse cached ASR audio for subtitles"
```

### Task 5: 集成验收、迁移和生产验证

**Files:**
- Modify only if tests expose a defect in files already listed above.

**Interfaces:**
- Verifies the complete upload -> asset cache -> subtitle submit flow.

- [ ] **Step 1: Apply the migration to the local development database**

Run: `pnpm db:migrate`

Expected: migration `20260722160000_video_guide_asr_asset_cache` applied successfully.

- [ ] **Step 2: Run API Core targeted tests and typecheck**

Run: `pnpm --filter @xueleai/database build && pnpm --filter @xueleai/api-core test && pnpm --filter @xueleai/api-core typecheck`

Expected: PASS with zero failed tests and zero TypeScript errors.

- [ ] **Step 3: Run repository-wide release verification**

Run: `pnpm test && pnpm typecheck && pnpm build && pnpm release:check`

Expected: all commands succeed.

- [ ] **Step 4: Perform independent code review**

Review must check deterministic-key concurrency, R2 cleanup safety, nullable migration compatibility, checkpoint recovery and points release behavior. Address only findings caused by this change and rerun affected tests.

- [ ] **Step 5: Commit review fixes if needed**

```bash
git add packages/database/prisma apps/api-core/src/video-guide apps/api-core/tests
git commit -m "fix(video-guide): harden ASR asset cache"
```

- [ ] **Step 6: Merge the isolated branch without including unrelated worktree changes**

Use the repository's normal non-destructive integration flow. Confirm `git diff --name-only` contains only the spec, plan, migration, video-guide source and video-guide tests.

- [ ] **Step 7: Publish GitHub and deploy production**

Run the repository release scripts. Confirm remote `main` points to the release commit, deploy to `/opt/xueleai`, preserve `.env.production`, `deploy/data/` and `deploy/certs/`, and apply migrations with `prisma migrate deploy` only.

- [ ] **Step 8: Verify production**

Run:

```bash
curl -fsS https://xueleai.com/api/health
curl -fsS https://xueleai.com/api/system-config/public
```

Then verify a new upload has all four ASR cache fields and its subtitle task leaves `PREPARING_AUDIO` without spawning a remote-video ffmpeg process. Re-run the current historical lesson once and verify it writes cache metadata before submitting to the ASR provider.
