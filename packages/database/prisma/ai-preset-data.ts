export const aiPresetVersion = "2026.10.09.1";

const pricingSources = {
  deepSeek: "https://api-docs.deepseek.com/zh-cn/quick_start/pricing/",
  aliyunModelStudio: "https://help.aliyun.com/zh/model-studio/model-pricing",
  minimaxVoiceDesign: "https://platform.minimaxi.com/docs/api-reference/voice-design-design",
  minimaxTts: "https://platform.minimaxi.com/docs/api-reference/speech-t2a-http",
  minimaxVideo: "https://platform.minimaxi.com/docs/api-reference/video-generation-v2-create",
  elevenLabsTts: "https://elevenlabs.io/docs/api-reference/text-to-speech/convert",
  volcengineImage: "https://docs.volcengine.com/docs/ark/image-generation-api?lang=zh"
} as const;

const deepSeekV4FlashPricing = {
  mode: "TOKEN_CACHE",
  currency: "CNY",
  unit: "M_TOKENS",
  inputCacheHit: 0.02,
  inputCacheMiss: 1,
  output: 2,
  discountWindows: [
    {
      label: "优惠时段",
      timezone: "Asia/Shanghai",
      startTime: "16:30",
      endTime: "00:30",
      inputCacheHit: 0.01,
      inputCacheMiss: 0.5,
      output: 1
    }
  ],
  source: pricingSources.deepSeek,
  note: "DeepSeek V4 Flash 标准时段官方价格；优惠时段价格保存在 discountWindows 中。"
};

const qwenImage30Pricing = {
  mode: "IMAGES",
  currency: "CNY",
  unit: "IMAGE",
  input: 0.02,
  output: 0.18,
  source: pricingSources.aliyunModelStudio,
  note: "阿里云百炼华北 2（北京）长期原价：输入图片 0.02 元/张，成功生成图片 0.18 元/张。"
};

const wan30VideoPrimePricing = {
  mode: "VIDEO_SECONDS",
  currency: "CNY",
  unit: "SECOND",
  billingBasis: "OUTPUT_SECONDS",
  variants: [
    { label: "480P 视频生成", resolution: "480P", jobMode: "STANDARD", taskType: "OTHER", withAudio: true, input: 0, output: 0.45 },
    { label: "720P 视频生成", resolution: "720P", jobMode: "STANDARD", taskType: "OTHER", withAudio: true, input: 0, output: 0.9 },
    { label: "1080P 视频生成", resolution: "1080P", jobMode: "STANDARD", taskType: "OTHER", withAudio: true, input: 0, output: 1.8 }
  ],
  source: "https://help.aliyun.com/zh/model-studio/prime-mode",
  note: "阿里云百炼北京区 Prime 原价，按生成视频秒数计费；文生视频与图片参考生成同价，含音频。当前接入不支持参考视频或参考音频。"
};

const seedream50ProPricing = {
  mode: "IMAGES",
  currency: "CNY",
  unit: "IMAGE",
  input: 0.02,
  output: 0.3,
  freeInputImages: 1,
  outputTiers: [
    {
      label: "输出图 <= 261 万像素",
      maxPixels: 2_610_000,
      output: 0.3
    },
    {
      label: "输出图 > 261 万像素",
      maxPixels: null,
      output: 0.6
    }
  ],
  source: "https://console.volcengine.com/ark/region:cn-beijing/model/detail?name=doubao-seedream-5-0-pro",
  note: "火山方舟官方按量价：输入参考图首张免费，超出部分 0.02 元/张；图片生成输出图不超过 261 万像素 0.30 元/张，超过 261 万像素 0.60 元/张。"
};

const seedream50FlashPricing = {
  mode: "IMAGES",
  currency: "CNY",
  unit: "IMAGE",
  input: 0,
  output: 0.12,
  source: "https://console.volcengine.com/ark/region:cn-beijing/model/detail?name=doubao-seedream-5-0-pro",
  note: "火山方舟官方按量价：图片生成输出图 0.12 元/张，不单独收取参考图输入费用。"
};

const seedream50LitePricing = {
  mode: "IMAGES",
  currency: "CNY",
  unit: "IMAGE",
  input: 0,
  output: 0.22,
  source: "https://console.volcengine.com/ark/region:cn-beijing/model/detail?name=doubao-seedream-5-0-pro",
  note: "火山方舟官方按量价：文生图、图生图均为 0.22 元/张。"
};

const minimaxH3sVideoPricing = {
  mode: "VIDEO_SECONDS",
  currency: "CNY",
  unit: "SECOND",
  billingBasis: "OUTPUT_SECONDS",
  variants: [
    {
      label: "480P 标准文生视频",
      resolution: "480P",
      jobMode: "STANDARD",
      taskType: "TEXT_TO_VIDEO",
      withAudio: false,
      input: 0,
      output: 0
    },
    {
      label: "768P 标准文生视频",
      resolution: "768P",
      jobMode: "STANDARD",
      taskType: "TEXT_TO_VIDEO",
      withAudio: false,
      input: 0,
      output: 0
    }
  ],
  source: pricingSources.minimaxVideo,
  note: "自建 MiniMax H3s 模型价格由管理员配置，预置价格为 0，配置完成前保持禁用。"
};

function aliyunTieredTokenPricing(
  tiers: Array<{
    label: string;
    minInputTokens: number;
    maxInputTokens: number | null;
    input: number;
    output: number;
    reasoningOutput?: number;
    inputCacheHit?: number;
    inputCacheHitExplicit?: number;
    inputCacheCreation?: number;
  }>,
  note: string
) {
  return {
    mode: "TOKEN_TIERED",
    currency: "CNY",
    unit: "M_TOKENS",
    tierBasis: "REQUEST_INPUT_TOKENS",
    tiers,
    source: pricingSources.aliyunModelStudio,
    note
  };
}

const qwenPlusPricing = aliyunTieredTokenPricing(
  [
    {
      label: "输入 <= 128K",
      minInputTokens: 0,
      maxInputTokens: 128000,
      input: 0.8,
      output: 2,
      reasoningOutput: 8
    },
    {
      label: "128K < 输入 <= 256K",
      minInputTokens: 128001,
      maxInputTokens: 256000,
      input: 4,
      output: 20,
      reasoningOutput: 24
    },
    {
      label: "256K < 输入 <= 1M",
      minInputTokens: 256001,
      maxInputTokens: 1000000,
      input: 10,
      output: 48,
      reasoningOutput: 64
    }
  ],
  "阿里云百炼 Qwen Plus 按单次请求输入 Token 总量分档；当前模型未标记推理能力，列表摘要使用非思考输出价格。"
);

const qwen36PlusPricing = aliyunTieredTokenPricing(
  [
    {
      label: "输入 <= 256K",
      minInputTokens: 0,
      maxInputTokens: 256000,
      input: 2,
      output: 12
    },
    {
      label: "256K < 输入 <= 1M",
      minInputTokens: 256001,
      maxInputTokens: 1000000,
      input: 8,
      output: 48
    }
  ],
  "阿里云百炼 Qwen3.6 Plus 按单次请求输入 Token 总量分档。"
);

const qwen37PlusPricing = aliyunTieredTokenPricing(
  [
    {
      label: "输入 <= 256K",
      minInputTokens: 0,
      maxInputTokens: 256000,
      input: 2,
      inputCacheHit: 0.4,
      inputCacheHitExplicit: 0.2,
      inputCacheCreation: 2.5,
      output: 8,
      reasoningOutput: 8
    },
    {
      label: "256K < 输入 <= 1M",
      minInputTokens: 256001,
      maxInputTokens: 1000000,
      input: 6,
      inputCacheHit: 1.2,
      inputCacheHitExplicit: 0.6,
      inputCacheCreation: 7.5,
      output: 24,
      reasoningOutput: 24
    }
  ],
  "阿里云百炼 Qwen3.7 Plus 按单次请求输入 Token 总量分档，使用官方长期原价。隐式缓存命中按输入价 20%，显式缓存命中按 10%，显式缓存创建按 125%；限时 8 折与 Batch 半价未计入实时调用基础价。"
);

const qwen37MaxPricing = aliyunTieredTokenPricing(
  [
    {
      label: "输入 <= 1M",
      minInputTokens: 0,
      maxInputTokens: 1000000,
      input: 12,
      inputCacheHit: 2.4,
      inputCacheHitExplicit: 1.2,
      inputCacheCreation: 15,
      output: 36,
      reasoningOutput: 36
    }
  ],
  "阿里云百炼 Qwen3.7 Max 使用北京区域官方长期原价。隐式缓存命中为 2.4 元、显式缓存命中为 1.2 元、显式缓存创建为 15 元，每百万 Token；限时优惠与 Batch 价格未计入实时调用基础价。"
);

const qwen37FlashPricing = aliyunTieredTokenPricing(
  [
    {
      label: "输入 <= 32K",
      minInputTokens: 0,
      maxInputTokens: 32000,
      input: 0.2,
      inputCacheHit: 0.04,
      inputCacheHitExplicit: 0.02,
      inputCacheCreation: 0.25,
      output: 0.8,
      reasoningOutput: 0.8
    },
    {
      label: "32K < 输入 <= 256K",
      minInputTokens: 32001,
      maxInputTokens: 256000,
      input: 0.6,
      inputCacheHit: 0.12,
      inputCacheHitExplicit: 0.06,
      inputCacheCreation: 0.75,
      output: 2.4,
      reasoningOutput: 2.4
    },
    {
      label: "256K < 输入 <= 1M",
      minInputTokens: 256001,
      maxInputTokens: 1000000,
      input: 1.2,
      inputCacheHit: 0.24,
      inputCacheHitExplicit: 0.12,
      inputCacheCreation: 1.5,
      output: 4.8,
      reasoningOutput: 4.8
    }
  ],
  "阿里云百炼 Qwen3.7 Flash 按单次请求输入 Token 总量分档，使用北京区域官方长期原价。每档分别记录隐式缓存命中、显式缓存命中和显式缓存创建价格；Batch 价格未计入实时调用基础价。"
);

const qwen36FlashPricing = aliyunTieredTokenPricing(
  [
    {
      label: "输入 <= 1M",
      minInputTokens: 0,
      maxInputTokens: 1000000,
      input: 0.5,
      output: 3
    }
  ],
  "阿里云百炼 Qwen3.6 Flash 按单次请求输入 Token 总量分档。"
);

const qwen36MaxPreviewPricing = aliyunTieredTokenPricing(
  [
    {
      label: "输入 <= 128K",
      minInputTokens: 0,
      maxInputTokens: 128000,
      input: 9,
      output: 54
    },
    {
      label: "128K < 输入 <= 256K",
      minInputTokens: 128001,
      maxInputTokens: 256000,
      input: 15,
      output: 90
    }
  ],
  "阿里云百炼 Qwen3.6 Max Preview 按单次请求输入 Token 总量分档。"
);

export const aiCapabilityTags = [
  "TEXT",
  "REASONING",
  "VISION",
  "EMBEDDING",
  "IMAGE_GENERATION",
  "IMAGE_EDIT",
  "IMAGE_INPUT",
  "REFERENCE_IMAGE",
  "BATCH_IMAGE",
  "VIDEO_GENERATION",
  "TEXT_TO_VIDEO",
  "IMAGE_TO_VIDEO",
  "REFERENCE_VIDEO",
  "VIDEO_EDIT",
  "VIDEO_INPUT",
  "REFERENCE_FILE",
  "REFERENCE_AUDIO",
  "AUDIO",
  "AUDIO_INPUT",
  "ASR",
  "SPEECH_TO_TEXT",
  "TRANSCRIPTION",
  "TTS",
  "VOICE_CLONE",
  "VOICE_DESIGN",
  "STREAMING_TTS",
  "SYSTEM_VOICE",
  "CUSTOM_VOICE",
  "TIMESTAMP",
  "SSML",
  "INSTRUCT",
  "MULTILINGUAL",
  "CHINA_MAINLAND",
  "INTERNATIONAL",
  "TOOLS",
  "STREAMING",
  "LONG_CONTEXT",
  "LOW_COST",
  "CHINA_FRIENDLY",
  "GLOBAL"
] as const;

export const defaultModelAliases = [
  {
    aliasKey: "default-chat",
    displayName: "默认聊天模型",
    description: "通用文本生成、文案工具和默认 AI 场景使用。"
  },
  {
    aliasKey: "fast-chat",
    displayName: "快速聊天模型",
    description: "低成本、低延迟的短文本生成。"
  },
  {
    aliasKey: "reasoning",
    displayName: "推理模型",
    description: "需要复杂分析、规划和多步推理的场景。"
  },
  {
    aliasKey: "long-context",
    displayName: "长上下文模型",
    description: "需要处理长文档、长 Prompt 或复杂资料的场景。"
  },
  {
    aliasKey: "vision",
    displayName: "视觉理解模型",
    description: "图片理解和多模态输入场景。"
  },
  {
    aliasKey: "embedding",
    displayName: "向量模型",
    description: "知识库切块向量化和语义检索。"
  },
  {
    aliasKey: "image-generation",
    displayName: "图片生成模型",
    description: "图片生成或视觉创意产出。"
  },
  {
    aliasKey: "video-generation",
    displayName: "视频生成模型",
    description: "体验区视频生成、图生视频、参考生视频和视频编辑使用。"
  },
  {
    aliasKey: "speech-to-text",
    displayName: "语音转文字模型",
    description: "音频转写和语音识别。"
  },
  {
    aliasKey: "text-to-speech",
    displayName: "文字转语音模型",
    description: "语音合成和播报场景。"
  },
  {
    aliasKey: "tts-default",
    displayName: "默认语音合成模型",
    description: "语音合成默认模型，用于常规中文播报和内容配音。"
  },
  {
    aliasKey: "tts-fast",
    displayName: "快速语音合成模型",
    description: "低延迟语音合成模型，用于预览和快速生成。"
  },
  {
    aliasKey: "voice-clone-default",
    displayName: "默认声音复刻模型",
    description: "声音复刻任务默认模型，创建自定义音色时使用。"
  },
  {
    aliasKey: "voice-design-default",
    displayName: "默认声音设计模型",
    description: "声音设计任务默认模型，用于根据描述生成音色。"
  },
  {
    aliasKey: "audio-preview",
    displayName: "音频预览模型",
    description: "语音工具预览试听和低成本试生成使用。"
  }
];

export const providerPresets = [
  {
    providerKey: "abeiai",
    displayName: "阿贝智能",
    adapterType: "OPENAI_COMPATIBLE",
    modality: "MULTIMODAL",
    defaultBaseUrl: "https://dmx04.sdts.net.cn/v1",
    apiKeyEnvName: "ABEIAI_API_KEY",
    docsUrl: "https://dmx04.sdts.net.cn/ai-docs",
    region: "CHINA",
    models: [
      {
        modelKey: "qwen3-5-122b-a10b-fp8",
        displayName: "Qwen3.5 122B (阿贝智能)",
        providerModelName: "Qwen3.5-122B-A10B-FP8",
        capabilityTags: ["TEXT", "REASONING", "STREAMING", "CHINA_FRIENDLY"],
        supportsStreaming: true,
        recommendedAlias: "reasoning"
      },
      {
        modelKey: "qwen2-audio-7b-instruct",
        displayName: "Qwen2 Audio 7B (阿贝智能)",
        providerModelName: "Qwen2-Audio-7B-Instruct",
        capabilityTags: ["TEXT", "AUDIO", "AUDIO_INPUT", "STREAMING", "CHINA_FRIENDLY"],
        supportsAudio: true,
        supportsStreaming: true
      },
      {
        modelKey: "qwen3-vl-8b-instruct",
        displayName: "Qwen3 VL 8B (阿贝智能)",
        providerModelName: "Qwen3-VL-8B-Instruct",
        capabilityTags: ["TEXT", "VISION", "IMAGE_INPUT", "VIDEO_INPUT", "STREAMING", "CHINA_FRIENDLY"],
        supportsVision: true,
        supportsStreaming: true
      },
      {
        modelKey: "qwen-image-2-1",
        displayName: "Qwen Image 2.1 (阿贝智能)",
        providerModelName: "Qwen-Image-2.1",
        capabilityTags: ["IMAGE_GENERATION", "IMAGE_EDIT", "IMAGE_INPUT", "REFERENCE_IMAGE", "BATCH_IMAGE", "CHINA_FRIENDLY"],
        supportsImageGeneration: true,
        supportsVision: true,
        recommendedAlias: "image-generation"
      },
      {
        modelKey: "laya",
        displayName: "Laya 分类决策（待接入场景）",
        providerModelName: "Laya",
        capabilityTags: ["CLASSIFICATION", "CHINA_FRIENDLY"]
      }
    ]
  },
  {
    providerKey: "abeiai_audio",
    displayName: "阿贝智能语音",
    adapterType: "OPENAI_COMPATIBLE",
    modality: "AUDIO",
    defaultBaseUrl: "https://dmx04.sdts.net.cn/v1",
    apiKeyEnvName: "ABEIAI_API_KEY",
    docsUrl: "https://dmx04.sdts.net.cn/ai-docs",
    region: "CHINA",
    models: [
      {
        modelKey: "indextts-2-5",
        displayName: "IndexTTS 2.5 (阿贝智能)",
        providerModelName: "IndexTTS-2.5",
        capabilityTags: ["AUDIO", "TTS", "SYSTEM_VOICE", "VOICE_REFERENCE", "CHINA_FRIENDLY"],
        supportsAudio: true
      }
    ]
  },
  {
    providerKey: "abeiai_video",
    displayName: "阿贝智能视频",
    adapterType: "MINIMAX_VIDEO",
    modality: "MULTIMODAL",
    defaultBaseUrl: "https://dmx04.sdts.net.cn",
    apiKeyEnvName: "ABEIAI_API_KEY",
    docsUrl: "https://dmx04.sdts.net.cn/ai-docs",
    region: "CHINA",
    models: [
      {
        modelKey: "minimax-h3",
        displayName: "MiniMax H3 (阿贝智能)",
        providerModelName: "MiniMax-H3",
        capabilityTags: ["VIDEO_GENERATION", "TEXT_TO_VIDEO", "IMAGE_TO_VIDEO", "IMAGE_INPUT", "REFERENCE_IMAGE", "VIDEO_INPUT", "REFERENCE_VIDEO", "AUDIO", "REFERENCE_AUDIO", "PROMPT_REWRITE", "CHINA_FRIENDLY"],
        supportsVision: true,
        recommendedAlias: "video-generation"
      }
    ]
  },
  {
    providerKey: "openai",
    displayName: "OpenAI",
    adapterType: "OPENAI_COMPATIBLE",
    defaultBaseUrl: "https://api.openai.com/v1",
    apiKeyEnvName: "OPENAI_API_KEY",
    docsUrl: "https://platform.openai.com/docs/models",
    region: "GLOBAL",
    models: [
      {
        modelKey: "gpt-4o-mini",
        displayName: "GPT-4o mini",
        providerModelName: "gpt-4o-mini",
        capabilityTags: ["TEXT", "VISION", "TOOLS", "STREAMING", "LOW_COST", "GLOBAL"],
        contextWindow: 128000,
        supportsStreaming: true,
        supportsVision: true,
        supportsTools: true,
        recommendedAlias: "default-chat"
      },
      {
        modelKey: "text-embedding-3-small",
        displayName: "Text Embedding 3 Small",
        providerModelName: "text-embedding-3-small",
        capabilityTags: ["EMBEDDING", "LOW_COST", "GLOBAL"],
        supportsEmbedding: true,
        recommendedAlias: "embedding"
      }
    ]
  },
  {
    providerKey: "deepseek",
    displayName: "DeepSeek",
    adapterType: "OPENAI_COMPATIBLE",
    defaultBaseUrl: "https://api.deepseek.com/v1",
    apiKeyEnvName: "DEEPSEEK_API_KEY",
    docsUrl: "https://api-docs.deepseek.com/",
    region: "CHINA",
    models: [
      {
        modelKey: "deepseek-chat",
        displayName: "DeepSeek Chat",
        providerModelName: "deepseek-chat",
        capabilityTags: ["TEXT", "STREAMING", "LOW_COST", "CHINA_FRIENDLY"],
        supportsStreaming: true,
        pricingConfig: deepSeekV4FlashPricing,
        recommendedAlias: "fast-chat"
      },
      {
        modelKey: "deepseek-reasoner",
        displayName: "DeepSeek Reasoner",
        providerModelName: "deepseek-reasoner",
        capabilityTags: ["TEXT", "REASONING", "STREAMING", "CHINA_FRIENDLY"],
        supportsStreaming: true,
        pricingConfig: deepSeekV4FlashPricing,
        recommendedAlias: "reasoning"
      }
    ]
  },
  {
    providerKey: "dashscope",
    displayName: "通义千问 DashScope",
    adapterType: "OPENAI_COMPATIBLE",
    defaultBaseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    apiKeyEnvName: "DASHSCOPE_API_KEY",
    docsUrl: "https://help.aliyun.com/zh/model-studio/",
    region: "CHINA",
    models: [
      {
        modelKey: "wan3-0-video-prime",
        displayName: "Wan3.0 Video Prime",
        providerModelName: "wan3.0-video-prime",
        capabilityTags: ["VIDEO_GENERATION", "TEXT_TO_VIDEO", "IMAGE_TO_VIDEO", "IMAGE_INPUT", "REFERENCE_IMAGE", "PROMPT_REWRITE", "CHINA_FRIENDLY"],
        supportsVision: true,
        recommendedAlias: "video-generation",
        pricingConfig: wan30VideoPrimePricing
      },
      {
        modelKey: "happyhorse-1-0-t2v",
        displayName: "HappyHorse 1.0 文生视频",
        providerModelName: "happyhorse-1.0-t2v",
        capabilityTags: ["VIDEO_GENERATION", "TEXT_TO_VIDEO", "CHINA_FRIENDLY"],
        recommendedAlias: "video-generation"
      },
      {
        modelKey: "happyhorse-1-0-i2v",
        displayName: "HappyHorse 1.0 图生视频",
        providerModelName: "happyhorse-1.0-i2v",
        capabilityTags: ["VIDEO_GENERATION", "IMAGE_TO_VIDEO", "IMAGE_INPUT", "REFERENCE_IMAGE", "CHINA_FRIENDLY"],
        supportsVision: true,
        recommendedAlias: "video-generation"
      },
      {
        modelKey: "happyhorse-1-0-r2v",
        displayName: "HappyHorse 1.0 参考生视频",
        providerModelName: "happyhorse-1.0-r2v",
        capabilityTags: ["VIDEO_GENERATION", "IMAGE_TO_VIDEO", "IMAGE_INPUT", "REFERENCE_IMAGE", "REFERENCE_FILE", "CHINA_FRIENDLY"],
        supportsVision: true,
        recommendedAlias: "video-generation"
      },
      {
        modelKey: "happyhorse-1-0-video-edit",
        displayName: "HappyHorse 1.0 视频编辑",
        providerModelName: "happyhorse-1.0-video-edit",
        capabilityTags: ["VIDEO_GENERATION", "VIDEO_EDIT", "VIDEO_INPUT", "REFERENCE_IMAGE", "REFERENCE_FILE", "CHINA_FRIENDLY"],
        supportsVision: true,
        recommendedAlias: "video-generation"
      },
      {
        modelKey: "wan2-7-t2v",
        displayName: "Wan2.7 文生视频",
        providerModelName: "wan2.7-t2v",
        capabilityTags: ["VIDEO_GENERATION", "TEXT_TO_VIDEO", "REFERENCE_AUDIO", "CHINA_FRIENDLY"],
        recommendedAlias: "video-generation"
      },
      {
        modelKey: "wan2-7-t2v-2026-04-25",
        displayName: "Wan2.7 文生视频 2026-04-25",
        providerModelName: "wan2.7-t2v-2026-04-25",
        capabilityTags: ["VIDEO_GENERATION", "TEXT_TO_VIDEO", "REFERENCE_AUDIO", "CHINA_FRIENDLY"],
        recommendedAlias: "video-generation"
      },
      {
        modelKey: "wan2-7-i2v",
        displayName: "Wan2.7 图生视频",
        providerModelName: "wan2.7-i2v",
        capabilityTags: [
          "VIDEO_GENERATION",
          "IMAGE_TO_VIDEO",
          "IMAGE_INPUT",
          "VIDEO_INPUT",
          "REFERENCE_IMAGE",
          "REFERENCE_VIDEO",
          "REFERENCE_AUDIO",
          "REFERENCE_FILE",
          "CHINA_FRIENDLY"
        ],
        supportsVision: true,
        recommendedAlias: "video-generation"
      },
      {
        modelKey: "wan2-7-i2v-2026-04-25",
        displayName: "Wan2.7 图生视频 2026-04-25",
        providerModelName: "wan2.7-i2v-2026-04-25",
        capabilityTags: [
          "VIDEO_GENERATION",
          "IMAGE_TO_VIDEO",
          "IMAGE_INPUT",
          "VIDEO_INPUT",
          "REFERENCE_IMAGE",
          "REFERENCE_VIDEO",
          "REFERENCE_AUDIO",
          "REFERENCE_FILE",
          "CHINA_FRIENDLY"
        ],
        supportsVision: true,
        recommendedAlias: "video-generation"
      },
      {
        modelKey: "wan2-7-r2v",
        displayName: "Wan2.7 参考生视频",
        providerModelName: "wan2.7-r2v",
        capabilityTags: [
          "VIDEO_GENERATION",
          "IMAGE_TO_VIDEO",
          "IMAGE_INPUT",
          "VIDEO_INPUT",
          "REFERENCE_IMAGE",
          "REFERENCE_VIDEO",
          "REFERENCE_AUDIO",
          "REFERENCE_FILE",
          "CHINA_FRIENDLY"
        ],
        supportsVision: true,
        recommendedAlias: "video-generation"
      },
      {
        modelKey: "wan2-7-videoedit",
        displayName: "Wan2.7 视频编辑",
        providerModelName: "wan2.7-videoedit",
        capabilityTags: ["VIDEO_GENERATION", "VIDEO_EDIT", "VIDEO_INPUT", "REFERENCE_IMAGE", "REFERENCE_FILE", "CHINA_FRIENDLY"],
        supportsVision: true,
        recommendedAlias: "video-generation"
      },
      {
        modelKey: "wan2.7-image-pro",
        displayName: "Wan2.7 Image Pro",
        providerModelName: "wan2.7-image-pro",
        capabilityTags: ["IMAGE_GENERATION", "IMAGE_EDIT", "IMAGE_INPUT", "REFERENCE_IMAGE", "BATCH_IMAGE", "CHINA_FRIENDLY"],
        supportsImageGeneration: true,
        supportsVision: true,
        recommendedAlias: "image-generation"
      },
      {
        modelKey: "wan2.7-image",
        displayName: "Wan2.7 Image",
        providerModelName: "wan2.7-image",
        capabilityTags: ["IMAGE_GENERATION", "IMAGE_EDIT", "IMAGE_INPUT", "REFERENCE_IMAGE", "BATCH_IMAGE", "LOW_COST", "CHINA_FRIENDLY"],
        supportsImageGeneration: true,
        supportsVision: true,
        recommendedAlias: "image-generation"
      },
      {
        modelKey: "z-image-turbo",
        displayName: "Z-Image Turbo",
        providerModelName: "z-image-turbo",
        capabilityTags: ["IMAGE_GENERATION", "LOW_COST", "CHINA_FRIENDLY"],
        supportsImageGeneration: true,
        recommendedAlias: "image-generation"
      },
      {
        modelKey: "qwen-image-3.0",
        displayName: "Qwen Image 3.0",
        providerModelName: "qwen-image-3.0",
        capabilityTags: ["IMAGE_GENERATION", "IMAGE_EDIT", "IMAGE_INPUT", "REFERENCE_IMAGE", "BATCH_IMAGE", "LOW_COST", "CHINA_FRIENDLY"],
        supportsImageGeneration: true,
        supportsVision: true,
        pricingConfig: qwenImage30Pricing,
        recommendedAlias: "image-generation"
      },
      {
        modelKey: "qwen-image-2.0-pro",
        displayName: "Qwen Image 2.0 Pro",
        providerModelName: "qwen-image-2.0-pro",
        capabilityTags: ["IMAGE_GENERATION", "IMAGE_EDIT", "IMAGE_INPUT", "REFERENCE_IMAGE", "BATCH_IMAGE", "CHINA_FRIENDLY"],
        supportsImageGeneration: true,
        supportsVision: true,
        recommendedAlias: "image-generation"
      },
      {
        modelKey: "qwen-image-2.0",
        displayName: "Qwen Image 2.0",
        providerModelName: "qwen-image-2.0",
        capabilityTags: ["IMAGE_GENERATION", "IMAGE_EDIT", "IMAGE_INPUT", "REFERENCE_IMAGE", "BATCH_IMAGE", "LOW_COST", "CHINA_FRIENDLY"],
        supportsImageGeneration: true,
        supportsVision: true,
        recommendedAlias: "image-generation"
      },
      {
        modelKey: "qwen-plus",
        displayName: "Qwen Plus",
        providerModelName: "qwen-plus",
        capabilityTags: ["TEXT", "TOOLS", "STREAMING", "CHINA_FRIENDLY"],
        supportsStreaming: true,
        supportsTools: true,
        pricingConfig: qwenPlusPricing,
        recommendedAlias: "default-chat"
      },
      {
        modelKey: "qwen3.7-max",
        displayName: "Qwen3.7 Max",
        providerModelName: "qwen3.7-max",
        capabilityTags: ["TEXT", "REASONING", "TOOLS", "STREAMING", "LONG_CONTEXT", "CHINA_FRIENDLY"],
        contextWindow: 1000000,
        supportsStreaming: true,
        supportsTools: true,
        pricingConfig: qwen37MaxPricing,
        recommendedAlias: "reasoning"
      },
      {
        modelKey: "qwen3.7-plus",
        displayName: "Qwen3.7 Plus",
        providerModelName: "qwen3.7-plus",
        capabilityTags: ["TEXT", "VISION", "REASONING", "TOOLS", "STREAMING", "LONG_CONTEXT", "CHINA_FRIENDLY"],
        contextWindow: 1000000,
        supportsStreaming: true,
        supportsVision: true,
        supportsTools: true,
        pricingConfig: qwen37PlusPricing,
        recommendedAlias: "default-chat"
      },
      {
        modelKey: "qwen3.7-flash",
        displayName: "Qwen3.7 Flash",
        providerModelName: "qwen3.7-flash",
        capabilityTags: ["TEXT", "VISION", "REASONING", "TOOLS", "STREAMING", "LONG_CONTEXT", "LOW_COST", "CHINA_FRIENDLY"],
        contextWindow: 1000000,
        supportsStreaming: true,
        supportsVision: true,
        supportsTools: true,
        pricingConfig: qwen37FlashPricing,
        recommendedAlias: "fast-chat"
      },
      {
        modelKey: "qwen3.6-plus",
        displayName: "Qwen3.6 Plus",
        providerModelName: "qwen3.6-plus",
        capabilityTags: ["TEXT", "VISION", "REASONING", "TOOLS", "STREAMING", "LONG_CONTEXT", "CHINA_FRIENDLY"],
        contextWindow: 1000000,
        supportsStreaming: true,
        supportsVision: true,
        supportsTools: true,
        pricingConfig: qwen36PlusPricing,
        recommendedAlias: "default-chat"
      },
      {
        modelKey: "qwen3.6-flash",
        displayName: "Qwen3.6 Flash",
        providerModelName: "qwen3.6-flash",
        capabilityTags: ["TEXT", "REASONING", "TOOLS", "STREAMING", "LONG_CONTEXT", "LOW_COST", "CHINA_FRIENDLY"],
        contextWindow: 1000000,
        supportsStreaming: true,
        supportsTools: true,
        pricingConfig: qwen36FlashPricing,
        recommendedAlias: "fast-chat"
      },
      {
        modelKey: "qwen3.6-max",
        displayName: "Qwen3.6 Max Preview",
        providerModelName: "qwen3.6-max-preview",
        capabilityTags: ["TEXT", "REASONING", "TOOLS", "STREAMING", "LONG_CONTEXT", "CHINA_FRIENDLY"],
        contextWindow: 256000,
        supportsStreaming: true,
        supportsTools: true,
        pricingConfig: qwen36MaxPreviewPricing,
        recommendedAlias: "reasoning"
      },
      {
        modelKey: "qwen-vl-plus",
        displayName: "Qwen VL Plus",
        providerModelName: "qwen-vl-plus",
        capabilityTags: ["TEXT", "VISION", "STREAMING", "CHINA_FRIENDLY"],
        supportsStreaming: true,
        supportsVision: true,
        recommendedAlias: "vision"
      }
    ]
  },
  {
    providerKey: "volcengine_ark_image",
    displayName: "火山引擎方舟图片",
    adapterType: "OPENAI_COMPATIBLE",
    modality: "MULTIMODAL",
    defaultBaseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    apiKeyEnvName: "ARK_API_KEY",
    docsUrl: pricingSources.volcengineImage,
    region: "cn-beijing",
    models: [
      {
        modelKey: "doubao-seedream-5-0-pro-260628",
        displayName: "Doubao Seedream 5.0 Pro",
        providerModelName: "doubao-seedream-5-0-pro-260628",
        capabilityTags: [
          "IMAGE_GENERATION",
          "IMAGE_EDIT",
          "IMAGE_INPUT",
          "REFERENCE_IMAGE",
          "LAYER_DECOMPOSITION",
          "MULTILINGUAL_TEXT",
          "CHINA_FRIENDLY"
        ],
        supportsImageGeneration: true,
        supportsVision: true,
        pricingConfig: seedream50ProPricing,
        recommendedAlias: "image-generation"
      },
      {
        modelKey: "doubao-seedream-5-0-flash-260915",
        displayName: "Doubao Seedream 5.0 Flash",
        providerModelName: "doubao-seedream-5-0-flash-260915",
        capabilityTags: [
          "IMAGE_GENERATION",
          "IMAGE_EDIT",
          "IMAGE_INPUT",
          "REFERENCE_IMAGE",
          "LAYER_DECOMPOSITION",
          "MULTILINGUAL_TEXT",
          "FAST",
          "LOW_COST",
          "CHINA_FRIENDLY"
        ],
        supportsImageGeneration: true,
        supportsVision: true,
        pricingConfig: seedream50FlashPricing,
        recommendedAlias: "image-generation"
      },
      {
        modelKey: "doubao-seedream-5-0-lite-260128",
        displayName: "Doubao Seedream 5.0 Lite（已下线）",
        providerModelName: "doubao-seedream-5-0-260128",
        capabilityTags: [
          "IMAGE_GENERATION",
          "IMAGE_EDIT",
          "IMAGE_INPUT",
          "REFERENCE_IMAGE",
          "BATCH_IMAGE",
          "LOW_COST",
          "DEPRECATED",
          "CHINA_FRIENDLY"
        ],
        supportsImageGeneration: true,
        supportsVision: true,
        pricingConfig: seedream50LitePricing,
        isDeprecated: true,
        deprecatedMessage: "火山方舟已于 2026-09-21 下线该模型，请迁移到 Doubao Seedream 5.0 Pro。",
        replacementModelKey: "doubao-seedream-5-0-pro-260628",
        recommendedAlias: "image-generation"
      }
    ]
  },
  {
    providerKey: "moonshot",
    displayName: "Moonshot Kimi",
    adapterType: "OPENAI_COMPATIBLE",
    defaultBaseUrl: "https://api.moonshot.cn/v1",
    apiKeyEnvName: "MOONSHOT_API_KEY",
    docsUrl: "https://platform.moonshot.cn/docs/",
    region: "CHINA",
    models: [
      {
        modelKey: "moonshot-v1-8k",
        displayName: "Moonshot v1 8K",
        providerModelName: "moonshot-v1-8k",
        capabilityTags: ["TEXT", "STREAMING", "CHINA_FRIENDLY"],
        contextWindow: 8192,
        supportsStreaming: true,
        recommendedAlias: "fast-chat"
      },
      {
        modelKey: "moonshot-v1-128k",
        displayName: "Moonshot v1 128K",
        providerModelName: "moonshot-v1-128k",
        capabilityTags: ["TEXT", "STREAMING", "LONG_CONTEXT", "CHINA_FRIENDLY"],
        contextWindow: 128000,
        supportsStreaming: true,
        recommendedAlias: "long-context"
      }
    ]
  },
  {
    providerKey: "openrouter",
    displayName: "OpenRouter",
    adapterType: "OPENAI_COMPATIBLE",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    apiKeyEnvName: "OPENROUTER_API_KEY",
    docsUrl: "https://openrouter.ai/docs",
    region: "GLOBAL",
    models: [
      {
        modelKey: "openai-gpt-4o-mini",
        displayName: "OpenAI GPT-4o mini via OpenRouter",
        providerModelName: "openai/gpt-4o-mini",
        capabilityTags: ["TEXT", "VISION", "TOOLS", "STREAMING", "LOW_COST", "GLOBAL"],
        supportsStreaming: true,
        supportsVision: true,
        supportsTools: true,
        recommendedAlias: "default-chat"
      }
    ]
  },
  {
    providerKey: "anthropic",
    displayName: "Anthropic Claude",
    adapterType: "ANTHROPIC",
    defaultBaseUrl: "https://api.anthropic.com/v1",
    apiKeyEnvName: "ANTHROPIC_API_KEY",
    docsUrl: "https://docs.anthropic.com/en/docs/about-claude/models",
    region: "GLOBAL",
    models: [
      {
        modelKey: "claude-3-5-sonnet-latest",
        displayName: "Claude 3.5 Sonnet",
        providerModelName: "claude-3-5-sonnet-latest",
        capabilityTags: ["TEXT", "REASONING", "VISION", "TOOLS", "STREAMING", "GLOBAL"],
        supportsStreaming: true,
        supportsVision: true,
        supportsTools: true,
        recommendedAlias: "reasoning"
      }
    ]
  },
  {
    providerKey: "gemini",
    displayName: "Google Gemini",
    adapterType: "GEMINI",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
    apiKeyEnvName: "GEMINI_API_KEY",
    docsUrl: "https://ai.google.dev/gemini-api/docs/models",
    region: "GLOBAL",
    models: [
      {
        modelKey: "gemini-1-5-flash",
        displayName: "Gemini 1.5 Flash",
        providerModelName: "gemini-1.5-flash",
        capabilityTags: ["TEXT", "VISION", "STREAMING", "LOW_COST", "GLOBAL"],
        supportsStreaming: true,
        supportsVision: true,
        recommendedAlias: "vision"
      }
    ]
  },
  {
    providerKey: "custom-openai-compatible",
    displayName: "自定义 OpenAI-compatible",
    adapterType: "CUSTOM_OPENAI_COMPATIBLE",
    defaultBaseUrl: "https://api.example.com/v1",
    apiKeyEnvName: "CUSTOM_OPENAI_API_KEY",
    docsUrl: "",
    region: "CUSTOM",
    models: [
      {
        modelKey: "custom-chat-model",
        displayName: "自定义聊天模型",
        providerModelName: "custom-chat-model",
        capabilityTags: ["TEXT", "STREAMING"],
        supportsStreaming: true,
        recommendedAlias: "default-chat"
      }
    ]
  },
  {
    providerKey: "aliyun_dashscope_audio",
    displayName: "阿里云百炼语音",
    adapterType: "DASHSCOPE_AUDIO",
    modality: "AUDIO",
    defaultBaseUrl: "https://dashscope.aliyuncs.com/api/v1",
    defaultWebSocketUrl: "wss://dashscope.aliyuncs.com/api-ws/v1/inference",
    apiKeyEnvName: "DASHSCOPE_API_KEY",
    docsUrl: "https://help.aliyun.com/zh/model-studio/text-to-speech",
    region: "cn-beijing,intl-singapore",
    models: [
      {
        modelKey: "qwen-audio-3-1-tts-flash",
        displayName: "Qwen-Audio 3.1 TTS Flash",
        providerModelName: "qwen-audio-3.1-tts-flash",
        capabilityTags: [
          "AUDIO",
          "TTS",
          "SYSTEM_VOICE",
          "STREAMING_TTS",
          "INSTRUCT",
          "CHINA_MAINLAND"
        ],
        supportsStreaming: true,
        supportsAudio: true,
        pricingConfig: {
          mode: "TOKENS",
          currency: "CNY",
          unit: "M_TOKENS",
          input: 1.5,
          output: 12,
          source: "https://help.aliyun.com/zh/model-studio/qwen-audio-3-1-tts-flash"
        }
      },
      {
        modelKey: "cosyvoice-v3-5-plus",
        displayName: "CosyVoice v3.5 Plus",
        providerModelName: "cosyvoice-v3.5-plus",
        capabilityTags: [
          "AUDIO",
          "TTS",
          "VOICE_CLONE",
          "VOICE_DESIGN",
          "STREAMING_TTS",
          "CUSTOM_VOICE",
          "TIMESTAMP",
          "SSML",
          "INSTRUCT",
          "MULTILINGUAL",
          "CHINA_MAINLAND",
          "INTERNATIONAL"
        ],
        supportsStreaming: true,
        supportsAudio: true,
        recommendedAlias: "voice-design-default"
      },
      {
        modelKey: "cosyvoice-v3-5-flash",
        displayName: "CosyVoice v3.5 Flash",
        providerModelName: "cosyvoice-v3.5-flash",
        capabilityTags: [
          "AUDIO",
          "TTS",
          "VOICE_CLONE",
          "VOICE_DESIGN",
          "STREAMING_TTS",
          "CUSTOM_VOICE",
          "MULTILINGUAL",
          "CHINA_MAINLAND",
          "INTERNATIONAL"
        ],
        supportsStreaming: true,
        supportsAudio: true,
        recommendedAlias: "tts-fast"
      },
      {
        modelKey: "cosyvoice-v3-plus",
        displayName: "CosyVoice v3 Plus",
        providerModelName: "cosyvoice-v3-plus",
        capabilityTags: [
          "AUDIO",
          "TTS",
          "VOICE_CLONE",
          "VOICE_DESIGN",
          "STREAMING_TTS",
          "SYSTEM_VOICE",
          "CUSTOM_VOICE",
          "TIMESTAMP",
          "SSML",
          "MULTILINGUAL",
          "CHINA_MAINLAND",
          "INTERNATIONAL"
        ],
        supportsStreaming: true,
        supportsAudio: true,
        recommendedAlias: "voice-clone-default"
      },
      {
        modelKey: "cosyvoice-v3-flash",
        displayName: "CosyVoice v3 Flash",
        providerModelName: "cosyvoice-v3-flash",
        capabilityTags: [
          "AUDIO",
          "TTS",
          "VOICE_CLONE",
          "VOICE_DESIGN",
          "STREAMING_TTS",
          "CUSTOM_VOICE",
          "MULTILINGUAL",
          "CHINA_MAINLAND",
          "INTERNATIONAL"
        ],
        supportsStreaming: true,
        supportsAudio: true,
        recommendedAlias: "audio-preview"
      },
      {
        modelKey: "cosyvoice-v2",
        displayName: "CosyVoice v2",
        providerModelName: "cosyvoice-v2",
        capabilityTags: ["AUDIO", "TTS", "VOICE_CLONE", "CUSTOM_VOICE", "STREAMING_TTS", "CHINA_MAINLAND"],
        supportsStreaming: true,
        supportsAudio: true
      },
      {
        modelKey: "cosyvoice-v1",
        displayName: "CosyVoice v1",
        providerModelName: "cosyvoice-v1",
        capabilityTags: ["AUDIO", "TTS", "VOICE_CLONE", "CUSTOM_VOICE", "STREAMING_TTS", "CHINA_MAINLAND"],
        supportsStreaming: true,
        supportsAudio: true
      },
      {
        modelKey: "sambert",
        displayName: "Sambert",
        providerModelName: "sambert",
        capabilityTags: ["AUDIO", "TTS", "SYSTEM_VOICE", "SSML", "CHINA_MAINLAND"],
        supportsAudio: true,
        recommendedAlias: "text-to-speech"
      },
      {
        modelKey: "qwen3-asr-flash",
        displayName: "千问3-ASR-Flash",
        providerModelName: "qwen3-asr-flash",
        capabilityTags: [
          "AUDIO",
          "AUDIO_INPUT",
          "ASR",
          "SPEECH_TO_TEXT",
          "TRANSCRIPTION",
          "STREAMING",
          "LOW_COST",
          "MULTILINGUAL",
          "CHINA_MAINLAND",
          "INTERNATIONAL"
        ],
        supportsStreaming: true,
        supportsAudio: true,
        recommendedAlias: "speech-to-text"
      }
    ]
  },
  {
    providerKey: "minimax_h3s_video",
    displayName: "MiniMax H3s 视频",
    adapterType: "MINIMAX_VIDEO",
    modality: "MULTIMODAL",
    defaultBaseUrl: "https://dmx04.sdts.net.cn",
    apiKeyEnvName: "MINIMAX_H3S_API_KEY",
    docsUrl: pricingSources.minimaxVideo,
    region: "CHINA",
    models: [
      {
        modelKey: "minimax-h3s",
        displayName: "MiniMax H3s",
        providerModelName: "MiniMax-H3",
        capabilityTags: [
          "VIDEO_GENERATION",
          "TEXT_TO_VIDEO",
          "IMAGE_TO_VIDEO",
          "IMAGE_INPUT",
          "REFERENCE_IMAGE",
          "VIDEO_INPUT",
          "REFERENCE_VIDEO",
          "AUDIO",
          "REFERENCE_AUDIO",
          "PROMPT_REWRITE",
          "CHINA_FRIENDLY"
        ],
        supportsVision: true,
        recommendedAlias: "video-generation",
        pricingConfig: minimaxH3sVideoPricing
      }
    ]
  },
  {
    providerKey: "minimax_audio",
    displayName: "MiniMax 语音",
    adapterType: "MINIMAX_AUDIO",
    modality: "AUDIO",
    defaultBaseUrl: "https://api.minimaxi.com",
    defaultWebSocketUrl: null,
    apiKeyEnvName: "MINIMAX_API_KEY",
    docsUrl: pricingSources.minimaxVoiceDesign,
    region: "global",
    models: [
      {
        modelKey: "minimax-voice-design",
        displayName: "MiniMax 音色设计",
        providerModelName: "minimax-voice-design",
        capabilityTags: ["AUDIO", "VOICE_DESIGN", "CUSTOM_VOICE", "MULTILINGUAL", "GLOBAL"],
        supportsAudio: true
      },
      {
        modelKey: "speech-2-8-hd",
        displayName: "MiniMax Speech 2.8 HD",
        providerModelName: "speech-2.8-hd",
        capabilityTags: ["AUDIO", "TTS", "SYSTEM_VOICE", "CUSTOM_VOICE", "MULTILINGUAL", "GLOBAL"],
        supportsAudio: true
      },
      {
        modelKey: "speech-2-8-turbo",
        displayName: "MiniMax Speech 2.8 Turbo",
        providerModelName: "speech-2.8-turbo",
        capabilityTags: ["AUDIO", "TTS", "SYSTEM_VOICE", "CUSTOM_VOICE", "MULTILINGUAL", "LOW_COST", "GLOBAL"],
        supportsAudio: true
      }
    ]
  },
  {
    providerKey: "elevenlabs_audio",
    displayName: "ElevenLabs 语音",
    adapterType: "ELEVENLABS_AUDIO",
    modality: "AUDIO",
    defaultBaseUrl: "https://api.elevenlabs.io",
    defaultWebSocketUrl: null,
    apiKeyEnvName: "ELEVENLABS_API_KEY",
    docsUrl: pricingSources.elevenLabsTts,
    region: "GLOBAL",
    models: [
      {
        modelKey: "eleven-v3",
        displayName: "Eleven v3",
        providerModelName: "eleven_v3",
        capabilityTags: ["AUDIO", "TTS", "SYSTEM_VOICE", "MULTILINGUAL", "GLOBAL"],
        supportsAudio: true
      },
      {
        modelKey: "eleven-multilingual-v2",
        displayName: "Eleven Multilingual v2",
        providerModelName: "eleven_multilingual_v2",
        capabilityTags: ["AUDIO", "TTS", "SYSTEM_VOICE", "MULTILINGUAL", "GLOBAL"],
        supportsAudio: true
      },
      {
        modelKey: "eleven-flash-v2-5",
        displayName: "Eleven Flash v2.5",
        providerModelName: "eleven_flash_v2_5",
        capabilityTags: ["AUDIO", "TTS", "SYSTEM_VOICE", "MULTILINGUAL", "GLOBAL"],
        supportsAudio: true
      }
    ]
  }
] as const;
