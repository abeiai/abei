import assert from "node:assert/strict";
import test from "node:test";

import { normalizeSmartEduTextbookGrade } from "./textbook-grade-normalization.js";

test("规范化 SmartEdu 年级标签中的高中一年级", () => {
  assert.equal(
    normalizeSmartEduTextbookGrade({
      educationType: "SENIOR",
      gradeTag: "高一年级",
      title: "普通中学教科书·法语 III上册",
      volumeTag: "上册"
    }),
    "高一"
  );
});

test("根据学生用书标题映射到真实年级", () => {
  assert.equal(
    normalizeSmartEduTextbookGrade({
      educationType: "PRIMARY",
      gradeTag: "学生用书",
      title: "体育与健康学生用书 一年级（全一册）",
      volumeTag: "一年级（全一册）"
    }),
    "一年级"
  );
  assert.equal(
    normalizeSmartEduTextbookGrade({
      educationType: "JUNIOR",
      gradeTag: "学生用书",
      title: "体育与健康学生用书 七年级（全一册）",
      volumeTag: "七年级（全一册）"
    }),
    "七年级"
  );
});

test("将历史系列标签映射到用户指定的真实年级", () => {
  assert.equal(
    normalizeSmartEduTextbookGrade({
      educationType: "JUNIOR_FIVE_FOUR",
      gradeTag: "世界历史",
      title: "世界历史世界历史第一册（五·四学制）",
      volumeTag: "第一册"
    }),
    "八年级"
  );
  assert.equal(
    normalizeSmartEduTextbookGrade({
      educationType: "JUNIOR_FIVE_FOUR",
      gradeTag: "中国历史",
      title: "中国历史中国历史第一册（五·四学制）",
      volumeTag: "第一册"
    }),
    "六年级"
  );
  assert.equal(
    normalizeSmartEduTextbookGrade({
      educationType: "JUNIOR_FIVE_FOUR",
      gradeTag: "中国历史",
      title: "中国历史中国历史第四册（五·四学制）",
      volumeTag: "第四册"
    }),
    "六年级"
  );
});

test("没有异常标签时保留原年级推断行为", () => {
  assert.equal(
    normalizeSmartEduTextbookGrade({
      educationType: "PRIMARY",
      gradeTag: "三年级",
      title: "数学三年级上册",
      volumeTag: "上册"
    }),
    "三年级"
  );
  assert.equal(
    normalizeSmartEduTextbookGrade({
      educationType: "SENIOR",
      gradeTag: undefined,
      title: "普通高中教科书·数学必修第一册",
      volumeTag: "必修 第一册"
    }),
    "高中年级"
  );
});
