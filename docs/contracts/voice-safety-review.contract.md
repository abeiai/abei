# 声音复刻安全、授权与审核契约

## VoiceConsent

```text
VoiceConsent
- id
- userId
- voiceAssetId
- consentText
- consentType
- ownerName
- ownerContact
- agreedAt
- ip
- userAgent
- createdAt
```

## consentType

```text
SELF_VOICE
AUTHORIZED_VOICE
```

## 授权声明

```text
我确认上传的音频为本人声音，或我已获得声音权利人的明确授权。我承诺不会将该音色用于冒充他人、诈骗、侵权、虚假宣传或其他违法违规用途。
```

## 规则

1. 没有授权声明，不允许提交声音复刻。
2. 用户复刻音色默认私有。
3. 声音复刻默认需要管理员审核。
4. 待审核音色不可用于合成。
5. 管理员审核必须记录操作日志。
6. 管理员可以禁用违规音色。
7. 前台必须显示敏感用途提示。
8. 不允许默认公开用户复刻音色。
