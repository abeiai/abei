import type { TextbookEducationType } from "../src/index.js";

export interface SmartEduTextbookGradeInput {
  educationType: TextbookEducationType;
  gradeTag?: string;
  title: string;
  volumeTag?: string;
}

const gradePattern =
  /(一年级|二年级|三年级|四年级|五年级|六年级|七年级|八年级|九年级|高一|高二|高三|高中年级)/;

export function normalizeSmartEduTextbookGrade(input: SmartEduTextbookGradeInput) {
  const gradeTag = normalizeText(input.gradeTag);
  const gradeSource = normalizeText(`${input.volumeTag ?? ""} ${input.title}`);

  if (gradeTag === "高一年级") {
    return "高一";
  }

  if (gradeTag === "学生用书") {
    return inferGradeFromText(gradeSource) ?? gradeTag;
  }

  if (gradeTag === "世界历史") {
    return "八年级";
  }

  if (gradeTag === "中国历史") {
    return "六年级";
  }

  if (gradeTag) {
    return gradeTag;
  }

  return inferGradeFromText(input.title) ?? (input.educationType === "SENIOR" ? "高中年级" : "未标注年级");
}

function inferGradeFromText(value: string) {
  return value.match(gradePattern)?.[1];
}

function normalizeText(value: string | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}
