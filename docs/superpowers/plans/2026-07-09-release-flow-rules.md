# Release Flow Rules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix GitHub and production server publishing into a repeatable, verifiable release process.

**Architecture:** Keep the current single-server Docker Compose deployment. Add small shell/Node release helpers around the existing scripts, then document the fixed rules in `AGENTS.md` and `DEPLOYMENT.md`.

**Tech Stack:** Bash, Node.js ESM, Docker Compose, pnpm monorepo, rsync, SSH.

## Global Constraints

- Production remains single-machine Docker Compose; do not add Kubernetes or GitHub Actions.
- Production public ports may be `80/443`, but service/container ports must remain in `3320-3329`.
- Never reset production database, delete production volumes, or publish local textbook/Markdown backup assets.
- Production server path is `/opt/xueleai`; it is a release directory, not a Git repository.
- GitHub publish success is not production publish success.

---

### Task 1: Fixed Release Rules Documentation

**Files:**
- Modify: `AGENTS.md`
- Modify: `DEPLOYMENT.md`

**Interfaces:**
- Consumes: design spec `docs/superpowers/specs/2026-07-09-release-flow-rules-design.md`
- Produces: fixed publishing rules that future Codex work must follow

- [ ] **Step 1: Add AGENTS release discipline**

Add a new section after the existing release/development discipline that states:

```markdown
## 16. GitHub 与线上服务器发布固定规则

发布必须分为 GitHub 发布和线上服务器发布两个阶段。只完成 GitHub 推送时，只能说明“GitHub 已发布”，不得说明“线上已发布成功”。
```

- [ ] **Step 2: Add deployment manual section**

Add a `DEPLOYMENT.md` section explaining:

```markdown
## 固定发布流程

当前线上服务器目录 `/opt/xueleai` 是发布目录，不是 Git 仓库。同步代码时必须保留 `.env.production`、`deploy/data/`、`deploy/certs/`。
```

- [ ] **Step 3: Verify documentation text**

Run:

```bash
rg -n "GitHub 已发布|线上服务器发布|/opt/xueleai|deploy/data|deploy/certs" AGENTS.md DEPLOYMENT.md
```

Expected: output includes the newly added rules.

### Task 2: Release Helper Scripts

**Files:**
- Create: `scripts/release/github-publish-check.sh`
- Create: `scripts/release/sync-server.sh`
- Modify: `scripts/release/deploy.sh`
- Modify: `package.json`

**Interfaces:**
- Produces:
  - `pnpm release:github-check`
  - `pnpm release:sync-server`
  - `scripts/release/deploy.sh <version>` with local image mode support

- [ ] **Step 1: Add GitHub publish checker**

Create `scripts/release/github-publish-check.sh` with:

```bash
#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT_DIR}"

TARGET_BRANCH="${TARGET_BRANCH:-main}"
VERSION="${VERSION:-$(node -p "require('./package.json').version")}"
HEAD_SHA="$(git rev-parse HEAD)"
REMOTE_SHA="$(git ls-remote origin "refs/heads/${TARGET_BRANCH}" | awk '{print $1}')"

echo "发布版本：${VERSION}"
echo "当前提交：${HEAD_SHA}"
echo "远端 ${TARGET_BRANCH}：${REMOTE_SHA:-未找到}"

if [[ -z "${REMOTE_SHA}" ]]; then
  echo "错误：远端分支不存在：${TARGET_BRANCH}"
  exit 1
fi

if [[ "${HEAD_SHA}" != "${REMOTE_SHA}" ]]; then
  echo "错误：当前提交尚未发布到 origin/${TARGET_BRANCH}。"
  exit 1
fi

echo "GitHub 发布检查通过。"
```

- [ ] **Step 2: Add server sync script**

Create `scripts/release/sync-server.sh` that uses `rsync -az --delete` and excludes `.env*`, `.git/`, `node_modules/`, `.next/`, `dist/`, `build/`, `deploy/data/`, `deploy/certs/`, `textbook/`, `textbook-markdown-assets/`, `tmp/`, `backups/`, `.venv-textbook-md/`, `.model-cache/`, `*.pem`.

- [ ] **Step 3: Support local image mode in deploy.sh**

Change image selection so an empty `IMAGE_REGISTRY` produces:

```text
xueleai-web:<version>
xueleai-api-core:<version>
xueleai-ai-gateway:<version>
```

and a non-empty registry still produces:

```text
<registry>/<namespace>/<project>:web-<version>
```

- [ ] **Step 4: Add package scripts**

Add:

```json
"release:github-check": "scripts/release/github-publish-check.sh",
"release:sync-server": "scripts/release/sync-server.sh",
"release:verify-live": "node scripts/release/verify-live.mjs"
```

### Task 3: Live Verification Script

**Files:**
- Create: `scripts/release/verify-live.mjs`

**Interfaces:**
- Consumes environment variables:
  - `LIVE_BASE_URL`, default `https://xueleai.com`
  - `VERIFY_CONTAINS`, optional comma-separated text checks
  - `VERIFY_NOT_CONTAINS`, optional comma-separated negative text checks
- Produces exit code `0` only when health, config, and requested page checks pass

- [ ] **Step 1: Implement verifier**

Fetch:

```text
<LIVE_BASE_URL>/api/health
<LIVE_BASE_URL>/api/system-config/public
<LIVE_BASE_URL>/
```

Fail when health JSON is not `code=0`, config JSON is not `code=0`, `VERIFY_CONTAINS` is missing, or `VERIFY_NOT_CONTAINS` is present.

- [ ] **Step 2: Syntax-check verifier**

Run:

```bash
node --check scripts/release/verify-live.mjs
```

Expected: exit code `0`.

### Task 4: Verification and Commit

**Files:**
- Test touched scripts and docs.

**Interfaces:**
- Produces a commit ready to push.

- [ ] **Step 1: Run shell syntax checks**

Run:

```bash
bash -n scripts/release/deploy.sh scripts/release/github-publish-check.sh scripts/release/sync-server.sh
```

Expected: exit code `0`.

- [ ] **Step 2: Run dry-run checks**

Run:

```bash
DRY_RUN=1 scripts/release/sync-server.sh
DRY_RUN=1 scripts/release/deploy.sh 0.0.7
```

Expected: commands print dry-run actions and do not modify server state.

- [ ] **Step 3: Run typecheck**

Run:

```bash
pnpm --filter @xueleai/web typecheck
```

Expected: exit code `0`.

- [ ] **Step 4: Commit**

Run:

```bash
git add AGENTS.md DEPLOYMENT.md package.json scripts/release docs/superpowers
git commit -m "chore: fix release publishing workflow"
```
