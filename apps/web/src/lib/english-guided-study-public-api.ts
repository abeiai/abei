import {
  isEnglishGuidedStudyMaterial,
  parseEnglishGuidedStudyNarrationVoice,
  parseEnglishGuidedStudyOperationProgress,
  parseEnglishNarrationTimelineV2,
  parseEnglishReadAlongTrack,
  type EnglishGuidedStudyMaterial
} from "@/lib/english-guided-study-data";

interface ApiResponse<TData> {
  code: number;
  message: string;
  data: TData | null;
}

interface ApiEnglishGuidedStudyMaterial {
  id: string;
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
  audioDurationSeconds: number;
  content: unknown;
  createdAt: string;
}

function getApiBaseUrl() {
  return process.env.API_BASE_URL ?? "http://localhost:3322/api";
}

async function publicApiFetch<TData>(path: string) {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    headers: {
      "Content-Type": "application/json"
    },
    cache: "no-store"
  });
  const payload = (await response.json()) as ApiResponse<TData>;

  if (!response.ok || payload.code !== 0 || payload.data === null) {
    throw new Error(payload.message || "请求失败");
  }

  return payload.data;
}

export async function getPublicEnglishGuidedStudyMaterial(id: string) {
  const record = await publicApiFetch<ApiEnglishGuidedStudyMaterial>(
    `/public/english-guided-study/materials/${encodeURIComponent(id)}`
  );

  return toEnglishGuidedStudyMaterial(record);
}

function toEnglishGuidedStudyMaterial(record: ApiEnglishGuidedStudyMaterial) {
  const content = normalizePublicContent(record.content);

  if (!isEnglishGuidedStudyMaterial(content)) {
    return null;
  }

  return {
    ...content,
    id: record.id,
    title: record.title,
    contentTitle: Object.prototype.hasOwnProperty.call(content, "contentTitle")
      ? typeof content.contentTitle === "string" ? content.contentTitle : null
      : record.title,
    author: typeof content.author === "string" ? content.author : null,
    authorIntroductionMode:
      content.authorIntroductionMode === "DETAILED" || content.authorIntroductionMode === "NONE"
        ? content.authorIntroductionMode
        : "BRIEF",
    scene: content.scene === "GUSHIWEN" ? "GUSHIWEN" : "ENGLISH",
    sourceType: record.sourceType,
    sourceName: record.sourceName,
    sourceText: record.sourceText,
    level: {
      standardName: record.levelStandardName,
      optionLabel: record.levelOptionLabel,
      aiLevel: record.aiLevel
    },
    summary: record.summary,
    narration: record.narration,
    audioUrl: record.audioUrl,
    audioTaskId: null,
    audioDurationSeconds: record.audioDurationSeconds,
    audioTimeline: content.audioTimeline,
    narrationTimelineV2: parseEnglishNarrationTimelineV2(content.narrationTimelineV2),
    narrationVoice: parseEnglishGuidedStudyNarrationVoice(content.narrationVoice),
    readAlong: parseEnglishReadAlongTrack(content.readAlong),
    contentGenerationProgress: parseEnglishGuidedStudyOperationProgress(
      content.contentGenerationProgress,
      "CONTENT"
    ),
    practiceGenerationProgress: parseEnglishGuidedStudyOperationProgress(
      content.practiceGenerationProgress,
      "PRACTICE"
    ),
    audioGenerationProgress: parseEnglishGuidedStudyOperationProgress(
      content.audioGenerationProgress,
      "AUDIO"
    ),
    readAlongGenerationProgress: parseEnglishGuidedStudyOperationProgress(
      content.readAlongGenerationProgress,
      "READ_ALOUD"
    ),
    pinnedAt: null,
    createdAt: record.createdAt
  } satisfies EnglishGuidedStudyMaterial;
}

function normalizePublicContent(value: unknown) {
  if (!isRecord(value)) {
    return value;
  }

  const sentences = Array.isArray(value.sentences)
    ? value.sentences.map((entry, index) => {
        const sentence = isRecord(entry) ? entry : {};
        const startSeconds = finiteNumber(sentence.startSeconds, 0);
        const endSeconds = finiteNumber(sentence.endSeconds, startSeconds);

        return {
          ...sentence,
          id: stringValue(sentence.id, `sentence-${index + 1}`),
          text: stringValue(sentence.text),
          explanation: stringValue(sentence.explanation),
          grammarFocus: stringValue(sentence.grammarFocus),
          startSeconds,
          endSeconds,
          points: Array.isArray(sentence.points)
            ? sentence.points.map((pointEntry, pointIndex) => {
                const point = isRecord(pointEntry) ? pointEntry : {};

                return {
                  ...point,
                  id: stringValue(point.id, `sentence-${index + 1}-point-${pointIndex + 1}`),
                  term: stringValue(point.term),
                  meaning: stringValue(point.meaning),
                  note: stringValue(point.note),
                  startSeconds: finiteNumber(point.startSeconds, startSeconds),
                  endSeconds: finiteNumber(point.endSeconds, endSeconds)
                };
              })
            : []
        };
      })
    : [];
  const questions = Array.isArray(value.questions)
    ? value.questions.map((entry, index) => {
        const question = isRecord(entry) ? entry : {};

        return {
          ...question,
          id: stringValue(question.id, `question-${index + 1}`),
          question: stringValue(question.question),
          options: Array.isArray(question.options)
            ? question.options.filter((option): option is string => typeof option === "string")
            : [],
          answer: finiteNumber(question.answer, 0),
          explanation: stringValue(question.explanation)
        };
      })
    : [];
  const audioTimeline = Array.isArray(value.audioTimeline)
    ? value.audioTimeline.map((entry, index) => {
        const segment = isRecord(entry) ? entry : {};

        return {
          ...segment,
          sentenceId: stringValue(segment.sentenceId, sentences[index]?.id ?? `sentence-${index + 1}`),
          startSeconds: finiteNumber(segment.startSeconds, 0),
          endSeconds: finiteNumber(segment.endSeconds, 0),
          terms: Array.isArray(segment.terms) ? segment.terms : []
        };
      })
    : [];

  return {
    ...value,
    explanationMode: ["SENTENCE", "PARAGRAPH", "FREEFORM"].includes(String(value.explanationMode))
      ? value.explanationMode
      : "SENTENCE",
    sentences,
    questions,
    audioTimeline
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function finiteNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
