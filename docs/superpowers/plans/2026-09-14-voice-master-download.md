# Voice Master Download Implementation Plan

> **For agentic workers:** Execute inline with test-first steps and an independent final review.

**Goal:** Preserve new single/multi-speaker speech as PCM WAV in R2 and offer MP3/WAV downloads without another TTS call or charge.

**Architecture:** Reuse the bounded R2/FFmpeg audio pipeline. Single output assets and dialogue merged output assets point to WAV masters. An authenticated binary export endpoint reads the server-selected asset; WAV is returned unchanged and MP3 is encoded from it. Old lossy assets remain downloadable and reusable without a forced paid upgrade.

**Tech Stack:** NestJS, Next.js, Prisma, FFmpeg, R2.

**Spec:** User-approved WAV/PCM master and MP3/WAV download request, building on `docs/superpowers/specs/2026-09-14-multi-speaker-voice-design.md`.

## Constraints

- Allowed: voice modules in `apps/api-core/src/audio`, related tests, voice Web components/routes/libs/tests, this document.
- Excluded: payments, auth implementation, unrelated learning/dictionary work, database schema/config/dependency changes.
- No migration or seed; no paid provider calls; no deployment.
- Preserve existing profile/scenario authorization, revision validation, bounded downloads/temp files/subprocess timeouts.
- UI settings stay in the right column; downloads default MP3 and support WAV independently of synthesis state.

## Task 1: Masters and Binary Export

- [x] Add failing tests: reject compressed master input, export exact WAV/valid MP3, invalid source/limits/cleanup, preserve old MP3 clip reuse.
- [x] Verify RED with `pnpm --filter @xueleai/api-core exec node --import tsx --test tests/dialogue-audio.test.ts tests/audio-dialogue.test.ts`.
- [x] Require PCM WAV for new single and dialogue clips; request WAV from suppliers; merge dialogue as WAV, irrespective of the legacy output-format setting.
- [x] Implement `renderVoiceDownload({ userId, source, format })` returning `{ bytes, mimeType }`, with trusted DB asset references only, real decode checks and bounded processing.
- [x] Add an authorized voice-download service/controller; task and project queries constrain user/profile and exclude other applications/child tasks. Validate project output revision.
- [x] Exercise real DB service isolation, no task/wallet writes, and free pause-only remerge.

## Task 2: Download Controls and Proxy

- [x] Add failing tests for bounded query validation and binary proxy errors/attachment headers.
- [x] Extend the same-origin voice download route to stream the authenticated API export, forwarding signed profile cookies and cancellation.
- [x] Add a shared MP3/WAV selection/download control for single and multi outputs; remove synthesis format selection and retain sample-rate settings.
- [x] Run related tests and Web/API type checks.

## Task 3: Verification and Review

- [x] Run package tests for affected API/Web modules, build affected packages, and diff checks.
- [x] Independent code review focused on access isolation, limits, no hidden paid regeneration, and master quality.
- [x] Browser check on `/experience/voice` at port 3321 if authenticated access is available; otherwise record the limitation.
- [x] Small scoped commits; report local completion and any remaining verification gaps separately from deployment.

## Verification Evidence

- API package tests: 1,033 passed, 5 optional tests skipped, zero failures. Final targeted tests after review fixes: 51 passed, including scene isolation and early cancellation.
- Web package tests: 497 passed, zero failures. Web/API type checks and builds passed; Web build retained an unrelated broad `uploads/typing-content` tracing warning.
- ESLint on changed voice files and `git diff --check` passed.
- Independent review found scene provenance and authorization-time cancellation issues; both received failing regression tests, fixes, and a passing reviewer recheck.
- Real R2 fixture: PCM WAV uploaded and verified; WAV export matched the source bytes exactly (14,444 bytes); MP3 was genuinely encoded (6,188 bytes, ID3 signature).
- Authenticated API and same-origin Web downloads verified for both single-task and dialogue-project targets in both formats (eight successful requests); stale revision returned 409; wallet and task count remained unchanged.
- Browser downloads created actual MP3/WAV files in both modes; switching download format retained text and project state. Download event observation timed out despite the files completing, so verification used the resulting known fixture files instead.
- Actual single TTS executor used a mocked gateway response and real R2: created an S3 WAV output asset, preserved request/count metadata, removed temporary supplier URLs and Base64 payloads.
- No paid supplier synthesis, schema/migration/seed/dependency changes, GitHub push, or server deployment. Temporary fixture data, R2 masters and downloaded fixture files are removed after verification.
