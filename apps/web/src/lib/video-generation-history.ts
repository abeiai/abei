export type VideoHistorySubject =
  | { mode: "GUEST" }
  | { mode: "ACCOUNT"; userId: string }
  | { mode: "LEARNER"; userId: string; learnerId: string };

const videoHistoryKeyPrefix = "xueleai:experience-video:history";

export function videoHistoryStorageKey(subject: VideoHistorySubject) {
  if (subject.mode === "GUEST") {
    return `${videoHistoryKeyPrefix}:guest`;
  }

  const userId = normalizedIdentityId(subject.userId);

  if (subject.mode === "ACCOUNT") {
    return `${videoHistoryKeyPrefix}:account:${encodeURIComponent(userId)}`;
  }

  const learnerId = normalizedIdentityId(subject.learnerId);
  return `${videoHistoryKeyPrefix}:learner:${encodeURIComponent(userId)}:${encodeURIComponent(learnerId)}`;
}

function normalizedIdentityId(value: string) {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error("视频历史身份不能为空");
  }

  return normalized;
}
