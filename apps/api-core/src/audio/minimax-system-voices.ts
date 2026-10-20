export const minimaxSystemVoiceLanguages = [
  "普通话",
  "粤语",
  "英文",
  "日语",
  "韩语",
  "西班牙文",
  "葡萄牙文",
  "法文",
  "印尼文",
  "德文",
  "俄文",
  "意大利文",
  "阿拉伯文",
  "土耳其文",
  "乌克兰文",
  "荷兰文",
  "越南文",
  "泰文",
  "波兰文",
  "罗马尼亚文",
  "希腊文",
  "捷克文",
  "芬兰文",
  "印地文"
] as const;

export type MinimaxSystemVoiceLanguage = (typeof minimaxSystemVoiceLanguages)[number];
export type MinimaxSystemVoiceAgeCategory = "儿童" | "青年" | "中年" | "老年";

export interface MinimaxSystemVoice {
  id: string;
  providerVoiceId: string;
  name: string;
  type: "SYSTEM";
  targetModel: string;
  supportedModels: readonly string[];
  sourceModels: readonly string[];
  status: "READY";
  visibility: "PUBLIC";
  language: string;
  languages: readonly MinimaxSystemVoiceLanguage[];
  description: string;
  trait: string;
  scene: string;
  age: string;
  ageCategory: MinimaxSystemVoiceAgeCategory | null;
  accent?: string;
  gender?: "男声" | "女声";
  avatarUrl: string | null;
  ssmlSupported: boolean;
  instructSupported: boolean;
  timestampSupported: boolean;
  previewAudioUrl: string;
}

// Source: https://platform.minimaxi.com/docs/faq/system-voice-id
// Parsed 327 official MiniMax system voices.
// Enriched from https://www.minimaxi.com/audio/voices by matching uniq_id to providerVoiceId.
export const minimaxSystemVoices = [
  {
    "id": "sys-minimax-male-qn-qingse",
    "providerVoiceId": "male-qn-qingse",
    "name": "沈允书",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话"
    ],
    "description": "中文 (普通话) · 青涩青年音色",
    "trait": "青涩青年音色",
    "scene": "MiniMax 官方系统音色",
    "age": "未标注",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-male-qn-qingse-c13f6bc813-v6-19b54b524eb47aea7a44.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/male-qn-qingse-85a41a73ae-generated.mp3",
    "accent": "普通话",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-male-qn-jingying",
    "providerVoiceId": "male-qn-jingying",
    "name": "傅正谦",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话"
    ],
    "description": "中文 (普通话) · 精英青年音色",
    "trait": "精英青年音色",
    "scene": "MiniMax 官方系统音色",
    "age": "未标注",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-male-qn-jingying-9c1b5e723c-v6-0a56525fc0cf57449ec6.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/male-qn-jingying-dcb63e104e-generated.mp3",
    "accent": "普通话",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-male-qn-badao",
    "providerVoiceId": "male-qn-badao",
    "name": "陆知峥",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话"
    ],
    "description": "中文 (普通话) · 霸道青年音色",
    "trait": "霸道青年音色",
    "scene": "MiniMax 官方系统音色",
    "age": "未标注",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-male-qn-badao-6b9572f17f-v6-f4f8308e6a1d1a421d33.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/male-qn-badao-2d65a11cf5-generated.mp3",
    "accent": "普通话",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-male-qn-daxuesheng",
    "providerVoiceId": "male-qn-daxuesheng",
    "name": "邱闻溪",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话"
    ],
    "description": "中文 (普通话) · 青年大学生音色",
    "trait": "青年大学生音色",
    "scene": "MiniMax 官方系统音色",
    "age": "未标注",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-male-qn-daxuesheng-f81898cc8e-v6-ceb3d48de368c1cd546f.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/male-qn-daxuesheng-b1f7cf9cc7-generated.mp3",
    "accent": "普通话",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-female-shaonv",
    "providerVoiceId": "female-shaonv",
    "name": "庄若宁",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话"
    ],
    "description": "中文 (普通话) · 少女音色",
    "trait": "少女音色",
    "scene": "MiniMax 官方系统音色",
    "age": "未标注",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-female-shaonv-242c726559-v6-b91b64c97fb09ddfcab2.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/female-shaonv-d54f990d62-generated.mp3",
    "accent": "普通话",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-female-yujie",
    "providerVoiceId": "female-yujie",
    "name": "裴沐柔",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话"
    ],
    "description": "中文 (普通话) · 御姐音色",
    "trait": "御姐音色",
    "scene": "MiniMax 官方系统音色",
    "age": "未标注",
    "ageCategory": "中年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-female-yujie-376645a549-v6-27b7869cbfeb253b9d40.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/female-yujie-c3e872bce9-generated.mp3",
    "accent": "普通话",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-female-chengshu",
    "providerVoiceId": "female-chengshu",
    "name": "梁清妍",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话"
    ],
    "description": "中文 (普通话) · 成熟女性音色",
    "trait": "成熟女性音色",
    "scene": "MiniMax 官方系统音色",
    "age": "未标注",
    "ageCategory": "中年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-female-chengshu-04cb899c18-v6-4e3903dd99c16b5bdf43.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/female-chengshu-254a331231-generated.mp3",
    "accent": "普通话",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-female-tianmei",
    "providerVoiceId": "female-tianmei",
    "name": "卓沐晴",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话"
    ],
    "description": "中文 (普通话) · 甜美女性音色",
    "trait": "甜美女性音色",
    "scene": "MiniMax 官方系统音色",
    "age": "未标注",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-female-tianmei-ea3833a6af-v6-cb36ca60df09e3534b66.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/female-tianmei-48fd7daf6d-generated.mp3",
    "accent": "普通话",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-male-qn-qingse-jingpin",
    "providerVoiceId": "male-qn-qingse-jingpin",
    "name": "罗书远",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话"
    ],
    "description": "中文 (普通话) · 青涩青年音色-beta",
    "trait": "青涩青年音色-beta",
    "scene": "MiniMax 官方系统音色",
    "age": "未标注",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-male-qn-qingse-jingpin-23f8241e9d-v6-1cc6ce76236e947b2dc1.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/male-qn-qingse-jingpin-3ca65d819a-generated.mp3",
    "accent": "普通话",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-male-qn-jingying-jingpin",
    "providerVoiceId": "male-qn-jingying-jingpin",
    "name": "夏景钧",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话"
    ],
    "description": "中文 (普通话) · 精英青年音色-beta",
    "trait": "精英青年音色-beta",
    "scene": "MiniMax 官方系统音色",
    "age": "未标注",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-male-qn-jingying-jingpin-2555282278-v6-129f7ee29aa72198c0ab.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/male-qn-jingying-jingpin-780bf45ae8-generated.mp3",
    "accent": "普通话",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-male-qn-badao-jingpin",
    "providerVoiceId": "male-qn-badao-jingpin",
    "name": "章霁峰",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话"
    ],
    "description": "中文 (普通话) · 霸道青年音色-beta",
    "trait": "霸道青年音色-beta",
    "scene": "MiniMax 官方系统音色",
    "age": "未标注",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-male-qn-badao-jingpin-119ac831d9-v6-3f1e6738380c305043b5.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/male-qn-badao-jingpin-8e3270f04e-generated.mp3",
    "accent": "普通话",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-male-qn-daxuesheng-jingpin",
    "providerVoiceId": "male-qn-daxuesheng-jingpin",
    "name": "叶以澄",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话"
    ],
    "description": "中文 (普通话) · 青年大学生音色-beta",
    "trait": "青年大学生音色-beta",
    "scene": "MiniMax 官方系统音色",
    "age": "未标注",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-male-qn-daxuesheng-jingpin-b6eec26fe6-v6-dd2bc3b9cf1cc87a0074.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/male-qn-daxuesheng-jingpin-16267d1e97-generated.mp3",
    "accent": "普通话",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-female-shaonv-jingpin",
    "providerVoiceId": "female-shaonv-jingpin",
    "name": "卢知微",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话"
    ],
    "description": "中文 (普通话) · 少女音色-beta",
    "trait": "少女音色-beta",
    "scene": "MiniMax 官方系统音色",
    "age": "未标注",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-female-shaonv-jingpin-6ced60f297-v6-463cd3c818b1e107a8f9.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/female-shaonv-jingpin-f0ceabe3b7-generated.mp3",
    "accent": "普通话",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-female-yujie-jingpin",
    "providerVoiceId": "female-yujie-jingpin",
    "name": "黎念安",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话"
    ],
    "description": "中文 (普通话) · 御姐音色-beta",
    "trait": "御姐音色-beta",
    "scene": "MiniMax 官方系统音色",
    "age": "未标注",
    "ageCategory": "中年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-female-yujie-jingpin-cfc9201416-v6-149fbbd25cd9d88acb33.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/female-yujie-jingpin-87744ca92c-generated.mp3",
    "accent": "普通话",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-female-chengshu-jingpin",
    "providerVoiceId": "female-chengshu-jingpin",
    "name": "程依澄",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话"
    ],
    "description": "中文 (普通话) · 成熟女性音色-beta",
    "trait": "成熟女性音色-beta",
    "scene": "MiniMax 官方系统音色",
    "age": "未标注",
    "ageCategory": "中年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-female-chengshu-jingpin-1c82e36a5d-v6-ff905153bfb6d4e43a23.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/female-chengshu-jingpin-8c6c6a10a5-generated.mp3",
    "accent": "普通话",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-female-tianmei-jingpin",
    "providerVoiceId": "female-tianmei-jingpin",
    "name": "谢语欢",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话"
    ],
    "description": "中文 (普通话) · 甜美女性音色-beta",
    "trait": "甜美女性音色-beta",
    "scene": "MiniMax 官方系统音色",
    "age": "未标注",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-female-tianmei-jingpin-f028aa1504-v6-65011b117735d287fea8.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/female-tianmei-jingpin-d2af2d8751-generated.mp3",
    "accent": "普通话",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-clever_boy",
    "providerVoiceId": "clever_boy",
    "name": "黎小言",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话"
    ],
    "description": "中文 (普通话) · 聪明男童",
    "trait": "聪明男童",
    "scene": "MiniMax 官方系统音色",
    "age": "未标注",
    "ageCategory": "儿童",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-clever_boy-872f403025-v6-280203567e8a0bd0fae3.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/clever_boy-a3ce0f0ea7-generated.mp3",
    "accent": "普通话",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-cute_boy",
    "providerVoiceId": "cute_boy",
    "name": "程以南",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话"
    ],
    "description": "中文 (普通话) · 可爱男童",
    "trait": "可爱男童",
    "scene": "MiniMax 官方系统音色",
    "age": "未标注",
    "ageCategory": "儿童",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-cute_boy-1316e0b9ef-v6-2202083af69c65683045.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/cute_boy-caf9ce9538-generated.mp3",
    "accent": "普通话",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-lovely_girl",
    "providerVoiceId": "lovely_girl",
    "name": "傅语禾",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话"
    ],
    "description": "中文 (普通话) · 萌萌女童",
    "trait": "萌萌女童",
    "scene": "MiniMax 官方系统音色",
    "age": "未标注",
    "ageCategory": "儿童",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-lovely_girl-d79af835f8-v6-f7072c090a4eb9ed77fd.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/lovely_girl-ec88291709-generated.mp3",
    "accent": "普通话",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-cartoon_pig",
    "providerVoiceId": "cartoon_pig",
    "name": "纪舒宁",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话"
    ],
    "description": "中文 (普通话) · 卡通猪小琪",
    "trait": "卡通猪小琪",
    "scene": "MiniMax 官方系统音色",
    "age": "未标注",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-cartoon_pig-9712859472-v6-fab2d7223dca2a174ee0.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/cartoon_pig-fd4e605620-generated.mp3",
    "accent": "普通话",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-bingjiao_didi",
    "providerVoiceId": "bingjiao_didi",
    "name": "冉云舒",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话"
    ],
    "description": "中文 (普通话) · 病娇弟弟",
    "trait": "病娇弟弟",
    "scene": "MiniMax 官方系统音色",
    "age": "未标注",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-bingjiao_didi-de6fc000a8-v6-8e008d20ba644fdf1878.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/bingjiao_didi-0e328bd808-generated.mp3",
    "accent": "普通话",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-junlang_nanyou",
    "providerVoiceId": "junlang_nanyou",
    "name": "庄景初",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话"
    ],
    "description": "中文 (普通话) · 俊朗男友",
    "trait": "俊朗男友",
    "scene": "MiniMax 官方系统音色",
    "age": "未标注",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-junlang_nanyou-5075b59614-v6-47fc7e37749cac24e089.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/junlang_nanyou-17ea8f789c-generated.mp3",
    "accent": "普通话",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-chunzhen_xuedi",
    "providerVoiceId": "chunzhen_xuedi",
    "name": "裴清和",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话"
    ],
    "description": "中文 (普通话) · 纯真学弟",
    "trait": "纯真学弟",
    "scene": "MiniMax 官方系统音色",
    "age": "未标注",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-chunzhen_xuedi-a91b89f027-v6-0644cc7591fe51d2e4f2.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/chunzhen_xuedi-db57253805-generated.mp3",
    "accent": "普通话",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-lengdan_xiongzhang",
    "providerVoiceId": "lengdan_xiongzhang",
    "name": "沈修远",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话"
    ],
    "description": "中文 (普通话) · 冷淡学长",
    "trait": "冷淡学长",
    "scene": "MiniMax 官方系统音色",
    "age": "未标注",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-lengdan_xiongzhang-09596f9829-v6-dee725828fe6fb4ceb59.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/lengdan_xiongzhang-e378d497dc-generated.mp3",
    "accent": "普通话",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-badao_shaoye",
    "providerVoiceId": "badao_shaoye",
    "name": "宋允衡",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话"
    ],
    "description": "中文 (普通话) · 霸道少爷",
    "trait": "霸道少爷",
    "scene": "MiniMax 官方系统音色",
    "age": "未标注",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-badao_shaoye-ad62422c6f-v6-617c2e5e535908c81c09.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/badao_shaoye-e9ff484a9c-generated.mp3",
    "accent": "普通话",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-tianxin_xiaoling",
    "providerVoiceId": "tianxin_xiaoling",
    "name": "卢清悦",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话"
    ],
    "description": "中文 (普通话) · 甜心小玲",
    "trait": "甜心小玲",
    "scene": "MiniMax 官方系统音色",
    "age": "未标注",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-tianxin_xiaoling-452ffe3373-v6-9d7e8d22df1f3c4d3a7f.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/tianxin_xiaoling-4f585623c0-generated.mp3",
    "accent": "普通话",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-qiaopi_mengmei",
    "providerVoiceId": "qiaopi_mengmei",
    "name": "黎明汐",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话"
    ],
    "description": "中文 (普通话) · 俏皮萌妹",
    "trait": "俏皮萌妹",
    "scene": "MiniMax 官方系统音色",
    "age": "未标注",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-qiaopi_mengmei-d901137419-v6-4864b7d816fa2dbd7f35.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/qiaopi_mengmei-7676cf854d-generated.mp3",
    "accent": "普通话",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-wumei_yujie",
    "providerVoiceId": "wumei_yujie",
    "name": "宋书禾",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话"
    ],
    "description": "中文 (普通话) · 妩媚御姐",
    "trait": "妩媚御姐",
    "scene": "MiniMax 官方系统音色",
    "age": "未标注",
    "ageCategory": "中年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-wumei_yujie-a3111c3c41-v6-7fb68cb47aeed89bc001.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/wumei_yujie-3174fd7e11-generated.mp3",
    "accent": "普通话",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-diadia_xuemei",
    "providerVoiceId": "diadia_xuemei",
    "name": "卢宛清",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话"
    ],
    "description": "中文 (普通话) · 嗲嗲学妹",
    "trait": "嗲嗲学妹",
    "scene": "MiniMax 官方系统音色",
    "age": "未标注",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-diadia_xuemei-414a65f2ef-v6-be603d996c542287f2b9.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/diadia_xuemei-7ca86d1b95-generated.mp3",
    "accent": "普通话",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-danya_xuejie",
    "providerVoiceId": "danya_xuejie",
    "name": "黎宁溪",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话"
    ],
    "description": "中文 (普通话) · 淡雅学姐",
    "trait": "淡雅学姐",
    "scene": "MiniMax 官方系统音色",
    "age": "未标注",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-danya_xuejie-3af8f7d221-v6-84b855e25b6e62f80aa7.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/danya_xuejie-52722ad111-generated.mp3",
    "accent": "普通话",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Chinese (Mandarin)_Reliable_Executive",
    "providerVoiceId": "Chinese (Mandarin)_Reliable_Executive",
    "name": "梁越山",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话"
    ],
    "description": "这是一个沉稳干练的男声。其声线低沉厚实且自带磁性，说话节奏从容不迫、条理清晰。整体风格既展现了职场精英的果断权威，又透露出成熟男性的可靠与包容，非常适合用于都市职场剧、有声小说中的高管角色或高端商务解说等场景。",
    "trait": "低沉厚实,磁性,从容不迫",
    "scene": "在线教育、播客与社媒、企业宣传与旁白",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Chinese-Mandarin-_Reliable_Executive-5f77d7fe97-v6-2e53c3c0f3429906aa26.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Chinese-Mandarin-_Reliable_Executive-459dc068dd.mp3",
    "accent": "普通话",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Chinese (Mandarin)_News_Anchor",
    "providerVoiceId": "Chinese (Mandarin)_News_Anchor",
    "name": "许书瑾",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话"
    ],
    "description": "这是一个端庄大气的女声。其声线明亮圆润且富有知性美，说话节奏抑扬顿挫、干练利落。整体风格客观理性且专业，自带一种标准的新闻现场感，非常适合用于严肃的晚间新闻、快讯播报或政企宣传片等场景。",
    "trait": "明亮圆润,干练利落,新闻现场感",
    "scene": "广告与预告、播客与社媒、企业宣传与旁白",
    "age": "中年",
    "ageCategory": "中年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Chinese-Mandarin-_News_Anchor-34ef057155-v6-c884d6b71b8cdad47d12.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Chinese-Mandarin-_News_Anchor-a0b78cbcca.mp3",
    "accent": "普通话",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Chinese (Mandarin)_Mature_Woman",
    "providerVoiceId": "Chinese (Mandarin)_Mature_Woman",
    "name": "罗静澜",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话"
    ],
    "description": "这是一个极具风情的成熟女声。其声线低沉沙哑且带有迷人的气声，说话节奏慵懒舒缓、漫不经心。整体风格性感撩人且略带神秘感，能准确传达自信、妩媚的情绪，是广播剧和游戏配音类项目的理想选择，特别是针对美艳反派或成熟御姐角色的演绎。",
    "trait": "低沉沙哑,慵懒舒缓,性感撩人",
    "scene": "游戏与RPG、广播剧、有声书与小说、动漫与动画、角色配音",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Chinese-Mandarin-_Mature_Woman-d57eecb11b-v6-6650efe43876d90db431.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Chinese-Mandarin-_Mature_Woman-b121b74fe6.mp3",
    "accent": "普通话",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Chinese (Mandarin)_Unrestrained_Young_Man",
    "providerVoiceId": "Chinese (Mandarin)_Unrestrained_Young_Man",
    "name": "孟廷川",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话"
    ],
    "description": "这是一个极具辨识度的青年男声。其声线低沉磁性且略带冷冽，说话节奏慵懒随意却又不失威严。整体风格傲慢且霸道，自带一种高高在上的掌控感，非常适合用于现代言情广播剧、都市爽文有声书等场景，完美契合霸道总裁或豪门阔少的角色设定。",
    "trait": "低沉磁性,慵懒随意,霸道",
    "scene": "游戏与RPG、广播剧、动漫与动画、角色配音",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Chinese-Mandarin-_Unrestrained_Young_Man-c1e0745c71-v6-7b6fce7f375addf3388f.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Chinese-Mandarin-_Unrestrained_Young_Man-3c53a6fa39.mp3",
    "accent": "普通话",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Arrogant_Miss",
    "providerVoiceId": "Arrogant_Miss",
    "name": "贺予星",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话"
    ],
    "description": "该音色以娇俏明亮的音质和灵动跳跃的节奏为特征，极具辨识度。它能准确传达傲娇自信甚至带有一丝调侃的情绪，是国漫动画和二次元游戏类项目的理想选择，特别是针对那些性格张扬的鬼马少女角色的演绎。",
    "trait": "娇俏明亮,灵动跳跃,傲娇自信",
    "scene": "游戏与RPG、动漫与动画、角色配音",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Arrogant_Miss-2dd2598bd2-v6-2b330cf2fb4c7bcef078.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Arrogant_Miss-65cd006282.mp3",
    "accent": "普通话",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Robot_Armor",
    "providerVoiceId": "Robot_Armor",
    "name": "唐朔宁",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话"
    ],
    "description": "这是一个极具辨识度的角色型男声。其声线经过明显的电子特效处理，带有浓厚的金属质感与低沉的轰鸣声，说话节奏强硬且带有独特的机械顿挫感。整体风格充满力量与压迫感，自带一种来自未来的科幻色彩，非常适合用于科幻题材的游戏角色、机甲战斗类动画或电影中的反派机器人与重装铠甲战士的配音。",
    "trait": "金属质感,机械顿挫,科幻色彩",
    "scene": "游戏与RPG",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Robot_Armor-125adda2ea-v6-ee8446534cd8563d44b4.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Robot_Armor-1fad78c95f.mp3",
    "accent": "普通话",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Chinese (Mandarin)_Kind-hearted_Antie",
    "providerVoiceId": "Chinese (Mandarin)_Kind-hearted_Antie",
    "name": "庄安芮",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话"
    ],
    "description": "该音色以高昂明亮的音质和碎碎念般的快节奏为特征，极具生活气息。它能准确传达热情、关切乃至有些唠叨的情绪，是生活类广播剧和市井题材作品的理想选择，特别是针对热心邻居大婶角色的演绎。",
    "trait": "高昂明亮,碎碎念,生活气息",
    "scene": "广播剧、广告与预告、在线教育、播客与社媒",
    "age": "中年",
    "ageCategory": "中年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Chinese-Mandarin-_Kind-hearted_Antie-2f9842356c-v6-7a01c8789f280797689e.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Chinese-Mandarin-_Kind-hearted_Antie-fdd50fc65c.mp3",
    "accent": "普通话",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Chinese (Mandarin)_HK_Flight_Attendant",
    "providerVoiceId": "Chinese (Mandarin)_HK_Flight_Attendant",
    "name": "章熙瑶",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话"
    ],
    "description": "这是一个充满活力的女声。其声线清脆明亮，说话节奏快言快语、十分生活化。整体风格直爽且真实，极具生活气息和即兴感，非常适合用于现代都市广播剧、综艺访谈或粤语播客等场景，是典型的直率港女角色。",
    "trait": "清脆明亮,快言快语,直爽且真实",
    "scene": "播客与社媒",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Chinese-Mandarin-_HK_Flight_Attendant-b226c79d6a-v6-059a2c527f31b288e6df.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Chinese-Mandarin-_HK_Flight_Attendant-fc4a2796b2.mp3",
    "accent": "粤语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Chinese (Mandarin)_Humorous_Elder",
    "providerVoiceId": "Chinese (Mandarin)_Humorous_Elder",
    "name": "秦承厚",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话"
    ],
    "description": "该音色以沧桑醇厚且略带沙哑的音质和松弛接地气的节奏为特征，极具辨识度与生活质感。它能准确传达自信、幽默且热心的情绪，是生活类广告和广播剧项目的理想选择，特别是针对晨练大爷或老顽童角色的演绎。",
    "trait": "沧桑醇厚,松弛接地气,幽默热心",
    "scene": "广播剧、动漫与动画、纪录片、企业宣传与旁白",
    "age": "老年",
    "ageCategory": "老年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Chinese-Mandarin-_Humorous_Elder-4a6f1633eb-v6-348a318a0c6fa2f7235f.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Chinese-Mandarin-_Humorous_Elder-8590d6be1f.mp3",
    "accent": "北方普通话",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Chinese (Mandarin)_Gentleman",
    "providerVoiceId": "Chinese (Mandarin)_Gentleman",
    "name": "柳晏晨",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话"
    ],
    "description": "这是一个清新干净的青年男声。其声线温润清亮且充满朝气，说话节奏真诚自然、娓娓道来。整体风格礼貌且极具亲和力，给人一种阳光自律、积极向上的感觉。推荐用于现代都市言情小说、青年成长类播客或校园题材广播剧，能够完美契合奋斗青年或正直学长的设定。",
    "trait": "温润清亮,娓娓道来,阳光自律",
    "scene": "广播剧、广告与预告、播客与社媒",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Chinese-Mandarin-_Gentleman-7ae856ff38-v6-d2f5c9a351e900186187.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Chinese-Mandarin-_Gentleman-d675bded25.mp3",
    "accent": "普通话",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Chinese (Mandarin)_Warm_Bestie",
    "providerVoiceId": "Chinese (Mandarin)_Warm_Bestie",
    "name": "章怀音",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话"
    ],
    "description": "这是一个极具疗愈感的年轻女声。其声线温柔清亮，说话节奏舒缓且充满关切，仿佛是在耳边轻声细语。整体风格亲切自然，给人一种如沐春风的温暖感觉，非常适合用于情感陪伴类电台、治愈系有声读物或现代都市广播剧，能够完美契合知心闺蜜的设定。",
    "trait": "温柔清亮,舒缓且充满关切,亲切自然",
    "scene": "广告与预告、播客与社媒",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Chinese-Mandarin-_Warm_Bestie-5249f727ad-v6-57cdd6ce2234d11061ae.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Chinese-Mandarin-_Warm_Bestie-03c34055ae.wav",
    "accent": "普通话",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Chinese (Mandarin)_Male_Announcer",
    "providerVoiceId": "Chinese (Mandarin)_Male_Announcer",
    "name": "邵沐言",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话"
    ],
    "description": "这是一个充满朝气的青年男声。其声线清澈干净且温暖，说话节奏自然流畅、娓娓道来。整体风格亲切且富有治愈感，自带一种邻家大哥哥般的信赖感，非常适合用于有声小说朗读、情感电台节目或在线教育内容等场景。",
    "trait": "清澈干净,自然流畅,邻家大哥哥",
    "scene": "在线教育、播客与社媒、企业宣传与旁白",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Chinese-Mandarin-_Male_Announcer-00e8ab0ebb-v6-e0e59efca8999aa2dc08.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Chinese-Mandarin-_Male_Announcer-13a559505c.mp3",
    "accent": "普通话",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Chinese (Mandarin)_Sweet_Lady",
    "providerVoiceId": "Chinese (Mandarin)_Sweet_Lady",
    "name": "邱羽彤",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话"
    ],
    "description": "这是一个充满活力的青年女声。其声线甜美细腻，音质清澈，说话节奏舒缓自然、娓娓道来。整体风格温柔且治愈，自带一种极强的邻家亲切感，非常适合用于现代都市题材的有声书、情感类电台节目或生活类Vlog旁白，能够完美演绎贴心闺蜜的角色。",
    "trait": "甜美细腻,舒缓自然,邻家亲切感",
    "scene": "播客与社媒、企业宣传与旁白",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Chinese-Mandarin-_Sweet_Lady-2085582600-v6-1f3b5c886507d6470bd9.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Chinese-Mandarin-_Sweet_Lady-39b5c4bed3.wav",
    "accent": "普通话",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Chinese (Mandarin)_Southern_Young_Man",
    "providerVoiceId": "Chinese (Mandarin)_Southern_Young_Man",
    "name": "薛怀瑾",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话"
    ],
    "description": "这是一个极具生活气息的青年男声。其声线温润细腻，说话节奏舒缓随性、娓娓道来，带有一种典型的南方松弛感。整体风格亲切邻家，仿佛就在耳边闲聊，非常适合用于生活随笔、治愈系独白或旅游Vlog配音，能够完美契合文艺青年的设定。",
    "trait": "温润细腻,娓娓道来,亲切邻家",
    "scene": "动漫与动画、纪录片、广告与预告、播客与社媒、企业宣传与旁白",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Chinese-Mandarin-_Southern_Young_Man-1e25fcd937-v6-547fe088f8c08fd6406f.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Chinese-Mandarin-_Southern_Young_Man-6f8ed1f7b7.mp3",
    "accent": "南方普通话",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Chinese (Mandarin)_Wise_Women",
    "providerVoiceId": "Chinese (Mandarin)_Wise_Women",
    "name": "方静宜",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话"
    ],
    "description": "这是一位成熟知性的女声。其声线温润厚实且略带沙哑，说话节奏自然亲切、娓娓道来，给人一种踏实温暖的感觉。整体风格充满浓厚的生活气息且极具亲和力，非常适合用于日常对话场景、广播剧中的长辈角色或情感类播客节目，能够完美契合知心大姐或慈祥母亲的设定。",
    "trait": "温润厚实,娓娓道来,极具亲和力",
    "scene": "广播剧、有声书与小说、广告与预告、企业宣传与旁白",
    "age": "中年",
    "ageCategory": "中年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Chinese-Mandarin-_Wise_Women-2a26761726-v6-fd23307ffb8d51a19e4b.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Chinese-Mandarin-_Wise_Women-bd97541bae.mp3",
    "accent": "普通话",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Chinese (Mandarin)_Gentle_Youth",
    "providerVoiceId": "Chinese (Mandarin)_Gentle_Youth",
    "name": "梁书珩",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话"
    ],
    "description": "这是一个充满朝气的青年男声。其声线清亮干净且富有温度，说话节奏舒缓流畅、娓娓道来。整体风格亲切且极具治愈感，自带一种温暖的邻家大哥哥氛围，非常适合用于情感类有声书、恋爱游戏角色配音或轻松的教育解说等场景，能够完美契合阳光暖男的设定。",
    "trait": "清亮干净,娓娓道来,邻家大哥哥",
    "scene": "游戏与RPG、在线教育、播客与社媒",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Chinese-Mandarin-_Gentle_Youth-b2b4204fd3-v6-59b82a346953b9270802.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Chinese-Mandarin-_Gentle_Youth-f24bd6e065.mp3",
    "accent": "普通话",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Chinese (Mandarin)_Warm_Girl",
    "providerVoiceId": "Chinese (Mandarin)_Warm_Girl",
    "name": "梁可晴",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话"
    ],
    "description": "这是一个年轻温柔的女声。其声线甜美细腻且自带暖意，说话语气亲切自然、娓娓道来。整体风格充满了邻家女孩般的治愈感，能够准确传达出体贴与细腻的情绪，非常适合用于都市言情小说、情感电台独白或生活类游戏角色的演绎。",
    "trait": "甜美细腻,娓娓道来,治愈感",
    "scene": "游戏与RPG、广播剧、有声书与小说、动漫与动画",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Chinese-Mandarin-_Warm_Girl-8767df4cd5-v6-ba05be0f147b206e7ff9.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Chinese-Mandarin-_Warm_Girl-1188707d61.wav",
    "accent": "普通话",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Chinese (Mandarin)_Kind-hearted_Elder",
    "providerVoiceId": "Chinese (Mandarin)_Kind-hearted_Elder",
    "name": "贺玉芬",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话"
    ],
    "description": "这是一个充满阅历的老年女声。其声线略带沙哑且饱含温情，说话节奏慢条斯理、娓娓道来。整体风格慈爱且极具亲和力，非常适合用于家庭题材的广播剧、感人的广告独白或有声书等场景，能够完美演绎慈祥奶奶的角色。",
    "trait": "略带沙哑,娓娓道来,极具亲和力",
    "scene": "广播剧、动漫与动画、角色配音、广告与预告",
    "age": "老年",
    "ageCategory": "老年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Chinese-Mandarin-_Kind-hearted_Elder-ff9e63009f-v6-64946f8a468b4e6186fe.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Chinese-Mandarin-_Kind-hearted_Elder-4fb226bf26.mp3",
    "accent": "普通话",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Chinese (Mandarin)_Cute_Spirit",
    "providerVoiceId": "Chinese (Mandarin)_Cute_Spirit",
    "name": "姜悦宁",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话"
    ],
    "description": "该音色以软萌稚嫩的音质和轻快活泼的节奏为特征，极具辨识度。它能准确传达天真烂漫的情绪，是卡通动画和儿童有声书类项目的理想选择，特别是针对萌宠或幼童角色的演绎。",
    "trait": "软萌稚嫩,轻快活泼,天真烂漫",
    "scene": "游戏与RPG、有声书与小说、动漫与动画、角色配音",
    "age": "儿童",
    "ageCategory": "儿童",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Chinese-Mandarin-_Cute_Spirit-10ddaabdca-v6-894e9b7ab9e6eec59449.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Chinese-Mandarin-_Cute_Spirit-ad38bd5920.mp3",
    "accent": "普通话",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Chinese (Mandarin)_Radio_Host",
    "providerVoiceId": "Chinese (Mandarin)_Radio_Host",
    "name": "谢乐川",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话"
    ],
    "description": "这是一个年轻且充满活力的男声。其声线清亮明快，说话节奏干脆利落、富有生活气息。整体风格接地气且略带傲娇，能准确传达出抱怨或吐槽时的生动情绪，非常适合用于现代都市广播剧、社交媒体短视频或即兴脱口秀等场景，能够完美契合八卦好友或都市青年的设定。",
    "trait": "清亮明快,干脆利落,略带傲娇",
    "scene": "广播剧、动漫与动画、播客与社媒、企业宣传与旁白",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Chinese-Mandarin-_Radio_Host-39445a2ff1-v6-7e3eaba6b079cb9ae8f4.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Chinese-Mandarin-_Radio_Host-55a14d97da.mp3",
    "accent": "普通话",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Chinese (Mandarin)_Lyrical_Voice",
    "providerVoiceId": "Chinese (Mandarin)_Lyrical_Voice",
    "name": "盛宁远",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话"
    ],
    "description": "这是一个成熟儒雅的男声。其声线温润醇厚，略带一丝岁月的沉淀感，说话节奏舒缓从容、娓娓道来。整体风格极具文学气息与治愈感，仿佛一位历经世事的老友在耳畔低语，非常适合用于文学散文朗诵、深夜情感电台或文化类纪录片解说，能够完美演绎看透红尘的智者形象。",
    "trait": "温润醇厚,娓娓道来,治愈感",
    "scene": "有声书与小说、纪录片、在线教育",
    "age": "中年",
    "ageCategory": "中年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Chinese-Mandarin-_Lyrical_Voice-eaf50885bd-v6-8ab051e9499e8bb39db1.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Chinese-Mandarin-_Lyrical_Voice-4311241c3d.mp3",
    "accent": "普通话",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Chinese (Mandarin)_Straightforward_Boy",
    "providerVoiceId": "Chinese (Mandarin)_Straightforward_Boy",
    "name": "夏云澈",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话"
    ],
    "description": "这是一个清爽真诚的青年男声。其声线明朗干净，说话语气直率自然，如同邻家少年般亲切。整体风格阳光且毫无心机，极具生活气息，非常适合用于现代都市广播剧、恋爱游戏角色或日常Vlog配音等场景，能够完美诠释直肠子的率真大男孩形象。",
    "trait": "明朗干净,直率自然,邻家少年",
    "scene": "游戏与RPG、广播剧、在线教育、播客与社媒",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Chinese-Mandarin-_Straightforward_Boy-d0a12dfcf0-v6-8f3fe7c29334fdf96590.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Chinese-Mandarin-_Straightforward_Boy-57326d8015.mp3",
    "accent": "普通话",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Chinese (Mandarin)_Sincere_Adult",
    "providerVoiceId": "Chinese (Mandarin)_Sincere_Adult",
    "name": "钟云汐",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话"
    ],
    "description": "这是一个年轻温润的男声。其声线清澈干净且略带磁性，说话节奏自然舒缓、娓娓道来。整体风格真诚且具有治愈感，给人一种亲密无间的陪伴感。推荐用于情感陪伴类应用、女性向游戏或现代都市题材的有声书，能够完美契合温柔学长或贴心挚友的设定。",
    "trait": "清澈干净,娓娓道来,具有治愈感",
    "scene": "有声书与小说、播客与社媒、企业宣传与旁白",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Chinese-Mandarin-_Sincere_Adult-397fcb1e85-v6-bdc38de1034c1395fb45.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Chinese-Mandarin-_Sincere_Adult-24b0dc7b60.mp3",
    "accent": "普通话",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Chinese (Mandarin)_Gentle_Senior",
    "providerVoiceId": "Chinese (Mandarin)_Gentle_Senior",
    "name": "叶清瑶",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话"
    ],
    "description": "这是一个温柔知性的女声。其声线温婉柔和且略带磁性，说话节奏娓娓道来、语调舒缓。整体风格亲切且富有感染力，给人一种如沐春风的感觉，非常适合用于治愈系有声读物、情感电台节目或知识科普类视频等场景。",
    "trait": "温婉柔和,娓娓道来,亲切且富有感染力",
    "scene": "有声书与小说、纪录片",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Chinese-Mandarin-_Gentle_Senior-e4a2c44452-v6-c70fbc7e0b5ec6b0a038.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Chinese-Mandarin-_Gentle_Senior-97ea7b3180.mp3",
    "accent": "普通话",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Chinese (Mandarin)_Stubborn_Friend",
    "providerVoiceId": "Chinese (Mandarin)_Stubborn_Friend",
    "name": "沈景安",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话"
    ],
    "description": "这是一个充满朝气的青年男声。其声线清朗温暖且富有亲和力，说话节奏自然随性、松弛有度。整体风格阳光开朗且带有浓郁的邻家大男孩真实感，极具现充感与生活气息。这种音色非常适合用于都市恋爱广播剧、乙女游戏男主或现代生活类广告等场景，特别是针对热情开朗的男性朋友或追求梦想的新人演员角色的演绎。",
    "trait": "清朗温暖,自然随性,邻家大男孩",
    "scene": "游戏与RPG、有声书与小说、动漫与动画、角色配音",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Chinese-Mandarin-_Stubborn_Friend-996bc05a35-v6-18685a99427b89c51d8a.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Chinese-Mandarin-_Stubborn_Friend-582e37773d.mp3",
    "accent": "普通话",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Chinese (Mandarin)_Crisp_Girl",
    "providerVoiceId": "Chinese (Mandarin)_Crisp_Girl",
    "name": "傅昭晴",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话"
    ],
    "description": "这是一个专为情感共鸣设计的青年女声。其声线清脆甜美且略带感性的气息，说话节奏舒缓柔和、娓娓道来，给人一种治愈亲切的邻家感。非常适合用于情感电台节目、现代都市有声小说或治愈系短视频旁白，能够完美契合深夜倾听者的设定。",
    "trait": "清脆甜美,娓娓道来,治愈亲切",
    "scene": "有声书与小说、广告与预告、播客与社媒",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Chinese-Mandarin-_Crisp_Girl-7827fd194c-v6-a2ae3bfe8c34d73875a8.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Chinese-Mandarin-_Crisp_Girl-b95d648da0.mp3",
    "accent": "普通话",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Chinese (Mandarin)_Pure-hearted_Boy",
    "providerVoiceId": "Chinese (Mandarin)_Pure-hearted_Boy",
    "name": "方予舟",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话"
    ],
    "description": "这是一个充满少年感的男声。其声线清澈干净且温暖柔和，说话节奏自然舒缓、娓娓道来。整体风格真诚且纯真，自带一种极强的邻家男孩感，非常适合用于校园题材广播剧、情感类电台节目或青春动漫配音，能够完美演绎温柔学长或单纯少年的形象。",
    "trait": "清澈干净,娓娓道来,邻家男孩感",
    "scene": "游戏与RPG、广播剧、有声书与小说、动漫与动画、角色配音",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Chinese-Mandarin-_Pure-hearted_Boy-2524fe6bdd-v6-2f16ef65f29e09f6790b.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Chinese-Mandarin-_Pure-hearted_Boy-cd3805c467.mp3",
    "accent": "普通话",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Chinese (Mandarin)_Soft_Girl",
    "providerVoiceId": "Chinese (Mandarin)_Soft_Girl",
    "name": "苏书悦",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话"
    ],
    "description": "该音色以甜美软糯的音质和轻快自然的节奏为特征，极具辨识度。它带有明显的台湾腔调，语调上扬且自带撒娇感，整体风格亲切活泼，是校园恋爱游戏和现代言情广播剧类项目的理想选择，特别是针对邻家学妹角色的演绎。",
    "trait": "甜美软糯,轻快自然,亲切活泼",
    "scene": "游戏与RPG、有声书与小说、角色配音、播客与社媒",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Chinese-Mandarin-_Soft_Girl-d9d1703269-v6-81ce6624ea402b934126.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Chinese-Mandarin-_Soft_Girl-02f0fdd143.mp3",
    "accent": "台湾普通话",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Cantonese_ProfessionalHost（F)",
    "providerVoiceId": "Cantonese_ProfessionalHost（F)",
    "name": "乔令仪",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "粤语"
    ],
    "description": "这是一个干练专业的女声。其声线清晰明亮且字正腔圆，说话节奏紧凑流畅、掷地有声。整体风格端庄严肃且客观冷静，自带一种强烈的新闻现场感，非常适合用于粤语新闻播报、财经快讯或严肃的社会纪实类节目。",
    "trait": "清晰明亮,紧凑流畅,新闻现场感",
    "scene": "纪录片、广告与预告、播客与社媒、企业宣传与旁白",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Cantonese_ProfessionalHost-F-17e4254800-v6-ee8b8ad1411fc16d7134.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Cantonese_ProfessionalHost-F-9fe747920a.mp3",
    "accent": "粤语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Cantonese_GentleLady",
    "providerVoiceId": "Cantonese_GentleLady",
    "name": "陆予宁",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "粤语"
    ],
    "description": "这是一个极具生活气息的年轻女声。其声线略带沙哑与磁性，说话节奏语速较快、抑扬顿挫，充满了丰富的情绪张力。整体风格直率自然，像是在与朋友面对面闲聊，给人一种真实、不做作的亲切感。推荐用于现代题材的广播剧、人物访谈类播客或短视频旁白，能够完美演绎性格开朗、敢爱敢恨的都市女孩角色。",
    "trait": "略带沙哑,语速较快,直率自然",
    "scene": "广播剧、播客与社媒",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Cantonese_GentleLady-9fc79a7cbc-v6-8c9e699871aae34e7a85.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Cantonese_GentleLady-c8b0ca13d6.mp3",
    "accent": "粤语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Cantonese_ProfessionalHost（M)",
    "providerVoiceId": "Cantonese_ProfessionalHost（M)",
    "name": "柳峥宇",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "粤语"
    ],
    "description": "中文 (粤语) · 专业男主持",
    "trait": "专业男主持",
    "scene": "MiniMax 官方系统音色",
    "age": "未标注",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Cantonese_ProfessionalHost-M-1c24325f69-v6-59127afb88973551fa90.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Cantonese_ProfessionalHost-M-4cc13f72ee-generated.mp3",
    "accent": "粤语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Cantonese_PlayfulMan",
    "providerVoiceId": "Cantonese_PlayfulMan",
    "name": "柳煦庭",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "粤语"
    ],
    "description": "中文 (粤语) · 活泼男声",
    "trait": "活泼男声",
    "scene": "MiniMax 官方系统音色",
    "age": "未标注",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Cantonese_PlayfulMan-c3df168fc6-v6-3f2f044a7448b1fedea4.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Cantonese_PlayfulMan-799f2a815e-generated.mp3",
    "accent": "粤语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Cantonese_CuteGirl",
    "providerVoiceId": "Cantonese_CuteGirl",
    "name": "庄乐瑶",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "粤语"
    ],
    "description": "该音色以稚嫩甜美的音质和灵动自然的节奏为特征，极具辨识度。它能准确传达纯真、纠结的情绪，是儿童广播剧和有声绘本类项目的理想选择，特别是针对小女孩角色的演绎。",
    "trait": "稚嫩甜美,灵动自然,纯真",
    "scene": "有声书与小说、动漫与动画、在线教育、播客与社媒",
    "age": "儿童",
    "ageCategory": "儿童",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Cantonese_CuteGirl-fce53fab22-v6-32d63df7742cdd70389a.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Cantonese_CuteGirl-db49c4bd4d.mp3",
    "accent": "粤语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Cantonese_KindWoman",
    "providerVoiceId": "Cantonese_KindWoman",
    "name": "庄嘉禾",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "粤语"
    ],
    "description": "这是一个成熟干练的女声。其声线略带沙哑且富有磁性，说话节奏娓娓道来、自然流畅。整体风格亲切犀利且极具生活气息，非常适合用于社会情感类播客、短视频独白或都市题材广播剧等场景。",
    "trait": "略带沙哑,娓娓道来,亲切犀利",
    "scene": "有声书与小说、播客与社媒",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Cantonese_KindWoman-ec03605fc0-v6-1ee7b9038c17c1e66227.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Cantonese_KindWoman-f91765471b.mp3",
    "accent": "粤语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Santa_Claus",
    "providerVoiceId": "Santa_Claus",
    "name": "阿尔伯特Albert",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "英语",
    "languages": [
      "英文"
    ],
    "description": "英文 · Santa Claus",
    "trait": "Santa Claus",
    "scene": "MiniMax 官方系统音色",
    "age": "未标注",
    "ageCategory": "老年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Santa_Claus-9fe77ffba9-v6-03cbb405af2cb97e7712.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Santa_Claus-2943a73768-generated.mp3",
    "accent": "英式英语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Grinch",
    "providerVoiceId": "Grinch",
    "name": "格雷格Greg",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "英语",
    "languages": [
      "英文"
    ],
    "description": "英文 · Grinch",
    "trait": "Grinch",
    "scene": "MiniMax 官方系统音色",
    "age": "未标注",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Grinch-3683a15719-v6-644e41c41a825b6e1765.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Grinch-bf63ecb191-generated.mp3",
    "accent": "美式英语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Rudolph",
    "providerVoiceId": "Rudolph",
    "name": "诺亚Noah",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "英语",
    "languages": [
      "英文"
    ],
    "description": "英文 · Rudolph",
    "trait": "Rudolph",
    "scene": "MiniMax 官方系统音色",
    "age": "未标注",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Rudolph-fc3e183ec8-v6-f591c505df78360eaf85.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Rudolph-03e7d2f497-generated.mp3",
    "accent": "美式英语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Arnold",
    "providerVoiceId": "Arnold",
    "name": "马洛Marlow",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "英语",
    "languages": [
      "英文"
    ],
    "description": "英文 · Arnold",
    "trait": "Arnold",
    "scene": "MiniMax 官方系统音色",
    "age": "未标注",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Arnold-775db8f86c-v6-1e476ef95dc0d1f3452c.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Arnold-15830c454f-generated.mp3",
    "accent": "其他",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Charming_Santa",
    "providerVoiceId": "Charming_Santa",
    "name": "埃德蒙Edmund",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "英语",
    "languages": [
      "英文"
    ],
    "description": "英文 · Charming Santa",
    "trait": "Charming Santa",
    "scene": "MiniMax 官方系统音色",
    "age": "未标注",
    "ageCategory": "老年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Charming_Santa-71d8507c70-v6-774a4d0b2aa5c36cb676.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Charming_Santa-bf52e58a5b-generated.mp3",
    "accent": "其他",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Charming_Lady",
    "providerVoiceId": "Charming_Lady",
    "name": "艾薇Ivy",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "英语",
    "languages": [
      "英文"
    ],
    "description": "英文 · Charming Lady",
    "trait": "Charming Lady",
    "scene": "MiniMax 官方系统音色",
    "age": "未标注",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Charming_Lady-1c08f5f03c-v6-017df69a04e4167e824e.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Charming_Lady-bcdc3329f8-generated.mp3",
    "accent": "英式英语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Sweet_Girl",
    "providerVoiceId": "Sweet_Girl",
    "name": "米娅Mia",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "英语",
    "languages": [
      "英文"
    ],
    "description": "英文 · Sweet Girl",
    "trait": "Sweet Girl",
    "scene": "MiniMax 官方系统音色",
    "age": "未标注",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Sweet_Girl-1db5dd33d3-v6-5c555cf22b782fc81e77.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Sweet_Girl-5c3ea13521-generated.mp3",
    "accent": "美式英语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Cute_Elf",
    "providerVoiceId": "Cute_Elf",
    "name": "利奥Leo",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "英语",
    "languages": [
      "英文"
    ],
    "description": "英文 · Cute Elf",
    "trait": "Cute Elf",
    "scene": "MiniMax 官方系统音色",
    "age": "未标注",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Cute_Elf-a350b11e0d-v6-fbb182cb268dd622a9cc.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Cute_Elf-31d8ad7bc0-generated.mp3",
    "accent": "美式英语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Attractive_Girl",
    "providerVoiceId": "Attractive_Girl",
    "name": "塞拉Serena",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "英语",
    "languages": [
      "英文"
    ],
    "description": "英文 · Attractive Girl",
    "trait": "Attractive Girl",
    "scene": "MiniMax 官方系统音色",
    "age": "未标注",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Attractive_Girl-d78b2d18e0-v6-7143c9158b93e1559867.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Attractive_Girl-ab460099fa-generated.mp3",
    "accent": "美式英语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Serene_Woman",
    "providerVoiceId": "Serene_Woman",
    "name": "克莱尔Claire",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "英语",
    "languages": [
      "英文"
    ],
    "description": "英文 · Serene Woman",
    "trait": "Serene Woman",
    "scene": "MiniMax 官方系统音色",
    "age": "未标注",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Serene_Woman-f30e6e9660-v6-ef6e17fa47a87ed3ddb9.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Serene_Woman-b9dd4434f7-generated.mp3",
    "accent": "美式英语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-English_Trustworthy_Man",
    "providerVoiceId": "English_Trustworthy_Man",
    "name": "欧文Owen",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "英语",
    "languages": [
      "英文"
    ],
    "description": "英文 · Trustworthy Man",
    "trait": "Trustworthy Man",
    "scene": "MiniMax 官方系统音色",
    "age": "未标注",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-English_Trustworthy_Man-8d52db6f6f-v6-f58a2ba3badc456579bc.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/English_Trustworthy_Man-6f01809c72-generated.mp3",
    "accent": "美式英语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-English_Graceful_Lady",
    "providerVoiceId": "English_Graceful_Lady",
    "name": "艾琳Eileen",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "英语",
    "languages": [
      "英文"
    ],
    "description": "这是一个优雅知性的女声。其声线温润且充满贵气，说话节奏舒缓、抑扬顿挫。整体风格高贵且富有文学感，非常适合用于经典名著朗读、影视剧旁白或高端品牌广告等场景。",
    "trait": "温润,舒缓,文学感",
    "scene": "有声书与小说、广告与预告、播客与社媒",
    "age": "老年",
    "ageCategory": "老年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-English_Graceful_Lady-26fb9052e2-v6-2309c7c4cb19061c885d.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/English_Graceful_Lady-000fd623a3.mp3",
    "accent": "英式英语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-English_Aussie_Bloke",
    "providerVoiceId": "English_Aussie_Bloke",
    "name": "布莱克Blake",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "英语",
    "languages": [
      "英文"
    ],
    "description": "这是一个充满活力的男声。其声线明亮且富有质感，说话节奏松弛自然。整体风格随性且略带调侃，非常适合用于社交媒体视频、现代生活类广告或轻松脱口秀等场景。",
    "trait": "明亮且富有质感,松弛自然,随性且略带调侃",
    "scene": "广告与预告、播客与社媒",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-English_Aussie_Bloke-7eeb3dbe07-v6-a29068bd784fd862f633.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/English_Aussie_Bloke-15057eb292.mp3",
    "accent": "澳大利亚英语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-English_Whispering_girl",
    "providerVoiceId": "English_Whispering_girl",
    "name": "莉亚Leah",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "英语",
    "languages": [
      "英文"
    ],
    "description": "英文 · Whispering girl",
    "trait": "Whispering girl",
    "scene": "MiniMax 官方系统音色",
    "age": "未标注",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-English_Whispering_girl-aca3a8ebe7-v6-12f467dc796390dfe5d3.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/English_Whispering_girl-84803b2396-generated.mp3",
    "accent": "其他",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-English_Diligent_Man",
    "providerVoiceId": "English_Diligent_Man",
    "name": "伊莱Eli",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "英语",
    "languages": [
      "英文"
    ],
    "description": "这是一个充满活力的青年男声。其声线清脆明亮且极具穿透力，说话节奏轻快活泼、富有动感。整体风格热情且具有极强的感染力，非常适合用于播客节目、商业广告或社交媒体视频等场景，特别是针对年轻听众的快节奏资讯演绎。",
    "trait": "清脆明亮,轻快活泼,热情感染力",
    "scene": "在线教育、播客与社媒、企业宣传与旁白",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-English_Diligent_Man-6f4ecb501d-v6-06d3c9516cf5d71efeb3.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/English_Diligent_Man-d1c08680f0.mp3",
    "accent": "印度英语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-English_Gentle-voiced_man",
    "providerVoiceId": "English_Gentle-voiced_man",
    "name": "西蒙Simon",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "英语",
    "languages": [
      "英文"
    ],
    "description": "这是一个成熟温厚的男声。其声线醇厚深沉且略带沙哑的颗粒感，说话节奏舒缓从容、娓娓道来。整体风格温暖且极具故事感，非常适合用于沉浸式有声小说、情感电台讲述或电影感十足的独白场景。",
    "trait": "醇厚深沉,娓娓道来,极具故事感",
    "scene": "有声书与小说、广告与预告、播客与社媒、企业宣传与旁白",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-English_Gentle-voiced_man-b892ea5cad-v6-cfa6e5ddafe3c3af7fa3.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/English_Gentle-voiced_man-6639243edb.mp3",
    "accent": "美式英语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Japanese_IntellectualSenior",
    "providerVoiceId": "Japanese_IntellectualSenior",
    "name": "青柳和真",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "日语",
    "languages": [
      "日语"
    ],
    "description": "这是一个温润如玉的青年男声。其声线清澈柔和且略带气声，说话节奏舒缓从容、充满诗意。整体风格宁静致远，透着一种历经世事的淡然与哲思，非常适合用于古风游戏角色、动漫独白或治愈系广播剧等场景，能够完美演绎温柔浪客的形象。",
    "trait": "清澈柔和,舒缓从容,宁静致远",
    "scene": "游戏与RPG、广播剧、动漫与动画、角色配音",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Japanese_IntellectualSenior-42684d6394-v6-12093bd1fea12a03fcae.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Japanese_IntellectualSenior-b7d38233fa.mp3",
    "accent": "标准日语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Japanese_DecisivePrincess",
    "providerVoiceId": "Japanese_DecisivePrincess",
    "name": "白石凛奈",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "日语",
    "languages": [
      "日语"
    ],
    "description": "这是一个自信干练的年轻女声。其声线清脆透亮且穿透力强，说话语速较快、节奏紧凑果断。整体风格傲娇严厉又不失认真，展现出一种强烈的责任感与领导力，非常适合演绎动漫中的强势少女、年轻女高管或游戏中雷厉风行的女性角色。",
    "trait": "清脆透亮,节奏紧凑,傲娇严厉",
    "scene": "游戏与RPG、动漫与动画、角色配音、广告与预告",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Japanese_DecisivePrincess-a0a77135d7-v6-27fef809f7f009a0d487.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Japanese_DecisivePrincess-2cda74893e.mp3",
    "accent": "标准日语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Japanese_LoyalKnight",
    "providerVoiceId": "Japanese_LoyalKnight",
    "name": "北原隼人",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "日语",
    "languages": [
      "日语"
    ],
    "description": "这是一个清冷孤傲的青年男声。其声线锐利且略带沙哑，说话节奏干脆利落、力度感强。整体风格冷静且坚毅，自带一种强烈的守护者氛围，非常适合用于二次元游戏、热血动漫或广播剧等场景，能够完美契合忠诚护卫或冷面战士的设定。",
    "trait": "清冷孤傲,干脆利落,守护者氛围",
    "scene": "游戏与RPG、有声书与小说、动漫与动画、角色配音",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Japanese_LoyalKnight-184f880d81-v6-521d97710276e0cb9945.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Japanese_LoyalKnight-516b5a22a0.mp3",
    "accent": "标准日语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Japanese_DominantMan",
    "providerVoiceId": "Japanese_DominantMan",
    "name": "藤野凉介",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "日语",
    "languages": [
      "日语"
    ],
    "description": "这是一个清冷沉稳的青年男声。其声线质感冷冽且略带疏离感，说话节奏冷静克制、干脆利落。整体风格高冷且充满贵族气质，能够准确传达出隐忍、严肃却又可靠的情绪，是动漫游戏与广播剧类项目的理想选择，特别是针对高冷少爷或孤傲剑客角色的演绎。",
    "trait": "质感冷冽,冷静克制,高冷",
    "scene": "游戏与RPG、广播剧、有声书与小说、动漫与动画、角色配音",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Japanese_DominantMan-51739d670c-v6-8f40c1cd1eb1f5ba9723.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Japanese_DominantMan-43c8583607.mp3",
    "accent": "标准日语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Japanese_SeriousCommander",
    "providerVoiceId": "Japanese_SeriousCommander",
    "name": "杉浦雅人",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "日语",
    "languages": [
      "日语"
    ],
    "description": "该音色以温润清冷的音质和优雅从容的节奏为特征，极具辨识度。它能准确传达理智、温柔且略带神秘感的情绪，是二次元游戏和动漫配音类项目的理想选择，特别是针对天才少年或神秘学者角色的演绎。",
    "trait": "温润清冷,优雅从容,神秘学者感",
    "scene": "游戏与RPG、有声书与小说、动漫与动画、角色配音",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Japanese_SeriousCommander-e0a33182d7-v6-f3379c5dba369483ed51.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Japanese_SeriousCommander-c20c8168a2.mp3",
    "accent": "标准日语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Japanese_ColdQueen",
    "providerVoiceId": "Japanese_ColdQueen",
    "name": "黑川澄香",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "日语",
    "languages": [
      "日语"
    ],
    "description": "这是一个成熟冷艳的女声。其声线低沉略带沙哑，说话节奏慵懒随意却透着一股不容置疑的威严。整体风格高冷孤傲，自带一种极具压迫感与魅力的御姐气场，非常适合用于二次元游戏中的霸气女王、冷酷女杀手或动漫中性格复杂的反派高层等角色。",
    "trait": "低沉沙哑,慵懒随意,御姐气场",
    "scene": "游戏与RPG、广播剧、动漫与动画",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Japanese_ColdQueen-d2707d4130-v6-09d045c7cd52f6634ab2.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Japanese_ColdQueen-98d8f4508d.mp3",
    "accent": "标准日语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Japanese_DependableWoman",
    "providerVoiceId": "Japanese_DependableWoman",
    "name": "宫坂明奈",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "日语",
    "languages": [
      "日语"
    ],
    "description": "这是一位充满少年感的元气女声。其声线清脆明亮且极具穿透力，说话节奏干脆利落、抑扬顿挫，能够准确传达出自信与热血的情绪。整体风格爽朗大方，非常适合演绎热血动漫中的正义少年、RPG游戏里的冒险伙伴或儿童有声书中的勇敢主角。",
    "trait": "清脆明亮,干脆利落,爽朗大方",
    "scene": "游戏与RPG、广播剧、动漫与动画、角色配音",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Japanese_DependableWoman-9cc947a2cc-v6-010900cac66ce4f87350.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Japanese_DependableWoman-9ecc0e4366.mp3",
    "accent": "标准日语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Japanese_GentleButler",
    "providerVoiceId": "Japanese_GentleButler",
    "name": "松原宗介",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "日语",
    "languages": [
      "日语"
    ],
    "description": "这是一个充满魅力的年轻男声。其声线磁性且略带慵懒，说话节奏轻松自如，语调中常含着一丝自信的笑意与调侃。整体风格优雅而神秘，极具辨识度，非常适合演绎动漫或RPG游戏中的英俊骑士、狡黠智囊或乙女游戏中的深情男主角色。",
    "trait": "磁性且略带慵懒,轻松自如,优雅而神秘",
    "scene": "游戏与RPG、广播剧、有声书与小说、动漫与动画、角色配音",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Japanese_GentleButler-d73a0769ca-v6-91bd310cabfbb739373b.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Japanese_GentleButler-cc09fc4c94.mp3",
    "accent": "标准日语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Japanese_KindLady",
    "providerVoiceId": "Japanese_KindLady",
    "name": "花村惠理",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "日语",
    "languages": [
      "日语"
    ],
    "description": "这是一个极具魅力的成熟女声。其声线温柔妩媚且略带气声，说话节奏舒缓从容、充满撩拨意味。整体风格优雅且富有御姐气质，自带一种迷人的亲切感，非常适合用于恋爱模拟游戏、二次元动漫角色或角色扮演类剧情中的知性大姐姐形象。",
    "trait": "温柔妩媚,舒缓从容,知性御姐感",
    "scene": "游戏与RPG、有声书与小说、动漫与动画",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Japanese_KindLady-6fa8ea0344-v6-36897c58e6409481ecfa.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Japanese_KindLady-c4c02caa30.mp3",
    "accent": "标准日语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Japanese_CalmLady",
    "providerVoiceId": "Japanese_CalmLady",
    "name": "水野澄乃",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "日语",
    "languages": [
      "日语"
    ],
    "description": "这是一个成熟冷静的女声。其声线清冷优雅且富有质感，说话节奏从容不迫、张弛有度。整体风格高贵且充满自信，给人一种智谋在握的感觉，非常适合用于游戏角色配音、动漫御姐角色或剧情向广播剧等场景，特别是针对贵族小姐或冷艳女侠角色的演绎。",
    "trait": "清冷优雅,从容不迫,高贵自信",
    "scene": "游戏与RPG、广播剧、有声书与小说、动漫与动画、纪录片",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Japanese_CalmLady-2bd39e24f2-v6-d9127bf1bd725ee79243.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Japanese_CalmLady-da63cb1fed.mp3",
    "accent": "标准日语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Japanese_OptimisticYouth",
    "providerVoiceId": "Japanese_OptimisticYouth",
    "name": "小仓晴斗",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "日语",
    "languages": [
      "日语"
    ],
    "description": "该音色是一个典型的日系青年男声，拥有清爽明快的音质和充满活力的节奏感，极具感染力。声音中透着一股毫无保留的乐观与热血，语调上扬且富有弹性，能完美传达出兴奋、友善以及偶尔有些脱线的喜剧感。这种极具亲和力的声音非常适合用于角色扮演游戏中的冒险伙伴、日系动漫里的热血主角或欢快氛围的广告旁白，生动演绎出那种永远充满希望的阳光少年形象。",
    "trait": "清爽明快,充满活力,阳光少年形象",
    "scene": "游戏与RPG、动漫与动画、角色配音、广告与预告",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Japanese_OptimisticYouth-a6685ebaf9-v6-af6dea5bc6183352c119.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Japanese_OptimisticYouth-d41145ebe7.mp3",
    "accent": "标准日语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Japanese_GenerousIzakayaOwner",
    "providerVoiceId": "Japanese_GenerousIzakayaOwner",
    "name": "大桥雄太",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "日语",
    "languages": [
      "日语"
    ],
    "description": "该音色以豪爽沙哑的音质和激情高昂的节奏为特征，极具辨识度。它能准确传达自信热血的情绪，是热血动漫和游戏角色配音类项目的理想选择，特别是针对那些性格张扬的帮派首领角色的演绎。",
    "trait": "豪爽沙哑,激情高昂,自信热血",
    "scene": "游戏与RPG、动漫与动画、广告与预告、播客与社媒",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Japanese_GenerousIzakayaOwner-140b22bc0c-v6-a3a10deb523501c73526.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Japanese_GenerousIzakayaOwner-e4edecdf18.mp3",
    "accent": "标准日语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Japanese_SportyStudent",
    "providerVoiceId": "Japanese_SportyStudent",
    "name": "三浦拓真",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "日语",
    "languages": [
      "日语"
    ],
    "description": "该音色以清亮且充满朝气的音质和干脆利落的节奏为特征，极具辨识度。它能准确传达自信飞扬与略带调侃的情绪，是日系动漫和二次元游戏类项目的理想选择，特别是针对热血运动少年或校园风云人物角色的演绎。",
    "trait": "清亮朝气,干脆利落,自信飞扬",
    "scene": "游戏与RPG、有声书与小说、动漫与动画、角色配音",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Japanese_SportyStudent-80ccedaa1e-v6-910ec6cc16bdfd0fb8ef.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Japanese_SportyStudent-f376cb04c1.mp3",
    "accent": "标准日语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Japanese_InnocentBoy",
    "providerVoiceId": "Japanese_InnocentBoy",
    "name": "河合奏太",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "日语",
    "languages": [
      "日语"
    ],
    "description": "该音色以清澈纯净的音质和温和礼貌的节奏为特征，透着满满的少年感。它能准确传达乖巧、忠诚的情绪，是动漫动画和游戏与RPG类项目的理想选择，特别是针对治愈系正太或贴心弟弟角色的演绎。",
    "trait": "清澈纯净,温和礼貌,少年感",
    "scene": "游戏与RPG、有声书与小说、动漫与动画、角色配音",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Japanese_InnocentBoy-5980017b2c-v6-a14ce204237fc978b2a9.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Japanese_InnocentBoy-824270ec07.mp3",
    "accent": "标准日语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Japanese_GracefulMaiden",
    "providerVoiceId": "Japanese_GracefulMaiden",
    "name": "柴田纱月",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "日语",
    "languages": [
      "日语"
    ],
    "description": "这是一个甜美优雅的日语女声。其声线清澈柔和且略带气声，说话节奏舒缓有礼、不紧不慢。整体风格治愈且知性，给人一种高贵而亲切的感觉。非常适合用于二次元游戏角色配音、动漫动画或治愈系有声读物等场景，能够完美契合温婉的巫女或深居简出的千金大小姐设定。",
    "trait": "清澈柔和,舒缓有礼,治愈且知性",
    "scene": "游戏与RPG、有声书与小说、动漫与动画、角色配音",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Japanese_GracefulMaiden-21089e4569-v6-7c6f9bd284d7dfb78efd.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Japanese_GracefulMaiden-19772aef54.mp3",
    "accent": "标准日语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Korean_SweetGirl",
    "providerVoiceId": "Korean_SweetGirl",
    "name": "韩彩琳",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "韩语",
    "languages": [
      "韩语"
    ],
    "description": "这是一个充满活力的年轻女声。其音色清脆甜美且极具少女感，说话节奏轻快活泼、情绪高昂。整体风格热情且富有感染力，能准确传达兴奋与喜悦的情绪，非常适合用于动漫解说、二次元电台节目或游戏角色配音，特别是针对元气少女角色的演绎。",
    "trait": "清脆甜美,轻快活泼,热情且富有感染力",
    "scene": "广播剧、动漫与动画、角色配音、纪录片、播客与社媒、企业宣传与旁白",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Korean_SweetGirl-a0df2a7d88-v6-1739e06937a1527c692f.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Korean_SweetGirl-3d99482670.mp3",
    "accent": "标准韩语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Korean_CheerfulBoyfriend",
    "providerVoiceId": "Korean_CheerfulBoyfriend",
    "name": "朴允灿",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "韩语",
    "languages": [
      "韩语"
    ],
    "description": "该音色以清亮干净的音质和轻快跃动的节奏为特征，极具少年感与亲和力。它能准确传达温暖、阳光且略带宠溺的情绪，是乙女向游戏和动漫配音类项目的理想选择，特别是针对贴心男友角色的演绎。",
    "trait": "清亮干净,轻快跃动,温暖阳光",
    "scene": "游戏与RPG、动漫与动画、角色配音、企业宣传与旁白",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Korean_CheerfulBoyfriend-8b45cb74b8-v6-c52c95c37af3896146fc.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Korean_CheerfulBoyfriend-4f3f2f3f78.mp3",
    "accent": "标准韩语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Korean_EnchantingSister",
    "providerVoiceId": "Korean_EnchantingSister",
    "name": "崔静雅",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "韩语",
    "languages": [
      "韩语"
    ],
    "description": "这是一个成熟迷人的女声。其声线略带沙哑且极富磁性，说话节奏从容自信、张弛有度。整体风格高冷威严又不失邻家姐姐的亲切，能准确传达看似冷淡实则关怀的复杂情绪，极具辨识度。它是动漫游戏、角色配音或智能系统提示音的理想选择，特别是针对高冷御姐或知性大姐姐角色的演绎。",
    "trait": "极富磁性,从容自信,高冷威严",
    "scene": "游戏与RPG、有声书与小说、动漫与动画、角色配音、企业宣传与旁白",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Korean_EnchantingSister-4875bef430-v6-01352136210cdf1b60a4.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Korean_EnchantingSister-bb2b5f830f.mp3",
    "accent": "标准韩语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Korean_ShyGirl",
    "providerVoiceId": "Korean_ShyGirl",
    "name": "柳素温",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "韩语",
    "languages": [
      "韩语"
    ],
    "description": "这是一个甜美温婉的年轻女声。其声线细腻且略带羞涩的气声，语调轻柔舒缓，给人一种邻家少女般楚楚动人的感觉。整体风格乖巧可爱，极具亲和力，非常适合用于日系动漫角色配音、恋爱模拟游戏或二次元有声读物等场景，能够完美契合害羞学妹或贴心妹妹的设定。",
    "trait": "细腻气声,轻柔舒缓,邻家少女感",
    "scene": "游戏与RPG、有声书与小说、动漫与动画、角色配音",
    "age": "儿童",
    "ageCategory": "儿童",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Korean_ShyGirl-b0b8c33734-v6-234352774cec7da4a9bf.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Korean_ShyGirl-2a1c85aec3.mp3",
    "accent": "标准韩语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Korean_ReliableSister",
    "providerVoiceId": "Korean_ReliableSister",
    "name": "郑智岚",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "韩语",
    "languages": [
      "韩语"
    ],
    "description": "该音色以干练且略带沙哑的音质和干脆利落的节奏为特征，极具辨识度。它能准确传达自信、强势且略带傲气的情绪，是动漫游戏和个性化语音导航类项目的理想选择，特别是针对性格直爽、行事果断的酷飒御姐角色的演绎。",
    "trait": "干练沙哑,干脆利落,酷飒御姐感",
    "scene": "游戏与RPG、动漫与动画、角色配音、企业宣传与旁白",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Korean_ReliableSister-cc19219a19-v6-193b8520e63aa149cf78.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Korean_ReliableSister-9280a2dd3b.mp3",
    "accent": "标准韩语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Korean_StrictBoss",
    "providerVoiceId": "Korean_StrictBoss",
    "name": "申泰赫",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "韩语",
    "languages": [
      "韩语"
    ],
    "description": "这是一个霸气狂傲的男声。其声线清亮透彻且极具穿透力，说话节奏抑扬顿挫、充满戏剧张力。整体风格高傲且唯我独尊，带有强烈的王者气场，非常适合用于热血动漫反派、史诗游戏Boss或霸道君主角色的精彩演绎。",
    "trait": "清亮透彻,抑扬顿挫,王者气场",
    "scene": "游戏与RPG、广播剧、动漫与动画",
    "age": "中年",
    "ageCategory": "中年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Korean_StrictBoss-adb0f95367-v6-e990e63ae4c63326d91f.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Korean_StrictBoss-ba2bba0e45.mp3",
    "accent": "标准韩语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Korean_SassyGirl",
    "providerVoiceId": "Korean_SassyGirl",
    "name": "吴夏妍",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "韩语",
    "languages": [
      "韩语"
    ],
    "description": "这是一个充满活力的年轻女声。其声线甜美娇俏且高亢明亮，说话节奏轻快跳跃、富有张力。整体风格元气满满且略带傲娇感，能生动地传达出喜怒哀乐的情绪变化，非常适合用于恋爱模拟游戏、日系动漫配音或二次元相关的系统提示音，特别是针对那些性格直率、偶尔撒娇的少女角色的演绎。",
    "trait": "甜美娇俏,轻快跳跃,元气满满",
    "scene": "游戏与RPG、有声书与小说、动漫与动画、角色配音",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Korean_SassyGirl-f6f7084668-v6-3cad34d594ff1996fe88.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Korean_SassyGirl-c2a21193c6.mp3",
    "accent": "标准韩语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Korean_ChildhoodFriendGirl",
    "providerVoiceId": "Korean_ChildhoodFriendGirl",
    "name": "尹瑞彬",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "韩语",
    "languages": [
      "韩语"
    ],
    "description": "这是一个充满活力的青年女声。其声线明亮中略带一丝沙哑，极具辨识度，说话节奏干练利落、语速较快且吐字清晰。整体风格自信满满且机灵聪慧，能准确传达出一种专业可靠又不失俏皮的情绪，非常适合用于二次元游戏中的智囊角色、律政题材的动漫配音或快节奏的解说场景。",
    "trait": "明亮沙哑,干练利落,自信俏皮",
    "scene": "游戏与RPG、广播剧、有声书与小说、动漫与动画、角色配音",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Korean_ChildhoodFriendGirl-138e5e7a8d-v6-bf058faa8a5f6a9affff.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Korean_ChildhoodFriendGirl-11be3d9dc8.mp3",
    "accent": "标准韩语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Korean_PlayboyCharmer",
    "providerVoiceId": "Korean_PlayboyCharmer",
    "name": "宋志勋",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "韩语",
    "languages": [
      "韩语"
    ],
    "description": "这是一个年轻迷人的男声。其声线清亮平滑且略带慵懒的磁性，说话节奏轻快流畅、充满调侃与自信的意味。整体风格潇洒随性且极具撩拨感，听感上既有邻家大哥哥的亲切，又带着一丝坏坏的诱惑力，非常适合用于恋爱养成游戏、动漫帅哥角色配音或广播剧等场景，能够完美演绎风流倜傥的贵公子形象。",
    "trait": "慵懒磁性,轻快流畅,极具撩拨感",
    "scene": "游戏与RPG、动漫与动画、角色配音",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Korean_PlayboyCharmer-1d0641d1d3-v6-01e33825acb93e44e6b5.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Korean_PlayboyCharmer-afbe3fb894.mp3",
    "accent": "标准韩语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Korean_ElegantPrincess",
    "providerVoiceId": "Korean_ElegantPrincess",
    "name": "权恩律",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "韩语",
    "languages": [
      "韩语"
    ],
    "description": "这是一个优雅且略带傲娇感的青年女声。其声线清冷高贵，音质通透，说话节奏干练利落、字字珠玑，透着一种与生俱来的威严与自信。整体风格既有贵族的矜持又不失战士的坚毅，极具辨识度的“御姐音”特质，非常适合用于二次元游戏中的女骑士、动漫中的贵族千金或拥有复杂身世背景的高冷角色配音。",
    "trait": "清冷高贵,干练利落,威严自信",
    "scene": "游戏与RPG、广播剧、有声书与小说、动漫与动画、纪录片",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Korean_ElegantPrincess-15cef6eb05-v6-c46d30a383fce3dd2565.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Korean_ElegantPrincess-847e848114.mp3",
    "accent": "标准韩语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Korean_BraveFemaleWarrior",
    "providerVoiceId": "Korean_BraveFemaleWarrior",
    "name": "白秀京",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "韩语",
    "languages": [
      "韩语"
    ],
    "description": "这是一个坚定英勇的青年女声。其声线清亮凛冽且充满力量感，透着一种刚柔并济的御姐气质。说话节奏干脆利落、掷地有声，咬字十分清晰，完美传达出忠诚、果敢与严肃的情绪。整体风格极具领袖风范与使命感，非常适合用于二次元游戏中的女骑士、正义凛然的指挥官角色配音或热血动漫场景的演绎。",
    "trait": "清亮凛冽,干脆利落,领袖风范",
    "scene": "游戏与RPG、广播剧、有声书与小说、角色配音",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Korean_BraveFemaleWarrior-837099da5f-v6-7daabe7a34b3e871cd99.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Korean_BraveFemaleWarrior-91d5f5e858.mp3",
    "accent": "标准韩语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Korean_BraveYouth",
    "providerVoiceId": "Korean_BraveYouth",
    "name": "林灿宇",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "韩语",
    "languages": [
      "韩语"
    ],
    "description": "这是一个充满活力的青年男声。其声线清朗明快且带有一丝少年的张扬感，说话节奏轻快跳跃、富有情感起伏。整体风格自信且略带调侃，极具恋爱氛围感，能够准确传达出喜欢、宠溺与羞涩交织的情绪，非常适合用于乙女游戏角色、恋爱广播剧或动漫中热血少年的配音，特别是针对那种性格直率、有点坏坏的男友角色的演绎。",
    "trait": "清朗明快,轻快跳跃,恋爱氛围感",
    "scene": "游戏与RPG、广播剧、角色配音",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Korean_BraveYouth-36eb48db14-v6-3de42a3cd9d3823d0760.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Korean_BraveYouth-5a09d50c8e.mp3",
    "accent": "标准韩语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Korean_CalmLady",
    "providerVoiceId": "Korean_CalmLady",
    "name": "安书静",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "韩语",
    "languages": [
      "韩语"
    ],
    "description": "该音色以清冷优雅的音质和沉稳内敛的节奏为特征，极具辨识度。它能准确传达威严、冷静且略带疏离感的情绪，是游戏角色和动漫配音类项目的理想选择，特别是针对拥有高贵身份或女王气场角色的演绎。",
    "trait": "清冷优雅,沉稳内敛,威严冷静",
    "scene": "游戏与RPG、有声书与小说、动漫与动画、角色配音",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Korean_CalmLady-aa7b4cbf49-v6-604ba370683c0c202b7c.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Korean_CalmLady-7f2b56918a.mp3",
    "accent": "标准韩语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Korean_EnthusiasticTeen",
    "providerVoiceId": "Korean_EnthusiasticTeen",
    "name": "河俊灿",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "韩语",
    "languages": [
      "韩语"
    ],
    "description": "该音色以清亮高亢的音质和急促有力的节奏为特征，极具辨识度。它能准确传达热血、自信的情绪，是冒险游戏和热血动漫类项目的理想选择，特别是针对少年英雄角色的演绎。",
    "trait": "清亮高亢,急促有力,少年英雄感",
    "scene": "游戏与RPG、动漫与动画、角色配音",
    "age": "儿童",
    "ageCategory": "儿童",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Korean_EnthusiasticTeen-fcbd4976a7-v6-b6c56af2096cb0f4408a.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Korean_EnthusiasticTeen-045b3c61cd.mp3",
    "accent": "标准韩语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Korean_SoothingLady",
    "providerVoiceId": "Korean_SoothingLady",
    "name": "朴柔恩",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "韩语",
    "languages": [
      "韩语"
    ],
    "description": "该音色以温柔慵懒的音质和舒缓流畅的节奏为特征，极具辨识度。它能准确传达亲切迷人的情绪，是二次元游戏和角色配音类项目的理想选择，特别是针对知性的大姐姐角色的演绎。",
    "trait": "温柔慵懒,舒缓流畅,亲切迷人",
    "scene": "游戏与RPG、有声书与小说、动漫与动画、角色配音",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Korean_SoothingLady-53362f5c44-v6-3461d3ff5353b3ce4269.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Korean_SoothingLady-e0c9ac8dce.mp3",
    "accent": "标准韩语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Korean_IntellectualSenior",
    "providerVoiceId": "Korean_IntellectualSenior",
    "name": "韩书源",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "韩语",
    "languages": [
      "韩语"
    ],
    "description": "该音色以温润清澈的音质和舒缓从容的节奏为特征，极具辨识度。它能准确传达淡然诗意的情绪，是游戏与RPG和广播剧类项目的理想选择，特别是针对流浪少年角色的演绎。",
    "trait": "温润清澈,舒缓从容,淡然诗意",
    "scene": "游戏与RPG、有声书与小说、动漫与动画、角色配音",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Korean_IntellectualSenior-82b36663b8-v6-0739972e03dee1fff882.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Korean_IntellectualSenior-a10a2e7135.mp3",
    "accent": "标准韩语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Korean_LonelyWarrior",
    "providerVoiceId": "Korean_LonelyWarrior",
    "name": "崔允赫",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "韩语",
    "languages": [
      "韩语"
    ],
    "description": "这是一个充满冷峻魅力的青年男声。其声线略带沙哑质感，说话语气自信笃定、干脆利落，带有一种孤傲的英雄气概。整体风格酷帅且富有戏剧张力，非常适合用于游戏角色配音、热血动漫角色或战斗场景的内心独白，完美契合冷面战士或孤胆游侠的设定。",
    "trait": "略带沙哑,干脆利落,冷峻魅力",
    "scene": "游戏与RPG、广播剧、角色配音、纪录片、播客与社媒、企业宣传与旁白",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Korean_LonelyWarrior-8e6b34ad92-v6-b2f6a776a720070a4b3b.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Korean_LonelyWarrior-b78f863b25.mp3",
    "accent": "标准韩语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Korean_MatureLady",
    "providerVoiceId": "Korean_MatureLady",
    "name": "郑瑟雅",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "韩语",
    "languages": [
      "韩语"
    ],
    "description": "该音色以冷艳锐利的音质和果断傲慢的节奏为特征，极具辨识度。它能准确传达自信、轻蔑且优雅的情绪，是游戏角色和动漫反派类项目的理想选择，特别是针对高傲女王或精英女战士角色的演绎。",
    "trait": "冷艳锐利,果断傲慢,自信轻蔑",
    "scene": "游戏与RPG、动漫与动画、角色配音",
    "age": "中年",
    "ageCategory": "中年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Korean_MatureLady-f52f42c881-v6-a11f860b00ca26b6da0c.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Korean_MatureLady-c8ee391a79.mp3",
    "accent": "标准韩语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Korean_InnocentBoy",
    "providerVoiceId": "Korean_InnocentBoy",
    "name": "姜旻佑",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "韩语",
    "languages": [
      "韩语"
    ],
    "description": "该音色以清澈稚嫩的音质和温柔诚恳的节奏为特征，极具辨识度。它能准确传达纯真、依恋且乐于助人的情绪，是动漫与动画和二次元游戏类项目的理想选择，特别是针对乖巧少年角色的演绎。",
    "trait": "清澈稚嫩,温柔诚恳,乖巧少年",
    "scene": "游戏与RPG、广播剧、有声书与小说、动漫与动画、角色配音、播客与社媒、企业宣传与旁白",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Korean_InnocentBoy-14d020c280-v6-537d9305f417e1fcb8a8.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Korean_InnocentBoy-c7c86547d6.mp3",
    "accent": "标准韩语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Korean_CharmingSister",
    "providerVoiceId": "Korean_CharmingSister",
    "name": "尹慧律",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "韩语",
    "languages": [
      "韩语"
    ],
    "description": "这是一个成熟冷艳的女声。其声线低沉略带沙哑，说话节奏自信且充满压迫感。整体风格危险迷人，极具女王气场，非常适合用于游戏战斗语音、暗黑风剧情配音或反派角色台词，能够完美演绎冷血女刺客的形象。",
    "trait": "低沉略带沙哑,自信且充满压迫感,危险迷人",
    "scene": "游戏与RPG、有声书与小说、动漫与动画、角色配音",
    "age": "中年",
    "ageCategory": "中年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Korean_CharmingSister-22910640e4-v6-d374675e9cd7542d3f2a.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Korean_CharmingSister-cc40a93c61.mp3",
    "accent": "标准韩语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Korean_AthleticStudent",
    "providerVoiceId": "Korean_AthleticStudent",
    "name": "李泰昂",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "韩语",
    "languages": [
      "韩语"
    ],
    "description": "这是一个充满朝气与自信的青年男声。其声线明亮高亢且极具穿透力，说话节奏紧凑有力、干脆利落。整体风格热血激昂，带有一种意气风发的英雄主义色彩，非常适合用于动作类游戏的角色配音、热血动漫主角或需要展现年轻力量感的品牌广告场景。",
    "trait": "明亮高亢,干脆利落,热血激昂",
    "scene": "游戏与RPG、动漫与动画、角色配音",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Korean_AthleticStudent-2930a82a62-v6-0ee29e551a6ae196d667.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Korean_AthleticStudent-b39e58855b.mp3",
    "accent": "标准韩语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Korean_BraveAdventurer",
    "providerVoiceId": "Korean_BraveAdventurer",
    "name": "申多琳",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "韩语",
    "languages": [
      "韩语"
    ],
    "description": "该音色以清脆明亮的音质和灵动活泼的节奏为特征，极具辨识度。它能准确传达顽皮、乐观的情绪，是二次元游戏和动漫类项目的理想选择，特别是针对淘气少年角色的演绎。",
    "trait": "清脆明亮,灵动活泼,顽皮乐观",
    "scene": "游戏与RPG、动漫与动画、角色配音",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Korean_BraveAdventurer-530a1d52a0-v6-d84b2d68ca4f9d0a1764.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Korean_BraveAdventurer-cab22676a2.mp3",
    "accent": "标准韩语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Korean_CalmGentleman",
    "providerVoiceId": "Korean_CalmGentleman",
    "name": "宋道谦",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "韩语",
    "languages": [
      "韩语"
    ],
    "description": "这是一个成熟稳重的男声。其声线低沉优雅且极富磁性，说话节奏从容不迫、字里行间透着一种掌控全局的淡定。整体风格智者般冷静且充满故事感，非常适合用于奇幻游戏中的核心角色、广播剧中的贵族或幕后操纵者等场景，能够完美契合深沉智者的设定。",
    "trait": "低沉优雅,从容不迫,充满故事感",
    "scene": "游戏与RPG、广播剧、角色配音、纪录片、播客与社媒、企业宣传与旁白",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Korean_CalmGentleman-44e13b48f8-v6-3136f3b3a65218ef8132.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Korean_CalmGentleman-368a77bc4a.mp3",
    "accent": "标准韩语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Korean_WiseElf",
    "providerVoiceId": "Korean_WiseElf",
    "name": "赵素恩",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "韩语",
    "languages": [
      "韩语"
    ],
    "description": "该音色以温柔细腻的音质和舒缓轻柔的节奏为特征，极具辨识度。它能准确传达认真、内敛且略带羞涩的情绪，是二次元游戏和角色扮演类项目的理想选择，特别是针对勤勉秘书或森系少女角色的演绎。",
    "trait": "温柔细腻,舒缓轻柔,认真羞涩",
    "scene": "游戏与RPG、广播剧、角色配音、播客与社媒、企业宣传与旁白",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Korean_WiseElf-e63408fd1a-v6-5644aef596a20cdfdc37.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Korean_WiseElf-dd63b017e3.mp3",
    "accent": "标准韩语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Korean_CheerfulCoolJunior",
    "providerVoiceId": "Korean_CheerfulCoolJunior",
    "name": "吴承律",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "韩语",
    "languages": [
      "韩语"
    ],
    "description": "该音色以清亮爽朗的音质和自信轻快的节奏为特征，极具辨识度。它能准确传达热血无畏的情绪，是热血动漫和游戏角色类项目的理想选择，特别是针对青年冒险家角色的演绎。",
    "trait": "清亮爽朗,自信轻快,热血无畏",
    "scene": "游戏与RPG、动漫与动画、角色配音、广告与预告、播客与社媒",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Korean_CheerfulCoolJunior-4a25c121aa-v6-a991d0602b1d89352ae4.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Korean_CheerfulCoolJunior-45abbd36df.mp3",
    "accent": "标准韩语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Korean_DecisiveQueen",
    "providerVoiceId": "Korean_DecisiveQueen",
    "name": "金艺岚",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "韩语",
    "languages": [
      "韩语"
    ],
    "description": "这是一个充满自信与决断力的年轻女声。其声线清脆明亮且穿透力强，说话节奏干脆利落、语速较快。整体风格强气自信，能准确传达出干练、雷厉风行的情绪，极具辨识度。非常适合用于二次元游戏角色、动漫配音或热血剧情中的傲娇少女角色演绎。",
    "trait": "清脆明亮,干脆利落,强气自信",
    "scene": "游戏与RPG、动漫与动画、角色配音、播客与社媒、企业宣传与旁白",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Korean_DecisiveQueen-2c511be1dc-v6-ef8a5fc9b776dbc60a88.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Korean_DecisiveQueen-ebd27f2937.mp3",
    "accent": "标准韩语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Korean_ColdYoungMan",
    "providerVoiceId": "Korean_ColdYoungMan",
    "name": "朴时安",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "韩语",
    "languages": [
      "韩语"
    ],
    "description": "这是一个清冷清澈的青年男声。其声线干净且富有少年感，说话节奏舒缓、娓娓道来。整体风格冷静且克制，极具叙事张力，非常适合用于二次元游戏、广播剧或动漫配音等场景，特别是针对高冷学长或孤独少年角色的演绎。",
    "trait": "清冷清澈,娓娓道来,冷静且克制",
    "scene": "游戏与RPG、动漫与动画、角色配音",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Korean_ColdYoungMan-0de86c6858-v6-191a3fa665c9142402ca.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Korean_ColdYoungMan-89aece21ff.mp3",
    "accent": "标准韩语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Korean_MysteriousGirl",
    "providerVoiceId": "Korean_MysteriousGirl",
    "name": "柳熙娜",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "韩语",
    "languages": [
      "韩语"
    ],
    "description": "该音色以甜美高亢的音质和干脆利落的节奏为特征，极具二次元辨识度。它能准确传达元气满满、可爱灵动的情绪，是动漫游戏和系统提示音类项目的理想选择，特别是针对活力少女角色的演绎。",
    "trait": "甜美高亢,干脆利落,元气满满",
    "scene": "动漫与动画、播客与社媒、企业宣传与旁白",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Korean_MysteriousGirl-e975ed7bb2-v6-d6448291be6d7e8f0035.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Korean_MysteriousGirl-4cc65796e1.mp3",
    "accent": "标准韩语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Korean_QuirkyGirl",
    "providerVoiceId": "Korean_QuirkyGirl",
    "name": "林夏温",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "韩语",
    "languages": [
      "韩语"
    ],
    "description": "该音色以清脆明亮的音质和轻快跳跃的节奏为特征，极具辨识度。它能准确传达兴奋、调皮的情绪，是二次元游戏和卡通动画类项目的理想选择，特别是针对元气少女角色的演绎。",
    "trait": "清脆明亮,轻快跳跃,元气少女感",
    "scene": "游戏与RPG、动漫与动画",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Korean_QuirkyGirl-e3832603ec-v6-93bd437689853fd54931.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Korean_QuirkyGirl-ea7ce465db.mp3",
    "accent": "标准韩语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Korean_ConsiderateSenior",
    "providerVoiceId": "Korean_ConsiderateSenior",
    "name": "权知贤",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "韩语",
    "languages": [
      "韩语"
    ],
    "description": "这是一个温和谦逊的男声。其声线温暖厚实且略带磁性，说话节奏舒缓从容、彬彬有礼。整体风格体贴且令人安心，自带一种极强的服务意识与关怀感，非常适合用于二次元游戏中的管家角色、日常服务引导或治愈系广播剧，能够完美契合忠诚守护者的设定。",
    "trait": "温暖厚实,舒缓从容,关怀感",
    "scene": "游戏与RPG、广告与预告、在线教育",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Korean_ConsiderateSenior-d4642821ee-v6-d142963e9a3d7c72c807.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Korean_ConsiderateSenior-31ab5bd495.mp3",
    "accent": "标准韩语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Korean_CheerfulLittleSister",
    "providerVoiceId": "Korean_CheerfulLittleSister",
    "name": "安夏琳",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "韩语",
    "languages": [
      "韩语"
    ],
    "description": "该音色属于充满活力的日系少女音。其声线清脆明亮，带有鲜明的关西腔调，说话节奏跳跃感强且语速轻快活泼。整体风格热情亲切，极具感染力，能准确传达出开朗、无忧无虑的情绪。这种极具辨识度的声音非常适合用于动漫角色配音、二次元游戏角色互动或轻松愉快的剧情对话，完美契合元气邻家少女的设定。",
    "trait": "清脆明亮,语速轻快活泼,热情亲切",
    "scene": "游戏与RPG、有声书与小说、动漫与动画、角色配音、广告与预告",
    "age": "儿童",
    "ageCategory": "儿童",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Korean_CheerfulLittleSister-dee6368adb-v6-f38fbe46b36b7d0a991c.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Korean_CheerfulLittleSister-c35d8144cb.mp3",
    "accent": "标准韩语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Korean_DominantMan",
    "providerVoiceId": "Korean_DominantMan",
    "name": "河泰尹",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "韩语",
    "languages": [
      "韩语"
    ],
    "description": "该音色以冷峻低沉的音质和沉稳克制的节奏为特征，极具辨识度。它能准确传达高傲、严肃的情绪，是动漫游戏和角色扮演类项目的理想选择，特别是针对高冷贵公子角色的演绎。",
    "trait": "冷峻低沉,沉稳克制,高冷贵公子",
    "scene": "游戏与RPG、动漫与动画、角色配音、广告与预告",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Korean_DominantMan-a54fdffa29-v6-5450f3ceef278a4f4262.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Korean_DominantMan-47000309c7.mp3",
    "accent": "标准韩语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Korean_AirheadedGirl",
    "providerVoiceId": "Korean_AirheadedGirl",
    "name": "白艺真",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "韩语",
    "languages": [
      "韩语"
    ],
    "description": "这是一个充满自信且略带傲娇感的年轻女声。其声线清脆明亮，咬字清晰有力，说话节奏干脆利落，带有一种试图通过强调语气来确立权威的独特韵律。整体风格活泼且极具辨识度，能准确传达出自尊心强烈的少女情绪，非常适合用于动漫傲娇角色、二次元游戏配音或欢快的广播剧场景。",
    "trait": "清脆明亮,干脆利落,傲娇感",
    "scene": "游戏与RPG、有声书与小说、动漫与动画、角色配音",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Korean_AirheadedGirl-f64f16e415-v6-e7e46eea594c94724e1e.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Korean_AirheadedGirl-ba5bd851df.mp3",
    "accent": "标准韩语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Korean_ReliableYouth",
    "providerVoiceId": "Korean_ReliableYouth",
    "name": "崔正宰",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "韩语",
    "languages": [
      "韩语"
    ],
    "description": "这是一个充满少年感的清亮男声。其声线干净纯粹且富有穿透力，说话节奏干脆利落、坚定有力。整体风格正气凛然且充满活力，能够准确传达出认真严谨、值得信赖的情绪，极具二次元热血漫男主角的辨识度，非常适合用于日系动漫配音、RPG游戏角色语音或少年冒险题材的有声读物，特别是针对正直少年或除魔剑士等角色的精彩演绎。",
    "trait": "干净纯粹,干脆利落,正气凛然",
    "scene": "游戏与RPG、广播剧、动漫与动画、角色配音",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Korean_ReliableYouth-d1191d9913-v6-19004049239a9d217ae4.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Korean_ReliableYouth-f0c00dde92.mp3",
    "accent": "标准韩语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Korean_FriendlyBigSister",
    "providerVoiceId": "Korean_FriendlyBigSister",
    "name": "姜敏书",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "韩语",
    "languages": [
      "韩语"
    ],
    "description": "这是一个充满成熟韵味的御姐女声。其声线略带沙哑且富有磁性，说话节奏自信从容、带有一丝挑逗与戏谑。整体风格神秘且极具诱惑力，能够精准传达出自信、危险又迷人的情绪，是游戏与RPG或动漫配音类项目的理想选择，特别是针对那些强势迷人或腹黑的女性角色演绎。",
    "trait": "略带沙哑,自信从容,极具诱惑力",
    "scene": "游戏与RPG、广播剧、有声书与小说、动漫与动画、角色配音",
    "age": "中年",
    "ageCategory": "中年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Korean_FriendlyBigSister-afc7453436-v6-ecf650a02f2c8405d44a.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Korean_FriendlyBigSister-b47510291a.mp3",
    "accent": "标准韩语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Korean_GentleBoss",
    "providerVoiceId": "Korean_GentleBoss",
    "name": "宋承赫",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "韩语",
    "languages": [
      "韩语"
    ],
    "description": "该音色以冷酷傲慢的特质和阴冷沙哑的音质为特征，极具辨识度。说话节奏阴狠果断，每一个字都透着不容置疑的杀气。整体风格自带一种强烈的黑暗压迫感，能准确传达残忍、轻蔑的情绪，是动作游戏和暗黑题材动画的理想选择，特别是针对冷血刺客角色的演绎。",
    "trait": "阴冷沙哑,阴狠果断,黑暗压迫感",
    "scene": "游戏与RPG、广播剧、角色配音、广告与预告",
    "age": "中年",
    "ageCategory": "中年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Korean_GentleBoss-725aef9394-v6-76ab9d05ce942ffa52e4.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Korean_GentleBoss-4526022933.mp3",
    "accent": "标准韩语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Korean_ColdGirl",
    "providerVoiceId": "Korean_ColdGirl",
    "name": "郑澄妍",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "韩语",
    "languages": [
      "韩语"
    ],
    "description": "这是一个幼态清冷的日语女声。其声线轻柔慵懒且略带气声，说话节奏缓慢拖沓、缺乏明显的抑扬顿挫。整体风格淡漠疏离，准确传达出一种漫不经心、呆萌的三无属性，极具二次元画面感，是动漫与游戏中无口萝莉或神秘少女角色的理想选择。",
    "trait": "轻柔慵懒,缓慢拖沓,淡漠疏离",
    "scene": "游戏与RPG、有声书与小说、动漫与动画、角色配音、播客与社媒、企业宣传与旁白",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Korean_ColdGirl-3c5b0f9439-v6-e97f8156d5a52358e981.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Korean_ColdGirl-a18d42c1d0.mp3",
    "accent": "标准韩语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Korean_HaughtyLady",
    "providerVoiceId": "Korean_HaughtyLady",
    "name": "尹瑞澜",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "韩语",
    "languages": [
      "韩语"
    ],
    "description": "这是一个清冷高雅的青年女声。其声线通透澄澈且自带一种疏离感，说话节奏不紧不慢、语气沉稳冷静。整体风格孤傲且充满神秘色彩，给人一种只可远观的高贵气质，非常适合用于奇幻题材的游戏角色、动漫中的高冷御姐或古风剧中的世外高人演绎。",
    "trait": "通透澄澈,不紧不慢,孤傲神秘",
    "scene": "游戏与RPG、有声书与小说、动漫与动画、播客与社媒、企业宣传与旁白",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Korean_HaughtyLady-fd407e6e0e-v6-77704d9b8f679fcc952f.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Korean_HaughtyLady-319fdfd1b8.mp3",
    "accent": "标准韩语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Korean_CharmingElderSister",
    "providerVoiceId": "Korean_CharmingElderSister",
    "name": "韩彩恩",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "韩语",
    "languages": [
      "韩语"
    ],
    "description": "这是一个充满魅力的成熟女声。其声线华丽优雅且略带慵懒的磁性，说话节奏从容不迫、透着一丝戏谑与掌控感。整体风格神秘且撩人，极具辨识度，完美契合游戏中高贵狡黠的掌权者或气场强大的御姐角色设定，非常适合用于角色配音、游戏与RPG或奇幻类广播剧。",
    "trait": "华丽优雅,从容不迫,神秘且撩人",
    "scene": "游戏与RPG、有声书与小说、动漫与动画、角色配音",
    "age": "中年",
    "ageCategory": "中年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Korean_CharmingElderSister-8e6e874796-v6-0fc79f5539796da8c3a4.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Korean_CharmingElderSister-a4bb5a2784.mp3",
    "accent": "标准韩语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Korean_IntellectualMan",
    "providerVoiceId": "Korean_IntellectualMan",
    "name": "吴贤律",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "韩语",
    "languages": [
      "韩语"
    ],
    "description": "这是一个成熟迷人的男声。其声线低沉醇厚且富有磁性，说话节奏舒缓慵懒、娓娓道来。整体风格温柔亲昵，仿佛一位年长的伴侣在耳边低语，非常适合用于乙女游戏中的年上角色、广播剧男主或深夜情感电台等场景，能够完美契合温情大叔的设定。",
    "trait": "低沉醇厚,舒缓慵懒,温柔亲昵",
    "scene": "游戏与RPG、广播剧、角色配音",
    "age": "中年",
    "ageCategory": "中年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Korean_IntellectualMan-6520aed04d-v6-3e805a2f1e92172772ed.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Korean_IntellectualMan-ebca088f86.mp3",
    "accent": "标准韩语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Korean_CaringWoman",
    "providerVoiceId": "Korean_CaringWoman",
    "name": "李善妍",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "韩语",
    "languages": [
      "韩语"
    ],
    "description": "该音色以清脆明亮的音质和轻快活泼的节奏为特征，极具辨识度。它能准确传达俏皮可爱的情绪，同时兼具系统指令的清晰度，是二次元游戏和交互式系统类项目的理想选择，特别是针对元气少女角色的演绎。",
    "trait": "清脆明亮,轻快活泼,俏皮可爱",
    "scene": "游戏与RPG、动漫与动画、企业宣传与旁白",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Korean_CaringWoman-a8cd926b44-v6-8bd58fd7b898e0590ef1.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Korean_CaringWoman-847d623879.mp3",
    "accent": "标准韩语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Korean_WiseTeacher",
    "providerVoiceId": "Korean_WiseTeacher",
    "name": "申佑谦",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "韩语",
    "languages": [
      "韩语"
    ],
    "description": "这是一个充满自信与张力的年轻男声。其声线清亮明快且富有穿透力，说话节奏干脆利落、充满战斗时的紧迫感与果断。整体风格带有一种运筹帷幄的傲气与机智感，非常适合用于MOBA游戏中的战术指挥官、热血动漫里的天才少年或冒险游戏中的关键引导角色。",
    "trait": "清亮明快,干脆利落,运筹帷幄的傲气",
    "scene": "游戏与RPG、动漫与动画",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Korean_WiseTeacher-65de40d202-v6-66d6614e952315585e06.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Korean_WiseTeacher-2d2871b095.mp3",
    "accent": "标准韩语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Korean_ConfidentBoss",
    "providerVoiceId": "Korean_ConfidentBoss",
    "name": "赵承岚",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "韩语",
    "languages": [
      "韩语"
    ],
    "description": "该音色以沙哑磁性的音质和从容不迫的节奏为特征，极具辨识度。它能准确传达冷酷、自信乃至带有几分玩世不恭的情绪，自带一种极强的幕后操纵感，是犯罪题材游戏和影视剧类项目的理想选择，特别是针对精明赌场庄家或黑帮头目角色的演绎。",
    "trait": "沙哑磁性,从容不迫,幕后操纵感",
    "scene": "游戏与RPG、广播剧",
    "age": "中年",
    "ageCategory": "中年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Korean_ConfidentBoss-0772f59592-v6-c0bd5d74871cb0ad1b3f.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Korean_ConfidentBoss-6d649475ca.mp3",
    "accent": "标准韩语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Korean_AthleticGirl",
    "providerVoiceId": "Korean_AthleticGirl",
    "name": "金书瑶",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "韩语",
    "languages": [
      "韩语"
    ],
    "description": "该音色以清脆明亮的音质和欢快跳跃的节奏为特征，极具辨识度。它能准确传达积极乐观的情绪，给人一种元气满满的感觉，是二次元游戏和热血动漫类项目的理想选择，特别是针对活力少女角色的演绎。",
    "trait": "清脆明亮,欢快跳跃,元气满满",
    "scene": "游戏与RPG、有声书与小说、动漫与动画、角色配音",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Korean_AthleticGirl-3e05831a59-v6-e700bf251770aa6baaa1.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Korean_AthleticGirl-7a5c9b44e3.mp3",
    "accent": "标准韩语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Korean_PossessiveMan",
    "providerVoiceId": "Korean_PossessiveMan",
    "name": "权泰谦",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "韩语",
    "languages": [
      "韩语"
    ],
    "description": "该音色以冷冽富有磁性的音质和从容不迫的节奏为特征，极具辨识度。它能准确传达自信、慵懒且略带傲慢的情绪，是角色扮演游戏和动漫配音类项目的理想选择，特别是针对霸道总裁或高冷统领角色的演绎。",
    "trait": "冷冽富有磁性,从容不迫,高冷统领感",
    "scene": "游戏与RPG、广播剧、有声书与小说、动漫与动画、角色配音",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Korean_PossessiveMan-3a9c33db03-v6-1075f69c5f146afa1a07.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Korean_PossessiveMan-d4b1aeec23.mp3",
    "accent": "标准韩语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Korean_GentleWoman",
    "providerVoiceId": "Korean_GentleWoman",
    "name": "柳允静",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "韩语",
    "languages": [
      "韩语"
    ],
    "description": "这是一把甜美优雅的女声。其声线清澈温润，说话节奏彬彬有礼且带有轻微的戏剧韵律。整体风格温柔自信，极具辨识度，非常适合用于动漫角色、游戏配音或古风剧等场景，特别是针对大家闺秀或传统艺术家角色的演绎。",
    "trait": "清澈温润,彬彬有礼,大家闺秀感",
    "scene": "游戏与RPG、有声书与小说、动漫与动画、角色配音、纪录片、播客与社媒、企业宣传与旁白",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Korean_GentleWoman-befb93d9cd-v6-76400b23c7273d90bedd.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Korean_GentleWoman-acee083e9c.mp3",
    "accent": "标准韩语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Korean_CockyGuy",
    "providerVoiceId": "Korean_CockyGuy",
    "name": "安道烈",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "韩语",
    "languages": [
      "韩语"
    ],
    "description": "这是一个张扬豪放的青年男声。其声线中气十足且略带粗犷的颗粒感，说话节奏极具爆发力与戏剧张力。整体风格充满挑衅意味与过度自信的狂妄感，极具辨识度，非常适合用于热血少年动漫、格斗游戏角色配音或战斗场景对话，能够完美契合那种唯我独尊的不良少年或傲慢反派设定。",
    "trait": "中气十足,极具爆发力,狂妄感",
    "scene": "游戏与RPG、广播剧、动漫与动画、角色配音",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Korean_CockyGuy-aa6b56063f-v6-e0d6b1c0f9e299b0e8be.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Korean_CockyGuy-1c6686f307.mp3",
    "accent": "标准韩语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Korean_ThoughtfulWoman",
    "providerVoiceId": "Korean_ThoughtfulWoman",
    "name": "林恩菲",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "韩语",
    "languages": [
      "韩语"
    ],
    "description": "这是一个甜美稚嫩的日系少女音。其声线清脆明亮且带有明显的二次元萌系特征，说话节奏轻快活泼、元气满满。它能准确传达俏皮、撒娇以及羞涩的情绪，整体风格亲切可爱，极具感染力。非常适合用于恋爱模拟游戏、动漫角色配音或二次元风格的系统提示音，特别是针对邻家妹妹或傲娇少女角色的演绎。",
    "trait": "清脆明亮,轻快活泼,亲切可爱",
    "scene": "游戏与RPG、有声书与小说、动漫与动画、角色配音、企业宣传与旁白",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Korean_ThoughtfulWoman-ac919ab302-v6-6aa55bcdd54e5b4d5fd6.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Korean_ThoughtfulWoman-577a6ae4cb.mp3",
    "accent": "标准韩语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Korean_OptimisticYouth",
    "providerVoiceId": "Korean_OptimisticYouth",
    "name": "白允河",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "韩语",
    "languages": [
      "韩语"
    ],
    "description": "这是一个充满朝气与活力的年轻男声。其声线清亮干净，具有极高的辨识度，说话节奏轻快活泼，语调中总是带着上扬的笑意。整体风格元气满满且极具感染力，给人一种热心、乐观的邻家大哥哥感觉。这种音色非常适合用于少年向的二次元游戏角色、热血动漫中的忠实伙伴或轻松愉快的广播剧，能够完美诠释乐天派少年的形象。",
    "trait": "清亮,轻快活泼,元气满满",
    "scene": "游戏与RPG、动漫与动画、角色配音、广告与预告",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Korean_OptimisticYouth-cfc79c45e4-v6-f0dae8187ae2730ac292.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Korean_OptimisticYouth-8ee22d218f.mp3",
    "accent": "标准韩语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Spanish_SereneWoman",
    "providerVoiceId": "Spanish_SereneWoman",
    "name": "Alma Valverde",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "西班牙语",
    "languages": [
      "西班牙文"
    ],
    "description": "这是一个充满戏剧张力的青年女声。其声线明亮清脆且极富表现力，说话节奏灵活多变，既能驾驭急促的碎碎念，也能进行夸张的情感宣泄。整体风格生动活泼且具有极强的画面塑造感，能够精准传达傲慢、神秘或略带神经质的复杂情绪，非常适合用于有声书中的多变角色演绎、奇幻类广播剧或游戏中的个性化女性角色配音。",
    "trait": "明亮清脆,灵活多变,生动活泼",
    "scene": "有声书与小说、动漫与动画",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Spanish_SereneWoman-4d9d3687b3-v6-caa626c63ee6b50ed1e9.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Spanish_SereneWoman-5abbe04db9.mp3",
    "accent": "标准西班牙语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Spanish_MaturePartner",
    "providerVoiceId": "Spanish_MaturePartner",
    "name": "Esteban Zamora",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "西班牙语",
    "languages": [
      "西班牙文"
    ],
    "description": "这是一个历经沧桑的中年男声。其声线粗犷沙哑且充满颗粒感，说话节奏慵懒随意、略带抱怨。整体风格成熟且具有浓厚的生活气息，极具辨识度，非常适合用于RPG游戏中的硬汉NPC、黑色电影独白或带有悬疑色彩的有声书角色演绎。",
    "trait": "粗犷沙哑,慵懒随意,历经沧桑",
    "scene": "游戏与RPG、有声书与小说、动漫与动画、角色配音",
    "age": "中年",
    "ageCategory": "中年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Spanish_MaturePartner-b29b4953e4-v6-c932e63fb40ff135db6b.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Spanish_MaturePartner-87380a3b03.mp3",
    "accent": "标准西班牙语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Spanish_CaptivatingStoryteller",
    "providerVoiceId": "Spanish_CaptivatingStoryteller",
    "name": "Tomás Medina",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "西班牙语",
    "languages": [
      "西班牙文"
    ],
    "description": "这是一个成熟稳重的男声。其声线深沉厚重且极具颗粒感，说话节奏舒缓从容、娓娓道来，仿佛一位历经沧桑的长者在回首往事。整体风格沉稳大气，带有一种强烈的历史厚重感与叙事张力，非常适合用于人物传记、史诗纪录片旁白或历史题材有声书等场景，能够完美驾驭那些需要沉淀感的内容。",
    "trait": "深沉厚重,娓娓道来,历史厚重感",
    "scene": "有声书与小说、纪录片、在线教育",
    "age": "中年",
    "ageCategory": "中年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Spanish_CaptivatingStoryteller-bcf823cea8-v6-d63c48bffa759537fcce.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Spanish_CaptivatingStoryteller-0b194fd39d.mp3",
    "accent": "标准西班牙语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Spanish_Narrator",
    "providerVoiceId": "Spanish_Narrator",
    "name": "Rosario Montalvo",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "西班牙语",
    "languages": [
      "西班牙文"
    ],
    "description": "该音色以热情洋溢的音质和夸张戏剧化的节奏为特征，极具辨识度。它能准确传达乐观关切的情绪，是家庭情景剧和卡通动画类项目的理想选择，特别是针对慈祥母亲角色的演绎。",
    "trait": "热情洋溢,夸张戏剧化,慈祥母亲角色",
    "scene": "有声书与小说、动漫与动画、角色配音、广告与预告",
    "age": "老年",
    "ageCategory": "老年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Spanish_Narrator-fcb9742cb5-v6-651cefe0d6eedf37d53f.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Spanish_Narrator-82a7d25af5.mp3",
    "accent": "标准西班牙语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Spanish_WiseScholar",
    "providerVoiceId": "Spanish_WiseScholar",
    "name": "Daniel Amaya",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "西班牙语",
    "languages": [
      "西班牙文"
    ],
    "description": "这是一个极具生活气息的青年男声。其声线清亮质朴，带有一种独特的英国地方口音，说话节奏自然随性、如话家常。整体风格平实亲切，给人一种邻家男孩回忆往事的真诚感，非常适合用于传记类有声书、年代剧角色配音或讲述个人经历的广播剧场景。",
    "trait": "清亮质朴,如话家常,邻家男孩",
    "scene": "角色配音、纪录片",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Spanish_WiseScholar-95acf66fa1-v6-70ff1eb2522039677b0f.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Spanish_WiseScholar-cb303af9b5.mp3",
    "accent": "标准西班牙语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Spanish_Kind-heartedGirl",
    "providerVoiceId": "Spanish_Kind-heartedGirl",
    "name": "Abril Cordero",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "西班牙语",
    "languages": [
      "西班牙文"
    ],
    "description": "这是一个充满活力的青年女声。其声线甜美清亮，说话节奏轻快活泼。整体风格真诚且富有感染力，给人一种邻家亲切感，非常适合用于儿童有声书、励志广告或动漫角色配音等场景。",
    "trait": "甜美清亮,轻快活泼,邻家亲切感",
    "scene": "在线教育、播客与社媒",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Spanish_Kind-heartedGirl-55bc3c3c02-v6-a0b0f378f99b450e26bb.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Spanish_Kind-heartedGirl-3d9a0588b2.mp3",
    "accent": "标准西班牙语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Spanish_DeterminedManager",
    "providerVoiceId": "Spanish_DeterminedManager",
    "name": "Raquel Ferrer",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "西班牙语",
    "languages": [
      "西班牙文"
    ],
    "description": "这是一个气场强大的中年女声，带有浓郁的苏格兰口音。其声线锐利坚定，说话节奏字字铿锵、情绪饱满。整体风格强势且充满压迫感，生动演绎了职场中据理力争或愤怒对峙的状态，非常适合用于广播剧中的职场冲突场景、影视剧中的女性反派或严肃的角色配音项目。",
    "trait": "锐利坚定,字字铿锵,充满压迫感",
    "scene": "广播剧、有声书与小说、纪录片、企业宣传与旁白",
    "age": "中年",
    "ageCategory": "中年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Spanish_DeterminedManager-1b7ba45daa-v6-6bf61d37a4a0cfb25476.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Spanish_DeterminedManager-219ce16d4e.mp3",
    "accent": "标准西班牙语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Spanish_BossyLeader",
    "providerVoiceId": "Spanish_BossyLeader",
    "name": "Gonzalo Peñalosa",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "西班牙语",
    "languages": [
      "西班牙文"
    ],
    "description": "这是一个历经沧桑的男声。其声线沙哑粗砺且富有质感，说话节奏威严有力、极具张力。整体风格强硬且带有压迫感，能准确传达冷酷、决绝的情绪，是动作游戏和战争题材影视类项目的理想选择，特别是针对反派首领或战场指挥官角色的演绎。",
    "trait": "沙哑粗砺,威严有力,带有压迫感",
    "scene": "游戏与RPG、广播剧、角色配音",
    "age": "中年",
    "ageCategory": "中年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Spanish_BossyLeader-8430cef9ff-v6-585b873f1a6d757afe1d.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Spanish_BossyLeader-f1b9ee204e.mp3",
    "accent": "标准西班牙语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Spanish_ReservedYoungMan",
    "providerVoiceId": "Spanish_ReservedYoungMan",
    "name": "Samuel Rojas",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "西班牙语",
    "languages": [
      "西班牙文"
    ],
    "description": "这是一个温润清澈的年轻男声。其声线干净且略带羞涩，说话节奏平稳舒缓、娓娓道来。整体风格充满了真诚与内敛的情感，极具叙事感，非常适合用于情感类有声书朗读、深夜电台独白或动漫游戏中性格内向的少年角色演绎。",
    "trait": "温润清澈,娓娓道来,极具叙事感",
    "scene": "游戏与RPG、有声书与小说、动漫与动画、角色配音、在线教育、播客与社媒、企业宣传与旁白",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Spanish_ReservedYoungMan-90f5cb4f0a-v6-8fcc3b1010ef29da8134.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Spanish_ReservedYoungMan-01ced9892f.mp3",
    "accent": "标准西班牙语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Spanish_ConfidentWoman",
    "providerVoiceId": "Spanish_ConfidentWoman",
    "name": "Lola Serrano",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "西班牙语",
    "languages": [
      "西班牙文"
    ],
    "description": "这是一位自信干练的青年女声。其声线明亮清晰且具有极强的穿透力，说话节奏干脆利落、抑扬顿挫，能根据内容准确切换情绪。整体风格专业且富有感染力，给人一种知性与力量并存的感觉，非常适合用于商业广告、有声书旁白或影视剧中职场大女主角色的精彩演绎。",
    "trait": "明亮清晰,干脆利落,知性力量感",
    "scene": "游戏与RPG、广播剧、有声书与小说、角色配音、广告与预告",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Spanish_ConfidentWoman-0c38965032-v6-2070332980db6166367d.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Spanish_ConfidentWoman-6c4113bb30.mp3",
    "accent": "标准西班牙语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Spanish_ThoughtfulMan",
    "providerVoiceId": "Spanish_ThoughtfulMan",
    "name": "Javier Saavedra",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "西班牙语",
    "languages": [
      "西班牙文"
    ],
    "description": "这是一个极具叙事感的青年男声。其声线温润磁性，音质干净且略带思考的余韵，说话节奏娓娓道来、张弛有度。整体风格亲切自然，带有一种沉稳的知性气质，既能驾驭深情的独白，也能胜任轻松的讲述，非常适合用于有声书朗读、情感电台或知识类播客等场景。",
    "trait": "温润磁性,娓娓道来,亲切自然",
    "scene": "有声书与小说、角色配音、纪录片、播客与社媒、企业宣传与旁白",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Spanish_ThoughtfulMan-bbdfe4954d-v6-4f7620625e77b13c4392.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Spanish_ThoughtfulMan-1413e79ff2.mp3",
    "accent": "标准西班牙语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Spanish_Strong-WilledBoy",
    "providerVoiceId": "Spanish_Strong-WilledBoy",
    "name": "Rafael Cabrera",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "西班牙语",
    "languages": [
      "西班牙文"
    ],
    "description": "该音色以清亮坚定的音质和充满激情的节奏为特征，极具辨识度。它能准确传达自信、热血的情绪，是角色配音和游戏RPG类项目的理想选择，特别是针对少年英雄角色的演绎。",
    "trait": "清亮坚定,充满激情,热血",
    "scene": "游戏与RPG、动漫与动画、角色配音、播客与社媒、企业宣传与旁白",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Spanish_Strong-WilledBoy-a010d9f9c5-v6-2e7b76a7c31a051ee653.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Spanish_Strong-WilledBoy-cbc79b79de.mp3",
    "accent": "标准西班牙语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Spanish_SophisticatedLady",
    "providerVoiceId": "Spanish_SophisticatedLady",
    "name": "Carmen Quintana",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "西班牙语",
    "languages": [
      "西班牙文"
    ],
    "description": "这是一个充满力量感的成熟女声。其声线略带沙哑且富有磁性，说话节奏豪爽干练、直率自然。整体风格自信笃定且极具辨识度，自带一种大姐大的威严感，非常适合用于动作游戏角色配音、冒险题材的有声书或极具个性的商业广告旁白。",
    "trait": "略带沙哑,豪爽干练,自信笃定",
    "scene": "纪录片、广告与预告、在线教育",
    "age": "中年",
    "ageCategory": "中年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Spanish_SophisticatedLady-b0ab145edc-v6-0ddcfc481ba36ce46d29.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Spanish_SophisticatedLady-c3141000c4.mp3",
    "accent": "标准西班牙语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Spanish_RationalMan",
    "providerVoiceId": "Spanish_RationalMan",
    "name": "Ignacio Salcedo",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "西班牙语",
    "languages": [
      "西班牙文"
    ],
    "description": "这是一个极其沉稳且略带冷幽默的中年男声。其声线低沉浑厚，伴有显著的胸腔共鸣，给人一种坚如磐石的质感。说话节奏从容不迫、字字千钧，带有一种不容置疑的断定感。整体风格严肃冷峻却又暗含一种独特的厌世幽默，非常适合用于讽刺喜剧、严肃的观点阐述或硬汉角色的内心独白等场景。",
    "trait": "低沉浑厚,从容不迫,严肃冷峻",
    "scene": "动漫与动画、角色配音、广告与预告、播客与社媒、企业宣传与旁白",
    "age": "中年",
    "ageCategory": "中年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Spanish_RationalMan-69702f048f-v6-f1165151f90f2b5a90a5.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Spanish_RationalMan-c3ab69e4b9.mp3",
    "accent": "标准西班牙语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Spanish_AnimeCharacter",
    "providerVoiceId": "Spanish_AnimeCharacter",
    "name": "Beatriz Zamora",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "西班牙语",
    "languages": [
      "西班牙文"
    ],
    "description": "该音色以粗犷沙哑的音质和急促多变的节奏为特征，极具辨识度。它能准确传达焦急、兴奋且略带调侃的情绪，自带一种身临其境的紧张氛围感，是动作冒险游戏和热血动漫类项目的理想选择，特别是针对痞气探险家角色的演绎。",
    "trait": "粗犷沙哑,急促多变,紧张氛围感",
    "scene": "游戏与RPG、广播剧",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Spanish_AnimeCharacter-ae58e1fde4-v6-8613f8bb58352faaa72c.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Spanish_AnimeCharacter-55d65bce8b.mp3",
    "accent": "标准西班牙语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Spanish_Deep-tonedMan",
    "providerVoiceId": "Spanish_Deep-tonedMan",
    "name": "Héctor Figueroa",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "西班牙语",
    "languages": [
      "西班牙文"
    ],
    "description": "这是一个极其深沉厚重的男声。其声线如低音炮般浑厚且富有强烈的磁性共鸣，说话节奏抑扬顿挫，充满了浓郁的戏剧张力和表演感。整体风格威严霸气，同时带有一种独特的反派魅力，非常适合用于电影预告片、反派BOSS角色配音或史诗级游戏旁白等需要极致压迫感的场景。",
    "trait": "浑厚,抑扬顿挫,反派魅力",
    "scene": "游戏与RPG、有声书与小说、动漫与动画、角色配音",
    "age": "中年",
    "ageCategory": "中年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Spanish_Deep-tonedMan-8f49be1809-v6-8c61ee53803401ca06ed.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Spanish_Deep-tonedMan-f85f40993c.mp3",
    "accent": "标准西班牙语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Spanish_Fussyhostess",
    "providerVoiceId": "Spanish_Fussyhostess",
    "name": "Leonor Paredes",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "西班牙语",
    "languages": [
      "西班牙文"
    ],
    "description": "这是一个极具张力的角色型女声。其声线尖锐高亢且富有戏剧张力，说话节奏急促迫切、咬字清晰有力。整体风格傲慢且挑剔，能准确传达出盛气凌人甚至略带歇斯底里的情绪，是奇幻题材游戏和卡通动画类项目的理想选择，特别是针对专横女王或严厉女管家角色的演绎。",
    "trait": "尖锐高亢,急促迫切,傲慢且挑剔",
    "scene": "游戏与RPG、广播剧、动漫与动画",
    "age": "中年",
    "ageCategory": "中年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Spanish_Fussyhostess-59dad68592-v6-1cb34311a5979e160bfa.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Spanish_Fussyhostess-ed42a6aff8.mp3",
    "accent": "标准西班牙语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Spanish_SincereTeen",
    "providerVoiceId": "Spanish_SincereTeen",
    "name": "Nico Navarro",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "西班牙语",
    "languages": [
      "西班牙文"
    ],
    "description": "这是一个极具个性的青年男声。其声线清脆明亮且略带沙哑质感，说话节奏急促跳跃，带有鲜明的英式街头口音色彩。整体风格调皮、直率且充满吐槽感，能够生动传达出不耐烦或戏谑的情绪，非常适合用于现代都市题材的广播剧、游戏中的小混混角色或青少年冒险类有声书的演绎。",
    "trait": "清脆明亮,节奏急促,充满吐槽感",
    "scene": "游戏与RPG、有声书与小说、角色配音、播客与社媒",
    "age": "儿童",
    "ageCategory": "儿童",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Spanish_SincereTeen-538e61522e-v6-41523d4a747a98f9ccba.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Spanish_SincereTeen-773fd49a5c.mp3",
    "accent": "标准西班牙语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Spanish_FrankLady",
    "providerVoiceId": "Spanish_FrankLady",
    "name": "Marina Cordero",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "西班牙语",
    "languages": [
      "西班牙文"
    ],
    "description": "这是一个充满生活气息的青年女声。其声线明亮尖锐且富有表现力，带有辨识度极高的苏格兰口音，说话节奏急促、语调抑扬顿挫。整体风格极具戏剧张力和市井真实感，能够完美传达出焦躁、抱怨或无奈的情绪，非常适合用于生活类广播剧、游戏NPC对话或情感丰富的有声读物中扮演年轻母亲或挑剔顾客的角色。",
    "trait": "明亮尖锐,节奏急促,极具戏剧张力",
    "scene": "游戏与RPG、广播剧、动漫与动画、角色配音、企业宣传与旁白",
    "age": "中年",
    "ageCategory": "中年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Spanish_FrankLady-b1511144a2-v6-163e6d87adc78d9e22e9.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Spanish_FrankLady-64971d0de5.mp3",
    "accent": "标准西班牙语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Spanish_Comedian",
    "providerVoiceId": "Spanish_Comedian",
    "name": "Lucas Cabrera",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "西班牙语",
    "languages": [
      "西班牙文"
    ],
    "description": "这是一个极具表现力的中年男声。其声线高亢明快且带有浓郁的戏剧感，说话节奏抑扬顿挫、夸张生动，带有一种独特的英式方言韵味。整体风格幽默诙谐且充满故事性，极富感染力，非常适合用于儿童绘本朗读、奇幻动画配音或滑稽的广告旁白等场景，能够完美演绎古怪发明家或诙谐说书人的生动形象。",
    "trait": "高亢明快,抑扬顿挫,幽默诙谐",
    "scene": "有声书与小说、动漫与动画、角色配音、广告与预告",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Spanish_Comedian-81a315cb00-v6-0954a4c92d28d97f4c39.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Spanish_Comedian-31c7447af9.mp3",
    "accent": "标准西班牙语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Spanish_Debator",
    "providerVoiceId": "Spanish_Debator",
    "name": "Víctor Medina",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "西班牙语",
    "languages": [
      "西班牙文"
    ],
    "description": "这是一个极具表现力的中年男声。其声线沙哑粗砺，带有明显的颗粒感和沧桑特质，说话节奏抑扬顿挫，夸张且充满戏剧张力。整体风格滑稽中透着一丝狡黠和匪气，极具辨识度，能生动演绎海盗、西部牛仔或贪婪反派等特殊人物，非常适合用于游戏NPC配音、卡通动画中的性格角色或广播剧中的夸张演绎。",
    "trait": "沙哑粗砺,抑扬顿挫,狡黠匪气",
    "scene": "游戏与RPG、广播剧、动漫与动画",
    "age": "中年",
    "ageCategory": "中年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Spanish_Debator-68a69df7c5-v6-64fbf7d17c5eff8431fe.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Spanish_Debator-13c85c7a1e.mp3",
    "accent": "标准西班牙语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Spanish_ToughBoss",
    "providerVoiceId": "Spanish_ToughBoss",
    "name": "Teresa Rojas",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "西班牙语",
    "languages": [
      "西班牙文"
    ],
    "description": "这是一个成熟稳重的女声。其声线低沉沙哑且充满质感，说话节奏张弛有度、极具戏剧张力。整体风格严肃厚重，能够营造出强烈的史诗感和危机感，非常适合用于电影预告、游戏开场动画或史诗纪录片旁白等场景，完美契合那些历经沧桑的女性领袖或讲述者设定。",
    "trait": "低沉沙哑,极具戏剧张力,严肃厚重",
    "scene": "游戏与RPG、广播剧、有声书与小说",
    "age": "中年",
    "ageCategory": "中年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Spanish_ToughBoss-242ca15ca8-v6-51c8b495a13ed1618291.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Spanish_ToughBoss-bd80c84d54.mp3",
    "accent": "标准西班牙语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Spanish_Wiselady",
    "providerVoiceId": "Spanish_Wiselady",
    "name": "Clara Ortega",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "西班牙语",
    "languages": [
      "西班牙文"
    ],
    "description": "这是一个知性干练的青年女声。其声线清亮优雅且具有极高的辨识度，说话节奏精准清晰、带有标准的英式口音。整体风格冷静客观又不失神秘的引导感，听起来既专业又充满智慧，非常适合用于悬疑解谜游戏的引导员、科技产品的智能语音助手或沉浸式互动体验的旁白等场景。",
    "trait": "清亮优雅,节奏精准,神秘引导感",
    "scene": "广播剧、有声书与小说、在线教育、播客与社媒",
    "age": "中年",
    "ageCategory": "中年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Spanish_Wiselady-6536115822-v6-c17712547b1b5336d32a.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Spanish_Wiselady-26f9d3ea78.mp3",
    "accent": "标准西班牙语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Spanish_Steadymentor",
    "providerVoiceId": "Spanish_Steadymentor",
    "name": "Rodrigo Cordero",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "西班牙语",
    "languages": [
      "西班牙文"
    ],
    "description": "这是一个极具爆发力的男声。其声线粗砺沙哑且带有明显的颗粒感，说话节奏戏剧夸张、张力十足。整体风格凶狠狂妄，完美演绎了不死生物或反派角色的特质，非常适合用于奇幻题材的游戏BOSS配音、欧美动画中的邪恶反派或冒险类广播剧等场景。",
    "trait": "粗砺沙哑,戏剧夸张,凶狠狂妄",
    "scene": "游戏与RPG、广播剧、动漫与动画",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Spanish_Steadymentor-3211cf84ab-v6-7317224f3597979d14eb.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Spanish_Steadymentor-5ba8380a21.mp3",
    "accent": "标准西班牙语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Spanish_Jovialman",
    "providerVoiceId": "Spanish_Jovialman",
    "name": "Joaquín Rojas",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "西班牙语",
    "languages": [
      "西班牙文"
    ],
    "description": "该音色以滑稽逗趣的音质和慵懒随性的节奏为特征，极具辨识度。声音略带沙哑，语调夸张且充满松弛感，能准确传达乐天、搞怪的情绪。它是美式卡通动画和喜剧类游戏的理想选择，特别是针对酷爱爵士乐的嬉皮士或是缺根筋的搞笑配角角色的演绎。",
    "trait": "略带沙哑,慵懒随性,乐天搞怪",
    "scene": "游戏与RPG、广播剧、动漫与动画、角色配音、广告与预告、企业宣传与旁白",
    "age": "老年",
    "ageCategory": "老年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Spanish_Jovialman-33c87f7d63-v6-fdbc96355fb116661698.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Spanish_Jovialman-90a00de7d8.mp3",
    "accent": "标准西班牙语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Spanish_SantaClaus",
    "providerVoiceId": "Spanish_SantaClaus",
    "name": "Emilio Fuentes",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "西班牙语",
    "languages": [
      "西班牙文"
    ],
    "description": "这是一个极具感染力的老年男声。其声线浑厚洪亮且带有标志性的共鸣感，说话节奏抑扬顿挫、充满戏剧张力。整体风格热情爽朗、和蔼可亲，自带强烈的节日欢庆氛围，非常适合用于节日广告促销、商场活动播报或儿童动画中的长者角色演绎。",
    "trait": "浑厚洪亮,抑扬顿挫,和蔼可亲",
    "scene": "广播剧、广告与预告、企业宣传与旁白",
    "age": "老年",
    "ageCategory": "老年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Spanish_SantaClaus-85f78469f3-v6-9675238b27cc0517e67e.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Spanish_SantaClaus-d47d39e995.mp3",
    "accent": "标准西班牙语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Spanish_Rudolph",
    "providerVoiceId": "Spanish_Rudolph",
    "name": "Diego Valverde",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "西班牙语",
    "languages": [
      "西班牙文"
    ],
    "description": "这是一个极具辨识度的角色型音色。其声线稚嫩且带有标志性的浓重鼻音，听起来像是一个正处于感冒或鼻塞状态的小男孩。说话节奏略显迟缓笨拙，语调中透露出一种憨厚、纯真且诚恳的气质。整体风格充满童趣与怀旧感，完美还原了经典节日动画角色的神韵，非常适合用于卡通动画配音、儿童有声书讲述或节日相关的创意短片，特别是针对呆萌小男孩或拟人化动物角色的演绎。",
    "trait": "稚嫩鼻音,迟缓笨拙,纯真童趣",
    "scene": "广播剧、动漫与动画、角色配音、广告与预告",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Spanish_Rudolph-a6bb5d29f0-v6-58f700e99ae800c212d0.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Spanish_Rudolph-6592644f6f.mp3",
    "accent": "标准西班牙语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Spanish_Intonategirl",
    "providerVoiceId": "Spanish_Intonategirl",
    "name": "Noelia Zamora",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "西班牙语",
    "languages": [
      "西班牙文"
    ],
    "description": "该音色以清脆明亮且极具表现力的音质为特征，语调起伏夸张多变，充满戏剧张力。它能准确传达搞怪、兴奋或略带神经质的情绪，节奏轻快跳跃，极具辨识度。这是卡通动画、游戏角色配音或创意广告的理想选择，特别适合演绎那些性格古灵精怪或情绪丰富的女性角色。",
    "trait": "清脆明亮,节奏轻快跳跃,戏剧张力",
    "scene": "游戏与RPG、动漫与动画",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Spanish_Intonategirl-cbe48f3f36-v6-ac07b599460f48ccba2b.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Spanish_Intonategirl-f9968345ad.mp3",
    "accent": "标准西班牙语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Spanish_Arnold",
    "providerVoiceId": "Spanish_Arnold",
    "name": "Isidro Peñalosa",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "西班牙语",
    "languages": [
      "西班牙文"
    ],
    "description": "这是一个极具辨识度的老年男声。其声线低沉浑厚且带有明显的沙哑颗粒感，说话节奏舒缓从容，语调中夹杂着独特的口音，如同经历丰富的老者在娓娓道来。整体风格硬朗中透着亲切，充满沉稳的阅历感，非常适合用于人物传记、回忆录朗读或硬汉角色的晚年独白等场景。",
    "trait": "低沉沙哑,娓娓道来,阅历感",
    "scene": "有声书与小说、纪录片、播客与社媒",
    "age": "老年",
    "ageCategory": "老年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Spanish_Arnold-10ac958453-v6-f712b54277991c6776a3.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Spanish_Arnold-e755cc8e23.mp3",
    "accent": "标准西班牙语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Spanish_Ghost",
    "providerVoiceId": "Spanish_Ghost",
    "name": "Ramiro Cabrera",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "西班牙语",
    "languages": [
      "西班牙文"
    ],
    "description": "该音色以粗犷沙哑的音质和干练急促的节奏为特征，极具辨识度。它能准确传达紧张、坚毅的情绪，整体风格自带一种强烈的战场实况感，是射击游戏和战争题材影视类项目的理想选择，特别是针对硬汉士兵角色的演绎。",
    "trait": "粗犷沙哑,干练急促,战场实况感",
    "scene": "游戏与RPG、纪录片",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Spanish_Ghost-ece364e53f-v6-6095f170e0195c339742.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Spanish_Ghost-cfc5bc95fe.mp3",
    "accent": "标准西班牙语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Spanish_HumorousElder",
    "providerVoiceId": "Spanish_HumorousElder",
    "name": "Teodoro Serrano",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "西班牙语",
    "languages": [
      "西班牙文"
    ],
    "description": "这是一个极具戏剧张力的老年男声。其声线沙哑滑稽且略带颗粒感，说话节奏夸张起伏、充满乡土气息。整体风格幽默且搞怪，自带一种强烈的喜剧画面感，非常适合用于卡通动画、搞笑广播剧或儿童有声书等场景，能够完美演绎古怪老人或滑稽配角的设定。",
    "trait": "沙哑滑稽,夸张起伏,喜剧画面感",
    "scene": "有声书与小说、动漫与动画、广告与预告、播客与社媒",
    "age": "老年",
    "ageCategory": "老年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Spanish_HumorousElder-2332761742-v6-10c284e541b58ce35b77.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Spanish_HumorousElder-e0080ccc91.mp3",
    "accent": "标准西班牙语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Spanish_EnergeticBoy",
    "providerVoiceId": "Spanish_EnergeticBoy",
    "name": "Gael Figueroa",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "西班牙语",
    "languages": [
      "西班牙文"
    ],
    "description": "该音色以清脆明亮的音质和轻快活泼的节奏为特征，极具辨识度。它能准确传达兴奋、自信且充满朝气的情绪，是冒险类游戏和少年热血动漫的理想选择，特别是针对活力少年角色的演绎。",
    "trait": "清脆明亮,轻快活泼,充满朝气",
    "scene": "游戏与RPG、动漫与动画、广告与预告",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Spanish_EnergeticBoy-4cca36bad7-v6-8ad899a78f83a73790d5.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Spanish_EnergeticBoy-97f9a4b06c.mp3",
    "accent": "标准西班牙语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Spanish_WhimsicalGirl",
    "providerVoiceId": "Spanish_WhimsicalGirl",
    "name": "Lía Bermejo",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "西班牙语",
    "languages": [
      "西班牙文"
    ],
    "description": "这是一个充满奇幻色彩的年轻女声。其声线甜美细腻且带有明显的戏剧张力，说话节奏轻快灵动、抑扬顿挫。整体风格俏皮且富有感染力，能准确传达出古灵精怪、天真又略带神秘的情绪。非常适合用于奇幻游戏角色、动画片配音或童话有声书等场景，特别是针对魔法少女或精灵类角色的演绎。",
    "trait": "甜美细腻,轻快灵动,古灵精怪",
    "scene": "游戏与RPG、动漫与动画、播客与社媒",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Spanish_WhimsicalGirl-ec4f531b21-v6-b173764dcc3f8d5e68b9.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Spanish_WhimsicalGirl-1ff24cba4b.mp3",
    "accent": "标准西班牙语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Spanish_StrictBoss",
    "providerVoiceId": "Spanish_StrictBoss",
    "name": "Vega Peñalosa",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "西班牙语",
    "languages": [
      "西班牙文"
    ],
    "description": "这是一个极具辨识度的中年女声。其声线带有浓郁的东欧口音色彩，发音硬朗有力，说话节奏急促且干脆利落。整体风格严厉、紧迫，准确传达出刻不容缓的指令感，非常适合用于赛车游戏导航员、军事指挥官或需要极强压迫感的角色配音场景。",
    "trait": "硬朗有力,干脆利落,严厉紧迫",
    "scene": "游戏与RPG、在线教育、企业宣传与旁白",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Spanish_StrictBoss-dc1f3dcd5b-v6-b7f29545b0b81bd60348.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Spanish_StrictBoss-4f8e04afc0.mp3",
    "accent": "标准西班牙语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Spanish_ReliableMan",
    "providerVoiceId": "Spanish_ReliableMan",
    "name": "Sergio Paredes",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "西班牙语",
    "languages": [
      "西班牙文"
    ],
    "description": "这是一个成熟稳重的男声。其声线低沉浑厚，带有一种如醇厚咖啡般的磁性质感，说话节奏从容不迫，吐字清晰且极其优雅。整体风格透着一种历经沧桑后的沉稳与睿智，给人极强的信赖感和权威感，非常适合用于史诗感强烈的游戏角色配音、历史纪录片旁白或高端品牌的宣传解说。",
    "trait": "低沉浑厚,从容不迫,沉稳与睿智",
    "scene": "游戏与RPG、纪录片、广告与预告、播客与社媒、企业宣传与旁白",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Spanish_ReliableMan-cda611ab05-v6-df1ad43e654ab852f3b8.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Spanish_ReliableMan-c9574f4a33.mp3",
    "accent": "标准西班牙语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Spanish_SereneElder",
    "providerVoiceId": "Spanish_SereneElder",
    "name": "Joaquín Correa",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "西班牙语",
    "languages": [
      "西班牙文"
    ],
    "description": "这是一个极具辨识度的老年男声。其声线苍老沙哑，带有明显的颗粒感和颤抖的气息，说话节奏缓慢沉稳，仿佛一位正在回忆往事的叙述者。整体风格神秘且充满戏剧张力，独特的口音赋予了它一种古老而深沉的质感，非常适合用于奇幻游戏中的NPC角色、历史纪录片的演绎或暗黑童话风格的旁白。",
    "trait": "苍老沙哑,节奏缓慢,充满戏剧张力",
    "scene": "角色配音、纪录片、在线教育、播客与社媒、企业宣传与旁白",
    "age": "老年",
    "ageCategory": "老年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Spanish_SereneElder-d6894f3e8d-v6-32f497195099ce7ba927.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Spanish_SereneElder-62609f9cf1.mp3",
    "accent": "标准西班牙语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Spanish_AngryMan",
    "providerVoiceId": "Spanish_AngryMan",
    "name": "Álvaro Medina",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "西班牙语",
    "languages": [
      "西班牙文"
    ],
    "description": "这是一个年轻的男声。该音色以紧绷高亢的音质和急促激烈的节奏为特征，极具爆发力。它能准确传达歇斯底里的情绪，是广播剧和游戏剧情类项目的理想选择，特别是针对情绪失控者角色的演绎。",
    "trait": "紧绷高亢,急促激烈,歇斯底里",
    "scene": "游戏与RPG、广播剧、动漫与动画",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Spanish_AngryMan-818220e83c-v6-77da4dd7d5884c723de4.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Spanish_AngryMan-2d95f20703.mp3",
    "accent": "标准西班牙语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Spanish_AssertiveQueen",
    "providerVoiceId": "Spanish_AssertiveQueen",
    "name": "Ángela Cabrera",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "西班牙语",
    "languages": [
      "西班牙文"
    ],
    "description": "这是一个充满自信的青年女声。其声线清亮锐利，发音咬字清晰有力，具有很强的穿透力。说话节奏干脆利落，毫不拖泥带水，展现出一种高冷且果断的气质。整体风格御姐范十足，兼具职场权威感与角色掌控力，非常适合用于游戏中的强势女性角色、快节奏的广告口播或展现专业度的企业宣传片旁白。",
    "trait": "清亮锐利,干脆利落,高冷且果断",
    "scene": "广播剧、角色配音、广告与预告、播客与社媒、企业宣传与旁白",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Spanish_AssertiveQueen-a1cdd3c995-v6-5f9427cfbddc7d3dcdec.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Spanish_AssertiveQueen-6314af8626.mp3",
    "accent": "标准西班牙语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Spanish_CaringGirlfriend",
    "providerVoiceId": "Spanish_CaringGirlfriend",
    "name": "Julia Navarro",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "西班牙语",
    "languages": [
      "西班牙文"
    ],
    "description": "这是一个充满关怀的年轻女声。其声线甜美柔和且略带气声，说话节奏舒缓流畅、语调自然。整体风格亲切且富有感染力，给人一种邻家亲切感，非常适合用于有声书小说、情感类播客或恋爱模拟游戏等场景，能够完美契合贴心伴侣的设定。",
    "trait": "甜美柔和,舒缓流畅,邻家亲切感",
    "scene": "有声书与小说、播客与社媒",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Spanish_CaringGirlfriend-5a31e51c6e-v6-42934a74cce35a4fcceb.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Spanish_CaringGirlfriend-8457135a4e.mp3",
    "accent": "标准西班牙语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Spanish_PowerfulSoldier",
    "providerVoiceId": "Spanish_PowerfulSoldier",
    "name": "Darío Rojas",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "西班牙语",
    "languages": [
      "西班牙文"
    ],
    "description": "这是一个充满活力的青年男声。其声线刚毅有力且略带沙哑，说话节奏干脆利落、爆发力强。整体风格热血且极具战斗感，能够准确传达坚定与无畏的情绪，非常适合用于动作游戏角色、热血动漫配音或激昂的宣传片旁白等场景。",
    "trait": "刚毅有力,干脆利落,极具战斗感",
    "scene": "游戏与RPG、动漫与动画、广告与预告",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Spanish_PowerfulSoldier-0d284e8541-v6-a14e6bdb56061e18de3c.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Spanish_PowerfulSoldier-f1e50f1716.mp3",
    "accent": "标准西班牙语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Spanish_PassionateWarrior",
    "providerVoiceId": "Spanish_PassionateWarrior",
    "name": "Joel Ortega",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "西班牙语",
    "languages": [
      "西班牙文"
    ],
    "description": "这是一个充满活力与自信的青年男声。其声线清朗中带有一丝张扬，说话节奏紧凑有力、抑扬顿挫。整体风格热血且富有感染力，能准确传达出少年英雄的无畏与豪迈，非常适合用于热血动漫角色、战斗类游戏配音或冒险题材的有声读物。",
    "trait": "清朗,紧凑有力,热血",
    "scene": "游戏与RPG、动漫与动画、广告与预告",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Spanish_PassionateWarrior-e08a4847ef-v6-98da4c22ff5c8852a857.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Spanish_PassionateWarrior-8f8be56db9.mp3",
    "accent": "标准西班牙语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Spanish_ChattyGirl",
    "providerVoiceId": "Spanish_ChattyGirl",
    "name": "Paloma Medina",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "西班牙语",
    "languages": [
      "西班牙文"
    ],
    "description": "该音色以甜美明亮的音质和轻快跳跃的节奏为特征，极具辨识度。它能准确传达热情洋溢、亲切友好的情绪，给人一种邻家女孩般的陪伴感。这是社交应用助手、游戏引导角色和动漫配音类项目的理想选择，特别是针对活泼少女角色的演绎。",
    "trait": "甜美明亮,轻快跳跃,邻家女孩般的陪伴感",
    "scene": "游戏与RPG、企业宣传与旁白",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Spanish_ChattyGirl-1b10fbd8d6-v6-f9061f44f617984f212e.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Spanish_ChattyGirl-17cb5410d7.mp3",
    "accent": "标准西班牙语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Spanish_RomanticHusband",
    "providerVoiceId": "Spanish_RomanticHusband",
    "name": "Simón Montalvo",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "西班牙语",
    "languages": [
      "西班牙文"
    ],
    "description": "这是一个极具生活气息的青年男声。其声线自然松弛，略带沙哑质感，说话节奏随意慵懒、语调中充满反问与质疑。整体风格愤世嫉俗且情绪饱满，带有一种鲜明的澳洲口音特色，非常适合用于现代题材的广播剧、现实主义有声小说或影视剧中性格叛逆的角色配音。",
    "trait": "自然松弛,随意慵懒,愤世嫉俗",
    "scene": "广播剧、纪录片、播客与社媒",
    "age": "中年",
    "ageCategory": "中年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Spanish_RomanticHusband-7a4ba4ec33-v6-df1634657983d74acf46.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Spanish_RomanticHusband-e95de239e8.mp3",
    "accent": "标准西班牙语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Spanish_CompellingGirl",
    "providerVoiceId": "Spanish_CompellingGirl",
    "name": "Pilar Amaya",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "西班牙语",
    "languages": [
      "西班牙文"
    ],
    "description": "该音色以清亮坚定的音质和干脆利落的节奏为特征，极具辨识度。它能准确传达自信、果敢的情绪，带有强烈的指令感与紧迫感，是动作射击游戏、冒险题材动漫或以及间谍题材广播剧类项目的理想选择，特别是针对执行秘密任务的干练女特工角色的演绎。",
    "trait": "清亮坚定,干脆利落,自信果敢",
    "scene": "游戏与RPG、角色配音、播客与社媒",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Spanish_CompellingGirl-5b7edfe05e-v6-05f40e60a1663dc1d05c.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Spanish_CompellingGirl-c835449463.mp3",
    "accent": "标准西班牙语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Spanish_PowerfulVeteran",
    "providerVoiceId": "Spanish_PowerfulVeteran",
    "name": "Emilio Salcedo",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "西班牙语",
    "languages": [
      "西班牙文"
    ],
    "description": "这是一个充满压迫感的男声。其声线低沉粗砺且极具爆发力，说话节奏强硬有力、不容置疑。它能准确传达霸道、威严的情绪，是动作游戏和奇幻广播剧类项目的理想选择，特别是针对反派首领或战场指挥官角色的演绎。",
    "trait": "低沉粗砺,强硬有力,充满压迫感",
    "scene": "游戏与RPG、广播剧、角色配音、广告与预告",
    "age": "中年",
    "ageCategory": "中年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Spanish_PowerfulVeteran-8dc24ad884-v6-6f580f27aabd18493fc5.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Spanish_PowerfulVeteran-f33da3eff9.mp3",
    "accent": "标准西班牙语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Spanish_SensibleManager",
    "providerVoiceId": "Spanish_SensibleManager",
    "name": "Teodoro Navarro",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "西班牙语",
    "languages": [
      "西班牙文"
    ],
    "description": "这是一个极具辨识度的中年男声。其声线略带沙哑且充满张力，带有明显的非母语口音特征，说话节奏急促、情绪饱满。整体风格焦急恳切，极具戏剧感染力，非常适合用于现代都市剧、游戏剧情对话或悬疑广播剧等场景，特别是针对陷入困境的管理者或苦口婆心的谈判者角色的演绎。",
    "trait": "略带沙哑,节奏急促,焦急恳切",
    "scene": "广播剧、有声书与小说、角色配音、在线教育、企业宣传与旁白",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Spanish_SensibleManager-363a7793dd-v6-abf9bf331fc4be85105b.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Spanish_SensibleManager-0a008f5d98.mp3",
    "accent": "标准西班牙语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Spanish_ThoughtfulLady",
    "providerVoiceId": "Spanish_ThoughtfulLady",
    "name": "Elena Fuentes",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "西班牙语",
    "languages": [
      "西班牙文"
    ],
    "description": "这是一个温和亲切的中年女声。其声线柔和细腻且带有明显的母性光辉，说话节奏舒缓自然、如同邻家阿姨般平易近人。整体风格生活化且充满关怀感，听起来既有真实的情感流露又保持礼貌，非常适合用于日常生活场景对话、客服模拟或亲子教育类产品的广告配音。",
    "trait": "柔和细腻,舒缓自然,生活化",
    "scene": "广告与预告、在线教育、企业宣传与旁白",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Spanish_ThoughtfulLady-1fedd6a27f-v6-5d9a18f980e763829b6a.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Spanish_ThoughtfulLady-847e673b6e.mp3",
    "accent": "标准西班牙语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Portuguese_SentimentalLady",
    "providerVoiceId": "Portuguese_SentimentalLady",
    "name": "Mafalda Figueira",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "葡萄牙语",
    "languages": [
      "葡萄牙文"
    ],
    "description": "这是一个极具表现力的女声。其声线尖锐明亮且带有浓厚的英式贵族腔调，说话节奏夸张多变、充满戏剧感。整体风格傲慢且神经质，能生动传达出一种不可一世的优越感，非常适合用于奇幻游戏、欧美动画或广播剧中，特别是针对异族女王、刁蛮贵妇或性格古怪的女巫等角色的演绎。",
    "trait": "尖锐明亮,夸张多变,傲慢且神经质",
    "scene": "游戏与RPG、广播剧、动漫与动画",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Portuguese_SentimentalLady-2693ec5470-v6-0a93ec96eee3d84f94e7.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Portuguese_SentimentalLady-4ff3bb43bb.mp3",
    "accent": "标准葡萄牙语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Portuguese_BossyLeader",
    "providerVoiceId": "Portuguese_BossyLeader",
    "name": "Duarte Batista",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "葡萄牙语",
    "languages": [
      "葡萄牙文"
    ],
    "description": "这是一个成熟且极具压迫感的男声。其声线低沉沙哑，带有一种饱经风霜的粗砺质感，说话节奏强硬有力、不容置疑。整体风格严肃冷峻，充满了战场指挥官般的威严，非常适合用于动作游戏中的反派角色、史诗级电影预告片或军事题材的旁白解说，能够完美诠释铁血领袖的形象。",
    "trait": "低沉沙哑,强硬有力,严肃冷峻",
    "scene": "游戏与RPG、角色配音、广告与预告、播客与社媒、企业宣传与旁白",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Portuguese_BossyLeader-72f0db8eb3-v6-df02f0fb1fd0d16a6b45.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Portuguese_BossyLeader-9f03bd3939.mp3",
    "accent": "标准葡萄牙语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Portuguese_Wiselady",
    "providerVoiceId": "Portuguese_Wiselady",
    "name": "Beatriz Caldeira",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "葡萄牙语",
    "languages": [
      "葡萄牙文"
    ],
    "description": "这是一个优雅知性的女声。其声线清晰明亮且带有纯正的英式口音，说话节奏从容不迫、咬字精准。整体风格智慧且具有引导性，给人一种沉浸式的交互体验感，非常适合用于游戏引导旁白、互动展览说明或高端科技产品介绍等场景。",
    "trait": "清晰明亮,从容不迫,具有引导性",
    "scene": "游戏与RPG、在线教育",
    "age": "中年",
    "ageCategory": "中年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Portuguese_Wiselady-e55191a0de-v6-2434f584a2ebe439d694.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Portuguese_Wiselady-a9aa30a970.mp3",
    "accent": "标准葡萄牙语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Portuguese_Strong-WilledBoy",
    "providerVoiceId": "Portuguese_Strong-WilledBoy",
    "name": "Vasco Carvalho",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "葡萄牙语",
    "languages": [
      "葡萄牙文"
    ],
    "description": "该音色以清朗坚定的音质和抑扬顿挫的节奏为特征，极具辨识度。它能准确传达热血、执着的情绪，是角色配音和RPG游戏类项目的理想选择，特别是针对正义少年角色的演绎。",
    "trait": "清朗坚定,抑扬顿挫,热血",
    "scene": "游戏与RPG、广播剧、动漫与动画、角色配音",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Portuguese_Strong-WilledBoy-34b2ee3d8b-v6-94b60cff8740c7be6ed1.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Portuguese_Strong-WilledBoy-3ad8ce7181.mp3",
    "accent": "标准葡萄牙语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Portuguese_Deep-VoicedGentleman",
    "providerVoiceId": "Portuguese_Deep-VoicedGentleman",
    "name": "Lourenço Sampaio",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "葡萄牙语",
    "languages": [
      "葡萄牙文"
    ],
    "description": "这是一个充满磁性的中年男声。其声线低沉沙哑且富有力度，说话节奏张弛有度、情感饱满。整体风格豪迈且极具戏剧张力，非常适合用于游戏角色配音、有声漫画或史诗预告片等场景。",
    "trait": "低沉沙哑,张弛有度,极具戏剧张力",
    "scene": "游戏与RPG、有声书与小说、角色配音、纪录片",
    "age": "中年",
    "ageCategory": "中年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Portuguese_Deep-VoicedGentleman-22a54b25d4-v6-6b9ad40edd94f471c128.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Portuguese_Deep-VoicedGentleman-51d9876bba.mp3",
    "accent": "标准葡萄牙语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Portuguese_UpsetGirl",
    "providerVoiceId": "Portuguese_UpsetGirl",
    "name": "Inês Peixoto",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "葡萄牙语",
    "languages": [
      "葡萄牙文"
    ],
    "description": "这是一个年轻的女性声音。其声线轻柔细腻且略带气声，说话节奏缓慢迟疑，似乎在每一次停顿中都充满了纠结与不安。整体风格忧郁且充满歉意，准确传达出一种无助、悲伤或正在传递坏消息时的沉重感，非常适合用于广播剧中的悲情角色、伤感剧情的独白或互动游戏中处于困境的剧情人物设定。",
    "trait": "轻柔细腻,缓慢迟疑,忧郁歉意",
    "scene": "广播剧、有声书与小说",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Portuguese_UpsetGirl-4228ebc9aa-v6-c1e28f7cfe150687299f.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Portuguese_UpsetGirl-86bc6ebe62.mp3",
    "accent": "标准葡萄牙语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Portuguese_PassionateWarrior",
    "providerVoiceId": "Portuguese_PassionateWarrior",
    "name": "André Coelho",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "葡萄牙语",
    "languages": [
      "葡萄牙文"
    ],
    "description": "这是一个充满活力的青年男声。其声线清亮激昂，说话节奏紧凑有力。整体风格热血自信，极具戏剧张力，非常适合用于RPG游戏、热血动漫主角或冒险题材的有声书，能够完美演绎出英勇无畏的战士形象。",
    "trait": "清亮激昂,节奏紧凑,热血自信",
    "scene": "游戏与RPG、广播剧、有声书与小说、动漫与动画、角色配音",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Portuguese_PassionateWarrior-3f17668c9c-v6-ffd14070eb9c165947ac.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Portuguese_PassionateWarrior-7b33bfbcb2.mp3",
    "accent": "标准葡萄牙语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Portuguese_AnimeCharacter",
    "providerVoiceId": "Portuguese_AnimeCharacter",
    "name": "Carolina Tavares",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "葡萄牙语",
    "languages": [
      "葡萄牙文"
    ],
    "description": "该音色以高亢明亮且略带鼻音的音质为特征，语速急促紧凑，充满了戏剧张力。它能准确传达惊慌、激昂且略带滑稽的情绪，极具辨识度，是冒险游戏和热血动漫类项目的理想选择，特别是针对那个有点咋呼但又充满活力的冒险伙伴角色的演绎。",
    "trait": "高亢明亮,急促紧凑,充满戏剧张力",
    "scene": "游戏与RPG、广播剧、动漫与动画",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Portuguese_AnimeCharacter-1a1ce7a3fe-v6-840fc17dc9300e3ac0fe.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Portuguese_AnimeCharacter-f1de258309.mp3",
    "accent": "标准葡萄牙语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Portuguese_ConfidentWoman",
    "providerVoiceId": "Portuguese_ConfidentWoman",
    "name": "Catarina Queiroz",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "葡萄牙语",
    "languages": [
      "葡萄牙文"
    ],
    "description": "这是一个成熟干练的女声。其声线明亮穿透，说话节奏坚定有力、字字清晰。整体风格自信且充满气场，自带一种独立女性的坚毅感，非常适合用于高端商业广告、史诗游戏角色配音或励志类有声书的演播。",
    "trait": "明亮穿透,坚定有力,自信且充满气场",
    "scene": "有声书与小说、动漫与动画、角色配音、纪录片",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Portuguese_ConfidentWoman-baaa9c0fd7-v6-bfee684172395d586111.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Portuguese_ConfidentWoman-53ed3de3c6.mp3",
    "accent": "标准葡萄牙语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Portuguese_AngryMan",
    "providerVoiceId": "Portuguese_AngryMan",
    "name": "Rui Teixeira",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "葡萄牙语",
    "languages": [
      "葡萄牙文"
    ],
    "description": "该音色属于一个充满爆发力的年轻男声。其声线紧绷且略带沙哑，展现出极度的情绪张力，说话节奏急促、激烈，伴随着明显的气息起伏。整体风格极具对抗性和戏剧感，生动传达了愤怒、不甘与歇斯底里的情绪。这是一款典型的角色演绎型声音，非常适合用于影视剧、广播剧或游戏中的冲突场景，特别是针对叛逆青年或被激怒者的角色塑造。",
    "trait": "紧绷且略带沙哑,节奏急促,极具对抗性",
    "scene": "游戏与RPG、广播剧、动漫与动画、角色配音",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Portuguese_AngryMan-974fde5b9a-v6-68af457aebb8c0411cca.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Portuguese_AngryMan-fff5a247b4.mp3",
    "accent": "标准葡萄牙语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Portuguese_CaptivatingStoryteller",
    "providerVoiceId": "Portuguese_CaptivatingStoryteller",
    "name": "Salvador Neves",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "葡萄牙语",
    "languages": [
      "葡萄牙文"
    ],
    "description": "这是一个极具感染力的成熟男声。其声线低沉浑厚且富有磁性，说话节奏舒缓平稳、娓娓道来，如同讲述一段尘封的历史。整体风格沉稳大气且充满叙事感，能够瞬间将听众带入故事情境，非常适合用于历史纪录片、传记类有声书或史诗题材的游戏旁白等场景。",
    "trait": "低沉浑厚,娓娓道来,充满叙事感",
    "scene": "有声书与小说、纪录片、在线教育",
    "age": "中年",
    "ageCategory": "中年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Portuguese_CaptivatingStoryteller-9199624c44-v6-02531174d8e76503a621.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Portuguese_CaptivatingStoryteller-e7aeeabbe4.mp3",
    "accent": "标准葡萄牙语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Portuguese_Godfather",
    "providerVoiceId": "Portuguese_Godfather",
    "name": "António Cunha",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "葡萄牙语",
    "languages": [
      "葡萄牙文"
    ],
    "description": "这是一个极具辨识度的老年男声。其声线沙哑低沉且带有强烈的颗粒感，说话节奏缓慢凝重、含混中透着一种不容置疑的威严。整体风格阴郁且充满压迫感，仿佛一位历经沧桑的掌权者在低语，非常适合用于黑帮题材的电影角色配音、史诗感强烈的广播剧或悬疑剧情解说等场景。",
    "trait": "沙哑低沉,缓慢凝重,充满压迫感",
    "scene": "广播剧、动漫与动画、角色配音、播客与社媒、企业宣传与旁白",
    "age": "老年",
    "ageCategory": "老年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Portuguese_Godfather-afc05e3472-v6-19210c8bdd5c9b62a3d2.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Portuguese_Godfather-7324081248.mp3",
    "accent": "标准葡萄牙语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Portuguese_ReservedYoungMan",
    "providerVoiceId": "Portuguese_ReservedYoungMan",
    "name": "Nuno Teixeira",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "葡萄牙语",
    "languages": [
      "葡萄牙文"
    ],
    "description": "这是一个清澈温润的青年男声。其声线纯净透亮且略带书卷气，说话节奏舒缓沉稳、彬彬有礼，给人一种内敛而真诚的感觉。这种音色极具少年感，能够准确传达冷静或深情的情绪，非常适合用于角色扮演游戏、二次元广播剧或青春小说有声书，能够完美契合温文尔雅的少年或高智商军师角色的设定。",
    "trait": "纯净透亮,彬彬有礼,内敛真诚",
    "scene": "游戏与RPG、有声书与小说、动漫与动画、角色配音",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Portuguese_ReservedYoungMan-b3099fa645-v6-2a7a4ee0793f391688a1.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Portuguese_ReservedYoungMan-e20c6ff01e.mp3",
    "accent": "标准葡萄牙语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Portuguese_SmartYoungGirl",
    "providerVoiceId": "Portuguese_SmartYoungGirl",
    "name": "Rita Neves",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "葡萄牙语",
    "languages": [
      "葡萄牙文"
    ],
    "description": "这是一个充满童趣的稚嫩女童声。其声线高昂清脆且富有穿透力，说话节奏灵动活泼、语调变化丰富。整体风格机灵古怪且极具表现力，能够准确传达出孩子特有的天真与小烦恼，非常适合用于儿童有声读物、教育类动画配音或卡通角色扮演等场景。",
    "trait": "高昂清脆,灵动活泼,机灵古怪",
    "scene": "游戏与RPG、有声书与小说、动漫与动画、在线教育",
    "age": "儿童",
    "ageCategory": "儿童",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Portuguese_SmartYoungGirl-c8f03c3608-v6-c1b07e9951968f1b0596.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Portuguese_SmartYoungGirl-201e02c6a0.mp3",
    "accent": "标准葡萄牙语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Portuguese_Kind-heartedGirl",
    "providerVoiceId": "Portuguese_Kind-heartedGirl",
    "name": "Bruna Azevedo",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "葡萄牙语",
    "languages": [
      "葡萄牙文"
    ],
    "description": "该音色以清澈甜美的音质和轻快流畅的节奏为特征，极具辨识度。它能准确传达积极阳光、充满希望的情绪，是卡通动画和青少年有声书类项目的理想选择，特别是针对活力少女角色的演绎。",
    "trait": "清澈甜美,轻快流畅,积极阳光",
    "scene": "有声书与小说、播客与社媒",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Portuguese_Kind-heartedGirl-9d08f82457-v6-424ac7d5ebc46420d251.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Portuguese_Kind-heartedGirl-67b6bc510d.mp3",
    "accent": "标准葡萄牙语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Portuguese_Pompouslady",
    "providerVoiceId": "Portuguese_Pompouslady",
    "name": "Filipa Nogueira",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "葡萄牙语",
    "languages": [
      "葡萄牙文"
    ],
    "description": "该音色以高亢尖锐的音质和矫揉造作的节奏为特征，极具辨识度。它能准确传达傲慢、滑稽的情绪，是卡通动画和游戏与RPG类项目的理想选择，特别是针对刁蛮贵妇角色的演绎。",
    "trait": "高亢尖锐,矫揉造作,傲慢",
    "scene": "游戏与RPG、广播剧、动漫与动画、播客与社媒",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Portuguese_Pompouslady-caaa93ac69-v6-fa184760fd00dcf377ad.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Portuguese_Pompouslady-6fc96cefcc.mp3",
    "accent": "标准葡萄牙语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Portuguese_Grinch",
    "providerVoiceId": "Portuguese_Grinch",
    "name": "Henrique Nunes",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "葡萄牙语",
    "languages": [
      "葡萄牙文"
    ],
    "description": "这是一个极具戏剧张力的男声。其声线沙哑粗砺且充满爆发力，说话节奏夸张多变、情绪起伏剧烈。整体风格滑稽狡黠且带有一丝癫狂，非常适合用于反派角色配音、喜剧动画或游戏中的怪诞生物演绎。",
    "trait": "沙哑粗砺,夸张多变,滑稽狡黠",
    "scene": "游戏与RPG、动漫与动画、广告与预告",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Portuguese_Grinch-fca36d30d2-v6-3e4a22c7021affd0b996.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Portuguese_Grinch-6450860699.mp3",
    "accent": "标准葡萄牙语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Portuguese_Debator",
    "providerVoiceId": "Portuguese_Debator",
    "name": "António Moura",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "葡萄牙语",
    "languages": [
      "葡萄牙文"
    ],
    "description": "该音色以沙哑粗砺的音质和松弛痞气的节奏为特征，极具辨识度。它能准确传达狡黠、市侩的情绪，是冒险游戏和动画电影类项目的理想选择，特别是针对贪婪海盗或狡猾恶棍角色的演绎。",
    "trait": "沙哑粗砺,松弛痞气,狡黠市侩",
    "scene": "游戏与RPG、广播剧、动漫与动画",
    "age": "中年",
    "ageCategory": "中年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Portuguese_Debator-a7c27ccfd5-v6-85bb3712cc5c76f6031c.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Portuguese_Debator-b1439bedc9.mp3",
    "accent": "标准葡萄牙语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Portuguese_SweetGirl",
    "providerVoiceId": "Portuguese_SweetGirl",
    "name": "Patrícia Sampaio",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "葡萄牙语",
    "languages": [
      "葡萄牙文"
    ],
    "description": "该音色以甜美娇俏的音质和夸张戏剧化的节奏为特征，极具辨识度。它能准确传达虚荣、傲慢且略带做作的情绪，是动漫动画和校园题材游戏的理想选择，特别是针对娇纵校花或心机反派角色的演绎。",
    "trait": "甜美娇俏,夸张戏剧化,虚荣傲慢",
    "scene": "游戏与RPG",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Portuguese_SweetGirl-37dcc2c254-v6-ab1b5cc3466eb352a8ce.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Portuguese_SweetGirl-ccfe85b6f0.mp3",
    "accent": "标准葡萄牙语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Portuguese_AttractiveGirl",
    "providerVoiceId": "Portuguese_AttractiveGirl",
    "name": "Luísa Peixoto",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "葡萄牙语",
    "languages": [
      "葡萄牙文"
    ],
    "description": "这是一个充满青春气息的年轻女声。其声线甜美细腻且略带气声，说话节奏自然随性、如同日常交谈般不做作。整体风格亲切且富有感染力，自带一种邻家女孩般的亲近感，非常适合用于播客访谈、生活类Vlog旁白或社交媒体视频等场景，能够完美契合都市少女的设定。",
    "trait": "甜美细腻,自然随性,邻家女孩感",
    "scene": "游戏与RPG、播客与社媒",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Portuguese_AttractiveGirl-0f4561ad98-v6-938a4d27c61a9fb250af.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Portuguese_AttractiveGirl-4e1cdad5ff.mp3",
    "accent": "标准葡萄牙语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Portuguese_ThoughtfulMan",
    "providerVoiceId": "Portuguese_ThoughtfulMan",
    "name": "Afonso Carvalho",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "葡萄牙语",
    "languages": [
      "葡萄牙文"
    ],
    "description": "这是一个充满朝气且真挚的青年男声。其声线清亮干净，带有明显的少年感，说话节奏轻快且富有张力。整体风格既显诚恳又具活力，能够准确传达角色的坚定信念与热血情绪，非常适合用于二次元动漫配音、RPG游戏角色演绎或青少年向的有声读物。",
    "trait": "清亮干净,节奏轻快,诚恳活力",
    "scene": "游戏与RPG、广播剧、有声书与小说、角色配音、纪录片、播客与社媒、企业宣传与旁白",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Portuguese_ThoughtfulMan-6c9438f8b5-v6-3c28b93a7f770e0f8b6d.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Portuguese_ThoughtfulMan-d265823b0d.mp3",
    "accent": "标准葡萄牙语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Portuguese_PlayfulGirl",
    "providerVoiceId": "Portuguese_PlayfulGirl",
    "name": "Alice Campos",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "葡萄牙语",
    "languages": [
      "葡萄牙文"
    ],
    "description": "该音色以甜美清亮的音质和灵动活泼的节奏为特征，极具辨识度。它能准确传达兴奋、热切的情绪，是动漫动画和游戏RPG类项目的理想选择，特别是针对元气少女角色的演绎。",
    "trait": "甜美清亮,灵动活泼,元气少女感",
    "scene": "游戏与RPG、有声书与小说、动漫与动画",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Portuguese_PlayfulGirl-4f728cf069-v6-6dae0b8c370888d4ae6c.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Portuguese_PlayfulGirl-401f892f6f.mp3",
    "accent": "标准葡萄牙语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Portuguese_GorgeousLady",
    "providerVoiceId": "Portuguese_GorgeousLady",
    "name": "Diana Braga",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "葡萄牙语",
    "languages": [
      "葡萄牙文"
    ],
    "description": "这是一位极具魅力的青年女声。其声线妩媚动人，音质清亮且带有丝绸般的细腻质感，说话节奏娓娓道来、从容优雅。整体风格慵懒高贵，能够准确传达出自信、神秘甚至带有一丝傲慢的情绪，非常适合用于奇幻游戏的角色配音、动漫中的女王型角色或情感丰富的有声书旁白。",
    "trait": "妩媚动人,娓娓道来,慵懒高贵",
    "scene": "游戏与RPG、广播剧、动漫与动画、角色配音",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Portuguese_GorgeousLady-97b4759964-v6-9672cd84d16b13c055a4.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Portuguese_GorgeousLady-c86dd0bef2.mp3",
    "accent": "标准葡萄牙语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Portuguese_LovelyLady",
    "providerVoiceId": "Portuguese_LovelyLady",
    "name": "Isabel Rocha",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "葡萄牙语",
    "languages": [
      "葡萄牙文"
    ],
    "description": "这是一个充满力量感的御姐音。其声线略带沙哑且极富磁性，说话节奏干脆利落、豪爽大气。整体风格自信且具有统御力，能够准确传达出坚定、豪迈的情绪，非常适合用于游戏角色配音、热血动漫或大女主剧集等场景，特别是针对女战士或女性领袖角色的演绎。",
    "trait": "略带沙哑,干脆利落,具有统御力",
    "scene": "游戏与RPG、广播剧、有声书与小说、角色配音",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Portuguese_LovelyLady-79b321e284-v6-7bfc4fb0acb1726cd329.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Portuguese_LovelyLady-ff17d9d71d.mp3",
    "accent": "标准葡萄牙语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Portuguese_SereneWoman",
    "providerVoiceId": "Portuguese_SereneWoman",
    "name": "Joana Neves",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "葡萄牙语",
    "languages": [
      "葡萄牙文"
    ],
    "description": "这是一个极具表现力和戏剧张力的成年女声。其声线明亮清晰且富有穿透力，说话节奏灵活多变，能够驾驭从激昂独白到神经质碎碎念等多种语境。整体风格生动鲜活，自带一种强烈的舞台表演感，非常适合用于美式动画配音、奇幻游戏角色塑造或情绪起伏较大的有声小说演播。",
    "trait": "明亮清晰,节奏灵活,舞台表演感",
    "scene": "有声书与小说、纪录片、在线教育",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Portuguese_SereneWoman-954ecd8eac-v6-c38c38f7598e957f8958.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Portuguese_SereneWoman-6bcb9ce923.mp3",
    "accent": "标准葡萄牙语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Portuguese_SadTeen",
    "providerVoiceId": "Portuguese_SadTeen",
    "name": "Dinis Carvalho",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "葡萄牙语",
    "languages": [
      "葡萄牙文"
    ],
    "description": "这是一个极具辨识度的青年男声，带有浓厚的英式伦敦腔。其音色略带沙哑且透着一股痞气，说话节奏急促随意，常伴有独特的吞音现象。整体语调充满了讽刺、抱怨与不耐烦的情绪，生动地刻画出一个处于叛逆期的街头少年形象。这种声音非常适合用于现代都市广播剧、影视配音或游戏中的街头混混及叛逆少年角色演绎。",
    "trait": "略带沙哑,节奏急促,充满了讽刺",
    "scene": "游戏与RPG、广播剧、动漫与动画、角色配音",
    "age": "儿童",
    "ageCategory": "儿童",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Portuguese_SadTeen-526e414951-v6-2815ed3dbe3ce10ce50a.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Portuguese_SadTeen-4d5547a2fd.mp3",
    "accent": "标准葡萄牙语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Portuguese_MaturePartner",
    "providerVoiceId": "Portuguese_MaturePartner",
    "name": "Álvaro Sampaio",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "葡萄牙语",
    "languages": [
      "葡萄牙文"
    ],
    "description": "这是一个充满沧桑感的中年男声。其声线粗砺沙哑且带有浓厚的颗粒感，说话节奏抑扬顿挫，带有一种独特的苏格兰方言韵味。整体风格显得有些暴躁却又极具生活气息，听起来像是一个爱发牢骚的店铺老板，非常适合用于奇幻游戏中的矮人角色、动漫中的固执长辈或影视剧中的蓝领阶层配音。",
    "trait": "粗砺沙哑,抑扬顿挫,爱发牢骚",
    "scene": "游戏与RPG、广播剧、角色配音",
    "age": "中年",
    "ageCategory": "中年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Portuguese_MaturePartner-9e027d8124-v6-f3128a04474d818f6db1.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Portuguese_MaturePartner-2c76f332c6.mp3",
    "accent": "标准葡萄牙语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Portuguese_Comedian",
    "providerVoiceId": "Portuguese_Comedian",
    "name": "Diogo Faria",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "葡萄牙语",
    "languages": [
      "葡萄牙文"
    ],
    "description": "该音色以高亢明亮的音质和抑扬顿挫的节奏为特征，极具辨识度。它自带一种天然的喜感，带有明显的英式方言韵律，能准确传达幽默、滑稽的情绪。这种声音充满戏剧张力，是儿童绘本和趣味广告类项目的理想选择，特别是针对滑稽小丑或活力讲述者角色的演绎。",
    "trait": "高亢明亮,抑扬顿挫,幽默滑稽",
    "scene": "有声书与小说、动漫与动画、广告与预告、在线教育、企业宣传与旁白",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Portuguese_Comedian-0c6423c0e7-v6-d3962dbde03858632be0.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Portuguese_Comedian-2e1ac32937.mp3",
    "accent": "标准葡萄牙语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Portuguese_NaughtySchoolgirl",
    "providerVoiceId": "Portuguese_NaughtySchoolgirl",
    "name": "Matilde Coelho",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "葡萄牙语",
    "languages": [
      "葡萄牙文"
    ],
    "description": "这是一个充满童趣且极具表现力的女声。其声线清脆甜美，音域较高，说话节奏轻快跳跃、抑扬顿挫，充满了戏剧张力。整体风格俏皮可爱，带有一种天马行空的梦幻感，能准确传达出活泼好奇的情绪。这种极具辨识度的声音非常适合用于儿童绘本朗读、卡通动画配音或奇幻故事讲述等场景，特别是演绎古灵精怪的小女孩角色。",
    "trait": "清脆甜美,轻快跳跃,俏皮可爱",
    "scene": "游戏与RPG、动漫与动画、播客与社媒、企业宣传与旁白",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Portuguese_NaughtySchoolgirl-c75cdd94f5-v6-07d04c02e2a7e2ada947.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Portuguese_NaughtySchoolgirl-ae197a0221.mp3",
    "accent": "标准葡萄牙语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Portuguese_Narrator",
    "providerVoiceId": "Portuguese_Narrator",
    "name": "Palmira Teixeira",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "葡萄牙语",
    "languages": [
      "葡萄牙文"
    ],
    "description": "这是一个充满活力的中年女声。其声线温暖亲切且极具表现力，说话节奏轻快活泼、语调抑扬顿挫。整体风格热情且富有感染力，极具生活气息，能准确传达关切、乐观与调侃的情绪，是卡通动画和儿童有声书类项目的理想选择，特别是针对热心邻居或慈祥长辈角色的演绎。",
    "trait": "温暖亲切,轻快活泼,热情感染力",
    "scene": "有声书与小说、动漫与动画、广告与预告",
    "age": "老年",
    "ageCategory": "老年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Portuguese_Narrator-bb0e9c1ac0-v6-6f0969ec79713287d365.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Portuguese_Narrator-431eaaa4f9.mp3",
    "accent": "标准葡萄牙语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Portuguese_ToughBoss",
    "providerVoiceId": "Portuguese_ToughBoss",
    "name": "Adriana Nunes",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "葡萄牙语",
    "languages": [
      "葡萄牙文"
    ],
    "description": "这是一个成熟干练的女声。其声线略带沙哑且浑厚有力，说话节奏沉稳严肃、张弛有度。整体风格充满故事感与沧桑感，能够准确传达出一种历经磨难后的坚定与威严，非常适合用于科幻游戏旁白、影视预告片或史诗感强烈的剧情演绎等场景。",
    "trait": "略带沙哑,沉稳严肃,充满故事感",
    "scene": "游戏与RPG、广播剧、广告与预告",
    "age": "中年",
    "ageCategory": "中年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Portuguese_ToughBoss-4e432914f4-v6-12873e00745d5ade04d1.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Portuguese_ToughBoss-cd36ea2bd3.mp3",
    "accent": "标准葡萄牙语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Portuguese_Fussyhostess",
    "providerVoiceId": "Portuguese_Fussyhostess",
    "name": "Fátima Moura",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "葡萄牙语",
    "languages": [
      "葡萄牙文"
    ],
    "description": "该音色以尖锐高亢的音质和急促且充满压迫感的节奏为特征，极具戏剧张力。它能准确传达傲慢、焦躁以及不可一世的情绪，听起来像是一位时刻在发号施令的暴躁女王，是奇幻冒险游戏和卡通动画类项目的理想选择，特别是针对反派女首领角色的演绎。",
    "trait": "尖锐高亢,急促且充满压迫感,暴躁女王",
    "scene": "游戏与RPG、广播剧、动漫与动画、角色配音",
    "age": "中年",
    "ageCategory": "中年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Portuguese_Fussyhostess-25273f396e-v6-4c2a1953552c51b7ffe4.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Portuguese_Fussyhostess-351824cd75.mp3",
    "accent": "标准葡萄牙语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Portuguese_Dramatist",
    "providerVoiceId": "Portuguese_Dramatist",
    "name": "César Leitão",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "葡萄牙语",
    "languages": [
      "葡萄牙文"
    ],
    "description": "这是一个粗砺豪迈的男声。其声线沙哑且带有强烈的颗粒感，说话节奏张扬夸张、极具爆发力。整体风格狂放不羁且略带戏谑，极具辨识度，非常适合用于奇幻游戏、热血动漫等场景，特别是针对海盗船长或矮人战士这类角色的演绎。",
    "trait": "沙哑,张扬夸张,狂放不羁",
    "scene": "游戏与RPG、动漫与动画",
    "age": "中年",
    "ageCategory": "中年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Portuguese_Dramatist-a79391acd3-v6-b1d086958618cdc8e4da.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Portuguese_Dramatist-4874037fa6.mp3",
    "accent": "标准葡萄牙语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Portuguese_Steadymentor",
    "providerVoiceId": "Portuguese_Steadymentor",
    "name": "Vicente Mendonça",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "葡萄牙语",
    "languages": [
      "葡萄牙文"
    ],
    "description": "这是一个充满戏剧张力的中年男声。其声线沙哑粗犷且带有极强的颗粒感，仿佛来自地狱深渊，说话节奏抑扬顿挫、爆发力十足。整体风格狂妄阴森且极具威慑力，能精准传达出角色的邪恶与不朽感，是奇幻游戏中不死族首领、骷髅将军或暗黑风格动画反派的完美选择。",
    "trait": "沙哑粗犷,抑扬顿挫,狂妄阴森",
    "scene": "游戏与RPG",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Portuguese_Steadymentor-e4b5a5d8fd-v6-057ac9050147a49c1a26.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Portuguese_Steadymentor-bc2d548983.mp3",
    "accent": "标准葡萄牙语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Portuguese_Jovialman",
    "providerVoiceId": "Portuguese_Jovialman",
    "name": "Otávio Matos",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "葡萄牙语",
    "languages": [
      "葡萄牙文"
    ],
    "description": "这是一个热情爽朗的中年男声。其声线粗犷且略带沙哑，说话节奏轻松随意、抑扬顿挫。整体风格滑稽且极具亲和力，自带一种浓厚的美式幽默感与松弛感，非常适合用于喜剧动画角色、复古电台DJ或趣味广告等场景的演绎。",
    "trait": "粗犷且略带沙哑,节奏轻松随意,滑稽且极具亲和力",
    "scene": "游戏与RPG、广播剧、动漫与动画、企业宣传与旁白",
    "age": "中年",
    "ageCategory": "中年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Portuguese_Jovialman-912d709f5d-v6-f8534c9959a3f342e595.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Portuguese_Jovialman-ed5f9d44f1.mp3",
    "accent": "标准葡萄牙语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Portuguese_CharmingQueen",
    "providerVoiceId": "Portuguese_CharmingQueen",
    "name": "Carla Neves",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "葡萄牙语",
    "languages": [
      "葡萄牙文"
    ],
    "description": "这是一个极具辨识度的成熟女声。其声线冷艳且富有磁性，发音带有独特的法式口音，说话节奏舒缓、慵懒优雅。整体风格高冷神秘且充满诱惑力，非常适合用于电子游戏中的刺客角色、谍战类广播剧或电影独白，能够完美契合冷面御姐的设定。",
    "trait": "冷艳磁性,慵懒优雅,高冷神秘",
    "scene": "游戏与RPG、广播剧、角色配音、广告与预告",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Portuguese_CharmingQueen-aa8c1a25a9-v6-4dbe733bbc6e6ff16209.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Portuguese_CharmingQueen-2c5559b247.mp3",
    "accent": "标准葡萄牙语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Portuguese_SantaClaus",
    "providerVoiceId": "Portuguese_SantaClaus",
    "name": "Manuel Andrade",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "葡萄牙语",
    "languages": [
      "葡萄牙文"
    ],
    "description": "这是一个充满活力的老年男声（角色音）。其声线浑厚洪亮、中气十足，带有明显的胸腔共鸣，说话节奏夸张、戏剧化且富有感染力。整体风格热情洋溢、喜庆欢快，完美复刻了圣诞老人的经典形象，非常适合用于节日庆典宣传、儿童有声读物、商场广播或动画角色配音等场景。",
    "trait": "浑厚洪亮,戏剧化,喜庆欢快",
    "scene": "广播剧、广告与预告、企业宣传与旁白",
    "age": "老年",
    "ageCategory": "老年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Portuguese_SantaClaus-764e791026-v6-5a6a60d481e5bcf1a1c0.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Portuguese_SantaClaus-9933dab84b.mp3",
    "accent": "标准葡萄牙语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Portuguese_Rudolph",
    "providerVoiceId": "Portuguese_Rudolph",
    "name": "Clara Sequeira",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "葡萄牙语",
    "languages": [
      "葡萄牙文"
    ],
    "description": "该音色以极具辨识度的鼻音质感和略显稚嫩的少年声线为特征。说话节奏略带羞涩与迟疑，还原了经典动画角色的天真神态。它能准确传达纯真、可爱的卡通形象情绪，是动画配音和儿童故事类项目的理想选择，特别是针对经典驯鹿鲁道夫或感冒的小男孩角色的演绎。",
    "trait": "鼻音质感,略显稚嫩,卡通形象感",
    "scene": "游戏与RPG、动漫与动画、角色配音、广告与预告",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Portuguese_Rudolph-c2b9c9c35f-v6-66fc580133ccb590958c.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Portuguese_Rudolph-2d94c2cbe3.mp3",
    "accent": "标准葡萄牙语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Portuguese_Arnold",
    "providerVoiceId": "Portuguese_Arnold",
    "name": "Artur Pinheiro",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "葡萄牙语",
    "languages": [
      "葡萄牙文"
    ],
    "description": "这是一个极具辨识度的老年男声。其声线浑厚低沉且带有明显的沙哑颗粒感，说话节奏从容不迫，伴随着标志性的德式英语口音。整体风格硬朗中透着一种阅尽千帆的亲历者叙事感，非常适合用于人物传记、动作电影幕后访谈或具有史诗感的硬汉角色独白等场景。",
    "trait": "浑厚低沉,从容不迫,亲历者叙事感",
    "scene": "有声书与小说、纪录片、播客与社媒",
    "age": "老年",
    "ageCategory": "老年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Portuguese_Arnold-8af61fca6a-v6-41fab92b0c3618249f49.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Portuguese_Arnold-98aec50593.mp3",
    "accent": "标准葡萄牙语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Portuguese_CharmingSanta",
    "providerVoiceId": "Portuguese_CharmingSanta",
    "name": "Joaquim Braga",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "葡萄牙语",
    "languages": [
      "葡萄牙文"
    ],
    "description": "这是一个极具辨识度的老年男声。其声线低沉沙哑且富有磁性，说话节奏从容不迫、抑扬顿挫。整体风格威严神秘，自带一种强烈的戏剧张力，非常适合用于奇幻游戏、暗黑童话或电影预告片等场景，特别是针对神秘长者角色的演绎。",
    "trait": "低沉沙哑,抑扬顿挫,威严神秘",
    "scene": "游戏与RPG、动漫与动画、广告与预告、播客与社媒",
    "age": "老年",
    "ageCategory": "老年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Portuguese_CharmingSanta-b18d92fc40-v6-8ef6399929500446a41a.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Portuguese_CharmingSanta-e4be04df0b.mp3",
    "accent": "标准葡萄牙语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Portuguese_CharmingLady",
    "providerVoiceId": "Portuguese_CharmingLady",
    "name": "Teresa Teixeira",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "葡萄牙语",
    "languages": [
      "葡萄牙文"
    ],
    "description": "这是一个充满魅力的青年女声。其声线气声饱满且略带沙哑，充满了丝绒般的质感，说话节奏缓慢轻柔、仿佛在耳边低语。整体风格性感撩人且极具亲密感，给人一种暧昧、令人心跳加速的感觉。非常适合用于言情小说中的魅惑角色、游戏中的互动剧情或深夜情感类ASMR内容，能够完美契合诱惑者的设定。",
    "trait": "气声饱满,耳边低语,性感撩人",
    "scene": "游戏与RPG、广播剧、角色配音",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Portuguese_CharmingLady-0f81bcfa87-v6-05e4cd5944112be1f1d9.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Portuguese_CharmingLady-50b79c77ec.mp3",
    "accent": "标准葡萄牙语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Portuguese_Ghost",
    "providerVoiceId": "Portuguese_Ghost",
    "name": "Fernando Braga",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "葡萄牙语",
    "languages": [
      "葡萄牙文"
    ],
    "description": "这是一个极具辨识度的硬汉男声。其声线低沉沙哑且带有明显的颗粒感，那种特有的面罩式闷音赋予了声音极强的神秘色彩。说话节奏干脆利落、指令清晰，带有浓郁的英伦风味。整体风格冷静克制却充满压迫感，非常适合用于射击游戏角色配音、军事题材的广播剧或紧张激烈的战场通讯模拟，能够完美演绎冷峻特工或战场指挥官的形象。",
    "trait": "低沉沙哑,节奏干脆,冷静克制",
    "scene": "游戏与RPG",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Portuguese_Ghost-567d44813e-v6-77539fbb9ce72767c4e8.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Portuguese_Ghost-26a87c1997.mp3",
    "accent": "标准葡萄牙语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Portuguese_HumorousElder",
    "providerVoiceId": "Portuguese_HumorousElder",
    "name": "António Mendonça",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "葡萄牙语",
    "languages": [
      "葡萄牙文"
    ],
    "description": "这是一个滑稽且富有表现力的男声。其声线沙哑颤抖但充满活力，说话节奏夸张跳跃、抑扬顿挫。整体风格诙谐幽默且极具戏剧张力，非常适合用于动画配音、儿童故事讲述或搞笑短视频等场景，能够完美契合搞怪老爷爷的设定。",
    "trait": "沙哑颤抖,夸张跳跃,诙谐幽默",
    "scene": "有声书与小说、动漫与动画、角色配音、广告与预告",
    "age": "老年",
    "ageCategory": "老年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Portuguese_HumorousElder-c36ab02252-v6-12b9b873d596a86e8830.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Portuguese_HumorousElder-2eb1d2af29.mp3",
    "accent": "标准葡萄牙语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Portuguese_CalmLeader",
    "providerVoiceId": "Portuguese_CalmLeader",
    "name": "Rodrigo Neves",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "葡萄牙语",
    "languages": [
      "葡萄牙文"
    ],
    "description": "这是一个极具个性的中年男声。其声线低沉粗犷，带有明显的沙哑颗粒感，说话节奏随意自然、并不拘泥于标准发音。整体风格透着一种历经沧桑的街头江湖气，给人一种外表冷硬实则沉稳的感觉，非常适合用于犯罪题材的游戏角色、黑色幽默风格的广告或独具特色的有声书旁白。",
    "trait": "低沉粗犷,随意自然,街头江湖气",
    "scene": "动漫与动画、角色配音、广告与预告、播客与社媒",
    "age": "中年",
    "ageCategory": "中年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Portuguese_CalmLeader-8cec71d4c9-v6-53d9da727ab7f9ae0a3b.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Portuguese_CalmLeader-f16ec84ad6.mp3",
    "accent": "标准葡萄牙语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Portuguese_GentleTeacher",
    "providerVoiceId": "Portuguese_GentleTeacher",
    "name": "Joaquim Neves",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "葡萄牙语",
    "languages": [
      "葡萄牙文"
    ],
    "description": "这是一个温和睿智的中年男声。其声线清澈且富有亲和力，音质干净利落，说话节奏从容不迫、循循善诱，咬字清晰准确。整体风格既有师长的权威感又不失儒雅风度，给人一种耐心讲解的感觉，非常适合用于在线教育内容、有声书朗读或知识科普类视频的旁白。",
    "trait": "声线清澈,循循善诱,耐心讲解",
    "scene": "纪录片、在线教育、播客与社媒、企业宣传与旁白",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Portuguese_GentleTeacher-f037c2dddf-v6-7620f18f3908506d52e8.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Portuguese_GentleTeacher-556ff5409c.mp3",
    "accent": "标准葡萄牙语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Portuguese_EnergeticBoy",
    "providerVoiceId": "Portuguese_EnergeticBoy",
    "name": "Tomás Mendonça",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "葡萄牙语",
    "languages": [
      "葡萄牙文"
    ],
    "description": "该音色以阳光清爽的音质和活力四射的节奏为特征，极具感染力。它能准确传达热情、自信的情绪，语调高昂且充满朝气，给人一种邻家大男孩的亲切感。这种声音是游戏角色配音和动漫动画类项目的理想选择，特别是针对热血少年角色的演绎。",
    "trait": "阳光清爽,活力四射,邻家大男孩",
    "scene": "游戏与RPG、广播剧、动漫与动画、角色配音、播客与社媒、企业宣传与旁白",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Portuguese_EnergeticBoy-9bac886249-v6-2ef907ab87b05a68b4fe.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Portuguese_EnergeticBoy-781e487873.mp3",
    "accent": "标准葡萄牙语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Portuguese_ReliableMan",
    "providerVoiceId": "Portuguese_ReliableMan",
    "name": "Tomé Peixoto",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "葡萄牙语",
    "languages": [
      "葡萄牙文"
    ],
    "description": "这是一个优雅从容的成熟男声。其声线低沉醇厚且富有极强的磁性，说话节奏舒缓流畅、娓娓道来。整体风格博学儒雅且令人信赖，自带一种历经沧桑的智者风范，非常适合用于史诗奇幻游戏的角色配音、历史纪录片旁白或高端品牌的叙事广告。",
    "trait": "低沉醇厚,娓娓道来,智者风范",
    "scene": "游戏与RPG、广告与预告、播客与社媒、企业宣传与旁白",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Portuguese_ReliableMan-9abfd55120-v6-26722bc5e372b4867a84.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Portuguese_ReliableMan-113f8bb23f.mp3",
    "accent": "标准葡萄牙语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Portuguese_SereneElder",
    "providerVoiceId": "Portuguese_SereneElder",
    "name": "Manuel Nunes",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "葡萄牙语",
    "languages": [
      "葡萄牙文"
    ],
    "description": "这是一个充满岁月沧桑感的老年男声。其声线低沉沙哑且带有独特的颗粒质感，说话节奏缓慢沉稳、娓娓道来。整体风格极具戏剧张力与故事感，夹带独特的欧洲口音韵味，非常适合用于历史题材纪录片、奇幻游戏中的智者角色或有声书旁白，能够完美契合经历丰富的老年讲述者设定。",
    "trait": "低沉沙哑,娓娓道来,故事感",
    "scene": "游戏与RPG、动漫与动画、纪录片、在线教育",
    "age": "老年",
    "ageCategory": "老年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Portuguese_SereneElder-1bdfec5cd3-v6-1ea94a978de1085b14cf.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Portuguese_SereneElder-b95acacba6.mp3",
    "accent": "标准葡萄牙语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Portuguese_GrimReaper",
    "providerVoiceId": "Portuguese_GrimReaper",
    "name": "Duarte Tavares",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "葡萄牙语",
    "languages": [
      "葡萄牙文"
    ],
    "description": "这是一个极具压迫感的暗黑男声。其声线低沉沙哑且富有强烈的颗粒质感，说话节奏冷酷坚定、透着一股不容置疑的威慑力。整体风格阴郁恐怖且充满危险气息，能精准传达复仇与死亡的意象，非常适合用于动作游戏中的反派BOSS、恐怖电影预告或暗黑题材的有声书，特别是针对冷血杀手或地狱使者角色的演绎。",
    "trait": "低沉沙哑,节奏冷酷,阴郁恐怖",
    "scene": "游戏与RPG、动漫与动画、广告与预告",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Portuguese_GrimReaper-9cffb72cea-v6-1ea99ce7e05d796f0eff.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Portuguese_GrimReaper-59e6070ed2.mp3",
    "accent": "标准葡萄牙语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Portuguese_AssertiveQueen",
    "providerVoiceId": "Portuguese_AssertiveQueen",
    "name": "Violeta Neves",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "葡萄牙语",
    "languages": [
      "葡萄牙文"
    ],
    "description": "这是一个成熟优雅的女声。其声线华丽且富有质感，说话节奏自信坚定、字正腔圆。整体风格高贵冷艳且充满御姐气场，能够准确传达出掌控一切的自信与从容。这种音色非常适合用于奇幻游戏中的女性领袖角色配音、史诗类有声书旁白或高端商业广告，完美契合那些气质高雅且行事果断的女性形象。",
    "trait": "华丽富有质感,自信坚定,高贵冷艳",
    "scene": "游戏与RPG、广告与预告、播客与社媒、企业宣传与旁白",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Portuguese_AssertiveQueen-54fb2a63ee-v6-54ba026fbca0a37d8fc6.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Portuguese_AssertiveQueen-85b32c21ef.mp3",
    "accent": "标准葡萄牙语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Portuguese_WhimsicalGirl",
    "providerVoiceId": "Portuguese_WhimsicalGirl",
    "name": "Bianca Fernandes",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "葡萄牙语",
    "languages": [
      "葡萄牙文"
    ],
    "description": "这是一个充满戏剧张力的年轻女声。其音色清脆明亮且极具辨识度，能够准确传达出兴奋、调皮乃至略带神经质的情绪。说话节奏灵动多变，时而像在吟唱童谣，时而像在深情独白，语调夸张且富有画面感。整体风格古灵精怪，自带一种浓厚的奇幻色彩，非常适合用于卡通动画中的精灵角色、奇幻题材的游戏配音或儿童有声书的精彩演绎。",
    "trait": "清脆明亮,灵动多变,奇幻色彩",
    "scene": "游戏与RPG、广播剧、动漫与动画",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Portuguese_WhimsicalGirl-a4a0cf1873-v6-d62bd9a27df0e2527828.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Portuguese_WhimsicalGirl-493a5d7590.mp3",
    "accent": "标准葡萄牙语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Portuguese_StressedLady",
    "providerVoiceId": "Portuguese_StressedLady",
    "name": "Helena Moura",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "葡萄牙语",
    "languages": [
      "葡萄牙文"
    ],
    "description": "这是一个极具戏剧张力的青年女声。其声线颤抖且略带气声，说话节奏急促不安、充满力竭感。整体风格绝望且焦虑，生动传达出深陷困境时的无助情绪，非常适合用于末世生存游戏、悬疑广播剧或有声书中的受难者角色演绎。",
    "trait": "颤抖且略带气声,急促不安,绝望且焦虑",
    "scene": "游戏与RPG、广播剧、有声书与小说、纪录片、播客与社媒",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Portuguese_StressedLady-2c4b67eec9-v6-29f84876baabae332e94.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Portuguese_StressedLady-9f8ffa74e1.mp3",
    "accent": "标准葡萄牙语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Portuguese_FriendlyNeighbor",
    "providerVoiceId": "Portuguese_FriendlyNeighbor",
    "name": "Júlia Caldeira",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "葡萄牙语",
    "languages": [
      "葡萄牙文"
    ],
    "description": "该音色以清脆明亮的音质和语速干脆的节奏为特征，极具辨识度。它能准确传达机智、自信且略带热心的情绪，听感上充满活力与专业感。这种声音是二次元游戏和动漫类项目的理想选择，特别是针对那些聪明伶俐、能言善辩的律政少女或咨询顾问角色的演绎。",
    "trait": "清脆明亮,语速干脆,充满活力",
    "scene": "动漫与动画、在线教育、播客与社媒、企业宣传与旁白",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Portuguese_FriendlyNeighbor-0e4518c77d-v6-dc80575e7321cc7d36d2.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Portuguese_FriendlyNeighbor-203325dafc.mp3",
    "accent": "标准葡萄牙语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Portuguese_CaringGirlfriend",
    "providerVoiceId": "Portuguese_CaringGirlfriend",
    "name": "Madalena Fernandes",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "葡萄牙语",
    "languages": [
      "葡萄牙文"
    ],
    "description": "这是一个充满温情的年轻女声。其声线甜美细腻，带有一口独特的苏格兰口音，说话节奏轻快且富有韵律感。整体风格亲切温柔，仿佛邻家女孩在耳边低语，非常适合用于睡前故事、情感电台或有声书朗读，能够完美契合贴心伴侣或治愈系角色的设定。",
    "trait": "甜美细腻,富有韵律感,亲切温柔",
    "scene": "有声书与小说、角色配音、播客与社媒",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Portuguese_CaringGirlfriend-41c7a40900-v6-7ca3794a6fb081c7fb9f.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Portuguese_CaringGirlfriend-0dbceaafc0.mp3",
    "accent": "标准葡萄牙语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Portuguese_PowerfulSoldier",
    "providerVoiceId": "Portuguese_PowerfulSoldier",
    "name": "Vasco Neves",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "葡萄牙语",
    "languages": [
      "葡萄牙文"
    ],
    "description": "这是一个充满力量感的青年男声。其声线沙哑且极具爆发力，说话节奏紧凑有力、干脆利落。整体风格热血激昂，带有一种久经沙场的坚毅感，非常适合用于动作游戏角色、热血动漫配音或军事题材的预告片旁白。",
    "trait": "沙哑爆发,紧凑有力,热血激昂",
    "scene": "游戏与RPG、动漫与动画、广告与预告",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Portuguese_PowerfulSoldier-33f4d7e751-v6-748bc07470a4516df80b.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Portuguese_PowerfulSoldier-5b7347e685.mp3",
    "accent": "标准葡萄牙语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Portuguese_FascinatingBoy",
    "providerVoiceId": "Portuguese_FascinatingBoy",
    "name": "Gil Faria",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "葡萄牙语",
    "languages": [
      "葡萄牙文"
    ],
    "description": "这是一个充满活力的男声。其声线明亮且带有浓郁的牙买加风情，说话节奏跳跃轻快、极富律动感，带有一种独特的歌唱性。整体风格热情洋溢且自在随性，能准确传达乐观开朗的情绪，非常适合用于卡通动画角色、旅游宣传短片或具有异域特色的广告配音，特别是针对街头潮流青年角色的演绎。",
    "trait": "明亮,跳跃轻快,热情洋溢",
    "scene": "广播剧、动漫与动画、角色配音、广告与预告、企业宣传与旁白",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Portuguese_FascinatingBoy-d8cff1ce64-v6-21e7446df83f9b1e8f9a.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Portuguese_FascinatingBoy-87170fdd88.mp3",
    "accent": "标准葡萄牙语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Portuguese_RomanticHusband",
    "providerVoiceId": "Portuguese_RomanticHusband",
    "name": "Lourenço Matos",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "葡萄牙语",
    "languages": [
      "葡萄牙文"
    ],
    "description": "这是一个充满质感的青年男声。其声线自然真实且略带沙哑，说话节奏抑扬顿挫，带有明显的口语化特征。整体风格愤世嫉俗且具有挑衅性，能够准确传达质疑与不满的情绪。这种音色非常适合用于广播剧、现代题材的有声小说或影视角色配音，特别是针对性格叛逆或情绪激动的男性角色的演绎。",
    "trait": "略带沙哑,抑扬顿挫,愤世嫉俗",
    "scene": "游戏与RPG、广播剧、有声书与小说、纪录片",
    "age": "中年",
    "ageCategory": "中年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Portuguese_RomanticHusband-f6c62c4694-v6-ab422775d285fbbab16a.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Portuguese_RomanticHusband-49bd943fa8.mp3",
    "accent": "标准葡萄牙语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Portuguese_StrictBoss",
    "providerVoiceId": "Portuguese_StrictBoss",
    "name": "Celina Pinheiro",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "葡萄牙语",
    "languages": [
      "葡萄牙文"
    ],
    "description": "该音色以清晰高亢的音质和果断干脆的节奏为特征，极具辨识度。它能准确传达紧张、专注且指令性极强的情绪，是赛车游戏和语音导航类项目的理想选择，特别是针对拉力赛领航员角色的演绎。",
    "trait": "清晰高亢,果断干脆,紧张专注",
    "scene": "游戏与RPG、在线教育、企业宣传与旁白",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Portuguese_StrictBoss-c71c4254dc-v6-11128498cff9ba305cf0.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Portuguese_StrictBoss-927916a614.mp3",
    "accent": "标准葡萄牙语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Portuguese_InspiringLady",
    "providerVoiceId": "Portuguese_InspiringLady",
    "name": "Margarida Queiroz",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "葡萄牙语",
    "languages": [
      "葡萄牙文"
    ],
    "description": "该音色以清脆甜美的音质和充满活力的节奏为特征，极具辨识度。它能准确传达热情洋溢、乐于助人的情绪，是二次元游戏和奇幻冒险类项目的理想选择，特别是针对新手引导员或元气精灵角色的演绎。",
    "trait": "清脆甜美,充满活力,热情洋溢",
    "scene": "游戏与RPG、在线教育、播客与社媒",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Portuguese_InspiringLady-44ff033bf5-v6-4292b4cc42c4bb34c31c.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Portuguese_InspiringLady-30609da2bf.mp3",
    "accent": "标准葡萄牙语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Portuguese_PlayfulSpirit",
    "providerVoiceId": "Portuguese_PlayfulSpirit",
    "name": "Vera Barros",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "葡萄牙语",
    "languages": [
      "葡萄牙文"
    ],
    "description": "这是一个充满活力的年轻女声。其声线高亢明亮且极具穿透力，说话节奏急促、跳跃，带有一种强烈的戏剧感。整体风格俏皮叛逆且富有张力，能够生动传达青春期的躁动与心理活动，非常适合用于青春校园剧、动画片中的捣蛋鬼角色或青少年题材的有声小说演绎。",
    "trait": "高亢明亮,节奏急促,俏皮叛逆",
    "scene": "游戏与RPG、广播剧、有声书与小说、动漫与动画",
    "age": "儿童",
    "ageCategory": "儿童",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Portuguese_PlayfulSpirit-ce8db28687-v6-19dbfc66900257a92ca8.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Portuguese_PlayfulSpirit-0383fe24ef.mp3",
    "accent": "标准葡萄牙语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Portuguese_ElegantGirl",
    "providerVoiceId": "Portuguese_ElegantGirl",
    "name": "Sofia Leitão",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "葡萄牙语",
    "languages": [
      "葡萄牙文"
    ],
    "description": "这是一个极具表现力的年轻女声。其声线清脆尖细，说话节奏急促且语势连贯，带有一口流利的印度式英语口音。整体风格情绪饱满且富有戏剧张力，给人一种正在激烈争论或焦急诉说的画面感，非常适合用于具有异域背景的有声小说、广播剧中的性格鲜明角色或英语教学中的情景模拟。",
    "trait": "声线清脆尖细,节奏急促,富有戏剧张力",
    "scene": "有声书与小说、动漫与动画、角色配音",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Portuguese_ElegantGirl-666b3c63cb-v6-50cd52d2607efa4e8333.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Portuguese_ElegantGirl-417d9bb462.mp3",
    "accent": "标准葡萄牙语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Portuguese_CompellingGirl",
    "providerVoiceId": "Portuguese_CompellingGirl",
    "name": "Catarina Mendonça",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "葡萄牙语",
    "languages": [
      "葡萄牙文"
    ],
    "description": "这是一个干练笃定的青年女声。其声线清晰坚实且带有一口明显的爱尔兰口音，说话节奏紧凑、指令感强。整体风格忠诚且充满行动力，能够准确传达出任务执行者的冷静与决心，非常适合用于策略游戏单位、战术竞技类游戏角色或特工题材的广播剧，特别是针对战场联络员或特工角色的演绎。",
    "trait": "清晰坚实,节奏紧凑,指令感强",
    "scene": "游戏与RPG、广播剧、角色配音、企业宣传与旁白",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Portuguese_CompellingGirl-4d7341272e-v6-6b139f99a88470dfde69.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Portuguese_CompellingGirl-a397c74a0b.mp3",
    "accent": "标准葡萄牙语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Portuguese_PowerfulVeteran",
    "providerVoiceId": "Portuguese_PowerfulVeteran",
    "name": "Rui Campos",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "葡萄牙语",
    "languages": [
      "葡萄牙文"
    ],
    "description": "这是一个极具压迫感的中年男声。其声线粗砺深沉且带有明显的颗粒感，说话节奏缓慢坚定、不容置疑。整体风格冷酷且独断专行，自带一种强烈的上位者气息，非常适合用于游戏反派BOSS、军事指挥官或史诗战争题材中的铁血领袖角色演绎。",
    "trait": "粗砺深沉,缓慢坚定,上位者气息",
    "scene": "游戏与RPG、动漫与动画、广告与预告",
    "age": "中年",
    "ageCategory": "中年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Portuguese_PowerfulVeteran-e7e4db3c64-v6-3bb2815633471351d274.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Portuguese_PowerfulVeteran-d1f1cff1cf.mp3",
    "accent": "标准葡萄牙语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Portuguese_SensibleManager",
    "providerVoiceId": "Portuguese_SensibleManager",
    "name": "Salvador Fernandes",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "葡萄牙语",
    "languages": [
      "葡萄牙文"
    ],
    "description": "这是一个极具表现力的中年男声。其声线厚重且略带沙哑，说话节奏抑扬顿挫、充满情感起伏。整体风格戏剧化且富有张力，给人一种忧心忡忡、苦口婆心的感觉，非常适合用于奇幻游戏NPC、广播剧对话或有声书演绎，能够完美契合背负重任的劝导者设定。",
    "trait": "厚重且略带沙哑,充满情感起伏,忧心忡忡",
    "scene": "游戏与RPG、广播剧、角色配音",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Portuguese_SensibleManager-bb8cd5f506-v6-91bd45e4f691a9789fb6.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Portuguese_SensibleManager-d96a8a7c86.mp3",
    "accent": "标准葡萄牙语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Portuguese_ThoughtfulLady",
    "providerVoiceId": "Portuguese_ThoughtfulLady",
    "name": "Sara Cunha",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "葡萄牙语",
    "languages": [
      "葡萄牙文"
    ],
    "description": "这是一个成熟温婉的中年女声，带有极其地道且自然的新西兰英语口音。其声线柔和亲切，说话节奏舒缓且极具生活气息，听感上如同正在进行真实的日常对话，毫无机器合成的生硬感。整体风格充满关切与耐心，语调中透着一丝思考时的迟疑感，极大地增强了沉浸度，非常适合用于客户服务模拟、情景剧角色扮演或展示真实用户反馈的场景，完美契合寻求帮助的客户或关爱孩子的母亲形象。",
    "trait": "柔和亲切,极具生活气息,充满关切",
    "scene": "游戏与RPG、广播剧、在线教育、企业宣传与旁白",
    "age": "中年",
    "ageCategory": "中年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Portuguese_ThoughtfulLady-996e5ab9d9-v6-e15e50bc1af9eaecee86.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Portuguese_ThoughtfulLady-e789554cb7.mp3",
    "accent": "标准葡萄牙语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Portuguese_TheatricalActor",
    "providerVoiceId": "Portuguese_TheatricalActor",
    "name": "Henrique Caldeira",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "葡萄牙语",
    "languages": [
      "葡萄牙文"
    ],
    "description": "这是一个充满张力的中年男声。其声线浑厚粗犷且带有明显的颗粒感，说话节奏戏剧腔调浓郁、抑扬顿挫。整体风格傲慢且充满威胁，自带一种强烈的压迫感，非常适合用于游戏与RPG中的终极BOSS、史诗电影中的邪恶反派或广播剧中的黑暗势力首领等场景。",
    "trait": "浑厚粗犷,戏剧腔调浓郁,傲慢且充满威胁",
    "scene": "游戏与RPG、动漫与动画、广告与预告",
    "age": "中年",
    "ageCategory": "中年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Portuguese_TheatricalActor-2528e743e5-v6-2df45bb6dd3f5b2abb78.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Portuguese_TheatricalActor-b6126a0338.mp3",
    "accent": "标准葡萄牙语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Portuguese_FragileBoy",
    "providerVoiceId": "Portuguese_FragileBoy",
    "name": "Luís Tavares",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "葡萄牙语",
    "languages": [
      "葡萄牙文"
    ],
    "description": "这是一个年轻的男声。其声线单薄且带有明显的颤抖气声，说话节奏迟疑、充满焦虑。整体风格脆弱且充满戏剧张力，能够准确传达出人物内心的恐慌与自我鼓励，非常适合用于广播剧中的落难王子、动画中的少年角色或带有悬疑色彩的游戏独白场景。",
    "trait": "带有颤抖气声,节奏迟疑,脆弱",
    "scene": "游戏与RPG、广播剧、有声书与小说、动漫与动画",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Portuguese_FragileBoy-6aee91daca-v6-edee2c7d2bd4ef483d57.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Portuguese_FragileBoy-ac7d68bb81.mp3",
    "accent": "标准葡萄牙语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Portuguese_ChattyGirl",
    "providerVoiceId": "Portuguese_ChattyGirl",
    "name": "Beatriz Valença",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "葡萄牙语",
    "languages": [
      "葡萄牙文"
    ],
    "description": "该音色以甜美明亮的音质和轻快活泼的节奏为特征，极具辨识度。它能准确传达热情、俏皮的情绪，充满了一种邻家女孩般的亲切感。这种声音是休闲游戏和社交应用类项目的理想选择，特别是针对元气少女角色的演绎。",
    "trait": "甜美明亮,轻快活泼,邻家亲切感",
    "scene": "游戏与RPG、播客与社媒、企业宣传与旁白",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Portuguese_ChattyGirl-f3ba6d769d-v6-446da4c6c49fc713e235.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Portuguese_ChattyGirl-a554d2966b.mp3",
    "accent": "标准葡萄牙语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Portuguese_Conscientiousinstructor",
    "providerVoiceId": "Portuguese_Conscientiousinstructor",
    "name": "Carolina Pinheiro",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "葡萄牙语",
    "languages": [
      "葡萄牙文"
    ],
    "description": "这是一个充满活力的青年女声。其声线清脆明亮，说话节奏轻快流畅，字里行间透露着愉悦与分享的欲望。整体风格热情亲切，如同邻家朋友般娓娓道来，极具画面感和感染力，非常适合用于旅游Vlog旁白、生活方式类播客或轻松的在线教育视频，能够完美演绎热情分享者或向导的角色。",
    "trait": "清脆明亮,轻快流畅,热情亲切",
    "scene": "纪录片、广告与预告、在线教育、企业宣传与旁白",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Portuguese_Conscientiousinstructor-4b837f5053-v6-b87a6a05155c66687f43.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Portuguese_Conscientiousinstructor-fe8f72b23e.mp3",
    "accent": "标准葡萄牙语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Portuguese_RationalMan",
    "providerVoiceId": "Portuguese_RationalMan",
    "name": "António Valença",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "葡萄牙语",
    "languages": [
      "葡萄牙文"
    ],
    "description": "这是一个成熟稳重且极具辨识度的中年男声。其声线低沉浑厚，略带粗犷的沙哑质感，说话节奏缓慢从容、语调平直且一字一顿。整体风格展现出一种极致的理性和冷峻的幽默感，透着一种不容置疑的权威气质，非常适合用于讽刺类喜剧角色、硬汉风格的广告旁白或需要体现务实精神的独白场景。",
    "trait": "低沉浑厚,缓慢从容,权威气质",
    "scene": "角色配音、广告与预告、播客与社媒、企业宣传与旁白",
    "age": "中年",
    "ageCategory": "中年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Portuguese_RationalMan-1b582e9fde-v6-e172a593fc013448b337.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Portuguese_RationalMan-c630d777b3.mp3",
    "accent": "标准葡萄牙语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Portuguese_WiseScholar",
    "providerVoiceId": "Portuguese_WiseScholar",
    "name": "Bento Fernandes",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "葡萄牙语",
    "languages": [
      "葡萄牙文"
    ],
    "description": "这是一个充满活力的青年男声。其声线清亮明快，略带独特的鼻音共鸣，说话节奏干脆利落、口语感极强。整体风格亲切随和，带有一种浓厚的英式生活气息和邻家亲切感，极具辨识度，非常适合用于有声书中的平民角色演绎、个人回忆录旁白或历史题材的口述实录场景。",
    "trait": "清亮明快,干脆利落,邻家亲切感",
    "scene": "有声书与小说、纪录片、在线教育",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Portuguese_WiseScholar-33f96c948f-v6-86bc4f8158023175554b.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Portuguese_WiseScholar-0a325ac948.mp3",
    "accent": "标准葡萄牙语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Portuguese_FrankLady",
    "providerVoiceId": "Portuguese_FrankLady",
    "name": "Filipa Faria",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "葡萄牙语",
    "languages": [
      "葡萄牙文"
    ],
    "description": "这是一个极具表现力的中年女声。其声线略带沙哑且情感充沛，有着浓郁的苏格兰口音，极具辨识度。说话节奏急促焦虑，准确传达出抱怨、无奈以及最后转悲为喜的情绪波动。这种充满生活气息的音色非常适合用于广播剧中的市民角色、情景喜剧或需要演绎焦虑母亲形象的有声读物项目。",
    "trait": "略带沙哑,节奏急促,充满生活气息",
    "scene": "广播剧、动漫与动画、广告与预告、在线教育、企业宣传与旁白",
    "age": "中年",
    "ageCategory": "中年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Portuguese_FrankLady-984a710c5b-v6-65879623055a6ff76399.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Portuguese_FrankLady-1fef1f5d6a.mp3",
    "accent": "标准葡萄牙语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Portuguese_DeterminedManager",
    "providerVoiceId": "Portuguese_DeterminedManager",
    "name": "Patrícia Figueira",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "葡萄牙语",
    "languages": [
      "葡萄牙文"
    ],
    "description": "这是一个气场强大的中年女声。其声线尖锐且充满张力，带有明显的英式苏格兰口音。说话节奏急促、语气强硬，透着不容置疑的坚定感。整体风格严肃且具有对抗性，完美演绎了职场争执或法庭辩论的紧张氛围，非常适合用于广播剧中的强势高管或律政剧中的女强人角色。",
    "trait": "尖锐且充满张力,节奏急促,严肃且具有对抗性",
    "scene": "广播剧、动漫与动画、角色配音",
    "age": "中年",
    "ageCategory": "中年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Portuguese_DeterminedManager-5afc428c21-v6-08e7052236a72b1e1b71.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Portuguese_DeterminedManager-9b3db2dda8.mp3",
    "accent": "标准葡萄牙语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-French_Male_Speech_New",
    "providerVoiceId": "French_Male_Speech_New",
    "name": "Mathis Delorme",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "法语",
    "languages": [
      "法文"
    ],
    "description": "这是一个专业且富有亲和力的男声。其声线清晰明朗，语调中透露出一种自信与从容，说话节奏条理分明、娓娓道来。整体风格既有专家的权威感，又不失邻家般的亲切，非常适合用于在线教育内容、健康生活指南或科普类视频旁白等场景。",
    "trait": "清晰明朗,娓娓道来,专家权威感",
    "scene": "在线教育、播客与社媒",
    "age": "中年",
    "ageCategory": "中年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-French_Male_Speech_New-c60e6764c2-v6-c7c9596a66bb2c8bdc72.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/French_Male_Speech_New-d4b15f35a4.mp3",
    "accent": "标准法语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-French_Female_News Anchor",
    "providerVoiceId": "French_Female_News Anchor",
    "name": "Élise Marceau",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "法语",
    "languages": [
      "法文"
    ],
    "description": "这是一个成熟干练的女声。其声线知性清晰且富有质感，说话节奏流畅自然、字正腔圆。整体风格专业客观且极具素养，非常适合用于新闻访谈、深度报道或高端财经节目等场景。",
    "trait": "知性清晰,流畅自然,专业客观",
    "scene": "广播剧、纪录片、播客与社媒、企业宣传与旁白",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-French_Female_News-Anchor-748efd33c3-v6-abcae35ee811066e3774.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/French_Female_News-Anchor-c105a75108.mp3",
    "accent": "标准法语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-French_CasualMan",
    "providerVoiceId": "French_CasualMan",
    "name": "Théo Valette",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "法语",
    "languages": [
      "法文"
    ],
    "description": "这是一个知性自然的男声。其声线温润且富有质感，说话节奏流畅从容、娓娓道来。整体风格理性且具有思辨性，听起来像是一位正在进行深度思考的观察者，非常适合用于深度播客访谈、社会现象分析视频或知识科普类内容。",
    "trait": "温润且富有质感,娓娓道来,具有思辨性",
    "scene": "纪录片、播客与社媒",
    "age": "中年",
    "ageCategory": "中年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-French_CasualMan-dc2029ec03-v6-32def4fff996661f64f6.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/French_CasualMan-e8a104314a.mp3",
    "accent": "标准法语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-French_MovieLeadFemale",
    "providerVoiceId": "French_MovieLeadFemale",
    "name": "Camille Roux",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "法语",
    "languages": [
      "法文"
    ],
    "description": "这是一个极具张力的年轻女性音色。其声线清脆明亮且略带颤抖，说话节奏急促多变、呼吸感强烈。整体风格情绪饱满且令人动容，非常适合用于影视角色配音、情感广播剧或有声小说独白等场景，能够完美契合深情且偏执的少女设定。",
    "trait": "清脆明亮,急促多变,情绪饱满",
    "scene": "广播剧、动漫与动画、角色配音、播客与社媒、企业宣传与旁白",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-French_MovieLeadFemale-76f45cec9e-v6-d138f2b79e45f2928315.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/French_MovieLeadFemale-2a19326df0.mp3",
    "accent": "标准法语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-French_FemaleAnchor",
    "providerVoiceId": "French_FemaleAnchor",
    "name": "Anaïs Beaumont",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "法语",
    "languages": [
      "法文"
    ],
    "description": "这是一个知性自然的年轻女声。其声线略带沙哑且富有质感，说话节奏娓娓道来、舒缓流畅。整体风格感性且极具文艺感，非常适合用于人文纪录片、情感播客或有声书讲述等场景。",
    "trait": "略带沙哑,娓娓道来,极具文艺感",
    "scene": "广播剧、有声书与小说、纪录片、在线教育、播客与社媒",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-French_FemaleAnchor-7d0b307829-v6-ef607744a700fb8f64f2.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/French_FemaleAnchor-6deccd20c7.mp3",
    "accent": "标准法语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-French_MaleNarrator",
    "providerVoiceId": "French_MaleNarrator",
    "name": "Julien Morel",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "法语",
    "languages": [
      "法文"
    ],
    "description": "这是一个年轻斯文的男声。其声线清澈干净且富有少年感，说话节奏舒缓流畅、娓娓道来。整体风格亲切自然，既能驾驭知性的叙述，也能演绎轻松的生活独白，非常适合用于语言教学音频、校园广播剧或有声读物中的男青年角色。",
    "trait": "清澈干净,娓娓道来,亲切自然",
    "scene": "角色配音、在线教育",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-French_MaleNarrator-3ec4834fe0-v6-45501390229b63bcc31c.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/French_MaleNarrator-b3f5e2ccee.mp3",
    "accent": "标准法语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Indonesian_SweetGirl",
    "providerVoiceId": "Indonesian_SweetGirl",
    "name": "Putri Wulandari",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "印尼语",
    "languages": [
      "印尼文"
    ],
    "description": "这是一把甜美娇俏的青年女声。其声线高亢明亮且略带做作的拖音，说话节奏戏剧化且起伏明显，充满表现力。整体风格极具辨识度，能准确传达出自恋、傲娇以及略带轻浮的情绪，是卡通动画和游戏角色配音类项目的理想选择，特别是针对自信名媛或心机美少女角色的演绎。",
    "trait": "高亢明亮,戏剧化,自恋傲娇",
    "scene": "广播剧、动漫与动画、角色配音、播客与社媒",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Indonesian_SweetGirl-51f0d0b14e-v6-517f47141a3bc88e5a6e.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Indonesian_SweetGirl-fc6c196df1.mp3",
    "accent": "标准印尼语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Indonesian_ReservedYoungMan",
    "providerVoiceId": "Indonesian_ReservedYoungMan",
    "name": "Raka Santoso",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "印尼语",
    "languages": [
      "印尼文"
    ],
    "description": "这是一个年轻温润的男声。其声线干净清澈且略带气声，说话节奏舒缓温柔、娓娓道来。整体风格内敛深情，既能传达出一种少年感的纯真，又带有几分书卷气的沉稳。非常适合用于二次元动漫配音、广播剧独白或情感类有声书等场景，能够完美演绎温柔学长或内向少年的角色设定。",
    "trait": "干净清澈,娓娓道来,内敛深情",
    "scene": "游戏与RPG、广播剧、有声书与小说、动漫与动画、角色配音、播客与社媒、企业宣传与旁白",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Indonesian_ReservedYoungMan-f41d342974-v6-ba510c30dfe3145c26db.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Indonesian_ReservedYoungMan-3910f6f0b7.mp3",
    "accent": "标准印尼语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Indonesian_CharmingGirl",
    "providerVoiceId": "Indonesian_CharmingGirl",
    "name": "Alya Maharani",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "印尼语",
    "languages": [
      "印尼文"
    ],
    "description": "这是一个充满活力的青年女声。其声线甜美细腻，尾音略带气声，说话节奏自然随性，带有真实的思考停顿和语气词。整体风格亲切邻家且极具少女感，完美传达出一种真诚且略带羞涩的情绪，非常适合用于人物访谈、时尚Vlog旁白或青春偶像剧中的甜美女生角色。",
    "trait": "甜美细腻,自然随性,亲切邻家",
    "scene": "有声书与小说、广告与预告、播客与社媒、企业宣传与旁白",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Indonesian_CharmingGirl-96d2084509-v6-5d32165fde624bd59894.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Indonesian_CharmingGirl-17082ae6d7.mp3",
    "accent": "标准印尼语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Indonesian_CalmWoman",
    "providerVoiceId": "Indonesian_CalmWoman",
    "name": "Dina Kusumawati",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "印尼语",
    "languages": [
      "印尼文"
    ],
    "description": "这是一个极具表现力的青年女声。其音色清脆明亮且质感精致，吐字极度清晰，展现出扎实的语言功底。说话节奏流畅自然，能够根据内容在严肃陈述与生动演绎之间灵活切换。整体风格既具备新闻播报的专业感，又拥有有声剧角色的戏剧张力，非常适合用于有声书朗读、影视角色配音或广播剧演绎等场景。",
    "trait": "清脆明亮,流畅自然,戏剧张力",
    "scene": "游戏与RPG、广播剧、动漫与动画",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Indonesian_CalmWoman-fcac6b2553-v6-d0a176a08b781714f834.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Indonesian_CalmWoman-91bebed008.mp3",
    "accent": "标准印尼语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Indonesian_ConfidentWoman",
    "providerVoiceId": "Indonesian_ConfidentWoman",
    "name": "Rani Suryani",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "印尼语",
    "languages": [
      "印尼文"
    ],
    "description": "这是一个充满自信与知性魅力的青年女声。其音色明亮圆润，咬字清晰有力，说话节奏从容坚定，透露出一种极强的掌控力与职业素养。整体风格干练大方，既有新闻播报的权威感，又能驾驭充满戏剧张力的独白，非常适合用于商业广告、高端企业宣传片或具有独立性格的女性角色配音。",
    "trait": "明亮圆润,从容坚定,干练大方",
    "scene": "游戏与RPG、广播剧、广告与预告",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Indonesian_ConfidentWoman-3d1083a02f-v6-36f205ff68af659373a7.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Indonesian_ConfidentWoman-ebefe6469b.mp3",
    "accent": "标准印尼语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Indonesian_CaringMan",
    "providerVoiceId": "Indonesian_CaringMan",
    "name": "Arif Pratama",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "印尼语",
    "languages": [
      "印尼文"
    ],
    "description": "这是一个极具叙事感的成熟男声。其声线低沉且富有磁性，说话节奏抑扬顿挫、情感饱满。整体风格稳重而深情，能够营造出如同电影独白般的沉浸氛围，非常适合用于有声小说演播、人文纪录片解说或情感类宣传片等场景。",
    "trait": "富有磁性,抑扬顿挫,电影独白般",
    "scene": "有声书与小说、角色配音、纪录片",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Indonesian_CaringMan-229d01f4d1-v6-e541701a146588b0a104.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Indonesian_CaringMan-e4af92142b.mp3",
    "accent": "标准印尼语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Indonesian_BossyLeader",
    "providerVoiceId": "Indonesian_BossyLeader",
    "name": "Bima Wicaksono",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "印尼语",
    "languages": [
      "印尼文"
    ],
    "description": "这是一个充满威严的中年男声。其声线低沉粗犷，略带沙哑的颗粒感极具辨识度，说话语气强硬笃定，节奏紧凑且富有爆发力。整体风格霸气冷酷，透着一种不容置疑的压迫感，自带一种身经百战的战场指挥感，非常适合用于动作游戏中的反派首领配音、军事题材的宣传片或激昂的战前动员场景。",
    "trait": "低沉粗犷,语气强硬,战场指挥感",
    "scene": "游戏与RPG、广播剧、角色配音",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Indonesian_BossyLeader-261e9b2cc3-v6-651ca43fcb585fdadbe2.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Indonesian_BossyLeader-ba2c90cb3c.mp3",
    "accent": "标准印尼语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Indonesian_DeterminedBoy",
    "providerVoiceId": "Indonesian_DeterminedBoy",
    "name": "Dimas Saputra",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "印尼语",
    "languages": [
      "印尼文"
    ],
    "description": "该音色以清亮有力的音质和坚定果敢的节奏为特征，极具辨识度。它能准确传达热血、无畏的情绪，是热血动漫和角色扮演游戏类项目的理想选择，特别是针对正义少年角色的演绎。",
    "trait": "清亮有力,坚定果敢,热血",
    "scene": "游戏与RPG、广播剧、有声书与小说、动漫与动画、角色配音",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Indonesian_DeterminedBoy-51783069ff-v6-bffe93dae62124334b44.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Indonesian_DeterminedBoy-25e0297a24.mp3",
    "accent": "标准印尼语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Indonesian_GentleGirl",
    "providerVoiceId": "Indonesian_GentleGirl",
    "name": "Sari Anggraini",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "印尼语",
    "languages": [
      "印尼文"
    ],
    "description": "该音色以软糯轻柔的音质和舒缓慵懒的节奏为特征，极具辨识度。它能准确传达无辜、呆萌的情绪，是二次元游戏和动漫配音类项目的理想选择，特别是针对迷糊少女角色的演绎。",
    "trait": "软糯轻柔,舒缓慵懒,呆萌",
    "scene": "游戏与RPG、有声书与小说、动漫与动画、角色配音",
    "age": "儿童",
    "ageCategory": "儿童",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Indonesian_GentleGirl-3ab6175362-v6-da59adeb5207602f7a11.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Indonesian_GentleGirl-3fe96ac9b4.mp3",
    "accent": "标准印尼语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-German_FriendlyMan",
    "providerVoiceId": "German_FriendlyMan",
    "name": "Felix Hartmann",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "德语",
    "languages": [
      "德文"
    ],
    "description": "这是一个年轻亲切的男声。其声线轻松自然且略带邻家感，说话节奏平稳流畅、如话家常。整体风格随和且富有亲和力，非常适合用于有声书朗读、播客节目或社交媒体视频等场景。",
    "trait": "轻松自然,如话家常,邻家感",
    "scene": "有声书与小说、播客与社媒、企业宣传与旁白",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-German_FriendlyMan-55a9212785-v6-7cd1afa713832f647159.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/German_FriendlyMan-205c6aab24.mp3",
    "accent": "标准德语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-German_SweetLady",
    "providerVoiceId": "German_SweetLady",
    "name": "Mira Falkenberg",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "德语",
    "languages": [
      "德文"
    ],
    "description": "专为情感类内容设计的年轻少女音色。声音轻柔细腻且略带气声，语调舒缓流畅，给人一种忧郁、深情且充满希冀的感觉。推荐用于伤感小说朗读、动漫角色独白或深夜电台节目，能够完美契合深情守望者的设定。",
    "trait": "轻柔细腻,舒缓流畅,忧郁深情",
    "scene": "游戏与RPG、广播剧、有声书与小说、动漫与动画、角色配音、播客与社媒",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-German_SweetLady-50c51a5ca4-v6-26b1ae49760c7f091b2c.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/German_SweetLady-42ebc3285a.mp3",
    "accent": "标准德语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-German_PlayfulMan",
    "providerVoiceId": "German_PlayfulMan",
    "name": "Jonas Albrecht",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "德语",
    "languages": [
      "德文"
    ],
    "description": "这是一个充满青春活力的年轻男声。其声线自然清亮且带有一丝少年的青涩感，说话节奏轻快流畅、语速较快，如同朋友间的亲密交谈。整体风格直率且极具表现力，能够准确传达出或是调皮或是坚定的情绪，非常适合用于青少年有声小说、校园题材的广播剧或社交媒体故事分享，完美契合直率少年的角色设定。",
    "trait": "自然清亮,轻快流畅,亲密交谈",
    "scene": "广播剧、有声书与小说、动漫与动画、播客与社媒",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-German_PlayfulMan-168f43e494-v6-1b1c576a694b50f8cb41.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/German_PlayfulMan-c25cde6d4f.mp3",
    "accent": "标准德语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Russian_HandsomeChildhoodFriend",
    "providerVoiceId": "Russian_HandsomeChildhoodFriend",
    "name": "Лада Белова",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "俄语",
    "languages": [
      "俄文"
    ],
    "description": "专为互动情感类内容设计的青年男性音色。其声音低沉沙哑且略带气声，语调慵懒随意、自然松弛，给人一种极其亲昵、仿佛就在耳边低语的感觉。这种极具生活感的声线非常适合用于广播剧、女性向游戏或ASMR情景模拟，能够完美契合贴心男友或青梅竹马的设定。",
    "trait": "低沉沙哑,慵懒随意,耳边低语感",
    "scene": "游戏与RPG、广播剧、有声书与小说、动漫与动画、角色配音",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Russian_HandsomeChildhoodFriend-ad8ac0c446-v6-456240878f3c8fc21d88.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Russian_HandsomeChildhoodFriend-ffa3a32106.mp3",
    "accent": "标准俄语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Russian_BrightHeroine",
    "providerVoiceId": "Russian_BrightHeroine",
    "name": "Вера Орлова",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "俄语",
    "languages": [
      "俄文"
    ],
    "description": "该音色以略带沙哑的音质和干脆利落的节奏为特征，极具辨识度。它能准确传达不羁、野性的情绪，是动作游戏和战斗番剧类项目的理想选择，特别是针对飒爽女战士角色的演绎。",
    "trait": "略带沙哑,干脆利落,不羁野性",
    "scene": "游戏与RPG、动漫与动画、角色配音",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Russian_BrightHeroine-26667c8466-v6-512157f76949925906bb.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Russian_BrightHeroine-95b00764cd.mp3",
    "accent": "标准俄语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Russian_AmbitiousWoman",
    "providerVoiceId": "Russian_AmbitiousWoman",
    "name": "Кира Зорина",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "俄语",
    "languages": [
      "俄文"
    ],
    "description": "该音色以略带沙哑的磁性声线和干练直爽的节奏为特征，极具辨识度。它能准确传达自信、随性且略带慵懒的情绪，是二次元游戏和动漫配音类项目的理想选择，特别是针对酷飒御姐或性格直率的战斗少女角色的演绎。",
    "trait": "略带沙哑,干练直爽,酷飒御姐感",
    "scene": "游戏与RPG、角色配音",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Russian_AmbitiousWoman-f7388fcf1d-v6-560fbee79969bc1dd1da.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Russian_AmbitiousWoman-95d27e0b24.mp3",
    "accent": "标准俄语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Russian_ReliableMan",
    "providerVoiceId": "Russian_ReliableMan",
    "name": "Матвей Громов",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "俄语",
    "languages": [
      "俄文"
    ],
    "description": "这是一个成熟稳重的男声。其声线低沉沙哑且富有质感，说话节奏沉稳有力、不怒自威。整体风格历尽沧桑且坚毅可靠，给人一种深沉的压迫感与安全感，非常适合用于硬汉角色配音、战争题材独白或史诗感强烈的剧情演绎。",
    "trait": "低沉沙哑,沉稳有力,历尽沧桑",
    "scene": "游戏与RPG、纪录片、广告与预告",
    "age": "中年",
    "ageCategory": "中年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Russian_ReliableMan-8e79b9f472-v6-758ccfda4440ea63b838.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Russian_ReliableMan-020f6f159f.mp3",
    "accent": "标准俄语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Russian_CrazyQueen",
    "providerVoiceId": "Russian_CrazyQueen",
    "name": "Алиса Рыжова",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "俄语",
    "languages": [
      "俄文"
    ],
    "description": "该音色以高亢明亮的音质和充满爆发力的节奏为特征，极具辨识度。它能准确传达狂野、古灵精怪的情绪，是游戏角色和动漫配音类项目的理想选择，特别是针对性格张扬的战斗少女角色的演绎。",
    "trait": "高亢明亮,充满爆发力,古灵精怪",
    "scene": "游戏与RPG、广播剧、动漫与动画、角色配音",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Russian_CrazyQueen-a432bb0ac3-v6-9ef402dab1fb5b9cf9ee.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Russian_CrazyQueen-e2a7eca08a.mp3",
    "accent": "标准俄语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Russian_PessimisticGirl",
    "providerVoiceId": "Russian_PessimisticGirl",
    "name": "Нина Лаврова",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "俄语",
    "languages": [
      "俄文"
    ],
    "description": "这是一个极具辨识度的年轻少女音色。其声线清冷脆弱，说话节奏克制不安，语调中总是流露出一丝小心翼翼。整体风格悲观内向，能准确传达出自责、焦虑与渴望救赎的复杂情绪，是剧情向游戏、二次元角色配音以及广播剧中那些内心充满挣扎的幸存者角色的理想选择。",
    "trait": "清冷脆弱,克制不安,悲观内向",
    "scene": "游戏与RPG、广播剧、动漫与动画、角色配音、播客与社媒",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Russian_PessimisticGirl-f4bbf29c87-v6-9d02bbaced6d65fc5fb3.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Russian_PessimisticGirl-d95d99ecef.mp3",
    "accent": "标准俄语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Russian_AttractiveGuy",
    "providerVoiceId": "Russian_AttractiveGuy",
    "name": "Арсений Волков",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "俄语",
    "languages": [
      "俄文"
    ],
    "description": "这是一个专为情感互动设计的青年男声。其声线低沉磁性且带有明显的颗粒感，说话节奏语调慵懒、亲昵且略带气声。整体风格既危险又深情，给人一种强烈的霸道男友感，非常适合用于恋爱模拟游戏、ASMR角色扮演或深夜情感类广播剧等场景。",
    "trait": "低沉磁性,语调慵懒,霸道男友感",
    "scene": "游戏与RPG、有声书与小说、动漫与动画、角色配音",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Russian_AttractiveGuy-adbeb22996-v6-379df8a9a0bfb3194c34.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Russian_AttractiveGuy-e4cf9a72c4.mp3",
    "accent": "标准俄语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Russian_Bad-temperedBoy",
    "providerVoiceId": "Russian_Bad-temperedBoy",
    "name": "Лев Савельев",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "俄语",
    "languages": [
      "俄文"
    ],
    "description": "该音色以稚嫩清亮的音质和干脆利落的节奏为特征，极具辨识度。它能准确传达倔强、傲娇的情绪，自带一种鲜活的二次元画面感，是冒险游戏和动漫配音类项目的理想选择，特别是针对战斗系少年角色的演绎。",
    "trait": "稚嫩清亮,干脆利落,二次元画面感",
    "scene": "游戏与RPG、有声书与小说、动漫与动画、角色配音",
    "age": "儿童",
    "ageCategory": "儿童",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Russian_Bad-temperedBoy-039d0b4011-v6-34e607015679b9edff07.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Russian_Bad-temperedBoy-67d4e70959.mp3",
    "accent": "标准俄语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Italian_BraveHeroine",
    "providerVoiceId": "Italian_BraveHeroine",
    "name": "Giulia Ferraro",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "意大利语",
    "languages": [
      "意大利文"
    ],
    "description": "该音色以略带沙哑的质感和干脆利落的节奏为特征，极具辨识度。它能准确传达冷静、坚毅且自带一种高冷御姐的气场，是动作游戏和战斗番剧类项目的理想选择，特别是针对酷飒特工或忠诚护卫角色的演绎。",
    "trait": "略带沙哑,干脆利落,高冷御姐",
    "scene": "广播剧、有声书与小说、角色配音、广告与预告",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Italian_BraveHeroine-6e4d7d66f1-v6-cfccb1a63c2fb687f13f.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Italian_BraveHeroine-2524363210.mp3",
    "accent": "标准意大利语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Italian_Narrator",
    "providerVoiceId": "Italian_Narrator",
    "name": "Lorenzo Bellini",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "意大利语",
    "languages": [
      "意大利文"
    ],
    "description": "专为文学与情感表达打造的成熟男声。声音低沉浑厚且带有迷人的磁性，语调舒缓流畅，仿佛在耳边娓娓道来。这种充满故事感与深情色彩的音色，能完美构建出沉浸式的听觉氛围，极度契合经典有声书、情感独白或文艺类纪录片的解说需求。",
    "trait": "低沉浑厚,娓娓道来,沉浸式",
    "scene": "有声书与小说、纪录片、播客与社媒",
    "age": "中年",
    "ageCategory": "中年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Italian_Narrator-4439f46c32-v6-c12776997e254db3d1b0.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Italian_Narrator-7ae67773b1.mp3",
    "accent": "标准意大利语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Italian_WanderingSorcerer",
    "providerVoiceId": "Italian_WanderingSorcerer",
    "name": "Viola Rinaldi",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "意大利语",
    "languages": [
      "意大利文"
    ],
    "description": "这是一个成熟冷艳的女声。其声线低沉沙哑且带有迷人的磁性，说话节奏慵懒随意、略带一丝傲慢。整体风格优雅神秘且极具压迫感，能准确传达自信、危险的情绪，是角色配音和游戏与RPG类项目的理想选择，特别是针对高冷御姐或神秘魔女角色的演绎。",
    "trait": "低沉沙哑,慵懒随意,优雅神秘",
    "scene": "游戏与RPG、角色配音",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Italian_WanderingSorcerer-e6075ae836-v6-0dc09687d30d8e958028.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Italian_WanderingSorcerer-807dd6fef5.mp3",
    "accent": "标准意大利语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Italian_DiligentLeader",
    "providerVoiceId": "Italian_DiligentLeader",
    "name": "Beatrice Caruso",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "意大利语",
    "languages": [
      "意大利文"
    ],
    "description": "这是一个成熟冷艳的女声。其声线略带沙哑且富有磁性，说话节奏从容不迫、抑扬顿挫。整体风格高傲且充满气场，能够准确传达自信与威严的情绪，非常适合用于游戏角色配音、史诗剧情或大女主独白等场景，特别是针对黑帮大姐或高冷首领的演绎。",
    "trait": "略带沙哑,从容不迫,高傲且充满气场",
    "scene": "游戏与RPG、广播剧、动漫与动画、角色配音",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Italian_DiligentLeader-7060487fe4-v6-7c60666795ae9c39de6b.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Italian_DiligentLeader-1dd4df6241.mp3",
    "accent": "标准意大利语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Arabic_CalmWoman",
    "providerVoiceId": "Arabic_CalmWoman",
    "name": "ليلى منصور",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "阿拉伯语",
    "languages": [
      "阿拉伯文"
    ],
    "description": "这是一个知性优雅的中年女声。其声线柔和温润且富有质感，说话节奏舒缓从容、娓娓道来。整体风格理性通透且极具安抚力，非常适合用于知识科普、有声读物朗读或深度纪录片旁白等场景，能够完美契合那些需要引导思考或抚慰心灵的内容设定。",
    "trait": "柔和温润,娓娓道来,理性通透",
    "scene": "有声书与小说、在线教育、播客与社媒",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Arabic_CalmWoman-458c2ec3f5-v6-be5d406373ffb2684096.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Arabic_CalmWoman-59ce5088ba.mp3",
    "accent": "标准阿拉伯语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Arabic_FriendlyGuy",
    "providerVoiceId": "Arabic_FriendlyGuy",
    "name": "عمر ناصر",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "阿拉伯语",
    "languages": [
      "阿拉伯文"
    ],
    "description": "这是一个充满魅力的青年男声。其声线醇厚温暖且富有磁性，说话节奏从容淡定、语气亲切自然。整体风格既显忠诚可靠又带有一丝宠溺感，非常适合用于乙女游戏、广播剧或有声小说中忠诚侍卫或贴身管家等角色的演绎。",
    "trait": "醇厚温暖,从容淡定,宠溺感",
    "scene": "游戏与RPG、广播剧、有声书与小说、动漫与动画、角色配音",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Arabic_FriendlyGuy-3a502c4826-v6-dcca73a4a05a790e6ef1.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Arabic_FriendlyGuy-ba49d0c807.mp3",
    "accent": "标准阿拉伯语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Turkish_CalmWoman",
    "providerVoiceId": "Turkish_CalmWoman",
    "name": "Elif Arslan",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "土耳其语",
    "languages": [
      "土耳其文"
    ],
    "description": "这是一个知性温婉的女声。其声线柔和且富有质感，说话节奏舒缓流畅、娓娓道来。整体风格沉稳且极具亲和力，非常适合用于有声书朗读、知识科普或心理疗愈等场景。",
    "trait": "柔和质感,舒缓流畅,沉稳亲和",
    "scene": "有声书与小说、纪录片、在线教育",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Turkish_CalmWoman-4a9f1ccb08-v6-5d7440e32a15256d5694.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Turkish_CalmWoman-2c99e0f70e.mp3",
    "accent": "标准土耳其语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Turkish_Trustworthyman",
    "providerVoiceId": "Turkish_Trustworthyman",
    "name": "Kerem Yıldız",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "土耳其语",
    "languages": [
      "土耳其文"
    ],
    "description": "这是一个成熟稳重的男声。其声线低沉沙哑且略带颗粒感，说话节奏松弛自然、娓娓道来。整体风格质朴真诚且极具亲和力，非常适合用于温情广告、生活感悟类旁白或乡村题材的叙事场景。",
    "trait": "低沉沙哑,娓娓道来,质朴真诚",
    "scene": "广播剧、角色配音、纪录片、广告与预告、播客与社媒、企业宣传与旁白",
    "age": "中年",
    "ageCategory": "中年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Turkish_Trustworthyman-b20ceca664-v6-98036417aacd5e7c269a.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Turkish_Trustworthyman-99ccbf156d.mp3",
    "accent": "标准土耳其语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Ukrainian_CalmWoman",
    "providerVoiceId": "Ukrainian_CalmWoman",
    "name": "Олена Кравченко",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "乌克兰语",
    "languages": [
      "乌克兰文"
    ],
    "description": "这是一个优雅成熟的女声。其声线知性温婉，透着一种宁静致远的治愈感，说话语速舒缓、娓娓道来，每一个吐字都清晰而富有质感。整体风格沉稳且极具亲和力，给人一种如沐春风的安心感，非常适合用于文学有声书朗读、心理疗愈引导或高端文化类纪录片的旁白场景。",
    "trait": "知性温婉,娓娓道来,治愈感",
    "scene": "有声书与小说、纪录片、在线教育",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Ukrainian_CalmWoman-2af12c06f7-v6-b6656e6e2e0b734db000.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Ukrainian_CalmWoman-21cfb0ef2a.mp3",
    "accent": "标准乌克兰语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Ukrainian_WiseScholar",
    "providerVoiceId": "Ukrainian_WiseScholar",
    "name": "Марко Левченко",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "乌克兰语",
    "languages": [
      "乌克兰文"
    ],
    "description": "这是一个极具辨识度的青年男声。其声线清亮质朴，带有浓郁的英式地方口音，说话节奏自然随性，听起来仿佛是一位邻家友人在娓娓道来往日的故事。整体风格亲切接地气，能够准确传达出怀旧与真诚的情绪，非常适合用于口述历史类的纪录片、年代剧中的小人物独白或具有英伦风情的广播剧角色演绎。",
    "trait": "清亮质朴,自然随性,亲切接地气",
    "scene": "有声书与小说、纪录片",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Ukrainian_WiseScholar-dc5abd154c-v6-bb5d680faa22706c4546.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Ukrainian_WiseScholar-83cf803e2b.mp3",
    "accent": "标准乌克兰语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Dutch_kindhearted_girl",
    "providerVoiceId": "Dutch_kindhearted_girl",
    "name": "Lotte van Dijk",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "荷兰语",
    "languages": [
      "荷兰文"
    ],
    "description": "这是一个充满朝气的青年女声。其声线甜美细腻且富有感染力，说话节奏清晰明快、语调上扬。整体风格温暖亲切，给人一种如沐春风的治愈感，非常适合用于励志短片配音、治愈系有声书或教育类应用，能够完美契合邻家女孩的设定。",
    "trait": "甜美细腻,清晰明快,温暖亲切",
    "scene": "有声书与小说、在线教育、播客与社媒",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Dutch_kindhearted_girl-a4ddd34fc6-v6-29379b42fb5860c58775.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Dutch_kindhearted_girl-ac57acf532.mp3",
    "accent": "标准荷兰语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Dutch_bossy_leader",
    "providerVoiceId": "Dutch_bossy_leader",
    "name": "Bram de Vries",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "荷兰语",
    "languages": [
      "荷兰文"
    ],
    "description": "这是一个充满威严与压迫感的中年男声。其声线低沉粗犷，带有明显的沙哑颗粒感，说话节奏斩钉截铁、不容置疑。整体风格霸气外露，能够精准传达出命令者的强势与冷酷，非常适合用于战争题材游戏中的指挥官、反派首领或动作大片中的硬汉角色配音。",
    "trait": "沙哑颗粒感,斩钉截铁,霸气外露",
    "scene": "游戏与RPG、广播剧、角色配音、纪录片",
    "age": "中年",
    "ageCategory": "中年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Dutch_bossy_leader-209321ddd3-v6-ea0bab3b77df6c219f7f.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Dutch_bossy_leader-8bd6cb44b3.mp3",
    "accent": "标准荷兰语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Vietnamese_kindhearted_girl",
    "providerVoiceId": "Vietnamese_kindhearted_girl",
    "name": "Trần Ngọc Anh",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "越南语",
    "languages": [
      "越南文"
    ],
    "description": "这是一个充满朝气的青年女声。其声线甜美细腻且富有感染力，说话节奏轻快流畅、吐字清晰。整体风格温柔亲切且充满阳光感，自带一种极强的邻家女孩气质，非常适合用于治愈系有声书、儿童教育内容或生活类广告旁白，能够完美诠释热心肠的知心姐姐形象。",
    "trait": "甜美细腻,轻快流畅,邻家女孩",
    "scene": "有声书与小说、在线教育、播客与社媒",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Vietnamese_kindhearted_girl-fb95e77741-v6-fe0a936fb3502d08f537.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Vietnamese_kindhearted_girl-d103950d64.mp3",
    "accent": "标准越南语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Thai_male_1_sample8",
    "providerVoiceId": "Thai_male_1_sample8",
    "name": "Niran Sutham",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "泰语",
    "languages": [
      "泰文"
    ],
    "description": "这是一个温暖知性的中年男声。其声线醇厚温润，说话节奏舒缓从容、娓娓道来。整体风格沉稳且极具治愈感，给人一种如沐春风的亲切体验，非常适合用于知识分享、个人成长类播客或深度有声书导读等场景。",
    "trait": "醇厚温润,娓娓道来,治愈感",
    "scene": "有声书与小说、在线教育、播客与社媒",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Thai_male_1_sample8-073e4ca906-v6-6eed41947029383cc95b.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Thai_male_1_sample8-6e190434ff.mp3",
    "accent": "标准泰语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Thai_male_2_sample2",
    "providerVoiceId": "Thai_male_2_sample2",
    "name": "Tawan Kietchai",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "泰语",
    "languages": [
      "泰文"
    ],
    "description": "这是一个充满活力的青年男声。其声线明亮亲切且富有感染力，说话节奏轻快流畅、抑扬顿挫。整体风格热情且极具亲和力，自带一种轻松愉悦的导游感，非常适合用于旅游介绍、生活类Vlog旁白或轻松的商业广告等场景。",
    "trait": "明亮亲切,轻快流畅,极具亲和力",
    "scene": "纪录片、广告与预告、播客与社媒",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Thai_male_2_sample2-98612a94a8-v6-70547a6a021d8c0c8a70.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Thai_male_2_sample2-24eb5e17d0.mp3",
    "accent": "标准泰语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Thai_female_1_sample1",
    "providerVoiceId": "Thai_female_1_sample1",
    "name": "Mali Srisawat",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "泰语",
    "languages": [
      "泰文"
    ],
    "description": "这是一个知性干练的女声。其声线明亮且富有穿透力，说话节奏轻快流畅、条理清晰。整体风格自信且充满活力，非常适合用于知识分享类播客、商业资讯节目或现代职场宣传片等场景。",
    "trait": "明亮,轻快流畅,自信",
    "scene": "在线教育、播客与社媒、企业宣传与旁白",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Thai_female_1_sample1-fad39be3d8-v6-19409cb60a3b820d03ab.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Thai_female_1_sample1-66fa925642.mp3",
    "accent": "标准泰语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Thai_female_2_sample2",
    "providerVoiceId": "Thai_female_2_sample2",
    "name": "Nalin Wiriya",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "泰语",
    "languages": [
      "泰文"
    ],
    "description": "这是一个知性干练的女声。其声线清亮且富有亲和力，说话节奏流畅自然、条理清晰。整体风格专业且充满活力，非常适合用于科技科普、商业播客或资讯类节目等场景。",
    "trait": "清亮,条理清晰,充满活力",
    "scene": "纪录片、在线教育、播客与社媒、企业宣传与旁白",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Thai_female_2_sample2-473c96fd59-v6-269b76e74f45770c2e41.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Thai_female_2_sample2-5719c5d828.mp3",
    "accent": "标准泰语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Polish_male_1_sample4",
    "providerVoiceId": "Polish_male_1_sample4",
    "name": "Marek Wysocki",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "波兰语",
    "languages": [
      "波兰文"
    ],
    "description": "这是一个成熟理性的男声。其声线沉稳厚实且具备极佳的颗粒感，说话节奏从容平缓、逻辑重音处理得当。整体风格专业严谨且不失亲和力，给人一种知识渊博的信赖感，非常适合用于科技产品教程、软件操作指南或在线教育内容等需要清晰传达信息的场景。",
    "trait": "沉稳厚实,从容平缓,专业严谨",
    "scene": "在线教育、企业宣传与旁白",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Polish_male_1_sample4-f93151458c-v6-f9b25508e1072a717783.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Polish_male_1_sample4-156e3648b6.mp3",
    "accent": "标准波兰语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Polish_male_2_sample3",
    "providerVoiceId": "Polish_male_2_sample3",
    "name": "Kamil Czerwiński",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "波兰语",
    "languages": [
      "波兰文"
    ],
    "description": "这是一个充满活力的男声。其声线清亮且极具穿透力，说话节奏极快、干脆利落。整体风格热情洋溢且富有动感，非常适合用于快节奏的广告口播、电台节目片花或游戏实况解说等场景。",
    "trait": "清亮,节奏极快,热情洋溢",
    "scene": "广告与预告、播客与社媒",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Polish_male_2_sample3-90de01f020-v6-0e9f0e6e397dba7496b7.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Polish_male_2_sample3-e66a5bc05c.mp3",
    "accent": "标准波兰语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Polish_female_1_sample1",
    "providerVoiceId": "Polish_female_1_sample1",
    "name": "Zofia Malinowska",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "波兰语",
    "languages": [
      "波兰文"
    ],
    "description": "这是一个知性温婉的中年女声。其声线清晰柔和且略带暖意，说话节奏自然流畅、娓娓道来。整体风格亲切且富有知识涵养，非常适合用于自然纪录片解说、科普访谈或博物馆有声导览等场景。",
    "trait": "清晰柔和,娓娓道来,富有知识涵养",
    "scene": "纪录片、在线教育",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Polish_female_1_sample1-0ac6b2b304-v6-a9f9e1445c80665e3ac8.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Polish_female_1_sample1-e0be8e9b58.mp3",
    "accent": "标准波兰语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Polish_female_2_sample3",
    "providerVoiceId": "Polish_female_2_sample3",
    "name": "Ewa Zielińska",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "波兰语",
    "languages": [
      "波兰文"
    ],
    "description": "这是一个年轻亲切的女声。其声线温暖且自然，说话节奏流畅、如同日常交谈般随性。整体风格真诚且富有生活气息，给人一种邻家朋友的感觉，非常适合用于生活类播客、健康知识分享或社交媒体视频等场景。",
    "trait": "温暖且自然,如同日常交谈,富有生活气息",
    "scene": "广告与预告、播客与社媒",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Polish_female_2_sample3-c369d2ee4f-v6-3ecd19bc049cb6e16cf8.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Polish_female_2_sample3-0ad52fe32b.mp3",
    "accent": "标准波兰语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Romanian_male_1_sample2",
    "providerVoiceId": "Romanian_male_1_sample2",
    "name": "Sorin Cernat",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "罗马尼亚语",
    "languages": [
      "罗马尼亚文"
    ],
    "description": "这是一个成熟干练的男声。其声线沉稳厚实且极具穿透力，说话节奏紧凑有序、铿锵有力。整体风格严谨且充满权威感，非常适合用于国际新闻播报、财经时评或严肃纪录片旁白等场景。",
    "trait": "沉稳厚实,铿锵有力,权威感",
    "scene": "播客与社媒、企业宣传与旁白",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Romanian_male_1_sample2-8f7caa850b-v6-2e42aa38b4af17e78134.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Romanian_male_1_sample2-35b7df26ec.mp3",
    "accent": "标准罗马尼亚语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Romanian_male_2_sample1",
    "providerVoiceId": "Romanian_male_2_sample1",
    "name": "Darius Pavel",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "罗马尼亚语",
    "languages": [
      "罗马尼亚文"
    ],
    "description": "这是一个充满活力的青年男声。其声线清亮且略带沙哑质感，说话节奏流畅自然、抑扬顿挫。整体风格亲切且富有知识性，非常适合用于知识播客、在线教育内容或职场技能分享等场景。",
    "trait": "清亮且略带沙哑质感,流畅自然,亲切且富有知识性",
    "scene": "在线教育、播客与社媒、企业宣传与旁白",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Romanian_male_2_sample1-9f8f127b0f-v6-290479c73bc364794d1c.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Romanian_male_2_sample1-d0d13a45df.mp3",
    "accent": "标准罗马尼亚语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Romanian_female_1_sample4",
    "providerVoiceId": "Romanian_female_1_sample4",
    "name": "Mara Bălan",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "罗马尼亚语",
    "languages": [
      "罗马尼亚文"
    ],
    "description": "该音色以清脆明亮的声线和轻快活泼的节奏为特征，极具辨识度与感染力。它能准确传达热情、自信的积极情绪，是社交媒体视频和播客访谈类项目的理想选择，特别是针对活力主持角色的演绎。",
    "trait": "清脆明亮,轻快活泼,热情",
    "scene": "广告与预告、播客与社媒",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Romanian_female_1_sample4-975a05e817-v6-3cb2f1f307c2d1e31d39.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Romanian_female_1_sample4-4969635e4c.mp3",
    "accent": "标准罗马尼亚语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Romanian_female_2_sample1",
    "providerVoiceId": "Romanian_female_2_sample1",
    "name": "Ilinca Vasile",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "罗马尼亚语",
    "languages": [
      "罗马尼亚文"
    ],
    "description": "这是一个知性干练的女声。其声线清亮悦耳，说话节奏轻快流畅、语速较快。整体风格亲切自然且富有感染力，非常适合用于商业播客、知识分享或现代生活方式类内容的讲述，能够完美契合职场导师或访谈主持人的设定。",
    "trait": "清亮悦耳,轻快流畅,亲切自然",
    "scene": "广告与预告、在线教育、播客与社媒、企业宣传与旁白",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Romanian_female_2_sample1-efb358533d-v6-3cf599c8cffa517bd345.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Romanian_female_2_sample1-0e021b1cfa.mp3",
    "accent": "标准罗马尼亚语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-greek_male_1a_v1",
    "providerVoiceId": "greek_male_1a_v1",
    "name": "Nikos Anagnostou",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "希腊语",
    "languages": [
      "希腊文"
    ],
    "description": "这是一个热情洋溢的青年男声。其声线清亮亲切，带有明显的笑意，说话节奏自然流畅、如同邻家大男孩般随性。整体风格轻松活泼且极具互动感，给人一种充满活力和乐于分享的感觉，非常适合用于语言教学播客、生活类Vlog旁白或轻松的对谈节目等场景。",
    "trait": "清亮亲切,自然流畅,轻松活泼",
    "scene": "广告与预告、在线教育、播客与社媒、企业宣传与旁白",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-greek_male_1a_v1-b66a68390c-v6-72a156f2b07bceffac7b.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/greek_male_1a_v1-4ae5a31681.mp3",
    "accent": "标准希腊语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Greek_female_1_sample1",
    "providerVoiceId": "Greek_female_1_sample1",
    "name": "Eleni Stavrou",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "希腊语",
    "languages": [
      "希腊文"
    ],
    "description": "这是一个知性优雅的中年女声。其声线柔和细腻且富有磁性，说话节奏舒缓流畅、娓娓道来。整体风格亲切且具有极强的叙述感，非常适合用于文化类播客、深度纪录片或情感电台等场景。",
    "trait": "柔和细腻,娓娓道来,叙述感",
    "scene": "有声书与小说、纪录片、播客与社媒",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Greek_female_1_sample1-b1fdc0ff7a-v6-aaf95e94d4aedd956f5a.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Greek_female_1_sample1-83eb8280f3.mp3",
    "accent": "标准希腊语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Greek_female_2_sample3",
    "providerVoiceId": "Greek_female_2_sample3",
    "name": "Daphne Melidou",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "希腊语",
    "languages": [
      "希腊文"
    ],
    "description": "该音色以清亮自然的音质和语速轻快的节奏为特征，极具辨识度。它能准确传达随性、幽默的情绪，是生活类Vlog和轻松播客类项目的理想选择，特别是针对活力闺蜜角色的演绎。",
    "trait": "清亮自然,语速轻快,随性幽默",
    "scene": "广播剧、广告与预告、播客与社媒、企业宣传与旁白",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Greek_female_2_sample3-788a8b483b-v6-51d299bc72be3bdb3665.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Greek_female_2_sample3-9a30a44fea.mp3",
    "accent": "标准希腊语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-czech_male_1_v1",
    "providerVoiceId": "czech_male_1_v1",
    "name": "Marek Novotný",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "捷克语",
    "languages": [
      "捷克文"
    ],
    "description": "这是一个专业干练的男声。其声线浑厚有力且质感扎实，说话节奏逻辑清晰、抑扬顿挫。整体风格客观冷静且极具公信力，自带一种严肃的新闻现场感，非常适合用于国际时事播报、财经新闻分析或官方声明宣读等场景。",
    "trait": "浑厚有力,抑扬顿挫,新闻现场感",
    "scene": "纪录片、播客与社媒、企业宣传与旁白",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-czech_male_1_v1-cf3d998ea8-v6-a05389fc67a01548942d.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/czech_male_1_v1-065dd15e31.mp3",
    "accent": "标准捷克语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-czech_female_5_v7",
    "providerVoiceId": "czech_female_5_v7",
    "name": "Klára Benešová",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "捷克语",
    "languages": [
      "捷克文"
    ],
    "description": "这是一个专业干练的女声。其声线清晰明亮且富有知性，说话节奏紧凑流畅、语调自然。整体风格严谨且极具公信力，自带一种强烈的现场报道感，非常适合用于新闻资讯播报、法律案件解说或社会热点评论等场景。",
    "trait": "清晰明亮,紧凑流畅,现场报道感",
    "scene": "播客与社媒、企业宣传与旁白",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-czech_female_5_v7-80e1209ab5-v6-5dfaddd1883711528aa7.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/czech_female_5_v7-4bf0d9d4e3.mp3",
    "accent": "标准捷克语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-czech_female_2_v2",
    "providerVoiceId": "czech_female_2_v2",
    "name": "Tereza Horská",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "捷克语",
    "languages": [
      "捷克文"
    ],
    "description": "这是一个充满活力的青年女声。其声线清脆明亮且富有感染力，说话节奏轻快流畅，语调热情洋溢，展现出一种自信且令人愉悦的交流氛围。整体风格亲切自然，极具现代都市感，非常适合用于时尚播客主持、生活类Vlog旁白或轻松的社交媒体内容创作，能够迅速拉近与听众的距离。",
    "trait": "清脆明亮,轻快流畅,亲切自然",
    "scene": "播客与社媒",
    "age": "中年",
    "ageCategory": "中年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-czech_female_2_v2-20f59bc726-v6-fe51f81a8d945b76e003.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/czech_female_2_v2-edc7deaf89.mp3",
    "accent": "标准捷克语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-finnish_male_3_v1",
    "providerVoiceId": "finnish_male_3_v1",
    "name": "Eero Lehtinen",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "芬兰语",
    "languages": [
      "芬兰文"
    ],
    "description": "这是一个充满活力且极具亲和力的青年男声。其声线清亮自然，说话节奏轻快流畅，带有明显的日常交谈感和即兴发挥的松弛度。整体风格轻松愉快，仿佛一位邻家好友在与你面对面闲聊，非常适合用于播客访谈、生活Vlog旁白或社交媒体短视频等场景，能够完美契合阳光开朗的节目主持人设定。",
    "trait": "清亮自然,轻快流畅,日常交谈感",
    "scene": "广播剧、播客与社媒、企业宣传与旁白",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-finnish_male_3_v1-55b13b628b-v6-81ddeae67fdb4e3c06a9.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/finnish_male_3_v1-83ccf2e775.mp3",
    "accent": "标准芬兰语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-finnish_male_1_v2",
    "providerVoiceId": "finnish_male_1_v2",
    "name": "Olli Virtanen",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "芬兰语",
    "languages": [
      "芬兰文"
    ],
    "description": "这是一个充满活力的青年男声。其声线明朗亲切，带有自然的颗粒感，说话节奏轻快流畅，富有极强的交流感。整体风格像是一位热情的邻家朋友在侃侃而谈，极具亲和力与感染力，非常适合用于播客主持、现代生活类广告或社交媒体视频配音等场景。",
    "trait": "明朗亲切,轻快流畅,邻家朋友感",
    "scene": "广告与预告、播客与社媒、企业宣传与旁白",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-finnish_male_1_v2-7da90de6e7-v6-b8e4386a9751ae8204fe.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/finnish_male_1_v2-1c2beb17c5.mp3",
    "accent": "标准芬兰语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-finnish_female_4_v1",
    "providerVoiceId": "finnish_female_4_v1",
    "name": "Aino Kallio",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "芬兰语",
    "languages": [
      "芬兰文"
    ],
    "description": "这是一个成熟干练的女声。其声线清脆有力且富有穿透力，说话节奏紧凑、字正腔圆。整体风格客观冷静且极具专业感，自带一种强烈的新闻现场感，非常适合用于严肃的时事新闻播报、深度时评节目或国际政治相关的纪录片旁白等场景。",
    "trait": "清脆有力,节奏紧凑,新闻现场感",
    "scene": "纪录片、播客与社媒、企业宣传与旁白",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-finnish_female_4_v1-f66ad4a9e1-v6-e199d5e6b2bde177d02a.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/finnish_female_4_v1-9a5cd85a21.mp3",
    "accent": "标准芬兰语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-hindi_male_1_v2",
    "providerVoiceId": "hindi_male_1_v2",
    "name": "Dev Malhotra",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "印地语",
    "languages": [
      "印地文"
    ],
    "description": "这是一个成熟温和的男声。其声线厚实且略带沙哑，说话节奏娓娓道来、平稳流畅。整体风格亲切自然且富有叙事感，给人一种邻家长者的信赖感，非常适合用于民间故事讲述、有声书朗读或人文纪录片解说等场景。",
    "trait": "厚实,娓娓道来,亲切自然",
    "scene": "广播剧、有声书与小说、纪录片、播客与社媒",
    "age": "中年",
    "ageCategory": "中年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-hindi_male_1_v2-390555e73d-v6-4948a5e13c2ca4c053b9.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/hindi_male_1_v2-bbc11d9a35.mp3",
    "accent": "标准印地语",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-hindi_female_2_v1",
    "providerVoiceId": "hindi_female_2_v1",
    "name": "Meera Sethi",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "印地语",
    "languages": [
      "印地文"
    ],
    "description": "这是一个专为叙事类内容设计的成熟讲述者音色。其声音温暖沉静且富有质感，语调娓娓道来、舒缓流畅，给人一种亲切自然、极具画面感的听觉体验。推荐用于长篇有声小说朗读、广播剧旁白或文化类纪录片，能够完美契合知性故事讲述者的设定。",
    "trait": "温暖沉静,娓娓道来,极具画面感",
    "scene": "有声书与小说、纪录片",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-hindi_female_2_v1-1e3bb714fe-v6-4ade124f6378c60eeca8.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/hindi_female_2_v1-d805804177.mp3",
    "accent": "标准印地语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-hindi_female_1_v2",
    "providerVoiceId": "hindi_female_1_v2",
    "name": "Anika Bansal",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "印地语",
    "languages": [
      "印地文"
    ],
    "description": "这是一个知性专业的女声。其声线清晰明亮，音质纯净且富有穿透力，说话节奏平稳流畅、字正腔圆，展现出极高的语言规范度。整体风格端庄且具有亲和力，自带一种标准的新闻播报感，非常适合用于语言教学、有声词典、新闻资讯播报或智能助手语音等场景。",
    "trait": "清晰明亮,字正腔圆,新闻播报感",
    "scene": "在线教育、播客与社媒、企业宣传与旁白",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-hindi_female_1_v2-ee5f8c33c3-v6-2dad1bea2e3861a08243.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/hindi_female_1_v2-1b69ffe3a0.mp3",
    "accent": "标准印地语",
    "gender": "女声"
  },
  {
    "id": "sys-minimax-Chinese_casual_instructor_nv1",
    "providerVoiceId": "Chinese_casual_instructor_nv1",
    "name": "秦砚之",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话"
    ],
    "description": "这是一个充满活力、清晰且极具吸引力的声音，感觉就像同龄人之间的教学指导。非常适合用于在线教学和DIY教程，以及教育类YouTube频道、语言学习应用和新员工入职视频等场景。",
    "trait": "清晰坚定,流畅,知性",
    "scene": "在线教育、播客与社媒",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Chinese_casual_instructor_nv1-74796faaf1-v6-b212395aae8d3fa01078.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Chinese_casual_instructor_nv1-e228f6be03.mp3",
    "accent": "普通话",
    "gender": "男声"
  },
  {
    "id": "sys-minimax-Chinese_patitent_teacher",
    "providerVoiceId": "Chinese_patitent_teacher",
    "name": "袁清砚",
    "type": "SYSTEM",
    "targetModel": "speech-2.8-turbo",
    "supportedModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "sourceModels": [
      "speech-2.8-turbo",
      "speech-2.8-hd"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话"
    ],
    "description": "这是一个亲和耐心的中青年女声。声线清晰温柔、带有安抚力，说话节奏稳健、语调鼓励而平和。整体风格严谨又不失亲切，能够极好地化解焦虑、建立信任感。非常适合用于在线教育内容、知识讲解、儿童辅导、科普节目以及各类讲解类语音包。",
    "trait": "温和清晰,专业,耐心",
    "scene": "在线教育、播客与社媒、企业宣传与旁白",
    "age": "青年",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/minimax-Chinese_patitent_teacher-e9af1be221-v6-37af589990a29c330e84.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "https://cdn.xueleai.com/uploads/audio/voices/minimax-system/Chinese_patitent_teacher-ac604b6723.mp3",
    "accent": "普通话",
    "gender": "女声"
  }
] as const satisfies readonly MinimaxSystemVoice[];
