import assert from "node:assert/strict";
import test from "node:test";

import { buildSeniorTypingWordlist } from "./senior-typing-wordlist.js";

const markdown = `# 高中教材

### Wordlist 1(by unit)

### Unit 1

chart /tʃɑːt/n.图表 broadcast /ˈbrɔːdkɑːst/n.广播节目 (2)
springup 迅速出现 (3) spring up 迅速出现，突然兴起 (3)
makea difference 起作用 (4)

### Unit 2

path /pɑːθ/n.道路 (16)

### Wordlist 2 (in alphabetical order)

### B

broadcast /ˈbrɔːdkɑːst/n.广播节目，电视节目 (2)

### C

chart /tʃɑːt/n.图表；海图 (2)

### M

make a difference 起作用，有影响 (4)

### P

path /pɑːθ/n.道路 (16)

### S

spring up 迅速出现，突然兴起 (3)

### Wordlist 3 (proper nouns)
`;

test("高中词表按单元顺序去重并使用字母词表清理释义", () => {
  const parsed = buildSeniorTypingWordlist(markdown, {
    append: [{
      items: [{ text: "boost", translation: "使增长，提高", sourcePage: 2 }],
      unitNumber: 1
    }],
    textReplacements: [{
      sourceOrder: 4,
      text: "make a difference",
      unitNumber: 1
    }]
  });

  assert.deepEqual(parsed.units.map((unit) => unit.items.map((item) => item.text)), [
    ["chart", "springup", "make a difference", "boost", "broadcast"],
    ["path"]
  ]);
  assert.equal(parsed.units[0]?.items[0]?.translation, "图表；海图");
  assert.equal(parsed.units[0]?.items[1]?.translation, "迅速出现，突然兴起");
  assert.deepEqual(parsed.units[0]?.items.map((item) => item.sourceOrder), [1, 2, 3, 4, 5]);
});

test("高中词表拒绝把仍含中文或音标残片的答案入库", () => {
  assert.throws(
    () => buildSeniorTypingWordlist(markdown.replace("path /pɑːθ/n.道路", "`path /pɑːθ/n.道路")),
    /高中词汇英文内容不合法/u
  );
});

test("高中词表允许教材中用括号标示可省略成分的短语", () => {
  const parsed = buildSeniorTypingWordlist(markdown.replace(
    "path /pɑːθ/n.道路",
    "(build) castles in the air 建空中楼阁 (16) path /pɑːθ/n.道路"
  ));

  assert.equal(parsed.units[1]?.items[0]?.text, "(build) castles in the air");
});
