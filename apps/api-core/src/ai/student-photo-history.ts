export type StudentPhotoOutput = { kind: "STUDENT_PHOTO"; images: string[]; widthMm?: number; heightMm?: number };

export function parseStudentPhotoOutput(output: string | null): StudentPhotoOutput | null {
  if (!output) return null;
  try {
    const value = JSON.parse(output) as StudentPhotoOutput;
    if (value.kind === "STUDENT_PHOTO" && Array.isArray(value.images) && [1, 2].includes(value.images.length) &&
        value.images.every((key) => typeof key === "string" && key.startsWith("student-photos/"))) return value;
  } catch { /* Legacy outputs are Markdown. */ }
  return null;
}

export function legacyStudentPhotoUrls(output: string | null) {
  return [...(output ?? "").matchAll(/!\[[^\]]*\]\((https:\/\/[^)]+)\)/g)].map((match) => match[1]).slice(0, 2);
}
