export const cosyVoiceLanguages = ["普通话", "粤语", "闽南语", "英式英语", "美式英语", "其他英语", "日语", "韩语"] as const;

export const cosyVoiceAgeCategories = ["儿童", "青年", "中年", "老年"] as const;

export type CosyVoiceLanguage = (typeof cosyVoiceLanguages)[number];
export type CosyVoiceAgeCategory = (typeof cosyVoiceAgeCategories)[number];

export interface CosyVoiceSystemVoice {
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
  languages: readonly CosyVoiceLanguage[];
  description: string;
  trait: string;
  scene: string;
  age: string;
  ageCategory: CosyVoiceAgeCategory | null;
  accent?: string;
  gender?: "男声" | "女声";
  avatarUrl: string | null;
  ssmlSupported: boolean;
  instructSupported: boolean;
  timestampSupported: boolean;
  previewAudioUrl: string;
}

export const cosyVoiceSystemVoices = [
  {
    "id": "sys-longanyang",
    "providerVoiceId": "longanyang",
    "name": "林朗辰",
    "type": "SYSTEM",
    "targetModel": "cosyvoice-v3-flash",
    "supportedModels": [
      "cosyvoice-v3-flash",
      "cosyvoice-v3-plus"
    ],
    "sourceModels": [
      "cosyvoice-v3-flash",
      "cosyvoice-v3-plus"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话",
      "美式英语"
    ],
    "description": "社交陪伴（标杆音色） · 阳光大男孩",
    "trait": "阳光大男孩",
    "scene": "社交陪伴（标杆音色）",
    "age": "20~30岁",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/cosy-longanyang-63476a3a67-v6-6ebf020cbfdbe5f6bb18.jpg",
    "ssmlSupported": true,
    "instructSupported": true,
    "timestampSupported": true,
    "previewAudioUrl": "/audio/voices/cosyvoice-v3/longanyang.mp3",
    "accent": "普通话",
    "gender": "男声"
  },
  {
    "id": "sys-longanhuan",
    "providerVoiceId": "longanhuan",
    "name": "陆笑晴",
    "type": "SYSTEM",
    "targetModel": "cosyvoice-v3-flash",
    "supportedModels": [
      "cosyvoice-v3-flash",
      "cosyvoice-v3-plus"
    ],
    "sourceModels": [
      "cosyvoice-v3-flash",
      "cosyvoice-v3-plus"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话",
      "美式英语"
    ],
    "description": "社交陪伴（标杆音色） · 欢脱元气女",
    "trait": "欢脱元气女",
    "scene": "社交陪伴（标杆音色）",
    "age": "20~30岁",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/cosy-longanhuan-081f57d883-v6-9b70803cef55fa6bdf65.jpg",
    "ssmlSupported": true,
    "instructSupported": true,
    "timestampSupported": true,
    "previewAudioUrl": "/audio/voices/cosyvoice-v3/longanhuan.mp3",
    "accent": "普通话",
    "gender": "女声"
  },
  {
    "id": "sys-longhuhu_v3",
    "providerVoiceId": "longhuhu_v3",
    "name": "苏予晴",
    "type": "SYSTEM",
    "targetModel": "cosyvoice-v3-flash",
    "supportedModels": [
      "cosyvoice-v3-flash",
      "cosyvoice-v3-plus"
    ],
    "sourceModels": [
      "cosyvoice-v3-flash"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话",
      "美式英语"
    ],
    "description": "童声（标杆音色） · 天真烂漫女童",
    "trait": "天真烂漫女童",
    "scene": "童声（标杆音色）",
    "age": "6~10岁",
    "ageCategory": "儿童",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/cosy-longhuhu_v3-baae715d5a-v6-ab1e10a8053d088a4e01.jpg",
    "ssmlSupported": true,
    "instructSupported": true,
    "timestampSupported": true,
    "previewAudioUrl": "/audio/voices/cosyvoice-v3/longhuhu_v3.mp3",
    "accent": "普通话",
    "gender": "女声"
  },
  {
    "id": "sys-longpaopao_v3",
    "providerVoiceId": "longpaopao_v3",
    "name": "秦乐禾",
    "type": "SYSTEM",
    "targetModel": "cosyvoice-v3-flash",
    "supportedModels": [
      "cosyvoice-v3-flash",
      "cosyvoice-v3-plus"
    ],
    "sourceModels": [
      "cosyvoice-v3-flash"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话",
      "美式英语"
    ],
    "description": "智能玩具/儿童故事机 · 飞天泡泡音",
    "trait": "飞天泡泡音",
    "scene": "智能玩具/儿童故事机",
    "age": "6~15岁",
    "ageCategory": "儿童",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/cosy-longpaopao_v3-868a3459b7-v6-64f96230d78728f4d721.jpg",
    "ssmlSupported": true,
    "instructSupported": false,
    "timestampSupported": true,
    "previewAudioUrl": "/audio/voices/cosyvoice-v3/longpaopao_v3.mp3",
    "accent": "普通话",
    "gender": "男声"
  },
  {
    "id": "sys-longjielidou_v3",
    "providerVoiceId": "longjielidou_v3",
    "name": "莫一帆",
    "type": "SYSTEM",
    "targetModel": "cosyvoice-v3-flash",
    "supportedModels": [
      "cosyvoice-v3-flash",
      "cosyvoice-v3-plus"
    ],
    "sourceModels": [
      "cosyvoice-v3-flash"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话",
      "其他英语"
    ],
    "description": "智能玩具/儿童故事机 · 阳光顽皮男",
    "trait": "阳光顽皮男",
    "scene": "智能玩具/儿童故事机",
    "age": "10岁",
    "ageCategory": "儿童",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/cosy-longjielidou_v3-6592cbfb67-v6-ab861b9d9cf53821e48b.jpg",
    "ssmlSupported": true,
    "instructSupported": false,
    "timestampSupported": true,
    "previewAudioUrl": "/audio/voices/cosyvoice-v3/longjielidou_v3.mp3",
    "accent": "普通话",
    "gender": "男声"
  },
  {
    "id": "sys-longxian_v3",
    "providerVoiceId": "longxian_v3",
    "name": "庄小满",
    "type": "SYSTEM",
    "targetModel": "cosyvoice-v3-flash",
    "supportedModels": [
      "cosyvoice-v3-flash",
      "cosyvoice-v3-plus"
    ],
    "sourceModels": [
      "cosyvoice-v3-flash"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话",
      "美式英语"
    ],
    "description": "智能玩具/儿童故事机 · 豪放可爱女",
    "trait": "豪放可爱女",
    "scene": "智能玩具/儿童故事机",
    "age": "12岁",
    "ageCategory": "儿童",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/cosy-longxian_v3-5f3cb717eb-v6-9704fa115b2345b538ac.jpg",
    "ssmlSupported": true,
    "instructSupported": false,
    "timestampSupported": true,
    "previewAudioUrl": "/audio/voices/cosyvoice-v3/longxian_v3.mp3",
    "accent": "普通话",
    "gender": "女声"
  },
  {
    "id": "sys-longling_v3",
    "providerVoiceId": "longling_v3",
    "name": "裴知夏",
    "type": "SYSTEM",
    "targetModel": "cosyvoice-v3-flash",
    "supportedModels": [
      "cosyvoice-v3-flash",
      "cosyvoice-v3-plus"
    ],
    "sourceModels": [
      "cosyvoice-v3-flash"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话",
      "美式英语"
    ],
    "description": "智能玩具/儿童故事机 · 稚气呆板女",
    "trait": "稚气呆板女",
    "scene": "智能玩具/儿童故事机",
    "age": "10岁",
    "ageCategory": "儿童",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/cosy-longling_v3-9a0bc0b64b-v6-103282fb1bdf80124291.jpg",
    "ssmlSupported": true,
    "instructSupported": false,
    "timestampSupported": true,
    "previewAudioUrl": "/audio/voices/cosyvoice-v3/longling_v3.mp3",
    "accent": "普通话",
    "gender": "女声"
  },
  {
    "id": "sys-longshanshan_v3",
    "providerVoiceId": "longshanshan_v3",
    "name": "许星乐",
    "type": "SYSTEM",
    "targetModel": "cosyvoice-v3-flash",
    "supportedModels": [
      "cosyvoice-v3-flash",
      "cosyvoice-v3-plus"
    ],
    "sourceModels": [
      "cosyvoice-v3-flash"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话",
      "其他英语"
    ],
    "description": "消费电子-儿童有声书 · 戏剧化童声",
    "trait": "戏剧化童声",
    "scene": "消费电子-儿童有声书",
    "age": "6~15岁",
    "ageCategory": "儿童",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/cosy-longshanshan_v3-8169fba027-v6-d6d5b27abb8412fafb3d.jpg",
    "ssmlSupported": true,
    "instructSupported": false,
    "timestampSupported": true,
    "previewAudioUrl": "/audio/voices/cosyvoice-v3/longshanshan_v3.mp3",
    "accent": "普通话",
    "gender": "男声"
  },
  {
    "id": "sys-longniuniu_v3",
    "providerVoiceId": "longniuniu_v3",
    "name": "罗安沐",
    "type": "SYSTEM",
    "targetModel": "cosyvoice-v3-flash",
    "supportedModels": [
      "cosyvoice-v3-flash",
      "cosyvoice-v3-plus"
    ],
    "sourceModels": [
      "cosyvoice-v3-flash"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话",
      "美式英语"
    ],
    "description": "消费电子-儿童有声书 · 阳光男童声",
    "trait": "阳光男童声",
    "scene": "消费电子-儿童有声书",
    "age": "6~15岁",
    "ageCategory": "儿童",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/cosy-longniuniu_v3-e1582cf054-v6-8db9fda369f3bbd5d610.jpg",
    "ssmlSupported": true,
    "instructSupported": false,
    "timestampSupported": true,
    "previewAudioUrl": "/audio/voices/cosyvoice-v3/longniuniu_v3.mp3",
    "accent": "普通话",
    "gender": "男声"
  },
  {
    "id": "sys-longjiaxin_v3",
    "providerVoiceId": "longjiaxin_v3",
    "name": "谢语恬",
    "type": "SYSTEM",
    "targetModel": "cosyvoice-v3-flash",
    "supportedModels": [
      "cosyvoice-v3-flash",
      "cosyvoice-v3-plus"
    ],
    "sourceModels": [
      "cosyvoice-v3-flash"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "粤语",
      "其他英语"
    ],
    "description": "方言 · 优雅粤语女",
    "trait": "优雅粤语女",
    "scene": "方言",
    "age": "30~35岁",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/cosy-longjiaxin_v3-4be58ab735-v6-9c7bb9452e4c79878ec4.jpg",
    "ssmlSupported": true,
    "instructSupported": false,
    "timestampSupported": true,
    "previewAudioUrl": "/audio/voices/cosyvoice-v3/longjiaxin_v3.mp3",
    "accent": "粤语",
    "gender": "女声"
  },
  {
    "id": "sys-longjiayi_v3",
    "providerVoiceId": "longjiayi_v3",
    "name": "曹若宁",
    "type": "SYSTEM",
    "targetModel": "cosyvoice-v3-flash",
    "supportedModels": [
      "cosyvoice-v3-flash",
      "cosyvoice-v3-plus"
    ],
    "sourceModels": [
      "cosyvoice-v3-flash"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "粤语",
      "其他英语"
    ],
    "description": "方言 · 知性粤语女",
    "trait": "知性粤语女",
    "scene": "方言",
    "age": "25~30岁",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/cosy-longjiayi_v3-b5bf8f18cc-v6-6af96a14983ce07176fb.jpg",
    "ssmlSupported": true,
    "instructSupported": false,
    "timestampSupported": true,
    "previewAudioUrl": "/audio/voices/cosyvoice-v3/longjiayi_v3.mp3",
    "accent": "粤语",
    "gender": "女声"
  },
  {
    "id": "sys-longanyue_v3",
    "providerVoiceId": "longanyue_v3",
    "name": "林昱阳",
    "type": "SYSTEM",
    "targetModel": "cosyvoice-v3-flash",
    "supportedModels": [
      "cosyvoice-v3-flash",
      "cosyvoice-v3-plus"
    ],
    "sourceModels": [
      "cosyvoice-v3-flash"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "粤语",
      "美式英语"
    ],
    "description": "方言 · 欢脱粤语男",
    "trait": "欢脱粤语男",
    "scene": "方言",
    "age": "25~35岁",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/cosy-longanyue_v3-f2ad322cdc-v6-ab9612bbc0e0436c526b.jpg",
    "ssmlSupported": true,
    "instructSupported": false,
    "timestampSupported": true,
    "previewAudioUrl": "/audio/voices/cosyvoice-v3/longanyue_v3.mp3",
    "accent": "粤语",
    "gender": "男声"
  },
  {
    "id": "sys-longlaotie_v3",
    "providerVoiceId": "longlaotie_v3",
    "name": "卓清和",
    "type": "SYSTEM",
    "targetModel": "cosyvoice-v3-flash",
    "supportedModels": [
      "cosyvoice-v3-flash",
      "cosyvoice-v3-plus"
    ],
    "sourceModels": [
      "cosyvoice-v3-flash"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话",
      "美式英语"
    ],
    "description": "方言 · 东北直率男",
    "trait": "东北直率男",
    "scene": "方言",
    "age": "25~30岁",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/cosy-longlaotie_v3-2781ae09bb-v6-8f42884e0bb51cc1eb1b.jpg",
    "ssmlSupported": true,
    "instructSupported": false,
    "timestampSupported": true,
    "previewAudioUrl": "/audio/voices/cosyvoice-v3/longlaotie_v3.mp3",
    "accent": "东北话",
    "gender": "男声"
  },
  {
    "id": "sys-longshange_v3",
    "providerVoiceId": "longshange_v3",
    "name": "苏沐言",
    "type": "SYSTEM",
    "targetModel": "cosyvoice-v3-flash",
    "supportedModels": [
      "cosyvoice-v3-flash",
      "cosyvoice-v3-plus"
    ],
    "sourceModels": [
      "cosyvoice-v3-flash"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话",
      "美式英语"
    ],
    "description": "方言 · 原味陕北男",
    "trait": "原味陕北男",
    "scene": "方言",
    "age": "25~35岁",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/cosy-longshange_v3-18e05dfaa6-v6-b034981bba9509081f04.jpg",
    "ssmlSupported": true,
    "instructSupported": false,
    "timestampSupported": true,
    "previewAudioUrl": "/audio/voices/cosyvoice-v3/longshange_v3.mp3",
    "accent": "陕西话",
    "gender": "男声"
  },
  {
    "id": "sys-longanmin_v3",
    "providerVoiceId": "longanmin_v3",
    "name": "邵沐柔",
    "type": "SYSTEM",
    "targetModel": "cosyvoice-v3-flash",
    "supportedModels": [
      "cosyvoice-v3-flash",
      "cosyvoice-v3-plus"
    ],
    "sourceModels": [
      "cosyvoice-v3-flash"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "闽南语",
      "其他英语"
    ],
    "description": "方言 · 清纯萝莉女",
    "trait": "清纯萝莉女",
    "scene": "方言",
    "age": "18~25岁",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/cosy-longanmin_v3-21d20229d2-v6-add5829ec6285137b325.jpg",
    "ssmlSupported": true,
    "instructSupported": false,
    "timestampSupported": true,
    "previewAudioUrl": "/audio/voices/cosyvoice-v3/longanmin_v3.mp3",
    "accent": "闽南语",
    "gender": "女声"
  },
  {
    "id": "sys-loongkyong_v3",
    "providerVoiceId": "loongkyong_v3",
    "name": "赵允熙",
    "type": "SYSTEM",
    "targetModel": "cosyvoice-v3-flash",
    "supportedModels": [
      "cosyvoice-v3-flash",
      "cosyvoice-v3-plus"
    ],
    "sourceModels": [
      "cosyvoice-v3-flash"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "韩语",
    "languages": [
      "韩语"
    ],
    "description": "出海营销 · 韩语女",
    "trait": "韩语女",
    "scene": "出海营销",
    "age": "25~30岁",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/cosy-loongkyong_v3-fb416a83cd-v6-1daf844830fc807a6e2e.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "/audio/voices/cosyvoice-v3/loongkyong_v3.mp3",
    "accent": "标准韩语",
    "gender": "女声"
  },
  {
    "id": "sys-loongriko_v3",
    "providerVoiceId": "loongriko_v3",
    "name": "星野莉央",
    "type": "SYSTEM",
    "targetModel": "cosyvoice-v3-flash",
    "supportedModels": [
      "cosyvoice-v3-flash",
      "cosyvoice-v3-plus"
    ],
    "sourceModels": [
      "cosyvoice-v3-flash"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "日语",
    "languages": [
      "日语"
    ],
    "description": "出海营销 · 二次元霓虹女",
    "trait": "二次元霓虹女",
    "scene": "出海营销",
    "age": "18~25岁",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/cosy-loongriko_v3-871b7d7bd4-v6-fb774c2d943a0260973c.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "/audio/voices/cosyvoice-v3/loongriko_v3.mp3",
    "accent": "标准日语",
    "gender": "女声"
  },
  {
    "id": "sys-loongtomoka_v3",
    "providerVoiceId": "loongtomoka_v3",
    "name": "小泽知花",
    "type": "SYSTEM",
    "targetModel": "cosyvoice-v3-flash",
    "supportedModels": [
      "cosyvoice-v3-flash",
      "cosyvoice-v3-plus"
    ],
    "sourceModels": [
      "cosyvoice-v3-flash"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "日语",
    "languages": [
      "日语"
    ],
    "description": "出海营销 · 日语女",
    "trait": "日语女",
    "scene": "出海营销",
    "age": "30~35岁",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/cosy-loongtomoka_v3-d869588c5e-v6-70bf167e4723ce79cded.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "/audio/voices/cosyvoice-v3/loongtomoka_v3.mp3",
    "accent": "标准日语",
    "gender": "女声"
  },
  {
    "id": "sys-loongabby_v3",
    "providerVoiceId": "loongabby_v3",
    "name": "阿比盖尔Abigail",
    "type": "SYSTEM",
    "targetModel": "cosyvoice-v3-flash",
    "supportedModels": [
      "cosyvoice-v3-flash",
      "cosyvoice-v3-plus"
    ],
    "sourceModels": [
      "cosyvoice-v3-flash"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "英语",
    "languages": [
      "美式英语"
    ],
    "description": "出海营销 · 美式英文女",
    "trait": "美式英文女",
    "scene": "出海营销",
    "age": "30~35岁",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/cosy-loongabby_v3-da910312e5-v6-0806bc10685e98228afb.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "/audio/voices/cosyvoice-v3/loongabby_v3.wav",
    "accent": "美式英语",
    "gender": "女声"
  },
  {
    "id": "sys-loongandy_v3",
    "providerVoiceId": "loongandy_v3",
    "name": "安德鲁Andrew",
    "type": "SYSTEM",
    "targetModel": "cosyvoice-v3-flash",
    "supportedModels": [
      "cosyvoice-v3-flash",
      "cosyvoice-v3-plus"
    ],
    "sourceModels": [
      "cosyvoice-v3-flash"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "英语",
    "languages": [
      "美式英语"
    ],
    "description": "出海营销 · 美式英文男",
    "trait": "美式英文男",
    "scene": "出海营销",
    "age": "30~35岁",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/cosy-loongandy_v3-a7e3d27f59-v6-b7ea83ae8c72fd3717d4.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "/audio/voices/cosyvoice-v3/loongandy_v3.wav",
    "accent": "美式英语",
    "gender": "男声"
  },
  {
    "id": "sys-loongannie_v3",
    "providerVoiceId": "loongannie_v3",
    "name": "安妮Annie",
    "type": "SYSTEM",
    "targetModel": "cosyvoice-v3-flash",
    "supportedModels": [
      "cosyvoice-v3-flash",
      "cosyvoice-v3-plus"
    ],
    "sourceModels": [
      "cosyvoice-v3-flash"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "英语",
    "languages": [
      "美式英语"
    ],
    "description": "出海营销 · 美式英文女",
    "trait": "美式英文女",
    "scene": "出海营销",
    "age": "30~35岁",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/cosy-loongannie_v3-a204d3ecb6-v6-721a1f6dd015dd8b26e0.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "/audio/voices/cosyvoice-v3/loongannie_v3.wav",
    "accent": "美式英语",
    "gender": "女声"
  },
  {
    "id": "sys-loongava_v3",
    "providerVoiceId": "loongava_v3",
    "name": "艾娃Ava",
    "type": "SYSTEM",
    "targetModel": "cosyvoice-v3-flash",
    "supportedModels": [
      "cosyvoice-v3-flash",
      "cosyvoice-v3-plus"
    ],
    "sourceModels": [
      "cosyvoice-v3-flash"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "英语",
    "languages": [
      "美式英语"
    ],
    "description": "出海营销 · 美式英文女",
    "trait": "美式英文女",
    "scene": "出海营销",
    "age": "35~40岁",
    "ageCategory": "中年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/cosy-loongava_v3-636de3b15b-v6-32a61f2f23fdb9203e54.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "/audio/voices/cosyvoice-v3/loongava_v3.wav",
    "accent": "美式英语",
    "gender": "女声"
  },
  {
    "id": "sys-loongbeth_v3",
    "providerVoiceId": "loongbeth_v3",
    "name": "贝丝Beth",
    "type": "SYSTEM",
    "targetModel": "cosyvoice-v3-flash",
    "supportedModels": [
      "cosyvoice-v3-flash",
      "cosyvoice-v3-plus"
    ],
    "sourceModels": [
      "cosyvoice-v3-flash"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "英语",
    "languages": [
      "美式英语"
    ],
    "description": "出海营销 · 美式英文女",
    "trait": "美式英文女",
    "scene": "出海营销",
    "age": "35~40岁",
    "ageCategory": "中年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/cosy-loongbeth_v3-5f8fde01ca-v6-e431849b9b58381ec914.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "/audio/voices/cosyvoice-v3/loongbeth_v3.wav",
    "accent": "美式英语",
    "gender": "女声"
  },
  {
    "id": "sys-loongbetty_v3",
    "providerVoiceId": "loongbetty_v3",
    "name": "贝蒂Betty",
    "type": "SYSTEM",
    "targetModel": "cosyvoice-v3-flash",
    "supportedModels": [
      "cosyvoice-v3-flash",
      "cosyvoice-v3-plus"
    ],
    "sourceModels": [
      "cosyvoice-v3-flash"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "英语",
    "languages": [
      "美式英语"
    ],
    "description": "出海营销 · 美式英文女",
    "trait": "美式英文女",
    "scene": "出海营销",
    "age": "35~40岁",
    "ageCategory": "中年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/cosy-loongbetty_v3-2a17915e16-v6-289ba1d43a580f278867.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "/audio/voices/cosyvoice-v3/loongbetty_v3.wav",
    "accent": "美式英语",
    "gender": "女声"
  },
  {
    "id": "sys-loongcally_v3",
    "providerVoiceId": "loongcally_v3",
    "name": "凯莉Callie",
    "type": "SYSTEM",
    "targetModel": "cosyvoice-v3-flash",
    "supportedModels": [
      "cosyvoice-v3-flash",
      "cosyvoice-v3-plus"
    ],
    "sourceModels": [
      "cosyvoice-v3-flash"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "英语",
    "languages": [
      "美式英语"
    ],
    "description": "出海营销 · 美式英文女",
    "trait": "美式英文女",
    "scene": "出海营销",
    "age": "25~30岁",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/cosy-loongcally_v3-cdab4e6d9f-v6-1375366a80f0a126d41f.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "/audio/voices/cosyvoice-v3/loongcally_v3.wav",
    "accent": "美式英语",
    "gender": "女声"
  },
  {
    "id": "sys-loongcindy_v3",
    "providerVoiceId": "loongcindy_v3",
    "name": "辛迪Cindy",
    "type": "SYSTEM",
    "targetModel": "cosyvoice-v3-flash",
    "supportedModels": [
      "cosyvoice-v3-flash",
      "cosyvoice-v3-plus"
    ],
    "sourceModels": [
      "cosyvoice-v3-flash"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "英语",
    "languages": [
      "美式英语"
    ],
    "description": "出海营销 · 美式英文女",
    "trait": "美式英文女",
    "scene": "出海营销",
    "age": "30~35岁",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/cosy-loongcindy_v3-8f17cbb93e-v6-9d4a5dbfb66bf8c24459.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "/audio/voices/cosyvoice-v3/loongcindy_v3.wav",
    "accent": "美式英语",
    "gender": "女声"
  },
  {
    "id": "sys-loongdavid_v3",
    "providerVoiceId": "loongdavid_v3",
    "name": "戴维德David",
    "type": "SYSTEM",
    "targetModel": "cosyvoice-v3-flash",
    "supportedModels": [
      "cosyvoice-v3-flash",
      "cosyvoice-v3-plus"
    ],
    "sourceModels": [
      "cosyvoice-v3-flash"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "英语",
    "languages": [
      "美式英语"
    ],
    "description": "出海营销 · 美式英文男",
    "trait": "美式英文男",
    "scene": "出海营销",
    "age": "35~40岁",
    "ageCategory": "中年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/cosy-loongdavid_v3-508b1939bd-v6-10ec77d138a1e2ee1488.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "/audio/voices/cosyvoice-v3/loongdavid_v3.wav",
    "accent": "美式英语",
    "gender": "男声"
  },
  {
    "id": "sys-loongdonna_v3",
    "providerVoiceId": "loongdonna_v3",
    "name": "多娜Donna",
    "type": "SYSTEM",
    "targetModel": "cosyvoice-v3-flash",
    "supportedModels": [
      "cosyvoice-v3-flash",
      "cosyvoice-v3-plus"
    ],
    "sourceModels": [
      "cosyvoice-v3-flash"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "英语",
    "languages": [
      "美式英语"
    ],
    "description": "出海营销 · 美式英文女",
    "trait": "美式英文女",
    "scene": "出海营销",
    "age": "35~40岁",
    "ageCategory": "中年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/cosy-loongdonna_v3-9783ce3e9f-v6-46c48afa3efcdd77d28c.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "/audio/voices/cosyvoice-v3/loongdonna_v3.wav",
    "accent": "美式英语",
    "gender": "女声"
  },
  {
    "id": "sys-loongemily_v3",
    "providerVoiceId": "loongemily_v3",
    "name": "艾米莉Emily",
    "type": "SYSTEM",
    "targetModel": "cosyvoice-v3-flash",
    "supportedModels": [
      "cosyvoice-v3-flash",
      "cosyvoice-v3-plus"
    ],
    "sourceModels": [
      "cosyvoice-v3-flash"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "英语",
    "languages": [
      "英式英语"
    ],
    "description": "出海营销 · 英式英文女",
    "trait": "英式英文女",
    "scene": "出海营销",
    "age": "35~40岁",
    "ageCategory": "中年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/cosy-loongemily_v3-f720731591-v6-e80d3e43f7f1eb4cf045.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "/audio/voices/cosyvoice-v3/loongemily_v3.wav",
    "accent": "英式英语",
    "gender": "女声"
  },
  {
    "id": "sys-loongeric_v3",
    "providerVoiceId": "loongeric_v3",
    "name": "埃里克Eric",
    "type": "SYSTEM",
    "targetModel": "cosyvoice-v3-flash",
    "supportedModels": [
      "cosyvoice-v3-flash",
      "cosyvoice-v3-plus"
    ],
    "sourceModels": [
      "cosyvoice-v3-flash"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "英语",
    "languages": [
      "美式英语"
    ],
    "description": "出海营销 · 英文男声",
    "trait": "英文男声",
    "scene": "出海营销",
    "age": "35~40岁",
    "ageCategory": "中年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/cosy-loongeric_v3-5d55aa436e-v6-90d6cb43d9cfad298b88.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "/audio/voices/cosyvoice-v3/loongeric_v3.wav",
    "accent": "美式英语",
    "gender": "男声"
  },
  {
    "id": "sys-loongluna_v3",
    "providerVoiceId": "loongluna_v3",
    "name": "露娜Luna",
    "type": "SYSTEM",
    "targetModel": "cosyvoice-v3-flash",
    "supportedModels": [
      "cosyvoice-v3-flash",
      "cosyvoice-v3-plus"
    ],
    "sourceModels": [
      "cosyvoice-v3-flash"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "英语",
    "languages": [
      "英式英语"
    ],
    "description": "出海营销 · 英式英文女",
    "trait": "英式英文女",
    "scene": "出海营销",
    "age": "35~40岁",
    "ageCategory": "中年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/cosy-loongluna_v3-71b3b1aa0f-v6-217e6ec5102072f681ab.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "/audio/voices/cosyvoice-v3/loongluna_v3.wav",
    "accent": "英式英语",
    "gender": "女声"
  },
  {
    "id": "sys-loongluca_v3",
    "providerVoiceId": "loongluca_v3",
    "name": "卢卡Luca",
    "type": "SYSTEM",
    "targetModel": "cosyvoice-v3-flash",
    "supportedModels": [
      "cosyvoice-v3-flash",
      "cosyvoice-v3-plus"
    ],
    "sourceModels": [
      "cosyvoice-v3-flash"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "英语",
    "languages": [
      "其他英语"
    ],
    "description": "出海营销 · 英文男声",
    "trait": "英文男声",
    "scene": "出海营销",
    "age": "25~30岁",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/cosy-loongluca_v3-19f052a396-v6-71aad80cedf1916c1cab.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "/audio/voices/cosyvoice-v3/loongluca_v3.wav",
    "accent": "其他",
    "gender": "男声"
  },
  {
    "id": "sys-loongtomoya_v3",
    "providerVoiceId": "loongtomoya_v3",
    "name": "森川拓海",
    "type": "SYSTEM",
    "targetModel": "cosyvoice-v3-flash",
    "supportedModels": [
      "cosyvoice-v3-flash",
      "cosyvoice-v3-plus"
    ],
    "sourceModels": [
      "cosyvoice-v3-flash"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "日语",
    "languages": [
      "日语"
    ],
    "description": "出海营销 · 日语男",
    "trait": "日语男",
    "scene": "出海营销",
    "age": "30~35岁",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/cosy-loongtomoya_v3-8180f8ad0c-v6-aa7b16b87f88cd26a878.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "/audio/voices/cosyvoice-v3/loongtomoya_v3.wav",
    "accent": "标准日语",
    "gender": "男声"
  },
  {
    "id": "sys-loongyuuna_v3",
    "providerVoiceId": "loongyuuna_v3",
    "name": "岩田结奈",
    "type": "SYSTEM",
    "targetModel": "cosyvoice-v3-flash",
    "supportedModels": [
      "cosyvoice-v3-flash",
      "cosyvoice-v3-plus"
    ],
    "sourceModels": [
      "cosyvoice-v3-flash"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "日语",
    "languages": [
      "日语"
    ],
    "description": "出海营销 · 日语女",
    "trait": "日语女",
    "scene": "出海营销",
    "age": "18~25岁",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/cosy-loongyuuna_v3-e279e123da-v6-97bf8e6f369341227685.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "/audio/voices/cosyvoice-v3/loongyuuna_v3.wav",
    "accent": "标准日语",
    "gender": "女声"
  },
  {
    "id": "sys-loongyuuma_v3",
    "providerVoiceId": "loongyuuma_v3",
    "name": "高梨悠斗",
    "type": "SYSTEM",
    "targetModel": "cosyvoice-v3-flash",
    "supportedModels": [
      "cosyvoice-v3-flash",
      "cosyvoice-v3-plus"
    ],
    "sourceModels": [
      "cosyvoice-v3-flash"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "日语",
    "languages": [
      "日语"
    ],
    "description": "出海营销 · 日语男",
    "trait": "日语男",
    "scene": "出海营销",
    "age": "20~25岁",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/cosy-loongyuuma_v3-6ef99ad9d5-v6-4a15374da9e3002169be.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "/audio/voices/cosyvoice-v3/loongyuuma_v3.wav",
    "accent": "标准日语",
    "gender": "男声"
  },
  {
    "id": "sys-loongjihun_v3",
    "providerVoiceId": "loongjihun_v3",
    "name": "姜道元",
    "type": "SYSTEM",
    "targetModel": "cosyvoice-v3-flash",
    "supportedModels": [
      "cosyvoice-v3-flash",
      "cosyvoice-v3-plus"
    ],
    "sourceModels": [
      "cosyvoice-v3-flash"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "韩语",
    "languages": [
      "韩语"
    ],
    "description": "出海营销 · 韩语男",
    "trait": "韩语男",
    "scene": "出海营销",
    "age": "25~30岁",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/cosy-loongjihun_v3-055c64bf1b-v6-21d6b8ec225d442db6c1.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "/audio/voices/cosyvoice-v3/loongjihun_v3.wav",
    "accent": "标准韩语",
    "gender": "男声"
  },
  {
    "id": "sys-loongindah_v3",
    "providerVoiceId": "loongindah_v3",
    "name": "Nadia Prameswari",
    "type": "SYSTEM",
    "targetModel": "cosyvoice-v3-flash",
    "supportedModels": [
      "cosyvoice-v3-flash",
      "cosyvoice-v3-plus"
    ],
    "sourceModels": [
      "cosyvoice-v3-flash"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "印尼语",
    "languages": [],
    "description": "出海营销 · 印尼女",
    "trait": "印尼女",
    "scene": "出海营销",
    "age": "22~27岁",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/cosy-loongindah_v3-903db81e9e-v6-e41337325a822173934c.jpg",
    "ssmlSupported": false,
    "instructSupported": false,
    "timestampSupported": false,
    "previewAudioUrl": "/audio/voices/cosyvoice-v3/loongindah_v3.wav",
    "accent": "标准印尼语",
    "gender": "女声"
  },
  {
    "id": "sys-longfei_v3",
    "providerVoiceId": "longfei_v3",
    "name": "莫景朗",
    "type": "SYSTEM",
    "targetModel": "cosyvoice-v3-flash",
    "supportedModels": [
      "cosyvoice-v3-flash",
      "cosyvoice-v3-plus"
    ],
    "sourceModels": [
      "cosyvoice-v3-flash"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话",
      "美式英语"
    ],
    "description": "诗词朗诵 · 热血磁性男",
    "trait": "热血磁性男",
    "scene": "诗词朗诵",
    "age": "30~35岁",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/cosy-longfei_v3-7a5c171349-v6-59fc95588b7d44889a60.jpg",
    "ssmlSupported": true,
    "instructSupported": false,
    "timestampSupported": true,
    "previewAudioUrl": "/audio/voices/cosyvoice-v3/longfei_v3.mp3",
    "accent": "普通话",
    "gender": "男声"
  },
  {
    "id": "sys-longyingxiao_v3",
    "providerVoiceId": "longyingxiao_v3",
    "name": "孟映彤",
    "type": "SYSTEM",
    "targetModel": "cosyvoice-v3-flash",
    "supportedModels": [
      "cosyvoice-v3-flash",
      "cosyvoice-v3-plus"
    ],
    "sourceModels": [
      "cosyvoice-v3-flash"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话",
      "美式英语"
    ],
    "description": "电话销售 · 清甜推销女",
    "trait": "清甜推销女",
    "scene": "电话销售",
    "age": "20~25岁",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/cosy-longyingxiao_v3-2a6b0cace6-v6-fdb8259b89ca0ad83ad2.jpg",
    "ssmlSupported": true,
    "instructSupported": false,
    "timestampSupported": true,
    "previewAudioUrl": "/audio/voices/cosyvoice-v3/longyingxiao_v3.mp3",
    "accent": "普通话",
    "gender": "女声"
  },
  {
    "id": "sys-longyingxun_v3",
    "providerVoiceId": "longyingxun_v3",
    "name": "贺怀瑾",
    "type": "SYSTEM",
    "targetModel": "cosyvoice-v3-flash",
    "supportedModels": [
      "cosyvoice-v3-flash",
      "cosyvoice-v3-plus"
    ],
    "sourceModels": [
      "cosyvoice-v3-flash"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话",
      "美式英语"
    ],
    "description": "客服 · 年轻青涩男",
    "trait": "年轻青涩男",
    "scene": "客服",
    "age": "20~25岁",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/cosy-longyingxun_v3-d89885cbb3-v6-3b008f6fc4e785c642ed.jpg",
    "ssmlSupported": true,
    "instructSupported": false,
    "timestampSupported": true,
    "previewAudioUrl": "/audio/voices/cosyvoice-v3/longyingxun_v3.mp3",
    "accent": "普通话",
    "gender": "男声"
  },
  {
    "id": "sys-longyingjing_v3",
    "providerVoiceId": "longyingjing_v3",
    "name": "宋知遥",
    "type": "SYSTEM",
    "targetModel": "cosyvoice-v3-flash",
    "supportedModels": [
      "cosyvoice-v3-flash",
      "cosyvoice-v3-plus"
    ],
    "sourceModels": [
      "cosyvoice-v3-flash"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话",
      "美式英语"
    ],
    "description": "客服 · 低调冷静女",
    "trait": "低调冷静女",
    "scene": "客服",
    "age": "25~35岁",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/cosy-longyingjing_v3-4fbfc546bb-v6-b0e2f3e903b097c4cedc.jpg",
    "ssmlSupported": true,
    "instructSupported": false,
    "timestampSupported": true,
    "previewAudioUrl": "/audio/voices/cosyvoice-v3/longyingjing_v3.mp3",
    "accent": "普通话",
    "gender": "女声"
  },
  {
    "id": "sys-longyingling_v3",
    "providerVoiceId": "longyingling_v3",
    "name": "袁清妍",
    "type": "SYSTEM",
    "targetModel": "cosyvoice-v3-flash",
    "supportedModels": [
      "cosyvoice-v3-flash",
      "cosyvoice-v3-plus"
    ],
    "sourceModels": [
      "cosyvoice-v3-flash"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话",
      "美式英语"
    ],
    "description": "客服 · 温和共情女",
    "trait": "温和共情女",
    "scene": "客服",
    "age": "25~30岁",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/cosy-longyingling_v3-a56a6fd071-v6-21787b87fd9441baaf78.jpg",
    "ssmlSupported": true,
    "instructSupported": false,
    "timestampSupported": true,
    "previewAudioUrl": "/audio/voices/cosyvoice-v3/longyingling_v3.mp3",
    "accent": "普通话",
    "gender": "女声"
  },
  {
    "id": "sys-longyingtao_v3",
    "providerVoiceId": "longyingtao_v3",
    "name": "阮知微",
    "type": "SYSTEM",
    "targetModel": "cosyvoice-v3-flash",
    "supportedModels": [
      "cosyvoice-v3-flash",
      "cosyvoice-v3-plus"
    ],
    "sourceModels": [
      "cosyvoice-v3-flash"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话",
      "美式英语"
    ],
    "description": "客服 · 温柔淡定女",
    "trait": "温柔淡定女",
    "scene": "客服",
    "age": "25~30岁",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/cosy-longyingtao_v3-e8ea8c7605-v6-f01211857254af60f885.jpg",
    "ssmlSupported": true,
    "instructSupported": false,
    "timestampSupported": true,
    "previewAudioUrl": "/audio/voices/cosyvoice-v3/longyingtao_v3.mp3",
    "accent": "普通话",
    "gender": "女声"
  },
  {
    "id": "sys-longxiaochun_v3",
    "providerVoiceId": "longxiaochun_v3",
    "name": "孟念安",
    "type": "SYSTEM",
    "targetModel": "cosyvoice-v3-flash",
    "supportedModels": [
      "cosyvoice-v3-flash",
      "cosyvoice-v3-plus"
    ],
    "sourceModels": [
      "cosyvoice-v3-flash"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话",
      "美式英语"
    ],
    "description": "语音助手 · 知性积极女",
    "trait": "知性积极女",
    "scene": "语音助手",
    "age": "25~30岁",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/cosy-longxiaochun_v3-8d0938d9d9-v6-be7d152cb7d22393f191.jpg",
    "ssmlSupported": true,
    "instructSupported": false,
    "timestampSupported": true,
    "previewAudioUrl": "/audio/voices/cosyvoice-v3/longxiaochun_v3.mp3",
    "accent": "普通话",
    "gender": "女声"
  },
  {
    "id": "sys-longxiaoxia_v3",
    "providerVoiceId": "longxiaoxia_v3",
    "name": "傅容昭",
    "type": "SYSTEM",
    "targetModel": "cosyvoice-v3-flash",
    "supportedModels": [
      "cosyvoice-v3-flash",
      "cosyvoice-v3-plus"
    ],
    "sourceModels": [
      "cosyvoice-v3-flash"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话",
      "美式英语"
    ],
    "description": "语音助手 · 沉稳权威女",
    "trait": "沉稳权威女",
    "scene": "语音助手",
    "age": "25~30岁",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/cosy-longxiaoxia_v3-2d03f4a3c8-v6-7d17742577574f12148f.jpg",
    "ssmlSupported": true,
    "instructSupported": false,
    "timestampSupported": true,
    "previewAudioUrl": "/audio/voices/cosyvoice-v3/longxiaoxia_v3.mp3",
    "accent": "普通话",
    "gender": "女声"
  },
  {
    "id": "sys-longyumi_v3",
    "providerVoiceId": "longyumi_v3",
    "name": "唐依澄",
    "type": "SYSTEM",
    "targetModel": "cosyvoice-v3-flash",
    "supportedModels": [
      "cosyvoice-v3-flash",
      "cosyvoice-v3-plus"
    ],
    "sourceModels": [
      "cosyvoice-v3-flash"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话",
      "美式英语"
    ],
    "description": "语音助手 · 正经青年女",
    "trait": "正经青年女",
    "scene": "语音助手",
    "age": "20~25岁",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/cosy-longyumi_v3-e237aaa4a9-v6-e81af74cb97567f3f584.jpg",
    "ssmlSupported": true,
    "instructSupported": false,
    "timestampSupported": true,
    "previewAudioUrl": "/audio/voices/cosyvoice-v3/longyumi_v3.mp3",
    "accent": "普通话",
    "gender": "女声"
  },
  {
    "id": "sys-longanyun_v3",
    "providerVoiceId": "longanyun_v3",
    "name": "姜书珩",
    "type": "SYSTEM",
    "targetModel": "cosyvoice-v3-flash",
    "supportedModels": [
      "cosyvoice-v3-flash",
      "cosyvoice-v3-plus"
    ],
    "sourceModels": [
      "cosyvoice-v3-flash"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话",
      "美式英语"
    ],
    "description": "语音助手 · 居家暖男",
    "trait": "居家暖男",
    "scene": "语音助手",
    "age": "30~35岁",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/cosy-longanyun_v3-cec5d1bbcc-v6-41e7b16ece4902eac42f.jpg",
    "ssmlSupported": true,
    "instructSupported": false,
    "timestampSupported": true,
    "previewAudioUrl": "/audio/voices/cosyvoice-v3/longanyun_v3.mp3",
    "accent": "普通话",
    "gender": "男声"
  },
  {
    "id": "sys-longanwen_v3",
    "providerVoiceId": "longanwen_v3",
    "name": "章舒宁",
    "type": "SYSTEM",
    "targetModel": "cosyvoice-v3-flash",
    "supportedModels": [
      "cosyvoice-v3-flash",
      "cosyvoice-v3-plus"
    ],
    "sourceModels": [
      "cosyvoice-v3-flash"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话",
      "美式英语"
    ],
    "description": "语音助手 · 优雅知性女",
    "trait": "优雅知性女",
    "scene": "语音助手",
    "age": "25~35岁",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/cosy-longanwen_v3-aba77696ad-v6-35bab4edf662ee609948.jpg",
    "ssmlSupported": true,
    "instructSupported": false,
    "timestampSupported": true,
    "previewAudioUrl": "/audio/voices/cosyvoice-v3/longanwen_v3.mp3",
    "accent": "普通话",
    "gender": "女声"
  },
  {
    "id": "sys-longanli_v3",
    "providerVoiceId": "longanli_v3",
    "name": "钟书禾",
    "type": "SYSTEM",
    "targetModel": "cosyvoice-v3-flash",
    "supportedModels": [
      "cosyvoice-v3-flash",
      "cosyvoice-v3-plus"
    ],
    "sourceModels": [
      "cosyvoice-v3-flash"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话",
      "美式英语"
    ],
    "description": "语音助手 · 利落从容女",
    "trait": "利落从容女",
    "scene": "语音助手",
    "age": "25~35岁",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/cosy-longanli_v3-bf3d3714ba-v6-05a1743d422dd75d098d.jpg",
    "ssmlSupported": true,
    "instructSupported": false,
    "timestampSupported": true,
    "previewAudioUrl": "/audio/voices/cosyvoice-v3/longanli_v3.mp3",
    "accent": "普通话",
    "gender": "女声"
  },
  {
    "id": "sys-longanlang_v3",
    "providerVoiceId": "longanlang_v3",
    "name": "薛宁远",
    "type": "SYSTEM",
    "targetModel": "cosyvoice-v3-flash",
    "supportedModels": [
      "cosyvoice-v3-flash",
      "cosyvoice-v3-plus"
    ],
    "sourceModels": [
      "cosyvoice-v3-flash"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话",
      "美式英语"
    ],
    "description": "语音助手 · 清爽利落男",
    "trait": "清爽利落男",
    "scene": "语音助手",
    "age": "20~25岁",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/cosy-longanlang_v3-2903fea872-v6-ad888582858883fea821.jpg",
    "ssmlSupported": true,
    "instructSupported": false,
    "timestampSupported": true,
    "previewAudioUrl": "/audio/voices/cosyvoice-v3/longanlang_v3.mp3",
    "accent": "普通话",
    "gender": "男声"
  },
  {
    "id": "sys-longyingmu_v3",
    "providerVoiceId": "longyingmu_v3",
    "name": "盛宛清",
    "type": "SYSTEM",
    "targetModel": "cosyvoice-v3-flash",
    "supportedModels": [
      "cosyvoice-v3-flash",
      "cosyvoice-v3-plus"
    ],
    "sourceModels": [
      "cosyvoice-v3-flash"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话",
      "美式英语"
    ],
    "description": "语音助手 · 优雅知性女",
    "trait": "优雅知性女",
    "scene": "语音助手",
    "age": "25~30岁",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/cosy-longyingmu_v3-2c5f6560ca-v6-7d322d4ad756d89bb215.jpg",
    "ssmlSupported": true,
    "instructSupported": false,
    "timestampSupported": true,
    "previewAudioUrl": "/audio/voices/cosyvoice-v3/longyingmu_v3.mp3",
    "accent": "普通话",
    "gender": "女声"
  },
  {
    "id": "sys-longantai_v3",
    "providerVoiceId": "longantai_v3",
    "name": "盛星妍",
    "type": "SYSTEM",
    "targetModel": "cosyvoice-v3-flash",
    "supportedModels": [
      "cosyvoice-v3-flash",
      "cosyvoice-v3-plus"
    ],
    "sourceModels": [
      "cosyvoice-v3-flash"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话",
      "美式英语"
    ],
    "description": "社交陪伴 · 嗲甜台湾女",
    "trait": "嗲甜台湾女",
    "scene": "社交陪伴",
    "age": "20~25岁",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/cosy-longantai_v3-0fef9ed298-v6-7cad5adb5a76b84ea4e3.jpg",
    "ssmlSupported": true,
    "instructSupported": false,
    "timestampSupported": true,
    "previewAudioUrl": "/audio/voices/cosyvoice-v3/longantai_v3.mp3",
    "accent": "普通话",
    "gender": "女声"
  },
  {
    "id": "sys-longhua_v3",
    "providerVoiceId": "longhua_v3",
    "name": "夏若晴",
    "type": "SYSTEM",
    "targetModel": "cosyvoice-v3-flash",
    "supportedModels": [
      "cosyvoice-v3-flash",
      "cosyvoice-v3-plus"
    ],
    "sourceModels": [
      "cosyvoice-v3-flash"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话",
      "美式英语"
    ],
    "description": "社交陪伴 · 元气甜美女",
    "trait": "元气甜美女",
    "scene": "社交陪伴",
    "age": "20~25岁",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/cosy-longhua_v3-3c1ef224ba-v6-8ee6b9ce6196a98d80c6.jpg",
    "ssmlSupported": true,
    "instructSupported": false,
    "timestampSupported": true,
    "previewAudioUrl": "/audio/voices/cosyvoice-v3/longhua_v3.mp3",
    "accent": "普通话",
    "gender": "女声"
  },
  {
    "id": "sys-longcheng_v3",
    "providerVoiceId": "longcheng_v3",
    "name": "阮云澈",
    "type": "SYSTEM",
    "targetModel": "cosyvoice-v3-flash",
    "supportedModels": [
      "cosyvoice-v3-flash",
      "cosyvoice-v3-plus"
    ],
    "sourceModels": [
      "cosyvoice-v3-flash"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话",
      "美式英语"
    ],
    "description": "社交陪伴 · 智慧青年男",
    "trait": "智慧青年男",
    "scene": "社交陪伴",
    "age": "20~25岁",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/cosy-longcheng_v3-52ea9e42c6-v6-48e9abe162b270afc3f8.jpg",
    "ssmlSupported": true,
    "instructSupported": false,
    "timestampSupported": true,
    "previewAudioUrl": "/audio/voices/cosyvoice-v3/longcheng_v3.mp3",
    "accent": "普通话",
    "gender": "男声"
  },
  {
    "id": "sys-longze_v3",
    "providerVoiceId": "longze_v3",
    "name": "曹星扬",
    "type": "SYSTEM",
    "targetModel": "cosyvoice-v3-flash",
    "supportedModels": [
      "cosyvoice-v3-flash",
      "cosyvoice-v3-plus"
    ],
    "sourceModels": [
      "cosyvoice-v3-flash"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话",
      "美式英语"
    ],
    "description": "社交陪伴 · 温暖元气男",
    "trait": "温暖元气男",
    "scene": "社交陪伴",
    "age": "25~30岁",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/cosy-longze_v3-08bbaf48a3-v6-0d46d4e359fc850a2bfd.jpg",
    "ssmlSupported": true,
    "instructSupported": false,
    "timestampSupported": true,
    "previewAudioUrl": "/audio/voices/cosyvoice-v3/longze_v3.mp3",
    "accent": "普通话",
    "gender": "男声"
  },
  {
    "id": "sys-longzhe_v3",
    "providerVoiceId": "longzhe_v3",
    "name": "叶景安",
    "type": "SYSTEM",
    "targetModel": "cosyvoice-v3-flash",
    "supportedModels": [
      "cosyvoice-v3-flash",
      "cosyvoice-v3-plus"
    ],
    "sourceModels": [
      "cosyvoice-v3-flash"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话",
      "美式英语"
    ],
    "description": "社交陪伴 · 呆板大暖男",
    "trait": "呆板大暖男",
    "scene": "社交陪伴",
    "age": "25~30岁",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/cosy-longzhe_v3-1ef522848f-v6-0ae5b90b45a6bfd81678.jpg",
    "ssmlSupported": true,
    "instructSupported": false,
    "timestampSupported": true,
    "previewAudioUrl": "/audio/voices/cosyvoice-v3/longzhe_v3.mp3",
    "accent": "普通话",
    "gender": "男声"
  },
  {
    "id": "sys-longyan_v3",
    "providerVoiceId": "longyan_v3",
    "name": "苏宁溪",
    "type": "SYSTEM",
    "targetModel": "cosyvoice-v3-flash",
    "supportedModels": [
      "cosyvoice-v3-flash",
      "cosyvoice-v3-plus"
    ],
    "sourceModels": [
      "cosyvoice-v3-flash"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话",
      "美式英语"
    ],
    "description": "社交陪伴 · 温暖春风女",
    "trait": "温暖春风女",
    "scene": "社交陪伴",
    "age": "30~35岁",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/cosy-longyan_v3-46c60e028b-v6-fd0391108a9cc0168819.jpg",
    "ssmlSupported": true,
    "instructSupported": false,
    "timestampSupported": true,
    "previewAudioUrl": "/audio/voices/cosyvoice-v3/longyan_v3.mp3",
    "accent": "普通话",
    "gender": "女声"
  },
  {
    "id": "sys-longxing_v3",
    "providerVoiceId": "longxing_v3",
    "name": "邵安芮",
    "type": "SYSTEM",
    "targetModel": "cosyvoice-v3-flash",
    "supportedModels": [
      "cosyvoice-v3-flash",
      "cosyvoice-v3-plus"
    ],
    "sourceModels": [
      "cosyvoice-v3-flash"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话",
      "美式英语"
    ],
    "description": "社交陪伴 · 温婉邻家女",
    "trait": "温婉邻家女",
    "scene": "社交陪伴",
    "age": "20~25岁",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/cosy-longxing_v3-0ba5c7a4d0-v6-ca07841ac96a90934032.jpg",
    "ssmlSupported": true,
    "instructSupported": false,
    "timestampSupported": true,
    "previewAudioUrl": "/audio/voices/cosyvoice-v3/longxing_v3.mp3",
    "accent": "普通话",
    "gender": "女声"
  },
  {
    "id": "sys-longtian_v3",
    "providerVoiceId": "longtian_v3",
    "name": "黎予舟",
    "type": "SYSTEM",
    "targetModel": "cosyvoice-v3-flash",
    "supportedModels": [
      "cosyvoice-v3-flash",
      "cosyvoice-v3-plus"
    ],
    "sourceModels": [
      "cosyvoice-v3-flash"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话",
      "美式英语"
    ],
    "description": "社交陪伴 · 磁性理智男",
    "trait": "磁性理智男",
    "scene": "社交陪伴",
    "age": "30~35岁",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/cosy-longtian_v3-65893c6214-v6-b1a26c2cb1c7823e0adb.jpg",
    "ssmlSupported": true,
    "instructSupported": false,
    "timestampSupported": true,
    "previewAudioUrl": "/audio/voices/cosyvoice-v3/longtian_v3.mp3",
    "accent": "普通话",
    "gender": "男声"
  },
  {
    "id": "sys-longwan_v3",
    "providerVoiceId": "longwan_v3",
    "name": "薛怀音",
    "type": "SYSTEM",
    "targetModel": "cosyvoice-v3-flash",
    "supportedModels": [
      "cosyvoice-v3-flash",
      "cosyvoice-v3-plus"
    ],
    "sourceModels": [
      "cosyvoice-v3-flash"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话",
      "美式英语"
    ],
    "description": "社交陪伴 · 细腻柔声女",
    "trait": "细腻柔声女",
    "scene": "社交陪伴",
    "age": "20~30岁",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/cosy-longwan_v3-68278ba3b9-v6-5a6d3c9aa82f5a9646e1.jpg",
    "ssmlSupported": true,
    "instructSupported": false,
    "timestampSupported": true,
    "previewAudioUrl": "/audio/voices/cosyvoice-v3/longwan_v3.mp3",
    "accent": "普通话",
    "gender": "女声"
  },
  {
    "id": "sys-longqiang_v3",
    "providerVoiceId": "longqiang_v3",
    "name": "卓静宜",
    "type": "SYSTEM",
    "targetModel": "cosyvoice-v3-flash",
    "supportedModels": [
      "cosyvoice-v3-flash",
      "cosyvoice-v3-plus"
    ],
    "sourceModels": [
      "cosyvoice-v3-flash"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话",
      "其他英语"
    ],
    "description": "社交陪伴 · 浪漫风情女",
    "trait": "浪漫风情女",
    "scene": "社交陪伴",
    "age": "30~35岁",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/cosy-longqiang_v3-343304e99e-v6-c25cb93f05352f5c3a6f.jpg",
    "ssmlSupported": true,
    "instructSupported": false,
    "timestampSupported": true,
    "previewAudioUrl": "/audio/voices/cosyvoice-v3/longqiang_v3.mp3",
    "accent": "普通话",
    "gender": "女声"
  },
  {
    "id": "sys-longfeifei_v3",
    "providerVoiceId": "longfeifei_v3",
    "name": "贺乐宁",
    "type": "SYSTEM",
    "targetModel": "cosyvoice-v3-flash",
    "supportedModels": [
      "cosyvoice-v3-flash",
      "cosyvoice-v3-plus"
    ],
    "sourceModels": [
      "cosyvoice-v3-flash"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话",
      "美式英语"
    ],
    "description": "社交陪伴 · 甜美娇气女",
    "trait": "甜美娇气女",
    "scene": "社交陪伴",
    "age": "20~25岁",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/cosy-longfeifei_v3-ef8654771c-v6-f81e00a7e18092297419.jpg",
    "ssmlSupported": true,
    "instructSupported": false,
    "timestampSupported": true,
    "previewAudioUrl": "/audio/voices/cosyvoice-v3/longfeifei_v3.mp3",
    "accent": "普通话",
    "gender": "女声"
  },
  {
    "id": "sys-longhao_v3",
    "providerVoiceId": "longhao_v3",
    "name": "姜知行",
    "type": "SYSTEM",
    "targetModel": "cosyvoice-v3-flash",
    "supportedModels": [
      "cosyvoice-v3-flash",
      "cosyvoice-v3-plus"
    ],
    "sourceModels": [
      "cosyvoice-v3-flash"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话",
      "美式英语"
    ],
    "description": "社交陪伴 · 多情忧郁男",
    "trait": "多情忧郁男",
    "scene": "社交陪伴",
    "age": "30~35岁",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/cosy-longhao_v3-3a1e8f2bcf-v6-22708661da5274a3a79c.jpg",
    "ssmlSupported": true,
    "instructSupported": false,
    "timestampSupported": true,
    "previewAudioUrl": "/audio/voices/cosyvoice-v3/longhao_v3.mp3",
    "accent": "普通话",
    "gender": "男声"
  },
  {
    "id": "sys-longanrou_v3",
    "providerVoiceId": "longanrou_v3",
    "name": "冉云汐",
    "type": "SYSTEM",
    "targetModel": "cosyvoice-v3-flash",
    "supportedModels": [
      "cosyvoice-v3-flash",
      "cosyvoice-v3-plus"
    ],
    "sourceModels": [
      "cosyvoice-v3-flash"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话",
      "美式英语"
    ],
    "description": "社交陪伴 · 温柔闺蜜女",
    "trait": "温柔闺蜜女",
    "scene": "社交陪伴",
    "age": "20~35岁",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/cosy-longanrou_v3-3895683905-v6-c31809a701d3e8e7d9cd.jpg",
    "ssmlSupported": true,
    "instructSupported": false,
    "timestampSupported": true,
    "previewAudioUrl": "/audio/voices/cosyvoice-v3/longanrou_v3.mp3",
    "accent": "普通话",
    "gender": "女声"
  },
  {
    "id": "sys-longhan_v3",
    "providerVoiceId": "longhan_v3",
    "name": "纪嘉言",
    "type": "SYSTEM",
    "targetModel": "cosyvoice-v3-flash",
    "supportedModels": [
      "cosyvoice-v3-flash",
      "cosyvoice-v3-plus"
    ],
    "sourceModels": [
      "cosyvoice-v3-flash"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话",
      "美式英语"
    ],
    "description": "社交陪伴 · 温暖痴情男",
    "trait": "温暖痴情男",
    "scene": "社交陪伴",
    "age": "30~35岁",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/cosy-longhan_v3-9a7b22aa68-v6-8a8af2ff3be518d38e6e.jpg",
    "ssmlSupported": true,
    "instructSupported": false,
    "timestampSupported": true,
    "previewAudioUrl": "/audio/voices/cosyvoice-v3/longhan_v3.mp3",
    "accent": "普通话",
    "gender": "男声"
  },
  {
    "id": "sys-longanzhi_v3",
    "providerVoiceId": "longanzhi_v3",
    "name": "冉砚舟",
    "type": "SYSTEM",
    "targetModel": "cosyvoice-v3-flash",
    "supportedModels": [
      "cosyvoice-v3-flash",
      "cosyvoice-v3-plus"
    ],
    "sourceModels": [
      "cosyvoice-v3-flash"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话",
      "美式英语"
    ],
    "description": "社交陪伴 · 睿智轻熟男",
    "trait": "睿智轻熟男",
    "scene": "社交陪伴",
    "age": "25~35岁",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/cosy-longanzhi_v3-fe662581f9-v6-270532c15ca1e45bdfa1.jpg",
    "ssmlSupported": true,
    "instructSupported": false,
    "timestampSupported": true,
    "previewAudioUrl": "/audio/voices/cosyvoice-v3/longanzhi_v3.mp3",
    "accent": "普通话",
    "gender": "男声"
  },
  {
    "id": "sys-longanling_v3",
    "providerVoiceId": "longanling_v3",
    "name": "沈诗遥",
    "type": "SYSTEM",
    "targetModel": "cosyvoice-v3-flash",
    "supportedModels": [
      "cosyvoice-v3-flash",
      "cosyvoice-v3-plus"
    ],
    "sourceModels": [
      "cosyvoice-v3-flash"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话",
      "美式英语"
    ],
    "description": "社交陪伴 · 思维灵动女",
    "trait": "思维灵动女",
    "scene": "社交陪伴",
    "age": "20~30岁",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/cosy-longanling_v3-e4f0b9f1a1-v6-ce945508347e95c279b8.jpg",
    "ssmlSupported": true,
    "instructSupported": false,
    "timestampSupported": true,
    "previewAudioUrl": "/audio/voices/cosyvoice-v3/longanling_v3.mp3",
    "accent": "普通话",
    "gender": "女声"
  },
  {
    "id": "sys-longanya_v3",
    "providerVoiceId": "longanya_v3",
    "name": "夏清瑶",
    "type": "SYSTEM",
    "targetModel": "cosyvoice-v3-flash",
    "supportedModels": [
      "cosyvoice-v3-flash",
      "cosyvoice-v3-plus"
    ],
    "sourceModels": [
      "cosyvoice-v3-flash"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话",
      "美式英语"
    ],
    "description": "社交陪伴 · 高雅气质女",
    "trait": "高雅气质女",
    "scene": "社交陪伴",
    "age": "25~35岁",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/cosy-longanya_v3-43f2f91e5d-v6-df938642b2673878ba7e.jpg",
    "ssmlSupported": true,
    "instructSupported": false,
    "timestampSupported": true,
    "previewAudioUrl": "/audio/voices/cosyvoice-v3/longanya_v3.mp3",
    "accent": "普通话",
    "gender": "女声"
  },
  {
    "id": "sys-longanqin_v3",
    "providerVoiceId": "longanqin_v3",
    "name": "方嘉悦",
    "type": "SYSTEM",
    "targetModel": "cosyvoice-v3-flash",
    "supportedModels": [
      "cosyvoice-v3-flash",
      "cosyvoice-v3-plus"
    ],
    "sourceModels": [
      "cosyvoice-v3-flash"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话",
      "美式英语"
    ],
    "description": "社交陪伴 · 亲和活泼女",
    "trait": "亲和活泼女",
    "scene": "社交陪伴",
    "age": "20~25岁",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/cosy-longanqin_v3-c491223760-v6-c3775693b98142886278.jpg",
    "ssmlSupported": true,
    "instructSupported": false,
    "timestampSupported": true,
    "previewAudioUrl": "/audio/voices/cosyvoice-v3/longanqin_v3.mp3",
    "accent": "普通话",
    "gender": "女声"
  },
  {
    "id": "sys-longmiao_v3",
    "providerVoiceId": "longmiao_v3",
    "name": "程予宁",
    "type": "SYSTEM",
    "targetModel": "cosyvoice-v3-flash",
    "supportedModels": [
      "cosyvoice-v3-flash",
      "cosyvoice-v3-plus"
    ],
    "sourceModels": [
      "cosyvoice-v3-flash"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话",
      "美式英语"
    ],
    "description": "有声书 · 抑扬顿挫女",
    "trait": "抑扬顿挫女",
    "scene": "有声书",
    "age": "25~30岁",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/cosy-longmiao_v3-1da0986b88-v6-f3e70b606680b4218a3f.jpg",
    "ssmlSupported": true,
    "instructSupported": false,
    "timestampSupported": true,
    "previewAudioUrl": "/audio/voices/cosyvoice-v3/longmiao_v3.mp3",
    "accent": "普通话",
    "gender": "女声"
  },
  {
    "id": "sys-longsanshu_v3",
    "providerVoiceId": "longsanshu_v3",
    "name": "黎峻衡",
    "type": "SYSTEM",
    "targetModel": "cosyvoice-v3-flash",
    "supportedModels": [
      "cosyvoice-v3-flash",
      "cosyvoice-v3-plus"
    ],
    "sourceModels": [
      "cosyvoice-v3-flash"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话",
      "美式英语"
    ],
    "description": "有声书 · 沉稳质感男",
    "trait": "沉稳质感男",
    "scene": "有声书",
    "age": "25~45岁",
    "ageCategory": "中年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/cosy-longsanshu_v3-4555cfcb21-v6-56c78cfc5fe61cde552d.jpg",
    "ssmlSupported": true,
    "instructSupported": false,
    "timestampSupported": true,
    "previewAudioUrl": "/audio/voices/cosyvoice-v3/longsanshu_v3.mp3",
    "accent": "普通话",
    "gender": "男声"
  },
  {
    "id": "sys-longyuan_v3",
    "providerVoiceId": "longyuan_v3",
    "name": "宋嘉禾",
    "type": "SYSTEM",
    "targetModel": "cosyvoice-v3-flash",
    "supportedModels": [
      "cosyvoice-v3-flash",
      "cosyvoice-v3-plus"
    ],
    "sourceModels": [
      "cosyvoice-v3-flash"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话",
      "美式英语"
    ],
    "description": "有声书 · 温暖治愈女",
    "trait": "温暖治愈女",
    "scene": "有声书",
    "age": "35~40岁",
    "ageCategory": "中年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/cosy-longyuan_v3-eb9fa576c2-v6-fbaf0193da7f4d1f1933.jpg",
    "ssmlSupported": true,
    "instructSupported": false,
    "timestampSupported": true,
    "previewAudioUrl": "/audio/voices/cosyvoice-v3/longyuan_v3.mp3",
    "accent": "普通话",
    "gender": "女声"
  },
  {
    "id": "sys-longyue_v3",
    "providerVoiceId": "longyue_v3",
    "name": "卢婉宁",
    "type": "SYSTEM",
    "targetModel": "cosyvoice-v3-flash",
    "supportedModels": [
      "cosyvoice-v3-flash",
      "cosyvoice-v3-plus"
    ],
    "sourceModels": [
      "cosyvoice-v3-flash"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话",
      "美式英语"
    ],
    "description": "有声书 · 温暖磁性女",
    "trait": "温暖磁性女",
    "scene": "有声书",
    "age": "30~35岁",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/cosy-longyue_v3-d4e32c9045-v6-3a29696e08afcdc7b0fd.jpg",
    "ssmlSupported": true,
    "instructSupported": false,
    "timestampSupported": true,
    "previewAudioUrl": "/audio/voices/cosyvoice-v3/longyue_v3.mp3",
    "accent": "普通话",
    "gender": "女声"
  },
  {
    "id": "sys-longxiu_v3",
    "providerVoiceId": "longxiu_v3",
    "name": "方和川",
    "type": "SYSTEM",
    "targetModel": "cosyvoice-v3-flash",
    "supportedModels": [
      "cosyvoice-v3-flash",
      "cosyvoice-v3-plus"
    ],
    "sourceModels": [
      "cosyvoice-v3-flash"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话",
      "美式英语"
    ],
    "description": "有声书 · 博才说书男",
    "trait": "博才说书男",
    "scene": "有声书",
    "age": "25~35岁",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/cosy-longxiu_v3-19448fa271-v6-f9e6c5f1592bf633bfbd.jpg",
    "ssmlSupported": true,
    "instructSupported": false,
    "timestampSupported": true,
    "previewAudioUrl": "/audio/voices/cosyvoice-v3/longxiu_v3.mp3",
    "accent": "普通话",
    "gender": "男声"
  },
  {
    "id": "sys-longnan_v3",
    "providerVoiceId": "longnan_v3",
    "name": "姜昭毅",
    "type": "SYSTEM",
    "targetModel": "cosyvoice-v3-flash",
    "supportedModels": [
      "cosyvoice-v3-flash",
      "cosyvoice-v3-plus"
    ],
    "sourceModels": [
      "cosyvoice-v3-flash"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话",
      "美式英语"
    ],
    "description": "有声书 · 睿智青年男",
    "trait": "睿智青年男",
    "scene": "有声书",
    "age": "25~30岁",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/cosy-longnan_v3-37c54eb7b6-v6-d3b8bd354b43db93e9b8.jpg",
    "ssmlSupported": true,
    "instructSupported": false,
    "timestampSupported": true,
    "previewAudioUrl": "/audio/voices/cosyvoice-v3/longnan_v3.mp3",
    "accent": "普通话",
    "gender": "男声"
  },
  {
    "id": "sys-longwanjun_v3",
    "providerVoiceId": "longwanjun_v3",
    "name": "林汐月",
    "type": "SYSTEM",
    "targetModel": "cosyvoice-v3-flash",
    "supportedModels": [
      "cosyvoice-v3-flash",
      "cosyvoice-v3-plus"
    ],
    "sourceModels": [
      "cosyvoice-v3-flash"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话",
      "美式英语"
    ],
    "description": "有声书 · 细腻柔声女",
    "trait": "细腻柔声女",
    "scene": "有声书",
    "age": "20~30岁",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/cosy-longwanjun_v3-d0e1d6ace8-v6-33c7577481f644967ba0.jpg",
    "ssmlSupported": true,
    "instructSupported": false,
    "timestampSupported": true,
    "previewAudioUrl": "/audio/voices/cosyvoice-v3/longwanjun_v3.mp3",
    "accent": "普通话",
    "gender": "女声"
  },
  {
    "id": "sys-longyichen_v3",
    "providerVoiceId": "longyichen_v3",
    "name": "傅望舒",
    "type": "SYSTEM",
    "targetModel": "cosyvoice-v3-flash",
    "supportedModels": [
      "cosyvoice-v3-flash",
      "cosyvoice-v3-plus"
    ],
    "sourceModels": [
      "cosyvoice-v3-flash"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话",
      "美式英语"
    ],
    "description": "有声书 · 洒脱活力男",
    "trait": "洒脱活力男",
    "scene": "有声书",
    "age": "20~30岁",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/cosy-longyichen_v3-b296508fa7-v6-f29e551cbfcdadda0c10.jpg",
    "ssmlSupported": true,
    "instructSupported": false,
    "timestampSupported": true,
    "previewAudioUrl": "/audio/voices/cosyvoice-v3/longyichen_v3.mp3",
    "accent": "普通话",
    "gender": "男声"
  },
  {
    "id": "sys-longlaobo_v3",
    "providerVoiceId": "longlaobo_v3",
    "name": "钟德安",
    "type": "SYSTEM",
    "targetModel": "cosyvoice-v3-flash",
    "supportedModels": [
      "cosyvoice-v3-flash",
      "cosyvoice-v3-plus"
    ],
    "sourceModels": [
      "cosyvoice-v3-flash"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话",
      "美式英语"
    ],
    "description": "有声书 · 沧桑岁月爷",
    "trait": "沧桑岁月爷",
    "scene": "有声书",
    "age": "60岁以上",
    "ageCategory": "老年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/cosy-longlaobo_v3-5e67148774-v6-0b92e74e78c27b4301f7.jpg",
    "ssmlSupported": true,
    "instructSupported": false,
    "timestampSupported": true,
    "previewAudioUrl": "/audio/voices/cosyvoice-v3/longlaobo_v3.mp3",
    "accent": "普通话",
    "gender": "男声"
  },
  {
    "id": "sys-longlaoyi_v3",
    "providerVoiceId": "longlaoyi_v3",
    "name": "叶素娥",
    "type": "SYSTEM",
    "targetModel": "cosyvoice-v3-flash",
    "supportedModels": [
      "cosyvoice-v3-flash",
      "cosyvoice-v3-plus"
    ],
    "sourceModels": [
      "cosyvoice-v3-flash"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话",
      "美式英语"
    ],
    "description": "有声书 · 烟火从容阿姨",
    "trait": "烟火从容阿姨",
    "scene": "有声书",
    "age": "60岁以上",
    "ageCategory": "老年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/cosy-longlaoyi_v3-926919e916-v6-a7b5facd95b1c3044953.jpg",
    "ssmlSupported": true,
    "instructSupported": false,
    "timestampSupported": true,
    "previewAudioUrl": "/audio/voices/cosyvoice-v3/longlaoyi_v3.mp3",
    "accent": "普通话",
    "gender": "男声"
  },
  {
    "id": "sys-longjiqi_v3",
    "providerVoiceId": "longjiqi_v3",
    "name": "梁知远",
    "type": "SYSTEM",
    "targetModel": "cosyvoice-v3-flash",
    "supportedModels": [
      "cosyvoice-v3-flash",
      "cosyvoice-v3-plus"
    ],
    "sourceModels": [
      "cosyvoice-v3-flash"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话",
      "其他英语"
    ],
    "description": "短视频配音 · 呆萌机器人",
    "trait": "呆萌机器人",
    "scene": "短视频配音",
    "age": "20~30岁",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/cosy-longjiqi_v3-ce3a04ad89-v6-d3b797546fb512dae090.jpg",
    "ssmlSupported": true,
    "instructSupported": false,
    "timestampSupported": true,
    "previewAudioUrl": "/audio/voices/cosyvoice-v3/longjiqi_v3.mp3",
    "accent": "普通话",
    "gender": "男声"
  },
  {
    "id": "sys-longhouge_v3",
    "providerVoiceId": "longhouge_v3",
    "name": "冉言溪",
    "type": "SYSTEM",
    "targetModel": "cosyvoice-v3-flash",
    "supportedModels": [
      "cosyvoice-v3-flash",
      "cosyvoice-v3-plus"
    ],
    "sourceModels": [
      "cosyvoice-v3-flash"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话",
      "美式英语"
    ],
    "description": "短视频配音 · 经典猴哥",
    "trait": "经典猴哥",
    "scene": "短视频配音",
    "age": "20~25岁",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/cosy-longhouge_v3-e364bdc626-v6-a293282c89cc8c738d3c.jpg",
    "ssmlSupported": true,
    "instructSupported": false,
    "timestampSupported": true,
    "previewAudioUrl": "/audio/voices/cosyvoice-v3/longhouge_v3.mp3",
    "accent": "普通话",
    "gender": "男声"
  },
  {
    "id": "sys-longdaiyu_v3",
    "providerVoiceId": "longdaiyu_v3",
    "name": "庄知音",
    "type": "SYSTEM",
    "targetModel": "cosyvoice-v3-flash",
    "supportedModels": [
      "cosyvoice-v3-flash",
      "cosyvoice-v3-plus"
    ],
    "sourceModels": [
      "cosyvoice-v3-flash"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话",
      "美式英语"
    ],
    "description": "短视频配音 · 娇率才女音",
    "trait": "娇率才女音",
    "scene": "短视频配音",
    "age": "15~25岁",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/cosy-longdaiyu_v3-b597cd4da8-v6-84bc879a93f23b48b0d8.jpg",
    "ssmlSupported": true,
    "instructSupported": false,
    "timestampSupported": true,
    "previewAudioUrl": "/audio/voices/cosyvoice-v3/longdaiyu_v3.mp3",
    "accent": "普通话",
    "gender": "男声"
  },
  {
    "id": "sys-longanran_v3",
    "providerVoiceId": "longanran_v3",
    "name": "薛采薇",
    "type": "SYSTEM",
    "targetModel": "cosyvoice-v3-flash",
    "supportedModels": [
      "cosyvoice-v3-flash",
      "cosyvoice-v3-plus"
    ],
    "sourceModels": [
      "cosyvoice-v3-flash"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话",
      "美式英语"
    ],
    "description": "直播带货 · 活泼质感女",
    "trait": "活泼质感女",
    "scene": "直播带货",
    "age": "30~40岁",
    "ageCategory": "中年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/cosy-longanran_v3-d96fc9ddd7-v6-8f1e4813b982c96c63d2.jpg",
    "ssmlSupported": true,
    "instructSupported": false,
    "timestampSupported": true,
    "previewAudioUrl": "/audio/voices/cosyvoice-v3/longanran_v3.mp3",
    "accent": "普通话",
    "gender": "女声"
  },
  {
    "id": "sys-longanxuan_v3",
    "providerVoiceId": "longanxuan_v3",
    "name": "夏语恬",
    "type": "SYSTEM",
    "targetModel": "cosyvoice-v3-flash",
    "supportedModels": [
      "cosyvoice-v3-flash",
      "cosyvoice-v3-plus"
    ],
    "sourceModels": [
      "cosyvoice-v3-flash"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话",
      "美式英语"
    ],
    "description": "直播带货 · 经典直播女",
    "trait": "经典直播女",
    "scene": "直播带货",
    "age": "30~40岁",
    "ageCategory": "中年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/cosy-longanxuan_v3-41e0d5edd1-v6-cc66ee29a4dbeb441e5a.jpg",
    "ssmlSupported": true,
    "instructSupported": false,
    "timestampSupported": true,
    "previewAudioUrl": "/audio/voices/cosyvoice-v3/longanxuan_v3.mp3",
    "accent": "普通话",
    "gender": "女声"
  },
  {
    "id": "sys-longshuo_v3",
    "providerVoiceId": "longshuo_v3",
    "name": "乔承岳",
    "type": "SYSTEM",
    "targetModel": "cosyvoice-v3-flash",
    "supportedModels": [
      "cosyvoice-v3-flash",
      "cosyvoice-v3-plus"
    ],
    "sourceModels": [
      "cosyvoice-v3-flash"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话",
      "美式英语"
    ],
    "description": "新闻播报 · 博才干练男",
    "trait": "博才干练男",
    "scene": "新闻播报",
    "age": "25~30岁",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/cosy-longshuo_v3-27dc71aaac-v6-53b3a8c4cb5539d8d2ab.jpg",
    "ssmlSupported": true,
    "instructSupported": false,
    "timestampSupported": true,
    "previewAudioUrl": "/audio/voices/cosyvoice-v3/longshuo_v3.mp3",
    "accent": "普通话",
    "gender": "男声"
  },
  {
    "id": "sys-longshu_v3",
    "providerVoiceId": "longshu_v3",
    "name": "方屹川",
    "type": "SYSTEM",
    "targetModel": "cosyvoice-v3-flash",
    "supportedModels": [
      "cosyvoice-v3-flash",
      "cosyvoice-v3-plus"
    ],
    "sourceModels": [
      "cosyvoice-v3-flash"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话",
      "美式英语"
    ],
    "description": "新闻播报 · 沉稳青年男",
    "trait": "沉稳青年男",
    "scene": "新闻播报",
    "age": "20~25岁",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/cosy-longshu_v3-98d0b0f656-v6-520fed40b4b0d487907a.jpg",
    "ssmlSupported": true,
    "instructSupported": false,
    "timestampSupported": true,
    "previewAudioUrl": "/audio/voices/cosyvoice-v3/longshu_v3.mp3",
    "accent": "普通话",
    "gender": "男声"
  },
  {
    "id": "sys-loongbella_v3",
    "providerVoiceId": "loongbella_v3",
    "name": "秦亦岚",
    "type": "SYSTEM",
    "targetModel": "cosyvoice-v3-flash",
    "supportedModels": [
      "cosyvoice-v3-flash",
      "cosyvoice-v3-plus"
    ],
    "sourceModels": [
      "cosyvoice-v3-flash"
    ],
    "status": "READY",
    "visibility": "PUBLIC",
    "language": "中文",
    "languages": [
      "普通话",
      "美式英语"
    ],
    "description": "新闻播报 · 精准干练女",
    "trait": "精准干练女",
    "scene": "新闻播报",
    "age": "25~30岁",
    "ageCategory": "青年",
    "avatarUrl": "https://cdn.xueleai.com/uploads/audio/voices/avatars/cosy-loongbella_v3-211fe40e1e-v6-f46f5338e5263e067955.jpg",
    "ssmlSupported": true,
    "instructSupported": false,
    "timestampSupported": true,
    "previewAudioUrl": "/audio/voices/cosyvoice-v3/loongbella_v3.mp3",
    "accent": "普通话",
    "gender": "女声"
  }
] as const satisfies readonly CosyVoiceSystemVoice[];
