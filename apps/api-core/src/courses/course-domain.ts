import { createHash, randomBytes } from "node:crypto";

export type CourseDiffEntry = {
  kind: "NAME" | "COVER" | "SUMMARY" | "TAG_ADDED" | "TAG_REMOVED" | "ITEM_ADDED" | "ITEM_REMOVED" | "ITEM_RENAMED" | "ITEM_REORDERED" | "MATERIAL_FIELD" | "CARD_ADDED" | "CARD_REMOVED" | "CARD_CHANGED";
  label: string;
  before: unknown;
  after: unknown;
};

export type CourseMaterialType = "VIDEO_GUIDE" | "ENGLISH_GUIDED_STUDY" | "LEARNING_FLASHCARD" | "PICTURE_BOOK";

export type CourseMaterialSnapshot = {
  type: CourseMaterialType;
  [key: string]: unknown;
};

type CourseRevisionItemSnapshot = {
  id?: string;
  materialKey?: string;
  publicationId?: string;
  materialType?: string;
  videoGuideLessonId?: string | null;
  englishGuidedStudyMaterialId?: string | null;
  learningFlashcardDeckId?: string | null;
  pictureBookId?: string | null;
  displayName: string;
  sortOrder: number;
};

export type CourseRevisionSnapshot = {
  name?: string;
  coverUrl?: string | null;
  coverMediaId?: string | null;
  summary?: string;
  tags?: string[];
  items?: CourseRevisionItemSnapshot[];
};

type PublicFieldRule =
  | { kind: "scalar" }
  | { kind: "scalarArray" }
  | { fields: PublicFieldSchema; kind: "object" }
  | { fields: PublicFieldSchema; kind: "objectArray" };

type PublicFieldSchema = Record<string, PublicFieldRule>;

const scalar = { kind: "scalar" } as const;
const scalarArray = { kind: "scalarArray" } as const;

const subtitleCueSchema = objectArray({
  endSeconds: scalar,
  sentenceId: scalar,
  startSeconds: scalar,
  text: scalar,
  timeRange: scalar
});
const guideWordSchema = objectArray({
  appearsAt: scalar,
  appearsAtSeconds: scalar,
  endSeconds: scalar,
  id: scalar,
  meaning: scalar,
  note: scalar,
  phonetic: scalar,
  subtitle: scalar,
  timeRange: scalar,
  word: scalar
});
const teacherSegmentSchema = objectArray({
  endSeconds: scalar,
  explanation: scalar,
  id: scalar,
  startSeconds: scalar,
  subtitle: scalar,
  timeRange: scalar
});
const questionSchema = objectArray({
  answer: scalar,
  explanation: scalar,
  id: scalar,
  options: scalarArray,
  question: scalar
});
const repeatLineSchema = objectArray({
  endSeconds: scalar,
  hint: scalar,
  id: scalar,
  startSeconds: scalar,
  text: scalar,
  timeRange: scalar
});
const narrationChunkSchema = objectArray({
  id: scalar,
  overlay: object({
    subText: scalar,
    text: scalar
  }),
  text: scalar,
  type: scalar
});
const videoNarrationNodeSchema = objectArray({
  audioSizeBytes: scalar,
  audioUrl: scalar,
  chunks: narrationChunkSchema,
  durationMs: scalar,
  endSeconds: scalar,
  id: scalar,
  script: scalar,
  sentenceId: scalar,
  startSeconds: scalar,
  subtitle: scalar,
  timeRange: scalar,
  title: scalar,
  type: scalar
});

const videoGuideSchema: PublicFieldSchema = {
  title: scalar,
  mediaUrl: scalar,
  subtitleName: scalar,
  subtitleFormat: scalar,
  subtitleUrl: scalar,
  subtitleText: scalar,
  subtitles: subtitleCueSchema,
  subtitleCues: subtitleCueSchema,
  cues: subtitleCueSchema,
  summary: scalar,
  stageNames: scalarArray,
  words: guideWordSchema,
  guideWords: guideWordSchema,
  teacherSegments: teacherSegmentSchema,
  questions: questionSchema,
  repeatLines: repeatLineSchema,
  narration: scalar,
  narrationScript: scalar,
  narrationTimeline: videoNarrationNodeSchema,
  narrationAudioUrl: scalar,
  audioUrl: scalar,
  audioDurationSeconds: scalar,
  audioDurationMs: scalar,
  narrationVoice: scalar
};

const studyPointSchema = objectArray({
  endSeconds: scalar,
  id: scalar,
  meaning: scalar,
  note: scalar,
  startSeconds: scalar,
  term: scalar
});
const studySentenceSchema = objectArray({
  endSeconds: scalar,
  explanation: scalar,
  grammarFocus: scalar,
  id: scalar,
  points: studyPointSchema,
  script: scalar,
  startSeconds: scalar,
  text: scalar
});
const audioTimelineTermSchema = objectArray({
  endSeconds: scalar,
  pointId: scalar,
  startSeconds: scalar,
  term: scalar
});
const audioTimelineSchema = objectArray({
  endSeconds: scalar,
  sentenceId: scalar,
  startSeconds: scalar,
  terms: audioTimelineTermSchema
});
const englishNarrationNodeSchema = objectArray({
  audioUrl: scalar,
  chunkType: scalar,
  durationMs: scalar,
  focus: object({
    pointId: scalar,
    text: scalar
  }),
  id: scalar,
  script: scalar,
  sentenceId: scalar,
  type: scalar
});
const englishReadAlongWordSchema = objectArray({
  endChar: scalar,
  endSeconds: scalar,
  startChar: scalar,
  startSeconds: scalar,
  text: scalar
});
const englishReadAlongCueSchema = objectArray({
  endSeconds: scalar,
  id: scalar,
  sentenceId: scalar,
  startSeconds: scalar,
  text: scalar,
  timingSource: scalar,
  unitId: scalar,
  unitType: scalar,
  words: englishReadAlongWordSchema
});
const englishReadAlongNodeSchema = objectArray({
  audioUrl: scalar,
  durationMs: scalar,
  id: scalar,
  sentenceId: scalar,
  text: scalar,
  timingSource: scalar,
  unitId: scalar,
  unitType: scalar,
  words: englishReadAlongWordSchema
});
const englishGuidedStudySchema: PublicFieldSchema = {
  title: scalar,
  contentTitle: scalar,
  scene: scalar,
  author: scalar,
  authorIntroductionMode: scalar,
  sourceText: scalar,
  original: scalar,
  summary: scalar,
  narration: scalar,
  sentences: studySentenceSchema,
  audioUrl: scalar,
  audioDurationSeconds: scalar,
  audioDurationMs: scalar,
  audioTimeline: audioTimelineSchema,
  narrationTimelineV2: object({
    nodes: englishNarrationNodeSchema,
    version: scalar
  }),
  readAlong: object({
    audioName: scalar,
    audioUrl: scalar,
    cues: englishReadAlongCueSchema,
    durationMs: scalar,
    nodes: englishReadAlongNodeSchema,
    source: scalar,
    srtText: scalar,
    version: scalar,
    voice: scalar
  })
};

const englishGuidedStudyPlayerSchema: PublicFieldSchema = {
  ...englishGuidedStudySchema,
  explanationMode: scalar,
  level: object({
    aiLevel: scalar,
    optionLabel: scalar,
    standardName: scalar
  }),
  questions: questionSchema
};

const knowledgeNodeSchema = objectArray({
  description: scalar,
  priority: scalar,
  title: scalar
});
const flashcardCardSchema = objectArray({
  back: scalar,
  front: scalar,
  id: scalar,
  sortOrder: scalar,
  source: scalar,
  tags: scalarArray,
  type: scalar
});
const flashcardSchema: PublicFieldSchema = {
  title: scalar,
  summary: scalar,
  knowledgeMap: knowledgeNodeSchema,
  knowledgeGraph: knowledgeNodeSchema,
  cards: flashcardCardSchema
};

export function createCourseId() {
  return randomBytes(12).toString("hex");
}

export function isCourseId(value: string) {
  return /^[0-9a-f]{24}$/.test(value);
}

export function normalizeCourseTags(tags: string[]) {
  return [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))];
}

export function snapshotCourseMaterial(
  type: CourseMaterialType,
  record: unknown
): CourseMaterialSnapshot {
  const source = asRecord(record);
  const content = asRecord(source.content);
  let projected: Record<string, unknown>;

  if (type === "VIDEO_GUIDE") {
    projected = projectCourseFields(source, content, videoGuideSchema);
  } else if (type === "ENGLISH_GUIDED_STUDY") {
    projected = projectEnglishGuidedStudyFields(source, content);
  } else if (type === "PICTURE_BOOK") {
    projected = {
      title: source.title,
      style: source.style,
      aspectRatio: source.aspectRatio,
      ...(source.isSpread === true ? { isSpread: true } : {}),
      pages: arrayOfRecords(source.pages)
        .map((page) => ({
          position: page.position,
          caption: page.caption,
          narration: page.narration,
          ...(page.textInImage === true ? { textInImage: true } : {}),
          imageUrl: page.imageUrl,
          audioUrl: page.audioUrl
        }))
        .sort((left, right) => Number(left.position) - Number(right.position))
    };
  } else {
    projected = projectCourseFields(source, content, flashcardSchema);
    projected.cards = arrayOfRecords(projected.cards).sort(compareFlashcards);
  }

  return { type, ...projected };
}

export function projectPublicCourseMaterial(
  type: Exclude<CourseMaterialType, "LEARNING_FLASHCARD" | "PICTURE_BOOK">,
  record: unknown
): Record<string, unknown> {
  const source = asRecord(record);
  const content = asRecord(source.content);
  return type === "VIDEO_GUIDE"
    ? projectCourseFields(source, content, videoGuideSchema)
    : projectEnglishGuidedStudyFields(source, content);
}

export function hashCourseSnapshot(snapshot: unknown) {
  return createHash("sha256").update(stableJson(snapshot)).digest("hex");
}

export function diffCourseRevision(
  before: CourseRevisionSnapshot,
  after: CourseRevisionSnapshot
): CourseDiffEntry[] {
  const diff: CourseDiffEntry[] = [];
  pushChangedValue(diff, "NAME", "课程名称", before.name, after.name);
  pushChangedValue(diff, "COVER", "课程封面", coverValue(before), coverValue(after));
  pushChangedValue(diff, "SUMMARY", "课程简介", before.summary, after.summary);

  const beforeTags = normalizeCourseTags(before.tags ?? []);
  const afterTags = normalizeCourseTags(after.tags ?? []);
  const beforeTagSet = new Set(beforeTags);
  const afterTagSet = new Set(afterTags);

  for (const tag of afterTags) {
    if (!beforeTagSet.has(tag)) {
      diff.push({ kind: "TAG_ADDED", label: `新增标签：${tag}`, before: null, after: tag });
    }
  }

  for (const tag of beforeTags) {
    if (!afterTagSet.has(tag)) {
      diff.push({ kind: "TAG_REMOVED", label: `移除标签：${tag}`, before: tag, after: null });
    }
  }

  const beforeItems = before.items ?? [];
  const afterItems = after.items ?? [];
  const beforeByKey = new Map(beforeItems.map((item, index) => [revisionItemKey(item, index), item]));
  const afterByKey = new Map(afterItems.map((item, index) => [revisionItemKey(item, index), item]));

  for (const [key, item] of afterByKey) {
    if (!beforeByKey.has(key)) {
      diff.push({ kind: "ITEM_ADDED", label: `新增课件：${item.displayName}`, before: null, after: item });
    }
  }

  for (const [key, item] of beforeByKey) {
    if (!afterByKey.has(key)) {
      diff.push({ kind: "ITEM_REMOVED", label: `移除课件：${item.displayName}`, before: item, after: null });
    }
  }

  for (const [key, afterItem] of afterByKey) {
    const beforeItem = beforeByKey.get(key);

    if (!beforeItem) {
      continue;
    }

    if (beforeItem.displayName !== afterItem.displayName) {
      diff.push({
        kind: "ITEM_RENAMED",
        label: "课件名称",
        before: beforeItem.displayName,
        after: afterItem.displayName
      });
    }

    if (beforeItem.sortOrder !== afterItem.sortOrder) {
      diff.push({
        kind: "ITEM_REORDERED",
        label: `课件排序：${afterItem.displayName}`,
        before: beforeItem.sortOrder,
        after: afterItem.sortOrder
      });
    }
  }

  return diff;
}

export function diffCourseMaterial(before: unknown, after: unknown): CourseDiffEntry[] {
  const beforeSnapshot = asRecord(before);
  const afterSnapshot = asRecord(after);
  const diff: CourseDiffEntry[] = [];
  const fields = [...new Set([...Object.keys(beforeSnapshot), ...Object.keys(afterSnapshot)])]
    .filter((key) => key !== "type" && key !== "cards")
    .sort(compareUtf16);

  for (const field of fields) {
    if (!valuesEqual(beforeSnapshot[field], afterSnapshot[field])) {
      diff.push({
        kind: "MATERIAL_FIELD",
        label: materialFieldLabel(field),
        before: beforeSnapshot[field],
        after: afterSnapshot[field]
      });
    }
  }

  const beforeCards = arrayOfRecords(beforeSnapshot.cards);
  const afterCards = arrayOfRecords(afterSnapshot.cards);
  const beforeById = new Map(beforeCards.map((card, index) => [cardKey(card, index), card]));
  const afterById = new Map(afterCards.map((card, index) => [cardKey(card, index), card]));

  for (const [id, card] of afterById) {
    if (!beforeById.has(id)) {
      diff.push({ kind: "CARD_ADDED", label: `新增闪卡：${cardName(card)}`, before: null, after: card });
    }
  }

  for (const [id, card] of beforeById) {
    if (!afterById.has(id)) {
      diff.push({ kind: "CARD_REMOVED", label: `移除闪卡：${cardName(card)}`, before: card, after: null });
    }
  }

  for (const [id, afterCard] of afterById) {
    const beforeCard = beforeById.get(id);

    if (beforeCard && !valuesEqual(beforeCard, afterCard)) {
      diff.push({
        kind: "CARD_CHANGED",
        label: `修改闪卡：${cardName(afterCard)}`,
        before: beforeCard,
        after: afterCard
      });
    }
  }

  return diff;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => compareUtf16(left, right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function arrayOfRecords(value: unknown) {
  return Array.isArray(value) ? value.map(asRecord) : [];
}

function object(fields: PublicFieldSchema): PublicFieldRule {
  return { fields, kind: "object" };
}

function objectArray(fields: PublicFieldSchema): PublicFieldRule {
  return { fields, kind: "objectArray" };
}

function projectCourseFields(
  source: Record<string, unknown>,
  content: Record<string, unknown>,
  schema: PublicFieldSchema
) {
  const result: Record<string, unknown> = {};

  for (const [field, rule] of Object.entries(schema)) {
    const value = source[field] !== undefined ? source[field] : content[field];
    const projected = projectPublicValue(value, rule);

    if (projected !== undefined) {
      result[field] = projected;
    }
  }

  return result;
}

function projectEnglishGuidedStudyFields(
  source: Record<string, unknown>,
  content: Record<string, unknown>
) {
  const projected = projectCourseFields(source, content, englishGuidedStudyPlayerSchema);

  if (projected.level === undefined) {
    const standardName = stringValue(source.levelStandardName);
    const optionLabel = stringValue(source.levelOptionLabel);
    const aiLevel = stringValue(source.aiLevel);

    if (standardName || optionLabel || aiLevel) {
      projected.level = { standardName, optionLabel, aiLevel };
    }
  }

  projected.explanationMode ??= "SENTENCE";
  projected.questions ??= [];

  return projected;
}

function projectObject(value: unknown, schema: PublicFieldSchema) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const source = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};

  for (const [field, rule] of Object.entries(schema)) {
    const projected = projectPublicValue(source[field], rule);

    if (projected !== undefined) {
      result[field] = projected;
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

function projectPublicValue(value: unknown, rule: PublicFieldRule): unknown {
  if (value === undefined) {
    return undefined;
  }

  if (rule.kind === "scalar") {
    return isPublicScalar(value) ? value : undefined;
  }

  if (rule.kind === "scalarArray") {
    return Array.isArray(value) ? value.filter(isPublicScalar) : undefined;
  }

  if (value === null) {
    return null;
  }

  if (rule.kind === "object") {
    return projectObject(value, rule.fields);
  }

  if (!Array.isArray(value)) {
    return undefined;
  }

  const items: Record<string, unknown>[] = [];

  for (const item of value) {
    const projected = projectObject(item, rule.fields);

    if (projected) {
      items.push(projected);
    }
  }

  return items;
}

function isPublicScalar(value: unknown): value is string | number | boolean | null {
  return value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value));
}

function compareFlashcards(left: Record<string, unknown>, right: Record<string, unknown>) {
  const sortOrderDifference = numberValue(left.sortOrder) - numberValue(right.sortOrder);

  if (sortOrderDifference !== 0) {
    return sortOrderDifference;
  }

  return compareUtf16(stringValue(left.id), stringValue(right.id));
}

function compareUtf16(left: string, right: string) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function valuesEqual(left: unknown, right: unknown) {
  return stableJson(left) === stableJson(right);
}

function pushChangedValue(
  target: CourseDiffEntry[],
  kind: "NAME" | "COVER" | "SUMMARY",
  label: string,
  before: unknown,
  after: unknown
) {
  if (!valuesEqual(before, after)) {
    target.push({ kind, label, before, after });
  }
}

function coverValue(revision: CourseRevisionSnapshot) {
  return revision.coverUrl !== undefined ? revision.coverUrl : revision.coverMediaId;
}

function revisionItemKey(item: CourseRevisionItemSnapshot, index: number) {
  if (item.materialKey) return item.materialKey;
  if (item.publicationId) return item.publicationId;
  if (item.videoGuideLessonId) return `VIDEO_GUIDE:${item.videoGuideLessonId}`;
  if (item.englishGuidedStudyMaterialId) return `ENGLISH_GUIDED_STUDY:${item.englishGuidedStudyMaterialId}`;
  if (item.learningFlashcardDeckId) return `LEARNING_FLASHCARD:${item.learningFlashcardDeckId}`;
  if (item.pictureBookId) return `PICTURE_BOOK:${item.pictureBookId}`;
  if (item.id) return item.id;
  return `${item.materialType ?? "MATERIAL"}:${index}`;
}

function cardKey(card: Record<string, unknown>, index: number) {
  return stringValue(card.id) || `card:${index}`;
}

function cardName(card: Record<string, unknown>) {
  return stringValue(card.front) || stringValue(card.id) || "未命名闪卡";
}

function materialFieldLabel(field: string) {
  const labels: Record<string, string> = {
    title: "课件标题",
    mediaUrl: "媒体地址",
    subtitleText: "字幕",
    summary: "摘要",
    narration: "讲解",
    sentences: "逐句内容",
    explanationMode: "讲解模式",
    level: "学习等级",
    questions: "练习题",
    audioUrl: "音频",
    knowledgeMap: "知识图谱",
    knowledgeGraph: "知识图谱",
    style: "画风",
    aspectRatio: "画面比例",
    pages: "绘本页面"
  };

  return labels[field] ?? field;
}
