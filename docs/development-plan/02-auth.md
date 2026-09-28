# 阶段 2：用户与管理员认证

## 目标

实现前台用户注册登录，以及后台管理员登录。

本阶段结束后：

1. 前台用户可以注册、登录、退出。
2. 管理员可以登录后台、退出。
3. 未登录管理员访问 `/admin` 会跳转到 `/admin/login`。
4. CMS 写接口必须要求管理员身份。

---

## 允许修改目录

```text
apps/web/
apps/api-core/
packages/database/
```

---

## 数据模型

建议使用独立模型：

```text
User
AdminUser
RefreshToken
```

### User

```text
id
email
passwordHash
nickname
status
createdAt
updatedAt
```

### AdminUser

```text
id
email
passwordHash
name
role
status
createdAt
updatedAt
```

管理员角色第一阶段只需要：

```text
SUPER_ADMIN
```

### RefreshToken

```text
id
userId
adminUserId
tokenHash
type
expiresAt
createdAt
revokedAt
```

---

## API 需求

### 前台用户

```text
POST /auth/register
POST /auth/login
POST /auth/logout
GET  /auth/me
```

### 后台管理员

```text
POST /admin-auth/login
POST /admin-auth/logout
GET  /admin-auth/me
```

---

## 前端需求

### 前台

```text
/login
/register
/dashboard
```

要求：

1. 登录成功后跳转 `/dashboard`。
2. 注册成功后可自动登录或跳转登录页。
3. 登录失败显示中文错误提示。
4. 退出登录后回到首页或登录页。

### 后台

```text
/admin/login
/admin
```

要求：

1. 管理员登录成功后跳转 `/admin`。
2. 未登录访问 `/admin` 下页面，跳转 `/admin/login`。
3. 管理员退出后跳转 `/admin/login`。

---

## 安全要求

1. 密码必须哈希存储。
2. JWT Secret 必须来自环境变量。
3. 不得明文存储密码。
4. 不得把默认管理员密码硬编码到源码中。
5. seed 创建默认管理员时从环境变量读取账号密码。

---

## 禁止事项

本阶段禁止实现：

1. 手机号登录
2. 短信验证码
3. 邮箱验证码
4. OAuth
5. 微信登录
6. 魔法链接
7. 多因子认证
8. 复杂管理员权限矩阵

---

## 验收标准

1. 用户可以注册。
2. 用户可以登录。
3. 用户可以退出。
4. 管理员可以登录。
5. 管理员可以退出。
6. 未登录不能访问后台。
7. 所有错误提示为简体中文。
8. seed 可以生成默认管理员。

---

## 验收命令

```bash
pnpm db:migrate
pnpm db:seed
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm dev
```
