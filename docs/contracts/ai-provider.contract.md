# AI Provider 契约

## 第一版 Provider 类型

```text
OPENAI_COMPATIBLE
```

## AI Provider 配置

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
```

## AI Model 配置

```text
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

## FastAPI 职责

FastAPI 只负责：

```text
调用模型
返回 output
返回 usage
返回 provider
返回 model
返回 finishReason
返回 errorCode
```

FastAPI 不允许：

```text
直连核心 PostgreSQL
扣点
判断用户权限
处理支付
管理 CMS
```

## API Key 加密

Provider API Key 必须使用 `SECRET_ENCRYPTION_KEY` 加密后存储。

后台列表只能展示掩码，例如：

```text
sk-****abcd
```

禁止在数据库、日志、后台页面中展示完整 API Key。

---

## 点数结算原则

采用：

```text
预冻结 → AI 执行 → 按 usage 结算 → 多余释放
```

失败时：

```text
释放冻结点数
写入 RELEASE 流水
任务标记 FAILED
返回中文错误提示
```

## 计费规则

第一版模型价格以“每 1000 token 扣多少点”记录：

```text
inputPrice
outputPrice
```

如果 Provider 返回 usage：

```text
ceil(inputTokens * inputPrice / 1000 + outputTokens * outputPrice / 1000)
```

如果 Provider 未返回 usage，则使用场景预估点数作为 fallback。实际扣点不得超过任务预冻结点数。
