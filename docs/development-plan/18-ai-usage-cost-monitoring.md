# 阶段 18：模型调用监控与成本统计

## 目标

让系统能够统计 AI 模型调用、失败率、延迟、token、点数消耗和估算成本。

AI SaaS 底座必须让开发者和运营者知道模型到底花了多少钱、哪里失败最多、哪个工具最常用。

---

## 允许修改目录

```text
apps/web/
apps/api-core/
apps/ai-gateway/
packages/database/
docs/
```

---

## 本阶段任务

```text
120 模型调用统计
121 模型成本看板
122 异常告警预留
123 模型调用日志脱敏
```

---

## 任务 120：模型调用统计

### 目标

记录并聚合 AI 调用数据。

### 统计指标

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

### 统计维度

```text
按 Provider
按 Model
按 AI 场景
按 AI 工具
按用户
按日期
```

### 推荐模型

```text
AiUsageDailyStat
- id
- date
- providerId
- modelId
- scenarioId
- toolId
- userId
- requestCount
- successCount
- failureCount
- inputTokens
- outputTokens
- totalTokens
- consumedCredits
- estimatedCost
- avgLatencyMs
- createdAt
- updatedAt
```

### 要求

1. 统计任务可重复执行。
2. 不重复累计。
3. 原始调用日志和聚合统计分离。
4. 估算成本允许为空或延迟计算。

---

## 任务 121：模型成本看板

### 路由

```text
/admin/ai/usage
```

### 展示内容

```text
今日调用量
今日消耗点数
今日估算成本
失败率
平均延迟
最常用模型
最耗费模型
最常用工具
最近 7 天调用趋势
```

### 要求

1. 数据为空时显示友好空状态。
2. 支持按日期范围筛选。
3. 支持按 Provider / Model 筛选。
4. 所有金额和成本字段标注“估算”。

---

## 任务 122：异常告警预留

### 目标

先不接短信或企业微信，也要在后台展示异常提醒。

### 告警类型

```text
Provider 不可用
模型调用失败率过高
模型调用延迟过高
估算成本过高
用户点数异常消耗
支付入账异常
```

### 推荐模型

```text
SystemAlert
- id
- type
- level
- title
- message
- status
- relatedResourceType
- relatedResourceId
- createdAt
- resolvedAt
```

### 要求

1. 后台首页显示未处理告警。
2. 管理员可以标记为已处理。
3. 告警信息使用简体中文。
4. 不发送外部通知，外部通知后续再做。

---

## 任务 123：模型调用日志脱敏

### 目标

避免日志中保存过多用户隐私或敏感信息。

### 要求

1. API Key 不得进入日志。
2. 用户输入和模型输出默认只保存摘要或截断内容。
3. 管理员可以配置是否保存完整内容。
4. 保存完整内容时必须有明确开关。
5. 日志展示页面必须提示数据保存策略。

### 推荐字段

```text
inputPreview
outputPreview
inputHash
outputHash
saveFullContent
```

---

## 本阶段禁止事项

```text
1. 不做短信告警。
2. 不做企业微信告警。
3. 不做复杂 BI 系统。
4. 不导出用户敏感完整内容。
5. 不在日志中保存 API Key。
```

---

## 验收标准

```text
1. AI 调用数据能被统计。
2. 后台可以查看模型用量。
3. 后台可以查看估算成本。
4. 失败率和延迟可以展示。
5. 系统告警可以生成和处理。
6. AI 调用日志默认脱敏。
7. 日志中不出现 API Key。
```

---

## 验收命令

```bash
pnpm db:migrate
pnpm db:seed
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```
