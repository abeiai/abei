# 阶段 7：上线前硬化

## 目标

在 MVP 已完成的基础上，提升系统稳定性、安全性、可观测性和可维护性。

本阶段不新增大业务功能，重点是让现有功能可以安全上线。

## 允许修改目录

```text
apps/web/
apps/api-core/
packages/database/
packages/config/
docs/
```

如需补充 FastAPI 健康检查或日志，可修改：

```text
apps/ai-gateway/
```

## 本阶段任务

```text
031 补齐核心单元测试
032 补齐 Auth / CMS / Wallet / AI Task e2e 测试
033 增加接口限流
034 增加登录失败保护
035 增加管理员操作日志
036 增加全局请求日志
037 增加错误日志
038 增加数据库备份方案
039 增加健康检查接口
040 检查所有敏感环境变量
```

## 任务 031：补齐核心单元测试

### 目标

为核心业务逻辑增加单元测试，避免后续接入真实支付和真实 AI 后破坏已有逻辑。

### 优先覆盖

```text
AuthService
AdminAuthService
CmsService
WalletService
PaymentOrderService
AiTaskService
```

### 必测点

```text
1. 密码校验正确。
2. 用户登录失败时返回中文错误。
3. 管理员登录失败时返回中文错误。
4. 草稿文章不会被 public 查询返回。
5. 钱包充值不会重复入账。
6. AI 任务失败会释放冻结点数。
```

## 任务 032：补齐 e2e 测试

### 目标

补齐关键业务链路 e2e 测试。

### 必测链路

```text
1. 用户注册 → 登录 → 获取当前用户。
2. 管理员登录 → 创建文章分类。
3. 管理员创建文章 → 发布文章 → 前台读取文章。
4. 创建充值订单 → mock 支付成功 → 钱包入账。
5. 创建 AI 任务 → 冻结点数 → mock 成功结算。
6. 创建 AI 任务 → 冻结点数 → mock 失败释放。
```

## 任务 033：增加接口限流

### 目标

为高风险接口增加基础限流。

### 需要限流的接口

```text
POST /auth/login
POST /auth/register
POST /admin-auth/login
POST /payment/orders
POST /ai/tasks
```

### 要求

```text
1. 返回中文错误提示。
2. 不影响正常用户访问。
3. 限流配置来自环境变量或配置文件。
```

错误提示：

```text
请求过于频繁，请稍后再试。
```

## 任务 034：增加登录失败保护

### 目标

防止暴力破解用户和管理员密码。

### 要求

```text
1. 记录登录失败次数。
2. 短时间多次失败后临时锁定。
3. 锁定时返回中文错误提示。
4. 用户登录和管理员登录都要覆盖。
```

错误提示：

```text
登录失败次数过多，请稍后再试。
```

## 任务 035：增加管理员操作日志

### 目标

记录后台关键操作，便于追踪问题。

### 推荐模型

```text
AdminOperationLog
- id
- adminUserId
- action
- resourceType
- resourceId
- description
- ip
- userAgent
- createdAt
```

### 需要记录的操作

```text
1. 管理员登录
2. 创建文章分类
3. 编辑文章分类
4. 删除文章分类
5. 创建文章
6. 编辑文章
7. 发布文章
8. 下架文章
9. 删除文章
10. 创建单页
11. 编辑单页
12. 发布单页
13. 下架单页
14. 删除单页
15. 手动调整用户点数
```

## 任务 036：增加全局请求日志

### 目标

让 API 请求可追踪。

### 要求

```text
1. 记录 requestId。
2. 记录 method、path、statusCode、duration。
3. 记录用户 ID 或管理员 ID，如果存在。
4. 不记录明文密码、token、支付私钥、API Key。
```

## 任务 037：增加错误日志

### 目标

记录服务端异常，方便排查线上问题。

### 要求

```text
1. 捕获未处理异常。
2. 记录 requestId。
3. 记录错误摘要。
4. 生产环境不向前端返回 stack trace。
5. 前端只显示中文友好错误。
```

## 任务 038：增加数据库备份方案

### 目标

提供基础数据库备份能力。

### 建议新增

```text
scripts/backup-postgres.sh
scripts/restore-postgres.sh
docs/ops/database-backup.md
```

### 要求

```text
1. 支持手动备份。
2. 支持指定备份目录。
3. 文档说明如何恢复。
4. 不把备份文件提交到 Git。
```

## 任务 039：增加健康检查接口

### 目标

用于部署和监控。

### 建议接口

```text
GET /health
GET /health/db
GET /health/redis
```

### 返回格式

```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "status": "ok"
  }
}
```

## 任务 040：检查所有敏感环境变量

### 目标

确保所有密钥和敏感配置都来自环境变量。

### 必查项

```text
DATABASE_URL
REDIS_URL
JWT_ACCESS_SECRET
JWT_REFRESH_SECRET
DEFAULT_ADMIN_EMAIL
DEFAULT_ADMIN_PASSWORD
ALIPAY_PRIVATE_KEY
WECHAT_PAY_API_V3_KEY
AI_PROVIDER_API_KEY
```

### 禁止

```text
1. 不得在源码中硬编码密钥。
2. 不得提交真实 .env。
3. 不得在日志中输出 API Key、JWT、支付私钥。
```

## 本阶段禁止事项

```text
1. 不要接入真实支付宝。
2. 不要接入真实微信支付。
3. 不要接入真实 AI Provider。
4. 不要新增多语言。
5. 不要实现复杂权限矩阵。
6. 不要实现 RAG 或 Agent。
```

## 验收标准

```text
1. 核心单元测试可运行。
2. e2e 测试覆盖主要业务链路。
3. 登录和高风险接口有限流。
4. 管理员关键操作有日志。
5. 全局请求日志可查看。
6. 服务端错误不会暴露 stack trace。
7. 健康检查接口正常。
8. 敏感配置全部来自环境变量。
```

## 验收命令

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

涉及数据库变更时追加：

```bash
pnpm db:migrate
pnpm db:seed
```
