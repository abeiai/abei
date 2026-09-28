import assert from "node:assert/strict";
import test from "node:test";

import {
  applyPepBookCorrections,
  assertPepWordlistQuality,
  parsePepTypingWordlist
} from "./pep-typing-wordlist.js";
import type { ParsedTypingWordlist } from "./typing-wordlist-parser.js";

test("只解析 Words in each unit，并在 Vocabulary 前停止", () => {
  const parsed = parsePepTypingWordlist(`# 目录
Appendix 2: Words in each unit

## 第 75 页
### Words in each unit
### 单元词汇表
（注：黑体词要求掌握。）
### Unit 1
classroom /'kla:sru:m/ 教室 p.5
teacher's desk 讲台 p.8
### Unit 2
schoolbag /'sku:lbaeg/ 书包 p.15
### Vocabulary
classroom /'kla:sru:m/ 教室
extra /'ekstrə/ 额外的
`, [4, 14]);

  assert.deepEqual(parsed.units.map((unit) => unit.items.map((item) => item.text)), [
    ["classroom", "teacher's desk"],
    ["schoolbag"]
  ]);
});

test("支持 Unit 标题与多个词条粘连，并忽略跨页 Appendix 页眉", () => {
  const parsed = parsePepTypingWordlist(`## 第 59 页
### Words in each unit
Unit 1younger /'jʌngə(r)/ 更年轻的 p.5older /'əuldə(r)/ 更年长的 p.5
### 单元词汇表
than /δən/ 比 p.4
## 第 60 页
### Appendix 2
### Unit 2
cleaned /kli:nd/ 打扫 p.15stayed /steid/ 停留 p.15
### Vocabulary
ignored /ɪg'nɔːd/ 忽略的
`, [4, 14]);

  assert.deepEqual(parsed.units.map((unit) => unit.items.map((item) => item.text)), [
    ["younger", "older", "than"],
    ["cleaned", "stayed"]
  ]);
});

test("按教材页码修复缺失的 Unit 2 标题", () => {
  const parsed = parsePepTypingWordlist(`### Words in each unit
### Unit 1
science /'saiəns/ 科学 p.5
far /fa:(r)/ 远的 p.8
on foot 步行 p.15
ferry /'feri/ 轮渡 p.18
### Unit 3
visit /'vizit/ 拜访 p.25
### Vocabulary
`, [4, 14, 24]);

  assert.deepEqual(parsed.units.map((unit) => unit.items.map((item) => item.text)), [
    ["science", "far"],
    ["on foot", "ferry"],
    ["visit"]
  ]);
});

test("清除人民教育出版社和 Appendix 页眉，避免污染相邻词条", () => {
  const parsed = parsePepTypingWordlist(`### Words in each unit
### Unit 1
play sports 做体育运动 p.19
### 人民教育出版社
should /Səd/ 应该 p.19
### Appendix 2. ......
every /evri/ 每一个 p.19
### Vocabulary
`, [4]);

  assert.deepEqual(parsed.units[0]!.items.map((item) => item.text), [
    "play sports",
    "should",
    "every"
  ]);
});

test("按教材修复 OCR 丢词、伪词条和被音标拆断的词组", () => {
  const grade3A = applyPepBookCorrections("3a", parsed([
    ["red", "小熊猫"],
    ["o'clock", "表示整点)"],
    ["......", "点钟"]
  ]));
  assert.deepEqual(grade3A.units[0]!.items.map((item) => [item.text, item.translation]), [
    ["red panda", "小熊猫"],
    ["o'clock", "（表示整点）……点钟"],
    ["one", "一"]
  ]);

  const grade3B = applyPepBookCorrections("3b", parsed([
    ["where", "在哪里；到哪里"],
    ["about", "大约；左右"],
    ["shelf", "复数"],
    ["shelves", "架子"],
    ["in", "在课堂上"]
  ]));
  assert.deepEqual(grade3B.units[0]!.items.map((item) => item.text), [
    "where",
    "from",
    "about",
    "shelf",
    "in class"
  ]);

  const grade4 = applyPepBookCorrections("4a", parsed([
    ["maths", "数学书"],
    ["living", "客厅；起居室"],
    ["baby", "婴儿小弟弟"]
  ]));
  assert.deepEqual(grade4.units[0]!.items.map((item) => item.text), [
    "maths book",
    "living room",
    "baby brother"
  ]);
});

test("从真实教材原始词条恢复比较级、过去式和复数说明", () => {
  const grade6B = applyPepBookCorrections("6b", parsed([
    ["younger", "的比较级)更年轻的", "younger /'jʌngə(r)/ （young 的比较级）更年轻的"],
    ["cleaned", "的过去式)打扫", "cleaned /kli:nd/（clean 的过去式）打扫"],
    ["mice", "的复数) 老鼠", "mice/maIs/（mouse的复数） 老鼠"]
  ]));

  assert.deepEqual(grade6B.units[0]!.items.map((item) => item.translation), [
    "（young 的比较级）更年轻的",
    "（clean 的过去式）打扫",
    "（mouse 的复数）老鼠"
  ]);

  const grade5B = applyPepBookCorrections("5b", parsed([
    [
      "jumping",
      "的-ing形式)(正在)跳",
      "jumping /'d3Ampin/ ( jump /d3Amp/ 的-ing形式）（正在）跳"
    ]
  ]));
  assert.equal(
    grade5B.units[0]!.items[0]!.translation,
    "（jump /d3Amp/ 的-ing 形式）（正在）跳"
  );

  const abbreviation = applyPepBookCorrections("5b", parsed([
    ["RSVP", "尤用于请柬)请赐复", "RSVP（尤用于请柬）请赐复"]
  ]));
  assert.equal(abbreviation.units[0]!.items[0]!.translation, "（尤用于请柬）请赐复");

  const noPhoneticOcr = applyPepBookCorrections("5b", parsed([
    ["readingabook", "正在)看书", "readingαbook（正在）看书"]
  ]));
  assert.deepEqual(
    [noPhoneticOcr.units[0]!.items[0]!.text, noPhoneticOcr.units[0]!.items[0]!.translation],
    ["reading a book", "（正在）看书"]
  );

  const grade3B = applyPepBookCorrections("3b", parsed([
    ["long", "长度或距离)长的", "*long /lpn／（长度或距离）长的"]
  ]));
  assert.equal(
    grade3B.units[0]!.items.find((item) => item.text === "long")!.translation,
    "（长度或距离）长的"
  );
});

test("精确修复真实教材中的 OCR 残片", () => {
  const grade3B = applyPepBookCorrections("3b", parsed([["twenty", "二+"]]));
  assert.equal(grade3B.units[0]!.items.find((item) => item.text === "twenty")!.translation, "二十");
  assert.equal(applyPepBookCorrections("5a", parsed([["do", "做；千"]])).units[0]!.items[0]!.translation, "做；干");
  assert.equal(applyPepBookCorrections("5b", parsed([["leaf", "叶子(复数"]])).units[0]!.items[0]!.translation, "叶子（复数 leaves）");
  assert.equal(applyPepBookCorrections("6b", parsed([["metre", "米(美式英语:"]])).units[0]!.items[0]!.translation, "米（美式英语：meter）");
});

test("质量校验拒绝词形说明截断和括号不完整的释义", () => {
  assert.throws(
    () => assertPepWordlistQuality(parsed([["younger", "的比较级)更年轻的"]]), "测试教材"),
    /未清理词条/u
  );
  assert.throws(
    () => assertPepWordlistQuality(parsed([["leaf", "叶子（复数"]]), "测试教材"),
    /未清理词条/u
  );
});

function parsed(entries: [string, string, string?][]): ParsedTypingWordlist {
  return {
    sourceHash: "hash",
    units: [{
      code: "unit-01",
      items: entries.map(([text, translation, sourceRaw], index) => ({
        britishPhonetic: null,
        isSpellingRequired: true,
        itemType: text.includes(" ") ? "PHRASE" : "WORD",
        normalizedText: text.toLocaleLowerCase("en-GB"),
        partOfSpeech: null,
        sourceOrder: index + 1,
        sourcePage: 4,
        sourceRaw: sourceRaw ?? `${text} ${translation}`,
        text,
        translation
      })),
      number: 1,
      sourcePageEnd: 4,
      sourcePageStart: 4,
      title: "Unit 1"
    }]
  };
}
