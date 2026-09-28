# Video Guide Async Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make subtitle recognition, guide narration generation, narration audio synthesis, and practice generation durable background operations with visible persisted progress, while retrying failed guide generation on the same lesson record.

**Architecture:** Store a versioned operation progress object in `VideoGuideLesson.content` for each operation, so no database migration is required. API submission endpoints reserve credits, persist a queued operation, return the existing lesson immediately, and schedule background work; the web client polls lessons and renders the persisted phase/count state. Guide writing is split into bounded sentence batches with validation, retry, and recursive splitting before audio synthesis begins.

**Tech Stack:** NestJS, Prisma JSON fields, Next.js App Router, React, TypeScript, Node test runner.

## Global Constraints

- Keep all user-facing copy in Simplified Chinese.
- Preserve the unified API response shape `{ code, message, data }`.
- Reuse `VideoGuideLesson.content`; do not add a database migration.
- Upload requests remain foreground operations; every AI generation operation is asynchronous and explicitly marked as safe to leave.
- Regeneration of a `DRAFT`, `FAILED`, or `SUCCEEDED` lesson must reuse the same lesson ID.
- Do not modify unrelated dirty worktree files.

---

### Task 1: Persisted Operation Progress

**Files:**
- Create: `apps/api-core/src/video-guide/video-guide-operation-progress.ts`
- Create: `apps/api-core/tests/video-guide-operation-progress.test.ts`

**Interfaces:**
- Produces: `VideoGuideOperationProgress`, `createVideoGuideOperationProgress`, `updateVideoGuideOperationProgress`, and `mergeVideoGuideOperationProgressContent`.
- Progress includes operation, status, phase, completed, total, percent, message, `canLeave: true`, timestamps, and a friendly failure message.

- [ ] Write failing tests for queued, running, succeeded, failed, percentage, and content merge behavior.
- [ ] Run `pnpm --filter @xueleai/api-core test -- video-guide-operation-progress.test.ts` and confirm failure.
- [ ] Implement the minimal immutable progress helpers and legal state transitions.
- [ ] Re-run the focused test and confirm it passes.

### Task 2: Asynchronous Subtitle and Practice Jobs

**Files:**
- Modify: `apps/api-core/src/video-guide/video-guide.service.ts`
- Modify: `apps/api-core/tests/video-guide-operation-progress.test.ts`

**Interfaces:**
- Subtitle submission requires an existing lesson ID, returns that lesson with `subtitleGenerationProgress.status = "QUEUED"`, then runs ASR, stores SRT, links it to the same lesson, and settles credits in the background.
- Practice submission returns the lesson with `practiceGenerationProgress.status = "QUEUED"`, then generates and stores ten questions in the background.

- [ ] Add failing tests for operation scheduling state and same-record content merge.
- [ ] Change subtitle and practice submission paths to reserve, persist queued progress, schedule work, and return immediately.
- [ ] Persist running, success, and failure phases around model call, storage, validation, and credit settlement.
- [ ] Verify failure releases credits and leaves a retryable lesson record.

### Task 3: Reliable Batched Guide Writing

**Files:**
- Create: `apps/api-core/src/video-guide/video-guide-narration-batches.ts`
- Create: `apps/api-core/tests/video-guide-narration-batches.test.ts`
- Modify: `apps/api-core/src/video-guide/video-guide.service.ts`

**Interfaces:**
- Produces bounded globally indexed cue batches with one neighboring context cue on each side.
- Generates sentence batches with at most two concurrent requests, validates every requested `sentenceId`, retries malformed output once, then recursively splits failing groups.
- Persists `narrationGenerationProgress` for preparing, writing batches, synthesizing audio, verifying audio, and finalizing.

- [ ] Write failing tests showing 205 cues are covered once, IDs remain stable, and failed batches split without losing order.
- [ ] Implement batch planning and recursive split decisions as pure helpers.
- [ ] Replace the oversized one-shot request and sequential four-sentence repair loop with the bounded orchestrator.
- [ ] Generate overview intro/summary separately from representative cues and merge ordered sentence nodes.
- [ ] Update persisted progress after each completed batch and audio node.
- [ ] Run narration timeline, batch, audio progress, synthesis, and storage tests.

### Task 4: Same-Record Regeneration

**Files:**
- Modify: `apps/web/src/components/experience/video-guide-console.tsx`
- Create or modify: `apps/web/tests/video-guide-console-state.test.ts`

**Interfaces:**
- A selected failed history item remains `workingLesson` during billing and submission.
- `lessonRequestBody` always includes the reusable lesson ID for retries.
- Local and API history merge by ID, so status updates replace rather than append.

- [ ] Add a failing state/helper test reproducing a failed lesson becoming a new record.
- [ ] Preserve the failed lesson selection through media/subtitle restore and generation submission.
- [ ] Ensure retry submission sends `lessonId` and history merge replaces the existing item.
- [ ] Verify one title/date row remains after repeated retries.

### Task 5: Frontend Async Progress and Recovery

**Files:**
- Modify: `apps/web/src/lib/video-guide-data.ts`
- Modify: `apps/web/src/components/experience/video-guide-console.tsx`
- Modify: `apps/web/src/app/api/video-guide/subtitles/generate/route.ts`
- Modify: `apps/web/tests/video-guide-data.test.ts`

**Interfaces:**
- Parse all three progress objects from lesson content.
- Every operation block displays phase message, completed/total when available, progress, and “可以关闭页面，后台会继续生成”.
- Poll pending operations after reload and refresh the selected lesson, files, questions, and completion toast.

- [ ] Write failing parser tests for queued/running/succeeded/failed progress payloads.
- [ ] Remove the long-running subtitle proxy and use a normal short submission proxy.
- [ ] Replace fake subtitle/practice timers with persisted progress and indeterminate queued/running feedback when no count exists.
- [ ] Render the existing status text instead of discarding it.
- [ ] Poll lessons containing any active operation, including `DRAFT` and `SUCCEEDED` lessons.
- [ ] Restore generated subtitle text and practice completion after leaving and returning.

### Task 6: Verification

**Files:**
- Verify only; no unrelated edits.

- [ ] Run focused API tests for video guide progress, batching, narration parsing, synthesis, storage, and lease behavior.
- [ ] Run `pnpm --filter @xueleai/api-core typecheck` and `pnpm --filter @xueleai/api-core lint`.
- [ ] Run focused web tests, `pnpm --filter @xueleai/web typecheck`, and `pnpm --filter @xueleai/web lint`.
- [ ] Run `git diff --check` and inspect the diff for unrelated changes.
- [ ] In the browser, retry the failed Hamster lesson and confirm the same history row changes from failed to queued/running.
- [ ] Reload the page while each generation type runs and confirm persisted progress returns with leave-safe wording.
