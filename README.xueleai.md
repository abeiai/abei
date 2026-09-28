# 学乐 AI

面向中国市场的简体中文 AI SaaS / 内容型工具站底座。

当前项目包含：

- Next.js 前台、用户中心和管理后台
- NestJS 核心 API
- Prisma + PostgreSQL 数据层
- Redis
- 简单 CMS：文章分类、文章、单页
- 邮箱注册登录、管理员登录
- 点数钱包、支付订单、支付宝/微信支付回调预留
- AI Provider、模型预设、AI 工具模板和任务记录
- FastAPI AI Gateway 预留层
- Docker Compose 本地和生产部署配置

## 固定端口

本项目只使用 `3320-3329` 端口段，避免和其他项目冲突。

```text
3320  Docker / Nginx HTTP 入口
3321  Next.js Web
3322  NestJS API Core
3323  FastAPI AI Gateway
3324  本地 PostgreSQL
3325  本地 Redis
3326  Docker / Nginx HTTPS 入口
3327  生产 Compose PostgreSQL
3328  生产 Compose Redis
```

## Docker 隔离

本地开发 Compose 项目名固定为 `xueleai`，只启动 PostgreSQL 和 Redis：

```text
xueleai-postgres
xueleai-redis
xueleai_postgres_data
xueleai_redis_data
```

生产 Compose 默认项目名为 `xueleai-prod`，使用独立数据卷：

```text
xueleai-prod_postgres_data
xueleai-prod_redis_data
```

## 本地启动

```bash
pnpm install
docker compose up -d
pnpm db:migrate
pnpm db:seed
pnpm dev
```

访问地址：

- 前台：http://localhost:3321
- 后台：http://localhost:3321/admin
- 本地统一入口：http://localhost:3320（运行 `pnpm dev` 后自动启动）
- API Health：http://localhost:3322/api/health

## 常用命令

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm seed:demo
pnpm template:blank
pnpm release:check
```

## 生产部署

复制生产环境变量模板：

```bash
cp .env.production.example .env.production
```

生产发布：

```bash
DRY_RUN=1 SERVER_HOST=8.130.169.220 SSH_KEY=/path/to/xueleai.com.pem pnpm release:server
SERVER_HOST=8.130.169.220 SSH_KEY=/path/to/xueleai.com.pem pnpm release:server
```

该入口会依次校验 GitHub、获取服务器互斥锁、同步固定提交、构建不可变镜像、备份数据库、执行 migration、启动服务，并核对线上版本号和 Git SHA。内部同步和部署脚本默认拒绝单独执行。

详细说明见 [DEPLOYMENT.md](DEPLOYMENT.md)。

## 开发规则

仓库级开发规则见 [AGENTS.md](AGENTS.md)，视觉设计规则见 [DESIGN.md](DESIGN.md)。

第三方场景应用开发说明见 [docs/scene-application-development.md](docs/scene-application-development.md)。
