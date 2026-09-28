export const videoGuideLessonTitleMaxLength = 120;
export const videoGuideLessonTitleInputMaxLength = 260;

export function createVideoGuideLessonTitle(input: {
  mediaName: string;
  title?: string;
}) {
  const requestedTitle = input.title?.trim();

  if (requestedTitle) {
    return takeCharacters(requestedTitle, videoGuideLessonTitleMaxLength);
  }

  const suffix = " 导学课件";
  const mediaTitle = input.mediaName.trim().replace(/\.[^.]+$/, "") || "视频";
  const availableLength = videoGuideLessonTitleMaxLength - Array.from(suffix).length;

  return `${takeCharacters(mediaTitle, availableLength)}${suffix}`;
}

function takeCharacters(value: string, maxLength: number) {
  return Array.from(value).slice(0, maxLength).join("");
}
