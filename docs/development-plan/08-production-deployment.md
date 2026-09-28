# 阶段 8：生产部署能力

## 目标

让项目具备真实服务器部署能力。

本阶段优先支持 Docker Compose 单机部署，不引入 Kubernetes。

## 允许修改目录

```text
./
apps/web/
apps/api-core/
apps/ai-gateway/
packages/database/
docs/
scripts/
deploy/
```

## 本阶段任务

```text
041 编写 production Dockerfile
042 编写 docker-compose.prod.yml
043 配置 Nginx 反向代理
044 配置 HTTPS
045 配置生产环境变量模板
046 配置数据库 migration 部署流程
047 配置日志目录挂载
048 配置上传目录或对象存储预留
049 配置备份脚本
050 编写 DEPLOYMENT.md
```

## 推荐部署结构

```text
Nginx
  ↓
Next.js web
  ↓
NestJS api-core
  ↓
PostgreSQL
Redis

FastAPI ai-gateway 后置接入
```

## 任务 041：编写 production Dockerfile

### 建议文件

```text
apps/web/Dockerfile
apps/api-core/Dockerfile
apps/ai-gateway/Dockerfile
```

### 要求

```text
1. 使用多阶段构建。
2. 不把 .env 打进镜像。
3. 不在镜像里保留无关开发文件。
4. 镜像启动命令清晰。
```

## 任务 042：编写 docker-compose.prod.yml

### 服务至少包括

```text
nginx
web
api-core
postgres
redis
```

如 AI Gateway 已启用，可包括：

```text
ai-gateway
```

### 要求

```text
1. PostgreSQL 数据目录持久化。
2. Redis 数据按需持久化。
3. 日志目录挂载。
4. 通过 env_file 或环境变量注入配置。
5. 不提交真实密钥。
```

## 任务 043：配置 Nginx 反向代理

### 推荐规则

```text
/        → web
/api/    → api-core
/ai-api/ → ai-gateway
```

如果项目已经使用其他 API 前缀，以现有实现为准，但必须在文档中说明。

## 任务 044：配置 HTTPS

### 要求

```text
1. 提供 Nginx HTTPS 配置示例。
2. 支持证书文件挂载。
3. 文档说明如何替换域名和证书路径。
```

## 任务 045：配置生产环境变量模板

### 建议文件

```text
.env.production.example
```

必须包括：

```text
APP_BASE_URL
API_BASE_URL
DATABASE_URL
REDIS_URL
JWT_ACCESS_SECRET
JWT_REFRESH_SECRET
DEFAULT_ADMIN_EMAIL
DEFAULT_ADMIN_PASSWORD
ALIPAY_*
WECHAT_PAY_*
AI_PROVIDER_*
```

## 任务 046：配置数据库 migration 部署流程

### 要求

```text
1. 文档说明部署前如何备份数据库。
2. 文档说明如何运行 migration。
3. 文档说明 migration 失败如何回滚或恢复。
4. 禁止生产环境随意 reset 数据库。
```

## 任务 047：配置日志目录挂载

### 要求

```text
1. API 日志挂载到宿主机目录。
2. Nginx 日志挂载到宿主机目录。
3. 文档说明日志位置。
4. 日志中不得包含敏感密钥。
```

## 任务 048：配置上传目录或对象存储预留

### 第一版可选方案

```text
本地 uploads 目录挂载
```

后续可扩展：

```text
S3-compatible 对象存储
Cloudflare R2
阿里云 OSS
腾讯云 COS
```

## 任务 049：配置备份脚本

### 建议文件

```text
scripts/backup-postgres.sh
scripts/restore-postgres.sh
docs/ops/database-backup.md
```

## 任务 050：编写 DEPLOYMENT.md

### 内容必须包括

```text
1. 服务器准备
2. Docker / Docker Compose 安装
3. 环境变量配置
4. 数据库启动
5. migration
6. seed
7. 服务启动
8. Nginx 配置
9. HTTPS 配置
10. 日志查看
11. 备份恢复
12. 常见问题
```

## 本阶段禁止事项

```text
1. 不引入 Kubernetes。
2. 不引入复杂 CI/CD。
3. 不接真实支付。
4. 不接真实 AI。
5. 不新增业务功能。
```

## 验收标准

```text
1. 可以用 docker-compose.prod.yml 启动服务。
2. 首页可以通过域名访问。
3. /api/health 正常。
4. 管理员可以登录后台。
5. CMS 可以正常创建和发布文章。
6. PostgreSQL 数据持久化。
7. 日志可查看。
8. HTTPS 配置文档完整。
9. DEPLOYMENT.md 可按步骤执行。
```

## 验收命令

```bash
docker compose -f docker-compose.prod.yml config
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```
