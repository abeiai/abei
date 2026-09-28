# GitHub 与线上服务器发布规则设计

## 背景

当前仓库已经具备 Docker Compose 生产部署能力，但 GitHub 发布和线上服务器发布之间没有固定门禁。最近一次发布检查发现：代码已经推送到 GitHub `main`，但线上服务器仍运行旧页面结构，说明“推送 GitHub”不能等同于“线上发布成功”。

线上服务器当前采用单机 Docker Compose，部署目录为 `/opt/xueleai`。该目录不是 Git 仓库，而是发布目录；生产数据、证书、上传文件和备份位于 `deploy/` 下，发布代码时必须保留这些目录和 `.env.production`。

## 目标

建立一套固定发布规则，后续 Codex 和人工发布都必须遵守：

1. GitHub 发布和线上服务器发布分成两个明确阶段。
2. 只有 GitHub 远端指针、服务器容器状态、线上 API、线上页面行为都验证通过后，才能声明线上发布成功。
3. 发布包和 Docker 构建上下文不得包含电子教材 PDF、Markdown 本地资产、本地同步备份、数据库备份、证书、密钥或真实环境变量。
4. 当前第一阶段仍使用单机 Docker Compose，不引入 Kubernetes、复杂 CI/CD 或自动化数据库 reset。

## 方案

采用“脚本化门禁 + 文档规则固定”：

- 在 `AGENTS.md` 固定发布纪律，要求后续每次发布都列明 GitHub 阶段、服务器阶段、验证命令和线上验收结果。
- 在 `DEPLOYMENT.md` 增加当前服务器真实发布流程，说明 `/opt/xueleai` 是发布目录而不是 Git 仓库。
- 增加发布脚本：
  - `scripts/release/github-publish-check.sh`：检查当前分支、工作区、远端 `main` 指针和发布版本。
  - `scripts/release/sync-server.sh`：使用 `rsync` 同步代码到服务器，排除生产数据和本地大文件。
  - `scripts/release/verify-live.mjs`：验证线上 `/api/health`、系统配置和页面 HTML 片段。
- 优化 `scripts/release/deploy.sh`：支持当前服务器的本地镜像模式，避免 `IMAGE_REGISTRY=""` 时被错误替换为 `registry.example.com`。

## 发布阶段

### 阶段 1：GitHub 发布

1. 确认工作区只包含本次发布范围。
2. 运行必要验证命令。
3. 提交并推送到 GitHub。
4. 使用 `git ls-remote origin refs/heads/main` 确认远端 `main` 指向预期提交。

### 阶段 2：服务器发布

1. 使用固定 SSH 密钥连接服务器。
2. 同步代码到 `/opt/xueleai`，必须排除：
   - `.env*`
   - `.git/`
   - `node_modules/`
   - `.next/`
   - `dist/`
   - `build/`
   - `.venv-textbook-md/`
   - `.model-cache/`
   - `textbook/`
   - `textbook-markdown-assets/`
   - `tmp/`
   - `backups/`
   - `deploy/data/`
   - `deploy/certs/`
   - `*.pem`
3. 在服务器运行生产部署脚本，构建或拉取镜像，执行 migration，启动服务。
4. 验证 `docker compose ps` 中 `nginx`、`web`、`api-core`、`ai-gateway`、`postgres`、`redis` 均为 healthy 或 Up。

### 阶段 3：线上复验

1. `https://xueleai.com/api/health` 返回统一响应且 `code=0`。
2. `https://xueleai.com/api/system-config/public` 可读取站点配置。
3. 对涉及页面行为的发布，必须检查线上 HTML 或浏览器页面，确认实际用户可见结果已经变化。
4. 若任一验证失败，只能报告“GitHub 已发布，线上发布未完成/失败”，不能声明发布成功。

## 验收

- `pnpm --filter @xueleai/web typecheck`
- `bash -n scripts/release/*.sh`
- `node --check scripts/release/verify-live.mjs`
- `DRY_RUN=1 scripts/release/sync-server.sh`
- `DRY_RUN=1 scripts/release/deploy.sh <version>`

## 非目标

- 不引入 GitHub Actions 自动部署。
- 不接入新的镜像仓库。
- 不改变线上 PostgreSQL、Redis volume。
- 不执行 `prisma migrate reset`、`docker volume rm` 或任何生产数据清空操作。
