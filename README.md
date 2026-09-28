# abei

本项目以 xueleai 的 `origin/main` 已提交快照为技术底座，包含 Next.js Web、NestJS API、FastAPI AI Gateway、PostgreSQL 和 Redis。导入来源：`abeiai/xueleai`，提交 `28bfb1f7`（2026-09-27）。上游原始说明见 [README.xueleai.md](README.xueleai.md)。

## Docker 启动

首次启动需要 Docker Desktop。项目根目录的私有 `.env` 包含独立生成的数据库密码和应用密钥，不应提交。运行：

```bash
docker compose up -d --build
```

入口：[http://localhost:3600](http://localhost:3600)，健康检查：[http://localhost:3600/healthz](http://localhost:3600/healthz)。数据库 migration 在启动时自动执行。查看状态与停止：

```bash
docker compose ps
docker compose down
```

Docker 项目名为 `abei`，入口容器名为 `abei`。端口均在指定范围内：3600 HTTP、3601 Web、3602 API、3603 AI Gateway、3604 PostgreSQL、3605 Redis。仅入口、PostgreSQL 和 Redis 映射到本机回环地址；其余服务通过 Compose 内部网络连接。数据保存在 `abei` 专属 Docker 卷中，与 xueleai 完全隔离。

上游的 `docker-compose.prod.yml` 和发布脚本仍保留供参考，其 xueleai 配置不用于 abei 的本地运行。
