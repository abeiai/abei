# 阶段 0：仓库初始化与工程骨架

## 目标

建立可以运行的 Monorepo 工程骨架，为后续前台、后台、API、数据库开发提供基础。

本阶段不追求完整业务功能，只追求项目结构正确、依赖清晰、可以启动。

---

## 允许修改目录

```text
./
apps/web/
apps/api-core/
apps/ai-gateway/
packages/database/
packages/config/
```

---

## 需要完成

### 1. 初始化 pnpm workspace

创建：

```text
pnpm-workspace.yaml
package.json
```

根目录 `package.json` 至少包含：

```json
{
  "scripts": {
    "dev": "pnpm -r dev",
    "build": "pnpm -r build",
    "lint": "pnpm -r lint",
    "typecheck": "pnpm -r typecheck",
    "test": "pnpm -r test"
  }
}
```

---

### 2. 创建应用目录

```text
apps/web
apps/api-core
apps/ai-gateway
```

要求：

- `apps/web` 使用 Next.js App Router。
- `apps/api-core` 使用 NestJS。
- `apps/ai-gateway` 第一阶段只需要 FastAPI health check 或占位。
- 不得在此阶段实现复杂 AI 逻辑。

---

### 3. 创建共享包

```text
packages/database
packages/config
```

`packages/database` 用于：

```text
Prisma schema
migration
seed
Prisma Client
```

`packages/config` 用于：

```text
ESLint
Prettier
TypeScript config
```

---

### 4. Docker Compose

根目录创建：

```text
docker-compose.yml
```

至少包含：

```text
PostgreSQL
Redis
```

---

### 5. 环境变量模板

根目录创建：

```text
.env.example
```

至少包括：

```env
DATABASE_URL=
REDIS_URL=

JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=
JWT_ACCESS_EXPIRES_IN=
JWT_REFRESH_EXPIRES_IN=

DEFAULT_ADMIN_EMAIL=
DEFAULT_ADMIN_PASSWORD=

APP_BASE_URL=
API_BASE_URL=

ALIPAY_APP_ID=
ALIPAY_PRIVATE_KEY=
ALIPAY_PUBLIC_KEY=
ALIPAY_NOTIFY_URL=

WECHAT_PAY_MCH_ID=
WECHAT_PAY_APP_ID=
WECHAT_PAY_API_V3_KEY=
WECHAT_PAY_PRIVATE_KEY=
WECHAT_PAY_SERIAL_NO=
WECHAT_PAY_NOTIFY_URL=
```

---

## 禁止事项

本阶段禁止实现：

1. 支付 SDK
2. AI provider
3. 复杂权限
4. 多语言
5. CMS 业务逻辑
6. 订阅系统

---

## 验收命令

```bash
pnpm install
docker compose up -d
pnpm lint
pnpm typecheck
pnpm build
```

如果某些命令暂未可用，必须补充对应 script 或说明原因。
