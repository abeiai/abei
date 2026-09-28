export const adminVoiceLanguages = [
  "中文",
  "英语",
  "日语",
  "韩语",
  "西班牙语",
  "葡萄牙语",
  "法语",
  "印尼语",
  "德语",
  "俄语",
  "意大利语",
  "阿拉伯语",
  "土耳其语",
  "乌克兰语",
  "荷兰语",
  "越南语",
  "泰语",
  "波兰语",
  "罗马尼亚语",
  "希腊语",
  "捷克语",
  "芬兰语",
  "印地语"
] as const;

export const adminVoiceAccentsByLanguage: Record<string, readonly string[]> = {
  中文: ["普通话", "粤语", "闽南语", "东北话", "陕西话", "台湾普通话", "南方普通话", "北方普通话"],
  英语: ["标准英语", "美式英语", "英式英语", "澳大利亚英语", "爱尔兰英语", "印度英语", "拉美英语", "非洲英语"],
  日语: ["标准日语"],
  韩语: ["标准韩语"],
  西班牙语: ["标准西班牙语"],
  葡萄牙语: ["标准葡萄牙语"],
  法语: ["标准法语"],
  印尼语: ["标准印尼语"],
  德语: ["标准德语"],
  俄语: ["标准俄语"],
  意大利语: ["标准意大利语"],
  阿拉伯语: ["标准阿拉伯语"],
  土耳其语: ["标准土耳其语"],
  乌克兰语: ["标准乌克兰语"],
  荷兰语: ["标准荷兰语"],
  越南语: ["标准越南语"],
  泰语: ["标准泰语"],
  波兰语: ["标准波兰语"],
  罗马尼亚语: ["标准罗马尼亚语"],
  希腊语: ["标准希腊语"],
  捷克语: ["标准捷克语"],
  芬兰语: ["标准芬兰语"],
  印地语: ["标准印地语"]
};

const languageAliases: Record<string, string> = {
  日文: "日语",
  japanese: "日语",
  ja: "日语",
  "ja-jp": "日语",
  韩文: "韩语",
  korean: "韩语",
  ko: "韩语",
  "ko-kr": "韩语",
  西班牙文: "西班牙语",
  spanish: "西班牙语",
  es: "西班牙语",
  葡萄牙文: "葡萄牙语",
  portuguese: "葡萄牙语",
  pt: "葡萄牙语",
  法文: "法语",
  french: "法语",
  fr: "法语",
  印尼文: "印尼语",
  indonesian: "印尼语",
  id: "印尼语",
  德文: "德语",
  german: "德语",
  de: "德语",
  俄文: "俄语",
  russian: "俄语",
  ru: "俄语",
  意大利文: "意大利语",
  italian: "意大利语",
  it: "意大利语",
  阿拉伯文: "阿拉伯语",
  arabic: "阿拉伯语",
  ar: "阿拉伯语",
  土耳其文: "土耳其语",
  turkish: "土耳其语",
  tr: "土耳其语",
  乌克兰文: "乌克兰语",
  ukrainian: "乌克兰语",
  uk: "乌克兰语",
  荷兰文: "荷兰语",
  dutch: "荷兰语",
  nl: "荷兰语",
  越南文: "越南语",
  vietnamese: "越南语",
  vi: "越南语",
  泰文: "泰语",
  thai: "泰语",
  th: "泰语",
  波兰文: "波兰语",
  polish: "波兰语",
  pl: "波兰语",
  罗马尼亚文: "罗马尼亚语",
  romanian: "罗马尼亚语",
  ro: "罗马尼亚语",
  希腊文: "希腊语",
  greek: "希腊语",
  el: "希腊语",
  捷克文: "捷克语",
  czech: "捷克语",
  cs: "捷克语",
  芬兰文: "芬兰语",
  finnish: "芬兰语",
  fi: "芬兰语",
  印地文: "印地语",
  hindi: "印地语",
  hi: "印地语"
};

export function normalizeAdminVoiceLanguage(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  const language = trimmed.toLowerCase();
  if (
    /中文|汉语|普通话|粤语|闽南语|chinese|mandarin|cantonese|hokkien/.test(language) ||
    /^(zh|yue|nan)(-|$)/.test(language)
  ) {
    return "中文";
  }
  if (/英文|英语|english/.test(language) || /^en(-|$)/.test(language)) {
    return "英语";
  }
  return languageAliases[language] ?? trimmed;
}

export function normalizeAdminVoiceAccent(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return Object.values(adminVoiceAccentsByLanguage).flat().includes(trimmed) ? trimmed : "";
}

export function normalizeAdminVoiceAgeCategory(value: string | null | undefined) {
  return value && ["儿童", "青年", "中年", "老年"].includes(value) ? value : "青年";
}
