import assert from "node:assert/strict";
import test from "node:test";

import {
  applyTypingWordlistCorrections,
  normalizeTypingAnswer,
  parseTypingAlphabeticalWordlist,
  parseTypingPrimaryAlphabeticalWordlist,
  parseTypingPrimaryWordlist,
  parseTypingWordlist
} from "./typing-wordlist-parser.js";

const markdown = `# 教材

### Wordlist (by unit)

注：带*号的单词只要求会读、听得懂，不要求拼写。

### Unit 1

greet /gri:t/vt.和某人打招呼 (7) be good at 擅长…… (8） *apart /ə'pa:t/ adv.分开 (20)

![第 150 页原版页面图](https://example.test/page-150.png)

---

## 第 151 页

Chinese chess n.中国象棋 (15)

### Unit 2

paint /peint/vi.&vt.用颜料画
vt.在……上刷油漆 (19)

### Wordlist (in alphabetical order)

apart /ə'pa:t/ adv.分开 (20)
`;

test("按单元解析普通单词、短语、星号和跨行释义", () => {
  const parsed = parseTypingWordlist(markdown);

  assert.equal(parsed.units.length, 2);
  assert.deepEqual(parsed.units.map((unit) => unit.items.length), [4, 1]);
  assert.deepEqual(parsed.units[0]?.items[0], {
    britishPhonetic: "gri:t",
    isSpellingRequired: true,
    itemType: "WORD",
    normalizedText: "greet",
    partOfSpeech: "vt.",
    sourceOrder: 1,
    sourcePage: 7,
    sourceRaw: "greet /gri:t/vt.和某人打招呼",
    text: "greet",
    translation: "和某人打招呼"
  });
  assert.equal(parsed.units[0]?.items[1]?.text, "be good at");
  assert.equal(parsed.units[0]?.items[1]?.itemType, "PHRASE");
  assert.equal(parsed.units[0]?.items[2]?.text, "apart");
  assert.equal(parsed.units[0]?.items[2]?.isSpellingRequired, false);
  assert.equal(parsed.units[0]?.items[3]?.text, "Chinese chess");
  assert.equal(parsed.units[0]?.items[3]?.partOfSpeech, "n.");
  assert.equal(parsed.units[1]?.items[0]?.translation, "用颜料画 vt.在……上刷油漆");
});

test("解析高中教材带编号且标题层级不一致的按单元词表", () => {
  const parsed = parseTypingWordlist(`
## 第 101 页

### Wordlist 1(by unit)

### Unit 1

potential /pə'tenʃl/ n. 潜力；可能性 (2)
make a difference 起作用，有影响 (3)

### Unit 2

path /pɑːθ/ n. 道路 (16)

## Wordlist 2 (in alphabetical order)

### A

path /pɑːθ/ n. 道路 (16)
`);

  assert.deepEqual(parsed.units.map((unit) => unit.items.map((item) => item.text)), [
    ["potential", "make a difference"],
    ["path"]
  ]);
});

test("忽略按字母排序的重复词表并保留稳定来源哈希", () => {
  const first = parseTypingWordlist(markdown);
  const second = parseTypingWordlist(markdown);
  const changed = parseTypingWordlist(markdown.replace("用颜料画", "使用颜料画"));

  assert.equal(first.sourceHash, second.sourceHash);
  assert.notEqual(first.sourceHash, changed.sourceHash);
  assert.match(first.sourceHash, /^[a-f0-9]{64}$/u);
  assert.equal(first.units[1]?.items.length, 1);
});

test("规范答案统一大小写、全角标点和多余空格", () => {
  assert.equal(normalizeTypingAnswer("  Chinese　Chess！ "), "chinese chess!");
  assert.equal(normalizeTypingAnswer("Be   Ready  To Do Sth"), "be ready to do sth");
});

test("修复页码缺少右括号造成的相邻词条粘连", () => {
  const broken = `### Wordlist (by unit)
### Unit 1
be interested in 对……感兴趣 (8 looks /luks/n.[pl.]相貌 (10)
### Wordlist (in alphabetical order)`;

  const items = parseTypingWordlist(broken).units[0]?.items ?? [];

  assert.deepEqual(items.map((item) => item.text), ["be interested in", "looks"]);
  assert.deepEqual(items.map((item) => item.sourcePage), [8, 10]);
});

test("拆分高中双栏 OCR 中上一条中文续义与下一英文词条的粘连", () => {
  const broken = `### Wordlist 1(by unit)
### Unit 1
blame /bleim/vt.责怪 (44) 谴责；使……承担责任；使充满 pay off 成功，奏效，达到目的 (45)
### Wordlist 2 (in alphabetical order)`;

  const items = parseTypingWordlist(broken).units[0]?.items ?? [];

  assert.deepEqual(items.map((item) => item.text), ["blame", "pay off"]);
  assert.equal(items[0]?.translation, "责怪；谴责；使……承担责任；使充满");
  assert.equal(items[1]?.translation, "成功，奏效，达到目的");
});

test("把紧邻中文释义的括号或尖括号保留在释义而不是词性中", () => {
  const edgeCases = `### Wordlist (by unit)
### Unit 1
full /ful/adj.(有)大量的 (8) flat /flaet/n.<英>公寓 (82)
### Wordlist (in alphabetical order)`;

  const items = parseTypingWordlist(edgeCases).units[0]?.items ?? [];

  assert.deepEqual(items.map((item) => item.partOfSpeech), ["adj.", "n."]);
  assert.deepEqual(items.map((item) => item.translation), ["(有)大量的", "<英>公寓"]);
});

test("修复教材转换中粘连的词性、短语空格和缺失的音标斜线", () => {
  const converted = `### Wordlist (by unit)
### Unit 1
role modeln.楷模 (27) field tripn.野外考察 (44) a setof一套 (81)
*form /fo:m/ teacher n.班主任 (36) *shell Sel/ n.壳 (88)
### Wordlist (in alphabetical order)`;

  const items = parseTypingWordlist(converted).units[0]?.items ?? [];

  assert.deepEqual(items.map((item) => item.text), [
    "role model",
    "field trip",
    "a set of",
    "form teacher",
    "shell"
  ]);
  assert.deepEqual(items.map((item) => item.partOfSpeech), ["n.", "n.", null, "n.", "n."]);
  assert.equal(items[4]?.britishPhonetic, "Sel");
  assert.equal(items[4]?.itemType, "WORD");
});

test("从按字母编排词表按教材页码归入单元并忽略专有名词", () => {
  const alphabetical = `# 教材

### Wordlist (in alphabetical order)

注：单词音标以 Oxford Advanced Learner's Dictionary (7th Edition) 为依据。

### A

*aboard /ə'bɔ:d/adv.在船上 (6) accept /ək'sept/vt.&vi.接受 (19）是否 (19)

### B

be famous for 因……而著名 (20broken /'brəʊkən/adj.损坏的 (21) vt.弄坏 (22)

### Proper nouns

Beijing /ˌbeɪ'dʒɪŋ/北京 (22)`;

  const parsed = parseTypingAlphabeticalWordlist(alphabetical, [6, 20]);

  assert.equal(parsed.units.length, 2);
  assert.deepEqual(parsed.units.map((unit) => unit.items.map((item) => item.text)), [
    ["aboard", "accept"],
    ["be famous for", "broken"]
  ]);
  assert.deepEqual(parsed.units.map((unit) => unit.items.map((item) => item.sourceOrder)), [
    [1, 2],
    [1, 2]
  ]);
  assert.deepEqual(parsed.units.map((unit) => [unit.sourcePageStart, unit.sourcePageEnd]), [
    [6, 19],
    [20, 21]
  ]);
  assert.equal(parsed.units[0]?.items[0]?.isSpellingRequired, false);
  assert.equal(parsed.units[0]?.items[1]?.translation, "接受；是否");
  assert.equal(parsed.units[1]?.items[0]?.itemType, "PHRASE");
  assert.equal(parsed.units[1]?.items[1]?.translation, "损坏的；vt.弄坏");
});

test("解析高中教材带编号且标题层级不一致的字母词表", () => {
  const parsed = parseTypingAlphabeticalWordlist(`
## Wordlist 2 (in alphabetical order)

### A

advance /əd'vɑːns/ n. 进步 (3)

### P

path /pɑːθ/ n. 道路 (16)

### Wordlist 3 (proper nouns)

London 伦敦 (16)
`, [2, 16]);

  assert.deepEqual(parsed.units.map((unit) => unit.items.map((item) => item.text)), [
    ["advance"],
    ["path"]
  ]);
});

test("清理字母词表中的页眉、双栏残片和可确定的 OCR 漏字", () => {
  const converted = `### Wordlist (in alphabetical order)
### A
132 *calm /ka:m/adj.平静的 (6)
### B
“BBQ abbr.(= barbecue /'ba:bikju:/）户外烧烤 (7)
### H
had better(='d better) 最好 (8)
### I
/nkri:s/n.增加 (9) 水 interplanetary /,intə'plænətri/adj.行星间的 (10)
### L
=<美>license lie /laɪ/vi.位于 (11)
### M
music video n.(=MV)音乐视频 (12)
### O
### 0 *ocean /'əʊʃn/n.海洋 (13) 0r /ɔ:/conj.否则 (14)
### R
/rɪ'kɔ:d/vt.录制 (15)
### Proper nouns`;

  const items = parseTypingAlphabeticalWordlist(converted, [6]).units[0]?.items ?? [];

  assert.deepEqual(items.map((item) => item.text), [
    "calm",
    "BBQ",
    "had better",
    "increase",
    "interplanetary",
    "lie",
    "music video",
    "ocean",
    "or",
    "record"
  ]);
  assert.equal(items[6]?.partOfSpeech, "n.");
});

test("从小学教材按单元词表解析单行和跨行词条", () => {
  const primary = `# 教材
## 第 95 页
### Word lists
### Unit 1
bear 熊
one ..., the other ...
一个……，另一个……
![教材插图](https://example.test/one.png)
## 第 96 页
### Unit 2
What would you like?
你想要什么？
let's = let us
student 学生
## 第 97 页
注：括号中的数字为该词条在本册书中首次出现时的单元数。
### A
bear 熊 (1)`;

  const parsed = parseTypingPrimaryWordlist(primary);

  assert.deepEqual(parsed.units.map((unit) => unit.items.map((item) => item.text)), [
    ["bear", "one ..., the other ..."],
    ["What would you like?", "student"]
  ]);
  assert.equal(parsed.units[0]?.items[1]?.translation, "一个……，另一个……");
  assert.equal(parsed.units[1]?.items[0]?.translation, "你想要什么？");
  assert.deepEqual(parsed.units.map((unit) => [unit.sourcePageStart, unit.sourcePageEnd]), [
    [95, 95],
    [96, 96]
  ]);
});

test("小学旧版词表提取词条尾部首次出现页码", () => {
  const primary = `### Word lists
## 第 79 页
### Unit 1
school 学校 (8)
colour 颜色（66)
说明：本表按字母顺序收录各单元的生词。`;

  const items = parseTypingPrimaryWordlist(primary).units[0]?.items ?? [];

  assert.deepEqual(items.map((item) => item.translation), ["学校", "颜色"]);
  assert.deepEqual(items.map((item) => item.sourcePage), [8, 66]);
});

test("小学按单元词表按出现顺序纠正 OCR 单元标题并支持补充分界", () => {
  const primary = `### Word lists
## 第 63 页
### Unit 1
school 学校
### Unit 8
rule 规则
## 第 64 页
season 季节
### Unit 6
dress 连衣裙
注：括号中的数字为该词条在本册书中首次出现时的单元数。`;

  const parsed = parseTypingPrimaryWordlist(primary, {
    insertUnitBefore: ["season 季节"]
  });

  assert.deepEqual(parsed.units.map((unit) => unit.number), [1, 2, 3, 4]);
  assert.deepEqual(parsed.units.map((unit) => unit.items.map((item) => item.text)), [
    ["school"],
    ["rule"],
    ["season"],
    ["dress"]
  ]);
});

test("从小学新版字母词表按首次出现页码归入单元", () => {
  const primary = `# 教材
### II
说明：本表按字母顺序收录各单元的生词、短语和重要句型。
### A
apple 苹果 (9)
after class 课后 (17)
### B
book 书 (18)
### III
说明：本表收录专有名词。`;

  const parsed = parseTypingPrimaryAlphabeticalWordlist(primary, [9, 17]);

  assert.deepEqual(parsed.units.map((unit) => unit.items.map((item) => item.text)), [
    ["apple"],
    ["after class", "book"]
  ]);
  assert.deepEqual(parsed.units.map((unit) => unit.items.map((item) => item.sourceOrder)), [
    [1],
    [1, 2]
  ]);
});

test("小学词表统一修正常见 OCR 字符和粘连空格", () => {
  const primary = `### Word lists
## 第 70 页
### Unit 1
have α look 看一看
Can Ihelp you? 我能帮助你吗？
Welldone. 做得好。
Whata pity! 真遗憾！
tiger : 老虎
move ...away 搬走
drive .. away 赶走
说明：本表按字母顺序收录各单元的生词。`;

  const items = parseTypingPrimaryWordlist(primary).units[0]?.items ?? [];

  assert.deepEqual(items.map((item) => item.text), [
    "have a look",
    "Can I help you?",
    "Well done.",
    "What a pity!",
    "tiger",
    "move ... away",
    "drive ... away"
  ]);
});

test("按单元和来源顺序修复、拆分、删除并追加 OCR 词条", () => {
  const primary = `### Word lists
## 第 80 页
### Unit 1
Good afternoo 下午好
broken entry 错误词条
keep 保留
说明：本表按字母顺序收录各单元的生词。`;
  const parsed = parseTypingPrimaryWordlist(primary);
  const corrected = applyTypingWordlistCorrections(parsed, {
    append: [{
      items: [{ sourcePage: 81, text: "I", translation: "我" }],
      unitNumber: 1
    }],
    replacements: [
      {
        items: [{ text: "Good afternoon.", translation: "下午好" }],
        sourceOrder: 1,
        unitNumber: 1
      },
      {
        items: [
          { text: "split", translation: "拆分" },
          { text: "entry", translation: "词条" }
        ],
        sourceOrder: 2,
        unitNumber: 1
      },
      {
        items: [],
        sourceOrder: 3,
        unitNumber: 1
      }
    ]
  });

  assert.deepEqual(corrected.units[0]?.items.map((item) => item.text), [
    "Good afternoon.",
    "split",
    "entry",
    "I"
  ]);
  assert.deepEqual(corrected.units[0]?.items.map((item) => item.sourceOrder), [1, 2, 3, 4]);
  assert.deepEqual(
    [corrected.units[0]?.sourcePageStart, corrected.units[0]?.sourcePageEnd],
    [80, 81]
  );
  assert.equal(corrected.sourceHash, parsed.sourceHash);
});
