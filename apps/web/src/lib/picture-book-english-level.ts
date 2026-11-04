export function pictureBookEnglishLevelLabel(value: number | null | undefined): string | null {
  if (value === 5) return "英语 Level 1（启蒙）";
  return Number.isInteger(value) && value! >= 1 && value! <= 4 ? `英语 Level ${value}` : null;
}
