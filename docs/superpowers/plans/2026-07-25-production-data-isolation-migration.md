# Production Data Isolation Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Safely migrate production PostgreSQL, Redis, Docker Compose, and volume names from historical identifiers to the isolated `xueleai-prod` environment without losing data.

**Architecture:** A tracked server-side migration script performs read-only preflight checks, creates recoverable backups, pauses application writes, restores PostgreSQL logically into a new volume, verifies exact table digests and sequence state, then atomically switches the production environment file and starts the new Compose project. Old containers and volumes remain untouched for rollback.

**Tech Stack:** Bash, Docker Compose, PostgreSQL 17 `pg_dump`/`pg_restore`, Redis 7, SHA-256, Node.js test runner.

## Global Constraints

- Production directory is `/opt/xueleai`.
- Production Compose project is `xueleai-prod`.
- Target volumes are `xueleai-prod_postgres_data` and `xueleai-prod_redis_data`.
- Never run `docker compose down -v`, `docker volume rm`, or `prisma migrate reset`.
- Preserve `.env.production`, `deploy/data/`, and `deploy/certs/`.
- Keep the old project, old containers, old volumes, and backups as rollback points.
- Abort before cutover when any table digest, row count, sequence value, backup validation, or health check fails.

---

### Task 1: Add migration contract tests

**Files:**
- Create: `scripts/release/migrate-production-isolation.test.mjs`
- Test: `scripts/release/migrate-production-isolation.test.mjs`

**Interfaces:**
- Consumes: migration requirements from the design document.
- Produces: an executable contract that validates safe commands, target names, backup behavior, verification behavior, and forbidden destructive operations.

- [ ] **Step 1: Write the failing test**

Create a Node test that reads `scripts/release/migrate-production-isolation.sh`, expects the file to exist, asserts the five target identifiers and verification functions are present, and rejects destructive command patterns.

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
node --test scripts/release/migrate-production-isolation.test.mjs
```

Expected: FAIL because `migrate-production-isolation.sh` does not exist.

- [ ] **Step 3: Keep the failing test staged only after the failure is observed**

Do not create the production migration script before recording the expected failure.

### Task 2: Implement the production migration script

**Files:**
- Create: `scripts/release/migrate-production-isolation.sh`
- Modify: `package.json`
- Test: `scripts/release/migrate-production-isolation.test.mjs`

**Interfaces:**
- Consumes: `/opt/xueleai/.env.production`, `docker-compose.prod.yml`, the old `xueleai` project, and existing production images.
- Produces: `--dry-run`, `--execute`, timestamped backups, new target volumes, validated target PostgreSQL data, updated `.env.production`, and a rollback command file.

- [ ] **Step 1: Implement strict preflight and dry-run modes**

The script must use `set -Eeuo pipefail`, require root, validate exact source and target names, require healthy old services, verify free disk space, and print commands without executing them in `--dry-run`.

- [ ] **Step 2: Implement backup and integrity manifests**

Create custom-format preflight and final PostgreSQL dumps, schema dumps, exact per-table row/content digests, sequence manifests, Redis persistence copies, SHA-256 files, and backup validation through `pg_restore --list`.

- [ ] **Step 3: Implement restore and pre-cutover comparison**

Restore the final dump into a temporary PostgreSQL 17 container backed by `xueleai-prod_postgres_data`; compare source and target table digests and sequence manifests with `diff -u`.

- [ ] **Step 4: Implement atomic environment switch and rollback**

Update all seven production isolation variables through a temporary file, stop the old database only after successful comparison, start `xueleai-prod`, run `pnpm db:migrate:deploy`, and install an error trap that restores the old environment and old project after cutover failures.

- [ ] **Step 5: Run contract tests**

Run:

```bash
node --test scripts/release/migrate-production-isolation.test.mjs
```

Expected: PASS.

### Task 3: Review, publish, and stage the server migration

**Files:**
- Verify: `scripts/release/migrate-production-isolation.sh`
- Verify: `scripts/release/migrate-production-isolation.test.mjs`
- Verify: both migration documents

**Interfaces:**
- Consumes: completed migration implementation.
- Produces: a reviewed commit on GitHub `main` and matching files in `/opt/xueleai`.

- [ ] **Step 1: Run shell syntax and repository checks**

Run:

```bash
bash -n scripts/release/migrate-production-isolation.sh
git diff --check
pnpm release:check
```

Expected: all commands exit 0.

- [ ] **Step 2: Independently review destructive-operation, secret-handling, rollback, and idempotency risks**

Reject the migration if the script prints secrets, deletes old data, switches before integrity verification, or cannot restore the old environment.

- [ ] **Step 3: Commit and push**

Commit the migration as an isolated production-operations change and verify remote `main` equals local `HEAD`.

- [ ] **Step 4: Synchronize the tracked source to `/opt/xueleai`**

Use `scripts/release/sync-server.sh` and verify the local and server migration script checksums match.

### Task 4: Execute the production migration

**Files:**
- Execute: `/opt/xueleai/scripts/release/migrate-production-isolation.sh`
- Preserve: `/opt/xueleai/.env.production`
- Create backups under: `/opt/xueleai/deploy/data/backups/production-isolation/`

**Interfaces:**
- Consumes: approved downtime and the reviewed server script.
- Produces: a running `xueleai-prod` stack using the target database, Redis, and volumes.

- [ ] **Step 1: Execute server dry-run**

Run:

```bash
cd /opt/xueleai
scripts/release/migrate-production-isolation.sh --dry-run
```

Expected: preflight succeeds and the script shows no destructive command.

- [ ] **Step 2: Execute the migration**

Run:

```bash
cd /opt/xueleai
scripts/release/migrate-production-isolation.sh --execute
```

Expected: backups validate, final restore succeeds, manifests match, and `xueleai-prod` services become healthy.

- [ ] **Step 3: Preserve output and rollback instructions**

Record the timestamped backup directory and generated rollback command file. Do not delete old containers or volumes.

### Task 5: Verify production and close the migration

**Files:**
- Verify: production environment and backup artifacts.

**Interfaces:**
- Consumes: the migrated production stack.
- Produces: evidence of data consistency, service health, public API behavior, and retained rollback assets.

- [ ] **Step 1: Verify target identity**

Confirm current database and role are `xueleai`, Compose project is `xueleai-prod`, and target volumes are mounted.

- [ ] **Step 2: Verify data and service health**

Compare the final source and restored target manifests, inspect all containers, and run:

```bash
curl -fsS https://xueleai.com/api/health
curl -fsS https://xueleai.com/api/system-config/public
```

- [ ] **Step 3: Verify page and authentication boundary**

Confirm `/media-tutor` returns a usable page and unauthenticated `/api/video-guide/lessons` returns HTTP 401.

- [ ] **Step 4: Verify rollback assets**

Confirm the old containers, `xueleai_postgres_data`, `xueleai_redis_data`, environment backup, database dumps, checksums, and rollback command file remain present.
