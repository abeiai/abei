import assert from "node:assert/strict";
import test from "node:test";

import {
  createNameLabelRecordSourceConfig,
  defaultNameLabelOptions,
  parseNameLabelRecordSourceConfig
} from "../src/components/zitie/name-label-record.js";

test("姓名贴记录快照可完整恢复生成设置", () => {
  const sourceConfig = createNameLabelRecordSourceConfig({
    colors: {
      guide: "#a9d1bf",
      stroke: "#2f8f6b",
      text: "#111827",
      trace: "#cbd5e1"
    },
    content: "姓名：张三\n班级：三年级二班",
    fontSize: 16,
    options: {
      ...defaultNameLabelOptions,
      backgroundImageName: "背景.png",
      backgroundImageSrc: "data:image/png;base64,AAAA",
      lineHeight: 2,
      pageMarginPreset: "normal",
      textLayout: "field-line"
    },
    paperSize: "B5",
    rosterMode: true,
    selectedFontId: "font-1",
    theme: "green-black"
  });

  assert.deepEqual(parseNameLabelRecordSourceConfig(sourceConfig), sourceConfig);
});

test("姓名贴记录快照拒绝错误版本和越界设置", () => {
  const valid = createNameLabelRecordSourceConfig({
    colors: {
      guide: "#a9d1bf",
      stroke: "#2f8f6b",
      text: "#111827",
      trace: "#cbd5e1"
    },
    content: "姓名：张三",
    fontSize: 16,
    options: defaultNameLabelOptions,
    paperSize: "A4",
    rosterMode: false,
    selectedFontId: "font-1",
    theme: "green-black"
  });

  assert.equal(parseNameLabelRecordSourceConfig({ ...valid, version: 2 }), null);
  assert.equal(parseNameLabelRecordSourceConfig({ ...valid, fontSize: 61 }), null);
  assert.equal(
    parseNameLabelRecordSourceConfig({
      ...valid,
      options: { ...valid.options, lineHeight: 9 }
    }),
    null
  );
});
