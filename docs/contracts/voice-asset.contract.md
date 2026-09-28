# 音色与音频资产契约

## VoiceAsset

```text
VoiceAsset
- id
- userId
- provider
- providerVoiceId
- name
- type
- targetModel
- status
- visibility
- language
- description
- previewAudioUrl
- sourceAudioAssetId
- consentId
- createdAt
- updatedAt
```

## 音色类型

```text
SYSTEM
CLONED
DESIGNED
```

## 音色状态

```text
DRAFT
CREATING
PENDING_REVIEW
READY
FAILED
REJECTED
DISABLED
DELETED
```

## 可见性

```text
PRIVATE
PUBLIC
ADMIN_ONLY
```

## AudioAsset

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

## AudioAsset 类型

```text
SOURCE_SAMPLE
PREVIEW
TTS_OUTPUT
```

## 规则

1. 用户复刻音色默认 `PRIVATE`。
2. 待审核音色不可用于语音合成。
3. 被禁用音色不可用于新任务。
4. `providerVoiceId` 不允许管理员随意手动修改。
5. 自定义音色合成时必须校验 `targetModel`。
6. 用户声音样本不得长期公开访问。
