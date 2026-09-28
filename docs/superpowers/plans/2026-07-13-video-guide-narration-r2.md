# Video Guide Narration R2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every newly generated video-guide narration node persist to Cloudflare R2 and expose durable per-node generation, upload, and verification state before the lesson can succeed.

**Architecture:** `AudioService` delegates opt-in video-guide output persistence to a focused R2 helper and marks a TTS task successful only after PUT and HEAD verification. A video-guide synthesis module emits per-node transitions; `VideoGuideService` saves those transitions in `content.narrationAudioProgress` and writes the final timeline only after every R2 asset passes validation.

**Tech Stack:** NestJS, TypeScript, Prisma JSON fields, Node test runner, Cloudflare R2 S3-compatible signed HTTP requests.

## Global Constraints

- Only new or explicitly regenerated lessons use this flow; do not migrate historical narration audio.
- Do not modify Prisma schema or create a database migration.
- Do not change ordinary TTS behavior; mandatory R2 persistence requires `source: VIDEO_GUIDE` and an explicit persistence request.
- Learner-facing narration URLs must use `https://cdn.xueleai.com`, never Provider temporary OSS URLs.
- Do not store `audioBase64`, Provider signed URLs, R2 credentials, or signed R2 requests in the database.
- Keep all user-facing errors in Simplified Chinese.
- Preserve unrelated dirty worktree changes.

---

## File Structure

- Create `apps/api-core/src/audio/video-guide-narration-storage.ts`: output extraction, object naming, signed PUT/HEAD, metadata verification, payload sanitization.
- Create `apps/api-core/tests/video-guide-narration-storage.test.ts`: storage tests with injected fetch responses.
- Modify `apps/api-core/src/audio/audio.service.ts`: opt-in persistence, callbacks, real S3 `AudioAsset`, sanitized settlement.
- Create `apps/api-core/src/video-guide/video-guide-narration-progress.ts`: pure progress state and persisted task validation.
- Create `apps/api-core/src/video-guide/video-guide-narration-synthesis.ts`: sequential stop-on-first-failure orchestration.
- Create `apps/api-core/tests/video-guide-narration-progress.test.ts`.
- Create `apps/api-core/tests/video-guide-narration-synthesis.test.ts`.
- Modify `apps/api-core/src/video-guide/video-guide.service.ts`: persist progress and final R2-only timeline.
- Modify `.env.example`, `.env.production.example`, `docker-compose.prod.yml`: narration storage configuration.

---

### Task 1: R2 Narration Storage Helper

**Files:**
- Create: `apps/api-core/src/audio/video-guide-narration-storage.ts`
- Create: `apps/api-core/tests/video-guide-narration-storage.test.ts`

**Interfaces:**
- Consumes: Provider `audioBase64` or `audioUrl`, IDs for lesson/generation/node/task, R2 config, optional injected fetch.
- Produces: `persistVideoGuideNarrationAudio`, `sanitizePersistedTtsPayload`, `persistedVideoGuideAudioFromPayload`, `audioAssetDataFromTtsPayload`, and typed storage errors.

- [ ] **Step 1: Write the failing tests**

Create tests for Base64 upload, URL fallback, empty output, oversized output, PUT failure, HEAD length mismatch, content-type mismatch, metadata hash mismatch, and payload sanitization.

The sanitization case must include a nested `raw.output.audio.url` and `raw.output.audio.data`; neither `raw` nor either secret-bearing value may survive in the settled payload. Object path tests must also reject or normalize path separators in lesson, generation, node, and task identifiers.

```ts
test("视频导学语音使用 Base64 上传 R2 并通过 HEAD 校验", async () => {
  const stages: string[] = [];
  const persisted = await persistVideoGuideNarrationAudio({
    providerPayload: {
      audioBase64: Buffer.from("mp3-data").toString("base64"),
      requestId: "req-1"
    },
    request: {
      lessonId: "lesson-1",
      generationId: "generation-1",
      nodeId: "s_001",
      audioTaskId: "task-1",
      format: "mp3"
    },
    config: testR2Config(),
    fetchImpl: successfulR2Fetch(Buffer.byteLength("mp3-data")),
    onStage: async (stage) => stages.push(stage)
  });

  assert.deepEqual(stages, ["UPLOADING", "VERIFYING"]);
  assert.equal(
    persisted.objectKey,
    "video-guide/narration/lesson-1/generation-1/s_001-task-1.mp3"
  );
  assert.equal(persisted.url, `https://cdn.xueleai.com/${persisted.objectKey}`);
  assert.ok(persisted.sizeBytes > 0);
});
```

- [ ] **Step 2: Run the test and verify RED**

```bash
cd apps/api-core
node --import tsx --test tests/video-guide-narration-storage.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the storage helper**

Define:

```ts
export type VideoGuideNarrationPersistenceStage = "UPLOADING" | "VERIFYING";

export interface VideoGuideNarrationPersistenceRequest {
  lessonId: string;
  generationId: string;
  nodeId: string;
  audioTaskId: string;
  format: "mp3";
}

export interface PersistedVideoGuideNarrationAudio {
  storageProvider: "S3";
  objectKey: string;
  url: string;
  mimeType: "audio/mpeg";
  sizeBytes: number;
  sha256: string;
}

export class VideoGuideNarrationStorageError extends Error {
  constructor(
    readonly code:
      | "TTS_OUTPUT_MISSING"
      | "TTS_OUTPUT_DOWNLOAD_FAILED"
      | "TTS_OUTPUT_INVALID"
      | "R2_UPLOAD_FAILED"
      | "R2_VERIFY_FAILED"
      | "R2_CONFIG_MISSING",
    message: string
  ) {
    super(message);
  }
}
```

Implementation must decode Base64 before trying the URL, enforce a default twenty-five MB limit, compute SHA-256, PUT with immutable cache metadata, then HEAD the object and compare exact length, normalized content type, and `x-amz-meta-sha256`. Use the repository's existing S3 canonical signing rules. Tests inject config and fetch; production uses environment config and global fetch.

- [ ] **Step 4: Verify GREEN**

Run the Task 1 test file. Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api-core/src/audio/video-guide-narration-storage.ts apps/api-core/tests/video-guide-narration-storage.test.ts
git commit -m "feat(audio): persist video guide narration to r2"
```

---

### Task 2: Audio Task Success Requires a Verified R2 Asset

**Files:**
- Modify: `apps/api-core/src/audio/audio.service.ts`
- Modify: `apps/api-core/tests/video-guide-narration-storage.test.ts`

**Interfaces:**
- Consumes: `videoGuidePersistence` request and `onPersistenceStatus` callback.
- Produces: successful `AudioTask` only with a real S3 `outputAudioAsset`; sanitized `providerPayload.persistence`.

- [ ] **Step 1: Add failing asset and payload tests**

```ts
const sanitized = sanitizePersistedTtsPayload(
  {
    audioBase64: "large-base64",
    audioUrl: "https://provider.example/temp.mp3?signature=secret",
    requestId: "req-1",
    usage: { inputCharacters: 12 },
    latencyMs: 125
  },
  persisted
);

assert.equal("audioBase64" in sanitized, false);
assert.equal("audioUrl" in sanitized, false);
assert.deepEqual(sanitized.persistence, { status: "SUCCEEDED", ...persisted });

const asset = audioAssetDataFromTtsPayload("user-1", sanitized);
assert.equal(asset?.storageProvider, "S3");
assert.equal(asset?.sizeBytes, persisted.sizeBytes);
```

- [ ] **Step 2: Run tests and verify RED**

Expected: FAIL because asset conversion is absent.

- [ ] **Step 3: Extend the internal input contract**

```ts
export interface ExternalBillingTtsTaskInput {
  // Existing scalar fields remain unchanged.
  videoGuidePersistence?: Omit<
    VideoGuideNarrationPersistenceRequest,
    "audioTaskId"
  >;
  onPersistenceStatus?: (event: {
    stage: "UPLOADING" | "VERIFYING";
    audioTaskId: string;
  }) => Promise<void>;
}
```

Never include callbacks in Prisma JSON.

- [ ] **Step 4: Persist before settlement**

In `executeTtsTask`, after Provider success and before `settleSuccessfulAudioTask`:

```ts
const persisted = await persistVideoGuideNarrationAudio({
  providerPayload: payload,
  request: { ...videoGuidePersistence, audioTaskId: taskId },
  onStage: async (stage) => {
    await onPersistenceStatus?.({ stage, audioTaskId: taskId });
  }
});
const settledPayload = sanitizePersistedTtsPayload(payload, persisted);
return this.settleSuccessfulAudioTask(taskId, settledPayload);
```

On storage error, pass its stable code and Chinese message to `releaseFailedAudioTask`. The video-guide synthesis layer reads the returned failed task and emits exactly one `FAILED` node transition; AudioService does not emit terminal node states.

- [ ] **Step 5: Create a real S3 output asset**

```ts
const persisted = persistedVideoGuideAudioFromPayload(providerPayload);

if (persisted) {
  const asset = await transaction.audioAsset.create({
    data: {
      userId,
      type: "TTS_OUTPUT",
      storageProvider: "S3",
      url: persisted.url,
      objectKey: persisted.objectKey,
      mimeType: persisted.mimeType,
      sizeBytes: persisted.sizeBytes
    }
  });
  return asset.id;
}
```

Keep existing Provider URL fallback only for non-video-guide TTS.

- [ ] **Step 6: Verify**

```bash
cd apps/api-core
node --import tsx --test tests/video-guide-narration-storage.test.ts
cd ../..
pnpm --filter @xueleai/api-core typecheck
```

Expected: tests and typecheck PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api-core/src/audio/audio.service.ts apps/api-core/tests/video-guide-narration-storage.test.ts
git commit -m "feat(audio): require verified r2 output for video guide tts"
```

---

### Task 3: Per-Node Progress and Sequential Synthesis

**Files:**
- Create: `apps/api-core/src/video-guide/video-guide-narration-progress.ts`
- Create: `apps/api-core/src/video-guide/video-guide-narration-synthesis.ts`
- Create: `apps/api-core/tests/video-guide-narration-progress.test.ts`
- Create: `apps/api-core/tests/video-guide-narration-synthesis.test.ts`

**Interfaces:**
- Consumes: narration drafts and verified AudioService task results.
- Produces: immutable progress snapshots, strict asset validation, and final timeline audio metadata.

- [ ] **Step 1: Write failing progress tests**

```ts
const progress = createNarrationAudioProgress(
  "generation-1",
  drafts,
  "2026-07-13T00:00:00.000Z"
);
assert.equal(progress.total, drafts.length);
assert.equal(progress.completed, 0);
assert.ok(progress.nodes.every((node) => node.status === "PENDING"));

const succeeded = updateNarrationAudioProgress(
  progress,
  "s_001",
  {
    status: "SUCCEEDED",
    audioTaskId: "task-1",
    audioAssetId: "asset-1",
    objectKey: "video-guide/narration/lesson/generation/s_001-task-1.mp3",
    audioUrl: "https://cdn.xueleai.com/video-guide/narration/lesson/generation/s_001-task-1.mp3",
    sizeBytes: 1024,
    sha256: "abc"
  },
  "2026-07-13T00:00:01.000Z"
);
assert.equal(succeeded.completed, 1);
```

Also reject non-success task status, missing asset, non-S3 provider, wrong Key prefix, wrong CDN base, wrong MIME, zero size, or missing hash.

- [ ] **Step 2: Write failing synthesis tests**

Use fake dependencies to assert exact transition order:

```ts
assert.deepEqual(events.slice(0, 4), [
  "intro:GENERATING",
  "intro:UPLOADING",
  "intro:VERIFYING",
  "intro:SUCCEEDED"
]);
```

Make the second node fail and assert the third node is never invoked and the second receives `FAILED`.

- [ ] **Step 3: Run tests and verify RED**

```bash
cd apps/api-core
node --import tsx --test tests/video-guide-narration-progress.test.ts tests/video-guide-narration-synthesis.test.ts
```

Expected: FAIL because both modules are missing.

- [ ] **Step 4: Implement progress helpers**

```ts
export function createNarrationAudioProgress(
  generationId: string,
  drafts: NarrationProgressDraft[],
  now: string
): NarrationAudioProgress;

export function updateNarrationAudioProgress(
  progress: NarrationAudioProgress,
  nodeId: string,
  patch: NarrationAudioProgressPatch,
  now: string
): NarrationAudioProgress;

export function verifiedNarrationAudioFromTask(
  task: unknown,
  expectedPrefix: string,
  expectedPublicBaseUrl: string
): VerifiedNarrationAudio;
```

Recompute `completed`, `failed`, and `currentNodeId` from nodes after every immutable transition.

- [ ] **Step 5: Implement sequential synthesis**

`synthesizeVideoGuideNarrationTimeline` processes array order, emits `GENERATING`, forwards persistence stages, validates the result, emits `SUCCEEDED`, and stops immediately after emitting `FAILED` for the first exception.

- [ ] **Step 6: Verify GREEN**

Run the two focused test files. Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api-core/src/video-guide/video-guide-narration-progress.ts apps/api-core/src/video-guide/video-guide-narration-synthesis.ts apps/api-core/tests/video-guide-narration-progress.test.ts apps/api-core/tests/video-guide-narration-synthesis.test.ts
git commit -m "feat(video-guide): track narration audio progress"
```

---

### Task 4: Wire Durable Audio into Lesson Generation

**Files:**
- Modify: `apps/api-core/src/video-guide/video-guide.service.ts`
- Modify: `apps/api-core/tests/video-guide-narration-synthesis.test.ts`

**Interfaces:**
- Consumes: Tasks 2 and 3.
- Produces: durable `content.narrationAudioProgress` and R2-only final `content.narrationTimeline`.

- [ ] **Step 1: Add a failing progress persistence test**

Use a fake `persistProgress` callback. Assert initialization stores all nodes as `PENDING`, each transition saves a new snapshot, success ends with `completed === total`, and failure retains completed and failed node diagnostics.

- [ ] **Step 2: Run and verify RED**

Run `video-guide-narration-synthesis.test.ts`. Expected: the persistence callback behavior test FAILS.

- [ ] **Step 3: Initialize progress before TTS**

```ts
const generationId = randomBytes(12).toString("hex");
let audioProgress = createNarrationAudioProgress(
  generationId,
  draftTimeline,
  new Date().toISOString()
);
await this.persistNarrationAudioProgress(lessonId, audioProgress);
```

`persistNarrationAudioProgress` reads current content, merges only `narrationAudioProgress`, and updates only `QUEUED` or `GENERATING` lessons.

- [ ] **Step 4: Replace the inline loop**

Pass lesson/generation/node IDs and status callbacks to `synthesizeTtsForExternalBilling`. For each event:

```ts
audioProgress = updateNarrationAudioProgress(
  audioProgress,
  event.nodeId,
  event.patch,
  new Date().toISOString()
);
await this.persistNarrationAudioProgress(lessonId, audioProgress);
```

Final timeline nodes include:

```ts
{
  ...draftNode,
  audioTaskId: verified.audioTaskId,
  audioAssetId: verified.audioAssetId,
  audioUrl: verified.url,
  audioObjectKey: verified.objectKey,
  audioSizeBytes: verified.sizeBytes,
  audioSha256: verified.sha256,
  ...(verified.durationMs ? { durationMs: verified.durationMs } : {})
}
```

- [ ] **Step 5: Preserve progress on success and failure**

`mergeLessonNarrationContent` retains the final progress. The existing catch updates status and error without replacing content, so diagnostics survive.

- [ ] **Step 6: Verify**

```bash
cd apps/api-core
node --import tsx --test tests/video-guide-narration-storage.test.ts tests/video-guide-narration-progress.test.ts tests/video-guide-narration-synthesis.test.ts tests/video-guide-narration-timeline.test.ts
cd ../..
pnpm --filter @xueleai/api-core typecheck
```

Expected: focused tests and typecheck PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api-core/src/video-guide/video-guide.service.ts apps/api-core/tests/video-guide-narration-synthesis.test.ts
git commit -m "feat(video-guide): require durable narration audio"
```

---

### Task 5: Configuration and End-to-End Verification

**Files:**
- Modify: `.env.example`
- Modify: `.env.production.example`
- Modify: `docker-compose.prod.yml`

**Interfaces:**
- Consumes: deployment environment.
- Produces: consistent prefix, maximum bytes, and request timeout inside `api-core`.

- [ ] **Step 1: Add configuration**

```dotenv
VIDEO_GUIDE_R2_NARRATION_PREFIX="video-guide/narration/"
VIDEO_GUIDE_NARRATION_AUDIO_MAX_BYTES="26214400"
VIDEO_GUIDE_R2_REQUEST_TIMEOUT_MS="30000"
```

Pass the same values through the `api-core` service in `docker-compose.prod.yml`.

- [ ] **Step 2: Run complete API verification**

```bash
pnpm --filter @xueleai/api-core test
pnpm --filter @xueleai/api-core typecheck
pnpm --filter @xueleai/api-core build
git diff --check
```

Expected: every command exits zero.

- [ ] **Step 3: Verify a real new lesson**

Generate one new lesson with configured R2 credentials and verify:

```text
lesson.status = SUCCEEDED
content.narrationAudioProgress.completed = content.narrationAudioProgress.total
content.narrationTimeline[*].audioUrl starts with https://cdn.xueleai.com/
audio_tasks[*].status = SUCCEEDED
audio_assets[*].storageProvider = S3
audio_assets[*].sizeBytes > 0
```

For one node, request the public CDN object and compare length, type, and stored SHA-256 metadata.

- [ ] **Step 4: Verify failure behavior**

Use the focused test's forced HEAD mismatch. Confirm `R2_VERIFY_FAILED`, a non-success lesson, and a retained failed node in `narrationAudioProgress`.

- [ ] **Step 5: Commit configuration**

```bash
git add .env.example .env.production.example docker-compose.prod.yml
git commit -m "chore(video-guide): configure narration r2 storage"
```

- [ ] **Step 6: Final scope review**

Confirm there is no history migration, Prisma migration, ordinary TTS behavior change, Provider temporary URL in learner data, or unrelated worktree file in the feature diff.
