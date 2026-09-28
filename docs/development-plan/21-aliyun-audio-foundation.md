# 阶段 21：阿里云语音能力底座

## 目标

接入阿里云百炼 / DashScope 语音能力，为语音合成、声音设计、声音复刻建立后端基础。

本阶段只做后端底座、Provider Preset、模型预置、对象存储和 AudioTask 状态机，暂时不开放完整前台语音复刻页面。

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

## 本阶段任务

```text
131 新增阿里云语音 Provider Preset
132 预置 CosyVoice / Sambert 模型
133 实现 DashScope Audio Adapter
134 对象存储接入语音文件
135 语音任务状态机
```

## 任务 131：新增阿里云语音 Provider Preset

### 目标

在现有 AI Provider Preset 体系中增加阿里云语音 Provider。

### Provider Preset

```text
providerKey: aliyun_dashscope_audio
displayName: 阿里云百炼语音
adapterType: DASHSCOPE_AUDIO
apiKeyEnvName: DASHSCOPE_API_KEY
modality: AUDIO
region: cn-beijing / intl-singapore
```

### 后台配置项

```text
API Key
地域
HTTP Base URL
WebSocket URL
是否启用
连接测试
```

### 要求

1. 默认不启用。
2. 不写入真实 API Key。
3. API Key 支持后台加密配置。
4. 支持从环境变量读取 `DASHSCOPE_API_KEY`。
5. 支持北京地域和新加坡地域配置。
6. Provider 测试连接不扣点、不创建用户任务。

## 任务 132：预置 CosyVoice / Sambert 模型

### 推荐预置模型

```text
cosyvoice-v3.5-plus
cosyvoice-v3.5-flash
cosyvoice-v3-plus
cosyvoice-v3-flash
cosyvoice-v2
cosyvoice-v1
sambert
```

### 推荐模型别名

```text
tts-default
tts-fast
voice-clone-default
voice-design-default
audio-preview
```

### 推荐能力标签

```text
TTS
VOICE_CLONE
VOICE_DESIGN
STREAMING_TTS
SYSTEM_VOICE
CUSTOM_VOICE
TIMESTAMP
SSML
INSTRUCT
MULTILINGUAL
CHINA_MAINLAND
INTERNATIONAL
```

### 要求

1. 不得把具体模型名写死在业务逻辑中。
2. 业务层通过模型别名调用。
3. 声音设计和声音复刻创建的 `voice_id` 必须记录 `targetModel`。
4. 语音合成使用自定义音色时，必须校验合成模型与 `targetModel` 匹配。

## 任务 133：实现 DashScope Audio Adapter

### 推荐文件

```text
apps/ai-gateway/app/audio_gateway/providers/dashscope_audio_adapter.py
```

### 统一接口

```text
test_connection()
create_cloned_voice()
create_designed_voice()
query_voice()
delete_voice()
synthesize_speech()
stream_synthesize_speech()
```

### 内部 API 建议

```text
GET  /audio/health
POST /audio/providers/dashscope/test
POST /audio/voices/clone
POST /audio/voices/design
GET  /audio/voices/:providerVoiceId
DELETE /audio/voices/:providerVoiceId
POST /audio/tts
```

### 要求

1. FastAPI 不直连核心 PostgreSQL。
2. FastAPI 不扣点。
3. FastAPI 不判断用户权限。
4. FastAPI 不保存用户任务状态。
5. FastAPI 只返回 provider 结果、usage、错误摘要。
6. 所有错误必须转换为可被 NestJS 处理的结构化错误。

## 任务 134：对象存储接入语音文件

### 文件类型

```text
SOURCE_SAMPLE
PREVIEW
TTS_OUTPUT
```

### 推荐模型

```text
AudioAsset
- id
- userId
- type
- storageProvider
- url
- objectKey
- mimeType
- durationMs
- sizeBytes
- sampleRate
- channels
- createdAt
```

### 要求

1. 用户上传的声音样本必须进入对象存储。
2. 推荐使用私有 Bucket。
3. 提供临时签名 URL 给阿里云接口访问。
4. 不长期公开用户声音样本。
5. 支持删除文件。
6. 记录音频时长、大小、格式等基础元数据。
7. 限制上传格式和文件大小。

## 任务 135：语音任务状态机

### 推荐模型

```text
AudioTask
- id
- userId
- type
- status
- provider
- model
- voiceAssetId
- inputText
- inputTextLength
- sourceAudioAssetId
- outputAudioAssetId
- estimatedCredits
- actualCredits
- errorCode
- errorMessage
- requestId
- createdAt
- updatedAt
- finishedAt
```

### 任务类型

```text
TTS
VOICE_CLONE
VOICE_DESIGN
```

### 状态

```text
CREATED
RESERVED
UPLOADING
PROCESSING
SUCCEEDED
FAILED
CANCELLED
COMPENSATED
```

### 要求

1. 所有语音任务都必须创建 AudioTask。
2. 创建任务前检查用户点数。
3. 创建任务时冻结点数。
4. 成功后结算点数。
5. 失败后释放冻结点数。
6. 任务状态在用户中心和后台可查询。
7. 错误提示必须为简体中文。

## 本阶段禁止事项

```text
不开放完整前台声音复刻页面
不做 RAG
不做 Agent
不做视频生成
不让 FastAPI 直连核心数据库
不让前端直接调用阿里云
不把 DASHSCOPE_API_KEY 写入代码或 seed
```

## 验收标准

```text
Provider Preset 中存在阿里云百炼语音
支持配置 DASHSCOPE_API_KEY
预置 CosyVoice / Sambert 模型
存在 tts-default、voice-clone-default、voice-design-default 等模型别名
FastAPI 存在 DashScope Audio Adapter
对象存储可以保存语音样本和输出音频
AudioTask 状态机可用
语音任务失败时可以释放冻结点数
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

如修改 FastAPI：

```bash
ruff check .
mypy .
pytest
```
