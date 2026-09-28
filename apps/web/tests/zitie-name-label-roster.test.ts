import assert from "node:assert/strict";
import test from "node:test";

import {
  formatNameLabelRosterInput,
  paginateNameLabelRosterGroups,
  parseNameLabelRosterRows,
  parseNameLabelRosterText,
} from "../src/components/zitie/name-label-roster";

test("姓名贴名单按姓名和学号表头解析表格", () => {
  assert.deepEqual(
    parseNameLabelRosterRows([
      ["学号", "姓名"],
      ["2026001", "张三"],
      ["2026002", "李四"],
    ]),
    [
      { studentNumber: "2026001", name: "张三" },
      { studentNumber: "2026002", name: "李四" },
    ],
  );
});

test("姓名贴名单无表头时识别学号姓名顺序及反向顺序", () => {
  assert.deepEqual(
    parseNameLabelRosterRows([
      ["2026001", "张三"],
      ["李四", "2026002"],
    ]),
    [
      { studentNumber: "2026001", name: "张三" },
      { studentNumber: "2026002", name: "李四" },
    ],
  );
});

test("姓名贴名单支持带字段的分行文本", () => {
  assert.deepEqual(
    parseNameLabelRosterText(
      "姓名：张三\n学号：2026001\n\n姓名：李四 学号：2026002",
    ),
    [
      { studentNumber: "2026001", name: "张三" },
      { studentNumber: "2026002", name: "李四" },
    ],
  );
});

test("姓名贴名单转换为现有标签输入格式", () => {
  assert.equal(
    formatNameLabelRosterInput([
      { studentNumber: "2026001", name: "张三" },
      { studentNumber: "2026002", name: "李四" },
    ]),
    "姓名：张三\n学号：2026001\n\n姓名：李四\n学号：2026002",
  );
});

test("姓名贴名单模式每名学生独占一页", () => {
  const groups = [
    ["姓名：张三", "学号：2026001"],
    ["姓名：李四", "学号：2026002"],
  ];

  assert.deepEqual(paginateNameLabelRosterGroups(groups), [
    [groups[0]],
    [groups[1]],
  ]);
});
