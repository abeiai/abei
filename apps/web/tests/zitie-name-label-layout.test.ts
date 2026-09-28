import assert from "node:assert/strict";
import test from "node:test";

import {
  buildNameLabelSheetGeometry,
  centimetersToPoints,
  clampSteppedNumber,
  nameLabelPageMarginsToPoints,
  paginateNameLabelGroups,
  parseNameLabelGroups,
  splitNameLabelFieldLine,
} from "../src/components/zitie/name-label-layout";

test("姓名贴小数设置按指定步进归一化且可回到默认值", () => {
  assert.equal(clampSteppedNumber("1.5", 0.5, 2.5, 0.5), 1.5);
  assert.equal(clampSteppedNumber("0.5", 0.1, 1.5, 0.1), 0.5);
  assert.equal(clampSteppedNumber("5.1", 2, 20, 0.1), 5.1);
  assert.equal(clampSteppedNumber("0.75", 0.25, 6, 0.25), 0.75);
});

test("姓名贴按空行拆分多个标签并保留标签内多行", () => {
  assert.deepEqual(
    parseNameLabelGroups("姓名：张三\n班级：一班\n\n姓名：李四\n班级：二班", "blank-line", ""),
    [
      ["姓名：张三", "班级：一班"],
      ["姓名：李四", "班级：二班"],
    ],
  );
});

test("姓名贴超过单页容量时按输入顺序拆分到后续页面", () => {
  const groups = Array.from({ length: 12 }, (_, index) => [`姓名：学生${index + 1}`]);

  assert.deepEqual(
    paginateNameLabelGroups(groups, 5),
    [
      groups.slice(0, 5),
      groups.slice(5, 10),
      groups.slice(10, 12),
    ],
  );
});

test("姓名贴自定义分隔符只在单独占行时生效", () => {
  assert.deepEqual(
    parseNameLabelGroups("张三---一班\n---\n李四\n二班", "custom", "---"),
    [["张三---一班"], ["李四", "二班"]],
  );
});

test("姓名贴自动识别冒号字段并保留纯文本居中行", () => {
  assert.deepEqual(splitNameLabelFieldLine("姓名： 张三"), {
    field: "姓名：",
    value: "张三",
    hasField: true,
  });
  assert.deepEqual(splitNameLabelFieldLine("快乐成长"), {
    field: "",
    value: "快乐成长",
    hasField: false,
  });
});

test("姓名贴厘米换算和自动铺页使用真实 PDF 点", () => {
  const geometry = buildNameLabelSheetGeometry({
    pageWidth: 595,
    pageHeight: 842,
    pageMarginPreset: "narrow",
    labelWidthCm: 8.5,
    labelHeightCm: 4.5,
    verticalGapCm: 0.3,
    columnsMode: "auto",
    manualColumns: 1,
  });

  assert.ok(Math.abs(centimetersToPoints(1) - 28.3464567) < 0.0001);
  assert.equal(geometry.columns, 2);
  assert.equal(geometry.rows, 5);
  assert.equal(geometry.capacity, 10);
  assert.ok(geometry.x >= centimetersToPoints(1.27));
  assert.ok(geometry.y >= centimetersToPoints(1.27));
});

test("姓名贴页面边距预设按四边规则限制可打印区域", () => {
  assert.deepEqual(nameLabelPageMarginsToPoints("normal"), {
    top: centimetersToPoints(2.54),
    bottom: centimetersToPoints(2.54),
    left: centimetersToPoints(3.18),
    right: centimetersToPoints(3.18),
  });

  const regular = buildNameLabelSheetGeometry({
    pageWidth: 595,
    pageHeight: 842,
    pageMarginPreset: "normal",
    labelWidthCm: 8.5,
    labelHeightCm: 4.5,
    verticalGapCm: 0.3,
    columnsMode: "auto",
    manualColumns: 1,
  });
  const none = buildNameLabelSheetGeometry({
    pageWidth: 595,
    pageHeight: 842,
    pageMarginPreset: "none",
    labelWidthCm: 8.5,
    labelHeightCm: 4.5,
    verticalGapCm: 0.3,
    columnsMode: "auto",
    manualColumns: 1,
  });

  assert.equal(regular.columns, 1);
  assert.equal(none.columns, 2);
  assert.ok(regular.x >= centimetersToPoints(3.18));
  assert.ok(regular.y >= centimetersToPoints(2.54));
  assert.equal(none.x, 0);
  assert.ok(Math.abs(none.horizontalGap - (595 - none.labelWidth * 2)) < 0.0001);
  assert.ok(Math.abs(none.x + none.labelWidth * 2 + none.horizontalGap - 595) < 0.0001);
});

test("姓名贴手动列数不会超过物理尺寸可容纳上限", () => {
  const geometry = buildNameLabelSheetGeometry({
    pageWidth: 595,
    pageHeight: 842,
    pageMarginPreset: "narrow",
    labelWidthCm: 8.5,
    labelHeightCm: 4.5,
    verticalGapCm: 0.3,
    columnsMode: "manual",
    manualColumns: 4,
  });

  assert.equal(geometry.maxColumns, 2);
  assert.equal(geometry.columns, 2);
});
