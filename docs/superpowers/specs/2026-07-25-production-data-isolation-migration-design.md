# 生产数据隔离迁移设计

## 目标

将生产环境从历史命名迁移到本项目独立命名，同时保证业务数据无损、切换可验证、失败可回滚：

| 项目 | 迁移前 | 迁移后 |
| --- | --- | --- |
| Compose 项目 | `xueleai` | `xueleai-prod` |
| PostgreSQL 用户 | `aisaas` | `xueleai` |
| PostgreSQL 数据库 | `aisaas` | `xueleai` |
| PostgreSQL 数据卷 | `xueleai_postgres_data` | `xueleai-prod_postgres_data` |
| Redis 数据卷 | `xueleai_redis_data` | `xueleai-prod_redis_data` |

旧容器、旧 PostgreSQL 数据卷和旧 Redis 数据卷在迁移完成后继续保留，不在本次迁移中删除。

## 已知生产状态

- PostgreSQL 17，数据库约 42 MB，共 78 张表。
- Redis 7，迁移前 `DBSIZE` 为 0，AOF 已启用。
- 根磁盘剩余约 6.1 GB，新旧数据卷和备份可以同时保留。
- 当前应用版本为 `0.0.15`，生产容器健康。

## 方案选择

### 采用：逻辑备份恢复到新集群

使用 `pg_dump --format=custom --no-owner --no-acl` 导出旧数据库，在使用新用户、新库名和新数据卷启动的临时 PostgreSQL 17 容器中恢复。恢复完成后逐表比较精确行数、基于完整行 JSON 的顺序无关摘要以及序列值。

优点：

- 不依赖 PostgreSQL 物理数据目录内部格式。
- 可以安全更改数据库用户和数据库名称。
- 新旧数据卷完全独立，回滚不需要反向恢复。
- 可在切换公网流量前完成数据一致性验证。

### 不采用：停机后直接复制 PostgreSQL 数据卷

物理复制速度快，但会保留旧角色和旧数据库名称，后续仍需在原集群内重命名；同时更依赖文件权限和 PostgreSQL 物理格式，不适合本次隔离目标。

### 不采用：原数据卷原地重命名

Docker 数据卷没有安全的原地重命名操作。复用旧数据卷只能改变 Compose 引用，不能形成独立回滚点，也不符合生产数据卷命名约束。

## 迁移流程

1. 只读预检生产环境、磁盘、容器、数据卷和必要环境变量。
2. 在 `deploy/data/backups/production-isolation/<时间戳>/` 保存：
   - 迁移前 `.env.production`
   - 在线预备数据库备份
   - 最终停写数据库备份
   - schema、逐表摘要、序列清单
   - Redis 持久化文件副本
   - SHA-256 校验文件
3. 创建 `xueleai-prod_postgres_data` 和 `xueleai-prod_redis_data`，但不修改旧数据卷。
4. 暂停旧项目的 Nginx、Web、API 和 AI Gateway，进入停写窗口。
5. 生成最终 PostgreSQL 一致性备份；持久化并停止旧 Redis。
6. 使用临时 PostgreSQL 17 容器恢复到新数据卷中的 `xueleai` 数据库。
7. 比较源库与目标库的逐表行数、逐表内容摘要和序列值。
8. 校验通过后原子更新 `.env.production` 中的用户、库名、连接地址、Compose 项目名和数据卷名。
9. 停止旧 PostgreSQL，使用 `xueleai-prod` 启动新生产栈并执行 `prisma migrate deploy`。
10. 验证容器健康、API 健康、公开配置、登录边界和 `/media-tutor` 页面。

## 回滚

如果数据恢复或一致性校验失败，脚本在切换环境变量前停止，旧生产栈可直接恢复服务。

如果新生产栈启动或公网验证失败：

1. 停止 `xueleai-prod` 项目，但不删除容器或数据卷。
2. 恢复迁移前 `.env.production`。
3. 启动旧 `xueleai` 项目和旧数据卷。
4. 重新执行公网健康检查。

本次迁移禁止执行 `docker compose down -v`、`docker volume rm`、`prisma migrate reset` 或删除任何旧备份。

## 验收标准

- 新 PostgreSQL 数据库名和当前用户均为 `xueleai`。
- 新旧逐表行数、内容摘要和序列清单完全一致。
- 新项目容器名称以 `xueleai-prod-` 开头并全部健康。
- 生产环境只引用 `xueleai-prod_postgres_data` 和 `xueleai-prod_redis_data`。
- `https://xueleai.com/api/health` 与公开配置接口返回 HTTP 200。
- `/media-tutor` 页面可访问，未登录访问私人导学历史接口返回 HTTP 401。
- 旧 `xueleai` 容器与旧数据卷仍存在且处于停止状态，可作为回滚点。
