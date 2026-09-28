# Video Guide Narration Checkpoint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate video-guide narration in one intro call, fixed four-sentence calls, and one summary call while persisting every successful part for restart-safe resume.

**Architecture:** Add a pure checkpoint module that owns source fingerprints, validation, and node merging. The video-guide service orchestrates section-specific AI calls and persists each successful section with the active generation lease; AI Service forwards the explicit non-stream reasoning setting to the gateway adapter.

**Tech Stack:** NestJS, TypeScript, Prisma JSON fields, Node test runner

## Global Constraints

- Keep all user-facing errors in Simplified Chinese.
- Do not add a database migration; store the checkpoint in `VideoGuideLesson.content`.
- Fixed narration sentence batch size is exactly 4.
- All video-guide narration timeline calls explicitly disable thinking.
- Existing dirty files outside this task must remain untouched.

---

### Task 1: Checkpoint Domain Helpers

**Files:**
- Create: `apps/api-core/src/video-guide/video-guide-narration-checkpoint.ts`
- Create: `apps/api-core/tests/video-guide-narration-checkpoint.test.ts`

**Interfaces:**
- Produces: `narrationGenerationSourceHash`, `narrationGenerationCheckpointFromContent`, `mergeNarrationGenerationCheckpoint`, and `mergeNarrationGenerationCheckpointContent`.

- [ ] Write failing tests for deterministic fingerprints, invalidation after subtitle changes, node upsert, metadata retention, and malformed stored JSON rejection.
- [ ] Run the checkpoint test and confirm failure because the module is missing.
- [ ] Implement the minimal typed checkpoint helpers.
- [ ] Run the checkpoint test and confirm it passes.

### Task 2: Section-Specific Parsing

**Files:**
- Modify: `apps/api-core/src/video-guide/video-guide.service.ts`
- Modify: `apps/api-core/tests/video-guide-narration-timeline.test.ts`

**Interfaces:**
- Produces: parsers for an intro-only response, sentence-only response, and summary-only response.

- [ ] Add failing tests proving each mode accepts only its required JSON section and sentence mode still enforces every target sentence ID.
- [ ] Run the timeline test and confirm the new exports are missing.
- [ ] Implement the three parsers using the existing JSON repair and chunk normalization pipeline.
- [ ] Run the timeline test and confirm it passes.

### Task 3: Explicit Non-Reasoning Calls

**Files:**
- Modify: `apps/api-core/src/ai/ai.service.ts`

**Interfaces:**
- Extends: `ExternalScenarioTextGenerationInput` with `reasoningEnabled?: boolean`.
- Forwards: model reasoning capability and requested state to `ProviderTextInput`.

- [ ] Add a source-level failing assertion that external generation forwards `reasoningEnabled` and non-stream generation passes `reasoningSwitchSupported` plus `reasoningEnabled` to the adapter.
- [ ] Run the assertion and confirm it fails.
- [ ] Implement option forwarding in external generation and non-stream provider calls.
- [ ] Run the assertion and API Core typecheck.

### Task 4: Fixed Batches and Persisted Resume

**Files:**
- Modify: `apps/api-core/src/video-guide/video-guide.service.ts`
- Modify: `apps/api-core/src/video-guide/video-guide-generation-state.ts`
- Modify: `apps/api-core/src/ai/ai.service.ts`
- Modify: `apps/api-core/tests/video-guide-generation-lease.test.ts`

**Interfaces:**
- Adds: `persistNarrationGenerationCheckpoint(...)` using the active `generationId` CAS lease.
- Changes: narration generation flow to `INTRO`, fixed four-sentence `SENTENCES` batches, then `SUMMARY`.

- [ ] Add failing service tests for checkpoint CAS persistence and reuse of an existing compatible checkpoint.
- [ ] Run the service tests and confirm the persistence method is missing.
- [ ] Implement fixed batching, section calls, per-section persistence, resume skipping, and final checkpoint cleanup.
- [ ] Update the built-in prompt and template version for `generationMode` output contracts.
- [ ] Run narration, lease, checkpoint, and generation-state tests.

### Task 5: Verification

**Files:**
- No production files.

- [ ] Run all focused video-guide narration tests.
- [ ] Run `pnpm --filter @xueleai/api-core typecheck`.
- [ ] Review `git diff` for scope and confirm unrelated dirty files are unchanged.
