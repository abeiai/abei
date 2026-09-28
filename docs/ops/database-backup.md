# 数据库备份与恢复

本项目第一阶段使用 PostgreSQL。上线前至少需要保留手动备份和恢复流程，避免误操作、迁移失败或服务器故障导致数据不可恢复。

## 备份

前置条件：

```bash
pg_dump --version
```

执行备份：

```bash
DATABASE_URL="postgresql://user:password@host:3327/dbname?schema=public" \
scripts/backup-postgres.sh /data/backups/xueleai-postgres
```

脚本会生成 custom format 备份文件：

```text
/data/backups/xueleai-postgres/xueleai-YYYYMMDD-HHMMSS.dump
```

如果不传目录，默认写入：

```text
backups/postgres/
```

脚本会自动处理 Prisma 常用的 `?schema=public` 参数，并按指定 schema 执行 `pg_dump`。

`backups/`、`*.dump`、`*.backup`、`*.sql.gz` 已加入 `.gitignore`，不要把数据库备份提交到代码仓库。

生产 Compose 默认将 PostgreSQL 绑定到宿主机 `127.0.0.1:${POSTGRES_HOST_PORT:-3327}`。在服务器上备份时，使用宿主机本地地址，而不是容器内的 `postgres` 主机名：

```bash
DATABASE_URL="postgresql://xueleai:数据库密码@127.0.0.1:3327/xueleai?schema=public" \
scripts/backup-postgres.sh /data/backups/xueleai-postgres
```

## 恢复

恢复前必须确认目标数据库、备份文件和恢复窗口。恢复命令会清理目标库中同名对象后重建。

```bash
CONFIRM_RESTORE=YES \
DATABASE_URL="postgresql://user:password@host:3327/dbname?schema=public" \
scripts/restore-postgres.sh /data/backups/xueleai-postgres/xueleai-YYYYMMDD-HHMMSS.dump
```

Docker Compose 生产部署恢复后，需要重新执行：

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml up -d postgres redis
docker compose --env-file .env.production -f docker-compose.prod.yml run --rm api-core \
  pnpm db:migrate:deploy
docker compose --env-file .env.production -f docker-compose.prod.yml up -d
```

## 建议

1. 生产环境至少每天备份一次，并保留最近 7 天。
2. 每次执行 `pnpm db:migrate` 前先备份。
3. 备份文件应放在数据库服务器之外的持久化目录或对象存储。
4. 定期在临时库执行恢复演练，确认备份文件可用。
5. 不在日志、工单或聊天记录中泄露 `DATABASE_URL`。
