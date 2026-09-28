# 语音任务契约

## AudioTask

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

## 任务类型

```text
TTS
VOICE_CLONE
VOICE_DESIGN
```

## 状态

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

## 执行原则

1. 所有语音任务必须创建 AudioTask。
2. 创建任务前检查点数。
3. 创建任务时冻结点数。
4. 成功后结算点数。
5. 失败后释放冻结点数。
6. 用户只能查看自己的任务。
7. 管理员可以查看全部任务。
8. 所有错误提示使用简体中文。
