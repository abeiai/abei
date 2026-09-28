import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import * as guidedStudyData from "../src/lib/english-guided-study-data.js";
import * as creatorRoutes from "../src/lib/tool-creator-routes.js";

test("开卷导读提供固定学习时长并按每分钟 180 字计算", () => {
  const durations = Reflect.get(guidedStudyData, "readingGuideDurationOptions");
  const targetCharacters = Reflect.get(guidedStudyData, "readingGuideTargetCharacters");

  assert.deepEqual(durations, [1, 3, 5, 8, 10, 15]);
  assert.equal(typeof targetCharacters, "function");
  assert.deepEqual(durations.map((minutes: number) => targetCharacters(minutes)), [180, 540, 900, 1440, 1800, 2700]);
});

test("开卷导读同步练习提供固定题目数", () => {
  assert.deepEqual(Reflect.get(guidedStudyData, "readingGuideQuestionCountOptions"), [3, 5, 10, 20]);
});

test("开卷导读材料保留独立场景和创作路由", () => {
  const creatorPath = Reflect.get(creatorRoutes, "daoduCreatorPath");

  assert.equal(guidedStudyData.guidedStudySceneOf({ scene: "DAODU" } as never), "DAODU");
  assert.equal(typeof creatorPath, "function");
  assert.equal(creatorPath("demo"), "/daodu/creator/demo");
});

test("开卷导读工作台沿用学古诗文布局并按要求排列生成操作", () => {
  const source = readFileSync(
    new URL("../src/components/experience/reading-guide-console.tsx", import.meta.url),
    "utf8"
  );

  assert.match(source, /lg:grid-cols-\[76px_minmax\(0,1fr\)\]/);
  assert.match(source, /lg:grid-cols-\[292px_minmax\(0,1fr\)\]/);
  assert.match(source, /<BookOpenText[^>]*\/>[\s\S]*开卷导读/);
  assert.match(source, /新建导读课件/);
  assert.match(source, /导读课件历史/);
  assert.match(source, /aria-label="标题"/);
  assert.match(source, /aria-label="作者"/);
  assert.match(source, /aria-label="阅读正文"/);
  assert.match(source, /上传文档[\s\S]*参考资料[\s\S]*图片识别/);
  assert.match(source, /scene: "DAODU"/);

  const durationIndex = source.indexOf("导读时长");
  const guideButtonIndex = source.indexOf("生成导读文稿", durationIndex);
  const voiceIndex = source.indexOf('label="选择音色"');
  const audioButtonIndex = source.indexOf("生成讲解音频", voiceIndex);
  const questionCountIndex = source.indexOf("选择同步练习题目数");
  const practiceButtonIndex = source.indexOf("生成同步练习", questionCountIndex);

  assert.ok(durationIndex < guideButtonIndex);
  assert.ok(voiceIndex < audioButtonIndex);
  assert.ok(audioButtonIndex < questionCountIndex);
  assert.ok(questionCountIndex < practiceButtonIndex);
  assert.doesNotMatch(source, /目标约 .* 字/);
  assert.match(source, /保存本段/);
  assert.match(source, /reading-guide-p\$\{paragraphIndex \+ 1\}/);
  assert.match(source, /onEnded=\{\(\) =>/);
});
