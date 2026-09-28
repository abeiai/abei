# 真实支付接入说明

本阶段只接入点数充值，支付渠道限定为支付宝和微信支付。不实现订阅续费、退款、发票、分账、多币种或国际支付。

## 后台配置

后台入口：

```text
/admin/payment-config
```

支付宝必填参数：

```text
AppID
运行环境（正式环境 / 沙箱环境）
应用私钥
支付宝公钥
异步通知地址
```

支付宝可选参数：

```text
同步返回地址
```

微信支付必填参数：

```text
AppID
商户号
APIv3 密钥
商户 API 私钥
商户证书序列号
通知地址
微信支付公钥
微信支付公钥 ID
```

微信内 JSAPI 场景还需要：

```text
公众平台 AppSecret
JSAPI 授权回调地址
```

后台会先校验参数完整性，再允许正式启用支付方式。只有“已配置且已启用”的场景能力才会出现在前台充值页。

## 场景路由

```text
PC 浏览器
  支付宝 -> 电脑网站支付
  微信支付 -> Native 扫码支付

手机浏览器
  支付宝 -> 手机网站支付
  微信支付 -> H5 支付

微信内浏览器
  微信支付 -> JSAPI 支付
```

微信支付 Native 下单返回 `code_url`，前台会渲染二维码；H5 下单返回 `h5_url`，前台直接跳转；JSAPI 下单需要用户已完成微信授权并取得 OpenID。`APIv3 密钥` 必须是 32 字节。

## 回调地址

生产环境回调地址示例：

```text
https://example.com/api/payment/alipay/notify
https://example.com/api/payment/wechat/notify
https://example.com/api/payment/wechat/jsapi/callback
```

回调处理要求：

1. 先验签，再入账。
2. 支付渠道、订单号、金额必须和本地订单一致。
3. 支付成功只允许入账一次。
4. 每次回调写入 `PaymentNotifyLog`。

## 后台运维

后台入口：

```text
/admin/payment-config
/admin/payments
```

可执行操作：

```text
同步：查询支付渠道状态并刷新本地订单。
补单：只有渠道返回已支付时才允许补单，并写入管理员操作日志。
```

## 运行环境

当前真实支付参数统一由后台保存。以下环境变量仅保留为运行时特殊覆盖项：

```text
ALIPAY_GATEWAY_URL
WECHAT_PAY_GATEWAY_URL
```

支付宝默认调用正式网关；如果在后台选择“沙箱环境”，会调用支付宝沙箱网关。
`ALIPAY_GATEWAY_URL` 可作为特殊覆盖项，优先级高于后台选择的环境。
微信支付默认调用正式网关，`WECHAT_PAY_GATEWAY_URL` 可作为特殊覆盖项。

## 本地演示

只有本地或演示环境可以启用模拟回调：

```text
ENABLE_MOCK_PAYMENT_NOTIFY=1
```

生产环境必须保持为空，避免绕过支付渠道验签。
