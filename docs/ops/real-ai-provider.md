# 真实 AI Provider 接入说明

本阶段只接入 OpenAI-compatible 文本生成 Provider，不做 RAG、Agent、多模型自动路由、图片、音频、视频或文件解析。

## 环境变量

必须配置加密密钥：

```text
SECRET_ENCRYPTION_KEY
```

该值至少 32 个字符，用于加密数据库中的 Provider API Key。生产环境丢失或更换该值会导致已保存的 API Key 无法解密。

可选 seed 变量：

```text
AI_PROVIDER_NAME
AI_PROVIDER_BASE_URL
AI_PROVIDER_MODEL_DISPLAY_NAME
AI_PROVIDER_MODEL_NAME
AI_PROVIDER_API_KEY
AI_PROVIDER_INPUT_PRICE
AI_PROVIDER_OUTPUT_PRICE
AI_PROVIDER_TEMPERATURE
AI_PROVIDER_MAX_TOKENS
AI_GATEWAY_TIMEOUT_MS
```

如果不通过 seed 配置，也可以登录后台：

```text
/admin/ai-providers
```

## FastAPI 接口

NestJS 调用 AI Gateway：

```text
POST /v1/text/generate
```

请求包含：

```text
baseUrl
apiKey
modelName
messages 或 prompt
temperature
maxTokens
```

AI Gateway 只负责调用 OpenAI-compatible `/chat/completions` 并返回：

```text
output
usage
provider
model
finishReason
errorCode
requestId
latencyMs
```

AI Gateway 不直连核心 PostgreSQL，不处理用户鉴权、钱包扣点、支付或 CMS。

## 点数结算

后台模型价格按“每 1000 token 扣多少点”记录：

```text
inputPrice
outputPrice
```

Provider 返回 usage 时按输入和输出 token 计算实际消耗；未返回 usage 时使用场景预估点数。实际消耗不会超过任务预冻结点数，多余冻结点数自动释放。

## 运维页面

```text
/admin/ai-tasks
/admin/ai-tasks/[id]
```

任务详情展示任务状态、输入摘要、输出摘要、usage、冻结点数、实际消耗和调用日志。调用日志不保存完整 prompt，也不保存 API Key。
