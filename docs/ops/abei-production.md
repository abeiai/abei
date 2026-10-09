# abei 生产发布

生产域名为 `https://new.abeiai.com`，服务器 `8.130.44.204`，目录 `/opt/abei` 为发布目录，不是 Git 仓库。使用 `docker-compose.abei-prod.yml`，Compose 项目 `abei-prod`，所有卷以 `abei-prod_` 开头。本地 `abei` 卷不参与服务器 Compose。

## 代码与私有配置

先在 `abeiai/abei` 的 `main` 推送已验证提交，再用 `git ls-remote origin refs/heads/main` 确认提交号。服务器代码只来自该提交的 `git archive`，排除本地旧版源码 `abeiai/`、真实环境变量、私钥、备份和运行数据。

生产私有 `.env.production` 通过 SSH 单独传输，权限为 600。必须保留本地 `SECRET_ENCRYPTION_KEY` 等应用密钥，数据库中的加密提供商配置才能正常解密。`APP_BASE_URL` 为生产 HTTPS 域名，`APP_RELEASE_SHA` 为发布提交号。不得使用上游 `docker-compose.prod.yml` 或 xueleai 发布脚本。

```bash
docker compose --env-file .env.production -f docker-compose.abei-prod.yml build
docker compose --env-file .env.production -f docker-compose.abei-prod.yml up -d
```

公网端口 80/443 映射到入口容器 3600/3610；Web、API 和 AI Gateway 不映射宿主机，PostgreSQL 3604 仅回环可达，Redis 3605 仅容器网络可达。TLS 证书位于宿主机 `/etc/letsencrypt`，只读挂载到入口，续期使用 webroot `deploy/data/certbot` 并在成功后 reload Nginx。

## 首次完整数据同步

业务数据独立私传，不提交到 GitHub。数据库使用 PostgreSQL 17 的 `pg_dump -Fc --no-owner --no-acl`，在新空数据库 `abei` 中 `pg_restore --exit-on-error --no-owner --no-acl`，不 reset、不删除已有卷、不执行 seed。再次覆盖已有线上库前，必须先备份并确认新增线上业务如何保留。

同步 `uploads`、`logs`、`legacy_ai_log_assets`、`picture_book_guides` 卷内容及 Redis 持久化目录；恢复后设置 API 可写卷 UID/GID 1000。私有绘本导读和旧日志素材不挂到公开 uploads。远程 R2 已有对象保持原引用与本地配置，不重新搬运。

数据文件传输前后比较 SHA-256。恢复后逐表比较所有 public 表精确计数，并检查 migration 已完成。生产 `system_configs.siteUrl` 改为生产域名；其余数据完整保留。应用在 `deploy/data/state/maintenance.enabled` 存在时返回 503；验收通过后移除维护文件。

## 复验

```bash
curl -fsS https://new.abeiai.com/api/health
curl -fsS https://new.abeiai.com/api/health/db
curl -fsS https://new.abeiai.com/api/health/redis
curl -fsS https://new.abeiai.com/api/system-config/public
```

还须核对发布 revision，首页和工具页面 HTML，登录与后台鉴权，以及 robots、sitemap 和 canonical 域名。报告分别说明 GitHub、服务器、API、页面及数据同步状态。
