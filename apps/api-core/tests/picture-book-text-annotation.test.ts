import assert from "node:assert/strict";
import test from "node:test";
import { hashCourseSnapshot, snapshotCourseMaterial } from "../src/courses/course-domain.js";
import { playbackFromSnapshot } from "../src/picture-books/picture-book-playback.js";
import { mergeTextLayout, parseTextLayout, preserveCreatorTextLayouts } from "../src/picture-books/picture-book-text-layout.js";

const box = {
  id: "title", text: "晚安", x: 0.1, y: 0.2, width: 0.4, height: 0.2,
  fontSize: 24, fontFamily: "sans" as const, color: "#111111", bold: false,
  align: "justify" as const, lineHeight: 1.5, speak: true, zIndex: 0
};
const audioUrl = "/api/media/files/narration.mp3";
const styled = {
  shape: "cloud" as const, tail: { x: 0.95, y: 0.8 }, backgroundColor: "#ffffff", backgroundOpacity: 0.5,
  borderColor: "#345678", borderWidth: 2, cornerRadius: 8
};
const layoutForBox = (item: unknown) => ({
  enabled: true, versions: [{ language: "original", boxes: [item], audioUrl, voiceKey: "voice:private-selection" }]
});

test("标注形状、箭头和外观随绘本保存与发布，样式变化保留原有配音", () => {
  const annotation = { ...box, ...styled };
  const saved = mergeTextLayout(layoutForBox({
    ...annotation, tail: { ...annotation.tail, privateNote: "internal" }, privateNote: "internal"
  }), parseTextLayout(layoutForBox(box)));
  assert.deepEqual(saved.versions[0]?.boxes[0], annotation);
  assert.equal(saved.versions[0]?.audioUrl, audioUrl);

  const synced = preserveCreatorTextLayouts([{ position: 1, textLayout: saved }], [{ position: 1 }]);
  assert.deepEqual(synced[0]?.textLayout?.versions[0]?.boxes[0], annotation);
  const snapshot = snapshotCourseMaterial("PICTURE_BOOK", { pages: synced });
  const playback = playbackFromSnapshot("book", snapshot);
  assert.deepEqual(playback.pages[0]?.textLayout?.versions[0]?.boxes[0], annotation);
  assert.doesNotMatch(JSON.stringify(snapshot), /private-selection|privateNote/);
});

test("新样式字段不会给旧绘本新增默认值或改变旧快照的哈希", () => {
  const legacy = parseTextLayout(layoutForBox(box));
  assert.deepEqual(legacy.versions[0]?.boxes[0], box);
  assert.equal(hashCourseSnapshot(legacy), hashCourseSnapshot(layoutForBox(box)));
});

test("标注校验拒绝不支持的形状、坐标、颜色和外观尺寸", () => {
  for (const appearance of [
    { shape: "polygon" }, { tail: { x: 0.2, y: 0.3 } },
    { shape: "rounded", tail: { x: 1.1, y: 0.3 } }, { shape: "ellipse", tail: { x: 0.2 } },
    { shape: "cloud", tail: [0.2, 0.3] }, { backgroundColor: "url(example.png)" },
    { borderColor: "#fff" }, { backgroundOpacity: -0.1 }, { backgroundOpacity: "0.5" },
    { borderWidth: 25 }, { cornerRadius: Infinity }
  ]) {
    assert.throws(() => parseTextLayout(layoutForBox({ ...box, ...appearance })), /图文编排数据无效/);
  }
});
