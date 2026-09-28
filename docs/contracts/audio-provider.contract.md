# 语音 Provider 契约

## 核心原则

语音能力必须通过统一 Provider / Adapter 体系接入。  
前端不得直接调用阿里云。  
FastAPI 不负责扣点、权限、钱包和审计。  
NestJS 负责用户、任务、计费、钱包、审计和安全策略。

## Provider Preset

```text
providerKey: aliyun_dashscope_audio
displayName: 阿里云百炼语音
adapterType: DASHSCOPE_AUDIO
apiKeyEnvName: DASHSCOPE_API_KEY
modality: AUDIO
```

## 地域配置

```text
cn-beijing
intl-singapore
```

## 推荐模型别名

```text
tts-default
tts-fast
voice-clone-default
voice-design-default
audio-preview
```

## 推荐能力标签

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

## FastAPI Adapter 接口

```text
test_connection()
create_cloned_voice()
create_designed_voice()
query_voice()
delete_voice()
synthesize_speech()
stream_synthesize_speech()
```

## 安全要求

1. `DASHSCOPE_API_KEY` 不得写入代码。
2. `DASHSCOPE_API_KEY` 不得写入 seed。
3. `DASHSCOPE_API_KEY` 不得进入日志。
4. 后台不得显示完整 API Key。
5. 连接测试不扣点。
