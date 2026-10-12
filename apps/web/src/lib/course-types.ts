export type CourseReviewState = "DRAFT" | "PENDING_REVIEW" | "PUBLISHED" | "REJECTED";
export type CourseRevisionStatus = "DRAFT" | "PENDING" | "APPROVED" | "REJECTED";
export type CourseMaterialType =
  | "VIDEO_GUIDE"
  | "ENGLISH_GUIDED_STUDY"
  | "LEARNING_FLASHCARD"
  | "PICTURE_BOOK";
export type CourseGuidedStudyScene = "ENGLISH" | "GUSHIWEN";
export type CourseMaterialPublicationStatus = "PENDING" | "APPROVED" | "REJECTED";
export type CourseReviewScope = "COURSE_REVISION" | "MATERIAL_CHANGE";
export type CourseReviewRequestStatus = "PENDING" | "APPROVED" | "REJECTED";
export type CourseAiPrecheckStatus = "NOT_STARTED" | "RUNNING" | "PASSED" | "REJECTED" | "FAILED";
export type CourseAiPrecheckTrigger = "MANUAL" | "AUTOMATIC";

export type JsonValue =
  | boolean
  | number
  | string
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface CourseMaterialPublication {
  id: string;
  materialType: CourseMaterialType;
  videoGuideLessonId: string | null;
  englishGuidedStudyMaterialId: string | null;
  learningFlashcardDeckId: string | null;
  pictureBookId?: string | null;
  status: CourseMaterialPublicationStatus;
  approvedHash: string | null;
  currentHash: string;
  approvedSnapshot: JsonValue | null;
  currentSnapshot: JsonValue;
  createdAt: string;
  updatedAt: string;
  reviewRequests?: Array<{
    reviewNote: string | null;
  }>;
}

export interface CourseVideoGuideLesson {
  id: string;
  userId: string;
  title: string;
  mediaName: string;
  mediaType: "VIDEO" | "AUDIO";
  mediaMimeType: string | null;
  mediaSizeBytes: number;
  mediaUrl: string | null;
  mediaStorageKey: string | null;
  subtitleName: string | null;
  subtitleFormat: "SRT" | "ASS" | null;
  subtitleSizeBytes: number | null;
  subtitleUrl: string | null;
  subtitleStorageKey: string | null;
  status: "DRAFT" | "QUEUED" | "GENERATING" | "SUCCEEDED" | "FAILED";
  shareToken: string;
  content: JsonValue;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
}

export interface CourseEnglishGuidedStudyMaterial {
  id: string;
  userId: string;
  title: string;
  sourceType: "TEXT" | "IMAGE";
  sourceName: string | null;
  sourceText: string;
  levelStandardName: string;
  levelOptionLabel: string;
  aiLevel: string;
  summary: string;
  narration: string;
  audioUrl: string | null;
  audioTaskId: string | null;
  audioDurationSeconds: number;
  content: JsonValue;
  pinnedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CourseLearningFlashcard {
  id: string;
  deckId: string;
  type: string;
  front: string;
  back: string;
  source: string | null;
  tags: JsonValue;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface CourseLearningFlashcardDeck {
  id: string;
  userId: string;
  title: string;
  sourceType: "TEXTBOOK" | "UPLOAD" | "IMPORT";
  sourceName: string | null;
  sourceText: string | null;
  textbookId: string | null;
  textbookRange: string | null;
  detailRequest: string | null;
  strategy: "SUBJECT_KNOWLEDGE" | "SCIENCE_POPULARIZATION" | "DAILY_MEMORY";
  cardTypes: JsonValue;
  targetCardCount: number;
  summary: string;
  knowledgeMap: JsonValue;
  status: "DRAFT" | "GENERATING" | "READY" | "FAILED";
  aiTaskId: string | null;
  providerName: string | null;
  modelName: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  cards: CourseLearningFlashcard[];
}

export interface CourseRevisionItem {
  id: string;
  revisionId: string;
  publicationId: string;
  materialType: CourseMaterialType;
  videoGuideLessonId: string | null;
  englishGuidedStudyMaterialId: string | null;
  learningFlashcardDeckId: string | null;
  pictureBookId?: string | null;
  displayName: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  publication: CourseMaterialPublication;
  videoGuideLesson: CourseVideoGuideLesson | null;
  englishGuidedStudyMaterial: CourseEnglishGuidedStudyMaterial | null;
  learningFlashcardDeck: CourseLearningFlashcardDeck | null;
  pictureBook: { id: string; title: string; status: string; pages: unknown[] } | null;
}

export interface CourseRevision {
  id: string;
  courseId: string;
  coverMediaId: string;
  name: string;
  summary: string;
  tags: string[];
  status: CourseRevisionStatus;
  submittedAt: string | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
  coverMedia: {
    id: string;
    url: string;
  };
  items: CourseRevisionItem[];
}

export interface CourseSummary {
  creatorSync?: { source: string; version: number } | null;
  id: string;
  userId: string;
  approvedRevisionId: string | null;
  workingRevisionId: string | null;
  reviewState: CourseReviewState;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  approvedRevision: CourseRevision | null;
  workingRevision: CourseRevision | null;
}

export type CourseDetail = CourseSummary;

export interface CourseMaterialOption {
  materialType: CourseMaterialType;
  materialId: string;
  title: string;
  subtitle: string;
  guidedStudyScene?: CourseGuidedStudyScene;
  updatedAt: string;
}

export interface PublicCourseItem {
  id: string;
  materialType: CourseMaterialType;
  displayName: string;
  sortOrder: number;
  reviewState: "READY" | "PENDING" | "REJECTED";
  launchHref: string | null;
}

export interface PublicCourse {
  id: string;
  name: string;
  coverUrl: string;
  summary: string;
  tags: string[];
  author: {
    avatarUrl: string | null;
    nickname: string;
  };
  reviewing: boolean;
  publishedAt: string;
  learningCount?: number;
  items: PublicCourseItem[];
}

export type CoursePageResult =
  | {
      state: "AVAILABLE";
      course: PublicCourse;
      hasPublishedRevision: boolean;
      previewMode: "PUBLIC" | "CREATOR" | "ADMIN";
      revisionStatus: CourseRevisionStatus;
    }
  | {
      state: "REVIEWING";
      courseId: string;
    };

export interface CourseEnrollmentResult {
  addedCount: number;
  courseIds: string[];
}

export interface CourseListItem {
  id: string;
  name: string;
  coverUrl: string;
  summary: string;
  tags: string[];
  author: {
    avatarUrl: string | null;
    nickname: string;
  };
  reviewing: boolean;
  publishedAt: string;
  itemCount: number;
  learningCount?: number;
}

export interface PublicCourseListingItem extends CourseListItem {
  itemNames: string[];
}

export interface CourseListPage {
  items: CourseListItem[];
  page: number;
  pageSize: number;
  total: number;
}

export type CourseCatalogItem = CourseListItem;

export interface CourseCatalogPage extends CourseListPage {
  items: CourseCatalogItem[];
  tags: string[];
}

export interface CourseDiffEntry {
  kind:
    | "NAME"
    | "COVER"
    | "SUMMARY"
    | "TAG_ADDED"
    | "TAG_REMOVED"
    | "ITEM_ADDED"
    | "ITEM_REMOVED"
    | "ITEM_RENAMED"
    | "ITEM_REORDERED"
    | "MATERIAL_FIELD"
    | "CARD_ADDED"
    | "CARD_REMOVED"
    | "CARD_CHANGED";
  label: string;
  before: JsonValue;
  after: JsonValue;
}

export interface CourseReviewRequest {
  id: string;
  scope: CourseReviewScope;
  status: CourseReviewRequestStatus;
  courseId: string | null;
  courseRevisionId: string | null;
  materialPublicationId: string | null;
  submittedByUserId: string;
  reviewedByAdminId: string | null;
  beforeSnapshot: JsonValue | null;
  afterSnapshot: JsonValue;
  diff: CourseDiffEntry[];
  reviewNote: string | null;
  aiPrecheckStatus: CourseAiPrecheckStatus;
  aiPrecheckProgress: number;
  aiPrecheckMessage: string | null;
  aiPrecheckResult: JsonValue | null;
  aiPrecheckTaskId: string | null;
  aiPrecheckTrigger: CourseAiPrecheckTrigger | null;
  aiPrecheckStartedAt: string | null;
  aiPrecheckCompletedAt: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
  course: {
    id: string;
    userId: string;
    approvedRevisionId: string | null;
    workingRevisionId: string | null;
    reviewState: CourseReviewState;
    publishedAt: string | null;
    createdAt: string;
    updatedAt: string;
    user: {
      id: string;
      email: string;
      nickname: string;
    };
    approvedRevision: {
      id: string;
      name: string;
    } | null;
  } | null;
  courseRevision: CourseRevision | null;
  materialPublication: CourseMaterialPublication | null;
  submittedByUser: {
    id: string;
    email: string;
    nickname: string;
  };
  reviewedByAdmin: {
    id: string;
    email: string;
    name: string;
  } | null;
  affectedCourses: Array<{
    id: string;
    name: string;
    reviewState: CourseReviewState;
    publishedAt: string | null;
  }>;
}

export interface SaveCourseInput {
  name: string;
  coverMediaId: string;
  summary: string;
  tags: string[];
  items: Array<{
    materialType: CourseMaterialType;
    materialId: string;
    displayName: string;
  }>;
}

export interface MediaAssetSummary {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
  mediaType: "IMAGE" | "AUDIO" | "VIDEO";
  sourceType: "SYSTEM" | "USER_UPLOAD" | "AI_GENERATED" | "WEB_FETCHED";
  storageProvider: "LOCAL" | "S3";
  createdByAdminId: string | null;
  createdByAdmin: {
    id: string;
    email: string;
    name: string;
  } | null;
  createdAt: string;
}

export type ActionResult<TData> =
  | { ok: true; data: TData; message: string }
  | { ok: false; message: string; code?: number; httpStatus?: number };
