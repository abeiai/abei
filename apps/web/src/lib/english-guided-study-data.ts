export const text2lessonHomePath = "/text2lesson";
export const englishGuidedStudyReadAlongUploadMaxBytes = 30 * 1024 * 1024;
export const gushiwenHomePath = "/gushiwen";
export const daoduHomePath = "/daodu";

export type GuidedStudyScene = "ENGLISH" | "GUSHIWEN" | "DAODU";
export const readingGuideDurationOptions = [1, 3, 5, 8, 10, 15] as const;
export const readingGuideQuestionCountOptions = [3, 5, 10, 20] as const;

export function readingGuideTargetCharacters(minutes: number) {
  return minutes * 180;
}

export function text2lessonStudyPath(materialId: string) {
  return `${text2lessonHomePath}/${encodeURIComponent(materialId)}`;
}

export function gushiwenStudyPath(materialId: string) {
  return `${gushiwenHomePath}/${encodeURIComponent(materialId)}`;
}

export function isLocalEnglishGuidedStudyMaterialId(id: string) {
  return (
    id.startsWith("english-guided-") ||
    /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu.test(id)
  );
}

export interface EnglishLevelOption {
  label: string;
  aiLevel: string;
  note: string;
}

export interface EnglishLevelGroup {
  standardName: string;
  options: EnglishLevelOption[];
}

export type EnglishStudyExplanationMode = "SENTENCE" | "PARAGRAPH" | "FREEFORM";
export type EnglishGuidedStudyAuthorIntroductionMode = "BRIEF" | "DETAILED" | "NONE";

export interface EnglishStudyPoint {
  id: string;
  term: string;
  meaning: string;
  note: string;
  startSeconds: number;
  endSeconds: number;
}

export interface EnglishStudySentence {
  id: string;
  text: string;
  explanation: string;
  grammarFocus: string;
  script?: string;
  startSeconds: number;
  endSeconds: number;
  points: EnglishStudyPoint[];
}

export interface EnglishStudyQuestion {
  id: string;
  question: string;
  options: string[];
  answer: number;
  explanation: string;
}

export interface EnglishGuidedStudyReferenceMaterial {
  id: string;
  kind: "TEXT" | "DOCUMENT";
  name: string;
  content: string;
  mimeType?: string;
  sizeBytes?: number;
}

export interface EnglishAudioTimelineTerm {
  pointId: string;
  term: string;
  startSeconds: number;
  endSeconds: number;
}

export interface EnglishAudioTimelineSegment {
  sentenceId: string;
  startSeconds: number;
  endSeconds: number;
  terms: EnglishAudioTimelineTerm[];
}

export interface EnglishNarrationNodeFocus {
  pointId: string | null;
  text: string;
}

export interface EnglishNarrationNode {
  id: string;
  type: "INTRO" | "SENTENCE" | "SUMMARY";
  sentenceId: string | null;
  chunkType: "INTRO" | "CONTEXT" | "WORD" | "PHRASE" | "GRAMMAR" | "TRANSLATION" | "SUMMARY";
  script: string;
  focus: EnglishNarrationNodeFocus | null;
  audioTaskId: string;
  audioUrl: string;
  durationMs: number;
}

export interface EnglishNarrationTimelineV2 {
  version: 2;
  nodes: EnglishNarrationNode[];
}

export interface EnglishReadAlongCue {
  id: string;
  unitId: string;
  unitType: "TITLE" | "AUTHOR" | "BODY";
  sentenceId: string | null;
  text: string;
  startSeconds: number;
  endSeconds: number;
  timingSource: "ASR_WORDS" | "ASR_CUE" | "DURATION_ESTIMATE";
  words: EnglishReadAlongWordTiming[];
}

export interface EnglishReadAlongWordTiming {
  text: string;
  startChar: number;
  endChar: number;
  startSeconds: number;
  endSeconds: number;
}

export interface EnglishReadAlongNode {
  id: string;
  unitId: string;
  unitType: "TITLE" | "AUTHOR" | "BODY";
  sentenceId: string | null;
  text: string;
  audioUrl: string;
  durationMs: number;
  timingSource: "ASR_WORDS" | "ASR_CUE" | "DURATION_ESTIMATE";
  words: EnglishReadAlongWordTiming[];
}

export interface EnglishReadAlongTrack {
  version: 2;
  source: "GENERATED" | "UPLOAD";
  audioUrl: string;
  audioName: string;
  audioAssetId: string | null;
  durationMs: number;
  srtText: string;
  cues: EnglishReadAlongCue[];
  nodes: EnglishReadAlongNode[];
  voice: string | null;
}

export interface EnglishGuidedStudyOperationProgress {
  version: 1;
  operation: "CONTENT" | "PRACTICE" | "AUDIO" | "READ_ALOUD";
  status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED";
  phase: string;
  completed: number;
  total: number;
  percent: number;
  message: string;
  canLeave: true;
  errorMessage: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  updatedAt: string;
}

export interface EnglishGuidedStudyNarrationVoice {
  providerVoiceId: string | null;
  voiceAssetId: string | null;
}

export interface EnglishGuidedStudyMaterial {
  id: string;
  title: string;
  contentTitle: string | null;
  author: string | null;
  authorIntroductionMode: EnglishGuidedStudyAuthorIntroductionMode;
  sourceType: "IMAGE" | "TEXT";
  sourceName: string | null;
  sourceText: string;
  referenceMaterials: EnglishGuidedStudyReferenceMaterial[];
  level: {
    standardName: string;
    optionLabel: string;
    aiLevel: string;
  };
  explanationMode: EnglishStudyExplanationMode;
  summary: string;
  closing: string;
  narration: string;
  durationMinutes?: number;
  audioUrl: string | null;
  audioTaskId: string | null;
  audioDurationSeconds: number;
  audioTimeline: EnglishAudioTimelineSegment[];
  narrationTimelineV2: EnglishNarrationTimelineV2 | null;
  narrationVoice: EnglishGuidedStudyNarrationVoice | null;
  readAlong: EnglishReadAlongTrack | null;
  contentGenerationProgress: EnglishGuidedStudyOperationProgress | null;
  practiceGenerationProgress: EnglishGuidedStudyOperationProgress | null;
  audioGenerationProgress: EnglishGuidedStudyOperationProgress | null;
  readAlongGenerationProgress: EnglishGuidedStudyOperationProgress | null;
  sentences: EnglishStudySentence[];
  questions: EnglishStudyQuestion[];
  pinnedAt: string | null;
  createdAt: string;
  scene: GuidedStudyScene;
}

export const gushiwenGradeGroups: EnglishLevelGroup[] = [
  {
    standardName: "学段年级",
    options: [
      { label: "学龄前", aiLevel: "G0", note: "亲子共读与听读感受" },
      { label: "一年级", aiLevel: "G1", note: "画面理解与跟读" },
      { label: "二年级", aiLevel: "G2", note: "词句理解与熟读" },
      { label: "三年级", aiLevel: "G3", note: "基础注释与背诵" },
      { label: "四年级", aiLevel: "G4", note: "意象、情感与背诵" },
      { label: "五年级", aiLevel: "G5", note: "诗意文意与表达" },
      { label: "六年级", aiLevel: "G6", note: "结构理解与背诵" },
      { label: "七年级", aiLevel: "G7", note: "古今义与内容理解" },
      { label: "八年级", aiLevel: "G8", note: "写法、情感与积累" },
      { label: "九年级", aiLevel: "G9", note: "中考衔接与全文掌握" },
      { label: "高一", aiLevel: "G10", note: "章法、语境与鉴赏" },
      { label: "高二", aiLevel: "G11", note: "深度理解与鉴赏" },
      { label: "高三", aiLevel: "G12", note: "高考衔接与综合鉴赏" },
      { label: "大学和工作", aiLevel: "G13", note: "文化背景与深度赏析" }
    ]
  }
];

export function guidedStudySceneOf(material: Pick<EnglishGuidedStudyMaterial, "scene">) {
  return material.scene === "DAODU"
    ? "DAODU"
    : material.scene === "GUSHIWEN"
      ? "GUSHIWEN"
      : "ENGLISH";
}

export const englishLevelGroups: EnglishLevelGroup[] = [
  {
    standardName: "基于所在学段年级",
    options: [
      { label: "小学一二年级", aiLevel: "E0", note: "启蒙英语" },
      { label: "小学三四年级", aiLevel: "E1", note: "小学初级" },
      { label: "小学五六年级", aiLevel: "E2", note: "小学高级" },
      { label: "初一", aiLevel: "E3", note: "初中基础" },
      { label: "初二初三", aiLevel: "E4", note: "初中进阶" },
      { label: "高一高二", aiLevel: "E5", note: "高中基础" },
      { label: "高三高考", aiLevel: "E6", note: "高中进阶" },
      { label: "大学考研", aiLevel: "E7", note: "大学与成人" }
    ]
  },
  {
    standardName: "剑桥英语等级",
    options: [
      { label: "Starters / Pre A1 启蒙", aiLevel: "Pre-A1", note: "Starters / Pre A1" },
      { label: "Movers / A1 基础", aiLevel: "A1", note: "Movers / A1" },
      { label: "Flyers / A2 高阶少儿", aiLevel: "A2", note: "Flyers / A2" },
      { label: "KET / A2 Key", aiLevel: "A2", note: "KET / A2 Key" },
      {
        label: "KET 青少版 / A2 Key for Schools",
        aiLevel: "A2",
        note: "KET for Schools / A2 Key for Schools"
      },
      { label: "PET / B1 Preliminary", aiLevel: "B1", note: "PET / B1 Preliminary" },
      {
        label: "PET 青少版 / B1 Preliminary for Schools",
        aiLevel: "B1",
        note: "PET for Schools / B1 Preliminary for Schools"
      },
      { label: "FCE / B2 First", aiLevel: "B2", note: "FCE / B2 First" },
      {
        label: "FCE 青少版 / B2 First for Schools",
        aiLevel: "B2",
        note: "FCE for Schools / B2 First for Schools"
      }
    ]
  },
  {
    standardName: "自我评估（无考试成绩）",
    options: [
      { label: "零基础：只认识字母或少量单词", aiLevel: "A0 / Pre-A1", note: "推荐默认放最前" },
      { label: "入门：会问候、自我介绍、读极短句", aiLevel: "A1", note: "用户最容易理解" },
      { label: "基础：能购物、问路、点餐，能写简单句", aiLevel: "A2", note: "用户最容易理解" },
      { label: "中级：能读常见文章，能说明经历和简单观点", aiLevel: "B1", note: "用户最容易理解" },
      { label: "中高级：能讨论较复杂话题，看懂一般英文内容", aiLevel: "B2", note: "用户最容易理解" },
      { label: "高级：能较流畅处理学术/职场英文", aiLevel: "C1", note: "用户最容易理解" },
      { label: "精通：接近母语，能处理高难材料", aiLevel: "C2", note: "用户最容易理解" }
    ]
  },
  {
    standardName: "CEFR 欧洲语言共同参考框架",
    options: [
      { label: "A1 入门", aiLevel: "A1", note: "国际通用" },
      { label: "A2 基础", aiLevel: "A2", note: "国际通用" },
      { label: "B1 中级", aiLevel: "B1", note: "国际通用" },
      { label: "B2 中高级", aiLevel: "B2", note: "国际通用" },
      { label: "C1 高级", aiLevel: "C1", note: "国际通用" },
      { label: "C2 精通", aiLevel: "C2", note: "国际通用" }
    ]
  },
  {
    standardName: "CSE 中国英语能力等级量表",
    options: [
      { label: "CSE 1级", aiLevel: "A1-", note: "国内标准；教学映射" },
      { label: "CSE 2级", aiLevel: "A1", note: "国内标准；教学映射" },
      { label: "CSE 3级", aiLevel: "A2", note: "国内标准；教学映射" },
      { label: "CSE 4级", aiLevel: "B1", note: "国内标准；与雅思对接较清晰" },
      { label: "CSE 5级", aiLevel: "B2-", note: "国内标准；与雅思对接较清晰" },
      { label: "CSE 6级", aiLevel: "B2", note: "国内标准；与雅思对接较清晰" },
      { label: "CSE 7级", aiLevel: "C1-", note: "国内标准；与雅思对接较清晰" },
      { label: "CSE 8级", aiLevel: "C1+", note: "国内标准；与雅思对接较清晰" },
      { label: "CSE 9级", aiLevel: "C2", note: "国内标准；教学映射" }
    ]
  },
  {
    standardName: "IELTS 雅思",
    options: [
      { label: "0-2.5", aiLevel: "A1", note: "教学用粗分层" },
      { label: "3.0-3.5", aiLevel: "A2", note: "教学用粗分层" },
      { label: "4.0-5.0", aiLevel: "B1", note: "常用对照" },
      { label: "5.5-6.5", aiLevel: "B2", note: "常用对照" },
      { label: "7.0-8.0", aiLevel: "C1", note: "常用对照" },
      { label: "8.5-9.0", aiLevel: "C2", note: "常用对照" }
    ]
  },
  {
    standardName: "TOEFL iBT 新版 1-6",
    options: [
      { label: "1.0-1.5", aiLevel: "A1", note: "2026新版分数" },
      { label: "2.0-2.5", aiLevel: "A2", note: "2026新版分数" },
      { label: "3.0-3.5", aiLevel: "B1", note: "2026新版分数" },
      { label: "4.0-4.5", aiLevel: "B2", note: "2026新版分数" },
      { label: "5.0-5.5", aiLevel: "C1", note: "2026新版分数" },
      { label: "6.0", aiLevel: "C2", note: "2026新版分数" }
    ]
  },
  {
    standardName: "TOEFL iBT 旧版/过渡 0-120",
    options: [
      { label: "0-23", aiLevel: "A1", note: "旧版或过渡期成绩" },
      { label: "24-43", aiLevel: "A2", note: "旧版或过渡期成绩" },
      { label: "44-71", aiLevel: "B1", note: "旧版或过渡期成绩" },
      { label: "72-94", aiLevel: "B2", note: "旧版或过渡期成绩" },
      { label: "95-113", aiLevel: "C1", note: "旧版或过渡期成绩" },
      { label: "114-120", aiLevel: "C2", note: "旧版或过渡期成绩" }
    ]
  },
  {
    standardName: "CET 大学英语四/六级",
    options: [
      { label: "CET-4 0-424 / 未达425", aiLevel: "A2+", note: "国内教学估算" },
      { label: "CET-4 425-499", aiLevel: "B1", note: "国内教学估算" },
      { label: "CET-4 500-599", aiLevel: "B1+", note: "国内教学估算" },
      { label: "CET-4 600-710", aiLevel: "B2", note: "国内教学估算" },
      { label: "CET-6 0-424 / 未达425", aiLevel: "B1+", note: "国内教学估算" },
      { label: "CET-6 425-499", aiLevel: "B2-", note: "国内教学估算" },
      { label: "CET-6 500-599", aiLevel: "B2", note: "国内教学估算" },
      { label: "CET-6 600-710", aiLevel: "B2+ / C1-", note: "国内教学估算" }
    ]
  },
  {
    standardName: "TEM 英语专业四/八级",
    options: [
      { label: "TEM-4 合格：60-69", aiLevel: "B2", note: "国内教学估算" },
      { label: "TEM-4 良好：70-79", aiLevel: "B2+", note: "国内教学估算" },
      { label: "TEM-4 优秀：80+", aiLevel: "C1-", note: "国内教学估算" },
      { label: "TEM-8 合格：60-69", aiLevel: "C1", note: "国内教学估算" },
      { label: "TEM-8 良好：70-79", aiLevel: "C1+", note: "国内教学估算" },
      { label: "TEM-8 优秀：80+", aiLevel: "C2-", note: "国内教学估算" }
    ]
  },
  {
    standardName: "PETS 全国英语等级考试",
    options: [
      { label: "PETS-1 / PETS-1B", aiLevel: "A1", note: "国内教学估算" },
      { label: "PETS-2", aiLevel: "A2", note: "国内教学估算" },
      { label: "PETS-3", aiLevel: "B1", note: "国内教学估算" },
      { label: "PETS-4", aiLevel: "B2", note: "国内教学估算" },
      { label: "PETS-5", aiLevel: "C1", note: "国内教学估算" }
    ]
  },
  {
    standardName: "Cambridge English 剑桥英语",
    options: [
      { label: "Pre A1 Starters", aiLevel: "A0 / Pre-A1", note: "适合少儿/入门" },
      { label: "A1 Movers / Cambridge Scale 100-119", aiLevel: "A1", note: "国际证书" },
      { label: "A2 Flyers / A2 Key / KET / Scale 120-139", aiLevel: "A2", note: "国际证书" },
      { label: "B1 Preliminary / PET / Scale 140-159", aiLevel: "B1", note: "国际证书" },
      { label: "B2 First / FCE / Scale 160-179", aiLevel: "B2", note: "国际证书" },
      { label: "C1 Advanced / CAE / Scale 180-199", aiLevel: "C1", note: "国际证书" },
      { label: "C2 Proficiency / CPE / Scale 200-230", aiLevel: "C2", note: "国际证书" }
    ]
  },
  {
    standardName: "PTE Academic",
    options: [
      { label: "10-29", aiLevel: "A1", note: "官方CEFR对照清晰" },
      { label: "30-42", aiLevel: "A2", note: "官方CEFR对照清晰" },
      { label: "43-58", aiLevel: "B1", note: "官方CEFR对照清晰" },
      { label: "59-75", aiLevel: "B2", note: "官方CEFR对照清晰" },
      { label: "76-84", aiLevel: "C1", note: "官方CEFR对照清晰" },
      { label: "85-90", aiLevel: "C2", note: "官方CEFR对照清晰" }
    ]
  },
  {
    standardName: "Duolingo English Test",
    options: [
      { label: "10-30", aiLevel: "A1", note: "低分段教学估算" },
      { label: "35-55", aiLevel: "A2", note: "低分段教学估算" },
      { label: "60-95", aiLevel: "B1", note: "官方CEFR对照" },
      { label: "100-125", aiLevel: "B2", note: "官方CEFR对照" },
      { label: "130-150", aiLevel: "C1", note: "官方CEFR对照" },
      { label: "155-160", aiLevel: "C2", note: "官方CEFR对照" }
    ]
  },
  {
    standardName: "TOEIC Listening & Reading 托业听读",
    options: [
      { label: "10-119", aiLevel: "A0 / Pre-A1", note: "TOEIC L&R 不覆盖C2" },
      { label: "120-224", aiLevel: "A1", note: "常用职场英语" },
      { label: "225-549", aiLevel: "A2", note: "常用职场英语" },
      { label: "550-784", aiLevel: "B1", note: "常用职场英语" },
      { label: "785-944", aiLevel: "B2", note: "常用职场英语" },
      { label: "945-990", aiLevel: "C1", note: "常用职场英语" }
    ]
  },
  {
    standardName: "CLB 加拿大语言基准",
    options: [
      { label: "CLB 1-2", aiLevel: "A1", note: "加拿大移民/学习场景常见" },
      { label: "CLB 3-4", aiLevel: "A2", note: "加拿大移民/学习场景常见" },
      { label: "CLB 5-6", aiLevel: "B1", note: "加拿大移民/学习场景常见" },
      { label: "CLB 7-8", aiLevel: "B2", note: "加拿大移民/学习场景常见" },
      { label: "CLB 9-10", aiLevel: "C1", note: "加拿大移民/学习场景常见" },
      { label: "CLB 11-12", aiLevel: "C2", note: "加拿大移民/学习场景常见" }
    ]
  },
  {
    standardName: "ACTFL 美国语言能力标准",
    options: [
      { label: "Novice Low / Novice Mid", aiLevel: "A0 / A1-", note: "美国教育场景常见；教学估算" },
      { label: "Novice High", aiLevel: "A1", note: "美国教育场景常见；教学估算" },
      { label: "Intermediate Low / Intermediate Mid", aiLevel: "A2", note: "美国教育场景常见；教学估算" },
      { label: "Intermediate High", aiLevel: "B1", note: "美国教育场景常见；教学估算" },
      { label: "Advanced Low / Advanced Mid", aiLevel: "B2", note: "美国教育场景常见；教学估算" },
      { label: "Advanced High / Superior", aiLevel: "C1", note: "美国教育场景常见；教学估算" },
      { label: "Distinguished", aiLevel: "C2", note: "美国教育场景常见；教学估算" }
    ]
  }
];

export const defaultEnglishStudyText =
  "In many cities, people are choosing smaller daily actions to protect the environment. They bring reusable cups, repair old items, and share public bikes instead of driving short distances. These choices may seem simple, but they become powerful when many people repeat them every day. As a result, a community can reduce waste and create a cleaner place to live.";

const phraseBank = [
  { term: "as a result", meaning: "因此；结果是", note: "用来承接前面的原因，说明自然产生的结果。" },
  { term: "instead of", meaning: "而不是", note: "后面常接名词或动名词，用来表达取舍。" },
  { term: "public bikes", meaning: "公共自行车", note: "public 修饰 bikes，表示面向公众使用。" },
  { term: "short distances", meaning: "短距离", note: "distance 是距离，复数 distances 表示多种具体路程。" },
  { term: "protect the environment", meaning: "保护环境", note: "protect 后直接接保护对象，是常见动宾搭配。" },
  { term: "reusable cups", meaning: "可重复使用的杯子", note: "reusable 的 re- 表示 again，强调可以再次使用。" },
  { term: "daily actions", meaning: "日常行动", note: "daily 修饰 actions，表示每天会发生的小行为。" },
  { term: "become powerful", meaning: "变得有力量", note: "become 后接形容词，表示状态变化。" },
  { term: "every day", meaning: "每天", note: "两个词分开写时是时间状语，说明发生频率。" }
];

const wordMeanings: Record<string, string> = {
  actions: "行动；做法",
  choosing: "选择",
  cities: "城市",
  community: "社区；共同体",
  create: "创造；形成",
  driving: "开车",
  environment: "环境",
  powerful: "有力量的；有效的",
  protect: "保护",
  reduce: "减少",
  repair: "修理",
  reusable: "可重复使用的",
  smaller: "更小的",
  simple: "简单的",
  waste: "浪费；废弃物"
};

const commonWords = new Set([
  "about",
  "after",
  "again",
  "also",
  "because",
  "before",
  "being",
  "between",
  "could",
  "every",
  "from",
  "have",
  "into",
  "many",
  "more",
  "people",
  "place",
  "short",
  "that",
  "their",
  "them",
  "there",
  "these",
  "they",
  "this",
  "those",
  "when",
  "where",
  "which",
  "while",
  "with",
  "would"
]);

export function optionsForStandard(standardName: string) {
  return englishLevelGroups.find((group) => group.standardName === standardName)?.options ?? englishLevelGroups[0].options;
}

export function createImageRecognizedText(filename: string) {
  const cleanedName = filename.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim();
  const titleHint = cleanedName ? `The photo appears to show a text page about ${cleanedName}. ` : "";

  return `${titleHint}${defaultEnglishStudyText}`;
}

export function createEnglishGuidedStudyMaterial({
  levelOption,
  sourceName,
  sourceText,
  sourceType,
  standardName,
  title
}: {
  levelOption: EnglishLevelOption;
  sourceName: string | null;
  sourceText: string;
  sourceType: "IMAGE" | "TEXT";
  standardName: string;
  title: string;
}): EnglishGuidedStudyMaterial {
  const normalizedText = normalizeSourceText(sourceText) || defaultEnglishStudyText;
  const rawSentences = splitSentences(normalizedText).slice(0, 18);
  const band = levelBand(levelOption.aiLevel);
  let cursor = 0;
  const sentences = rawSentences.map((sentence, index) => {
    const explanation = buildExplanation(sentence, index, band);
    const grammarFocus = grammarNote(sentence, band);
    const baseSeconds = Math.max(10, Math.ceil((sentence.length + explanation.length + grammarFocus.length) / durationDivisor(band)));
    const points = timedPoints(extractStudyPoints(sentence, band, index), cursor, cursor + baseSeconds);
    const item: EnglishStudySentence = {
      id: `s${index + 1}`,
      text: sentence,
      explanation,
      grammarFocus,
      startSeconds: cursor,
      endSeconds: cursor + baseSeconds,
      points
    };

    cursor += baseSeconds;

    return item;
  });
  const displayTitle = title.trim() || deriveTitle(rawSentences[0] ?? normalizedText);
  const audioDurationSeconds = Math.max(cursor, 30);
  const material: EnglishGuidedStudyMaterial = {
    id: createId(),
    scene: "ENGLISH",
    title: displayTitle,
    contentTitle: title.trim() || null,
    author: null,
    authorIntroductionMode: "BRIEF",
    sourceType,
    sourceName,
    sourceText: normalizedText,
    referenceMaterials: [],
    level: {
      standardName,
      optionLabel: levelOption.label,
      aiLevel: levelOption.aiLevel
    },
    explanationMode: "SENTENCE",
    summary: buildSummary(rawSentences, levelOption.aiLevel, band),
    closing: defaultEnglishStudyClosing,
    narration: "",
    audioUrl: null,
    audioTaskId: null,
    audioDurationSeconds,
    audioTimeline: buildAudioTimeline(sentences),
    narrationTimelineV2: null,
    narrationVoice: null,
    readAlong: null,
    contentGenerationProgress: null,
    practiceGenerationProgress: null,
    audioGenerationProgress: null,
    readAlongGenerationProgress: null,
    sentences,
    questions: [],
    pinnedAt: null,
    createdAt: new Date().toISOString()
  };

  material.narration = buildNarration(material);

  return material;
}

export function isEnglishGuidedStudyMaterial(value: unknown): value is EnglishGuidedStudyMaterial {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    typeof value.sourceText === "string" &&
    isRecord(value.level) &&
    Array.isArray(value.sentences) &&
    Array.isArray(value.questions) &&
    (typeof value.audioUrl === "string" || value.audioUrl === null || value.audioUrl === undefined) &&
    (typeof value.audioTaskId === "string" || value.audioTaskId === null || value.audioTaskId === undefined) &&
    typeof value.audioDurationSeconds === "number"
  );
}

export function parseEnglishGuidedStudyReferenceMaterials(
  value: unknown
): EnglishGuidedStudyReferenceMaterial[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (
        !isRecord(item) ||
        typeof item.id !== "string" ||
        (item.kind !== "TEXT" && item.kind !== "DOCUMENT") ||
        typeof item.name !== "string" ||
        typeof item.content !== "string"
      ) {
        return null;
      }

      return {
        id: item.id,
        kind: item.kind,
        name: item.name,
        content: item.content,
        ...(typeof item.mimeType === "string" ? { mimeType: item.mimeType } : {}),
        ...(typeof item.sizeBytes === "number" ? { sizeBytes: item.sizeBytes } : {})
      } satisfies EnglishGuidedStudyReferenceMaterial;
    })
    .filter((item): item is EnglishGuidedStudyReferenceMaterial => Boolean(item));
}

export function parseEnglishGuidedStudyNarrationVoice(
  value: unknown
): EnglishGuidedStudyNarrationVoice | null {
  if (!isRecord(value)) {
    return null;
  }

  const providerVoiceId = typeof value.providerVoiceId === "string" && value.providerVoiceId.trim()
    ? value.providerVoiceId.trim()
    : null;
  const voiceAssetId = typeof value.voiceAssetId === "string" && value.voiceAssetId.trim()
    ? value.voiceAssetId.trim()
    : null;

  return providerVoiceId || voiceAssetId
    ? { providerVoiceId, voiceAssetId }
    : null;
}

export function englishGuidedStudyNarrationVoiceSelection(
  material: Pick<EnglishGuidedStudyMaterial, "narrationVoice">
) {
  return material.narrationVoice?.voiceAssetId
    ? `voice:${material.narrationVoice.voiceAssetId}`
    : material.narrationVoice?.providerVoiceId
      ? `system:${material.narrationVoice.providerVoiceId}`
      : null;
}

export function englishGuidedStudyReadAlongVoiceSelection(material: unknown) {
  if (!isRecord(material) || !isRecord(material.readAlong) || material.readAlong.source !== "GENERATED") {
    return null;
  }

  const generation = isRecord(material.readAlongGeneration) ? material.readAlongGeneration : null;
  const job = isRecord(material.readAlongGenerationJob) ? material.readAlongGenerationJob : null;
  const input = isRecord(job?.input) ? job.input : null;
  const settings = isRecord(input?.settings) ? input.settings : null;
  // Only restore settings belonging to the completed audio, not a later regeneration.
  if (input?.mode === "GENERATE" && generation?.billingRequestId && generation.billingRequestId === settings?.billingRequestId) {
    if (typeof settings.voiceAssetId === "string" && settings.voiceAssetId.trim()) {
      return `voice:${settings.voiceAssetId.trim()}`;
    }
    if (typeof settings.voice === "string" && settings.voice.trim()) {
      return `system:${settings.voice.trim()}`;
    }
  }

  return typeof material.readAlong.voice === "string" && material.readAlong.voice.trim()
    ? `system:${material.readAlong.voice.trim()}`
    : null;
}

export function parseEnglishNarrationTimelineV2(value: unknown): EnglishNarrationTimelineV2 | null {
  if (!isRecord(value) || value.version !== 2 || !Array.isArray(value.nodes) || value.nodes.length === 0) {
    return null;
  }

  const nodes: EnglishNarrationNode[] = [];

  for (const valueNode of value.nodes) {
    if (!isRecord(valueNode)) return null;

    const type = valueNode.type;
    const chunkType = valueNode.chunkType;
    const sentenceId = valueNode.sentenceId;
    const focusValue = valueNode.focus;
    const validType = type === "INTRO" || type === "SENTENCE" || type === "SUMMARY";
    const validChunkType =
      chunkType === "INTRO" ||
      chunkType === "CONTEXT" ||
      chunkType === "WORD" ||
      chunkType === "PHRASE" ||
      chunkType === "GRAMMAR" ||
      chunkType === "TRANSLATION" ||
      chunkType === "SUMMARY";

    if (
      typeof valueNode.id !== "string" ||
      !validType ||
      !validChunkType ||
      (typeof sentenceId !== "string" && sentenceId !== null) ||
      typeof valueNode.script !== "string" ||
      (typeof valueNode.audioTaskId !== "string" && valueNode.audioTaskId !== undefined) ||
      typeof valueNode.audioUrl !== "string" ||
      typeof valueNode.durationMs !== "number" ||
      !Number.isFinite(valueNode.durationMs) ||
      valueNode.durationMs <= 0
    ) {
      return null;
    }

    let focus: EnglishNarrationNodeFocus | null = null;

    if (focusValue !== null && focusValue !== undefined) {
      if (
        !isRecord(focusValue) ||
        (typeof focusValue.pointId !== "string" && focusValue.pointId !== null) ||
        typeof focusValue.text !== "string"
      ) {
        return null;
      }

      focus = {
        pointId: focusValue.pointId,
        text: focusValue.text
      };
    }

    nodes.push({
      id: valueNode.id,
      type,
      sentenceId,
      chunkType,
      script: valueNode.script,
      focus,
      audioTaskId: typeof valueNode.audioTaskId === "string" ? valueNode.audioTaskId : "",
      audioUrl: valueNode.audioUrl,
      durationMs: valueNode.durationMs
    });
  }

  return { version: 2, nodes };
}

export function parseEnglishReadAlongTrack(value: unknown): EnglishReadAlongTrack | null {
  if (
    !isRecord(value) ||
    (value.version !== 1 && value.version !== 2) ||
    (value.source !== "GENERATED" && value.source !== "UPLOAD") ||
    typeof value.audioUrl !== "string" ||
    !value.audioUrl ||
    typeof value.audioName !== "string" ||
    typeof value.durationMs !== "number" ||
    !Number.isFinite(value.durationMs) ||
    value.durationMs <= 0 ||
    typeof value.srtText !== "string" ||
    !Array.isArray(value.cues) ||
    value.cues.length === 0 ||
    !Array.isArray(value.nodes)
  ) {
    return null;
  }

  const cues: EnglishReadAlongCue[] = [];
  const nodes: EnglishReadAlongNode[] = [];
  const legacy = value.version === 1;

  for (const cueValue of value.cues) {
    if (
      !isRecord(cueValue) ||
      typeof cueValue.id !== "string" ||
      (typeof cueValue.sentenceId !== "string" && cueValue.sentenceId !== null) ||
      typeof cueValue.text !== "string" ||
      typeof cueValue.startSeconds !== "number" ||
      typeof cueValue.endSeconds !== "number" ||
      cueValue.startSeconds < 0 ||
      cueValue.endSeconds <= cueValue.startSeconds
    ) {
      return null;
    }

    const unitType = legacy ? "BODY" : parseEnglishReadAlongUnitType(cueValue.unitType);
    const unitId = legacy
      ? `read-along-body-${cueValue.sentenceId}`
      : typeof cueValue.unitId === "string" ? cueValue.unitId : "";
    const timingSource = legacy
      ? "DURATION_ESTIMATE"
      : parseEnglishReadAlongTimingSource(cueValue.timingSource);
    const parsedWords = legacy ? [] : parseEnglishReadAlongWords(cueValue.words, cueValue.text);

    if (!unitType || !unitId || !timingSource || parsedWords === null) return null;

    const words = unitType === "BODY" && parsedWords.length === 0
      ? estimateReadAlongWords(cueValue.text, cueValue.startSeconds, cueValue.endSeconds)
      : parsedWords;

    cues.push({
      id: cueValue.id,
      unitId,
      unitType,
      sentenceId: typeof cueValue.sentenceId === "string" ? cueValue.sentenceId : null,
      text: cueValue.text,
      startSeconds: cueValue.startSeconds,
      endSeconds: cueValue.endSeconds,
      timingSource,
      words
    });
  }

  for (const nodeValue of value.nodes) {
    if (
      !isRecord(nodeValue) ||
      typeof nodeValue.id !== "string" ||
      (typeof nodeValue.sentenceId !== "string" && nodeValue.sentenceId !== null) ||
      typeof nodeValue.text !== "string" ||
      typeof nodeValue.audioUrl !== "string" ||
      !nodeValue.audioUrl ||
      typeof nodeValue.durationMs !== "number" ||
      !Number.isFinite(nodeValue.durationMs) ||
      nodeValue.durationMs <= 0
    ) {
      return null;
    }

    const unitType = legacy ? "BODY" : parseEnglishReadAlongUnitType(nodeValue.unitType);
    const unitId = legacy
      ? `read-along-body-${nodeValue.sentenceId}`
      : typeof nodeValue.unitId === "string" ? nodeValue.unitId : "";
    const timingSource = legacy
      ? "DURATION_ESTIMATE"
      : parseEnglishReadAlongTimingSource(nodeValue.timingSource);
    const words = legacy ? [] : parseEnglishReadAlongWords(nodeValue.words, nodeValue.text);

    if (!unitType || !unitId || !timingSource || words === null) return null;

    nodes.push({
      id: nodeValue.id,
      unitId,
      unitType,
      sentenceId: typeof nodeValue.sentenceId === "string" ? nodeValue.sentenceId : null,
      text: nodeValue.text,
      audioUrl: nodeValue.audioUrl,
      durationMs: nodeValue.durationMs,
      timingSource,
      words
    });
  }

  if (value.source === "GENERATED" && nodes.length !== cues.length) {
    return null;
  }

  return {
    version: 2,
    source: value.source,
    audioUrl: value.audioUrl,
    audioName: value.audioName,
    audioAssetId: typeof value.audioAssetId === "string" ? value.audioAssetId : null,
    durationMs: value.durationMs,
    srtText: value.srtText,
    cues,
    nodes,
    voice: typeof value.voice === "string" ? value.voice : null
  };
}

function parseEnglishReadAlongUnitType(value: unknown) {
  return value === "TITLE" || value === "AUTHOR" || value === "BODY" ? value : null;
}

function parseEnglishReadAlongTimingSource(value: unknown) {
  return value === "ASR_WORDS" || value === "ASR_CUE" || value === "DURATION_ESTIMATE"
    ? value
    : null;
}

function parseEnglishReadAlongWords(value: unknown, text: string) {
  if (!Array.isArray(value)) return null;

  const words: EnglishReadAlongWordTiming[] = [];
  for (const wordValue of value) {
    if (
      !isRecord(wordValue) ||
      typeof wordValue.text !== "string" ||
      typeof wordValue.startChar !== "number" ||
      typeof wordValue.endChar !== "number" ||
      typeof wordValue.startSeconds !== "number" ||
      typeof wordValue.endSeconds !== "number" ||
      wordValue.startChar < 0 ||
      wordValue.endChar <= wordValue.startChar ||
      wordValue.endChar > text.length ||
      wordValue.startSeconds < 0 ||
      wordValue.endSeconds <= wordValue.startSeconds
    ) {
      return null;
    }

    words.push({
      text: text.slice(wordValue.startChar, wordValue.endChar),
      startChar: wordValue.startChar,
      endChar: wordValue.endChar,
      startSeconds: wordValue.startSeconds,
      endSeconds: wordValue.endSeconds
    });
  }

  return words;
}

function estimateReadAlongWords(
  text: string,
  startSeconds: number,
  endSeconds: number
): EnglishReadAlongWordTiming[] {
  const matches = Array.from(
    text.matchAll(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu)
  );

  if (matches.length === 0) return [];

  const weightedTokens = matches.map((match, index) => {
    const startChar = match.index;
    const token = match[0];
    const endChar = startChar + token.length;
    const nextStart = matches[index + 1]?.index ?? text.length;
    const separator = text.slice(endChar, nextStart);
    const wordWeight = Math.max(1, Math.min(2.6, 0.65 + token.length * 0.22));
    const pauseWeight = /[.!?。！？]/.test(separator)
      ? 0.75
      : /[,;:，；：]/.test(separator)
        ? 0.45
        : /[—–]/.test(separator) ? 0.35 : 0;

    return { endChar, pauseWeight, startChar, token, wordWeight };
  });
  const totalWeight = weightedTokens.reduce(
    (sum, token) => sum + token.wordWeight + token.pauseWeight,
    0
  );
  const duration = endSeconds - startSeconds;
  let cursor = startSeconds;

  return weightedTokens.map((token, index) => {
    const wordDuration = duration * token.wordWeight / totalWeight;
    const pauseDuration = duration * token.pauseWeight / totalWeight;
    const wordEnd = index === weightedTokens.length - 1
      ? endSeconds
      : Math.min(endSeconds, cursor + wordDuration);
    const word: EnglishReadAlongWordTiming = {
      text: token.token,
      startChar: token.startChar,
      endChar: token.endChar,
      startSeconds: cursor,
      endSeconds: wordEnd
    };

    cursor = Math.min(endSeconds, wordEnd + pauseDuration);
    return word;
  });
}

export function parseEnglishGuidedStudyOperationProgress(
  value: unknown,
  operation: EnglishGuidedStudyOperationProgress["operation"]
): EnglishGuidedStudyOperationProgress | null {
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    value.operation !== operation ||
    !["QUEUED", "RUNNING", "SUCCEEDED", "FAILED"].includes(String(value.status)) ||
    typeof value.phase !== "string" ||
    typeof value.completed !== "number" ||
    typeof value.total !== "number" ||
    typeof value.percent !== "number" ||
    typeof value.message !== "string" ||
    value.canLeave !== true ||
    typeof value.updatedAt !== "string"
  ) {
    return null;
  }

  return value as unknown as EnglishGuidedStudyOperationProgress;
}

export function englishGuidedStudyDraftFromMaterial(
  material: Pick<
    EnglishGuidedStudyMaterial,
    "title" | "author" | "authorIntroductionMode" | "sourceText" | "sourceType" | "sourceName" | "level"
  > &
    Partial<Pick<EnglishGuidedStudyMaterial, "contentTitle" | "referenceMaterials" | "explanationMode">>
) {
  return {
    title: material.contentTitle === undefined ? material.title : material.contentTitle ?? "",
    author: material.author ?? "",
    authorIntroductionMode: material.authorIntroductionMode ?? "BRIEF",
    sourceText: material.sourceText,
    inputMode: material.sourceType,
    imageName: material.sourceName,
    referenceMaterials: material.referenceMaterials ?? [],
    standardName: material.level.standardName,
    levelOptionLabel: material.level.optionLabel,
    explanationMode: material.explanationMode ?? "SENTENCE"
  };
}

function normalizeSourceText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function splitSentences(value: string) {
  const matches = value.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [value];

  return matches.map((item) => item.trim()).filter(Boolean);
}

function levelBand(aiLevel: string): "beginner" | "intermediate" | "advanced" {
  if (/C1|C2/.test(aiLevel)) {
    return "advanced";
  }

  if (/B1|B2/.test(aiLevel)) {
    return "intermediate";
  }

  return "beginner";
}

function durationDivisor(band: "beginner" | "intermediate" | "advanced") {
  if (band === "beginner") {
    return 9;
  }

  if (band === "intermediate") {
    return 11;
  }

  return 13;
}

function buildSummary(sentences: string[], aiLevel: string, band: "beginner" | "intermediate" | "advanced") {
  const first = sentences[0] ?? defaultEnglishStudyText;
  const focus =
    band === "beginner"
      ? "先抓主语、动作和高频词，再用中文解释把句意串起来。"
      : band === "intermediate"
        ? "重点看句间逻辑、连接词和常见短语，避免只做逐字翻译。"
        : "把词汇、语法和语篇功能放在一起看，关注作者如何推进观点。";

  return `这份材料会按 ${aiLevel} 难度讲解。第一句提示为：“${first}” ${focus}`;
}

function buildExplanation(sentence: string, index: number, band: "beginner" | "intermediate" | "advanced") {
  const starter = `第 ${index + 1} 句先不要急着逐词翻译。`;

  if (band === "beginner") {
    return `${starter}先找谁在做什么，再看修饰信息。这个句子可以用“主语 + 动作 + 补充信息”的顺序理解，遇到长词先根据上下文猜大意。`;
  }

  if (band === "intermediate") {
    return `${starter}先抓句子主干，再看连接词和短语把信息怎样连起来。讲解时重点放在作者想强调的关系：是原因、结果、对比，还是举例。`;
  }

  return `${starter}这句的价值不只在词义，还在语篇功能。你要判断它是在铺垫背景、补充证据、转折推进，还是收束观点，再决定阅读时的重音。`;
}

function grammarNote(sentence: string, band: "beginner" | "intermediate" | "advanced") {
  const lower = sentence.toLowerCase();

  if (/\bbecause\b|\bso\b|\bas a result\b/.test(lower)) {
    return "语法重点：原因结果关系。读的时候先问“为什么”，再找结果是什么。";
  }

  if (/\balthough\b|\bhowever\b|\bbut\b/.test(lower)) {
    return "语法重点：转折关系。转折后面的信息通常更值得标记。";
  }

  if (/\bif\b|\bwhen\b|\bwhile\b/.test(lower)) {
    return "语法重点：状语从句。先理解从句给出的时间、条件或背景，再回到主句。";
  }

  if (/\bwho\b|\bwhich\b|\bthat\b/.test(lower)) {
    return "语法重点：定语从句。先把修饰部分括起来，主干会更清楚。";
  }

  if (/\b(is|are|was|were|be|been)\s+\w+ed\b/.test(lower)) {
    return "语法重点：被动结构。关注动作承受者，以及作者为什么不强调动作发出者。";
  }

  if (band === "advanced") {
    return "语法重点：信息结构。观察句首信息是否在承接上文，句末信息是否在推出新重点。";
  }

  return "语法重点：先找主语和动词，再把地点、时间、方式等补充信息放回句子。";
}

function extractStudyPoints(sentence: string, band: "beginner" | "intermediate" | "advanced", index: number) {
  const lower = sentence.toLowerCase();
  const points: Omit<EnglishStudyPoint, "startSeconds" | "endSeconds">[] = [];

  for (const phrase of phraseBank) {
    if (lower.includes(phrase.term)) {
      points.push({
        id: `p${index + 1}-${slugify(phrase.term)}`,
        term: phrase.term,
        meaning: phrase.meaning,
        note: phrase.note
      });
    }
  }

  const words = Array.from(new Set(sentence.match(/[A-Za-z][A-Za-z'-]{3,}/g) ?? []))
    .map((word) => word.replace(/^'+|'+$/g, ""))
    .filter((word) => !commonWords.has(word.toLowerCase()))
    .sort((left, right) => right.length - left.length);
  const limit = band === "beginner" ? 3 : 2;

  for (const word of words) {
    if (points.length >= limit) {
      break;
    }

    const key = word.toLowerCase();

    if (points.some((point) => point.term.toLowerCase() === key)) {
      continue;
    }

    points.push({
      id: `p${index + 1}-${slugify(word)}`,
      term: word,
      meaning: wordMeanings[key] ?? "结合上下文理解的关键词",
      note: wordMeanings[key]
        ? `这里的 ${word} 是理解句意的支点。`
        : `先不要查字典，看看它前后的动作和名词，可以大致判断它在句中的功能。`
    });
  }

  if (points.length === 0) {
    points.push({
      id: `p${index + 1}-main-idea`,
      term: firstReadableWord(sentence),
      meaning: "句子核心词",
      note: "先抓这个核心词，再向前后扩展句意。"
    });
  }

  return points.slice(0, limit);
}

function timedPoints(
  points: Omit<EnglishStudyPoint, "startSeconds" | "endSeconds">[],
  startSeconds: number,
  endSeconds: number
) {
  const span = Math.max(1, endSeconds - startSeconds);
  const slot = span / Math.max(1, points.length + 1);

  return points.map((point, index) => {
    const start = startSeconds + Math.max(1, Math.round(slot * (index + 1) - 1));

    return {
      ...point,
      startSeconds: start,
      endSeconds: Math.min(endSeconds, start + Math.max(2, Math.round(slot)))
    };
  });
}

function buildNarration(material: EnglishGuidedStudyMaterial) {
  const lines = material.sentences.map((sentence, index) => {
    const points = sentence.points.map((point) => `${point.term}，意思是${point.meaning}，${point.note}`).join("；");

    return `第 ${index + 1} 句。${sentence.text} ${sentence.explanation} ${sentence.grammarFocus} 重点看：${points}。`;
  });

  return [material.contentTitle, material.summary, ...lines, material.closing].filter(Boolean).join("\n");
}

export const defaultEnglishStudyClosing =
  "我们就读到这里。回头看一遍原文，留意刚才讲过的关键词、句子结构和前后内容的联系，你会更容易把这些表达真正用起来。";

function buildAudioTimeline(sentences: EnglishStudySentence[]): EnglishAudioTimelineSegment[] {
  return sentences.map((sentence) => ({
    sentenceId: sentence.id,
    startSeconds: sentence.startSeconds,
    endSeconds: sentence.endSeconds,
    terms: sentence.points.map((point) => ({
      pointId: point.id,
      term: point.term,
      startSeconds: point.startSeconds,
      endSeconds: point.endSeconds
    }))
  }));
}

function deriveTitle(value: string) {
  const words = value.replace(/[^A-Za-z0-9\s]/g, "").trim().split(/\s+/).slice(0, 7).join(" ");

  return words ? `${words} 带学` : "英文带学材料";
}

function firstReadableWord(sentence: string) {
  return sentence.match(/[A-Za-z][A-Za-z'-]{2,}/)?.[0] ?? "sentence";
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "point";
}

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `english-guided-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
