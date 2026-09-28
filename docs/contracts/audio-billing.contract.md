# 语音计费契约

## AudioPricingRule

```text
AudioPricingRule
- id
- operationType
- model
- billingMode
- creditsPerUnit
- minimumCredits
- modelMultiplier
- isEnabled
- createdAt
- updatedAt
```

## operationType

```text
TTS
VOICE_CLONE
VOICE_DESIGN
```

## billingMode

```text
PER_CHARACTER
PER_TASK
PER_SECOND
```

## 第一版计费建议

```text
语音合成：PER_CHARACTER
声音设计：PER_TASK
声音复刻：PER_TASK
```

## 计费流程

```text
预估点数
创建 AudioTask
创建 CreditReservation
冻结点数
执行语音任务
成功后结算
多余释放
失败后全部释放
```

## 禁止

1. 前端决定扣费金额。
2. 失败任务不退点。
3. 重复请求重复扣点。
4. 绕过 `LedgerEntry`。
5. 绕过 `CreditReservation`。
