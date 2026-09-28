# ElevenLabs 语音合成接入设计

**日期：** 2026-08-18

**状态：** 已确认

**范围：** ElevenLabs Provider、三个语音合成模型、默认系统音色同步、后台配置与现有语音工作台调用

## 1. 目标

在不改变现有语音任务、点数冻结、音频持久化和前端工作台主流程的前提下，引入 ElevenLabs 官方语音合成 API。管理员能够配置并测试 ElevenLabs Provider、分别配置模型价格、同步官方默认音色；用户能够在现有语音合成入口选择这些模型和音色完成合成。

本期接入以下模型：

- `eleven_v3`
- `eleven_multilingual_v2`
- `eleven_flash_v2_5`

## 2. 非目标

本期不接入：

- ElevenLabs 语音识别、声音复刻、声音设计、声音转换、音乐或音效 API。
- ElevenLabs 个人音色、工作区音色和社区音色的自动公开导入。
- WebSocket 或流式语音合成。
- 新的前端语音工作台或独立 ElevenLabs 页面。
- 自动覆盖现有 `tts-default`、`tts-fast` 等模型别名。
- 在源码、迁移、日志或 Git 中保存 API Key。

## 3. 已选架构

采用独立 `ELEVENLABS_AUDIO` Provider Adapter，并沿用现有 NestJS Audio Service 到 FastAPI AI Gateway 的语音调用链：

```text
Web 语音工作台
  -> NestJS AudioService
  -> POST AI Gateway /audio/tts
  -> ElevenLabsAudioAdapter
  -> POST ElevenLabs /v1/text-to-speech/{voice_id}
```

不在 NestJS 中直接调用 ElevenLabs，避免第三方协议、二进制音频处理和错误映射分散到核心业务层。AI Gateway 将 ElevenLabs 的二进制音频转换为项目现有标准语音结果，NestJS 继续负责鉴权、模型解析、点数冻结、任务状态、R2/本地持久化和账单记录。

## 4. Provider 与模型

新增内置 Provider：

```text
providerKey: elevenlabs_audio
adapterType: ELEVENLABS_AUDIO
modality: AUDIO
defaultBaseUrl: https://api.elevenlabs.io
apiKeyEnvName: ELEVENLABS_API_KEY
region: GLOBAL
```

三个模型均具备 `AUDIO`、`TTS`、`SYSTEM_VOICE`、`MULTILINGUAL`、`GLOBAL` 能力。模型实例由现有预设同步机制创建并保持可配置状态，Provider 默认禁用，因此不会产生流量；三个模型均不自动绑定现有模型别名。

每个模型继续使用现有后台模型价格配置，按字符计费且价格彼此独立。初始计价沿用项目语音模型的保守默认值，管理员可在启用前调整，不新增 ElevenLabs 套餐或订阅账务模型。

## 5. API 调用与参数

AI Gateway 使用请求头 `xi-api-key` 调用：

```text
POST /v1/text-to-speech/{voice_id}?output_format=...
```

请求正文至少包含 `text` 和 `model_id`。现有语速参数映射到 `voice_settings.speed`；当前通用界面的音调和音量参数不映射到 ElevenLabs 不支持的字段，也不伪造等价能力。未提供语速时沿用音色默认设置。

输出格式映射：

- `mp3` 使用项目兼容的 MP3 输出格式。
- `opus` 使用 ElevenLabs Opus 输出格式。
- `wav` 使用可由项目正确识别的 WAV/PCM 输出，并保证返回 MIME 与实际字节一致。

Gateway 返回现有标准字段，包括 `provider`、`model`、`voice`、`audioBase64`、`mimeType`、`requestId`、字符数和延迟。不得在响应、异常或日志中返回 API Key。

## 6. 文本限制与错误处理

- `eleven_v3` 单次最多 5000 个字符。
- `eleven_multilingual_v2` 和 `eleven_flash_v2_5` 本期沿用项目当前单次 8000 字符上限。
- 超限在发起外部请求前返回简体中文错误。
- 401/403 映射为“API Key 无效或无权访问”。
- 404 映射为“音色或接口不存在”。
- 422 映射为“模型、音色或合成参数无效”。
- 超时、限流和上游服务错误使用稳定内部错误码，并保持语音任务失败释放点数的现有行为。

## 7. 默认音色同步

后台音色库增加“同步 ElevenLabs 默认音色”操作。同步通过已加密保存的 ElevenLabs Provider 凭据调用：

```text
GET /v2/voices?voice_type=default&page_size=100
```

如果返回 `has_more`，使用 `next_page_token` 继续分页。同步只接收 `voice_type=default` 的官方默认音色，不导入 `personal`、`community`、`workspace`、克隆或生成音色。

每个音色保存为平台公开音色，记录官方名称、`voice_id`、描述、语言标签和 `preview_url`。以 `provider + providerVoiceId + isPlatform` 作为幂等匹配条件：已存在则更新元数据，不存在则创建；本期不自动删除或禁用上游暂时缺失的旧音色，避免同步造成破坏性删除。

导入的默认音色可用于本期三个 ElevenLabs 模型。兼容性判断同时校验音色 Provider，不能把 ElevenLabs Voice ID 交给其他语音 Provider。

## 8. 密钥安全

- 用户提供的 Key 只写入本地 Provider 的现有加密凭据字段。
- 加密使用项目现有 `SECRET_ENCRYPTION_KEY` 机制。
- 源码、测试夹具、迁移、规格文档和命令输出不得包含真实 Key。
- Provider 测试优先通过官方模型列表精确确认所选模型；受限 Key 未授予 `models_read` 时，回退为向 TTS 端点提交缺少 `text` 字段的无效请求探测 `text_to_speech` 权限。有权限时端点返回 422 且不生成音频、不提交可计费字符，并明确提示模型可用性将在首次合成时确认。
- 默认音色同步要求 API Key 同时开启 `voices_read` 权限；缺少时返回明确中文提示，不写入部分音色数据。
- 测试中只使用虚假 Key，并断言错误信息和标准结果不泄露凭据。

## 9. 数据库与后台

数据库迁移只增加 `ELEVENLABS_AUDIO` Adapter 枚举值，并幂等写入内置 Provider 与三个模型预设。音色继续复用现有 `VoiceAsset`，不新增音色表。

后台 Provider 列表和创建表单识别新 Adapter。Provider 详情继续复用现有音频 Provider 配置卡和模型管理区。音色同步按钮仅在存在已启用、已配置凭据的 ElevenLabs Provider 时可执行，并显示同步新增数、更新数和失败原因。

## 10. 验证

至少覆盖：

1. Provider 和三个模型预设契约。
2. Prisma Adapter 枚举迁移。
3. Gateway 正确构造 URL、请求头、模型、音色和输出格式。
4. 二进制音频标准化、请求 ID 和 MIME 处理。
5. 模型字符限制及 401、404、422、超时错误映射。
6. 默认音色分页、过滤和幂等同步。
7. 三模型共享 ElevenLabs 音色且不能跨 Provider 使用。
8. 真实 Key 不出现在 Git diff、测试输出和应用响应中。
9. 使用本地加密配置执行一次非计费连接测试，并在可控短文本下完成一次真实 TTS 验收。
