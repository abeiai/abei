# 阶段 15：AI 模型预置与快速接入体系

## 目标

让新开发者部署项目后，只需要在后台填写自己的 API Key，就能快速启用主流 AI Provider 和模型。

本阶段的核心不是“写死某些模型”，而是建立一套可更新、可测试、可启用、可绑定场景的 AI Provider / Model Preset 体系。

---

## 允许修改目录

```text
apps/web/
apps/api-core/
apps/ai-gateway/
packages/database/
packages/config/
docs/
scripts/
```

---

## 本阶段任务

```text
101 重构 AI Provider / Model Preset 数据模型
102 预置主流 Provider
103 预置模型能力标签
104 后台 AI Provider 快速配置页
105 Provider 连接测试
106 模型别名绑定
107 AI 场景绑定默认模型
108 Provider 能力检测
109 模型预置版本管理
110 一键初始化 AI 配置
```

---

## 任务 101：重构 AI Provider / Model Preset 数据模型

### 目标

将现有 AI Provider / Model 配置升级为“预置模板 + 实际启用实例 + 加密凭证 + 模型别名”的结构。

### 推荐模型

```text
AiProviderPreset
AiModelPreset
AiProviderInstance
AiProviderCredential
AiModelInstance
AiModelAlias
AiScenarioModelBinding
```

### AiProviderPreset

```text
id
providerKey
displayName
adapterType
defaultBaseUrl
apiKeyEnvName
docsUrl
region
isBuiltIn
isEnabledByDefault
presetVersion
lastUpdatedAt
createdAt
updatedAt
```

### AiModelPreset

```text
id
providerPresetId
modelKey
displayName
providerModelName
capabilityTags
contextWindow
supportsStreaming
supportsVision
supportsTools
supportsEmbedding
supportsImageGeneration
supportsAudio
isDeprecated
deprecatedMessage
replacementModelKey
recommendedAlias
createdAt
updatedAt
```

### AiProviderInstance

```text
id
providerPresetId
name
baseUrl
status
lastTestedAt
lastTestResult
createdAt
updatedAt
```

### AiProviderCredential

```text
id
providerInstanceId
apiKeyEncrypted
createdAt
updatedAt
```

### AiModelInstance

```text
id
providerInstanceId
modelPresetId
displayName
providerModelName
capabilityTags
isEnabled
createdAt
updatedAt
```

### AiModelAlias

```text
id
aliasKey
displayName
description
modelInstanceId
createdAt
updatedAt
```

### AiScenarioModelBinding

```text
id
scenarioId
defaultModelAlias
fallbackModelAlias
createdAt
updatedAt
```

### 要求

1. 业务代码不得直接依赖 providerModelName。
2. AI 场景必须通过 modelAlias 访问模型。
3. API Key 必须单独加密存储。
4. Preset 与开发者实际启用的 Instance 必须分离。
5. 已有 AI 任务功能不得被破坏。

---

## 任务 102：预置主流 Provider

### 目标

在 seed 中预置主流 Provider，但默认不启用，不包含任何真实 API Key。

### 第一批 Provider

```text
OpenAI
DeepSeek
通义千问 DashScope
Moonshot Kimi
OpenRouter
Anthropic Claude
Google Gemini
自定义 OpenAI-compatible
```

### Adapter 类型

```text
OPENAI_COMPATIBLE
ANTHROPIC
GEMINI
CUSTOM_OPENAI_COMPATIBLE
```

### 要求

1. 所有 Provider 默认未启用。
2. API Key 为空。
3. 可以通过后台填写 API Key。
4. 可以通过后台测试连接。
5. 可以启用 / 禁用 Provider。
6. 自定义 OpenAI-compatible 必须允许开发者填写 baseUrl 和 modelName。

---

## 任务 103：预置模型能力标签

### 目标

为预置模型增加能力标签，便于工具和场景自动判断模型是否可用。

### 推荐能力标签

```text
TEXT
REASONING
VISION
EMBEDDING
IMAGE_GENERATION
AUDIO
TOOLS
STREAMING
LONG_CONTEXT
LOW_COST
CHINA_FRIENDLY
GLOBAL
```

### 要求

1. 能力标签使用数组字段或关联表。
2. 不要只依赖布尔字段。
3. 后台需要展示模型能力。
4. 工具或场景可以根据能力标签过滤模型。

---

## 任务 104：后台 AI Provider 快速配置页

### 路由

```text
/admin/ai/providers
/admin/ai/providers/[id]
```

### 页面功能

```text
查看内置 Provider
填写 API Key
修改 baseUrl
测试连接
启用 / 禁用 Provider
查看可用模型
启用 / 禁用模型
设置默认模型
```

### 中文文案示例

```text
尚未配置 API Key
测试连接
连接成功
连接失败，请检查 API Key 或 Base URL
启用 Provider
禁用 Provider
设为默认聊天模型
设为默认推理模型
```

### 要求

1. 不显示完整 API Key。
2. 保存 API Key 前必须加密。
3. 连接失败要给中文错误提示。
4. Provider 详情页必须显示模型能力标签。

---

## 任务 105：Provider 连接测试

### 接口

```text
POST /admin/ai/providers/:id/test
```

### 测试逻辑

```text
1. 读取 Provider 配置。
2. 解密 API Key。
3. 使用最小 token 请求测试模型。
4. 返回连接成功或中文错误。
5. 不创建用户 AI 任务。
6. 不扣点。
7. 不写入普通用户流水。
```

### 错误提示

```text
API Key 无效
Base URL 无法访问
模型名称错误
Provider 返回错误
连接超时
```

### 要求

1. 测试请求要有超时时间。
2. 错误日志不得输出完整 API Key。
3. 测试结果保存到 Provider Instance。

---

## 任务 106：模型别名绑定

### 目标

业务代码通过模型别名访问模型，而不是直接访问具体模型名。

### 推荐默认别名

```text
default-chat
fast-chat
reasoning
long-context
vision
embedding
image-generation
speech-to-text
text-to-speech
```

### 后台路由

```text
/admin/ai/model-aliases
```

### 要求

1. 管理员可以把别名绑定到已启用模型。
2. 未绑定的别名必须显示“未配置”。
3. 业务场景只能读取别名绑定结果。
4. 如果别名未配置，前端和 API 返回中文提示。

提示示例：

```text
当前未配置默认聊天模型，请在后台 AI 模型设置中完成配置。
```

---

## 任务 107：AI 场景绑定默认模型

### 目标

每个 AI 场景可以绑定默认模型别名和备用模型别名。

### 字段

```text
defaultModelAlias
fallbackModelAlias
```

### 示例

```text
AI 文案生成 → default-chat
AI 深度分析 → reasoning
AI 图片理解 → vision
AI 向量检索 → embedding
```

### 要求

1. 场景绑定的是 alias，不是具体模型名。
2. 场景运行时通过 alias 解析实际模型。
3. 如果 alias 未配置，任务不得继续执行。
4. 错误提示必须为简体中文。

---

## 任务 108：Provider 能力检测

### 目标

根据模型能力标签判断某个场景是否能运行。

### 示例

如果场景需要：

```text
VISION
```

但默认模型不支持，则提示：

```text
当前默认模型不支持视觉理解，请在后台配置支持视觉的模型。
```

### 要求

1. AiScenario 支持 requiredCapabilities。
2. 执行任务前校验模型能力。
3. 后台场景页展示能力要求。
4. 前台工具页展示模型能力不足的中文提示。

---

## 任务 109：模型预置版本管理

### 目标

模型会更新、废弃、迁移，需要有版本和过期提醒。

### 字段

```text
presetVersion
lastUpdatedAt
isDeprecated
deprecatedMessage
replacementModelKey
```

### 后台提醒

```text
该模型可能已过期，建议切换到推荐模型。
```

### 要求

1. 不自动强制替换开发者已启用模型。
2. 只提供提醒和推荐。
3. seed 更新时不得覆盖开发者自定义配置。

---

## 任务 110：一键初始化 AI 配置

### 命令

```bash
pnpm ai:seed-presets
```

### 作用

```text
写入内置 Provider
写入内置模型
写入模型别名
写入默认 AI 场景绑定
```

### 要求

1. 已存在的开发者配置不得被覆盖。
2. 可以重复执行。
3. 输出中文执行结果。
4. 命令失败时给出明确原因。

---

## 本阶段禁止事项

```text
1. 不要做 RAG。
2. 不要做 Agent。
3. 不要做工作流。
4. 不要做多语言。
5. 不要把任何真实 API Key 写入代码。
6. 不要把模型名硬编码到业务逻辑。
7. 不要让 FastAPI 直连核心 PostgreSQL。
8. 不要绕过 NestJS 钱包和权限系统。
```

---

## 验收标准

```text
1. 数据库存在 Provider / Model Preset 体系。
2. seed 能写入主流 Provider。
3. API Key 加密保存。
4. 后台可以填写 API Key。
5. 后台可以测试连接。
6. 后台可以启用 Provider 和模型。
7. 后台可以设置模型别名。
8. AI 场景通过 alias 调用模型。
9. 能力不匹配时返回中文错误。
10. pnpm ai:seed-presets 可以重复执行且不覆盖自定义配置。
```

---

## 验收命令

```bash
pnpm ai:seed-presets
pnpm db:migrate
pnpm db:seed
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

FastAPI 如有独立命令：

```bash
ruff check .
mypy .
pytest
```
