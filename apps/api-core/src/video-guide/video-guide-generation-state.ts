export interface VideoGuideNarrationDraftChunk {
  id: string;
  type: string;
  text: string;
  overlay?: {
    text: string;
    subText?: string;
  } | null;
}

export interface VideoGuideNarrationDraftNode {
  id: string;
  type: "INTRO" | "SENTENCE" | "SUMMARY";
  title: string;
  script: string;
  chunks: VideoGuideNarrationDraftChunk[];
  sentenceId?: string;
  timeRange?: string;
  startSeconds?: number;
  endSeconds?: number;
  subtitle?: string;
}

export interface VideoGuideNarrationScriptUpdate {
  id: string;
  originalScript: string;
  script: string;
}

const staleNarrationContentKeys = new Set([
  "narrationGenerationCheckpoint",
  "narrationAudioProgress",
  "narrationAudioTaskId",
  "narrationAudioTruncated",
  "narrationAudioUrl",
  "narrationTimeline",
  "narrationTtsGenerationJob",
  "narrationTtsGenerationProgress",
  "narrationVoice",
  "practiceGenerationJob",
  "practiceGenerationProgress",
  "practiceQuestionsAiTaskId",
  "practiceQuestionsModel"
]);

export function mergeVideoGuideScriptDraftContent(
  contentValue: unknown,
  input: {
    aiModelName: string | null;
    aiProviderName: string | null;
    aiTaskId: string;
    narrationDraftTimeline: VideoGuideNarrationDraftNode[];
    narrationScript: string;
    words: unknown[];
  }
) {
  const content = isRecord(contentValue) ? contentValue : {};
  const retainedContent = Object.fromEntries(
    Object.entries(content).filter(([key]) => !staleNarrationContentKeys.has(key))
  );

  return {
    ...retainedContent,
    questions: [],
    narrationScript: input.narrationScript,
    narrationDraftTimeline: input.narrationDraftTimeline,
    narrationAiTaskId: input.aiTaskId,
    narrationModel: {
      modelName: input.aiModelName,
      providerName: input.aiProviderName
    },
    words: input.words
  };
}

export function videoGuideScriptIsReady(contentValue: unknown) {
  return narrationDraftFromContent(contentValue).length > 0;
}

export function narrationDraftFromContent(contentValue: unknown): VideoGuideNarrationDraftNode[] {
  if (!isRecord(contentValue)) {
    return [];
  }

  const draftTimeline = readCompleteNarrationTimeline(contentValue.narrationDraftTimeline);

  if (draftTimeline.length > 0) {
    return draftTimeline;
  }

  return readCompleteNarrationTimeline(contentValue.narrationTimeline);
}

export function narrationScriptCharacterCount(contentValue: unknown) {
  return narrationDraftFromContent(contentValue).reduce(
    (total, node) => total + node.script.length,
    0
  );
}

export function normalizeNarrationScript(value: string) {
  return value
    .replace(/\r/g, "")
    .replace(/^\s*#{1,6}\s+/gm, "")
    .replace(/^\s*[-*•]\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function narrationTextForTts(value: string) {
  const normalized = normalizeNarrationScript(value);

  if (normalized.length <= 8000) {
    return normalized;
  }

  return normalized.slice(0, 7900).replace(/\s+\S*$/u, "").trim() || normalized.slice(0, 8000);
}

export function narrationTtsDraftFromContent(contentValue: unknown) {
  return narrationDraftFromContent(contentValue)
    .map((node) => ({
      ...node,
      script: narrationTextForTts(node.script)
    }))
    .filter((node) => Boolean(node.script));
}

export function narrationTtsScriptCharacterCount(contentValue: unknown) {
  return narrationTtsDraftFromContent(contentValue).reduce(
    (total, node) => total + node.script.length,
    0
  );
}

export function narrationTimelineForDerivedContent(contentValue: unknown): unknown[] {
  if (!isRecord(contentValue)) {
    return [];
  }

  const draftTimeline = narrationDraftFromContent(contentValue);

  if (draftTimeline.length > 0) {
    return draftTimeline;
  }

  return Array.isArray(contentValue.narrationTimeline) ? contentValue.narrationTimeline : [];
}

export function mergeEditedNarrationDraftContent(
  contentValue: unknown,
  updates: VideoGuideNarrationScriptUpdate[],
  now: string,
  replacement?: {
    nodeId: string;
    audio: {
      audioTaskId: string;
      audioAssetId: string;
      audioUrl: string;
      audioObjectKey: string;
      audioSizeBytes: number;
      audioSha256: string;
      durationMs?: number;
    };
  }
) {
  const content = isRecord(contentValue) ? contentValue : {};
  const draft = narrationDraftFromContent(content);
  const updatesById = new Map<string, { originalScript: string; script: string }>();

  for (const update of updates) {
    const id = update.id.trim();
    const originalScript = update.originalScript.trim();
    const script = update.script.trim();

    if (!id || !originalScript || !script) {
      throw new Error("讲解文案不能为空");
    }

    if (updatesById.has(id)) {
      throw new Error("文案节点不能重复");
    }

    updatesById.set(id, { originalScript, script });
  }

  if (
    draft.length === 0 ||
    updatesById.size !== draft.length ||
    draft.some((node) => !updatesById.has(node.id))
  ) {
    throw new Error("文案已发生变化，请刷新后重试");
  }

  if (
    draft.some(
      (node) => updatesById.get(node.id)!.originalScript !== node.script.trim()
    )
  ) {
    throw new Error("文案已发生变化，请刷新后重试");
  }

  if (draft.every((node) => updatesById.get(node.id)!.script === node.script.trim())) {
    return content;
  }

  const narrationDraftTimeline = draft.map((node) => {
    const script = updatesById.get(node.id)!.script;

    if (script === node.script.trim()) {
      return node;
    }

    return {
      ...node,
      script,
      chunks: [
        {
          id: `${node.id}-manual`,
          type: "manual",
          text: script,
          overlay: null
        }
      ]
    };
  });
  const retainedContent = { ...content };
  delete retainedContent.narrationTtsGenerationJob;
  delete retainedContent.narrationTtsGenerationProgress;

  if (replacement) {
    const currentTimeline = Array.isArray(content.narrationTimeline)
      ? content.narrationTimeline
      : [];
    const draftById = new Map(narrationDraftTimeline.map((node) => [node.id, node]));
    let replaced = false;
    const narrationTimeline = currentTimeline.map((value) => {
      if (!isRecord(value) || value.id !== replacement.nodeId) {
        return value;
      }

      const node = draftById.get(replacement.nodeId);

      if (!node) {
        return value;
      }

      replaced = true;
      return {
        ...value,
        ...node,
        ...replacement.audio
      };
    });

    if (!replaced) {
      throw new Error("当前句讲解语音不存在，请重新生成完整讲解语音");
    }

    const firstAudioNode = narrationTimeline.find((value) => isRecord(value) && typeof value.audioUrl === "string");

    return {
      ...retainedContent,
      narrationDraftTimeline,
      narrationScript: narrationDraftTimeline.map((node) => node.script).join("\n\n"),
      narrationAudioUrl: isRecord(firstAudioNode) ? firstAudioNode.audioUrl : retainedContent.narrationAudioUrl,
      narrationAudioTaskId: isRecord(firstAudioNode) ? firstAudioNode.audioTaskId : retainedContent.narrationAudioTaskId,
      narrationAudioStale: false,
      narrationTimeline,
      narrationDraftUpdatedAt: now
    };
  }

  return {
    ...retainedContent,
    narrationDraftTimeline,
    narrationScript: narrationDraftTimeline.map((node) => node.script).join("\n\n"),
    narrationAudioStale: true,
    narrationDraftUpdatedAt: now
  };
}

function readCompleteNarrationTimeline(value: unknown): VideoGuideNarrationDraftNode[] {
  if (!Array.isArray(value) || value.length === 0 || !value.every(isNarrationDraftNode)) {
    return [];
  }

  const ids = new Set(value.map((node) => node.id));

  return ids.size === value.length ? value.map(toNarrationDraftNode) : [];
}

function isNarrationDraftNode(value: unknown): value is VideoGuideNarrationDraftNode {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    (value.type === "INTRO" || value.type === "SENTENCE" || value.type === "SUMMARY") &&
    typeof value.title === "string" &&
    typeof value.script === "string" &&
    value.script.trim().length > 0 &&
    Array.isArray(value.chunks)
  );
}

function toNarrationDraftNode(node: VideoGuideNarrationDraftNode): VideoGuideNarrationDraftNode {
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
