import assert from "node:assert/strict";
import test from "node:test";

import {
  parseHujiaoAlphabeticalPageWordlist,
  parseHujiaoPageWordlist,
  parseHujiaoPrimaryDirectWordlist,
  parseHujiaoPrimaryIndexedWordlist,
  parseHujiaoSeniorWordlist,
  reassignHujiaoWordlistByPage
} from "./hujiao-typing-wordlist.js";
import { applyHujiaoBookCorrections } from "./hujiao-typing-wordlist-build.js";

test("解析沪教版小学直接按单元词表并拆开双栏粘连词条", () => {
  const parsed = parseHujiaoPrimaryDirectWordlist(`# 教材
## 第 95 页
### Unit 1
happy 开心的
grandfather (grandpa)（外）祖父；爷爷；外公
### Unit 2
rainy 下雨的 noodles 面条
Unit 3 Happy birthday! 生日快乐！
cake 蛋糕
### Proper nouns
China 中国 p.52`, 3);

  assert.deepEqual(parsed.units.map((unit) => unit.items.map((item) => item.text)), [
    ["happy", "grandfather (grandpa)"],
    ["rainy", "noodles"],
    ["Happy birthday!", "cake"]
  ]);
  assert.deepEqual(parsed.units.map((unit) => [unit.sourcePageStart, unit.sourcePageEnd]), [
    [95, 95],
    [95, 95],
    [95, 95]
  ]);
});

test("解析沪教版小学字母词表尾部的单元编号", () => {
  const parsed = parseHujiaoPrimaryIndexedWordlist(`# 教材
## 第 73 页
### Word list 2 (in alphabetical order)
### A
about 关于 U5
again 再；又 U3
at the weekend 在周末 U8
### B
baby 宝宝；婴儿 U12
### Proper nouns`, 12);

  assert.deepEqual(parsed.units[2]?.items.map((item) => item.text), ["again"]);
  assert.deepEqual(parsed.units[4]?.items.map((item) => item.text), ["about"]);
  assert.deepEqual(parsed.units[7]?.items.map((item) => item.text), ["at the weekend"]);
  assert.deepEqual(parsed.units[11]?.items.map((item) => item.text), ["baby"]);
});

test("小学字母词表兼容双栏标题错位、跨行单元编号和重复 OCR", () => {
  const parsed = parseHujiaoPrimaryIndexedWordlist(`# 教材
## 第 99 页
### A
apple 苹果 U1
policeman 警察
（复数 policemen） U2
### Word list 2 (in alphabetical order)
### A A
apple 苹果 U1
ability 能力U3accept 接受；同意 U3
### Proper nouns`, 3);

  assert.deepEqual(parsed.units.map((unit) => unit.items.map((item) => item.text)), [
    ["apple"],
    ["policeman"],
    ["ability", "accept"]
  ]);
  assert.equal(parsed.units[1]?.items[0]?.translation, "警察（复数 policemen）");
});

test("小学字母标题与词条粘连时不把标题字母写入答案", () => {
  const parsed = parseHujiaoPrimaryIndexedWordlist(`# 教材
### Word list 2 (in alphabetical order)
U uncle 叔叔 U1
Y when 什么时候 U2
### Proper nouns`, 2);

  assert.deepEqual(parsed.units.map((unit) => unit.items.map((item) => item.text)), [
    ["uncle"],
    ["when"]
  ]);
});

test("解析沪教版初中和五四学制带 p 页码的按单元词表", () => {
  const parsed = parseHujiaoPageWordlist(`# 教材
## 第 152 页
### Words and phrases in each unit
### Unit 1
confident /'kɒnfɪdənt/ adj.自信的;
有自信心的 p.5
be willing to do something 愿意做
某事 p.5
### Unit 2
geography /dʒi'ɒgrəfi/ n.地理（学）p.21
ring /rɪŋ／n.环状物 p.22
### Words and phrases in alphabetical order`, 2);

  assert.deepEqual(parsed.units.map((unit) => unit.items.map((item) => item.text)), [
    ["confident", "be willing to do something"],
    ["geography", "ring"]
  ]);
  assert.equal(parsed.units[0]?.items[0]?.britishPhonetic, "'kɒnfɪdənt");
  assert.equal(parsed.units[0]?.items[0]?.partOfSpeech, "adj.");
  assert.equal(parsed.units[0]?.items[0]?.translation, "自信的；有自信心的");
  assert.equal(parsed.units[0]?.items[1]?.translation, "愿意做某事");
  assert.equal(parsed.units[1]?.items[0]?.sourcePage, 21);
});

test("页码词表拆开遗漏页码分隔符的相邻音标词条", () => {
  const parsed = parseHujiaoPageWordlist(`# 教材
### Words and phrases in each unit
### Unit 1
notice /'nəʊtɪs/ n.通知 p.2
n.注意 swan /swɒn/ n.天鹅 p.3
invention /ɪn'venʃn/ n.发明 75 saver /'seɪvə/ n.救助者 p.12
### Words and phrases in alphabetical order`, 1);

  assert.deepEqual(parsed.units[0]?.items.map((item) => item.text), [
    "notice",
    "swan",
    "invention",
    "saver"
  ]);
  assert.equal(parsed.units[0]?.items[0]?.translation, "通知；n.注意");
});

test("页码词表从末尾 Unit 1 起解析并用页码断点补回缺失单元标题", () => {
  const parsed = parseHujiaoPageWordlist(`# 教材
### Unit 1
这是正文，不是词表。
## 第 140 页
### Unit 1
first /fɜːst/ adj.第一 p.1
### Unit 2
second /'sekənd/ adj.第二 p.17
third /θɜːd/ adj.第三 p.20
fourth /fɔːθ/ adj.第四 p.33
### Unit 4
last /lɑːst/ adj.最后的 p.49
### Words and expressions in alphabetical order`, 4);

  assert.deepEqual(parsed.units.map((unit) => unit.items.map((item) => item.text)), [
    ["first"],
    ["second", "third"],
    ["fourth"],
    ["last"]
  ]);
});

test("按字母页码词表依据单元起始页归档并拆开单行多词条", () => {
  const parsed = parseHujiaoAlphabeticalPageWordlist(`# 教材
### Words and expressions in alphabetical order
### A
advice /əd'vaɪs/ n.建议 p.4 battery /'bætəri/ n.电池 p.84
### B
branch /brɑːntʃ/ n.树枝 p.36
### Proper nouns A ### Names of people
Alex /'ælɪks/ 亚历克斯 p.4
### Glossary`, [4, 20, 36, 52, 68, 84]);

  assert.deepEqual(parsed.units.map((unit) => unit.items.map((item) => item.text)), [
    ["advice"],
    [],
    ["branch"],
    [],
    [],
    ["battery"]
  ]);
});

test("页码词表拆开紧邻页码的下一词条并把独立词性续义并回上一词", () => {
  const parsed = parseHujiaoAlphabeticalPageWordlist(`# 教材
### Words and expressions in alphabetical order
### A
east /iːst/ n.东方 p.85 adv.朝东 p.85
keep in touch with 与……保持联系 p.51keep off 远离 p.54
### 一 improve /ɪm'pruːv/ v.改进 p.97
### Proper nouns`, [51, 85, 97]);

  assert.deepEqual(parsed.units.map((unit) => unit.items.map((item) => item.text)), [
    ["keep in touch with", "keep off"],
    ["east"],
    ["improve"]
  ]);
  assert.equal(parsed.units[1]?.items[0]?.translation, "东方；adv.朝东");
});

test("字母词表把跨单元的独立词性继承为上一英文词条", () => {
  const parsed = parseHujiaoAlphabeticalPageWordlist(`# 教材
### Words and expressions in alphabetical order
### P
post /pəʊst/ n.柱；杆 p.35
n.（发在网上的）帖子 p.113
n.邮递 p.123
### Proper nouns`, [33, 113]);

  assert.deepEqual(parsed.units.map((unit) => unit.items.map((item) => item.text)), [
    ["post"],
    ["post"]
  ]);
  assert.equal(parsed.units[1]?.items[0]?.translation, "n.(发在网上的)帖子；n.邮递");
});

test("字母词表把只有音标的第二词性继承为上一英文词条", () => {
  const parsed = parseHujiaoAlphabeticalPageWordlist(`# 教材
### Words and expressions in alphabetical order
### S
survey /'sɜːveɪ/ n.民意调查 p.75
/sə'veɪ/ v.查看；审视 p.99
### Proper nouns`, [75, 99]);

  assert.deepEqual(parsed.units.map((unit) => unit.items.map((item) => item.text)), [
    ["survey"],
    ["survey"]
  ]);
});

test("字母词表把带动词变形的独立词性继承为上一英文词条", () => {
  const parsed = parseHujiaoAlphabeticalPageWordlist(`# 教材
### Words and expressions in alphabetical order
shake /ʃeɪk/ v.握手 p.27
v.(shook, shaken) 摇头 p.27
### Proper nouns`, [20]);

  assert.deepEqual(parsed.units[0]?.items.map((item) => item.text), ["shake"]);
  assert.equal(parsed.units[0]?.items[0]?.translation, "握手；v.(shook, shaken)摇头");
});

test("页码字母标题与词条粘连时不把标题字母写入答案", () => {
  const parsed = parseHujiaoAlphabeticalPageWordlist(`# 教材
### Words and expressions in alphabetical order
### F face /feɪs/ v.面对 p.5
### U unknown /ʌn'nəʊn/ adj.未知的 p.20
### Proper nouns`, [5, 20]);

  assert.deepEqual(parsed.units.map((unit) => unit.items.map((item) => item.text)), [
    ["face"],
    ["unknown"]
  ]);
});

test("按权威单元起始页重新归档页码词表", () => {
  const parsed = parseHujiaoPageWordlist(`# 教材
### Words and phrases in each unit
### Unit 1
one /wʌn/ num.一 p.2
### Unit 2
two /tuː/ num.二 p.16
three /θriː/ num.三 p.31
### Unit 4
four /fɔː/ num.四 p.47
### Words and phrases in alphabetical order`, 4);
  const reassigned = reassignHujiaoWordlistByPage(parsed, [2, 16, 30, 46]);

  assert.deepEqual(reassigned.units.map((unit) => unit.items.map((item) => item.text)), [
    ["one"],
    ["two"],
    ["three"],
    ["four"]
  ]);
});

test("解析沪教版高中按单元释义词表并忽略英文定义", () => {
  const parsed = parseHujiaoSeniorWordlist(`# 教材
## Vocabulary
### Words and phrases by unit
### Unit 1
digital /'dɪdʒɪtl/ adj. using electronic signals 数字式的；数码的
*routine /ruː'tiːn/ n. the normal order in which you do things 常规；正常顺序
### Phrases
video clip a short film viewed on a screen 视频片段；视频剪辑
### Unit 2
path /pɑːθ/ n. a way or track 道路；小径
### Glossary`, 2);

  assert.deepEqual(parsed.units.map((unit) => unit.items.map((item) => item.text)), [
    ["digital", "routine", "video clip"],
    ["path"]
  ]);
  assert.equal(parsed.units[0]?.items[1]?.isSpellingRequired, false);
  assert.equal(parsed.units[0]?.items[2]?.itemType, "PHRASE");
  assert.equal(parsed.units[0]?.items[2]?.translation, "视频片段；视频剪辑");
});

test("高中词表拆开同一行粘连词条、胶合英文定义并在专名区停止", () => {
  const parsed = parseHujiaoSeniorWordlist(`# 教材
### Words and phrases by unit
### Unit 1
inspire /ɪn'spaɪə/ v. to encourage somebody 激励；鼓舞 tip /tɪp/ n. a small piece of advice 指点；提示
### Phrases
hula hoopa large plastic ring that you spin around your waist 呼啦圈
focus onto give attention to one subject 集中注意力
plastic surgery operations that improve your appearance 整容外科手术
neon lightvery bright coloured light 霓虹灯
### Proper nouns
Shanghai 上海
### Glossary`, 1);

  assert.deepEqual(parsed.units[0]?.items.map((item) => item.text), [
    "inspire",
    "tip",
    "hula hoop",
    "focus on",
    "plastic surgery",
    "neon light"
  ]);
});

test("高中短语保留介词组成并拆开胶合英文定义", () => {
  const parsed = parseHujiaoSeniorWordlist(`# 教材
### Words and phrases by unit
### Unit 1
### Phrases
a new lease of lifethe chance to live longer 延年益寿
a handful of as much as can be held in one hand 一把
a bunch ofa large number of things 大量
### Glossary`, 1);

  assert.deepEqual(parsed.units[0]?.items.map((item) => item.text), [
    "a new lease of life",
    "a handful of",
    "a bunch of"
  ]);
});

test("统一修正沪教版 OCR 粘连短语和省略号", () => {
  const parsed = parseHujiaoAlphabeticalPageWordlist(`# 教材
### Words and expressions in alphabetical order
(be) fullof (有)大量的；(有)许多的 p.1
and so on.....* 等等 p.1
animated 'enimeitid/ adj. 动画的 p.1
can'twait to (do sth.) 迫不及待想做某事 p.1
charity 'tfaerəti/ n. 慈善 p.1
drive sb.mad 让某人受不了 p.1
fill ...w.ith..... 用……把……装满 p.1
grey(AmE gray) 灰色的 p.1
get alongwith 和睦相处 p.1
ICT n. (= information and communications technology) 信息通信技术 p.1
keep sb.from (doing) sth. 阻止某人做某事 p.1
lead(somebody) to 带着（某人）到 p.1
make a good impression on.. 给……留下好印象 p.1
payattention to 注意 p.1
playlist 'pleilist/n. 音乐播放清单 p.1
playa joke on sb. 跟某人开玩笑 p.1
remind sb.about sth. 提醒某人某事 p.1
send ..to prison 把某人关进监狱 p.1
setoff 使炸弹爆炸 p.1
sO 如此；所以 p.1
trick sb.into doing sth. 诱使某人做某事 p.1
turn sth.over 使翻转 p.1
whata pity 真可惜 p.1
### Proper nouns`, [1]);
  const corrected = applyHujiaoBookCorrections("8b", parsed);

  assert.deepEqual(corrected.units[0]?.items.map((item) => item.text), [
    "(be) full of",
    "and so on",
    "animated",
    "can't wait to (do sth.)",
    "charity",
    "drive sb. mad",
    "fill...with...",
    "grey (AmE gray)",
    "get along with",
    "ICT",
    "keep sb. from (doing) sth.",
    "lead (somebody) to",
    "make a good impression on...",
    "pay attention to",
    "playlist",
    "play a joke on sb.",
    "remind sb. about sth.",
    "send...to prison",
    "set off",
    "so",
    "trick sb. into doing sth.",
    "turn sth. over",
    "what a pity"
  ]);
});

test("五四学制七年级下册把独立名词释义并回 copy", () => {
  const parsed = parseHujiaoPageWordlist(`# 教材
### Words and phrases in each unit
### Unit 4
copy /ˈkɒpi/ v. 抄袭 p.55
n（书、报纸等的）一本，一册，一份 p.55
### Words and phrases in alphabetical order`, 6);
  const corrected = applyHujiaoBookCorrections("54-7b", parsed);

  assert.deepEqual(corrected.units[3]?.items.map((item) => item.text), ["copy"]);
  assert.equal(corrected.units[3]?.items[0]?.translation, "抄袭；n.(书、报纸等的)一本,一册,一份");
});

test("统一移除沪教版高中短语中粘连的英文释义", () => {
  const parsed = parseHujiaoSeniorWordlist(`# 教材
### Words and phrases by unit
### Unit 1
### Phrases
put ...asideto ignore or forget something 忽视；不理睬；忘记
hang on(informal) used when something is wrong 等等
impose ...onto try to make somebody accept an opinion 使某人接受自己的意见
take ..for grantedto be used to something 对……习以为常
deprive ..ofto take something away 剥夺；使丧失
well offhaving a lot of money 富有的
Chinese knota decorative handicraft that began as a form of Chinese folk art in the Tang and Song Dynasties 中国结
vending machinea machine from which you can buy drinks,etc.by putting money in 自动售货机
be likely tobe probable or expected to 可能做
marine ecosystemsystem of living organisms in the ocean 海洋生态系统
### Glossary`, 1);
  const corrected = applyHujiaoBookCorrections("xb3", parsed);

  assert.deepEqual(corrected.units[0]?.items.map((item) => item.text), [
    "put ...aside",
    "hang on",
    "impose ...on",
    "take ...for granted",
    "deprive ...of",
    "well off",
    "Chinese knot",
    "vending machine",
    "be likely to",
    "marine ecosystem"
  ]);
});

test("沪教版高中词表合并续义并拆开同一行相邻短语", () => {
  const compulsory2 = parseHujiaoSeniorWordlist(`# 教材
### Words and phrases by unit
### Unit 1
### Phrases
check outto look at something 察看
to find out if something is correct 调查；核实
### Glossary`, 4);
  const merged = applyHujiaoBookCorrections("b2", compulsory2);
  assert.deepEqual(merged.units[0]?.items.map((item) => item.text), ["check out"]);
  assert.equal(merged.units[0]?.items[0]?.translation, "察看；调查；核实");

  const selective1 = parseHujiaoSeniorWordlist(`# 教材
### Words and phrases by unit
### Unit 2
### Phrases
weather forecast a description of weather 天气预报 relay racea race between teams 接力赛
### Glossary`, 4);
  const split = applyHujiaoBookCorrections("xb1", selective1);
  assert.deepEqual(split.units[1]?.items.map((item) => item.text), ["weather forecast", "relay race"]);

  const selective4 = parseHujiaoSeniorWordlist(`# 教材
### Words and phrases by unit
### Unit 3
### Phrases
fetch to be sold for a price 售得
to go to where somebody/something is and bring them/it back（去）拿来
### Glossary`, 4);
  const fetch = applyHujiaoBookCorrections("xb4", selective4);
  assert.deepEqual(fetch.units[2]?.items.map((item) => item.text), ["fetch"]);
  assert.equal(fetch.units[2]?.items[0]?.translation, "售得；去）拿来");
});

test("沪教版高中必修第三册移除重复 OCR 损坏词条", () => {
  const parsed = parseHujiaoSeniorWordlist(`# 教材
### Words and phrases by unit
### Unit 2
### Phrases
kit a set of equipment 成套设备
bitter having an unpleasant taste 苦的
VIttel damaged duplicate OCR 损坏重复词条
gym a room for exercise 健身房
### Glossary`, 4);
  const corrected = applyHujiaoBookCorrections("b3", parsed);

  assert.deepEqual(corrected.units[1]?.items.map((item) => item.text), ["kit", "bitter", "gym"]);
});
