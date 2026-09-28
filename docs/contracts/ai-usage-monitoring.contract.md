# AI 用量与成本统计契约

## 统计指标

```text
总调用次数
成功次数
失败次数
平均延迟
输入 tokens
输出 tokens
总 tokens
消耗点数
估算成本
```

## 统计维度

```text
Provider
Model
AI 场景
AI 工具
用户
日期
```

## 调用日志脱敏

不得记录：

```text
API Key
完整支付信息
敏感密钥
JWT
Refresh Token
```

用户输入和模型输出默认保存：

```text
摘要
截断内容
hash
```

完整内容保存必须有管理员开关。

## 成本说明

所有成本字段默认标注为：

```text
估算
```

不要把估算成本当成真实账单。
