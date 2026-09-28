import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { validateSync } from "class-validator";

import * as segmentationModule from "../src/english-guided-study/english-guided-study-segmentation.js";
import {
  englishGuidedStudyNarrationMaxLength,
  englishGuidedStudySourceInputMaxLength,
  englishGuidedStudySourceTextMaxLength,
  GenerateEnglishGuidedStudyMaterialDto,
  guidedStudySourceInputMaxLength,
  UpdateEnglishGuidedStudySourceDto,
  UpdateEnglishGuidedStudyScriptDto
} from "../src/english-guided-study/dto/english-guided-study.dto.js";
import {
  batchEnglishStudySourceSegments,
  buildEnglishStudySourceSegments,
  buildGuidedStudySourceSegments,
  normalizeEnglishStudySourceText
} from "../src/english-guided-study/english-guided-study-segmentation.js";

test("英文带学保存正文时保留诗歌换行", () => {
  const sourceText = [
    "In winter I get up at night",
    "And dress by yellow candle-light.",
    "In summer quite the other way,",
    "I have to go to bed by day."
  ].join("\n");

  assert.equal(normalizeEnglishStudySourceText(sourceText), sourceText);
});

test("英文带学正文只清理多余空白，不合并有效换行", () => {
  assert.equal(
    normalizeEnglishStudySourceText(
      "  In winter I get up at night  \r\nAnd dress by yellow candle-light.\r\n\r\n\r\nIn summer quite the other way,  "
    ),
    "In winter I get up at night\nAnd dress by yellow candle-light.\n\nIn summer quite the other way,"
  );
});

test("英文带学按真实英语句子切分，不再把相邻句子合并成段", () => {
  const segments = buildEnglishStudySourceSegments(
    "A smile shows that a person is happy. People smile for many different reasons. First, it is easier to smile than to show unhappiness."
  );

  assert.deepEqual(
    segments.map((segment) => segment.text),
    [
      "A smile shows that a person is happy.",
      "People smile for many different reasons.",
      "First, it is easier to smile than to show unhappiness."
    ]
  );
  assert.deepEqual(segments.map((segment) => segment.id), ["s1", "s2", "s3"]);
});

test("古诗文逐句讲解按诗句和中文标点切分", () => {
  const segments = buildGuidedStudySourceSegments(
    "床前明月光，疑是地上霜。\n举头望明月，低头思故乡。",
    "SENTENCE",
    "GUSHIWEN"
  );

  assert.deepEqual(segments, [
    { id: "s1", text: "床前明月光，疑是地上霜。" },
    { id: "s2", text: "举头望明月，低头思故乡。" }
  ]);
});

test("古诗文对话断句把句末右引号保留在当前句", () => {
  const segments = buildGuidedStudySourceSegments(
    "俄而雪骤，公欣然曰：“白雪纷纷何所似？”兄子胡儿曰：“撒盐空中差可拟。”兄女曰：“未若柳絮因风起。”",
    "SENTENCE",
    "GUSHIWEN"
  );

  assert.deepEqual(segments.map((segment) => segment.text), [
    "俄而雪骤，公欣然曰：“白雪纷纷何所似？”",
    "兄子胡儿曰：“撒盐空中差可拟。”",
    "兄女曰：“未若柳絮因风起。”"
  ]);
});

test("古诗文短对话保留为完整讲解句且不产生独立标点片段", () => {
  const segments = buildGuidedStudySourceSegments(
    "陈曰：\u200b“武王式商容之闾，席不暇暖。吾之礼贤，有何不可？\u200b”",
    "SENTENCE",
    "GUSHIWEN"
  );

  assert.deepEqual(segments, [
    {
      id: "s1",
      text: "陈曰：“武王式商容之闾，席不暇暖。吾之礼贤，有何不可？”"
    }
  ]);
});

test("古诗文逐句讲解把独立篇名出处并回前一个正文片段", () => {
  const segments = buildGuidedStudySourceSegments(
    [
      "子曰：“温故而知新，可以为师矣。”（《为政》）",
      "子曰：“知之者不如好之者，好之者不如乐之者。”（《雍也》）"
    ].join("\n"),
    "SENTENCE",
    "GUSHIWEN"
  );

  assert.deepEqual(segments, [
    { id: "s1", text: "子曰：“温故而知新，可以为师矣。”（《为政》）" },
    { id: "s2", text: "子曰：“知之者不如好之者，好之者不如乐之者。”（《雍也》）" }
  ]);
});

test("英文带学切分保留常见缩写与句末引号", () => {
  const segments = buildEnglishStudySourceSegments(
    'Mr. Lee said, "Keep smiling." Then he left for the U.S. office.'
  );

  assert.deepEqual(
    segments.map((segment) => segment.text),
    ['Mr. Lee said, "Keep smiling."', "Then he left for the U.S. office."]
  );
});

test("逐句讲解按诗歌的最小完整语义单元断句", () => {
  const segments = buildEnglishStudySourceSegments(
    [
      "Two roads diverged in a yellow wood,",
      "And sorry I could not travel both",
      "And be one traveler, long I stood",
      "And looked down one as far as I could",
      "To where it bent in the undergrowth;",
      "Then took the other, as just as fair,",
      "And having perhaps the better claim,",
      "Because it was grassy and wanted wear;",
      "Though as for that the passing there",
      "Had worn them really about the same,",
      "And both that morning equally lay",
      "In leaves no step had trodden black."
    ].join("\n")
  );

  assert.deepEqual(segments.map((segment) => segment.text), [
    "Two roads diverged in a yellow wood,",
    "And sorry I could not travel both And be one traveler, long I stood",
    "And looked down one as far as I could To where it bent in the undergrowth;",
    "Then took the other, as just as fair,",
    "And having perhaps the better claim, Because it was grassy and wanted wear;",
    "Though as for that the passing there Had worn them really about the same,",
    "And both that morning equally lay In leaves no step had trodden black."
  ]);
});

test("逐句讲解不会把 OCR 单换行的普通正文误判为诗行", () => {
  const segments = buildEnglishStudySourceSegments([
    "Climate change is one of the most important issues facing",
    "the world today. Scientists have warned",
    "that temperatures are rising."
  ].join("\n"));

  assert.deepEqual(segments.map((segment) => segment.text), [
    "Climate change is one of the most important issues facing\nthe world today.",
    "Scientists have warned\nthat temperatures are rising."
  ]);
});

test("英文带学为异常超长单句建立可处理的学习片段", () => {
  const source = `${"word ".repeat(150).trim()}.`;
  const segments = buildEnglishStudySourceSegments(source);

  assert.ok(segments.length > 1);
  assert.ok(segments.every((segment) => segment.text.length <= 520));
  assert.equal(segments.map((segment) => segment.text).join(" ").replace(/\s+/g, " "), source);
});

test("逐段讲解按自然段建立学习单元", () => {
  const segments = buildEnglishStudySourceSegments(
    "The first sentence introduces the topic. The second sentence adds a detail.\n\nA new paragraph changes the focus. It gives an example.",
    "PARAGRAPH"
  );

  assert.deepEqual(segments.map((segment) => segment.text), [
    "The first sentence introduces the topic. The second sentence adds a detail.",
    "A new paragraph changes the focus. It gives an example."
  ]);
});

test("自由发挥把短文合并为完整主题学习单元", () => {
  const segments = buildEnglishStudySourceSegments(
    "The first paragraph presents an idea.\n\nThe second paragraph develops it.\n\nThe final paragraph gives a conclusion.",
    "FREEFORM"
  );

  assert.equal(segments.length, 1);
  assert.match(segments[0]?.text ?? "", /first paragraph[\s\S]+final paragraph/);
});

test("英文带学单批输出预算与精简后的结构化文稿规模匹配", () => {
  const maxTokens = (
    segmentationModule as typeof segmentationModule & {
      englishGuidedStudyMaterialMaxTokens?: (segmentCount: number, sourceTextLength: number) => number;
    }
  ).englishGuidedStudyMaterialMaxTokens;

  assert.equal(typeof maxTokens, "function");
  assert.ok((maxTokens?.(1, 200) ?? 0) >= 4_000);
  assert.ok((maxTokens?.(8, 3_000) ?? 0) <= 8_000);
});

test("英文带学长文按模型可处理大小分批且不遗漏片段", () => {
  const sourceText = Array.from(
    { length: 160 },
    (_, index) => `Sentence ${index + 1} contains enough words to verify complete long-document batching.`
  ).join(" ");
  const segments = buildEnglishStudySourceSegments(sourceText, "SENTENCE");
  const batches = batchEnglishStudySourceSegments(segments, 1_200);

  assert.ok(batches.length > 1);
  assert.deepEqual(batches.flat(), segments);
  assert.ok(batches.every((batch) => JSON.stringify(batch).length <= 1_200));
});

test("英文带学默认每批最多生成八个学习片段", () => {
  const segments = Array.from({ length: 17 }, (_, index) => ({
    id: `s${index + 1}`,
    text: `Sentence ${index + 1}.`
  }));
  const batches = batchEnglishStudySourceSegments(segments);

  assert.deepEqual(batches.map((batch) => batch.length), [8, 8, 1]);
  assert.deepEqual(batches.flat(), segments);
});

test("英文带学模型处理上限为 256000 字符且正文录入上限为 30000 字符", () => {
  assert.equal(englishGuidedStudySourceTextMaxLength, 256_000);
  assert.equal(englishGuidedStudySourceInputMaxLength, 30_000);
  assert.equal(guidedStudySourceInputMaxLength("ENGLISH"), 30_000);
  assert.equal(guidedStudySourceInputMaxLength("GUSHIWEN"), 10_000);
  assert.equal(guidedStudySourceInputMaxLength("DAODU"), 256_000);
});

test("英文带学生成和保存接受 30000 字符并拒绝超过上限的正文", () => {
  for (const Dto of [GenerateEnglishGuidedStudyMaterialDto, UpdateEnglishGuidedStudySourceDto]) {
    const dto = Object.assign(new Dto(), { sourceText: "a".repeat(30_000) });
    assert.equal(validateSync(dto).some((error) => error.property === "sourceText"), false);
    dto.sourceText += "a";
    assert.equal(validateSync(dto).some((error) => error.property === "sourceText"), true);
  }

  const gushiwen = Object.assign(new GenerateEnglishGuidedStudyMaterialDto(), {
    scene: "GUSHIWEN", sourceText: "文".repeat(10_000)
  });
  assert.equal(validateSync(gushiwen).some((error) => error.property === "sourceText"), false);
  gushiwen.sourceText += "文";
  assert.equal(validateSync(gushiwen).some((error) => error.property === "sourceText"), true);
});

test("英文带学超过 12000 字符的生成讲稿仍可编辑或缩短保存", () => {
  const dto = Object.assign(new UpdateEnglishGuidedStudyScriptDto(), {
    targetType: "SENTENCE", sentenceId: "s1",
    script: "讲".repeat(12_919), originalScript: "讲".repeat(12_919)
  });
  assert.deepEqual(validateSync(dto), []);
  dto.script = "修改后的简短讲解。";
  assert.deepEqual(validateSync(dto), []);
  dto.originalScript = "讲".repeat(englishGuidedStudyNarrationMaxLength + 1);
  assert.ok(validateSync(dto).some((error) => error.property === "originalScript"));
  dto.originalScript = "原讲解。";
  dto.script = "讲".repeat(englishGuidedStudyNarrationMaxLength + 1);
  assert.ok(validateSync(dto).some((error) => error.property === "script"));
});
