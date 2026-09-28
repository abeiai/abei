import {
  learnerHeartbeatSeconds,
  learnerIdleSeconds,
  learnerLearningTimeZone,
  type LearnerLearningSignal
} from "./learner-learning.constants.js";
import type {
  HeartbeatActivityInput,
  TimeSliceCandidate
} from "./learner-learning.types.js";

const signalPriority: Record<LearnerLearningSignal, number> = {
  INTERACTION: 1,
  MEDIA_PLAYING: 2,
  FLASHCARD: 3,
  READ_ALONG: 4,
  PRACTICE: 5
};

const shanghaiDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: learnerLearningTimeZone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

export function heartbeatIsActive(input: HeartbeatActivityInput, now: Date) {
  if (!input.pageVisible || (!input.hasFocus && !input.mediaPlaying)) {
    return false;
  }

  if (input.mediaPlaying) {
    return true;
  }

  const interactionAt = new Date(input.lastInteractionAt);
  if (Number.isNaN(interactionAt.getTime())) {
    return false;
  }
  const idleMilliseconds = now.getTime() - interactionAt.getTime();
  return idleMilliseconds >= 0 && idleMilliseconds <= learnerIdleSeconds * 1000;
}

export function heartbeatDeltaSeconds(previousAt: Date, now: Date) {
  const elapsed = Math.floor((now.getTime() - previousAt.getTime()) / 1000);
  return Math.max(0, Math.min(learnerHeartbeatSeconds, elapsed));
}

export function canonicalBucketStart(now: Date) {
  const size = learnerHeartbeatSeconds * 1000;
  return new Date(Math.floor(now.getTime() / size) * size);
}

export function shanghaiDateKey(now: Date) {
  const parts = shanghaiDateFormatter.formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) {
    throw new Error("无法计算北京时间日期");
  }
  return `${year}-${month}-${day}`;
}

export function preferTimeSlice<T extends TimeSliceCandidate>(current: T, candidate: T) {
  const priorityDifference =
    signalPriority[candidate.activitySignal] - signalPriority[current.activitySignal];
  if (priorityDifference > 0) {
    return candidate;
  }
  if (priorityDifference < 0) {
    return current;
  }
  return candidate.receivedAt >= current.receivedAt ? candidate : current;
}
