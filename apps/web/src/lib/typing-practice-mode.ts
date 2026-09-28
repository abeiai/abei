export const typingPracticeModes = [
  { value: "BEGINNER", label: "新手上路" },
  { value: "CHINESE", label: "中文听写" },
  { value: "ENGLISH", label: "英文听写" }
] as const;

export type TypingPracticeMode = typeof typingPracticeModes[number]["value"];

export function parseTypingPracticeMode(value: string | null): TypingPracticeMode {
  return value === "CHINESE" || value === "ENGLISH" ? value : "BEGINNER";
}

export function typingPracticeModeKey(sessionId: string) {
  return `typing:practice-mode:${sessionId}`;
}

export function typingPracticePresentation(mode: TypingPracticeMode, correct: boolean) {
  return {
    showTranslation: mode !== "ENGLISH" || correct,
    showImage: correct ? mode === "ENGLISH" : mode !== "ENGLISH",
    audioEnabled: mode !== "CHINESE"
  };
}

export const typingVoices = [
  { value: "uk-female", label: "英音女" },
  { value: "uk-male", label: "英音男" },
  { value: "us-female", label: "美音女" },
  { value: "us-male", label: "美音男" }
] as const;
export type TypingVoice = typeof typingVoices[number]["value"];
export function parseTypingVoice(value: string | null): TypingVoice {
  return typingVoices.find((voice) => voice.value === value)?.value ?? "uk-female";
}
export function typingVoiceKey(sessionId: string) { return `typing:voice:${sessionId}`; }
export function typingAudioUrl(audioUrls: Record<string, string> | undefined, voice: TypingVoice) {
  return audioUrls?.[voice] ?? null;
}
