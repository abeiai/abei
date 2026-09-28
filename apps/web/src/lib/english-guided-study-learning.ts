import {
  type EnglishAudioTimelineSegment,
  type EnglishStudyQuestion,
  type EnglishStudySentence
} from "@/lib/english-guided-study-data";

export interface PracticeResult {
  correctCount: number;
  wrongQuestionIds: string[];
  unansweredQuestionIds: string[];
}

export interface OriginalDocumentLayoutSegment {
  sentenceId: string;
  text: string;
  separatorAfter: "" | " " | "\n";
}

export function readAlongCueIndexAtTime(
  cues: Array<{ startSeconds: number; endSeconds: number }>,
  timeSeconds: number
) {
  const direct = cues.findIndex(
    (cue) => timeSeconds >= cue.startSeconds && timeSeconds < cue.endSeconds
  );

  if (direct >= 0) {
    return direct;
  }

  for (let index = cues.length - 1; index >= 0; index -= 1) {
    if (timeSeconds >= cues[index]!.startSeconds) {
      return index;
    }
  }

  return cues.length > 0 ? 0 : -1;
}

export function readAlongWordIndexAtTime(
  words: Array<{ startSeconds: number; endSeconds: number }>,
  timeSeconds: number
) {
  if (words.length === 0) return -1;
  if (timeSeconds < words[0]!.startSeconds) return -1;

  let low = 0;
  let high = words.length - 1;
  let result = 0;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (timeSeconds >= words[middle]!.startSeconds) {
      result = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  return result;
}

export function readAlongPlaybackPositionAtTime(
  cues: Array<{
    unitType: "TITLE" | "AUTHOR" | "BODY";
    startSeconds: number;
    endSeconds: number;
    words: Array<{ startSeconds: number; endSeconds: number }>;
  }>,
  timeSeconds: number
) {
  const cueIndex = readAlongCueIndexAtTime(cues, timeSeconds);
  const cue = cues[cueIndex];

  if (!cue) {
    return { cueIndex: -1, wordIndex: -1 };
  }

  return {
    cueIndex,
    wordIndex: cue.unitType === "BODY"
      ? readAlongWordIndexAtTime(cue.words, timeSeconds)
      : -1
  };
}

export function sequentialPlaybackFinished(
  currentIndex: number,
  itemCount: number,
  currentTime: number,
  duration: number
) {
  return (
    itemCount > 1 &&
    currentIndex === itemCount - 1 &&
    Number.isFinite(currentTime) &&
    Number.isFinite(duration) &&
    duration > 0 &&
    currentTime >= duration - 0.05
  );
}

export interface NarrationPreviewContinuationState {
  attemptPending: boolean;
  requested: boolean;
}

export async function resumeNarrationPreviewAfterLoad(
  state: NarrationPreviewContinuationState,
  play: () => Promise<void>
) {
  if (!state.requested || state.attemptPending) {
    return false;
  }

  state.attemptPending = true;

  try {
    await play();
    state.requested = false;
    return true;
  } catch {
    return false;
  } finally {
    state.attemptPending = false;
  }
}

export function narrationPreviewSourceSignature(
  fallbackUrl: string,
  nodes: Array<{ audioUrl: string }>
) {
  return JSON.stringify([fallbackUrl, ...nodes.map((node) => node.audioUrl)]);
}

export function readAlongWaitSeconds(
  mode: "pause" | "delay" | "shadow",
  cueDurationSeconds: number,
  pauseExtraSeconds: number,
  delaySeconds: number
) {
  if (mode === "shadow") return 0;
  if (mode === "delay") return Math.max(1, Math.min(5, delaySeconds));

  return Math.max(0, cueDurationSeconds) + Math.max(0, Math.min(10, pauseExtraSeconds));
}

export function shouldWaitAtReadAlongBoundary(
  mode: "pause" | "delay" | "shadow",
  usesNodeAudio: boolean,
  currentTime: number,
  cueEndSeconds: number,
  cueIsCurrent = true,
  loopsCurrentCue = false
) {
  return (
    mode !== "shadow" &&
    !usesNodeAudio &&
    (cueIsCurrent || loopsCurrentCue) &&
    Number.isFinite(currentTime) &&
    Number.isFinite(cueEndSeconds) &&
    currentTime >= cueEndSeconds - 0.06
  );
}

export function nextReadAlongCueIndex(
  currentIndex: number,
  itemCount: number,
  playbackMode: "sentence-repeat" | "all-repeat" | "all-once"
) {
  if (itemCount <= 0) return null;
  if (playbackMode === "sentence-repeat") {
    return Math.max(0, Math.min(currentIndex, itemCount - 1));
  }
  if (currentIndex < itemCount - 1) return currentIndex + 1;
  return playbackMode === "all-repeat" ? 0 : null;
}

export function buildOriginalDocumentLayout(
  sourceText: string,
  sentences: Array<Pick<EnglishStudySentence, "id" | "text">>
): OriginalDocumentLayoutSegment[] {
  const source = sourceText.replace(/\r\n?/g, "\n");
  const searchableSource = buildSearchableText(source);
  let searchCursor = 0;

  const locatedSentences = sentences.map((sentence) => {
    const searchableSentence = collapseWhitespace(sentence.text);
    const matchIndex = searchableSentence
      ? searchableSource.text.toLocaleLowerCase().indexOf(searchableSentence.toLocaleLowerCase(), searchCursor)
      : -1;

    if (matchIndex < 0) {
      return {
        sentenceId: sentence.id,
        sourceEnd: null,
        sourceStart: null,
        text: compactDocumentLines(sentence.text)
      };
    }

    const sourceStart = searchableSource.sourceIndexes[matchIndex] ?? 0;
    const lastMatchIndex = matchIndex + searchableSentence.length - 1;
    const sourceEnd = (searchableSource.sourceIndexes[lastMatchIndex] ?? sourceStart) + 1;
    searchCursor = matchIndex + searchableSentence.length;

    return {
      sentenceId: sentence.id,
      sourceEnd,
      sourceStart,
      text: compactDocumentLines(source.slice(sourceStart, sourceEnd))
    };
  });

  return locatedSentences.map((sentence, index) => {
    const nextSentence = locatedSentences[index + 1];
    let separatorAfter: OriginalDocumentLayoutSegment["separatorAfter"] = "";

    if (nextSentence) {
      separatorAfter = sentence.sourceEnd !== null && nextSentence.sourceStart !== null
        ? source.slice(sentence.sourceEnd, nextSentence.sourceStart).includes("\n") ? "\n" : " "
        : sentence.text.endsWith("\n") ? "\n" : " ";
    }

    return {
      sentenceId: sentence.sentenceId,
      text: sentence.text,
      separatorAfter
    };
  });
}

function buildSearchableText(value: string) {
  const sourceIndexes: number[] = [];
  let text = "";
  let readingWhitespace = false;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index] ?? "";

    if (/\s/.test(character)) {
      if (text && !readingWhitespace) {
        text += " ";
        sourceIndexes.push(index);
      }
      readingWhitespace = true;
      continue;
    }

    text += character;
    sourceIndexes.push(index);
    readingWhitespace = false;
  }

  if (text.endsWith(" ")) {
    text = text.slice(0, -1);
    sourceIndexes.pop();
  }

  return { sourceIndexes, text };
}

function collapseWhitespace(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function compactDocumentLines(value: string) {
  return value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

export function audioPlaybackErrorMessage(
  audioUrl: string,
  error: unknown,
  nowMs = Date.now()
) {
  if (signedAudioUrlExpired(audioUrl, nowMs)) {
    return "讲解音频链接已过期，请返回制作台重新生成语音讲解";
  }

  if (errorName(error) === "NotAllowedError") {
    return "浏览器暂不允许播放音频，请再次点击播放";
  }

  return "讲解音频加载失败，请稍后重试或重新生成语音讲解";
}

interface NarrationNodePositionLike {
  durationMs: number;
  sentenceId: string | null;
  type: "INTRO" | "SENTENCE" | "SUMMARY";
}

export function nodePositionAtGlobalTime(nodes: NarrationNodePositionLike[], globalTimeSeconds: number) {
  if (nodes.length === 0) {
    return { nodeIndex: 0, nodeTimeSeconds: 0 };
  }

  const safeTime = Math.max(0, globalTimeSeconds);
  let consumedSeconds = 0;

  for (let index = 0; index < nodes.length; index += 1) {
    const durationSeconds = Math.max(0, nodes[index]?.durationMs ?? 0) / 1000;

    if (safeTime < consumedSeconds + durationSeconds || index === nodes.length - 1) {
      return {
        nodeIndex: index,
        nodeTimeSeconds: Math.min(durationSeconds, Math.max(0, safeTime - consumedSeconds))
      };
    }

    consumedSeconds += durationSeconds;
  }

  return { nodeIndex: nodes.length - 1, nodeTimeSeconds: 0 };
}

export function globalTimeForNode(
  nodes: NarrationNodePositionLike[],
  nodeIndex: number,
  nodeTimeSeconds: number
) {
  const safeIndex = Math.max(0, Math.min(nodeIndex, nodes.length - 1));
  const previousSeconds = nodes
    .slice(0, safeIndex)
    .reduce((total, node) => total + Math.max(0, node.durationMs) / 1000, 0);
  const currentDuration = Math.max(0, nodes[safeIndex]?.durationMs ?? 0) / 1000;

  return previousSeconds + Math.min(currentDuration, Math.max(0, nodeTimeSeconds));
}

export function nextSentenceNodeIndex(
  nodes: NarrationNodePositionLike[],
  currentNodeIndex: number,
  direction: -1 | 1
) {
  const current = nodes[currentNodeIndex];
  const currentSentenceId = current?.sentenceId ?? null;

  if (direction > 0) {
    for (let index = currentNodeIndex + 1; index < nodes.length; index += 1) {
      const sentenceId = nodes[index]?.sentenceId;
      if (sentenceId && sentenceId !== currentSentenceId) return index;
    }
  } else {
    let previousSentenceId: string | null = null;

    for (let index = currentNodeIndex - 1; index >= 0; index -= 1) {
      const sentenceId = nodes[index]?.sentenceId ?? null;

      if (sentenceId && sentenceId !== currentSentenceId) {
        previousSentenceId = sentenceId;
        break;
      }
    }

    if (previousSentenceId) {
      const index = nodes.findIndex((node) => node.sentenceId === previousSentenceId);
      if (index >= 0) return index;
    }
  }

  if (currentSentenceId) {
    const currentSentenceStart = nodes.findIndex((node) => node.sentenceId === currentSentenceId);
    return currentSentenceStart >= 0 ? currentSentenceStart : currentNodeIndex;
  }

  const firstSentence = nodes.findIndex((node) => Boolean(node.sentenceId));
  return firstSentence >= 0 ? firstSentence : Math.max(0, currentNodeIndex);
}

export function expandLegacyStudySentences(
  sentences: EnglishStudySentence[],
  audioTimeline: EnglishAudioTimelineSegment[] = []
) {
  const timelineBySentenceId = new Map(audioTimeline.map((segment) => [segment.sentenceId, segment]));

  return sentences.flatMap((sentence) => {
    const timeline = timelineBySentenceId.get(sentence.id);
    const termByPointId = new Map(timeline?.terms.map((term) => [term.pointId, term]) ?? []);
    const timedSentence = timeline
      ? {
          ...sentence,
          startSeconds: timeline.startSeconds,
          endSeconds: timeline.endSeconds,
          points: sentence.points.map((point) => {
            const term = termByPointId.get(point.id);

            return term
              ? { ...point, startSeconds: term.startSeconds, endSeconds: term.endSeconds }
              : point;
          })
        }
      : sentence;

    return expandLegacySentence(timedSentence);
  });
}

export function buildLearningTimeline(sentences: EnglishStudySentence[]): EnglishAudioTimelineSegment[] {
  return sentences.map((sentence) => ({
    sentenceId: sentence.id,
    startSeconds: sentence.startSeconds,
    endSeconds: sentence.endSeconds,
    terms: sentence.points.map((point) => ({
      pointId: point.id,
      term: point.term,
      startSeconds: point.startSeconds,
      endSeconds: point.endSeconds
    }))
  }));
}

export function nextPracticeQuestionIndex(
  questionIds: string[],
  answers: Record<string, number>,
  currentIndex: number
) {
  for (let offset = 1; offset <= questionIds.length; offset += 1) {
    const index = (currentIndex + offset) % questionIds.length;
    const questionId = questionIds[index];

    if (questionId && answers[questionId] === undefined) {
      return index;
    }
  }

  return null;
}

export function practiceResult(
  questions: Array<Pick<EnglishStudyQuestion, "id" | "answer">>,
  answers: Record<string, number>
): PracticeResult {
  const result: PracticeResult = {
    correctCount: 0,
    wrongQuestionIds: [],
    unansweredQuestionIds: []
  };

  for (const question of questions) {
    const selected = answers[question.id];

    if (selected === undefined) {
      result.unansweredQuestionIds.push(question.id);
    } else if (selected === question.answer) {
      result.correctCount += 1;
    } else {
      result.wrongQuestionIds.push(question.id);
    }
  }

  return result;
}

function expandLegacySentence(sentence: EnglishStudySentence) {
  const segments = splitEnglishSentences(sentence.text);

  if (segments.length <= 1) {
    return [sentence];
  }

  const duration = Math.max(0, sentence.endSeconds - sentence.startSeconds);
  const totalWeight = segments.reduce((total, segment) => total + segment.length, 0);
  let consumedWeight = 0;

  return segments.map((text, index) => {
    const startRatio = consumedWeight / totalWeight;
    consumedWeight += text.length;
    const endRatio = consumedWeight / totalWeight;
    const startSeconds = roundSeconds(sentence.startSeconds + duration * startRatio);
    const endSeconds = index === segments.length - 1
      ? sentence.endSeconds
      : roundSeconds(sentence.startSeconds + duration * endRatio);
    const lowerText = text.toLowerCase();
    const points = sentence.points
      .filter((point) => lowerText.includes(point.term.toLowerCase()))
      .map((point) => clampPointTime(point, startSeconds, endSeconds));

    return {
      ...sentence,
      id: `${sentence.id}-${index + 1}`,
      text,
      startSeconds,
      endSeconds,
      points
    };
  });
}

function splitEnglishSentences(value: string) {
  if (typeof Intl.Segmenter === "function") {
    const segmenter = new Intl.Segmenter("en", { granularity: "sentence" });
    const segments = Array.from(segmenter.segment(value), ({ segment }) => segment.trim()).filter(Boolean);

    if (segments.length > 0) {
      return segments;
    }
  }

  return (value.match(/[^.!?。！？]+[.!?。！？]+["')\]]*|[^.!?。！？]+$/g) ?? [value])
    .map((item) => item.trim())
    .filter(Boolean);
}

function clampPointTime(
  point: EnglishStudySentence["points"][number],
  startSeconds: number,
  endSeconds: number
) {
  const safeEnd = Math.max(startSeconds + 0.1, endSeconds);
  const pointStart = Math.max(startSeconds, Math.min(point.startSeconds, safeEnd - 0.1));
  const pointEnd = Math.max(pointStart + 0.1, Math.min(point.endSeconds, safeEnd));

  return {
    ...point,
    startSeconds: roundSeconds(pointStart),
    endSeconds: roundSeconds(pointEnd)
  };
}

function roundSeconds(value: number) {
  return Math.max(0, Math.round(value * 100) / 100);
}

function signedAudioUrlExpired(value: string, nowMs: number) {
  try {
    const expiresSeconds = Number(new URL(value).searchParams.get("Expires"));
    return Number.isFinite(expiresSeconds) && expiresSeconds > 0 && expiresSeconds * 1000 <= nowMs;
  } catch {
    return false;
  }
}

function errorName(value: unknown) {
  return value && typeof value === "object" && "name" in value && typeof value.name === "string"
    ? value.name
    : "";
}
