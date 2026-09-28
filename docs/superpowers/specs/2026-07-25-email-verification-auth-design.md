# 邮箱验证码注册与找回密码设计

## 目标

邮箱注册必须先完成邮箱验证码校验；忘记密码时，用户通过邮箱验证码重置密码。

## 范围

- 仅修改前台用户邮箱注册与忘记密码流程。
- 邮箱验证码用途包含 `REGISTER` 和 `RESET_PASSWORD`。
- 邮件发送复用后台“邮件短信”里的阿里云 DirectMail 配置。
- 邮件验证未启用或配置不完整时，前台提示“邮箱验证码服务暂不可用，请联系管理员”。
- 不新增默认万能邮箱验证码，不改短信登录、支付、AI、CMS、管理员登录。

## 数据模型

新增 `email_verification_codes` 表：

- `email`：归一化后的邮箱。
- `purpose`：`REGISTER` 或 `RESET_PASSWORD`。
- `codeHash`：验证码哈希，不保存明文验证码。
- `expiresAt`、`consumedAt`：控制有效期和一次性消费。
- `sendProvider`、`sendRequestId`、`sendStatus`：记录邮件发送结果。

## API

- `POST /api/auth/email-code`
  - 入参：`email`、`purpose`。
  - 注册用途要求邮箱未注册。
  - 重置密码用途返回统一成功文案，避免通过接口枚举账号。
- `POST /api/auth/register`
  - 入参新增 `emailCode`。
  - 验证邮箱验证码后创建用户、钱包和登录态。
- `POST /api/auth/reset-password`
  - 入参：`email`、`emailCode`、`password`。
  - 验证邮箱验证码后更新密码，并撤销该用户已有 refresh token。

## 前端

- 注册页邮箱模式新增验证码输入和获取验证码按钮。
- 登录页新增“忘记密码”入口。
- 新增 `/forgot-password` 页面：邮箱、验证码、新密码、确认密码。
- 重置成功后跳转登录页，展示“密码已重置，请重新登录”。

## 安全

- 邮箱验证码发送、注册、重置密码均走限流。
- 验证码 6 位数字，默认有效期复用 `smsCodeTtlSeconds`，否则 300 秒。
- 重置密码成功后撤销旧 refresh token。
