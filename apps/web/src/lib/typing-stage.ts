export function typingLibraryStageLabel(value: string | null) {
  return ({
    PRIMARY: "小学",
    JUNIOR_HIGH: "初中",
    SENIOR_HIGH: "高中",
    UNIVERSITY: "大学",
    OTHER: "其他"
  } as Record<string, string>)[value ?? ""] ?? value ?? "";
}

export function typingLibraryVersionLabel(input: { stage: string | null; version: string | null }) {
  if (input.version) return input.version;
  return input.stage === "UNIVERSITY" ? "大学英语考试" : "英语";
}

export function typingLibraryGradeLabel(input: { grade: string | null; stage: string | null }) {
  if (input.grade) return input.grade;
  return input.stage === "UNIVERSITY" ? "大学" : "教材";
}

export function typingLibraryPracticeDefaults(stage: string | null) {
  return stage === "UNIVERSITY"
    ? {
        initialSelection: "UNIT" as const,
        requestScope: "NEW" as const,
        targetItemCount: 20 as const
      }
    : {
        initialSelection: "ALL" as const,
        requestScope: "UNIT" as const,
        targetItemCount: 0 as const
      };
}
