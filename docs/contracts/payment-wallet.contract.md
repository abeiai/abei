# 支付与钱包契约

## 支付方式

第一阶段只支持：

```text
ALIPAY
WECHAT_PAY
```

禁止引入：

```text
STRIPE
PADDLE
PAYPAL
```

---

## 钱包流水类型

```text
TOP_UP
RESERVE
CONSUME
RELEASE
REFUND
ADMIN_ADJUST
```

---

## 幂等

所有支付回调必须幂等。

同一个订单重复收到支付成功回调时：

1. 订单只能从未支付变为已支付一次。
2. 点数只能增加一次。
3. TOP_UP 流水只能写入一次。

---

## 真实支付回调

支付宝回调必须校验 RSA2 签名、应用编号、渠道订单号、本地订单号和支付金额。

微信支付回调必须校验 API v3 通知签名，使用 APIv3 Key 解密 resource，并校验渠道订单号、本地订单号和支付金额。

回调处理要求：

1. 验签失败不得入账。
2. 金额不一致不得入账。
3. 支付渠道与本地订单不一致不得入账。
4. 已关闭或失败订单不得入账。
5. 每次回调写入 `PaymentNotifyLog`，但不得写入支付私钥、APIv3 Key 或 JWT Secret。

---

## 后台同步与补单

后台可以查看支付订单列表、订单详情和最近回调日志。

`POST /admin/payments/:id/sync` 用于查询渠道真实状态并刷新本地订单状态。

`POST /admin/payments/:id/supplement` 只能在渠道查询结果为已支付时执行补单；补单成功后必须写入管理员操作日志。

---

## 第一阶段范围

第一阶段只做点数充值，不做订阅自动续费、退款、发票、分账和多币种。
