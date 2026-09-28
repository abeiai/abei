export type VoiceGender = "男声" | "女声";
export type VoiceAgeCategory = "儿童" | "青年" | "中年" | "老年";

export interface VoiceClassification {
  language: string;
  accent: string;
  gender: VoiceGender;
  ageCategory: VoiceAgeCategory;
}

export interface VoiceClassificationInput {
  providerVoiceId?: string | null;
  name: string;
  language?: string | null;
  languages?: readonly string[];
  accent?: string | null;
  gender?: string | null;
  age?: string | null;
  ageCategory?: string | null;
  description?: string | null;
  trait?: string | null;
  scene?: string | null;
  metadataTags?: readonly string[];
  providerLabels?: Record<string, string | undefined>;
}

const languageAliases: Array<[RegExp, string]> = [
  [/中文|汉语|普通话|粤语|闽南|东北话|陕西话|chinese|mandarin|cantonese|hokkien|^(zh|yue|nan)(-|$)/i, "中文"],
  [/英文|英语|english|^en(-|$)/i, "英语"],
  [/日文|日语|japanese|^ja(-|$)/i, "日语"],
  [/韩文|韩语|korean|^ko(-|$)/i, "韩语"],
  [/西班牙文|西班牙语|spanish|^es(-|$)/i, "西班牙语"],
  [/葡萄牙文|葡萄牙语|portuguese|^pt(-|$)/i, "葡萄牙语"],
  [/法文|法语|french|^fr(-|$)/i, "法语"],
  [/印尼文|印尼语|indonesian|^id(-|$)/i, "印尼语"],
  [/德文|德语|german|^de(-|$)/i, "德语"],
  [/俄文|俄语|russian|^ru(-|$)/i, "俄语"],
  [/意大利文|意大利语|italian|^it(-|$)/i, "意大利语"],
  [/阿拉伯文|阿拉伯语|arabic|^ar(-|$)/i, "阿拉伯语"],
  [/土耳其文|土耳其语|turkish|^tr(-|$)/i, "土耳其语"],
  [/乌克兰文|乌克兰语|ukrainian|^uk(-|$)/i, "乌克兰语"],
  [/荷兰文|荷兰语|dutch|^nl(-|$)/i, "荷兰语"],
  [/越南文|越南语|vietnamese|^vi(-|$)/i, "越南语"],
  [/泰文|泰语|thai|^th(-|$)/i, "泰语"],
  [/波兰文|波兰语|polish|^pl(-|$)/i, "波兰语"],
  [/罗马尼亚文|罗马尼亚语|romanian|^ro(-|$)/i, "罗马尼亚语"],
  [/希腊文|希腊语|greek|^el(-|$)/i, "希腊语"],
  [/捷克文|捷克语|czech|^cs(-|$)/i, "捷克语"],
  [/芬兰文|芬兰语|finnish|^fi(-|$)/i, "芬兰语"],
  [/印地文|印地语|hindi|^hi(-|$)/i, "印地语"]
];

const standardAccents: Record<string, string> = {
  中文: "普通话",
  英语: "标准英语",
  日语: "标准日语",
  韩语: "标准韩语",
  西班牙语: "标准西班牙语",
  葡萄牙语: "标准葡萄牙语",
  法语: "标准法语",
  印尼语: "标准印尼语",
  德语: "标准德语",
  俄语: "标准俄语",
  意大利语: "标准意大利语",
  阿拉伯语: "标准阿拉伯语",
  土耳其语: "标准土耳其语",
  乌克兰语: "标准乌克兰语",
  荷兰语: "标准荷兰语",
  越南语: "标准越南语",
  泰语: "标准泰语",
  波兰语: "标准波兰语",
  罗马尼亚语: "标准罗马尼亚语",
  希腊语: "标准希腊语",
  捷克语: "标准捷克语",
  芬兰语: "标准芬兰语",
  印地语: "标准印地语"
};

export function classifyVoice(input: VoiceClassificationInput): VoiceClassification {
  const language = classifyLanguage(input);

  return {
    language,
    accent: classifyAccent(input, language),
    gender: classifyGender(input),
    ageCategory: classifyAge(input)
  };
}

export function previewTextForVoice(
  input: Pick<VoiceClassificationInput, "name" | "scene" | "trait" | "description">,
  classification: VoiceClassification
) {
  const role = compact([input.name, input.scene, input.trait, input.description]).join(" ").toLowerCase();
  const isChild = classification.ageCategory === "儿童";
  const isTeacher = /教师|老师|教育|课堂|teacher|education|learning/.test(role);
  const isStory = /故事|小说|旁白|有声书|narrat|story|audiobook/.test(role);
  const isNews = /新闻|播报|主持|纪录片|news|documentary|host/.test(role);

  if (classification.language === "英语") {
    if (isChild) return "Hello! A bright new adventure is waiting. Let's open the story and discover something wonderful together!";
    if (isTeacher) return "Welcome to today's lesson. We'll turn a difficult idea into clear, practical knowledge, one step at a time.";
    if (isStory) return "Listen closely. Every journey begins with a single moment, and this story is ready to come alive.";
    if (isNews) return "Welcome. Here is a clear, confident update on the stories and ideas that matter today.";
    return "Hello, and welcome. Let this distinctive voice bring clarity, warmth, and character to your next creation.";
  }

  if (classification.accent === "粤语") {
    if (isChild) return "大家好，今日我哋一齐打开故事书，展开一段开心又奇妙嘅冒险啦！";
    if (isTeacher) return "欢迎嚟到今日嘅课堂，我会一步一步同大家讲清楚重点知识。";
    return "大家好，用心听每一句说话，声音会令眼前嘅故事变得更加生动。";
  }

  if (isChild) return "大家好，今天又是充满想象力的一天，让我们一起打开故事书，开始奇妙的冒险吧！";
  if (isTeacher) return "欢迎来到今天的课堂，让我们把复杂的知识讲得清楚、有趣，也更容易记住。";
  if (isStory) return "请安静聆听，每一段旅程都从一个瞬间开始，而这个故事正等待被声音唤醒。";
  if (isNews) return "欢迎收听，接下来为你带来清晰、准确、值得关注的信息。";
  return "你好，愿这个独特的声音，为你的下一段创作带来清晰、温度与鲜明的个性。";
}

function classifyLanguage(input: VoiceClassificationInput) {
  const explicitDescription = compact([input.description, input.trait]).join(" ");
  if (/美式英语发音|英式英语发音|american english|british english/i.test(explicitDescription)) {
    return "英语";
  }

  const candidates = compact([
    input.providerLabels?.language,
    input.metadataTags?.[0],
    input.language,
    ...(input.languages ?? []),
    input.providerVoiceId
  ]);
  for (const candidate of candidates) {
    const language = normaliseLanguage(candidate);
    if (language) return language;
  }
  return "中文";
}

function classifyAccent(input: VoiceClassificationInput, language: string) {
  const candidates = compact([
    input.providerLabels?.accent,
    input.metadataTags?.[1],
    input.accent,
    input.language,
    ...(input.languages ?? []),
    input.providerVoiceId,
    input.name,
    input.description
  ]);
  const text = candidates.join(" ").toLowerCase();

  if (language === "中文") {
    if (/粤语|cantonese|\byue\b/.test(text)) return "粤语";
    if (/闽南|hokkien|minnan|\bnan\b/.test(text)) return "闽南语";
    if (/东北话|东北口音/.test(text)) return "东北话";
    if (/陕西话|陕西口音/.test(text)) return "陕西话";
    if (/台湾口音|台湾腔/.test(text)) return "台湾普通话";
    if (/中国-南方|南方口音/.test(text)) return "南方普通话";
    if (/中国-北方|北方口音/.test(text)) return "北方普通话";
    return "普通话";
  }

  if (language === "英语") {
    if (/英式|英音|british|england/.test(text)) return "英式英语";
    if (/澳洲|澳大利亚|australian/.test(text)) return "澳大利亚英语";
    if (/印度口音|indian/.test(text)) return "印度英语";
    if (/爱尔兰|irish/.test(text)) return "爱尔兰英语";
    if (/拉美|西语口音|latin/.test(text)) return "拉美英语";
    if (/非洲口音|african/.test(text)) return "非洲英语";
    if (/美式|美音|american|\ben-us\b/.test(text)) return "美式英语";
    return "标准英语";
  }

  return standardAccents[language] ?? `标准${language}`;
}

function classifyGender(input: VoiceClassificationInput): VoiceGender {
  const candidates = compact([
    input.providerLabels?.gender,
    input.metadataTags?.[2],
    input.gender,
    input.providerVoiceId,
    input.name,
    input.trait,
    input.description
  ]).join(" ").toLowerCase();

  if (/(?:^|\s)女(?:\s|$)|女(?:\s|$)|女声|女性|女童|女孩|少女|女士|女友|女教师|女主持|女王|御姐|萌妹|学妹|学姐|姐姐|妹妹|小琪|小玲|\bfemale\b|\bwoman\b|\bgirl\b|\blady\b|\bhostess\b/.test(candidates)) {
    return "女声";
  }
  if (/(?:^|\s)男(?:\s|$)|男(?:\s|$)|男声|男性|男童|男孩|先生|男友|男教师|男主持|学弟|学长|哥哥|弟弟|少爷|大叔|爷爷|\bmale\b|\bman\b|\bboy\b|santa|grinch|rudolph|arnold/.test(candidates)) {
    return "男声";
  }
  return "男声";
}

function classifyAge(input: VoiceClassificationInput): VoiceAgeCategory {
  const direct = compact([input.metadataTags?.[3], input.providerLabels?.age]);
  for (const value of direct) {
    if (/儿童|child|kid/i.test(value)) return "儿童";
    if (/老年|elder|senior|\bold\b/i.test(value)) return "老年";
    if (/中年|middle|mature/i.test(value)) return "中年";
    if (/青年|young/i.test(value)) return "青年";
  }

  const age = input.age?.trim() ?? "";
  const numbers = [...age.matchAll(/\d+/g)].map((match) => Number(match[0]));
  if (numbers.length > 0) {
    const minimum = Math.min(...numbers);
    const maximum = Math.max(...numbers);
    if (maximum <= 17) return "儿童";
    if (minimum >= 60) return "老年";
    if (minimum >= 35) return "中年";
  }

  const identity = compact([input.name, input.trait]).join(" ").toLowerCase();
  if (/儿童|男童|女童|孩童|小朋友|\bchild\b|\bkid\b/.test(identity)) return "儿童";
  if (/老年|老人|老爷爷|老奶奶|senior|\bold\b|santa|elder(?!\s*sister)/.test(identity)) return "老年";
  if (/中年|成熟|御姐|大叔|高管|总裁|middle.?aged|mature|executive/.test(identity)) return "中年";

  if (input.ageCategory === "儿童" || input.ageCategory === "青年" || input.ageCategory === "中年" || input.ageCategory === "老年") {
    return input.ageCategory;
  }

  const text = compact([input.providerVoiceId, input.name, input.trait, input.description]).join(" ").toLowerCase();
  if (/儿童|男童|女童|孩童|小朋友|\bchild\b|\bkid\b/.test(text)) return "儿童";
  if (/老年|老人|老爷爷|老奶奶|elder|senior|\bold\b|santa/.test(text)) return "老年";
  if (/中年|成熟|middle.?aged|mature/.test(text)) return "中年";
  return "青年";
}

function normaliseLanguage(value: string) {
  const trimmed = value.trim();
  for (const [pattern, language] of languageAliases) {
    if (pattern.test(trimmed)) return language;
  }
  return "";
}

function compact(values: Array<string | null | undefined>) {
  return values.map((value) => value?.trim()).filter((value): value is string => Boolean(value));
}
