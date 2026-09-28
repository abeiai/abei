# 语音工具模板契约

## 语音工具模板

推荐预置：

```text
文章转语音
短视频口播生成
课程讲稿转语音
绘本朗读音频生成
客服欢迎语生成
品牌声音设计
我的声音复刻
```

## 新增 Schema 字段类型

```text
voice-select
audio-upload
slider
audio-preview
format-select
```

## 示例 Schema

```json
{
  "fields": [
    {
      "name": "text",
      "label": "合成文本",
      "type": "textarea",
      "required": true
    },
    {
      "name": "voiceId",
      "label": "选择音色",
      "type": "voice-select",
      "required": true
    },
    {
      "name": "speed",
      "label": "语速",
      "type": "slider",
      "min": 0.5,
      "max": 2,
      "default": 1
    },
    {
      "name": "sourceAudio",
      "label": "声音样本",
      "type": "audio-upload",
      "accept": ["audio/mpeg", "audio/wav", "audio/webm"],
      "maxSizeMb": 20
    }
  ]
}
```

## 规则

1. `voice-select` 只能显示用户可用音色。
2. `audio-upload` 必须限制格式和大小。
3. `slider` 必须做范围校验。
4. 语音复刻工具必须包含授权声明。
5. Demo 数据不得包含真实用户声音样本。
6. Demo 数据不得包含真实 API Key。
7. `format-select` 未配置 options 时默认使用 `mp3`、`wav`、`opus`。
8. 语音模板通过 `requiredCapabilities` 区分 `TTS`、`VOICE_DESIGN`、`VOICE_CLONE`。
