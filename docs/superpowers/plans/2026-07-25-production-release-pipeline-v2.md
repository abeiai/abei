# Production Release Pipeline V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure one command publishes the exact GitHub `main` commit to production and proves that the running Web/API images match the expected version and commit.

**Architecture:** `sync-server.sh` records the archived Git commit in a non-secret source marker. `deploy.sh` validates that marker, builds or pulls immutable images, starts the stack, verifies the running version/revision, and atomically persists the active release image tags in `.env.production`. A local `server-release.sh` orchestrates GitHub verification, source synchronization, remote deployment, and public verification.

**Tech Stack:** Bash, Docker Compose, Node.js test runner, NestJS health API, Next.js App Router.

## Global Constraints

- Production directory remains `/opt/xueleai`.
- Production Compose project remains `xueleai-prod`.
- Production data volumes remain `xueleai-prod_postgres_data` and `xueleai-prod_redis_data`.
- Never reset migrations or delete PostgreSQL/Redis volumes.
- Preserve `.env.production`, `deploy/data/`, and `deploy/certs/` during synchronization.
- A successful GitHub push is not a successful server deployment.
- A successful server command is not a successful release until the live API version/revision and Web release marker match.

---

### Task 1: Add release contract regression tests

**Files:**
- Create: `scripts/release/release-pipeline.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: existing release scripts and health endpoint.
- Produces: a test command that fails unless commit markers, persisted release state, and live version/revision checks exist.

- [ ] **Step 1: Write failing contract tests**

Add Node tests that assert:

```js
assert.match(syncScript, /\.release-source/);
assert.match(deployScript, /APP_RELEASE_SHA/);
assert.match(deployScript, /persist_release_state/);
assert.match(serverReleaseScript, /release:github-check/);
assert.match(serverReleaseScript, /release:verify-live/);
assert.match(verifyScript, /EXPECTED_VERSION/);
assert.match(verifyScript, /EXPECTED_RELEASE_SHA/);
```

- [ ] **Step 2: Run test and verify RED**

Run:

```bash
node --test scripts/release/release-pipeline.test.mjs
```

Expected: failures for the missing source marker, revision validation, and single server release entry point.

- [ ] **Step 3: Register the test in the root test command**

Add `release:test` and include it in `release:check`.

### Task 2: Carry immutable release identity through source and containers

**Files:**
- Modify: `scripts/release/sync-server.sh`
- Modify: `docker-compose.prod.yml`
- Modify: `apps/web/Dockerfile`
- Modify: `apps/api-core/Dockerfile`
- Modify: `apps/ai-gateway/Dockerfile`
- Modify: `apps/web/src/app/layout.tsx`
- Modify: `apps/api-core/src/health/health.controller.ts`

**Interfaces:**
- Consumes: `RELEASE_COMMIT`, `APP_VERSION`, and `APP_RELEASE_SHA`.
- Produces: `.release-source`, OCI image labels, container runtime identity, API health revision, and Web HTML release attributes.

- [ ] **Step 1: Write the exact Git commit into the synchronized archive**

Create `.release-source` inside the temporary archive:

```text
RELEASE_COMMIT=<40-character Git SHA>
```

- [ ] **Step 2: Pass version and revision into all application images and containers**

Add Compose build arguments and runtime environment values for:

```text
APP_VERSION
APP_RELEASE_SHA
```

Add OCI labels:

```text
org.opencontainers.image.version
org.opencontainers.image.revision
```

- [ ] **Step 3: Expose non-secret release identity for verification**

The API health payload includes `revision`. The Web root HTML includes `data-app-version` and `data-release`.

- [ ] **Step 4: Run focused type checks**

Run:

```bash
pnpm --filter @xueleai/api-core typecheck
pnpm --filter @xueleai/web typecheck
```

Expected: both pass.

### Task 3: Make deployment persist and verify the active release

**Files:**
- Modify: `scripts/release/deploy.sh`
- Create: `scripts/release/update-release-env.sh`
- Test: `scripts/release/release-pipeline.test.mjs`

**Interfaces:**
- Consumes: version argument, `RELEASE_SHA`, `.release-source`, `.env.production`.
- Produces: verified running containers and atomically persisted release keys.

- [ ] **Step 1: Validate source identity before build**

Reject deployment unless:

```text
RELEASE_SHA is a 40-character SHA
.release-source exists
RELEASE_COMMIT equals RELEASE_SHA
```

- [ ] **Step 2: Verify running containers**

After Compose starts, require:

```text
web image tag equals WEB_IMAGE
api-core image tag equals API_CORE_IMAGE
ai-gateway image tag equals AI_GATEWAY_IMAGE
web APP_VERSION and APP_RELEASE_SHA match
api-core APP_VERSION and APP_RELEASE_SHA match
API health version and revision match
```

- [ ] **Step 3: Atomically persist release state**

Preserve every existing environment value and update only:

```text
APP_VERSION
APP_RELEASE_SHA
WEB_IMAGE
API_CORE_IMAGE
AI_GATEWAY_IMAGE
```

Store a pre-change backup under `deploy/data/backups/releases/<timestamp>/`.

The file update is implemented by `update-release-env.sh` so it can be tested against a temporary environment file without invoking Docker.

- [ ] **Step 4: Run release contract test and verify GREEN**

Run:

```bash
node --test scripts/release/release-pipeline.test.mjs
```

Expected: pass.

### Task 4: Add one local-to-production release entry point

**Files:**
- Create: `scripts/release/server-release.sh`
- Modify: `scripts/release/verify-live.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: clean local `main`, matching GitHub SHA, SSH target and key.
- Produces: synchronized source, deployed production services, and public proof of exact version/revision.

- [ ] **Step 1: Implement ordered orchestration**

The script performs exactly:

```text
release:github-check
release:sync-server
remote release:deploy with VERSION and RELEASE_SHA
release:verify-live with EXPECTED_VERSION and EXPECTED_RELEASE_SHA
remote container identity audit
```

- [ ] **Step 2: Extend public verification**

Fail when API health `data.version` or `data.revision` differs, or when the Web HTML release attributes are missing.

- [ ] **Step 3: Add package command**

Register:

```json
"release:server": "scripts/release/server-release.sh"
```

- [ ] **Step 4: Dry-run the full release**

Run:

```bash
DRY_RUN=1 SERVER_HOST=8.130.169.220 SSH_KEY=/Users/ericword/xueleai/xueleai.com.pem pnpm release:server
```

Expected: ordered GitHub check, sync, remote deploy, and verify actions without production mutation.

### Task 5: Prepare and publish the corrected release

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Consumes: completed release pipeline.
- Produces: a unique version greater than `0.0.15`.

- [ ] **Step 1: Bump the release version**

Set root version to `0.0.16` and update the lockfile importer version.

- [ ] **Step 2: Run full verification**

Run:

```bash
pnpm release:check
```

Expected: lint, typecheck, tests, build, migration status, project isolation, environment, and secret checks all pass.

- [ ] **Step 3: Commit, merge, and push**

Commit the tested changes, fast-forward `main`, push, and verify:

```bash
git ls-remote origin refs/heads/main
```

- [ ] **Step 4: Deploy through the new single entry point**

Run:

```bash
SERVER_HOST=8.130.169.220 SSH_KEY=/Users/ericword/xueleai/xueleai.com.pem pnpm release:server
```

- [ ] **Step 5: Independently verify production**

Confirm:

```text
GitHub main SHA equals the release SHA
server .release-source equals the release SHA
three running image tags use 0.0.16
container version/revision values match
/api/health returns 0.0.16 and the release SHA
/media-tutor HTML contains the 0.0.16 release marker
public health and system-config endpoints return HTTP 200
```
