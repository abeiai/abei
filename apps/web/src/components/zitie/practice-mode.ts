export type PracticeLineMode = "sample" | "word" | "alternate" | "letter";

const allModes: PracticeLineMode[] = [
  "sample",
  "word",
  "alternate",
  "letter",
];

export function practiceModesForTemplate(
  templateId: string,
): PracticeLineMode[] {
  return templateId === "eight-line"
    ? ["sample", "alternate"]
    : [...allModes];
}

export function exampleCountsForMode(
  mode: PracticeLineMode,
  repeat: number,
) {
  return {
    darkExampleCount: 1,
    traceExampleCount:
      mode === "sample" || mode === "alternate" ? 0 : Math.max(0, repeat),
  };
}
