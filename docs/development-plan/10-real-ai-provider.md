# 阶段 10：真实 AI Provider 接入

## 目标

在已有 Mock AI 任务与点数闭环基础上，接入第一个真实 AI Provider。

第一版只接入 OpenAI-compatible Provider，不做复杂多模型路由、RAG、Agent。

## 允许修改目录

```text
apps/web/
apps/api-core/
apps/ai-gateway/
packages/database/
packages/config/
docs/
```

## 本阶段任务

```text
059 AI Provider 配置模型
060 API Key 加密存储
061 FastAPI 接入 OpenAI-compatible provider
062 NestJS 调用 FastAPI
063 返回 usage
064 根据 usage 计算实际点数
065 AI 调用失败自动释放冻结点数
066 AI 调用日志
067 AI 任务后台列表
068 AI 任务详情页
```

## 任务 059：AI Provider 配置模型

### 推荐模型

```text
AiProvider
- id
- name
- type
- baseUrl
- apiKeyEncrypted
- isEnabled
- createdAt
- updatedAt

AiModel
- id
- providerId
- displayName
- modelName
- supportsStreaming
- supportsVision
- inputPrice
- outputPrice
- isEnabled
- createdAt
- updatedAt
```

### 第一版 Provider Type

```text
OPENAI_COMPATIBLE
```

## 任务 060：API Key 加密存储

### 要求

```text
1. API Key 不得明文存储。
2. 加密密钥来自环境变量。
3. 日志中不得输出 API Key。
4. 后台列表不得显示完整 API Key。
```

环境变量示例：

```text
SECRET_ENCRYPTION_KEY
```

## 任务 061：FastAPI 接入 OpenAI-compatible provider

### 接口

```text
POST /v1/text/generate
```

### 请求参数

```text
baseUrl
apiKey
modelName
messages 或 prompt
temperature
maxTokens
```

### 返回

```text
output
usage
provider
model
finishReason
errorCode
```

### 注意

FastAPI 不直连核心 PostgreSQL。

## 任务 062：NestJS 调用 FastAPI

### 要求

```text
1. NestJS 读取 AI 场景和模型配置。
2. NestJS 创建 AiTask。
3. NestJS 冻结点数。
4. NestJS 调用 FastAPI。
5. NestJS 根据结果结算或释放点数。
```

## 任务 063：返回 usage

### usage 字段

```text
inputTokens
outputTokens
totalTokens
```

如果 provider 未返回 usage，必须有 fallback 策略。

## 任务 064：根据 usage 计算实际点数

### 要求

```text
1. 支持按 inputTokens 和 outputTokens 计算成本。
2. 支持最低扣点。
3. 支持场景固定扣点 fallback。
4. 计算逻辑必须有单元测试。
```

## 任务 065：AI 调用失败自动释放冻结点数

### 失败场景

```text
1. FastAPI 超时
2. Provider 5xx
3. Provider 返回错误
4. Provider 无效 API Key
5. 模型不存在
6. 网络错误
```

### 要求

```text
1. AiTask 标记为 FAILED。
2. CreditReservation 标记为 RELEASED 或 FAILED。
3. 钱包 frozenCredits 减少。
4. availableCredits 恢复。
5. 写入 RELEASE 流水。
6. 前端显示中文提示。
```

## 任务 066：AI 调用日志

### 推荐模型

```text
AiCallLog
- id
- taskId
- provider
- model
- requestId
- inputTokens
- outputTokens
- latencyMs
- success
- errorCode
- errorMessage
- createdAt
```

### 禁止

不得记录用户敏感输入的完整内容，除非已有明确数据策略。

## 任务 067：AI 任务后台列表

### 推荐路由

```text
/admin/ai-tasks
```

### 列表字段

```text
任务 ID
用户
场景
状态
模型
消耗点数
创建时间
完成时间
```

## 任务 068：AI 任务详情页

### 推荐路由

```text
/admin/ai-tasks/[id]
```

### 展示内容

```text
任务状态
输入摘要
输出摘要
使用模型
usage
冻结点数
实际消耗
错误信息
调用日志
```

## 本阶段禁止事项

```text
1. 不做 RAG。
2. 不做 Agent。
3. 不做多模型自动路由。
4. 不做图片生成。
5. 不做音频生成。
6. 不做视频生成。
7. 不做文件解析。
```

## 验收标准

```text
1. 后台可以配置 OpenAI-compatible provider。
2. API Key 加密存储。
3. FastAPI 可以调用真实模型。
4. NestJS 可以创建真实 AI 任务。
5. 成功任务能按 usage 结算点数。
6. 失败任务能释放冻结点数。
7. 后台可以查看 AI 任务列表。
8. 后台可以查看 AI 任务详情。
9. 日志中不出现完整 API Key。
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

FastAPI 目录如有独立命令，也需运行：

```bash
ruff check .
mypy .
pytest
```
