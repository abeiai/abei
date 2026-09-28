# Multi-Speaker Voice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add cross-model dialogue dubbing to `/experience/voice`, including confirmed aggregate billing, durable sentence reuse, pauses, merged R2 audio, and sentence regeneration.

**Architecture:** Persist projects and immutable quoted generation batches in Prisma. Reuse AudioTask for supplier calls and a separate aggregate billing task; a database-leased worker processes batches. Isolate FFmpeg/R2 processing from the editor and billing orchestration.

**Tech Stack:** Existing Next.js, React, NestJS, Prisma, PostgreSQL, FFmpeg, S3-compatible R2, node:test and tsx; no dependency upgrades.

**Spec:** `docs/superpowers/specs/2026-09-14-multi-speaker-voice-design.md`

## Global Constraints

- Simplified Chinese UI and friendly Chinese errors; no extra explanatory page copy.
- Workbench: history `292px`, settings `360px`, gaps/padding `20px`, background `#f6f6f5`; mobile history/content/settings order.
- Default single-speaker mode, no manual model selection, preserve existing single-speaker behavior.
- At most `20` speakers, `100` segments and `8000` total content characters; obey model-specific limits.
- Trailing pause defaults to `0.5` seconds, range `0-5`, precision `0.1`; include the last segment's pause.
- Quote lifetime `10` minutes; price/model/content/billing changes require a fresh quote.
- Freeze the confirmed batch total before supplier requests; charge only successful persisted segments, release the rest.
- Pauses and merge/storage retries do not incur new model fees. Sentence regeneration charges only selected sentence.
- Segment and merged audio stored in R2; provider temporary URLs are not final outputs.
- Additive migration, no seed; never reset production or alter unrelated dirty files.
- Ports only `3320-3329`; no deployment or shared-branch push.
- Work in the user-provided checkout on its existing `codex/` branch, without stashing their changes. Workers have disjoint write sets and must not commit or spawn their own agents.

## Shared Contracts

The web client exports these serializable types from `apps/web/src/lib/voice-dialogue.ts`. The API independently validates the same wire shape.

```ts
type DialogueInput = {
  projectId?: string;
  revision?: number;
  segmentId?: string; // force regeneration of just this sentence
  speakers: { id: string; name: string; voiceValue: string }[];
  segments: { id: string; speakerId: string; text: string; speed: number; pauseSeconds: number }[];
  format: "mp3" | "wav" | "opus";
  sampleRate: 16000 | 24000 | 48000;
  billingContext: "PERSONAL" | "ORGANIZATION";
  organizationId?: string;
};
type DialogueQuote = {
  id: string; projectId: string; revision: number; expiresAt: string; totalCredits: number;
  segments: {
    id: string; speakerId: string; speakerName: string; voiceName: string;
    modelName: string; billingCharacters: number; credits: number; reused: boolean;
  }[];
};
type DialogueProject = DialogueInput & {
  id: string; title: string; revision: number; status: string;
  createdAt: string; updatedAt: string; actualCredits: number;
  audioUrl: string | null; outputRevision: number | null; errorMessage: string | null;
  generationId: string | null;
  segments: (DialogueInput["segments"][number] & {
    status: string; audioUrl: string | null; errorMessage: string | null;
  })[];
};
```

API envelope remains `{code,message,data}`. Routes:

```text
GET  /audio/dialogue/projects                 -> DialogueProject[]
GET  /audio/dialogue/projects/:id             -> DialogueProject
POST /audio/dialogue/quotes  DialogueInput    -> DialogueQuote
POST /audio/dialogue/generations {quoteId}    -> DialogueProject
POST /audio/dialogue/projects/:id/merge       -> DialogueProject
```

`segmentId` restricts paid synthesis to that sentence. Other edited/unavailable sentences remain ungenerated and prevent publishing a falsely complete new output. Without `segmentId`, all non-reusable sentences are quoted. A zero-credit quote may execute only a merge.

The audio helper contract, owned by Task 2:

```ts
type PersistedDialogueAudio = {
  url: string; objectKey: string; mimeType: string; sizeBytes: number;
  durationMs: number; sampleRate: number; channels: number;
};
persistDialogueClip(input: {
  userId: string; projectId: string; generationId: string; segmentId: string;
  payload: Record<string, unknown>;
}): Promise<PersistedDialogueAudio>;
mergeDialogueAudio(input: {
  userId: string; projectId: string; generationId: string;
  segments: { url: string; pauseSeconds: number }[];
  format: "mp3" | "wav" | "opus"; sampleRate: number;
}): Promise<PersistedDialogueAudio>;
```

## Task 1: Durable Quotes, Billing And Supplier Execution

**Files:** Modify schema, audio.service.ts, audio.module.ts; create `audio-dialogue.service.ts`, `audio-dialogue.controller.ts`, `audio-dialogue.types.ts`, `audio-dialogue-billing.ts`, `dto/audio-dialogue.dto.ts`; create migration and `tests/audio-dialogue.test.ts`.

**Interfaces:** Produces the five routes above and a database-backed worker. Consumes Task 2 helpers. Add a public AudioService sentence preparation method that resolves/validates voice, model, parameters and pricing, and a pinned-model external-billing execution path.

- [x] Write failing tests for mixed-model total, reuse, expiry/revision rejection, partial settlement, scope ownership and forced single-sentence generation. Use real orchestration with controlled supplier/storage boundaries.

```ts
assert.equal(quote.totalCredits, 7); // two independent prices: 2 + 5
assert.equal(reusedQuote.totalCredits, 0);
await assert.rejects(confirm(expiredQuote), /重新|过期/);
assert.equal(project.actualCredits, 2); // second sentence failed
assert.equal(regeneration.totalCredits, 5); // first paid clip reused
```

- [x] Run `pnpm --filter @xueleai/api-core exec node --import tsx --test tests/audio-dialogue.test.ts`; confirm missing functionality fails.
- [x] Add AudioDialogueProject and AudioDialogueGeneration. Store strongly validated ordered segments and role bindings as bounded JSON snapshots; store reusable clip references with input fingerprints. Add explicit child generation FK to AudioTask and aggregate billing-task relation. Preserve every existing schema edit.
- [x] Prepare sentence quotes using existing voice resolution and pricing. Fingerprint actual model/provider identity, resolved voice, parameters and pricing. Confirm under a project lock; reject stale quote or incompatible current preparation, reserve aggregate billing task before queueing.

```ts
const credits = plans.reduce((sum, plan) => sum + plan.credits, 0);
const wallet = await reservePersonalCredits(tx, userId, `audio-dialogue:${generationId}`, credits);
// Record one reservation and ledger entry on the aggregate AudioTask.
```

- [x] Use existing enterprise reserve/settle APIs for organization batches. Use personal helper settlement under a row lock with ledger idempotency; actual credits are the sum of successfully persisted quoted sentences, capped at reservation.
- [x] Queue and claim batches with DB leases; checkpoint supplier results before storage, and persisted clips before proceeding. Expired running supplier attempts become explicit failures rather than automatic duplicate TTS calls. Resume unstarted segments and paid clips after restart. Merge only when every current fingerprint has valid audio. Keep old output until replacement verified.
- [x] Match current auth/profile/scenario checks in controller. Server-created generation relationships exclude dialogue children and aggregate tasks from single-speaker history. Sanitize provider results for consumers.
- [x] Run targeted tests and `pnpm --filter @xueleai/database db:generate`; record passing evidence before committing only task-owned changes.

## Task 2: Durable R2 Clips And FFmpeg Merge

**Files:** Create `apps/api-core/src/audio/dialogue-audio.ts`, `apps/api-core/tests/dialogue-audio.test.ts`; read existing S3/video-guide storage and transcode helpers, do not edit AudioService/schema/web files.

**Interfaces:** Produces exactly `PersistedDialogueAudio`, `persistDialogueClip`, `mergeDialogueAudio` as above.

- [x] Write a failing test generating real short PCM fixtures with FFmpeg, merging distinct sample rates and pauses, and checking literal duration expectations with tolerance. Also test unsafe URL rejection and R2 verification failure.

```ts
assert.ok(Math.abs(output.durationMs - 1300) < 100); // 0.2 + 0.5 + 0.2 + 0.4 seconds
await assert.rejects(persistDialogueClip(unsafeProviderFixture), /地址|来源/);
```

- [x] Run `pnpm --filter @xueleai/api-core exec node --import tsx --test tests/dialogue-audio.test.ts`; confirm failure.
- [x] Implement bounded Base64/provider URL acquisition, signed R2 upload/verification with existing env conventions. Use immutable keys, compatible payload URL extraction, bounded network retries, checksum/size checks, allowed origins and redirect validation.
- [x] Decode each clip to consistent PCM, append real trailing silence, concatenate with FFmpeg argument arrays and encode final MP3/WAV/Opus once. Validate final audio with ffprobe; clean all temporary directories in finally. Bound subprocess time and disk/network sizes.
- [x] Tests may inject storage transport only, not mock FFmpeg's output. Run the targeted suite; report helper signatures, size limits and environment needs, without a commit.

## Task 3: Unified Dialogue Editor And Web Integration

**Files:** Modify voice-console.tsx, voice/page.tsx, relevant audio-api history filter; create `voice-dialogue.ts`, `voice-dialogue-console.tsx`, `voice/api/route.ts`, `tests/voice-dialogue.test.ts`.

**Interfaces:** Consumes the shared contracts and API routes. BFF forwards only the specified operations, cookies and selected profile headers using the project's server API conventions; no arbitrary upstream URLs. Server page fetches dialogue history/current project alongside existing single task.

- [x] Write failing parser/draft tests: repeated Student labels map to two roles, prefixes removed, continuation preserved, URLs/time unchanged, independent drafts, single-sentence request excludes fees for other sentences.

```ts
const dialogue = parseVoiceDialogue("Student A: Hello.\nStudent B：Hi.\nStudent A: Again.");
assert.deepEqual(dialogue.segments.map(s => s.text), ["Hello.", "Hi.", "Again."]);
assert.equal(dialogue.speakers.length, 2);
```

- [x] Run `pnpm --filter @xueleai/web exec node --import tsx --test tests/voice-dialogue.test.ts`; confirm failure.
- [x] Implement deterministic prefix parsing and reusable draft helpers. Role IDs stable within draft, no LLM call. Match caps and pause/speed validation; sanitize restored local drafts.
- [x] Build default-single segmented mode switch in right sidebar. Preserve single draft independently. Render compact dialogue rows inside a unified editor with avatar/gear gutter; gear selects sentence settings in right sidebar. Reuse VoicePicker for role mapping. Move global output controls to right sidebar.
- [x] Add fee dialog with server quote breakdown, state invalidation on edit, submit idempotency, polling with cleanup, progress, errors, merged player/download, sentence play/edit/regenerate and free remerge. Do not show outdated sentence/complete audio as current content.
- [x] Merge experience-only history, link to selected project, recover projects on refresh. Make responsive workbench conform to spec, including mobile stacking and contained scrolling.
- [x] Run targeted web tests and typecheck; report changed paths and contract concerns without a commit.

## Task 4: Integration, Migration And Independent Review

**Files:** Only the task-owned files above and tests; no unrelated cleanup.

- [x] Inspect worker results and reconcile exact API/helper types. Generate Prisma and apply the additive migration to the project's local DB only after verifying target and existing migration state. Do not execute unrelated pending data migrations as a shortcut.
- [x] Add real local-database orchestration tests for aggregate reservation, duplicate confirmation, failed release, ownership and restart leases. Mock only external supplier and R2 transport to avoid paid requests.
- [x] Run API/web typecheck, targeted suites, then package tests and builds as listed in spec. Investigate failures; distinguish pre-existing failures with evidence, do not overwrite unrelated changes.
- [x] Independently review the feature diff for billing/ownership/lease and stored-audio integrity; fix load-bearing findings and re-review the changed surfaces.
- [x] Start or reuse web/API/gateway on fixed ports. Browser-check desktop/mobile unified editor, role binding, quote confirmation, audio completion and sentence replacement using controlled non-billable fixtures where necessary. Real supplier synthesis requires configured credentials and consumes credits; do not claim it tested when only fixtures ran.
- [x] Check `git diff --check`, update checklist and record verification. Commit only owned paths, taking care not to include pre-existing schema edits; otherwise leave schema working changes clearly reported.

## Execution Rulings And Status

- API/backend critical path stays with the main agent; Task 2 and Task 3 can run as independent disjoint worker assignments while backend proceeds. This is bounded parallel delegation, not duplicated development on shared files.
- No worktree creation or stashing: the existing feature branch and user-provided checkout contain required current schema/runtime context. Preserve unrelated work exactly.
- No further design approval is needed. Finish implementation and validation in the current task unless an irreversible operation or genuine external blocker requires user input.

## Verification Ledger

- Tasks 1-3 implemented; migration applied only to local `localhost:3324/xueleai`; no seed.
- Initial TDD red runs recorded for missing backend/parser/pipeline functions and stable JSON fingerprint regression.
- Final API package tests: 1020 passed, 0 failed, 5 skipped (including the opt-in live R2 smoke). An earlier mid-development run had one failure; its truncated output did not identify the case, and the stable rerun passed.
- Final Web package tests: 492 passed, 0 failed; parser/draft and bounded-download regression suites passed. Final API/Web builds and relevant typechecks passed; targeted lint and diff checks passed. Build reports its existing broad-pattern warning; no dependency or unrelated build configuration changes.
- Real FFmpeg/storage-transport tests: 30 passed; live configured R2 smoke: 1 passed, including public GET verification and literal 1300ms merged duration.
- CUA desktop 1440x1000 and mobile 390x844: compact unified editor, removed role labels, cross-model quote, sidebar settings and no horizontal overflow checked. Existing R2 audio loaded with duration 1.3s, readyState 4, no media error. Native play click crashed the in-app browser; audible playback is not claimed.
- Independent backend review found six lease/reservation/cache/history edge cases. Fixes implemented; eight real database billing/recovery tests passed again. Dedicated concurrency regressions passed all 8 tests. Independent re-review closed all six backend findings and the frontend polling/draft/download-stream findings; no remaining P0/P1/P2 in the reviewed scope.
- Real zero-credit browser workflow: quoted reused clips, confirmed free processing, leased API worker merged them and saved a new R2 output. The UI automatically advanced to version 4 with duration 1.7s, readyState 4 and no media error; the same-origin attachment link triggered an actual browser download event. Wallet remained 100 credits, consumed 0, child task count unchanged at 2.
- Disposable browser account/project and all four exact R2 smoke objects were cleaned. Temporary viewport reset and test tabs closed/left to automatic cleanup. No paid supplier synthesis, deployment or push performed.
- Owned backend changes committed as `b571d371`; frontend changes committed separately. Pre-existing dictionary schema edits remain unstaged and untouched. No install, seed, whole-repository lint, production migration or deployment was necessary.
