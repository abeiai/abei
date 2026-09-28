# 阶段 5：AI 任务与点数消耗预留

## 目标

建立 AI 任务和点数消耗的基础框架。

本阶段不追求复杂 Agent、RAG、多模型路由。  
第一版只需要支持一个简单文本生成场景，并完成点数冻结、结算、失败释放的基本闭环。

---

## 允许修改目录

```text
apps/web/
apps/api-core/
apps/ai-gateway/
packages/database/
```

---

## 数据模型

### AiScenario

```text
id
name
slug
description
promptTemplate
costCredits
isEnabled
createdAt
updatedAt
```

### AiTask

```text
id
userId
scenarioId
status
input
output
errorMessage
estimatedCredits
actualCredits
createdAt
updatedAt
finishedAt
```

状态：

```text
CREATED
RESERVED
RUNNING
SUCCEEDED
FAILED
CANCELLED
COMPENSATED
```

### CreditReservation

```text
id
userId
taskId
amount
status
idempotencyKey
createdAt
updatedAt
expiresAt
```

状态：

```text
RESERVED
SETTLED
RELEASED
EXPIRED
FAILED
```

---

## 扣点流程

采用：

```text
预冻结 + 实际结算 + 失败释放
```

流程：

1. 用户提交 AI 请求。
2. NestJS 创建 AiTask。
3. NestJS 检查余额。
4. NestJS 冻结预计点数。
5. NestJS 调用 FastAPI 或 mock provider。
6. 成功后写入输出结果。
7. 成功后结算实际点数。
8. 多余冻结释放。
9. 失败后释放冻结点数。
10. 前端展示成功或失败提示。

---

## FastAPI 约束

FastAPI 第一版可以只实现：

```text
GET  /health
POST /v1/text/generate
```

FastAPI 不允许：

1. 直连核心 PostgreSQL。
2. 直接扣点。
3. 判断用户权限。
4. 处理支付。
5. 管理 CMS 内容。

---

## API 需求

```text
GET  /ai/scenarios
POST /ai/tasks
GET  /ai/tasks/:id
```

第一版可以只做一个场景：

```text
AI 文案生成
```

---

## 前端页面

建议新增：

```text
/dashboard/ai
```

页面内容：

1. 当前点数余额
2. AI 场景选择
3. 输入框
4. 生成按钮
5. 生成结果
6. 失败提示

失败提示示例：

```text
生成失败，冻结点数已自动释放，请稍后重试。
```

---

## 禁止事项

本阶段禁止实现：

1. 复杂 Agent
2. RAG 知识库
3. 多模型自动路由
4. 工作流编排
5. 图片生成
6. 视频生成
7. 音频生成
8. 文件解析
9. 长任务队列复杂编排

---

## 验收标准

1. 用户有点数时可以提交 AI 请求。
2. 提交请求后创建 AiTask。
3. 提交请求后冻结点数。
4. 成功生成后结算点数。
5. 失败后释放冻结点数。
6. 钱包流水记录 RESERVE / CONSUME / RELEASE。
7. 前端展示生成结果或中文失败提示。
8. FastAPI 不直连核心 PostgreSQL。

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
