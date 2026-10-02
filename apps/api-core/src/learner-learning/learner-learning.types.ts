import type { LearnerLearningSignal } from "./learner-learning.constants.js";

export interface HeartbeatActivityInput {
  pageVisible: boolean;
  hasFocus: boolean;
  mediaPlaying: boolean;
  lastInteractionAt: string;
}

export interface TimeSliceCandidate {
  activitySignal: LearnerLearningSignal;
  receivedAt: Date;
}

export type LearningMaterialType =
  | "VIDEO_GUIDE"
  | "ENGLISH_GUIDED_STUDY"
  | "LEARNING_FLASHCARD"
  | "PICTURE_BOOK";

export interface ResolvedLearningContext {
  isLearning: boolean;
  scenarioId: string | null;
  courseId: string | null;
  courseRevisionId: string | null;
  courseRevisionItemId: string | null;
  resourceType: string | null;
  resourceId: string | null;
  materialType: LearningMaterialType | null;
  materialId: string | null;
  contentVersion: string | null;
  partKey: string | null;
}

export interface LearnerLearningContextInput {
  isLearning: boolean;
  scenarioId?: string;
  courseId?: string;
  courseRevisionItemId?: string;
  resourceType?: string;
  resourceId?: string;
  materialType?: LearningMaterialType;
  materialId?: string;
  partKey?: string;
}
