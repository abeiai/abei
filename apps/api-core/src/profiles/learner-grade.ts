export const learnerGradeOptions = [
  { value: "PRESCHOOL", label: "学龄前" },
  { value: "GRADE_1", label: "一年级" },
  { value: "GRADE_2", label: "二年级" },
  { value: "GRADE_3", label: "三年级" },
  { value: "GRADE_4", label: "四年级" },
  { value: "GRADE_5", label: "五年级" },
  { value: "GRADE_6", label: "六年级" },
  { value: "GRADE_7", label: "七年级" },
  { value: "GRADE_8", label: "八年级" },
  { value: "GRADE_9", label: "九年级" },
  { value: "HIGH_1", label: "高一" },
  { value: "HIGH_2", label: "高二" },
  { value: "HIGH_3", label: "高三" },
  { value: "UNIVERSITY_OR_WORK", label: "大学和工作" }
] as const;

export type LearnerGradeValue = (typeof learnerGradeOptions)[number]["value"];

const learnerGradeLabels = new Map<LearnerGradeValue, string>(
  learnerGradeOptions.map((option) => [option.value, option.label])
);

export function isLearnerGrade(value: unknown): value is LearnerGradeValue {
  return typeof value === "string" && learnerGradeLabels.has(value as LearnerGradeValue);
}

export function learnerGradeLabel(value: string) {
  return learnerGradeLabels.get(value as LearnerGradeValue) ?? value;
}
