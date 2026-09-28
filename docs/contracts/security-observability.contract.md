# 安全与可观测性契约

## 日志原则

必须记录：

```text
requestId
method
path
statusCode
duration
userId 或 adminUserId
createdAt
```

不得记录：

```text
明文密码
JWT
Refresh Token
支付私钥
AI Provider API Key
数据库连接串
```

## 错误返回原则

前端只允许看到简体中文友好错误。

禁止向用户返回：

```text
Stack trace
Prisma raw error
SQL raw error
JWT malformed
支付 SDK 原始异常
AI Provider 原始密钥或完整错误体
```

## 限流原则

必须限流的接口：

```text
POST /api/auth/login
POST /api/auth/learner-login
POST /api/auth/register
POST /api/admin-auth/login
POST /api/payment/orders
POST /api/ai/tasks
```

错误提示：

```text
请求过于频繁，请稍后再试。
```

学习账号网页直登由 Web Server Action 转发到 API Core。生产 Nginx 必须覆盖
`X-Real-IP` 和 `X-Forwarded-For`；Web 只接受合法的入口客户端 IP，并以单一
`X-Forwarded-For` 转交 API Core，避免所有网页用户落入同一个容器 IP 限流桶。

## 管理员操作日志

必须记录后台关键写操作，包括：

```text
创建、编辑、删除、发布、下架 CMS 内容
手动调整用户点数
手动补单
禁用或启用用户
修改系统设置
```

## 环境变量

敏感配置必须来自环境变量，不得写入源码：

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

上线前必须配置：

```text
RATE_LIMIT_WINDOW_SECONDS
RATE_LIMIT_AUTH_LOGIN_MAX
RATE_LIMIT_AUTH_LEARNER_LOGIN_MAX
RATE_LIMIT_AUTH_REGISTER_MAX
RATE_LIMIT_AUTH_EMAIL_CODE_MAX
RATE_LIMIT_AUTH_EMAIL_CODE_SUBJECT_MAX
RATE_LIMIT_AUTH_RESET_PASSWORD_MAX
RATE_LIMIT_AUTH_RESET_PASSWORD_SUBJECT_MAX
RATE_LIMIT_ADMIN_AUTH_LOGIN_MAX
RATE_LIMIT_PAYMENT_ORDERS_MAX
RATE_LIMIT_PAYMENT_ORDER_SYNC_MAX
RATE_LIMIT_AI_TASKS_MAX
LOGIN_FAILURE_MAX_ATTEMPTS
LOGIN_FAILURE_WINDOW_SECONDS
LOGIN_FAILURE_LOCK_SECONDS
```
