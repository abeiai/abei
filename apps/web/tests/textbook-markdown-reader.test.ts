import assert from "node:assert/strict";
import test from "node:test";
import { parseTextbookMarkdownReader, stripTextbookMarkdownToPlainText } from "../src/lib/textbook-markdown-reader.js";

const sampleMarkdown = `# 示例教材

| 字段 | 内容 |
| --- | --- |
| 类型 | 小学 |

---

## 第 1 页

### 第一单元 校园生活

### 第1课 我是小学生

第一页正文。

![教材插图](https://cdn.xueleai.com/learning-materials/textbooks/markdown-assets/book/mineru-inline.jpg)

![第 1 页原版页面图](https://cdn.xueleai.com/learning-materials/textbooks/markdown-assets/book/page-001.png)

---

## 第 2 页

第二页正文。

![第 2 页原版页面图](https://cdn.xueleai.com/learning-materials/textbooks/markdown-assets/book/page-002.png)

---

## 第 3 页

## 第二单元 我们讲文明

第三页正文。

![第 3 页原版页面图](https://cdn.xueleai.com/learning-materials/textbooks/markdown-assets/book/page-003.png)
`;

test("parses textbook markdown into page and unit navigation sections", () => {
  const reader = parseTextbookMarkdownReader(sampleMarkdown);

  assert.equal(reader.pages.length, 3);
  assert.equal(reader.pages[0]?.title, "第 1 页");
  assert.equal(reader.pages[0]?.imageUrl, "https://cdn.xueleai.com/learning-materials/textbooks/markdown-assets/book/page-001.png");
  assert.deepEqual(reader.pages[0]?.imageUrls, ["https://cdn.xueleai.com/learning-materials/textbooks/markdown-assets/book/page-001.png"]);
  assert.match(reader.pages[0]?.markdown ?? "", /第一页正文/);

  assert.equal(reader.units.length, 2);
  assert.equal(reader.units[0]?.title, "第一单元 校园生活");
  assert.deepEqual(reader.units[0]?.pageNumbers, [1, 2]);
  assert.equal(reader.units[0]?.imageUrls.length, 2);
  assert.match(reader.units[1]?.markdown ?? "", /第三页正文/);
});

test("detects unit titles outside heading syntax without using catalog entries", () => {
  const reader = parseTextbookMarkdownReader(`## 第 4 页

### 目录

第一单元 校园生活
第二单元 成长习惯／17

![第 4 页原版页面图](https://cdn.xueleai.com/book/page-004.png)

---

## 第 5 页

di yi danyuán 第一单元

![第 5 页原版页面图](https://cdn.xueleai.com/book/page-005.png)

---

## 第 6 页

第一单元 校园生活

![第 6 页原版页面图](https://cdn.xueleai.com/book/page-006.png)

---

## 第 7 页

想个新游戏还可以……di er danyuan 第二单元

![第 7 页原版页面图](https://cdn.xueleai.com/book/page-007.png)`);

  assert.deepEqual(
    reader.units.map((unit) => ({ pages: unit.pageNumbers, title: unit.title })),
    [
      { pages: [4], title: "正文" },
      { pages: [5, 6], title: "第一单元 校园生活" },
      { pages: [7], title: "第二单元" }
    ]
  );
});

test("strips markdown syntax and image entries for plain text reading", () => {
  const plainText = stripTextbookMarkdownToPlainText(`## 第 8 页

### 第1课 **开开心心**上学去

这是[校园生活](https://example.com)正文。

| 字段 | 内容 |
| --- | --- |
| 学科 | 道德与法治 |

![教材插图](https://cdn.xueleai.com/book/mineru-inline.jpg)
![第 8 页原版页面图](https://cdn.xueleai.com/book/page-008.png)

> 课堂提示

\`重点\`内容`);

  assert.equal(
    plainText,
    ["第 8 页", "第1课 开开心心上学去", "这是校园生活正文。", "字段 内容", "学科 道德与法治", "课堂提示", "重点内容"].join("\n")
  );
  assert.doesNotMatch(plainText, /cdn\.xueleai\.com|!\[/);
});
