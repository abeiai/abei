import type {
  ActionResult,
  CourseDiffEntry,
  CourseMaterialType,
  CourseReviewRequest,
  CourseReviewRequestStatus,
  CourseReviewScope,
  JsonValue
} from "./course-types";

export interface CourseReviewDiffGroup {
  key: "profile" | "outline" | "material" | "other";
  title: string;
  entries: CourseDiffEntry[];
}

export interface FirstPublicationMaterialPresentation {
  displayName: string;
  materialType: CourseMaterialType;
  fields: Array<{ key: string; label: string; value: JsonValue }>;
}

const groupDefinitions: Array<{
  key: CourseReviewDiffGroup["key"];
  title: string;
  kinds: ReadonlySet<string>;
}> = [
  {
    key: "profile",
    title: "专辑资料",
    kinds: new Set(["NAME", "COVER", "SUMMARY", "TAG_ADDED", "TAG_REMOVED"])
  },
  {
    key: "outline",
    title: "专辑目录",
    kinds: new Set(["ITEM_ADDED", "ITEM_REMOVED", "ITEM_RENAMED", "ITEM_REORDERED"])
  },
  {
    key: "material",
    title: "课件内容",
    kinds: new Set(["MATERIAL_FIELD", "CARD_ADDED", "CARD_REMOVED", "CARD_CHANGED"])
  }
];

export function groupCourseReviewDiff(diff: CourseDiffEntry[]): CourseReviewDiffGroup[] {
  const groups = groupDefinitions.map((definition) => ({
    key: definition.key,
    title: definition.title,
    entries: diff.filter((entry) => definition.kinds.has(entry.kind))
  }));

  const knownKinds = new Set(groupDefinitions.flatMap((definition) => [...definition.kinds]));
  const otherEntries = diff.filter((entry) => !knownKinds.has(entry.kind));

  if (otherEntries.length > 0) {
    groups.push({ key: "other", title: "其他变更", entries: otherEntries });
  }

  return groups.filter((group) => group.entries.length > 0);
}

export interface CourseReviewFilters {
  status: CourseReviewRequestStatus;
  scope: CourseReviewScope | "";
}

export interface CourseActionFailureMetadata {
  code: number | null;
  httpStatus: number | null;
  message: string | null;
}

export function courseActionFailure<TData>(
  metadata: CourseActionFailureMetadata | null,
  fallback: string
): ActionResult<TData> {
  const result: ActionResult<TData> = {
    ok: false,
    message: metadata?.message ?? fallback
  };

  if (metadata?.code !== null && metadata?.code !== undefined) {
    result.code = metadata.code;
  }

  if (metadata?.httpStatus !== null && metadata?.httpStatus !== undefined) {
    result.httpStatus = metadata.httpStatus;
  }

  return result;
}

export function normalizeCourseReviewFilters(
  params: Record<string, string | string[] | undefined>
): CourseReviewFilters {
  const statusValue = firstSearchValue(params.status);
  const scopeValue = firstSearchValue(params.scope);
  const status = (["PENDING", "APPROVED", "REJECTED"] as const).find(
    (value) => value === statusValue
  ) ?? "PENDING";
  const scope = (["COURSE_REVISION", "MATERIAL_CHANGE"] as const).find(
    (value) => value === scopeValue
  ) ?? "";

  return { status, scope };
}

export function validateCourseReviewRejectionReason(reason: string) {
  const length = reason.trim().length;

  if (length < 2) {
    return "拒绝原因至少需要 2 个字符。";
  }

  if (length > 500) {
    return "拒绝原因不能超过 500 个字符。";
  }

  return null;
}

export function isCourseReviewConflict(result: ActionResult<unknown>) {
  return !result.ok && (result.httpStatus === 409 || result.code === 40901);
}

export function courseReviewActionOutcome(result: ActionResult<unknown>) {
  const shouldRefresh = result.ok || isCourseReviewConflict(result);

  return {
    clearSelection: shouldRefresh,
    message: result.message,
    refresh: shouldRefresh,
    success: result.ok
  };
}

export function courseMaterialTypeLabel(type: CourseMaterialType) {
  const labels: Record<CourseMaterialType, string> = {
    VIDEO_GUIDE: "视频导学",
    ENGLISH_GUIDED_STUDY: "英文带读",
    LEARNING_FLASHCARD: "学习闪卡",
    PICTURE_BOOK: "绘本"
  };

  return labels[type];
}

const materialFieldLabels: Record<CourseMaterialType, Record<string, string>> = {
  VIDEO_GUIDE: {
    title: "课件标题",
    mediaUrl: "媒体地址",
    subtitleName: "字幕文件名",
    subtitleFormat: "字幕格式",
    subtitleUrl: "字幕地址",
    subtitleText: "字幕文本",
    subtitles: "字幕列表",
    subtitleCues: "字幕列表",
    cues: "字幕列表",
    summary: "内容摘要",
    stageNames: "学习阶段",
    words: "重点词汇",
    guideWords: "导学词汇",
    teacherSegments: "教师讲解片段",
    questions: "练习题",
    repeatLines: "跟读内容",
    narration: "讲解文案",
    narrationScript: "讲解脚本",
    narrationTimeline: "讲解时间轴",
    narrationAudioUrl: "讲解音频地址",
    audioUrl: "音频地址",
    audioDurationSeconds: "音频时长（秒）",
    audioDurationMs: "音频时长（毫秒）",
    narrationVoice: "讲解音色"
  },
  ENGLISH_GUIDED_STUDY: {
    title: "课件标题",
    sourceText: "英文原文",
    original: "原文",
    summary: "内容摘要",
    narration: "讲解文案",
    sentences: "逐句学习内容",
    explanationMode: "讲解模式",
    level: "学习等级",
    questions: "练习题",
    audioUrl: "音频地址",
    audioDurationSeconds: "音频时长（秒）",
    audioDurationMs: "音频时长（毫秒）",
    audioTimeline: "音频时间轴",
    narrationTimelineV2: "讲解时间轴"
  },
  LEARNING_FLASHCARD: {
    title: "课件标题",
    summary: "内容摘要",
    knowledgeMap: "知识图谱",
    knowledgeGraph: "知识图谱",
    cards: "闪卡内容"
  },
  PICTURE_BOOK: { title: "绘本标题", style: "画风", aspectRatio: "画面比例", pages: "绘本页面" }
};

const legacyMaterialFieldKeys: Record<string, string> = {
  课件标题: "title",
  媒体地址: "mediaUrl",
  字幕: "subtitleText",
  摘要: "summary",
  讲解: "narration",
  逐句内容: "sentences",
  音频: "audioUrl",
  知识图谱: "knowledgeMap"
};

const nestedFieldLabels: Record<string, string> = {
  ...materialFieldLabels.VIDEO_GUIDE,
  ...materialFieldLabels.ENGLISH_GUIDED_STUDY,
  ...materialFieldLabels.LEARNING_FLASHCARD,
  ...materialFieldLabels.PICTURE_BOOK,
  answer: "答案",
  appearsAt: "出现时间",
  appearsAtSeconds: "出现时间（秒）",
  audioSizeBytes: "音频大小（字节）",
  back: "背面",
  chunks: "音频分段",
  chunkType: "分段类型",
  description: "描述",
  durationMs: "时长（毫秒）",
  endSeconds: "结束时间（秒）",
  explanation: "讲解内容",
  focus: "重点",
  front: "正面",
  grammarFocus: "语法重点",
  hint: "提示",
  meaning: "释义",
  nodes: "讲解节点",
  note: "说明",
  options: "选项",
  overlay: "画面文字",
  phonetic: "音标",
  points: "知识点",
  priority: "优先级",
  question: "题目",
  script: "讲解文案",
  sortOrder: "排序",
  source: "来源",
  startSeconds: "开始时间（秒）",
  subText: "辅助文字",
  subtitle: "字幕",
  tags: "标签",
  term: "术语",
  terms: "知识点时间",
  text: "文本",
  timeRange: "时间范围",
  type: "类型",
  version: "版本",
  word: "单词"
};

const hiddenSnapshotKeys = new Set([
  "id",
  "sentenceId",
  "pointId",
  "publicationId",
  "videoGuideLessonId",
  "englishGuidedStudyMaterialId",
  "learningFlashcardDeckId",
  "pictureBookId",
  "materialKey"
]);

const flashcardFieldDefinitions = [
  { key: "front", label: "正面" },
  { key: "back", label: "背面" },
  { key: "type", label: "类型" },
  { key: "source", label: "来源" },
  { key: "tags", label: "标签" },
  { key: "sortOrder", label: "排序" }
] as const;

export function courseMaterialFieldLabel(
  type: CourseMaterialType | null | undefined,
  fieldOrLabel: string
) {
  const normalized = fieldOrLabel.trim();
  const key = legacyMaterialFieldKeys[normalized] ?? normalized;
  const mapped = type ? materialFieldLabels[type]?.[key] : undefined;

  if (mapped) {
    return mapped;
  }

  if (isSafeChineseLabel(normalized)) {
    return normalized;
  }

  return unknownFieldLabel(key);
}

export function localizeCourseReviewValue(value: JsonValue): JsonValue {
  return localizeReviewValue(value, 0);
}

function localizeReviewValue(value: JsonValue, depth: number): JsonValue {
  if (Array.isArray(value)) {
    return value.map((item) => localizeReviewValue(item, depth + 1));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const localized: Record<string, JsonValue> = {};

  for (const [key, item] of Object.entries(value)) {
    if (hiddenSnapshotKeys.has(key)) {
      continue;
    }

    const baseLabel = key === "title" && depth > 0
      ? "标题"
      : nestedFieldLabels[key] ?? unknownFieldLabel(key);
    const label = uniqueLocalizedFieldLabel(baseLabel, key, localized);
    localized[label] = localizeReviewValue(item, depth + 1);
  }

  return localized;
}

export function flashcardChangedFields(before: JsonValue, after: JsonValue) {
  const beforeRecord = jsonRecord(before);
  const afterRecord = jsonRecord(after);

  return flashcardFieldDefinitions.flatMap(({ key, label }) => {
    const beforeValue = beforeRecord[key] ?? null;
    const afterValue = afterRecord[key] ?? null;

    return jsonValuesEqual(beforeValue, afterValue)
      ? []
      : [{ key, label, before: beforeValue, after: afterValue }];
  });
}

export function flashcardDiffTitle(
  kind: "CARD_CHANGED" | "CARD_ADDED" | "CARD_REMOVED",
  before: JsonValue,
  after: JsonValue
) {
  const action = kind === "CARD_CHANGED" ? "修改" : kind === "CARD_ADDED" ? "新增" : "移除";
  const snapshot = kind === "CARD_REMOVED" ? before : after;
  const front = jsonRecord(snapshot).front;
  const name = typeof front === "string" && front.trim() ? front.trim() : "未命名闪卡";

  return `${action}闪卡：${name}`;
}

export function flashcardPresentationFields(value: JsonValue) {
  const record = jsonRecord(value);

  return flashcardFieldDefinitions.flatMap(({ key, label }) => key in record
    ? [{ key, label, value: record[key] ?? null }]
    : []);
}

export function courseRevisionItemPresentationFields(value: JsonValue) {
  const record = jsonRecord(value);
  const fields: Array<{ key: string; label: string; value: JsonValue }> = [];

  if ("displayName" in record) {
    fields.push({ key: "displayName", label: "课件名称", value: record.displayName ?? null });
  }

  if ("materialType" in record) {
    const type = record.materialType;
    fields.push({
      key: "materialType",
      label: "课件类型",
      value: isCourseMaterialType(type) ? courseMaterialTypeLabel(type) : "未知课件"
    });
  }

  if ("sortOrder" in record) {
    fields.push({ key: "sortOrder", label: "排序", value: record.sortOrder ?? null });
  }

  return fields;
}

export function firstPublicationMaterialPresentations(
  review: CourseReviewRequest
): FirstPublicationMaterialPresentation[] {
  if (review.scope !== "COURSE_REVISION") {
    return [];
  }

  const items = jsonRecord(review.afterSnapshot).items;

  if (!Array.isArray(items)) {
    return [];
  }

  return items.flatMap((value) => {
    const item = jsonRecord(value);
    const materialType = item.materialType;
    const materialSnapshot = item.materialSnapshot;

    if (
      item.firstPublication !== true
      || !isCourseMaterialType(materialType)
      || !materialSnapshot
      || typeof materialSnapshot !== "object"
      || Array.isArray(materialSnapshot)
    ) {
      return [];
    }

    const displayName = typeof item.displayName === "string" && item.displayName.trim()
      ? item.displayName.trim()
      : "未命名课件";
    const fields = Object.entries(jsonRecord(materialSnapshot)).flatMap(([key, fieldValue]) => {
      if (key === "type") {
        return [];
      }

      return [{
        key,
        label: courseMaterialFieldLabel(materialType, key),
        value: localizeCourseReviewValue(fieldValue)
      }];
    });

    return [{ displayName, materialType, fields }];
  });
}

export function courseReviewTitle(review: CourseReviewRequest) {
  if (review.scope === "COURSE_REVISION") {
    return review.courseRevision?.name
      ?? review.course?.approvedRevision?.name
      ?? "未命名专辑";
  }

  const currentTitle = snapshotTitle(review.afterSnapshot);
  const approvedTitle = snapshotTitle(review.beforeSnapshot);

  if (currentTitle || approvedTitle) {
    return currentTitle ?? approvedTitle!;
  }

  const type = review.materialPublication?.materialType;
  return type ? `${courseMaterialTypeLabel(type)}内容变更` : "课件内容变更";
}

export function courseReviewAffectedCourseCount(review: CourseReviewRequest) {
  const courseIds = new Set(
    review.affectedCourses.map((course) => course.id).filter(Boolean)
  );

  if (review.scope === "COURSE_REVISION") {
    const courseId = review.courseId ?? review.course?.id;

    if (courseId) {
      courseIds.add(courseId);
    }
  }

  return courseIds.size;
}

export function courseReviewPreviewCourses(review: CourseReviewRequest) {
  const courses = new Map<string, { id: string; name: string; href: string }>();
  const addCourse = (id: string | null | undefined, name: string | null | undefined) => {
    if (!id || courses.has(id)) {
      return;
    }

    courses.set(id, {
      id,
      name: name?.trim() || "未命名专辑",
      href: `/c/${id}`
    });
  };

  if (review.scope === "COURSE_REVISION") {
    addCourse(
      review.courseId ?? review.course?.id,
      review.courseRevision?.name ?? review.course?.approvedRevision?.name
    );
  }

  for (const course of review.affectedCourses) {
    addCourse(course.id, course.name);
  }

  return [...courses.values()];
}

export function claimCourseReviewSubmission(lock: { current: boolean }) {
  if (lock.current) {
    return false;
  }

  lock.current = true;
  return true;
}

export function releaseCourseReviewSubmission(lock: { current: boolean }) {
  lock.current = false;
}

function firstSearchValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function jsonRecord(value: JsonValue | null) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, JsonValue>
    : {};
}

function jsonValuesEqual(left: JsonValue, right: JsonValue): boolean {
  if (left === null || right === null || typeof left !== "object" || typeof right !== "object") {
    return left === right;
  }

  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
      return false;
    }

    return left.every((item, index) => jsonValuesEqual(item, right[index]!));
  }

  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();

  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  return leftKeys.every((key, index) => (
    key === rightKeys[index]
    && jsonValuesEqual(left[key]!, right[key]!)
  ));
}

function snapshotTitle(value: JsonValue | null) {
  const title = jsonRecord(value).title;
  return typeof title === "string" && title.trim() ? title.trim() : null;
}

function isCourseMaterialType(value: JsonValue): value is CourseMaterialType {
  return value === "VIDEO_GUIDE"
    || value === "ENGLISH_GUIDED_STUDY"
    || value === "LEARNING_FLASHCARD"
    || value === "PICTURE_BOOK";
}

function isSafeChineseLabel(value: string) {
  return value.length > 0
    && value.length <= 80
    && !/[\r\n<>]/u.test(value)
    && /[\u3400-\u9fff]/u.test(value);
}

function uniqueLocalizedFieldLabel(
  label: string,
  sourceKey: string,
  localized: Record<string, JsonValue>
) {
  if (!Object.prototype.hasOwnProperty.call(localized, label)) {
    return label;
  }

  const safeSourceKey = /^[a-z][a-zA-Z0-9]{0,63}$/u.test(sourceKey) ? sourceKey : null;
  let occurrence = 2;
  let candidate = safeSourceKey
    ? `${label}（${safeSourceKey}）`
    : `${label}（第 ${occurrence} 项）`;

  while (Object.prototype.hasOwnProperty.call(localized, candidate)) {
    occurrence += 1;
    candidate = safeSourceKey
      ? `${label}（${safeSourceKey}，第 ${occurrence} 项）`
      : `${label}（第 ${occurrence} 项）`;
  }

  return candidate;
}

function unknownFieldLabel(key: string) {
  return /^[a-z][a-zA-Z0-9]{0,63}$/u.test(key)
    ? `其他字段（${key}）`
    : "其他字段";
}
