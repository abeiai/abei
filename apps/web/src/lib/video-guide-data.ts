import { publicAuthSessionOwner } from "@/lib/public-auth-session";

export const videoGuideStorageKey = "xueleai:video-guide:lessons";

export function videoGuideStorageKeyForUser(userId: string | null | undefined) {
  return `${videoGuideStorageKey}:${publicAuthSessionOwner(userId)}`;
}

export function videoGuideStorageMatchesAuthOwner(
  storageKey: string,
  authOwner: string | null
) {
  return authOwner === null || storageKey === `${videoGuideStorageKey}:${authOwner}`;
}

export function videoGuideLessonBelongsToUser(
  lessonUserId: string | null | undefined,
  expectedUserId: string | null | undefined
) {
  return Boolean(
    expectedUserId?.trim() &&
      lessonUserId?.trim() &&
      lessonUserId.trim() === expectedUserId.trim()
  );
}

export function videoGuideLessonForUser<
  TLesson extends { userId?: string | null }
>(
  lesson: TLesson,
  expectedUserId: string | null | undefined
) {
  return videoGuideLessonBelongsToUser(lesson.userId, expectedUserId)
    ? lesson
    : null;
}

export function videoGuideLessonsForUser<
  TLesson extends { userId?: string | null }
>(
  lessons: TLesson[],
  expectedUserId: string | null | undefined
) {
  return lessons.filter((lesson) =>
    videoGuideLessonBelongsToUser(lesson.userId, expectedUserId)
  );
}

export interface StoredVideoGuideLesson {
  id: string;
  shareToken?: string;
  title: string;
  mediaName: string;
  mediaType?: "VIDEO" | "AUDIO";
  mediaMimeType?: string | null;
  mediaSizeBytes?: number | null;
  mediaStorageKey?: string | null;
  mediaUrl?: string | null;
  subtitleName?: string | null;
  subtitleFormat?: "SRT" | "ASS" | null;
  subtitleSizeBytes?: number | null;
  subtitleStorageKey?: string | null;
  subtitleUrl?: string | null;
  status?: "DRAFT" | "QUEUED" | "GENERATING" | "SUCCEEDED" | "FAILED";
  statusName?: string;
  errorMessage?: string | null;
  pinnedAt?: string | null;
  createdAt: string;
  finishedAt?: string | null;
  content?: VideoGuideLessonContent;
}

export interface GuideWord {
  id: string;
  word: string;
  phonetic: string;
  meaning: string;
  note: string;
  subtitle?: string;
  timeRange?: string;
  appearsAt: string;
  appearsAtSeconds?: number;
  endSeconds?: number;
}

export interface TeacherSegment {
  id: string;
  timeRange: string;
  startSeconds?: number;
  endSeconds?: number;
  subtitle: string;
  explanation: string;
}

export type NarrationTimelineNodeType = "INTRO" | "SENTENCE" | "SUMMARY";

export interface NarrationOverlay {
  text: string;
  subText?: string;
}

export interface NarrationChunk {
  id: string;
  type: string;
  text: string;
  overlay?: NarrationOverlay | null;
}

export interface NarrationTimelineNode {
  id: string;
  type: NarrationTimelineNodeType;
  title: string;
  script: string;
  chunks: NarrationChunk[];
  audioTaskId?: string | null;
  audioUrl?: string | null;
  durationMs?: number;
  sentenceId?: string;
  timeRange?: string;
  startSeconds?: number;
  endSeconds?: number;
  subtitle?: string;
}

export interface GuideQuestion {
  id: string;
  question: string;
  options: string[];
  answer: number;
  explanation: string;
}

export interface RepeatLine {
  id: string;
  timeRange: string;
  startSeconds?: number;
  endSeconds?: number;
  text: string;
  hint: string;
}

export interface VideoGuideOperationProgress {
  version: 1;
  operation: "SUBTITLE" | "NARRATION" | "NARRATION_TTS" | "PRACTICE";
  status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED";
  phase: string;
  completed: number;
  total: number;
  percent: number;
  message: string;
  canLeave: true;
  errorMessage: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  updatedAt: string;
}

export interface VideoGuideLessonContent {
  subtitleGenerationProgress?: VideoGuideOperationProgress | null;
  narrationGenerationProgress?: VideoGuideOperationProgress | null;
  narrationTtsGenerationProgress?: VideoGuideOperationProgress | null;
  practiceGenerationProgress?: VideoGuideOperationProgress | null;
  narrationAiTaskId?: string | null;
  narrationAudioTaskId?: string | null;
  narrationAudioStale?: boolean;
  narrationAudioTruncated?: boolean;
  narrationAudioUrl?: string | null;
  narrationDraftUpdatedAt?: string | null;
  narrationModel?: {
    modelName?: string | null;
    providerName?: string | null;
  } | null;
  practiceQuestionsAiTaskId?: string | null;
  practiceQuestionsModel?: {
    modelName?: string | null;
    providerName?: string | null;
  } | null;
  narrationScript?: string;
  narrationDraftTimeline?: NarrationTimelineNode[];
  narrationTimeline?: NarrationTimelineNode[];
  narrationVoice?: {
    modelAlias?: string | null;
    modelName?: string | null;
    providerName?: string | null;
    providerVoiceId?: string | null;
    voiceAssetId?: string | null;
  } | null;
  summary: string;
  stageNames: string[];
  words: GuideWord[];
  teacherSegments: TeacherSegment[];
  questions: GuideQuestion[];
  repeatLines: RepeatLine[];
}

export const videoGuideWords: GuideWord[] = [
  {
    id: "context",
    word: "context",
    phonetic: "/ˈkɒntekst/",
    meaning: "语境；背景",
    note: "听到观点或例子时，先判断它所在的上下文。",
    appearsAt: "00:38",
    appearsAtSeconds: 38
  },
  {
    id: "evidence",
    word: "evidence",
    phonetic: "/ˈevɪdəns/",
    meaning: "证据；依据",
    note: "老师会用这个词提醒学习者关注论点背后的事实。",
    appearsAt: "01:16",
    appearsAtSeconds: 76
  },
  {
    id: "assume",
    word: "assume",
    phonetic: "/əˈsuːm/",
    meaning: "假设；以为",
    note: "常出现在转折前，表示说话人准备修正一个直觉判断。",
    appearsAt: "02:05",
    appearsAtSeconds: 125
  },
  {
    id: "pattern",
    word: "pattern",
    phonetic: "/ˈpætən/",
    meaning: "模式；规律",
    note: "串讲时会把零散信息整理成可以复述的规律。",
    appearsAt: "03:12",
    appearsAtSeconds: 192
  },
  {
    id: "conclusion",
    word: "conclusion",
    phonetic: "/kənˈkluːʒn/",
    meaning: "结论",
    note: "结尾处通常承接前面的例子和证据。",
    appearsAt: "04:24",
    appearsAtSeconds: 264
  }
];

export const teacherSegments: TeacherSegment[] = [
  {
    id: "opening",
    timeRange: "00:00 - 00:42",
    startSeconds: 0,
    endSeconds: 42,
    subtitle: "The speaker opens with a question about how people learn from repeated examples.",
    explanation: "开头不是在给定义，而是在抛问题。孩子可以先抓住 repeated examples 这个线索，它告诉我们后面会讲通过重复例子形成理解。"
  },
  {
    id: "evidence",
    timeRange: "00:42 - 02:10",
    startSeconds: 42,
    endSeconds: 130,
    subtitle: "Then she brings in evidence and compares two ways of making assumptions.",
    explanation: "这一段重点听 evidence 和 assume。老师串讲时会暂停在 assume 前后，因为这里的逻辑是：先有一个假设，再用证据检查它是否可靠。"
  },
  {
    id: "pattern",
    timeRange: "02:10 - 03:58",
    startSeconds: 130,
    endSeconds: 238,
    subtitle: "The examples slowly reveal a pattern instead of giving the conclusion first.",
    explanation: "这里不要逐句翻译。更好的听法是找 pattern：例子重复出现，孩子需要说出这些例子共同证明了什么。"
  },
  {
    id: "closing",
    timeRange: "03:58 - 05:00",
    startSeconds: 238,
    endSeconds: 300,
    subtitle: "The final part turns the pattern into a short conclusion.",
    explanation: "结尾的 conclusion 是对全文的收束。复述时可以用一句话说：作者认为理解不是一次完成的，而是在例子、证据和修正中形成。"
  }
];

export const guideQuestions: GuideQuestion[] = [
  {
    id: "q1",
    question: "context 在这段内容里更接近哪个意思？",
    options: ["视频画面", "语境和背景", "最终答案", "字幕格式"],
    answer: 1,
    explanation: "context 指帮助理解信息的背景，而不是画面本身。"
  },
  {
    id: "q2",
    question: "speaker 提到 evidence 时，主要想让学习者关注什么？",
    options: ["观点背后的依据", "单词的拼写", "视频的长度", "老师的声音"],
    answer: 0,
    explanation: "evidence 是支撑判断的证据，常用来检查一个假设是否可靠。"
  },
  {
    id: "q3",
    question: "assume 通常表示什么动作？",
    options: ["确认事实", "做出假设", "开始播放", "删除字幕"],
    answer: 1,
    explanation: "assume 是先做一个假设，后面可能会被证据修正。"
  },
  {
    id: "q4",
    question: "pattern 在串讲中为什么重要？",
    options: ["帮助找到规律", "只用于描述颜色", "表示音量大小", "表示文件格式"],
    answer: 0,
    explanation: "pattern 能把多个例子连接起来，形成可复述的规律。"
  },
  {
    id: "q5",
    question: "结尾的 conclusion 通常承担什么功能？",
    options: ["提出新词", "收束全文", "隐藏字幕", "切换账号"],
    answer: 1,
    explanation: "conclusion 是对前面观点、例子和证据的总结。"
  },
  {
    id: "q6",
    question: "自主视听后，让孩子选择 1 到 10 的比例，目的是？",
    options: ["记录理解自评", "选择视频清晰度", "设置文件大小", "跳过练习"],
    answer: 0,
    explanation: "自评能帮助系统判断后续讲解要偏基础还是偏深入。"
  },
  {
    id: "q7",
    question: "词语巩固阶段主要使用什么形式？",
    options: ["单词卡片逐一展示", "隐藏所有讲解", "修改视频文件", "跳过跟读"],
    answer: 0,
    explanation: "词语巩固会把互动讲解里讲过的单词或短语做成卡片，帮助孩子回顾。"
  },
  {
    id: "q8",
    question: "互动讲解不应该只是？",
    options: ["老师串讲", "同步字幕", "简单逐句翻译", "按节奏暂停"],
    answer: 2,
    explanation: "需求强调像老师串讲一样解释结构和逻辑，而不是简单翻译。"
  },
  {
    id: "q9",
    question: "跟读阶段用户可以选择什么？",
    options: ["是否打开字幕", "是否修改管理员", "是否切换支付方式", "是否删除专辑"],
    answer: 0,
    explanation: "跟读时可以根据孩子能力决定打开或关闭字幕。"
  },
  {
    id: "q10",
    question: "家长生成课件后，孩子通常通过什么进入学习？",
    options: ["后台管理菜单", "分享学习页面", "数据库控制台", "支付回调地址"],
    answer: 1,
    explanation: "这个场景的核心是家长生成课件，再分享给孩子学习。"
  }
];

export const repeatLines: RepeatLine[] = [
  {
    id: "r1",
    timeRange: "00:18 - 00:28",
    startSeconds: 18,
    endSeconds: 28,
    text: "We learn faster when examples repeat in a clear context.",
    hint: "注意 faster 和 clear context 的重音。"
  },
  {
    id: "r2",
    timeRange: "01:12 - 01:24",
    startSeconds: 72,
    endSeconds: 84,
    text: "Evidence helps us check what we assume at first.",
    hint: "helps us 可以连读，assume 前稍作停顿。"
  },
  {
    id: "r3",
    timeRange: "03:10 - 03:22",
    startSeconds: 190,
    endSeconds: 202,
    text: "A pattern becomes easier to see after the third example.",
    hint: "pattern 和 after the third example 是信息重点。"
  }
];

export const guideStageNames = [
  "自主视听",
  "互动讲解",
  "词语巩固",
  "随堂练习",
  "跟读训练"
];

export const defaultVideoGuideContent: VideoGuideLessonContent = {
  summary: "这段内容讲的是：学习者如何通过例子、证据和反复修正，逐步从零散信息中看出规律，并形成自己的结论。",
  stageNames: guideStageNames,
  words: videoGuideWords,
  teacherSegments,
  questions: guideQuestions,
  repeatLines
};

export function parseVideoGuideLessonContent(value: unknown): VideoGuideLessonContent | null {
  if (!isRecord(value)) {
    return null;
  }

  const narrationTimeline = readNarrationTimeline(value.narrationTimeline);
  const parsedDraftTimeline = readNarrationTimeline(value.narrationDraftTimeline);
  const narrationDraftTimeline =
    parsedDraftTimeline ?? narrationTimeline?.map(toNarrationDraftNode) ?? null;
  const storedWords = readGuideWords(value.words);
  const words = guideWordsFromNarrationTimeline(
    storedWords ?? [],
    narrationDraftTimeline ?? narrationTimeline ?? []
  );

  return {
    summary: readRequiredString(value.summary) ?? defaultVideoGuideContent.summary,
    stageNames: normalizeVideoGuideStageNames(readStringList(value.stageNames)),
    words: storedWords !== null || words.length > 0 ? words : defaultVideoGuideContent.words,
    teacherSegments: readTeacherSegments(value.teacherSegments) ?? defaultVideoGuideContent.teacherSegments,
    questions: readGuideQuestions(value.questions) ?? defaultVideoGuideContent.questions,
    repeatLines: readRepeatLines(value.repeatLines) ?? defaultVideoGuideContent.repeatLines,
    ...(readVideoGuideOperationProgress(value.subtitleGenerationProgress)
      ? { subtitleGenerationProgress: readVideoGuideOperationProgress(value.subtitleGenerationProgress) }
      : {}),
    ...(readVideoGuideOperationProgress(value.narrationGenerationProgress)
      ? { narrationGenerationProgress: readVideoGuideOperationProgress(value.narrationGenerationProgress) }
      : {}),
    ...(readVideoGuideOperationProgress(value.narrationTtsGenerationProgress)
      ? { narrationTtsGenerationProgress: readVideoGuideOperationProgress(value.narrationTtsGenerationProgress) }
      : {}),
    ...(readVideoGuideOperationProgress(value.practiceGenerationProgress)
      ? { practiceGenerationProgress: readVideoGuideOperationProgress(value.practiceGenerationProgress) }
      : {}),
    ...(narrationTimeline ? { narrationTimeline } : {}),
    ...(narrationDraftTimeline ? { narrationDraftTimeline } : {}),
    ...(readRequiredString(value.narrationScript) ? { narrationScript: readRequiredString(value.narrationScript) ?? undefined } : {}),
    ...(readRequiredString(value.narrationAudioUrl) ? { narrationAudioUrl: readRequiredString(value.narrationAudioUrl) } : {}),
    ...(readRequiredString(value.narrationAudioTaskId) ? { narrationAudioTaskId: readRequiredString(value.narrationAudioTaskId) } : {}),
    ...(readRequiredString(value.narrationAiTaskId) ? { narrationAiTaskId: readRequiredString(value.narrationAiTaskId) } : {}),
    ...(typeof value.narrationAudioTruncated === "boolean"
      ? { narrationAudioTruncated: value.narrationAudioTruncated }
      : {}),
    ...(typeof value.narrationAudioStale === "boolean"
      ? { narrationAudioStale: value.narrationAudioStale }
      : {}),
    ...(readRequiredString(value.narrationDraftUpdatedAt)
      ? { narrationDraftUpdatedAt: readRequiredString(value.narrationDraftUpdatedAt) }
      : {}),
    ...(readNarrationVoice(value.narrationVoice) ? { narrationVoice: readNarrationVoice(value.narrationVoice) } : {}),
    ...(readNarrationModel(value.narrationModel) ? { narrationModel: readNarrationModel(value.narrationModel) } : {}),
    ...(readRequiredString(value.practiceQuestionsAiTaskId)
      ? { practiceQuestionsAiTaskId: readRequiredString(value.practiceQuestionsAiTaskId) }
      : {}),
    ...(readNarrationModel(value.practiceQuestionsModel)
      ? { practiceQuestionsModel: readNarrationModel(value.practiceQuestionsModel) }
      : {})
  };
}

function readVideoGuideOperationProgress(value: unknown): VideoGuideOperationProgress | null {
  if (!isRecord(value)) {
    return null;
  }

  const operations = new Set(["SUBTITLE", "NARRATION", "NARRATION_TTS", "PRACTICE"]);
  const statuses = new Set(["QUEUED", "RUNNING", "SUCCEEDED", "FAILED"]);

  if (
    value.version !== 1 ||
    typeof value.operation !== "string" ||
    !operations.has(value.operation) ||
    typeof value.status !== "string" ||
    !statuses.has(value.status) ||
    typeof value.phase !== "string" ||
    typeof value.completed !== "number" ||
    typeof value.total !== "number" ||
    typeof value.percent !== "number" ||
    typeof value.message !== "string" ||
    value.canLeave !== true ||
    typeof value.updatedAt !== "string"
  ) {
    return null;
  }

  return value as unknown as VideoGuideOperationProgress;
}

export function defaultVideoGuideLesson(id: string): StoredVideoGuideLesson {
  return {
    id,
    title: "示例视频导学课件",
    mediaName: "家长分享的学习视频",
    subtitleName: "同步字幕文件.srt",
    createdAt: "2026-06-24T00:00:00.000Z"
  };
}

export function reusableVideoGuideLessonId(lesson: StoredVideoGuideLesson | null | undefined) {
  if (!lesson || (lesson.status && !["DRAFT", "SUCCEEDED", "FAILED"].includes(lesson.status))) {
    return null;
  }

  return lesson.id;
}

export function isCompletedVideoGuideLesson(
  lesson: StoredVideoGuideLesson | null | undefined
) {
  return Boolean(lesson && (!lesson.status || lesson.status === "SUCCEEDED"));
}

export function preferredActiveVideoGuideLesson(lessons: StoredVideoGuideLesson[]) {
  return lessons.find(hasActiveVideoGuideGeneration) ?? null;
}

export function mergeStoredVideoGuideLessons(
  primary: StoredVideoGuideLesson[],
  secondary: StoredVideoGuideLesson[]
) {
  const resultIndexById = new Map<string, number>();
  const resultIndexByShareToken = new Map<string, number>();
  const result: StoredVideoGuideLesson[] = [];

  for (const lesson of [...primary, ...secondary]) {
    const matchIndex =
      resultIndexById.get(lesson.id) ??
      (lesson.shareToken ? resultIndexByShareToken.get(lesson.shareToken) : undefined);

    if (matchIndex !== undefined) {
      if (lesson.pinnedAt && !result[matchIndex]?.pinnedAt) {
        result[matchIndex] = {
          ...result[matchIndex]!,
          pinnedAt: lesson.pinnedAt
        };
      }
      continue;
    }

    const resultIndex = result.length;
    resultIndexById.set(lesson.id, resultIndex);

    if (lesson.shareToken) {
      resultIndexByShareToken.set(lesson.shareToken, resultIndex);
    }

    result.push(lesson);
  }

  return result.slice(0, 20);
}

export function sortStoredVideoGuideLessonsForEntry(
  lessons: StoredVideoGuideLesson[]
) {
  return lessons
    .map((lesson, index) => ({
      index,
      lesson,
      pinnedTimestamp: Date.parse(lesson.pinnedAt ?? ""),
      timestamp: videoGuideLessonSortTimestamp(lesson)
    }))
    .sort(
      (left, right) =>
        (Number.isFinite(right.pinnedTimestamp) ? right.pinnedTimestamp : 0) -
          (Number.isFinite(left.pinnedTimestamp) ? left.pinnedTimestamp : 0) ||
        right.timestamp - left.timestamp ||
        left.index - right.index
    )
    .map(({ lesson }) => lesson);
}

export function reconcileStoredVideoGuideLessons(
  current: StoredVideoGuideLesson[],
  incoming: StoredVideoGuideLesson[]
) {
  const remaining = [...incoming];
  const updated = current.map((lesson) => {
    const matchIndex = remaining.findIndex((candidate) =>
      storedVideoGuideLessonsMatch(lesson, candidate)
    );

    if (matchIndex < 0) {
      return lesson;
    }

    const incomingLesson = remaining.splice(matchIndex, 1)[0]!;

    return lesson.pinnedAt && !incomingLesson.pinnedAt
      ? { ...incomingLesson, pinnedAt: lesson.pinnedAt }
      : incomingLesson;
  });

  return mergeStoredVideoGuideLessons(remaining, updated);
}

export function upsertStoredVideoGuideLesson(
  lessons: StoredVideoGuideLesson[],
  lesson: StoredVideoGuideLesson
) {
  const matchIndex = lessons.findIndex((candidate) =>
    storedVideoGuideLessonsMatch(candidate, lesson)
  );

  if (matchIndex < 0) {
    return mergeStoredVideoGuideLessons([lesson], lessons);
  }

  return lessons.map((candidate, index) =>
    index === matchIndex && candidate.pinnedAt && !lesson.pinnedAt
      ? { ...lesson, pinnedAt: candidate.pinnedAt }
      : index === matchIndex
        ? lesson
        : candidate
  );
}

export function videoGuideLessonIdsToRefresh(
  lessons: StoredVideoGuideLesson[],
  activeLessonId?: string | null,
  workingLesson?: StoredVideoGuideLesson | null
) {
  const ids = new Set<string>();

  if (activeLessonId) {
    ids.add(activeLessonId);
  }

  lessons.filter(hasActiveVideoGuideGeneration).forEach((lesson) => ids.add(lesson.id));

  if (workingLesson && hasActiveVideoGuideGeneration(workingLesson)) {
    ids.add(workingLesson.id);
  }

  return [...ids];
}

export function hasActiveVideoGuideGeneration(lesson: StoredVideoGuideLesson) {
  if (lesson.status === "QUEUED" || lesson.status === "GENERATING") {
    return true;
  }

  return [
    lesson.content?.subtitleGenerationProgress,
    lesson.content?.narrationGenerationProgress,
    lesson.content?.narrationTtsGenerationProgress,
    lesson.content?.practiceGenerationProgress
  ].some((progress) => progress?.status === "QUEUED" || progress?.status === "RUNNING");
}

export function videoGuideScriptReady(lesson: StoredVideoGuideLesson | null | undefined) {
  return (lesson?.content?.narrationDraftTimeline?.length ?? 0) > 0;
}

function videoGuideLessonSortTimestamp(lesson: StoredVideoGuideLesson) {
  const progressItems = [
    lesson.content?.subtitleGenerationProgress,
    lesson.content?.narrationGenerationProgress,
    lesson.content?.narrationTtsGenerationProgress,
    lesson.content?.practiceGenerationProgress
  ];
  const timestamps = [
    Date.parse(lesson.createdAt),
    ...(lesson.status === "SUCCEEDED" && lesson.finishedAt
      ? [Date.parse(lesson.finishedAt)]
      : []),
    ...progressItems
      .filter((progress) => progress?.status === "SUCCEEDED")
      .map((progress) => Date.parse(progress?.finishedAt ?? progress?.updatedAt ?? ""))
  ].filter(Number.isFinite);

  return Math.max(0, ...timestamps);
}

function storedVideoGuideLessonsMatch(
  left: StoredVideoGuideLesson,
  right: StoredVideoGuideLesson
) {
  return (
    left.id === right.id ||
    Boolean(left.shareToken && right.shareToken && left.shareToken === right.shareToken)
  );
}

function toNarrationDraftNode(node: NarrationTimelineNode): NarrationTimelineNode {
  return {
    id: node.id,
    type: node.type,
    title: node.title,
    script: node.script,
    chunks: node.chunks,
    ...(node.sentenceId === undefined ? {} : { sentenceId: node.sentenceId }),
    ...(node.timeRange === undefined ? {} : { timeRange: node.timeRange }),
    ...(node.startSeconds === undefined ? {} : { startSeconds: node.startSeconds }),
    ...(node.endSeconds === undefined ? {} : { endSeconds: node.endSeconds }),
    ...(node.subtitle === undefined ? {} : { subtitle: node.subtitle })
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRequiredString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : null;
}

function readStringList(value: unknown, expectedLength?: number) {
  if (!Array.isArray(value)) {
    return null;
  }

  const items = value.map(readRequiredString).filter((item): item is string => Boolean(item));

  if (expectedLength && items.length < expectedLength) {
    return null;
  }

  return expectedLength ? items.slice(0, expectedLength) : items;
}

function normalizeVideoGuideStageNames(value: string[] | null) {
  if (!value) {
    return defaultVideoGuideContent.stageNames;
  }

  if (value.length === 5) {
    return value;
  }

  if (value.length >= 6) {
    return guideStageNames;
  }

  return defaultVideoGuideContent.stageNames;
}

function readGuideWords(value: unknown) {
  if (!Array.isArray(value)) {
    return null;
  }

  const items = value
    .map((item): GuideWord | null => {
      if (!isRecord(item)) {
        return null;
      }

      const id = readRequiredString(item.id);
      const word = readRequiredString(item.word);
      const phonetic = readRequiredString(item.phonetic);
      const meaning = readRequiredString(item.meaning);
      const note = readRequiredString(item.note);
      const subtitle = readRequiredString(item.subtitle);
      const timeRange = readRequiredString(item.timeRange);
      const appearsAt = readRequiredString(item.appearsAt);
      const appearsAtSeconds = readOptionalNumber(item.appearsAtSeconds);
      const endSeconds = readOptionalNumber(item.endSeconds);

      if (!id || !word || !phonetic || !meaning || !note || !appearsAt) {
        return null;
      }

      return {
        id,
        word,
        phonetic,
        meaning,
        note,
        ...(subtitle ? { subtitle } : {}),
        ...(timeRange ? { timeRange } : {}),
        appearsAt,
        ...(appearsAtSeconds === null ? {} : { appearsAtSeconds }),
        ...(endSeconds === null ? {} : { endSeconds })
      };
    })
    .filter((item): item is GuideWord => Boolean(item));

  return items;
}

function guideWordsFromNarrationTimeline(
  storedWords: GuideWord[],
  timeline: NarrationTimelineNode[]
) {
  const storedByWord = new Map(
    storedWords.map((word) => [normalizeGuideWordKey(word.word), word])
  );
  const words = new Map<string, GuideWord>();

  timeline.forEach((node) => {
    if (node.type !== "SENTENCE") {
      return;
    }

    node.chunks.forEach((chunk) => {
      const word = chunk.overlay?.text.replace(/\s+/g, " ").trim() ?? "";
      const key = normalizeGuideWordKey(word);

      if (!word || !/[A-Za-z]/.test(word) || !key || words.has(key)) {
        return;
      }

      const stored = storedByWord.get(key);

      if (stored) {
        words.set(key, stored);
        return;
      }

      const idPart = word.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

      words.set(key, {
        id: `word-${idPart}`,
        word,
        phonetic: "",
        meaning: chunk.overlay?.subText?.trim() || "互动讲解中的重点表达",
        note: chunk.text.trim(),
        ...(node.subtitle ? { subtitle: node.subtitle } : {}),
        ...(node.timeRange ? { timeRange: node.timeRange } : {}),
        appearsAt: node.timeRange?.split(" - ")[0] ?? "00:00",
        ...(node.startSeconds === undefined ? {} : { appearsAtSeconds: node.startSeconds }),
        ...(node.endSeconds === undefined ? {} : { endSeconds: node.endSeconds })
      });
    });
  });

  return words.size > 0 ? Array.from(words.values()) : storedWords;
}

function normalizeGuideWordKey(value: string) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function readTeacherSegments(value: unknown) {
  if (!Array.isArray(value)) {
    return null;
  }

  const items = value
    .map((item): TeacherSegment | null => {
      if (!isRecord(item)) {
        return null;
      }

      const id = readRequiredString(item.id);
      const timeRange = readRequiredString(item.timeRange);
      const startSeconds = readOptionalNumber(item.startSeconds);
      const endSeconds = readOptionalNumber(item.endSeconds);
      const subtitle = readRequiredString(item.subtitle);
      const explanation = readRequiredString(item.explanation);

      if (!id || !timeRange || !subtitle || !explanation) {
        return null;
      }

      return {
        id,
        timeRange,
        ...(startSeconds === null ? {} : { startSeconds }),
        ...(endSeconds === null ? {} : { endSeconds }),
        subtitle,
        explanation
      };
    })
    .filter((item): item is TeacherSegment => Boolean(item));

  return items.length > 0 ? items : null;
}

function readNarrationTimeline(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }

  const items = value.map((item): NarrationTimelineNode | null => {
      if (!isRecord(item)) {
        return null;
      }

      const id = readRequiredString(item.id);
      const type = readNarrationTimelineNodeType(item.type);
      const title = readRequiredString(item.title);
      const script = readRequiredString(item.script);
      const chunks = readNarrationChunks(item.chunks);
      const audioTaskId = readRequiredString(item.audioTaskId);
      const audioUrl = readRequiredString(item.audioUrl);
      const durationMs = readOptionalNumber(item.durationMs);
      const sentenceId = readRequiredString(item.sentenceId);
      const timeRange = readRequiredString(item.timeRange);
      const startSeconds = readOptionalNumber(item.startSeconds);
      const endSeconds = readOptionalNumber(item.endSeconds);
      const subtitle = readRequiredString(item.subtitle);

      if (!id || !type || !title || !script || !chunks) {
        return null;
      }

      return {
        id,
        type,
        title,
        script,
        chunks,
        ...(audioTaskId ? { audioTaskId } : {}),
        ...(audioUrl ? { audioUrl } : {}),
        ...(durationMs === null ? {} : { durationMs }),
        ...(sentenceId ? { sentenceId } : {}),
        ...(timeRange ? { timeRange } : {}),
        ...(startSeconds === null ? {} : { startSeconds }),
        ...(endSeconds === null ? {} : { endSeconds }),
        ...(subtitle ? { subtitle } : {})
      };
    });

  if (items.some((item) => item === null)) {
    return null;
  }

  const nodes = items as NarrationTimelineNode[];
  const ids = new Set(nodes.map((item) => item.id));

  return ids.size === nodes.length ? nodes : null;
}

function readNarrationChunks(value: unknown) {
  if (!Array.isArray(value)) {
    return null;
  }

  const items = value.map((item): NarrationChunk | null => {
    if (!isRecord(item)) {
      return null;
    }

    const id = readRequiredString(item.id);
    const type = readRequiredString(item.type);
    const text = readRequiredString(item.text);

    if (!id || !type || !text) {
      return null;
    }

    return {
      id,
      type,
      text,
      overlay: readNarrationOverlay(item.overlay)
    };
  });

  if (items.some((item) => item === null)) {
    return null;
  }

  return items as NarrationChunk[];
}

function readNarrationOverlay(value: unknown): NarrationOverlay | null {
  if (!isRecord(value)) {
    return null;
  }

  const text = readRequiredString(value.text);

  if (!text) {
    return null;
  }

  const subText = readRequiredString(value.subText);

  return {
    text,
    ...(subText ? { subText } : {})
  };
}

function readNarrationTimelineNodeType(value: unknown): NarrationTimelineNodeType | null {
  return value === "INTRO" || value === "SENTENCE" || value === "SUMMARY" ? value : null;
}

function readGuideQuestions(value: unknown) {
  if (!Array.isArray(value)) {
    return null;
  }

  const items = value
    .map((item): GuideQuestion | null => {
      if (!isRecord(item)) {
        return null;
      }

      const id = readRequiredString(item.id);
      const question = readRequiredString(item.question);
      const options = readStringList(item.options);
      const explanation = readRequiredString(item.explanation);
      const answer = typeof item.answer === "number" ? item.answer : null;

      if (!id || !question || !options || options.length < 2 || !explanation || answer === null) {
        return null;
      }

      const normalizedAnswer = Math.trunc(answer);

      if (normalizedAnswer < 0 || normalizedAnswer >= options.length) {
        return null;
      }

      return {
        id,
        question,
        options,
        answer: normalizedAnswer,
        explanation
      };
    })
    .filter((item): item is GuideQuestion => Boolean(item));

  return items;
}

function readRepeatLines(value: unknown) {
  if (!Array.isArray(value)) {
    return null;
  }

  const items = value
    .map((item): RepeatLine | null => {
      if (!isRecord(item)) {
        return null;
      }

      const id = readRequiredString(item.id);
      const timeRange = readRequiredString(item.timeRange);
      const startSeconds = readOptionalNumber(item.startSeconds);
      const endSeconds = readOptionalNumber(item.endSeconds);
      const text = readRequiredString(item.text);
      const hint = readRequiredString(item.hint);

      if (!id || !timeRange || !text || !hint) {
        return null;
      }

      return {
        id,
        timeRange,
        ...(startSeconds === null ? {} : { startSeconds }),
        ...(endSeconds === null ? {} : { endSeconds }),
        text,
        hint
      };
    })
    .filter((item): item is RepeatLine => Boolean(item));

  return items.length > 0 ? items : null;
}

function readNarrationVoice(value: unknown): VideoGuideLessonContent["narrationVoice"] {
  if (!isRecord(value)) {
    return null;
  }

  return {
    providerVoiceId: readRequiredString(value.providerVoiceId),
    voiceAssetId: readRequiredString(value.voiceAssetId),
    modelAlias: readRequiredString(value.modelAlias),
    modelName: readRequiredString(value.modelName),
    providerName: readRequiredString(value.providerName)
  };
}

function readNarrationModel(value: unknown): VideoGuideLessonContent["narrationModel"] {
  if (!isRecord(value)) {
    return null;
  }

  return {
    modelName: readRequiredString(value.modelName),
    providerName: readRequiredString(value.providerName)
  };
}

function readOptionalNumber(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return value >= 0 ? value : null;
}
