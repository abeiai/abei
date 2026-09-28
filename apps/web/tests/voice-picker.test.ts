import assert from "node:assert/strict";
import test from "node:test";
import {
  filterVoicePickerOptions,
  mergeStoredVoiceValues,
  parseStoredVoiceValues,
  preferredTtsModelNamesForVoice,
  resolveAutomaticVoiceModel,
  resolveVoiceAvatar,
  supportsVoicePickerLanguages,
  toggleStoredVoiceValue,
  voicePickerAccents,
  voicePickerLanguages,
  type VoicePickerOption
} from "../src/lib/voice-picker.js";

const voices: VoicePickerOption[] = [
  {
    value: "system:teacher",
    name: "讲解女声",
    badge: "官方系统音色",
    description: "沉稳清晰",
    language: "zh-cn、en-US",
    languages: ["普通话", "美式英语"],
    ageCategory: "青年",
    trait: "沉稳",
    scene: "教育",
    previewAudioUrl: "/teacher.mp3",
    ssmlSupported: true
  },
  {
    value: "voice:child",
    name: "儿童音色",
    badge: "我的音色",
    description: "活泼",
    language: "中文",
    languages: ["中文"],
    ageCategory: "儿童",
    previewAudioUrl: null
  }
];

test("音色选择同时支持关键词、语种、年龄、标签和能力筛选", () => {
  const result = filterVoicePickerOptions(voices, {
    keyword: "讲解",
    language: "英文",
    accent: "美式英语",
    gender: "女声",
    age: "青年",
    tags: ["教育"],
    ssml: true,
    instruct: false,
    timestamp: false
  });

  assert.deepEqual(result.map((voice) => voice.value), ["system:teacher"]);
});

test("旧收藏和全站收藏合并去重并限制数量", () => {
  assert.deepEqual(mergeStoredVoiceValues(["a", "b"], ["b", "c"], 3), ["a", "b", "c"]);
  assert.deepEqual(parseStoredVoiceValues('["a",1,"b"]', 5), ["a", "b"]);
  assert.deepEqual(toggleStoredVoiceValue(["a", "b"], "a", 50), ["b"]);
  assert.deepEqual(toggleStoredVoiceValue(["a"], "b", 50), ["b", "a"]);
});

test("我的音色和收藏最近列表可按共享值恢复", () => {
  const mine = voices.filter((voice) => voice.value.startsWith("voice:") && !voice.badge.startsWith("平台"));
  const ordered = mergeStoredVoiceValues(["system:teacher"], ["voice:child"], 50)
    .map((value) => voices.find((voice) => voice.value === value)?.value)
    .filter(Boolean);

  assert.deepEqual(mine.map((voice) => voice.value), ["voice:child"]);
  assert.deepEqual(ordered, ["system:teacher", "voice:child"]);
});

test("视频导学只保留同时支持中文和英文的音色", () => {
  assert.equal(supportsVoicePickerLanguages(voices[0], ["中文", "英语"]), true);
  assert.equal(supportsVoicePickerLanguages(voices[0], ["中文", "英文"]), true);
  assert.equal(supportsVoicePickerLanguages(voices[1], ["中文", "英语"]), false);
});

test("男声筛选不会把 female 误判为 male", () => {
  const result = filterVoicePickerOptions([{ ...voices[0], name: "Female teacher", description: "female" }], {
    keyword: "",
    language: "",
    accent: "",
    gender: "男声",
    age: "",
    tags: [],
    ssml: false,
    instruct: false,
    timestamp: false
  });

  assert.deepEqual(result, []);
});

test("语种与口音分层归一化", () => {
  assert.deepEqual(voicePickerLanguages({ ...voices[0], language: "en、英式英语、美语英语" }), ["中文", "英语"]);
  assert.deepEqual(voicePickerAccents({ ...voices[0], language: "en、英式英语、美语英语" }), ["普通话", "美式英语", "英式英语"]);
  assert.deepEqual(voicePickerAccents({ ...voices[0], language: "en、英式英语、美语英语" }, "中文"), ["普通话"]);
  assert.deepEqual(voicePickerAccents({ ...voices[0], language: "en、英式英语、美语英语" }, "英语"), ["美式英语", "英式英语"]);
  assert.deepEqual(voicePickerLanguages({ ...voices[1], language: "zh-cn、普通话、粤语、闽南语" }), ["中文"]);
  assert.deepEqual(voicePickerAccents({ ...voices[1], language: "zh-cn、普通话、粤语、闽南语" }), ["普通话", "粤语", "闽南语"]);
});

test("东北话和陕西话归入中文语种并保留独立口音筛选", () => {
  const dialectVoices: VoicePickerOption[] = [
    { value: "northeast", name: "东北话音色", badge: "系统", language: "东北话" },
    { value: "shaanxi", name: "陕西话音色", badge: "系统", language: "中文", accent: "陕西话" }
  ];
  assert.deepEqual([...new Set(dialectVoices.flatMap(voicePickerLanguages))], ["中文"]);
  assert.deepEqual(dialectVoices.flatMap((voice) => voicePickerAccents(voice, "中文")), ["东北话", "陕西话"]);
  assert.deepEqual(filterVoicePickerOptions(dialectVoices, {
    keyword: "", language: "中文", accent: "东北话", gender: "", age: "", tags: [],
    ssml: false, instruct: false, timestamp: false
  }).map((voice) => voice.value), ["northeast"]);
});

test("同一语种的文、语和标准口音只生成一个筛选项且均可命中", () => {
  for (const [variants, expected] of [
    [["日语", "日文", "标准日语"], "日语"],
    [["韩语", "韩文", "标准韩语"], "韩语"],
    [["印尼语", "印尼文", "标准印尼语"], "印尼语"],
    [["西班牙语", "西班牙文", "标准西班牙语"], "西班牙语"],
    [["葡萄牙语", "葡萄牙文", "标准葡萄牙语"], "葡萄牙语"],
    [["法语", "法文", "标准法语"], "法语"],
    [["德语", "德文", "标准德语"], "德语"],
    [["俄语", "俄文", "标准俄语"], "俄语"]
  ] as const) {
    assert.deepEqual([...new Set(variants.flatMap((language) =>
      voicePickerLanguages({ value: language, name: language, badge: "系统", language })
    ))], [expected]);
  }

  const aliases: VoicePickerOption[] = [
    { value: "ko", name: "韩语音色", badge: "系统", language: "韩语", accent: "标准韩语" },
    { value: "es", name: "西班牙文音色", badge: "系统", language: "西班牙文" },
    { value: "pt", name: "葡萄牙文音色", badge: "系统", language: "葡萄牙文" },
    { value: "fr", name: "标准法语音色", badge: "系统", language: "标准法语" }
  ];
  assert.deepEqual([...new Set(aliases.flatMap(voicePickerLanguages))], ["韩语", "西班牙语", "葡萄牙语", "法语"]);
  assert.deepEqual(voicePickerAccents(aliases[0], "韩语"), ["标准韩语"]);
  assert.deepEqual(filterVoicePickerOptions(aliases, {
    keyword: "", language: "西班牙语", accent: "", gender: "", age: "", tags: [],
    ssml: false, instruct: false, timestamp: false
  }).map((voice) => voice.value), ["es"]);
});

test("音色头像覆盖性别与年龄的八种组合并使用男性青年缺省值", () => {
  const expected = [
    ["男声", "儿童", "/images/voice-avatars/male-child.jpg"],
    ["女声", "儿童", "/images/voice-avatars/female-child.jpg"],
    ["男声", "青年", "/images/voice-avatars/male-young.jpg"],
    ["女声", "青年", "/images/voice-avatars/female-young.jpg"],
    ["男声", "中年", "/images/voice-avatars/male-middle.jpg"],
    ["女声", "中年", "/images/voice-avatars/female-middle.jpg"],
    ["男声", "老年", "/images/voice-avatars/male-old.jpg"],
    ["女声", "老年", "/images/voice-avatars/female-old.jpg"]
  ];

  assert.deepEqual(
    expected.map(([gender, ageCategory]) =>
      resolveVoiceAvatar({ ...voices[0], name: "分类音色", gender, ageCategory })
    ),
    expected.map(([, , path]) => path)
  );
  assert.equal(
    resolveVoiceAvatar({ ...voices[0], name: "未分类音色", description: null, gender: null, ageCategory: null }),
    "/images/voice-avatars/male-young.jpg"
  );
  assert.equal(
    resolveVoiceAvatar({ ...voices[0], avatarUrl: "https://cdn.xueleai.com/voice-a.jpg" }),
    "https://cdn.xueleai.com/voice-a.jpg"
  );
});

test("语音角色按后端规则自动匹配可用模型", () => {
  assert.deepEqual(
    preferredTtsModelNamesForVoice({ provider: "minimax_audio", targetModel: "minimax-voice-design" }),
    ["speech-2.8-turbo", "speech-2.8-hd"]
  );
  assert.deepEqual(
    preferredTtsModelNamesForVoice({ provider: "elevenlabs_audio", targetModel: "eleven_v3" }),
    ["eleven_v3", "eleven_multilingual_v2", "eleven_flash_v2_5"]
  );

  const models = [
    { aliasKey: "tts-default", isConfigured: true, modelName: "cosyvoice-v3.5-plus" },
    { aliasKey: "tts-hd", isConfigured: true, modelName: "speech-2.8-hd" },
    { aliasKey: "tts-turbo", isConfigured: true, modelName: "speech-2.8-turbo" }
  ];
  assert.equal(
    resolveAutomaticVoiceModel(models, { supportedModels: ["speech-2.8-turbo", "speech-2.8-hd"] })?.aliasKey,
    "tts-turbo"
  );
});
