import assert from "node:assert/strict";
import test from "node:test";

import sharp from "sharp";

import {
  classifyVoice,
  previewTextForVoice
} from "./voice-library-classification.js";
import {
  avatarPromptForVoice,
  avatarSpecForVoice,
  normalizeGeneratedVoiceAvatarJpeg,
  voiceAvatarFilename
} from "./voice-avatar-renderer.js";

test("MiniMax 中文站标签直接映射四项分类", () => {
  assert.deepEqual(
    classifyVoice({
      providerVoiceId: "English_expressive_narrator",
      name: "活力旁白",
      language: "英文",
      metadataTags: ["英语", "英语-英音", "女", "青年"]
    }),
    {
      language: "英语",
      accent: "英式英语",
      gender: "女声",
      ageCategory: "青年"
    }
  );
});

test("CosyVoice 多语种字段保留主语种并识别方言和人物属性", () => {
  assert.deepEqual(
    classifyVoice({
      providerVoiceId: "longlaotie",
      name: "龙老铁",
      language: "中文（东北话）、英文",
      languages: ["普通话", "美式英语"],
      trait: "爽朗中年男声",
      age: "35~40岁",
      ageCategory: "中年"
    }),
    {
      language: "中文",
      accent: "东北话",
      gender: "男声",
      ageCategory: "中年"
    }
  );
});

test("ElevenLabs 标签映射美式英语、中年和女声", () => {
  assert.deepEqual(
    classifyVoice({
      providerVoiceId: "voice-id",
      name: "Bella",
      language: "en",
      providerLabels: {
        accent: "american",
        age: "middle_aged",
        gender: "female",
        language: "en"
      }
    }),
    {
      language: "英语",
      accent: "美式英语",
      gender: "女声",
      ageCategory: "中年"
    }
  );
});

test("旧版 MiniMax 音色可从角色名称和 ID 归类", () => {
  assert.deepEqual(
    classifyVoice({
      providerVoiceId: "female-shaonv",
      name: "少女音色",
      language: "中文 (普通话)"
    }),
    {
      language: "中文",
      accent: "普通话",
      gender: "女声",
      ageCategory: "青年"
    }
  );
  assert.deepEqual(
    classifyVoice({
      providerVoiceId: "Santa_Claus",
      name: "Santa Claus",
      language: "英文"
    }),
    {
      language: "英语",
      accent: "标准英语",
      gender: "男声",
      ageCategory: "老年"
    }
  );
  assert.deepEqual(
    classifyVoice({
      providerVoiceId: "female-chengshu",
      name: "成熟女性音色",
      language: "中文 (普通话)",
      ageCategory: "青年"
    }),
    {
      language: "中文",
      accent: "普通话",
      gender: "女声",
      ageCategory: "中年"
    }
  );
  assert.equal(
    classifyVoice({ providerVoiceId: "qiaopi_mengmei", name: "俏皮萌妹", language: "中文" }).gender,
    "女声"
  );
  assert.equal(
    classifyVoice({ providerVoiceId: "longanhuan", name: "龙安欢", trait: "欢脱元气女", language: "中文" }).gender,
    "女声"
  );
});

test("音色设计描述中的英语口音优先于旧语言代码", () => {
  assert.deepEqual(
    classifyVoice({
      providerVoiceId: "designed-teacher",
      name: "口音女教师",
      language: "zh-CN",
      description: "一位亲切的中学女英语教师，地道的美式英语发音。"
    }),
    {
      language: "英语",
      accent: "美式英语",
      gender: "女声",
      ageCategory: "青年"
    }
  );
});

test("试听文本会随语种与角色特点变化", () => {
  const teacher = {
    language: "中文",
    accent: "普通话",
    gender: "女声" as const,
    ageCategory: "青年" as const
  };
  const child = { ...teacher, ageCategory: "儿童" as const };
  const english = { ...teacher, language: "英语", accent: "英式英语" };

  assert.match(previewTextForVoice({ name: "温柔女教师", scene: "在线教育" }, teacher), /知识|课堂/);
  assert.match(previewTextForVoice({ name: "聪明男童" }, child), /故事|想象/);
  assert.match(previewTextForVoice({ name: "Trustworthy Man", scene: "narration" }, english), /story|journey/);
});

test("已确认的年龄分类不会被用途文案或 Elder Sister 覆盖", () => {
  assert.equal(
    classifyVoice({
      providerVoiceId: "Chinese_patitent_teacher",
      name: "温柔女教师",
      description: "适合在线教育课程与儿童辅导",
      ageCategory: "青年"
    }).ageCategory,
    "青年"
  );
  assert.equal(
    classifyVoice({
      providerVoiceId: "Korean_CharmingElderSister",
      name: "Charming Elder Sister",
      description: "成熟御姐角色",
      ageCategory: "中年"
    }).ageCategory,
    "中年"
  );
  assert.equal(
    classifyVoice({
      providerVoiceId: "Chinese (Mandarin)_Gentle_Senior",
      name: "温柔学姐",
      trait: "温婉柔和",
      ageCategory: "青年"
    }).ageCategory,
    "青年"
  );
  assert.equal(
    classifyVoice({
      providerVoiceId: "Chinese_Reliable_Executive",
      name: "沉稳高管",
      trait: "低沉厚实，磁性，从容不迫",
      ageCategory: "青年"
    }).ageCategory,
    "中年"
  );
});

test("头像按分类和角色 ID 稳定生成唯一视觉身份与 GPT-Image 2 提示词", async () => {
  const classification = {
    language: "中文",
    accent: "普通话",
    gender: "女声" as const,
    ageCategory: "青年" as const
  };
  const first = avatarSpecForVoice("voice-a", classification);
  const repeated = avatarSpecForVoice("voice-a", classification);
  const second = avatarSpecForVoice("voice-b", classification);

  assert.deepEqual(first, repeated);
  assert.notDeepEqual(first, second);
  assert.equal(first.demographic, "female-young");
  assert.equal(first.version, "v6");
  assert.match(first.regionalAppearance, /East Asian/);
  assert.notEqual(first.visualIdentityKey, second.visualIdentityKey);
  assert.notEqual(
    avatarPromptForVoice(first, { name: "温柔女教师", trait: "亲切耐心" }),
    avatarPromptForVoice(second, { name: "温柔女教师", trait: "亲切耐心" })
  );
  assert.match(avatarPromptForVoice(first), /GPT-Image 2/);
  assert.match(avatarPromptForVoice(first), /no text/i);
  assert.match(voiceAvatarFilename("voice-a", first), /^voice-a-[a-f0-9]{10}-v6-/);

  const generated = await sharp({
    create: { width: 1024, height: 1024, channels: 3, background: "#5aa7e8" }
  }).png().toBuffer();
  const jpeg = await normalizeGeneratedVoiceAvatarJpeg(generated);
  const metadata = await sharp(jpeg).metadata();
  assert.equal(metadata.width, 512);
  assert.equal(metadata.height, 512);
  assert.equal(metadata.format, "jpeg");
  assert.equal(
    new Set(Array.from({ length: 32 }, (_, index) => avatarSpecForVoice(`voice-${index}`, classification).signature)).size,
    32
  );
  assert.ok(
    new Set(Array.from({ length: 64 }, (_, index) => avatarSpecForVoice(`voice-${index}`, classification).background)).size >= 12
  );
  assert.equal(
    new Set(Array.from({ length: 512 }, (_, index) => avatarSpecForVoice(`voice-${index}`, classification).visualIdentityKey)).size,
    512
  );
});

test("头像视觉特征由声音角色语义决定", () => {
  const teacher = avatarSpecForVoice(
    "teacher",
    { language: "中文", accent: "普通话", gender: "女声", ageCategory: "青年" },
    { name: "温柔女教师", trait: "亲切耐心", scene: "在线教育" }
  );
  const international = avatarSpecForVoice(
    "british-narrator",
    { language: "英语", accent: "英式英语", gender: "女声", ageCategory: "青年" },
    { name: "Warm British Narrator", trait: "gentle storytelling", language: "en" }
  );
  const executive = avatarSpecForVoice(
    "deep-executive",
    { language: "中文", accent: "普通话", gender: "男声", ageCategory: "中年" },
    { name: "沉稳高管", trait: "低沉厚实，磁性，权威", scene: "企业宣传与旁白" }
  );
  const child = avatarSpecForVoice(
    "playful-girl",
    { language: "中文", accent: "普通话", gender: "女声", ageCategory: "儿童" },
    { name: "活泼女童", trait: "俏皮元气", scene: "儿童故事" }
  );
  const senior = avatarSpecForVoice(
    "wise-senior",
    { language: "中文", accent: "普通话", gender: "男声", ageCategory: "老年" },
    { name: "沧桑智者", trait: "厚重睿智" }
  );

  assert.equal(teacher.visualArchetype, "academic");
  assert.notEqual(teacher.eyewear, "no eyewear");
  assert.equal(international.visualArchetype, "storyteller");
  assert.match(international.regionalAppearance, /European/);
  assert.match(international.hairColor, /blonde|auburn|brown|copper/);
  assert.equal(executive.visualArchetype, "authoritative");
  assert.notEqual(executive.facialHair, "clean-shaven");
  assert.match(executive.wardrobe, /blazer|suit|shirt|coat/);
  assert.equal(child.visualArchetype, "playful");
  assert.match(child.hairStyle, /braid|ponytail|bun|pigtail/);
  assert.match(senior.hairColor, /silver|white|gray/);
  assert.notEqual(senior.facialHair, "clean-shaven");
});
