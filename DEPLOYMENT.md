# AI SaaS 生产部署手册

本项目第一阶段采用单机 Docker Compose 部署，不引入 Kubernetes，不接入真实 AI Provider。支付仅接入支付宝和微信支付的点数充值链路。

## 1. 发布合约

- 版本来源：根目录 `package.json` 的 `version` 字段。
- 镜像命名：`<IMAGE_REGISTRY>/<IMAGE_NAMESPACE>/<IMAGE_PROJECT>:<service>-<version>`。
- 运行服务：`nginx`、`web`、`api-core`、`ai-gateway`、`postgres`、`redis`。
- 生产 Compose：`docker-compose.prod.yml`。
- 生产 Compose 项目名：默认 `xueleai-prod`，可通过 `.env.production` 的 `COMPOSE_PROJECT_NAME` 覆盖。
- 生产环境变量：`.env.production`，由 `.env.production.example` 复制后填写。
- Migration 命令：`pnpm db:migrate:deploy`。
- 回滚方式：重新部署上一个已发布的不可变镜像版本。
- 发布身份：版本号和 40 位 Git SHA 必须同时匹配，不能只比较版本号。

## 固定发布流程

本项目固定采用“两阶段发布”：

1. GitHub 发布：提交并推送到 GitHub，确认远端 `main` 指向本次发布提交。
2. 线上服务器发布：同步代码到服务器发布目录，执行生产部署脚本，并复验线上 API 与页面行为。

只完成 GitHub 推送时，只能说明“GitHub 已发布”，不得说明“线上已发布成功”。只有服务器部署和线上复验都通过后，才能说明线上发布成功。

当前线上服务器目录：

```text
/opt/xueleai
```

该目录是发布目录，不是 Git 仓库。发布时使用 `scripts/release/sync-server.sh` 从当前 Git 提交生成临时发布目录，再用 `rsync` 同步到服务器。同步来源必须是 Git 已跟踪文件，不得直接同步整个本地工作目录；未提交、未跟踪或被忽略的本地文件不会进入发布目录。

同步时必须保留服务器上的生产文件和数据目录：

```text
.env.production
deploy/data/
deploy/certs/
```

发布同步和 Docker 构建上下文不得包含：

```text
.env*
.git/
.superpowers/
design-demos/
data/
node_modules/
**/node_modules/
.next/
**/.next/
dist/
**/dist/
build/
**/build/
out/
**/out/
coverage/
**/coverage/
packages/database/generated/
apps/web/public/vendor/
apps/web/public/vendor/vditor/
apps/api-core/uploads/
uploads/
.pnpm-store/
.uv-cache/
.venv-textbook-md/
.model-cache/
.turbo/
**/.turbo/
textbook/
textbook-markdown-assets/
tmp/
backups/
deploy/data/
deploy/certs/
*.pem
*.dump
*.backup
*.sql.gz
*.log
logs/
screenlog.0
.DS_Store
.playwright-mcp/
**/__pycache__/
**/*.pyc
```

其中 `textbook/` 和 `textbook-markdown-assets/` 是电子教材 PDF 与 Markdown 本地资产备份目录。线上教材资源使用 R2/CDN，不通过 Git 或发布包分发这些本地备份。

日常生产发布只使用一个入口：

```bash
DRY_RUN=1 \
SERVER_HOST=8.130.169.220 \
SSH_KEY=/path/to/xueleai.com.pem \
pnpm release:server

SERVER_HOST=8.130.169.220 \
SSH_KEY=/path/to/xueleai.com.pem \
pnpm release:server
```

`release:server` 固定按以下顺序执行，任一步失败都会停止：

```text
1. 确认工作区干净，GitHub main 与本地 HEAD 完全一致
2. 获取服务器发布互斥锁，并保存上一版环境和 Compose 快照
3. 从该 Git 提交生成发布快照，并写入 .release-source
4. 同步快照到 /opt/xueleai，同时保留生产环境、证书和数据
5. 检查磁盘容量，空间不足时只清理未使用的 Docker 构建缓存
6. 在服务器构建或拉取带版本号和 Git SHA 的不可变镜像
7. 停止公网入口和应用写入，生成私有数据库备份并校验可恢复性
8. 执行向后兼容的数据库 migration
9. 启动并等待新应用服务健康，校验容器实际镜像 ID、版本号和 Git SHA
10. 恢复公网入口，原子更新 .env.production 中的当前发布状态
11. 校验公网 API 和 Web HTML 的版本号与 Git SHA
```

`release:sync-server` 和 `release:deploy` 都是受保护的内部步骤，默认拒绝单独执行。紧急人工排障需要显式设置对应的 `ALLOW_STANDALONE_*` 环境变量，并且不能据此宣称线上发布成功。

每个镜像标签由版本号和完整 Git SHA 共同组成，例如 `xueleai-web:0.0.16-<40 位 SHA>`。同一版本号对应不同提交时不会覆盖已有镜像。发布失败会恢复上一组应用镜像和发布配置；数据库 migration 必须保持向后兼容，数据库备份用于经过确认的人工恢复，不在自动回滚中直接覆盖生产数据。

如果本地发布进程被强制终止，服务器会保留 `/opt/xueleai.release.lock`，防止后续发布误入。确认没有其他发布仍在运行后，可对下一次 `release:server` 显式设置 `FORCE_RELEASE_UNLOCK=1` 清理陈旧锁。

对涉及页面可见行为的发布，使用 `VERIFY_CONTAINS` 或 `VERIFY_NOT_CONTAINS` 增加页面 HTML 验收，例如：

```bash
VERIFY_NOT_CONTAINS='<span class="truncate">学乐AI</span>' pnpm release:verify-live
```

## 2. 服务器准备

推荐准备一台 Linux 服务器，并确认：

```bash
docker --version
docker compose version
```

开放端口：

```text
80/tcp
443/tcp
```

生产公网入口使用常用端口 `80/443`；Compose 内部仍将其映射到 Nginx 容器的 `3320/3326`。

部署目录示例：

```bash
mkdir -p /opt/xueleai
cd /opt/xueleai
```

如果宿主机是 Linux，并且 API 容器使用非 root 用户写日志和上传目录，先创建目录：

```bash
mkdir -p deploy/data/logs/api-core deploy/data/logs/nginx deploy/data/uploads deploy/certs
sudo chown -R 1000:1000 deploy/data/logs/api-core deploy/data/uploads
```

## 3. 环境变量配置

复制模板：

```bash
cp .env.production.example .env.production
```

必须替换：

```text
APP_BASE_URL
POSTGRES_PASSWORD
DATABASE_URL
JWT_ACCESS_SECRET
JWT_REFRESH_SECRET
SECRET_ENCRYPTION_KEY
DEFAULT_ADMIN_EMAIL
DEFAULT_ADMIN_PASSWORD
IMAGE_REGISTRY
IMAGE_NAMESPACE
IMAGE_PROJECT
COMPOSE_PROJECT_NAME
POSTGRES_VOLUME_NAME
REDIS_VOLUME_NAME
```

`API_BASE_URL` 在容器内默认使用：

```text
http://api-core:3322/api
```

前台对外访问域名由 `APP_BASE_URL` 表示，例如：

```text
https://example.com
```

支付变量需要按实际渠道填写。支付宝使用 `ALIPAY_*`，微信支付使用 `WECHAT_PAY_*`，回调地址必须是公网可访问的 `/api/payment/alipay/notify` 和 `/api/payment/wechat/notify`。

生产环境不要设置：

```text
ENABLE_MOCK_PAYMENT_NOTIFY
```

真实支付配置和后台补单流程见 `docs/ops/real-payment.md`。

真实 AI Provider 需要配置 `SECRET_ENCRYPTION_KEY`，并可通过 `.env.production` 的 `AI_PROVIDER_*` 变量 seed 默认模型，也可在后台 `/admin/ai-providers` 配置。详见 `docs/ops/real-ai-provider.md`。

## 4. 构建并发布镜像

先做 dry-run，确认镜像标签：

```bash
DRY_RUN=1 scripts/release/publish.sh
```

真实发布：

```bash
IMAGE_REGISTRY="registry.example.com" \
IMAGE_NAMESPACE="xueleai" \
IMAGE_PROJECT="xueleai" \
scripts/release/publish.sh
```

指定版本发布：

```bash
VERSION="0.1.0" scripts/release/publish.sh
```

发布脚本会分别构建并推送：

```text
web-<version>
api-core-<version>
ai-gateway-<version>
```

## 5. 数据库启动

首次部署前先启动 PostgreSQL 和 Redis：

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml up -d postgres redis
docker compose --env-file .env.production -f docker-compose.prod.yml ps
```

PostgreSQL 数据默认保存在 Compose volume `xueleai-prod_postgres_data`，Redis 数据默认保存在 `xueleai-prod_redis_data`。不要复用其他项目或本地开发环境的 volume。

生产 Compose 默认只把 PostgreSQL 绑定到宿主机本地回环地址，便于备份：

```text
127.0.0.1:${POSTGRES_HOST_PORT:-3327}
```

## 6. Migration

每次上线前先备份：

```bash
DATABASE_URL="postgresql://xueleai:数据库密码@127.0.0.1:3327/xueleai?schema=public" \
scripts/backup-postgres.sh /data/backups/xueleai-postgres
```

使用部署脚本时，migration 会在应用容器启动前显式执行。手工排障时必须同时指定版本和已经同步的提交：

```bash
ALLOW_STANDALONE_DEPLOY=1 \
RELEASE_SHA="<40 位 Git SHA>" \
scripts/release/deploy.sh 0.0.16
```

手动执行 migration：

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml run --rm api-core \
  pnpm db:migrate:deploy
```

生产环境禁止执行 `prisma migrate reset` 或删除 volume 来“修复”迁移问题。迁移失败时应停止部署，保留现场日志，必要时按备份文件恢复。

## 7. Seed

首次部署需要创建默认超级管理员和基础 CMS 内容：

```bash
RUN_SEED=1 scripts/release/deploy.sh 0.0.0
```

也可以手动执行：

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml run --rm api-core \
  pnpm db:seed
```

`DEFAULT_ADMIN_EMAIL` 和 `DEFAULT_ADMIN_PASSWORD` 必须来自 `.env.production`。Seed 执行后请立即用强密码登录后台，并按需要调整系统配置里的站点地址。

## 8. 服务启动

推荐通过部署脚本启动指定版本：

```bash
DRY_RUN=1 scripts/release/deploy.sh 0.0.0
scripts/release/deploy.sh 0.0.0
```

本地源码构建验收也可以使用：

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml config
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

查看容器：

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml ps
```

## 9. Nginx 配置

默认 HTTP 反向代理文件：

```text
deploy/nginx/conf.d/default.conf
```

路由规则：

```text
/        -> web:3321
/api/    -> api-core:3322
/ai-api/ -> ai-gateway:3323
/uploads/ -> 本地 uploads 挂载目录
```

Nginx 日志挂载：

```text
deploy/data/logs/nginx/access.log
deploy/data/logs/nginx/error.log
```

## 10. HTTPS 配置

HTTPS 示例文件：

```text
deploy/nginx/conf.d/https.example
```

启用步骤：

```bash
cp deploy/nginx/conf.d/https.example deploy/nginx/conf.d/https.conf
```

修改 `https.conf`：

```text
server_name example.com www.example.com;
ssl_certificate /etc/nginx/certs/fullchain.pem;
ssl_certificate_key /etc/nginx/certs/privkey.pem;
```

把证书放到：

```text
deploy/certs/fullchain.pem
deploy/certs/privkey.pem
```

然后重载：

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml up -d nginx
```

如果需要强制 HTTP 跳转 HTTPS，可以把 `default.conf` 的 HTTP server 改为 `return 301 https://$host$request_uri;`，但必须保留 `/healthz` 或在负载均衡器中同步调整健康检查。

## 11. 日志查看

容器日志：

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml logs -f nginx
docker compose --env-file .env.production -f docker-compose.prod.yml logs -f api-core
docker compose --env-file .env.production -f docker-compose.prod.yml logs -f web
```

宿主机日志目录：

```text
deploy/data/logs/api-core/requests.log
deploy/data/logs/api-core/errors.log
deploy/data/logs/nginx/access.log
deploy/data/logs/nginx/error.log
```

日志中不应记录 `DATABASE_URL`、JWT Secret、支付密钥、AI Provider Key。

## 12. 备份恢复

备份：

```bash
DATABASE_URL="postgresql://xueleai:数据库密码@127.0.0.1:3327/xueleai?schema=public" \
scripts/backup-postgres.sh /data/backups/xueleai-postgres
```

恢复：

```bash
CONFIRM_RESTORE=YES \
DATABASE_URL="postgresql://xueleai:数据库密码@127.0.0.1:3327/xueleai?schema=public" \
scripts/restore-postgres.sh /data/backups/xueleai-postgres/xueleai-YYYYMMDD-HHMMSS.dump
```

更多说明见 `docs/ops/database-backup.md`。

## 13. 验证

容器状态：

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml ps
```

健康检查：

```bash
curl -i https://example.com/api/health
curl -i https://example.com/api/health/db
curl -i https://example.com/api/health/redis
```

前台验证：

```text
https://example.com/
https://example.com/articles
https://example.com/admin/login
```

后台验证：

1. 使用 `.env.production` 中的 `DEFAULT_ADMIN_EMAIL` 和 `DEFAULT_ADMIN_PASSWORD` 登录后台。
2. 创建文章分类。
3. 创建文章草稿。
4. 发布文章。
5. 在前台文章列表中确认可访问。

## 14. 回滚

回滚不是重新构建旧代码，而是部署上一个已发布的不可变镜像版本：

```bash
scripts/release/deploy.sh 0.0.0
```

如果回滚前已经执行了数据库 migration，先判断 migration 是否向后兼容。若不兼容，按上线前备份恢复数据库，再部署旧版本镜像。

## 15. 常见问题

### 容器启动后管理员无法登录

检查 `.env.production` 中是否设置了 `JWT_ACCESS_SECRET`、`JWT_REFRESH_SECRET`，并确认已执行 seed。

### `/api/health/redis` 返回 Redis 配置缺失

检查 `REDIS_URL` 是否存在，生产默认应为：

```text
redis://redis:3328
```

### Nginx HTTPS 启动失败

检查证书路径是否和 `https.conf` 一致，并确认 `deploy/certs/` 已挂载到 `/etc/nginx/certs`。

### Migration 失败

停止部署，不要 reset 数据库。先保存日志，再根据 `docs/ops/database-backup.md` 执行恢复或手工修复。
