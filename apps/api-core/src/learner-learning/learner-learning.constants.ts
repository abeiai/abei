export const learnerHeartbeatSeconds = 30;
export const learnerIdleSeconds = 120;
export const learnerRawRetentionDays = 180;
export const learnerLearningTimeZone = "Asia/Shanghai";

export const learnerLearningSignals = [
  "INTERACTION",
  "MEDIA_PLAYING",
  "PRACTICE",
  "READ_ALONG",
  "FLASHCARD"
] as const;

export type LearnerLearningSignal = (typeof learnerLearningSignals)[number];

export function learnerLearningEnabled(
  env: Partial<Record<"LEARNER_LEARNING_ENABLED", string | undefined>> = process.env
) {
  return env.LEARNER_LEARNING_ENABLED === "1";
}
