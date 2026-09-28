import { normalizeAdminVoiceLanguage } from "./voice-classification";

export const voicePickerRecentKey = "xueleai:voice-picker:recent";
export const voicePickerFavoriteKey = "xueleai:voice-picker:favorite";
export const legacyVoiceRecentKey = "xueleai:experience-voice:recent";
export const legacyVoiceFavoriteKey = "xueleai:experience-voice:favorite";

export interface VoicePickerOption {
  value: string;
  name: string;
  badge: string;
  gender?: string | null;
  avatarUrl?: string | null;
  description?: string | null;
  previewAudioUrl?: string | null;
  language?: string | null;
  languages?: string[];
  accent?: string | null;
  trait?: string | null;
  scene?: string | null;
  ageCategory?: string | null;
  supportedModels?: string[];
  ssmlSupported?: boolean;
  instructSupported?: boolean;
  timestampSupported?: boolean;
  isDefault?: boolean;
}

export function preferredTtsModelNamesForVoice(voice: { provider?: string; targetModel?: string }): string[] {
  if (voice.provider === "minimax_audio" && voice.targetModel === "minimax-voice-design") {
    return ["speech-2.8-turbo", "speech-2.8-hd"];
  }

  if (voice.provider === "elevenlabs_audio") {
    return ["eleven_v3", "eleven_multilingual_v2", "eleven_flash_v2_5"];
  }

  return voice.targetModel ? [voice.targetModel] : [];
}

export function resolveAutomaticVoiceModel<
  TModel extends { aliasKey: string; isConfigured: boolean; modelName: string | null }
>(models: TModel[], voice: Pick<VoicePickerOption, "supportedModels"> | undefined): TModel | undefined {
  const preferredModelNames = voice?.supportedModels ?? [];

  for (const modelName of preferredModelNames) {
    const model = models.find((item) => item.isConfigured && item.modelName === modelName);
    if (model) {
      return model;
    }
  }

  if (preferredModelNames.length > 0) {
    return undefined;
  }

  return models.find((model) => model.isConfigured && model.aliasKey === "tts-default")
    ?? models.find((model) => model.isConfigured)
    ?? models[0];
}

type VoiceAvatarGender = "male" | "female";
type VoiceAvatarAge = "child" | "young" | "middle" | "old";

const voiceAvatarPaths: Record<VoiceAvatarGender, Record<VoiceAvatarAge, string>> = {
  male: {
    child: "/images/voice-avatars/male-child.jpg",
    young: "/images/voice-avatars/male-young.jpg",
    middle: "/images/voice-avatars/male-middle.jpg",
    old: "/images/voice-avatars/male-old.jpg"
  },
  female: {
    child: "/images/voice-avatars/female-child.jpg",
    young: "/images/voice-avatars/female-young.jpg",
    middle: "/images/voice-avatars/female-middle.jpg",
    old: "/images/voice-avatars/female-old.jpg"
  }
};

export interface VoicePickerFilters {
  keyword: string;
  language: string;
  accent: string;
  gender: string;
  age: string;
  tags: string[];
  ssml: boolean;
  instruct: boolean;
  timestamp: boolean;
}

function compactValues(values: Array<string | null | undefined>): string[] {
  return values.map((value) => value?.trim()).filter((value): value is string => Boolean(value));
}

function voiceSearchText(voice: VoicePickerOption): string {
  return compactValues([
    voice.name,
    voice.badge,
    voice.gender,
    voice.description,
    voice.language,
    ...(voice.languages ?? []),
    voice.trait,
    voice.scene,
    voice.ageCategory
  ])
    .join(" ")
    .toLowerCase();
}

function normaliseVoiceGender(value: string | null | undefined): VoiceAvatarGender | null {
  const gender = value?.trim().toLowerCase() ?? "";
  if (/女声|女性|女童|女孩|少女|女士|woman|girl|\bfemale\b/.test(gender)) return "female";
  if (/男声|男性|男童|男孩|先生|\bman\b|boy|\bmale\b/.test(gender)) return "male";
  return null;
}

function resolveVoiceGender(voice: VoicePickerOption): VoiceAvatarGender {
  return (
    normaliseVoiceGender(voice.gender) ??
    normaliseVoiceGender(compactValues([voice.name, voice.description, voice.trait]).join(" ")) ??
    "male"
  );
}

function resolveVoiceAge(ageCategory: string | null | undefined): VoiceAvatarAge {
  const age = ageCategory?.trim().toLowerCase() ?? "";
  if (/儿童|孩童|child|kid/.test(age)) return "child";
  if (/中年|middle/.test(age)) return "middle";
  if (/老年|老人|elder|senior|old/.test(age)) return "old";
  return "young";
}

export function resolveVoiceAvatar(voice: VoicePickerOption): string {
  return voice.avatarUrl?.trim() || voiceAvatarPaths[resolveVoiceGender(voice)][resolveVoiceAge(voice.ageCategory)];
}

function normaliseLanguage(value: string): string {
  const language = value.trim().replace(/^标准(?=.+语$)/, "");
  if (/^(东北话|东北口音|陕西话|陕西口音)$/.test(language)) return "中文";
  return normalizeAdminVoiceLanguage(language);
}

function rawVoiceLanguages(voice: VoicePickerOption): string[] {
  return compactValues([...(voice.languages ?? []), voice.language, voice.accent]).flatMap((value) =>
    compactValues(value.split(/[、,，/]/))
  );
}

export function voicePickerLanguages(voice: VoicePickerOption): string[] {
  return [...new Set(rawVoiceLanguages(voice).map(normaliseLanguage))];
}

function normaliseAccent(value: string): string | null {
  const accent = value.trim().toLowerCase();
  if (/普通话|mandarin/.test(accent) || accent === "zh-cn") return "普通话";
  if (/粤语|cantonese/.test(accent) || /^(zh-)?yue$/.test(accent)) return "粤语";
  if (/闽南语|闽南话|hokkien|minnan|min nan/.test(accent) || accent === "nan") return "闽南语";
  if (/东北话|东北口音/.test(accent)) return "东北话";
  if (/陕西话|陕西口音/.test(accent)) return "陕西话";
  if (/台湾普通话|台湾口音/.test(accent)) return "台湾普通话";
  if (/南方普通话|南方口音/.test(accent)) return "南方普通话";
  if (/北方普通话|北方口音/.test(accent)) return "北方普通话";
  if (/美式英语|美语英语|美语|american english/.test(accent) || accent === "en-us") return "美式英语";
  if (/英式英语|british english/.test(accent) || accent === "en-gb") return "英式英语";
  if (/澳大利亚英语|australian english/.test(accent)) return "澳大利亚英语";
  if (/爱尔兰英语|irish english/.test(accent)) return "爱尔兰英语";
  if (/印度英语|indian english/.test(accent)) return "印度英语";
  if (/拉美英语|latin american english/.test(accent)) return "拉美英语";
  if (/非洲英语|african english/.test(accent)) return "非洲英语";
  if (value.trim() === "标准英语" || /^标准.+语$/.test(value.trim())) return value.trim();
  return null;
}

export function voicePickerAccents(voice: VoicePickerOption, language = ""): string[] {
  const selectedLanguage = normaliseLanguage(language);
  return [...new Set(
    rawVoiceLanguages(voice)
      .map(normaliseAccent)
      .filter((value): value is string => Boolean(value))
      .filter((value) => !selectedLanguage || normaliseLanguage(value) === selectedLanguage)
  )];
}

export function supportsVoicePickerLanguages(voice: VoicePickerOption, requiredLanguages: string[]): boolean {
  const supported = voicePickerLanguages(voice);
  return requiredLanguages.every((language) => supported.includes(normaliseLanguage(language)));
}

export function filterVoicePickerOptions(
  voices: VoicePickerOption[],
  filters: VoicePickerFilters
): VoicePickerOption[] {
  const keyword = filters.keyword.trim().toLowerCase();
  const language = normaliseLanguage(filters.language);
  const tags = filters.tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean);

  return voices.filter((voice) => {
    const text = voiceSearchText(voice);
    const voiceGender = resolveVoiceGender(voice) === "female" ? "女声" : "男声";
    const genderMatches = !filters.gender || voiceGender === filters.gender;

    return (
      (!keyword || text.includes(keyword)) &&
      (!filters.language || voicePickerLanguages(voice).includes(language)) &&
      (!filters.accent || voicePickerAccents(voice, language).includes(filters.accent)) &&
      genderMatches &&
      (!filters.age || voice.ageCategory === filters.age) &&
      tags.every((tag) => text.includes(tag)) &&
      (!filters.ssml || voice.ssmlSupported === true) &&
      (!filters.instruct || voice.instructSupported === true) &&
      (!filters.timestamp || voice.timestampSupported === true)
    );
  });
}

export function parseStoredVoiceValues(rawValue: string | null, limit = 50): string[] {
  if (!rawValue) return [];
  try {
    const value = JSON.parse(rawValue);
    if (!Array.isArray(value)) return [];
    return mergeStoredVoiceValues(
      value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())),
      [],
      limit
    );
  } catch {
    return [];
  }
}

export function mergeStoredVoiceValues(primary: string[], secondary: string[], limit = 50): string[] {
  return [...new Set(compactValues([...primary, ...secondary]))].slice(0, Math.max(0, limit));
}

export function toggleStoredVoiceValue(values: string[], value: string, limit = 50): string[] {
  const normalisedValue = value.trim();
  if (!normalisedValue) return mergeStoredVoiceValues(values, [], limit);
  if (values.includes(normalisedValue)) return values.filter((item) => item !== normalisedValue);
  return mergeStoredVoiceValues([normalisedValue], values, limit);
}
