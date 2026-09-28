export type LearningMaterialType =
  | "VIDEO_GUIDE"
  | "ENGLISH_GUIDED_STUDY"
  | "LEARNING_FLASHCARD";

export interface LearningContext {
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

export type LearningEventInput =
  | { type: "MATERIAL_STARTED"; partKey: string }
  | {
      type: "MEDIA_PROGRESS";
      partKey: string;
      startSeconds: number;
      endSeconds: number;
      mediaDurationSeconds: number;
    }
  | { type: "NODE_LEARNED"; partKey: string; itemId: string }
  | {
      type: "PRACTICE_SUBMITTED";
      partKey: string;
      itemId: string;
      selectedIndex: number;
    }
  | { type: "READ_ALONG_COMPLETED"; partKey: string; itemId: string }
  | {
      type: "FLASHCARD_REVIEWED";
      partKey: "FLASHCARD_ROUND";
      reviewId: string;
    };

export type QueuedLearningEvent = LearningEventInput & {
  eventId: string;
  sequence: number;
  occurredAt: string;
  context: LearningContext;
};

export interface LearningTracker {
  start(): Promise<void>;
  stop(): Promise<void>;
  recordInteraction(at: Date): void;
  updateContext(context: LearningContext): void;
  enqueue(event: LearningEventInput): void;
  setPageVisible(visible: boolean): void;
  setHasFocus(hasFocus: boolean): void;
  setMediaPlaying(mediaPlaying: boolean): void;
}

export interface LearnerLearningOverview {
  range: { from: string; to: string };
  totals: {
    onlineSeconds: number;
    studySeconds: number;
    learningDays: number;
    startedMaterialCount: number;
    completedMaterialCount: number;
    completionRate: number | null;
  };
  daily: Array<{ date: string; onlineSeconds: number; studySeconds: number }>;
  recentMaterials: LearnerMaterialSummary[];
}

export interface LearnerMaterialSummary {
  materialType: LearningMaterialType;
  materialId: string;
  title: string;
  status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
  progressPercent: number;
  activeStudySeconds: number;
  lastStudiedAt: string;
  course: { id: string; name: string } | null;
  continueHref: string;
  detailHref: string;
}

export interface LearnerMaterialDetail extends LearnerMaterialSummary {
  contentVersion: string;
  firstStartedAt: string | null;
  completedAt: string | null;
  studyCount: number;
  completionCount: number;
  parts: Array<{
    key: string;
    label: string;
    status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
    progressPercent: number;
    activeStudySeconds: number;
    metrics: Record<string, number>;
  }>;
}

export interface AccountLearnerLearningOverview extends LearnerLearningOverview {
  courseBreakdown: Array<{
    courseId: string;
    courseName: string;
    studySeconds: number;
    startedMaterialCount: number;
    completedMaterialCount: number;
  }>;
  materialBreakdown: Array<{
    materialType: LearningMaterialType;
    materialId: string;
    title: string;
    studySeconds: number;
    progressPercent: number;
    status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
  }>;
  scenarioBreakdown: Array<{
    scenarioId: string;
    scenarioName: string;
    onlineSeconds: number;
    studySeconds: number;
    meaningfulActionCount: number;
  }>;
  resourceBreakdown: Array<{
    resourceType: string;
    resourceId: string;
    resourceName: string;
    studySeconds: number;
    startedMaterialCount: number;
    completedMaterialCount: number;
  }>;
}

export interface AccountLearnerLearningFilters {
  from?: string;
  to?: string;
  scenarioId?: string;
  courseId?: string;
  resourceType?: string;
  resourceId?: string;
  materialType?: LearningMaterialType;
  materialId?: string;
}

export function formatLearningDuration(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  if (safeSeconds === 0) return "0 分钟";
  if (safeSeconds < 60) return "少于 1 分钟";
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  if (hours === 0) return `${minutes} 分钟`;
  return minutes > 0 ? `${hours} 小时 ${minutes} 分钟` : `${hours} 小时`;
}

export function learnerLearningCenterMetrics(overview: LearnerLearningOverview) {
  const today = overview.daily.at(-1) ?? {
    date: overview.range.to,
    onlineSeconds: 0,
    studySeconds: 0
  };
  return {
    todayOnline: formatLearningDuration(today.onlineSeconds),
    todayStudy: formatLearningDuration(today.studySeconds),
    learningDays: `${overview.totals.learningDays} 天`,
    startedMaterials: `${overview.totals.startedMaterialCount} 个`,
    completedMaterials: `${overview.totals.completedMaterialCount} 个`
  };
}
