# Video Guide Script and TTS Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split video guide script writing and narration TTS into two separately billed, durable asynchronous steps on the same lesson record.

**Architecture:** Keep the existing Prisma model and store a script draft timeline plus two independent job/progress objects in `VideoGuideLesson.content`. The existing lesson endpoint becomes script-only generation; a new narration-audio endpoint synthesizes the persisted draft, verifies every R2 asset, and is the only operation that marks the lesson complete.

**Tech Stack:** NestJS, Prisma JSON, Next.js App Router, React, TypeScript, Node test runner.

## Global Constraints

- All user-facing copy is Simplified Chinese.
- Keep API responses in `{ code, message, data }` format.
- Do not add a Prisma migration.
- Both operations are asynchronous and safe to leave.
- Retries reuse the same lesson ID.
- A lesson is shareable only after narration TTS succeeds.
- Do not stage or modify unrelated dirty worktree files.

---

### Task 1: Extend Durable Operation Types

**Files:**
- Modify: `apps/api-core/src/video-guide/video-guide-operation-progress.ts`
- Modify: `apps/api-core/src/video-guide/video-guide-operation-job.ts`
- Modify: `apps/api-core/tests/video-guide-operation-progress.test.ts`
- Modify: `apps/api-core/tests/video-guide-operation-job.test.ts`

**Interfaces:**
- `VideoGuideOperation` adds `NARRATION_TTS`.
- Job key adds `narrationTtsGenerationJob`.
- Progress key adds `narrationTtsGenerationProgress`.

- [ ] Add failing tests that parse, create, lease, merge, and recover a `NARRATION_TTS` job and progress object.
- [ ] Run the two focused test files and confirm they fail because the new operation and keys are rejected.
- [ ] Extend the operation, job-key, and progress-key unions plus runtime guards.
- [ ] Re-run the focused tests and confirm they pass.

### Task 2: Make Script Generation Stop Before TTS

**Files:**
- Modify: `apps/api-core/src/video-guide/video-guide.service.ts`
- Create: `apps/api-core/src/video-guide/video-guide-generation-state.ts`
- Create: `apps/api-core/tests/video-guide-generation-state.test.ts`

**Interfaces:**
- `scriptReadyContent(content, draft, metadata)` stores `narrationDraftTimeline` and `narrationScript` while clearing stale final audio and questions.
- Script success returns lesson status to `DRAFT` and settles only the script operation.
- `lessonBillingItems` returns only `GUIDE_CONTENT`.

- [ ] Write failing pure-helper tests showing script success keeps draft nodes, removes final audio fields and old questions, and reports the lesson as not complete.
- [ ] Run the focused test and verify the missing helper failure.
- [ ] Extract the generation-state helper and use it in the script success path.
- [ ] Remove `synthesizeNarrationTimeline` from `generateLessonContent` and update script progress phases/messages.
- [ ] Split the billing item builder so script estimation excludes TTS.
- [ ] Run the focused state, billing, batching, and narration parser tests.

### Task 3: Add Separately Billed Narration Audio Submission

**Files:**
- Modify: `apps/api-core/src/video-guide/video-guide.controller.ts`
- Modify: `apps/api-core/src/video-guide/video-guide.service.ts`
- Create: `apps/api-core/src/video-guide/dto/generate-video-guide-narration-audio.dto.ts`
- Modify: `apps/api-core/tests/video-guide-generation-state.test.ts`

**Interfaces:**
- `POST /video-guide/lessons/:id/narration-audio/estimate` estimates TTS from persisted script characters.
- `POST /video-guide/lessons/:id/narration-audio` reserves credits, queues `NARRATION_TTS`, and returns immediately.
- The DTO contains `billingConfirmed`, `narrationVoice`, and optional `narrationTtsModelAlias`.

- [ ] Add failing tests for script-ready validation, real-character TTS billing, queue content, and same-record retry behavior.
- [ ] Run focused tests and confirm the new state transitions are missing.
- [ ] Implement estimate and submission service methods plus authenticated controller routes.
- [ ] Reject missing script, active operations, and invalid voice with friendly Chinese errors.
- [ ] Reserve a unique TTS operation key and persist queued job/progress on the existing lesson.
- [ ] Re-run focused tests.

### Task 4: Execute and Recover Narration Audio

**Files:**
- Modify: `apps/api-core/src/video-guide/video-guide.service.ts`
- Modify: `apps/api-core/tests/video-guide-operation-job.test.ts`
- Modify: `apps/api-core/tests/video-guide-narration-progress.test.ts`

**Interfaces:**
- `runStoredNarrationTtsGeneration(lessonId)` leases and runs the persisted TTS job.
- TTS success writes final `narrationTimeline`, marks the lesson `SUCCEEDED`, and settles the TTS operation.
- TTS failure preserves node progress, marks the lesson `FAILED`, and releases only TTS credits.

- [ ] Add failing tests for recovery selection, TTS lease behavior, success finalization, and failure retry state.
- [ ] Run the focused tests and confirm `NARRATION_TTS` is not recovered.
- [ ] Move existing synthesis/finalization into the new TTS worker using persisted draft nodes.
- [ ] Add scheduler and startup/interval recovery handling for the new job.
- [ ] Keep R2 upload and verification unchanged and mandatory.
- [ ] Run operation, narration progress, synthesis, and R2 tests.

### Task 5: Parse and Proxy the New Step

**Files:**
- Modify: `apps/web/src/lib/video-guide-data.ts`
- Modify: `apps/web/tests/video-guide-data.test.ts`
- Create: `apps/web/src/app/api/video-guide/lessons/[id]/narration-audio/route.ts`
- Create: `apps/web/src/app/api/video-guide/lessons/[id]/narration-audio/estimate/route.ts`

**Interfaces:**
- Web content parses `narrationTtsGenerationProgress` and draft timeline readiness.
- Next.js routes forward authenticated estimate and submission requests.

- [ ] Add failing parser tests for TTS queued/running/succeeded/failed progress and active-generation detection.
- [ ] Run the focused web test and confirm the field is ignored.
- [ ] Extend types, runtime parsing, refresh-ID detection, and status helpers.
- [ ] Add the two short-lived API proxy routes following existing practice route behavior.
- [ ] Re-run the focused web tests.

### Task 6: Split the Frontend Workflow and Billing Dialog

**Files:**
- Modify: `apps/web/src/components/experience/video-guide-console.tsx`
- Modify: `apps/web/tests/video-guide-console-state.test.ts`

**Interfaces:**
- Billing action adds `narrationAudio` with its own estimate and lesson.
- Script action no longer requires a selected voice.
- TTS action requires script-ready content and a selected multilingual voice.
- Two `InlineProgress` components display independent persisted progress.

- [ ] Add failing helper/state tests for script-ready/TTS-ready/completed button states and same-record requests.
- [ ] Run the focused test and confirm TTS is incorrectly tied to script generation.
- [ ] Keep “导学文案” as script-only with its own fee dialog and progress.
- [ ] Add “讲解语音” below it with voice selection, disabled state, fee dialog, and progress.
- [ ] Update polling notifications and history status text for script-ready, TTS-running, TTS-failed, and complete states.
- [ ] Ensure learning/share remain disabled until lesson status is `SUCCEEDED`.
- [ ] Re-run focused web tests.

### Task 7: Verification

**Files:**
- Verify only.

- [ ] Run all focused video-guide API tests.
- [ ] Run `pnpm --filter @xueleai/api-core typecheck`.
- [ ] Run all focused video-guide web tests.
- [ ] Run `pnpm --filter @xueleai/web typecheck`.
- [ ] Run `git diff --check` and inspect only intended files.
- [ ] Open `/media-tutor`, confirm script has a separate fee dialog and progress, then confirm TTS unlocks only after script success.
- [ ] Reload during each operation and confirm progress resumes from server state.
- [ ] Confirm the learning and share actions stay unavailable until TTS succeeds.
