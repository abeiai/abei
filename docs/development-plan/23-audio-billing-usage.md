# 阶段 23：语音计费与扣费

## 目标

建立语音合成、声音设计、声音复刻的独立计费规则，并与现有 `Wallet` / `LedgerEntry` / `CreditReservation` 打通。

语音能力必须支持预估点数、预冻结、成功结算、失败释放和用量统计。

## 允许修改目录

```text
apps/web/
apps/api-core/
packages/database/
docs/
```

如涉及 FastAPI 返回 usage，可修改：

```text
apps/ai-gateway/
```

## 本阶段任务

```text
141 语音计费规则表
142 语音任务预冻结与结算
143 语音用量统计
```

## 任务 141：语音计费规则表

### 推荐模型

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

### operationType

```text
TTS
VOICE_CLONE
VOICE_DESIGN
```

### billingMode

```text
PER_CHARACTER
PER_TASK
PER_SECOND
```

### 推荐第一版规则

```text
语音合成：按字符数计费
声音设计：按任务次数计费
声音复刻：按任务次数计费
```

### 要求

1. 支持后台配置。
2. 支持最低扣费。
3. 支持模型倍率。
4. 支持禁用某条规则。
5. 没有可用规则时不得执行任务。
6. 返回中文错误提示。

## 任务 142：语音任务预冻结与结算

### 流程

```text
用户提交语音任务
后端计算预计点数
创建 AudioTask
创建 CreditReservation
冻结用户点数
调用 FastAPI / 阿里云
成功后计算实际点数
写入 CONSUME 流水
多余冻结释放
失败时释放全部冻结点数
```

### 要求

1. 不允许前端传入实际扣点。
2. 扣点以后端规则为准。
3. 重试不得重复扣点。
4. 失败必须释放冻结点数。
5. `LedgerEntry` 必须关联 `AudioTask`。
6. 所有错误提示为简体中文。

### 可复用流水类型

推荐继续使用：

```text
RESERVE
CONSUME
RELEASE
```

但必须增加：

```text
relatedTaskType: AUDIO
relatedTaskId
operationType
```

## 任务 143：语音用量统计

### 推荐模型

```text
AudioUsageLog
- id
- taskId
- userId
- provider
- model
- operationType
- characterCount
- audioDurationMs
- usageCount
- latencyMs
- success
- estimatedCost
- consumedCredits
- providerRequestId
- createdAt
```

### 统计维度

```text
按日期
按用户
按模型
按操作类型
按音色
按任务状态
```

### 后台展示

```text
语音合成次数
声音设计次数
声音复刻次数
合成字符数
生成音频总时长
消耗点数
估算成本
失败率
```

## 本阶段禁止事项

```text
不允许前端决定扣费金额
不允许失败任务扣点不退
不允许重复回调重复扣点
不接入新的支付方式
不做订阅自动续费
```

## 验收标准

```text
后台可以配置语音计费规则
语音合成按字符数预估和结算
声音设计按任务计费
声音复刻按任务计费
失败任务自动释放冻结点数
语音任务流水可以查询
语音用量统计可查看
重复请求不会重复扣点
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
