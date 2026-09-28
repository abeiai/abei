# 阶段 4：支付订单与钱包流水预留

## 目标

建立面向中国市场的点数充值基础模型。

第一版只支持：

```text
支付宝
微信支付
```

第一版可以先完成数据模型、接口占位、订单状态流转和钱包入账逻辑。  
真实支付 SDK 接入可以后置，但不得引入 Stripe、Paddle 等国际支付字段。

---

## 允许修改目录

```text
apps/web/
apps/api-core/
packages/database/
```

---

## 支付方式枚举

```text
ALIPAY
WECHAT_PAY
```

禁止出现：

```text
STRIPE
PADDLE
PAYPAL
APPLE_PAY
GOOGLE_PAY
```

---

## 数据模型

### PaymentOrder

```text
id
userId
provider
orderNo
amountCny
credits
status
providerTradeNo
notifyRaw
paidAt
createdAt
updatedAt
```

状态：

```text
CREATED
PAYING
PAID
CLOSED
FAILED
```

### Wallet

```text
id
userId
availableCredits
frozenCredits
totalTopUpCredits
totalConsumedCredits
createdAt
updatedAt
```

### LedgerEntry

```text
id
userId
type
amount
balanceAfter
relatedOrderId
relatedTaskId
idempotencyKey
note
createdAt
```

流水类型：

```text
TOP_UP
RESERVE
CONSUME
RELEASE
REFUND
ADMIN_ADJUST
```

---

## API 需求

```text
GET  /wallet/me
GET  /wallet/ledger

POST /payment/orders
GET  /payment/orders/:id
POST /payment/alipay/notify
POST /payment/wechat/notify
```

第一版支付订单创建可以返回 mock 二维码地址或占位支付链接。

---

## 前端页面

建议新增：

```text
/dashboard/billing
```

页面内容：

1. 当前点数余额
2. 充值套餐
3. 选择支付宝 / 微信支付
4. 订单状态展示
5. 充值流水表格

所有文字必须使用简体中文。

---

## 幂等要求

支付回调必须具备幂等能力。

同一个支付订单多次收到成功回调时：

1. 只能入账一次。
2. 只能写入一条充值流水。
3. 不得重复增加用户点数。

---

## 禁止事项

本阶段禁止实现：

1. Stripe
2. Paddle
3. PayPal
4. 国际支付
5. 多币种
6. 自动续费订阅
7. 发票系统
8. 退款系统
9. 分账系统

---

## 验收标准

1. 用户可以查看钱包余额。
2. 用户可以创建充值订单。
3. 订单可以进入 PAID 状态。
4. 订单支付成功后增加点数。
5. 钱包流水出现 TOP_UP 记录。
6. 重复支付回调不会重复入账。
7. 页面和提示均为简体中文。

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
