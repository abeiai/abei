import assert from "node:assert/strict";
import test from "node:test";
import { buildGuidePrompt, editGuidePage, guideStyles, parseGuideScript, validateGuidePdf, type GuidePage } from "../src/picture-book-guide/picture-book-guide-content.js";

const page: GuidePage = { pageNumber: 2, sourceText: "小熊收拾背包。", script: "小熊要去哪里呢？", audioTaskId: "audio-old", audioMimeType: "audio/mpeg", audioVoice: "system:test", audioSpeed: 1 };
test("拒绝伪装的 PDF、空文件及超过上传限制的文档", () => {
  const buffer = Buffer.from("%PDF-1.7\nfixture");
  assert.doesNotThrow(() => validateGuidePdf({ originalname: "绘本.PDF", mimetype: "application/pdf", size: buffer.length, buffer }));
  for (const file of [undefined, { originalname: "book.docx", mimetype: "application/pdf", size: buffer.length, buffer }, { originalname: "book.pdf", mimetype: "application/pdf", size: 4, buffer: Buffer.from("fake") }, { originalname: "book.pdf", mimetype: "application/pdf", size: 50 * 1024 * 1024 + 1, buffer }]) {
    assert.throws(() => validateGuidePdf(file), /PDF|50MB/);
  }
});
test("每种风格都进入逐页提示，固定 PDF 页号、受众和画面依据", () => {
  assert.equal(guideStyles.length, 5);
  for (const style of guideStyles) {
    const prompt = buildGuidePrompt({ audience: "一二年级", style: style.value, page, pageCount: 8, previousScript: "小熊起床了。" });
    assert.ok(prompt.includes(style.guide));
    assert.match(prompt, /一二年级/);
    assert.match(prompt, /第2页.*共8页/);
    assert.match(prompt, /小熊收拾背包/);
    assert.match(prompt, /上一页/);
    assert.match(prompt, /画面/);
  }
});
test("模型返回必须对应当前页且文稿不可空白或超长", () => {
  assert.equal(parseGuideScript('```json\n{"pageNumber":2,"script":"  小熊要去哪里呢？  "}\n```', 2), "小熊要去哪里呢？");
  for (const output of ['{"pageNumber":1,"script":"错页"}', '{"pageNumber":2,"script":" "}', '{"pageNumber":2,"script":true}', JSON.stringify({pageNumber:2,script:"字".repeat(2001)}), "不是 JSON"]) {
    assert.throws(() => parseGuideScript(output, 2), /文稿/);
  }
});
test("修改文稿清除该页旧语音，未修改时保留音频", () => {
  assert.deepEqual(editGuidePage(page, " 小熊要去哪里呢？ "), page);
  assert.deepEqual(editGuidePage(page, "看一看小熊的背包。"), { ...page, script: "看一看小熊的背包。", audioTaskId: null, audioMimeType: null, audioVoice: null, audioSpeed: null });
  assert.throws(() => editGuidePage(page, " "), /文稿/);
});
