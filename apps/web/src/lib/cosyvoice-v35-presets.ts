export const cosyVoiceV35PresetPrefix = "cosyvoice-v35:";

export interface CosyVoiceV35Preset {
  id: string;
  value: string;
  name: string;
  description: string;
  prompt: string;
  previewText: string;
  avatarUrl: string;
  previewAudioUrl: string;
}

export const cosyVoiceV35Presets: CosyVoiceV35Preset[] = [
  {
    id: "announcer",
    value: `${cosyVoiceV35PresetPrefix}announcer`,
    name: "叶明澄",
    description: "专业中文播音员，声线明亮清晰、吐字利落，播报节奏平稳且有分寸，适合资讯播报、专辑旁白和产品说明。",
    prompt: "中文普通话女声，专业播音员风格，吐字清晰，语速稳定，声音明亮自然，适合新闻播报、专辑旁白和产品介绍。",
    previewText: "欢迎使用 AI SaaS 语音合成体验区，这是一段用于试听音色风格的示范文本。",
    avatarUrl: "https://cdn.xueleai.com/uploads/audio/voices/cosyvoice-v35/announcer-avatar-0e5da5a5e1443657.jpg",
    previewAudioUrl: "https://cdn.xueleai.com/uploads/audio/voices/cosyvoice-v35/announcer-preview-29e0e9136ac2205e.wav"
  },
  {
    id: "narrator",
    value: `${cosyVoiceV35PresetPrefix}narrator`,
    name: "温书音",
    description: "温柔亲切的中文旁白，声音柔和自然，语调有轻微起伏，讲述时带着生活气息，适合故事、短视频和品牌内容。",
    prompt: "中文普通话女声，温柔亲切，气息自然，语调有轻微起伏，适合故事旁白、短视频解说和生活方式内容。",
    previewText: "晚风轻轻吹过城市的街角，声音把文字变成一段可以被听见的故事。",
    avatarUrl: "https://cdn.xueleai.com/uploads/audio/voices/cosyvoice-v35/narrator-avatar-eecffc61410e8aed.jpg",
    previewAudioUrl: "https://cdn.xueleai.com/uploads/audio/voices/cosyvoice-v35/narrator-preview-1d0e9081641c455a.wav"
  },
  {
    id: "teacher",
    value: `${cosyVoiceV35PresetPrefix}teacher`,
    name: "柳知微老师",
    description: "知性耐心的女教师，发音清楚、节奏从容，讲解重点时层次分明，适合在线教学、知识科普和培训内容。",
    prompt: "中文普通话女声，知性沉稳，表达清楚，节奏适中，带有耐心讲解感，适合在线教学、知识科普和培训内容。",
    previewText: "接下来我们用一个简单例子，帮助你快速理解这个概念的使用方法。",
    avatarUrl: "https://cdn.xueleai.com/uploads/audio/voices/cosyvoice-v35/teacher-avatar-3136a0f9b1c7ab9c.jpg",
    previewAudioUrl: "https://cdn.xueleai.com/uploads/audio/voices/cosyvoice-v35/teacher-preview-95cb057db7a5a6f6.wav"
  },
  {
    id: "business",
    value: `${cosyVoiceV35PresetPrefix}business`,
    name: "陆允衡",
    description: "沉稳专业的中文男声，声音干净有力量，语气可信、语速适中，适合品牌介绍、商业演示和企业视频。",
    prompt: "中文普通话男声，沉稳专业，声音干净有力量，语气可信，语速适中，适合品牌宣传、商业演示和企业介绍。",
    previewText: "我们致力于用可靠的 AI 能力，帮助团队更高效地完成内容生产和业务运营。",
    avatarUrl: "https://cdn.xueleai.com/uploads/audio/voices/cosyvoice-v35/business-avatar-7123d13035536607.jpg",
    previewAudioUrl: "https://cdn.xueleai.com/uploads/audio/voices/cosyvoice-v35/business-preview-cf7578d94f8b4f05.wav"
  },
  {
    id: "customer",
    value: `${cosyVoiceV35PresetPrefix}customer`,
    name: "安予宁",
    description: "亲和礼貌的客服女声，表达清楚自然，情绪平稳而有服务感，适合操作引导、产品提示和帮助中心语音。",
    prompt: "中文普通话女声，亲和自然，服务感强，语气礼貌清楚，情绪稳定，适合客服引导、产品提示和帮助中心语音。",
    previewText: "您好，请按照页面提示完成操作，如需帮助，可以随时联系我们的在线客服。",
    avatarUrl: "https://cdn.xueleai.com/uploads/audio/voices/cosyvoice-v35/customer-avatar-7e04a441453515e1.jpg",
    previewAudioUrl: "https://cdn.xueleai.com/uploads/audio/voices/cosyvoice-v35/customer-preview-d102fa37d424bafd.wav"
  },
  {
    id: "story",
    value: `${cosyVoiceV35PresetPrefix}story`,
    name: "江叙川",
    description: "富有叙事感的中文男声，情绪细腻、节奏稍缓，讲述时能铺陈画面与悬念，适合有声书、故事和剧情旁白。",
    prompt: "中文普通话男声，富有叙事感，情绪细腻，语速中等偏慢，适合有声书、故事讲述和剧情旁白。",
    previewText: "那天傍晚，天边的云慢慢散开，远处传来一阵熟悉又陌生的脚步声。",
    avatarUrl: "https://cdn.xueleai.com/uploads/audio/voices/cosyvoice-v35/story-avatar-092330fb18cac8bb.jpg",
    previewAudioUrl: "https://cdn.xueleai.com/uploads/audio/voices/cosyvoice-v35/story-preview-78fbad99e382e964.wav"
  }
];

export function getCosyVoiceV35Preset(value: string) {
  return cosyVoiceV35Presets.find((preset) => preset.value === value) ?? null;
}

export function findPublishedCosyVoiceV35Preset<T extends {
  name: string;
  type: string;
  status: string;
  targetModel: string;
  providerVoiceId: string | null;
}>(preset: CosyVoiceV35Preset, voices: T[], targetModel?: string | null): T | null {
  return voices.find((voice) =>
    voice.name === preset.name &&
    voice.type === "DESIGNED" &&
    voice.status === "READY" &&
    Boolean(voice.providerVoiceId) &&
    voice.targetModel === (targetModel ?? "cosyvoice-v3.5-plus")
  ) ?? null;
}

export function resolveCosyVoiceV35Selection(
  requestedValue: string,
  voices: readonly { value: string; name: string }[]
): string | null {
  if (voices.some((voice) => voice.value === requestedValue)) return requestedValue;
  const preset = getCosyVoiceV35Preset(requestedValue);
  return preset
    ? voices.find((voice) => voice.name === preset.name && voice.value.startsWith("voice:"))?.value ?? null
    : null;
}
