import assert from "node:assert/strict";
import test from "node:test";

import {
  createNarrationEditorState,
  moveNarrationEditor,
  narrationEditorSavePayload,
  NarrationEditorValidationError,
  updateNarrationEditorScript
} from "../src/lib/video-guide-narration-editor.js";
import type { VideoGuideLessonContent } from "../src/lib/video-guide-data.js";

function editorContent(): VideoGuideLessonContent {
  return {
    summary: "测试课件",
    stageNames: [],
    words: [],
    teacherSegments: [],
    questions: [],
    repeatLines: [],
    narrationDraftTimeline: [
      {
        id: "intro",
        type: "INTRO",
        title: "课程导入",
        script: "今天我们学习垃圾分类。",
        chunks: [{ id: "intro-c1", type: "intro", text: "今天我们学习垃圾分类。" }]
      },
      {
        id: "s_001",
        type: "SENTENCE",
        title: "第 1 句",
        sentenceId: "s_001",
        subtitle: "There are lots of things.",
        script: "lots of 表示很多。",
        chunks: [{ id: "s_001-c1", type: "phrase", text: "lots of 表示很多。" }]
      },
      {
        id: "summary",
        type: "SUMMARY",
        title: "课程总结",
        script: "今天学会了 lots of。",
        chunks: [{ id: "summary-c1", type: "summary", text: "今天学会了 lots of。" }]
      }
    ]
  };
}

test("编辑器按导入、逐句、总结导航并保留本地修改", () => {
  let state = createNarrationEditorState(editorContent());

  assert.equal(state.items[0]?.sourceText, "课程导入");
  state = moveNarrationEditor(state, "NEXT");
  assert.equal(state.items[state.index]?.sourceText, "There are lots of things.");
  state = updateNarrationEditorScript(state, "修改后的逐句讲解");
  state = moveNarrationEditor(state, "NEXT");
  assert.equal(state.items[state.index]?.sourceText, "课程总结");
  state = moveNarrationEditor(state, "NEXT");
  assert.equal(state.index, 2);
  state = moveNarrationEditor(state, "PREVIOUS");
  assert.equal(state.items[state.index]?.script, "修改后的逐句讲解");
});

test("保存载荷拒绝空文案并定位错误项", () => {
  const state = updateNarrationEditorScript(createNarrationEditorState(editorContent()), "   ");

  assert.throws(
    () => narrationEditorSavePayload(state),
    (error) =>
      error instanceof NarrationEditorValidationError &&
      error.message === "讲解文稿不能为空" &&
      error.index === 0
  );
});

test("保存载荷只包含节点 ID 和去除首尾空格后的文案", () => {
  const state = updateNarrationEditorScript(
    createNarrationEditorState(editorContent()),
    "  修改后的导入  "
  );

  assert.deepEqual(narrationEditorSavePayload(state), {
    nodes: [
      { id: "intro", originalScript: "今天我们学习垃圾分类。", script: "修改后的导入" },
      { id: "s_001", originalScript: "lots of 表示很多。", script: "lots of 表示很多。" },
      { id: "summary", originalScript: "今天学会了 lots of。", script: "今天学会了 lots of。" }
    ]
  });
});

test("保存时只提交当前节点修改并放弃其它未保存节点草稿", () => {
  let state = updateNarrationEditorScript(
    createNarrationEditorState(editorContent()),
    "未保存的导入修改"
  );
  state = moveNarrationEditor(state, "NEXT");
  state = updateNarrationEditorScript(state, "当前句修改");

  assert.deepEqual(narrationEditorSavePayload(state), {
    nodes: [
      { id: "intro", originalScript: "今天我们学习垃圾分类。", script: "今天我们学习垃圾分类。" },
      { id: "s_001", originalScript: "lots of 表示很多。", script: "当前句修改" },
      { id: "summary", originalScript: "今天学会了 lots of。", script: "今天学会了 lots of。" }
    ]
  });
});

test("没有文案草稿时不能打开编辑器", () => {
  assert.throws(
    () => createNarrationEditorState({ ...editorContent(), narrationDraftTimeline: [] }),
    /当前课件没有可编辑的导学文稿/
  );
});
