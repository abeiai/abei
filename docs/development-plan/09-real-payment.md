# 阶段 9：真实支付宝 / 微信支付接入

## 目标

在已有 Mock 支付和钱包闭环基础上，接入真实支付宝和微信支付。

本阶段只做点数充值，不做订阅、退款、发票、分账。

## 允许修改目录

```text
apps/web/
apps/api-core/
packages/database/
packages/config/
docs/
```

## 本阶段任务

```text
051 接入支付宝沙箱支付
052 接入支付宝正式支付
053 接入微信支付 Native 扫码
054 接入微信支付回调验签
055 支付异常重试与订单对账
056 支付后台订单列表
057 手动补单功能
058 支付日志查看
```

## 支付方式限制

只允许：

```text
ALIPAY
WECHAT_PAY
```

禁止：

```text
STRIPE
PADDLE
PAYPAL
APPLE_PAY
GOOGLE_PAY
```

## 任务 051：接入支付宝沙箱支付

### 要求

```text
1. 使用后端订单金额，不信任前端金额。
2. 支付回调必须验签。
3. 支付成功后更新订单状态为 PAID。
4. 支付成功后增加用户点数。
5. 支付成功后写入 TOP_UP 流水。
6. 重复回调不得重复入账。
```

### 环境变量

```text
ALIPAY_APP_ID
ALIPAY_PRIVATE_KEY
ALIPAY_PUBLIC_KEY
ALIPAY_NOTIFY_URL
```

## 任务 052：接入支付宝正式支付

### 要求

```text
1. 沙箱和正式环境可通过配置切换。
2. 不得硬编码网关地址和密钥。
3. 文档说明如何配置正式支付宝应用。
4. 保留沙箱调试说明。
```

## 任务 053：接入微信支付 Native 扫码

### 要求

```text
1. 创建微信支付订单。
2. 返回二维码链接。
3. 前端展示二维码。
4. 用户支付后等待回调。
5. 前端轮询订单状态。
```

### 环境变量

```text
WECHAT_PAY_MCH_ID
WECHAT_PAY_APP_ID
WECHAT_PAY_API_V3_KEY
WECHAT_PAY_PRIVATE_KEY
WECHAT_PAY_SERIAL_NO
WECHAT_PAY_NOTIFY_URL
```

## 任务 054：接入微信支付回调验签

### 要求

```text
1. 校验微信支付签名。
2. 解密回调资源。
3. 校验订单金额。
4. 校验商户订单号。
5. 幂等更新订单状态。
6. 幂等写入钱包流水。
```

## 任务 055：支付异常重试与订单对账

### 建议接口

```text
POST /admin/payments/:id/sync
```

### 要求

```text
1. 管理员可手动刷新订单状态。
2. 后端向支付渠道查询订单真实状态。
3. 如果已支付但本地未入账，执行补单。
4. 补单必须幂等。
```

## 任务 056：支付后台订单列表

### 推荐路由

```text
/admin/payments
/admin/payments/[id]
```

### 列表字段

```text
订单号
用户
支付渠道
金额
点数
订单状态
支付时间
创建时间
```

## 任务 057：手动补单功能

### 要求

```text
1. 只有管理员可操作。
2. 必须记录管理员操作日志。
3. 补单必须校验支付渠道真实状态。
4. 不允许管理员随意把未支付订单改为已支付。
5. 补单后写入钱包流水。
```

## 任务 058：支付日志查看

### 推荐模型

```text
PaymentNotifyLog
- id
- provider
- orderNo
- headers
- body
- verifyResult
- processResult
- errorMessage
- createdAt
```

### 注意

不得记录支付私钥和敏感密钥。

## 本阶段禁止事项

```text
1. 不做退款。
2. 不做分账。
3. 不做发票。
4. 不做自动续费订阅。
5. 不做多币种。
6. 不引入 Stripe / Paddle。
```

## 验收标准

```text
1. 支付宝沙箱可创建订单。
2. 支付宝支付成功后用户点数增加。
3. 支付宝重复回调不会重复入账。
4. 微信支付 Native 可创建订单。
5. 微信支付成功后用户点数增加。
6. 微信重复回调不会重复入账。
7. 后台可以查看支付订单。
8. 后台可以查看支付回调日志。
9. 管理员手动补单有操作日志。
10. 所有金额和点数以后端订单为准。
```

## 验收命令

```bash
pnpm db:migrate
pnpm db:seed
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```
