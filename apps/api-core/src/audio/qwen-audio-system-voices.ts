import type { CosyVoiceSystemVoice } from "./cosyvoice-system-voices.js";

type QwenAudioVoiceSource = {
  providerVoiceId: string;
  name: string;
  gender: "男声" | "女声";
  trait: string;
  scene: string;
  previewFile: string;
};

const model = "qwen-audio-3.1-tts-flash";
const previewBase = "https://g-adoc.alcasset.com/media/maas_docs/sfm-cn/common/audios";

// 阿里云“精品中文音色”小节，voice 参数和试听文件均保持官方原值。
const sources = [
  { providerVoiceId: "yuxiaoyun_v3.1", name: "于小云", gender: "女声", trait: "元气、亲切、自然", scene: "广告营销、广播、客服助手、旁白", previewFile: "6a4b3c2d1e0f9cfd" },
  { providerVoiceId: "qiaoxiaojiao_v3.1", name: "乔小娇", gender: "女声", trait: "俏丽、可爱", scene: "广告营销、客服助手、有声书", previewFile: "6a4b3c2d1e0f9cfc" },
  { providerVoiceId: "xiaxiaochen_v3.1", name: "夏小晨", gender: "女声", trait: "元气、明亮", scene: "广告营销、有声书", previewFile: "6a4b3c2d1e0f9cf2" },
  { providerVoiceId: "anmingyuan_v3.1", name: "安明远", gender: "男声", trait: "清亮、自然", scene: "广告营销、有声书、旁白", previewFile: "6a4b3c2d1e0f9cf1" },
  { providerVoiceId: "wenhuaiqing_v3.1", name: "温怀清", gender: "女声", trait: "清亮、柔和", scene: "儿童故事、客服助手、广告营销、新闻播报", previewFile: "6a4b3c2d1e0f9cf0" },
  { providerVoiceId: "anxiaolan_v3.1", name: "安小岚", gender: "女声", trait: "清甜、纯净", scene: "有声书、客服助手、旁白、新闻播报、广告营销", previewFile: "6a4b3c2d1e0f9cf7" },
  { providerVoiceId: "xieshurou_v3.1", name: "谢舒柔", gender: "女声", trait: "柔和、自然、知性", scene: "有声书、客服助手、旁白", previewFile: "6a4b3c2d1e0f9cf5" },
  { providerVoiceId: "baiqinglan_v3.1", name: "白清岚", gender: "女声", trait: "明亮、清纯", scene: "语音助手、客服助手", previewFile: "6a4b3c2d1e0f9c0b" },
  { providerVoiceId: "xuyuyuan_v3.1", name: "许玉远", gender: "女声", trait: "知性、成熟、质感", scene: "广告营销、新闻播报、旁白、客服助手、有声书", previewFile: "6a4b3c2d1e0f9c0a" },
  { providerVoiceId: "anruorou_v3.1", name: "安若柔", gender: "女声", trait: "气声、知性", scene: "旁白、语音助手", previewFile: "6a4b3c2d1e0f9c09" },
  { providerVoiceId: "wenhuaizhi_v3.1", name: "闻怀之", gender: "女声", trait: "稳重、成熟", scene: "有声书、新闻播报、广告营销、客服助手、旁白", previewFile: "6a4b3c2d1e0f9c08" },
  { providerVoiceId: "xiaoxingzhi_v3.1", name: "萧行之", gender: "女声", trait: "端庄、贵气", scene: "新闻播报、有声书、旁白、客服助手", previewFile: "6a4b3c2d1e0f9c0f" },
  { providerVoiceId: "guyunshu_v3.1", name: "顾云舒", gender: "女声", trait: "成熟、稳重", scene: "音乐电台、客服助手、有声书、旁白", previewFile: "6a4b3c2d1e0f9c0e" },
  { providerVoiceId: "huozhuoshi_v3.1", name: "霍拙石", gender: "男声", trait: "清亮", scene: "有声书、广告营销、旁白", previewFile: "6a4b3c2d1e0f9c0d" },
  { providerVoiceId: "yeqinghe_v3.1", name: "叶清禾", gender: "女声", trait: "亲切、温柔", scene: "有声书、广告营销、旁白、客服助手", previewFile: "6a4b3c2d1e0f9c0c" },
  { providerVoiceId: "yunhuanhuan_v3.1", name: "云欢欢", gender: "女声", trait: "高亢、热情", scene: "有声书、旁白、客服助手", previewFile: "6a4b3c2d1e0f9c03" },
  { providerVoiceId: "xuxiaoqiao_v3.1", name: "徐小俏", gender: "女声", trait: "自然、俏皮", scene: "有声书、旁白、客服助手", previewFile: "6a4b3c2d1e0f9c02" },
  { providerVoiceId: "baianran_v3.1", name: "白安然", gender: "女声", trait: "低沉、浑厚、气声", scene: "配音讲解、有声书、旁白", previewFile: "6a4b3c2d1e0f9c01" },
  { providerVoiceId: "xuyanchu_v3.1", name: "许言初", gender: "女声", trait: "沉稳、磁性", scene: "新闻播报、有声书", previewFile: "6a4b3c2d1e0f9c00" },
  { providerVoiceId: "yezhiqing_v3.1", name: "叶知晴", gender: "女声", trait: "轻快、自然", scene: "儿童故事、客服助手、语音助手", previewFile: "6a4b3c2d1e0f9c05" },
  { providerVoiceId: "andi_v3.1", name: "安迪", gender: "男声", trait: "ABC 口音", scene: "语音助手", previewFile: "6a4b3c2d1e0f9c1b" },
  { providerVoiceId: "anyuqing_v3.1", name: "安语晴", gender: "女声", trait: "甜美", scene: "语音助手、旁白、新闻播报", previewFile: "6a4b3c2d1e0f9c1a" }
] as const satisfies readonly QwenAudioVoiceSource[];

export const qwenAudioTtsSystemVoices: readonly CosyVoiceSystemVoice[] = sources.map((voice) => ({
  id: `sys-qwen-audio-v31-${voice.providerVoiceId.replace(/_v3\.1$/, "")}`,
  providerVoiceId: voice.providerVoiceId,
  name: voice.name,
  type: "SYSTEM",
  targetModel: model,
  supportedModels: [model],
  sourceModels: [model],
  status: "READY",
  visibility: "PUBLIC",
  language: "中文",
  languages: ["普通话"],
  description: `声线${voice.trait}，适合${voice.scene}。`,
  trait: voice.trait,
  scene: voice.scene,
  age: "未标注",
  ageCategory: null,
  accent: "普通话",
  gender: voice.gender,
  avatarUrl: null,
  ssmlSupported: false,
  instructSupported: true,
  timestampSupported: false,
  previewAudioUrl: `${previewBase}/${voice.previewFile}.wav`
}));
