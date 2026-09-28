# AI 模型预置契约

## 核心原则

业务代码不得直接依赖具体模型名。  
业务场景必须通过 `modelAlias` 访问模型。

错误示例：

```text
直接在业务代码中调用 gpt-xxx、deepseek-xxx、qwen-xxx
```

正确示例：

```text
AI 文案生成 → default-chat
AI 深度分析 → reasoning
AI 图片理解 → vision
AI 向量检索 → embedding
```

---

## Provider Preset

```text
AiProviderPreset
- id
- providerKey
- displayName
- adapterType
- defaultBaseUrl
- apiKeyEnvName
- docsUrl
- region
- isBuiltIn
- isEnabledByDefault
- presetVersion
- lastUpdatedAt
- createdAt
- updatedAt
```

## Model Preset

```text
AiModelPreset
- id
- providerPresetId
- modelKey
- displayName
- providerModelName
- capabilityTags
- contextWindow
- supportsStreaming
- supportsVision
- supportsTools
- supportsEmbedding
- supportsImageGeneration
- supportsAudio
- isDeprecated
- deprecatedMessage
- replacementModelKey
- recommendedAlias
- createdAt
- updatedAt
```

## Provider Instance

```text
AiProviderInstance
- id
- providerPresetId
- name
- baseUrl
- status
- lastTestedAt
- lastTestResult
- createdAt
- updatedAt
```

## Credential

```text
AiProviderCredential
- id
- providerInstanceId
- apiKeyEncrypted
- createdAt
- updatedAt
```

## Model Alias

```text
AiModelAlias
- id
- aliasKey
- displayName
- description
- modelInstanceId
- createdAt
- updatedAt
```

---

## 默认别名

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

---

## 能力标签

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

---

## API Key 安全

1. 不得明文存储 API Key。
2. 不得在日志中输出 API Key。
3. 不得在后台完整显示 API Key。
4. 不得把 API Key 写入 seed。
5. 不得把 API Key 写入 README 示例。
