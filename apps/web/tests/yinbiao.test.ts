import { studioMedia } from "../src/lib/yinbiao/studio-media";
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { containsSound, groups, phonemes, tokenizePhonetic, wordLengths } from "../src/lib/yinbiao/catalog";
import type { WordEntry } from "../src/lib/yinbiao/catalog";
const words = JSON.parse(readFileSync(new URL("../src/lib/yinbiao/words.json", import.meta.url), "utf8")) as Record<string, Record<string, WordEntry[]>>;

test("图片分类包含 20 个元音、28 个辅音且各出现一次", () => {
  assert.equal(phonemes.length, 48);
  assert.equal(new Set(phonemes.map((p) => p.id)).size, 48);
  assert.deepEqual(groups.map((g) => g.symbols.length), [5, 7, 8, 8, 8, 3, 3, 6]);
  assert.deepEqual(new Set(groups.flatMap((g) => [...g.symbols])), new Set(phonemes.map((p) => p.symbol)));
});

test("音标切分不会把长音、双元音和破擦音误判为单音", () => {
  assert.equal(containsSound(tokenizePhonetic("ʃiːp"), "ɪ"), false);
  assert.equal(containsSound(tokenizePhonetic("ˈteɪbl"), "ɪ"), false);
  assert.equal(containsSound(tokenizePhonetic("tʃeə"), "ʃ"), false);
  assert.equal(containsSound(tokenizePhonetic("kæts"), "ts"), true);
  assert.equal(containsSound(tokenizePhonetic("bedz"), "dz"), true);
  assert.equal(containsSound(tokenizePhonetic("dres"), "dr"), true);
});

test("所有词汇满足字母数、目标读音、数量上限与中文释义", () => {
  for (const phoneme of phonemes) {
    assert.ok(phoneme.tip && phoneme.mistake && phoneme.name && phoneme.mouth);
    for (const length of wordLengths) {
      const entries = words[phoneme.symbol][length];
      assert.ok(Array.isArray(entries));
      assert.ok(entries.length <= 5);
      assert.equal(new Set(entries.map((w) => w.word)).size, entries.length);
      for (const entry of entries) {
        assert.match(entry.word, new RegExp(`^[a-z]{${length}}$`));
        assert.match(entry.meaning, /[\u4e00-\u9fff]/);
        assert.deepEqual(tokenizePhonetic(entry.phonetic), entry.tokens, entry.word);
        assert.ok(containsSound(entry.tokens, phoneme.symbol), `${entry.word} 缺少 ${phoneme.symbol}`);
      }
    }
  }
});

test("没有可靠素材时不把标准录音冒充男女声，不凑造稀缺词", () => {
  for (const p of phonemes) {
    if (p.maleAudio && p.femaleAudio) assert.notEqual(p.maleAudio, p.femaleAudio);
  }
  assert.deepEqual(words["ʒ"][3], []);
  assert.ok(words["ɔɪ"][3].some((w) => w.word === "boy"));
  assert.ok(words["ɔː"][3].some((w) => w.word === "all"));
});


test("LearnIPA 示例覆盖 44 个音标且所有录音已下载", () => {
  assert.equal(phonemes.filter((p) => p.example).length, 44);
  for (const p of phonemes) {
    if (!p.example) { assert.ok(["ts", "dz", "tr", "dr"].includes(p.symbol)); continue; }
    assert.match(p.example.audio, /^\/yinbiao\/clips\/male-[a-f0-9-]+-(word|keyword)\.wav$/);
    assert.ok(readFileSync(new URL(`../public${p.example.audio}`, import.meta.url)).length > 1000);
  }
  assert.equal(phonemes.find((p) => p.symbol === "tʃ")?.example?.word, "chin");
  assert.equal(phonemes.find((p) => p.symbol === "ɡ")?.example?.word, "get");
  assert.equal(phonemes.find((p) => p.symbol === "aɪ")?.example?.word, "buy");
});

test("Studio 女声覆盖 44 项，动图仅使用原始 GIF", () => {
  assert.equal(phonemes.filter((p) => p.femaleAudio).length, 48);
  assert.equal(phonemes.filter((p) => p.animation).length, 7);
  for (const p of phonemes) {
    if (p.femaleAudio && !["ts", "dz", "tr", "dr"].includes(p.symbol)) {
      assert.ok(p.femaleAudio.startsWith("/yinbiao/clips/female-"));
      assert.ok(readFileSync(new URL(`../public${p.femaleAudio}`, import.meta.url)).length > 1000);
    }
    if (p.animation) assert.match(readFileSync(new URL(`../public${p.animation}`, import.meta.url)).subarray(0, 6).toString(), /^GIF8[79]a$/);
  }
  assert.ok(phonemes.find((p) => p.symbol === "aɪ")?.animation);
  assert.equal(phonemes.find((p) => p.symbol === "ts")?.femaleAudio, "/yinbiao/custom/ts-female.wav");
  assert.equal(phonemes.find((p) => p.symbol === "dz")?.femaleAudio, "/yinbiao/custom/dz-female.mp3");
  assert.ok(readFileSync(new URL("../public/yinbiao/custom/dz-female.mp3", import.meta.url)).length > 1000);
  assert.equal(phonemes.find((p) => p.symbol === "dr")?.femaleAudio, "/yinbiao/custom/dr-female.mp3");
  assert.ok(readFileSync(new URL("../public/yinbiao/custom/dr-female.mp3", import.meta.url)).length > 1000);
  assert.equal(phonemes.find((p) => p.symbol === "tr")?.femaleAudio, "/yinbiao/custom/tr-female.mp3");
  assert.ok(readFileSync(new URL("../public/yinbiao/custom/tr-female.mp3", import.meta.url)).length > 1000);
});

test("SpeechSTAR 为 24 个辅音提供本地 MP4，不误配元音或组合音", () => {
  assert.equal(phonemes.filter((p) => p.animationVideo).length, 24);
  for (const p of phonemes) {
    if (!p.animationVideo) continue;
    assert.ok(!groups.slice(0, 3).some((g) => (g.symbols as readonly string[]).includes(p.symbol)));
    assert.ok(!["ts", "dz", "tr", "dr"].includes(p.symbol));
    assert.ok(p.animationVideo.startsWith("/yinbiao/speechstar/"));
    assert.ok(readFileSync(new URL(`../public${p.animationVideo}`, import.meta.url)).subarray(0, 32).includes(Buffer.from("ftyp")));
  }
});

test("Studio 映射按图表实际位置核对，不能把内部按钮编号当音标编号", () => {
  // 独立核对源图表例词、CSS 点击区域和 audio 元素后的原文件编号。
  const expected: Record<string, string> = {
    "iː": "1", "ɪ": "2", "e": "3", "eə": "4", "æ": "5", "uː": "6",
    "ə": "7", "ɜː": "8", "ʌ": "9", "ɑː": "10", "ʊ": "11", "ɔː": "12", "ɒ": "13a",
    "ɪə": "14", "eɪ": "15", "aʊ": "16", "əʊ": "17", "aɪ": "18", "ʊə": "20", "ɔɪ": "19",
    "f": "21", "v": "22", "θ": "23", "ð": "24", "s": "25", "z": "26", "ʃ": "27", "ʒ": "28", "h": "29",
    "p": "30", "b": "31", "t": "32", "d": "33", "k": "34", "ɡ": "35", "tʃ": "36", "dʒ": "37",
    "w": "38", "r": "39", "j": "40", "l": "41", "m": "42", "n": "43", "ŋ": "44"
  };
  for (const [symbol, file] of Object.entries(expected)) {
    assert.equal(studioMedia[symbol]?.femaleAudio, `/yinbiao/studio/ipa-${file}.mp3`, symbol);
  }
  assert.ok(!phonemes.some((p) => /ipa-(45|46)\.mp3$/.test(p.femaleAudio ?? "")));
});
