export interface EnglishReadAlongSourceSentence {
  id: string;
  text: string;
}

export type EnglishReadAlongUnitType = "TITLE" | "AUTHOR" | "BODY";
export type EnglishReadAlongTimingSource = "ASR_WORDS" | "ASR_CUE" | "DURATION_ESTIMATE";

export interface EnglishReadAlongSourceUnit {
  id: string;
  type: EnglishReadAlongUnitType;
  sentenceId: string | null;
  text: string;
}

export interface EnglishReadAlongWordTiming {
  text: string;
  startChar: number;
  endChar: number;
  startSeconds: number;
  endSeconds: number;
}

export interface EnglishReadAlongCue {
  id: string;
  unitId: string;
  unitType: EnglishReadAlongUnitType;
  sentenceId: string | null;
  text: string;
  startSeconds: number;
  endSeconds: number;
  timingSource: EnglishReadAlongTimingSource;
  words: EnglishReadAlongWordTiming[];
}

export interface EnglishReadAlongNode {
  id: string;
  unitId: string;
  unitType: EnglishReadAlongUnitType;
  sentenceId: string | null;
  text: string;
  audioTaskId: string;
  audioUrl: string;
  durationMs: number;
  timingSource: EnglishReadAlongTimingSource;
  words: EnglishReadAlongWordTiming[];
}

export interface EnglishReadAlongTrack {
  version: 2;
  source: "GENERATED" | "UPLOAD";
  audioUrl: string;
  audioName: string;
  audioAssetId: string | null;
  durationMs: number;
  srtText: string;
  cues: EnglishReadAlongCue[];
  nodes: EnglishReadAlongNode[];
  voice: string | null;
}

export interface RecognizedSubtitleCue {
  startSeconds: number;
  endSeconds: number;
  text: string;
}

export interface RecognizedWordTiming {
  text: string;
  startSeconds: number;
  endSeconds: number;
}

interface SourceWordToken {
  text: string;
  normalized: string;
  startChar: number;
  endChar: number;
  joinedToPrevious?: boolean;
  omitWhenUnmatched?: boolean;
}

interface UnitAlignment {
  matchedWords: Map<number, RecognizedWordTiming>;
  nextRecognizedIndex: number;
}

export function buildEnglishReadAlongSourceUnits(input: {
  author?: string | null;
  sentences: EnglishReadAlongSourceSentence[];
  title?: string | null;
}) {
  const title = input.title?.trim() || null;
  const author = input.author?.trim() || null;
  const units: EnglishReadAlongSourceUnit[] = [];

  if (title) {
    units.push({
      id: "read-along-title",
      type: "TITLE",
      sentenceId: null,
      text: title
    });
  }

  if (author) {
    units.push({
      id: "read-along-author",
      type: "AUTHOR",
      sentenceId: null,
      text: author
    });
  }

  const duplicatePrefixValues = new Set(
    [title, author]
      .map((value) => normalizedComparableText(value ?? ""))
      .filter(Boolean)
  );
  let readingPrefix = duplicatePrefixValues.size > 0;

  for (const sentence of input.sentences) {
    const id = sentence.id.trim();
    const text = sentence.text.trim();

    if (!id || !text) continue;

    const comparable = normalizedComparableText(text);
    if (readingPrefix && duplicatePrefixValues.has(comparable)) {
      duplicatePrefixValues.delete(comparable);
      continue;
    }

    readingPrefix = false;
    units.push({
      id: `read-along-body-${id}`,
      type: "BODY",
      sentenceId: id,
      text
    });
  }

  if (!units.some((unit) => unit.type === "BODY")) {
    throw new Error("跟读训练至少需要一个有效的原文句子");
  }

  return units;
}

export function buildGeneratedReadAlongTrack(input: {
  nodes: Array<Omit<EnglishReadAlongNode, "id" | "timingSource"> & {
    id?: string;
    timingSource?: EnglishReadAlongTimingSource;
  }>;
  voice?: string | null;
}): EnglishReadAlongTrack {
  let cursorMs = 0;
  const nodes = input.nodes.map((node, index) => {
    const durationMs = positiveDurationMs(node.durationMs);
    const words = validSourceWordTimings(node.words, node.text, durationMs / 1000);

    return {
      ...node,
      id: node.id ?? `read-along-node-${index + 1}`,
      durationMs,
      timingSource: words.length > 0
        ? node.timingSource ?? "ASR_WORDS"
        : "DURATION_ESTIMATE",
      words
    };
  });
  const cues = nodes.map((node, index) => {
    const startMs = cursorMs;
    cursorMs += node.durationMs;
    const offsetSeconds = seconds(startMs);

    return {
      id: `read-along-cue-${index + 1}`,
      unitId: node.unitId,
      unitType: node.unitType,
      sentenceId: node.sentenceId as string | null,
      text: node.text,
      startSeconds: seconds(startMs),
      endSeconds: seconds(cursorMs),
      timingSource: node.timingSource,
      words: node.words.map((word) => ({
        ...word,
        startSeconds: roundSeconds(offsetSeconds + word.startSeconds),
        endSeconds: roundSeconds(offsetSeconds + word.endSeconds)
      }))
    };
  });
  const firstNode = nodes[0];

  if (!firstNode) {
    throw new Error("跟读训练至少需要一个有效的原文句子");
  }

  return {
    version: 2,
    source: "GENERATED",
    audioUrl: firstNode.audioUrl,
    audioName: "全文诵读.mp3",
    audioAssetId: null,
    durationMs: cursorMs,
    srtText: readAlongCuesToSrt(cues),
    cues,
    nodes,
    voice: input.voice?.trim() || null
  };
}

export function buildUploadedReadAlongTrack(input: {
  audioAssetId: string;
  audioName: string;
  audioUrl: string;
  durationMs?: number;
  recognizedSrt: string;
  recognizedWords?: RecognizedWordTiming[];
  units: EnglishReadAlongSourceUnit[];
}): EnglishReadAlongTrack {
  const recognizedCues = parseSrtCues(input.recognizedSrt);
  const recognizedWords = normalizeRecognizedWords(input.recognizedWords ?? []);
  const inferredWords = recognizedWords.length > 0
    ? recognizedWords
    : recognizedWordsFromCues(recognizedCues);
  const inferredDurationMs = Math.max(
    input.durationMs ?? 0,
    Math.round((inferredWords.at(-1)?.endSeconds ?? recognizedCues.at(-1)?.endSeconds ?? 0) * 1000)
  );
  const cues = inferredWords.length > 0
    ? alignReadAlongWordsToUnits(input.units, inferredWords, inferredDurationMs, recognizedWords.length > 0)
    : durationFallbackUnitCues(
        input.units.filter((unit) => unit.type === "BODY"),
        inferredDurationMs
      );
  const durationMs = Math.max(
    1,
    inferredDurationMs,
    Math.round((cues.at(-1)?.endSeconds ?? 0) * 1000)
  );

  return {
    version: 2,
    source: "UPLOAD",
    audioUrl: input.audioUrl,
    audioName: input.audioName,
    audioAssetId: input.audioAssetId,
    durationMs,
    srtText: readAlongCuesToSrt(cues),
    cues,
    nodes: [],
    voice: null
  };
}

export function readAlongCheckpointNodes(
  value: unknown,
  sourceUnits: EnglishReadAlongSourceUnit[]
) {
  if (!Array.isArray(value)) {
    return [];
  }

  const nodes: EnglishReadAlongNode[] = [];

  for (let index = 0; index < Math.min(value.length, sourceUnits.length); index += 1) {
    const node = recordValue(value[index]);
    const source = sourceUnits[index];

    if (
      !node ||
      !source ||
      node.unitId !== source.id ||
      node.unitType !== source.type ||
      node.sentenceId !== source.sentenceId ||
      node.text !== source.text ||
      typeof node.id !== "string" ||
      !node.id ||
      typeof node.audioTaskId !== "string" ||
      !node.audioTaskId ||
      typeof node.audioUrl !== "string" ||
      !node.audioUrl ||
      typeof node.durationMs !== "number" ||
      !Number.isFinite(node.durationMs) ||
      node.durationMs <= 0
    ) {
      break;
    }

    nodes.push({
      id: node.id,
      sentenceId: node.sentenceId as string | null,
      text: node.text,
      audioTaskId: node.audioTaskId,
      audioUrl: node.audioUrl,
      durationMs: node.durationMs,
      timingSource: isEnglishReadAlongTimingSource(node.timingSource)
        ? node.timingSource
        : "DURATION_ESTIMATE",
      unitId: node.unitId as string,
      unitType: node.unitType as EnglishReadAlongUnitType,
      words: validSourceWordTimings(node.words, node.text, node.durationMs / 1000)
    });
  }

  return nodes;
}

export function unreferencedReadAlongTaskIds(
  generatedTaskIds: string[],
  referencedTaskIds: string[]
) {
  const referenced = new Set(referencedTaskIds);

  return Array.from(new Set(
    generatedTaskIds
      .map((taskId) => taskId.trim())
      .filter((taskId) => taskId && !referenced.has(taskId))
  ));
}

export function distributeReadAlongCuesByDuration(
  sentences: EnglishReadAlongSourceSentence[],
  durationMs: number
) {
  const source = sentences
    .map((sentence) => ({ id: sentence.id.trim(), text: sentence.text.trim() }))
    .filter((sentence) => sentence.id && sentence.text);

  if (source.length === 0 || !Number.isFinite(durationMs) || durationMs <= 0) {
    throw new Error("无法根据音频时长生成跟读字幕");
  }

  const weights = source.map((sentence) => speechWeight(sentence.text));
  const totalWeight = weights.reduce((total, weight) => total + weight, 0);
  let cursorMs = 0;

  return source.map((sentence, index) => {
    const startMs = cursorMs;
    cursorMs = index === source.length - 1
      ? Math.round(durationMs)
      : Math.round(cursorMs + durationMs * (weights[index]! / totalWeight));

    return {
      id: `read-along-cue-${index + 1}`,
      sentenceId: sentence.id,
      text: sentence.text,
      startSeconds: seconds(startMs),
      endSeconds: seconds(Math.max(startMs + 1, cursorMs))
    };
  });
}

export function alignReadAlongCuesToSource(
  sentences: EnglishReadAlongSourceSentence[],
  recognizedCues: RecognizedSubtitleCue[]
) {
  const source = sentences
    .map((sentence) => ({ id: sentence.id.trim(), text: sentence.text.trim() }))
    .filter((sentence) => sentence.id && sentence.text);
  const recognized = recognizedCues
    .filter(validRecognizedCue)
    .sort((left, right) => left.startSeconds - right.startSeconds);

  if (source.length === 0 || recognized.length === 0) {
    throw new Error("音频识别结果无法与带学文稿断句对应");
  }

  if (source.length === recognized.length) {
    return source.map((sentence, index) => {
      const cue = recognized[index]!;

      return {
        id: `read-along-cue-${index + 1}`,
        sentenceId: sentence.id,
        text: sentence.text,
        startSeconds: cue.startSeconds,
        endSeconds: cue.endSeconds
      };
    });
  }

  const sourceWeights = source.map((sentence) => speechWeight(sentence.text));
  const totalSourceWeight = sourceWeights.reduce((total, weight) => total + weight, 0);
  const recognizedWeights = recognized.map((cue) => speechWeight(cue.text));
  const totalRecognizedWeight = recognizedWeights.reduce((total, weight) => total + weight, 0);
  const timelineStartMs = Math.round(recognized[0]!.startSeconds * 1000);
  const timelineEndMs = Math.round(recognized.at(-1)!.endSeconds * 1000);

  if (timelineEndMs - timelineStartMs < source.length) {
    throw new Error("上传音频过短，无法与带学文稿断句对应");
  }

  const boundariesMs = [timelineStartMs];
  let sourceConsumed = 0;

  for (let index = 0; index < source.length - 1; index += 1) {
    sourceConsumed += sourceWeights[index]!;
    const targetRecognizedWeight = (sourceConsumed / totalSourceWeight) * totalRecognizedWeight;
    let recognizedConsumed = 0;
    let boundarySeconds = recognized.at(-1)!.endSeconds;

    for (let cueIndex = 0; cueIndex < recognized.length; cueIndex += 1) {
      const cue = recognized[cueIndex]!;
      const cueWeight = recognizedWeights[cueIndex]!;
      const nextRecognizedConsumed = recognizedConsumed + cueWeight;

      if (nextRecognizedConsumed >= targetRecognizedWeight) {
        const cueRatio = Math.max(
          0,
          Math.min(1, (targetRecognizedWeight - recognizedConsumed) / cueWeight)
        );
        boundarySeconds = cue.startSeconds + (cue.endSeconds - cue.startSeconds) * cueRatio;
        break;
      }

      recognizedConsumed = nextRecognizedConsumed;
    }

    const previousBoundaryMs = boundariesMs.at(-1)!;
    const remainingCueCount = source.length - index - 1;
    boundariesMs.push(Math.max(
      previousBoundaryMs + 1,
      Math.min(
        timelineEndMs - remainingCueCount,
        Math.round(boundarySeconds * 1000)
      )
    ));
  }

  boundariesMs.push(timelineEndMs);

  return source.map((sentence, index) => ({
    id: `read-along-cue-${index + 1}`,
    sentenceId: sentence.id,
    text: sentence.text,
    startSeconds: seconds(boundariesMs[index]!),
    endSeconds: seconds(boundariesMs[index + 1]!)
  }));
}

export function recognizedWordTimingsFromValue(value: unknown): RecognizedWordTiming[] {
  if (!Array.isArray(value)) return [];

  return normalizeRecognizedWords(value.map((item) => {
    const word = recordValue(item);
    const text = typeof word?.text === "string" ? word.text : "";
    const startSeconds = numericValue(word?.startSeconds) ?? millisecondsToSeconds(word?.beginTime);
    const endSeconds = numericValue(word?.endSeconds) ?? millisecondsToSeconds(word?.endTime);

    return { text, startSeconds, endSeconds };
  }));
}

export function alignReadAlongWordsToText(
  text: string,
  recognizedWords: RecognizedWordTiming[],
  durationMs: number
) {
  const tokens = sourceWordTokens(text);
  const normalizedWords = normalizeRecognizedWords(recognizedWords);
  const durationSeconds = positiveDurationMs(durationMs) / 1000;

  if (tokens.length === 0) return [];
  if (normalizedWords.length === 0) {
    return [];
  }

  const alignment = matchUnitTokens(tokens, normalizedWords, 0);
  if (alignment.matchedWords.size < Math.max(1, Math.ceil(tokens.length * 0.5))) return [];
  return interpolateSourceWords(tokens, alignment.matchedWords, 0, durationSeconds);
}

function alignReadAlongWordsToUnits(
  units: EnglishReadAlongSourceUnit[],
  recognizedWords: RecognizedWordTiming[],
  durationMs: number,
  hasNativeWordTimeline: boolean
) {
  const durationSeconds = positiveDurationMs(durationMs) / 1000;
  const unitTokens = units.map((unit) => sourceUnitTokens(unit));
  const unitAlignments = globallyAlignUnitTokens(units, unitTokens, recognizedWords);
  const accepted: Array<{
    alignment: UnitAlignment;
    tokens: SourceWordToken[];
    unit: EnglishReadAlongSourceUnit;
  }> = [];

  for (let unitIndex = 0; unitIndex < units.length; unitIndex += 1) {
    const unit = units[unitIndex]!;
    const tokens = unitTokens[unitIndex]!;
    if (tokens.length === 0) {
      if (unit.type === "BODY") {
        accepted.push({ alignment: unitAlignments[unitIndex]!, tokens, unit });
      }
      continue;
    }

    const alignment = unitAlignments[unitIndex]!;
    const matchedCount = alignment.matchedWords.size;
    const optionalUnit = unit.type !== "BODY";
    const requiredOptionalMatches = Math.max(1, Math.ceil(tokens.length * 0.6));

    if (optionalUnit && matchedCount < requiredOptionalMatches) {
      continue;
    }

    accepted.push({ alignment, tokens, unit });
  }

  const fallback = durationFallbackUnitCues(accepted.map((item) => item.unit), durationMs);
  const matchedEntries = accepted.map((item) =>
    Array.from(item.alignment.matchedWords.entries()).sort((left, right) => left[0] - right[0])
  );
  const boundaries = [0];

  for (let index = 0; index < accepted.length - 1; index += 1) {
    const leftLastMatch = matchedEntries[index]?.at(-1)?.[1];
    const rightFirstMatch = matchedEntries[index + 1]?.[0]?.[1];
    const fallbackBoundary = fallback[index]!.endSeconds;
    let boundary = fallbackBoundary;

    if (leftLastMatch && rightFirstMatch) {
      boundary = leftLastMatch.endSeconds <= rightFirstMatch.startSeconds
        ? (leftLastMatch.endSeconds + rightFirstMatch.startSeconds) / 2
        : rightFirstMatch.startSeconds;
    } else if (rightFirstMatch) {
      boundary = rightFirstMatch.startSeconds;
    } else if (leftLastMatch) {
      boundary = leftLastMatch.endSeconds;
    }

    const previousBoundary = boundaries.at(-1)!;
    const remainingUnits = accepted.length - index - 1;
    boundaries.push(Math.max(
      previousBoundary + 0.001,
      Math.min(durationSeconds - remainingUnits * 0.001, boundary)
    ));
  }

  boundaries.push(durationSeconds);

  return accepted.map((item, index): EnglishReadAlongCue => {
    const hasMatches = matchedEntries[index]!.length > 0;
    const requiredTokenIndexes = item.tokens
      .map((token, tokenIndex) => token.omitWhenUnmatched ? null : tokenIndex)
      .filter((tokenIndex): tokenIndex is number => tokenIndex !== null);
    const reliableTokenIndexes = requiredTokenIndexes.length > 0
      ? requiredTokenIndexes
      : item.tokens.map((_token, tokenIndex) => tokenIndex);
    const reliableMatchCount = reliableTokenIndexes
      .filter((tokenIndex) => item.alignment.matchedWords.has(tokenIndex))
      .length;
    const hasReliableWordMatches = hasNativeWordTimeline &&
      reliableMatchCount >= Math.max(1, Math.ceil(reliableTokenIndexes.length * 0.5));
    const startSeconds = boundaries[index]!;
    const endSeconds = boundaries[index + 1]!;

    return {
      id: `read-along-cue-${index + 1}`,
      unitId: item.unit.id,
      unitType: item.unit.type,
      sentenceId: item.unit.sentenceId,
      text: item.unit.text,
      startSeconds: roundSeconds(startSeconds),
      endSeconds: roundSeconds(endSeconds),
      timingSource: hasReliableWordMatches
        ? "ASR_WORDS"
        : hasMatches ? "ASR_CUE" : "DURATION_ESTIMATE",
      words: hasReliableWordMatches
        ? interpolateSourceWords(
            item.tokens,
            item.alignment.matchedWords,
            startSeconds,
            endSeconds
          )
        : []
    };
  });
}

interface GlobalSourceWordToken {
  alignmentOptional: boolean;
  bodyToken: boolean;
  token: SourceWordToken;
  tokenIndex: number;
  unitIndex: number;
}

function globallyAlignUnitTokens(
  units: EnglishReadAlongSourceUnit[],
  unitTokens: SourceWordToken[][],
  recognizedWords: RecognizedWordTiming[]
): UnitAlignment[] {
  const sourceTokens = units.flatMap((unit, unitIndex) =>
    unitTokens[unitIndex]!.map((token, tokenIndex): GlobalSourceWordToken => ({
      alignmentOptional: unit.type !== "BODY" || Boolean(token.omitWhenUnmatched),
      bodyToken: unit.type === "BODY" && !token.omitWhenUnmatched,
      token,
      tokenIndex,
      unitIndex
    }))
  );
  const alignments = units.map((): UnitAlignment => ({
    matchedWords: new Map(),
    nextRecognizedIndex: 0
  }));

  if (sourceTokens.length === 0 || recognizedWords.length === 0) {
    return alignments;
  }

  const moves = globalAlignmentMoves(sourceTokens, recognizedWords);
  let sourceIndex = sourceTokens.length;
  let recognizedIndex = recognizedWords.length;

  while (sourceIndex > 0 || recognizedIndex > 0) {
    const row = moves[sourceIndex];
    const move = row?.values[recognizedIndex - (row?.start ?? 0)] ?? 0;

    if (move === 1) {
      const source = sourceTokens[sourceIndex - 1]!;
      const recognized = recognizedWords[recognizedIndex - 1]!;
      alignments[source.unitIndex]!.matchedWords.set(source.tokenIndex, recognized);
      alignments[source.unitIndex]!.nextRecognizedIndex = Math.max(
        alignments[source.unitIndex]!.nextRecognizedIndex,
        recognizedIndex
      );
      sourceIndex -= 1;
      recognizedIndex -= 1;
    } else if (move >= 5) {
      const partCount = move - 3;
      const sources = sourceTokens.slice(sourceIndex - partCount, sourceIndex);
      const recognized = recognizedWords[recognizedIndex - 1]!;
      const splitWords = splitRecognizedCompoundWord(
        recognized,
        sources.map((source) => source.token)
      );

      if (!splitWords) break;
      for (let offset = 0; offset < sources.length; offset += 1) {
        const source = sources[offset]!;
        alignments[source.unitIndex]!.matchedWords.set(source.tokenIndex, splitWords[offset]!);
        alignments[source.unitIndex]!.nextRecognizedIndex = Math.max(
          alignments[source.unitIndex]!.nextRecognizedIndex,
          recognizedIndex
        );
      }
      sourceIndex -= partCount;
      recognizedIndex -= 1;
    } else if (move === 2) {
      sourceIndex -= 1;
    } else if (move === 3) {
      recognizedIndex -= 1;
    } else {
      // The adaptive band should always contain a complete path. Fail closed
      // instead of fabricating matches if malformed provider data escapes it.
      break;
    }
  }

  return alignments;
}

function globalAlignmentMoves(
  sourceTokens: GlobalSourceWordToken[],
  recognizedWords: RecognizedWordTiming[]
) {
  const sourceLength = sourceTokens.length;
  const recognizedLength = recognizedWords.length;
  const maximumLength = Math.max(sourceLength, recognizedLength);
  const fullMatrix = sourceLength * recognizedLength <= 2_000_000;
  let band = fullMatrix
    ? maximumLength
    : Math.max(
        96,
        Math.min(1024, Math.abs(sourceLength - recognizedLength) + 64),
        Math.min(1024, Math.ceil(maximumLength * 0.05))
      );
  const expansionBandLimit = Math.min(maximumLength, Math.max(band, 512));
  const minimumPotentialMatches = Math.max(
    8,
    Math.ceil(Math.min(sourceLength, recognizedLength) * 0.05)
  );
  const hasExpansionEvidence = globalPotentialExactMatches(sourceTokens, recognizedWords) >=
    minimumPotentialMatches;

  while (true) {
    const rows = globalAlignmentMovesWithinBand(sourceTokens, recognizedWords, band);

    if (
      globalAlignmentPathFitsBand(rows, sourceLength, recognizedLength) ||
      band >= expansionBandLimit ||
      !hasExpansionEvidence
    ) {
      return rows;
    }

    band = Math.min(expansionBandLimit, band * 2);
  }
}

function globalPotentialExactMatches(
  sourceTokens: GlobalSourceWordToken[],
  recognizedWords: RecognizedWordTiming[]
) {
  const recognizedCounts = new Map<string, number>();

  for (const recognized of recognizedWords) {
    const key = normalizedWord(recognized.text).replace(/'/g, "");
    if (!key) continue;
    recognizedCounts.set(key, (recognizedCounts.get(key) ?? 0) + 1);
  }

  let matches = 0;
  for (const source of sourceTokens) {
    const key = source.token.normalized.replace(/'/g, "");
    const count = recognizedCounts.get(key) ?? 0;
    if (count <= 0) continue;
    matches += 1;
    recognizedCounts.set(key, count - 1);
  }

  return matches;
}

interface GlobalAlignmentMoveRow {
  start: number;
  values: Uint8Array;
}

function globalAlignmentPathFitsBand(
  rows: GlobalAlignmentMoveRow[],
  sourceLength: number,
  recognizedLength: number
) {
  let sourceIndex = sourceLength;
  let recognizedIndex = recognizedLength;

  while (sourceIndex > 0 || recognizedIndex > 0) {
    const row = rows[sourceIndex];
    if (!row) return false;
    const rowEnd = row.start + row.values.length - 1;

    if (
      (recognizedIndex === row.start && row.start > 0) ||
      (recognizedIndex === rowEnd && rowEnd < recognizedLength)
    ) {
      return false;
    }

    const move = row.values[recognizedIndex - row.start] ?? 0;

    if (move === 1) {
      sourceIndex -= 1;
      recognizedIndex -= 1;
    } else if (move >= 5) {
      sourceIndex -= move - 3;
      recognizedIndex -= 1;
    } else if (move === 2) {
      sourceIndex -= 1;
    } else if (move === 3) {
      recognizedIndex -= 1;
    } else {
      return false;
    }
  }

  return true;
}

function globalAlignmentMovesWithinBand(
  sourceTokens: GlobalSourceWordToken[],
  recognizedWords: RecognizedWordTiming[],
  band: number
) {
  const sourceLength = sourceTokens.length;
  const recognizedLength = recognizedWords.length;
  const rows: GlobalAlignmentMoveRow[] = [];
  const initialEnd = Math.min(recognizedLength, band);
  let previousStart = 0;
  let previousEnd = initialEnd;
  let previousScores = new Float64Array(initialEnd + 1);
  const initialMoves = new Uint8Array(initialEnd + 1);
  const recentScoreRows = new Map<number, {
    end: number;
    start: number;
    values: Float64Array;
  }>();
  const maximumCompoundParts = maximumJoinedSourceParts(sourceTokens);

  for (let recognizedIndex = 1; recognizedIndex <= initialEnd; recognizedIndex += 1) {
    previousScores[recognizedIndex] = previousScores[recognizedIndex - 1]! - 1;
    initialMoves[recognizedIndex] = 3;
  }
  rows.push({ start: 0, values: initialMoves });
  recentScoreRows.set(0, { end: initialEnd, start: 0, values: previousScores });

  for (let sourceIndex = 1; sourceIndex <= sourceLength; sourceIndex += 1) {
    const center = Math.round(sourceIndex * recognizedLength / sourceLength);
    const currentStart = Math.max(0, center - band);
    const currentEnd = Math.min(recognizedLength, center + band);
    const currentScores = new Float64Array(currentEnd - currentStart + 1);
    const currentMoves = new Uint8Array(currentEnd - currentStart + 1);
    currentScores.fill(Number.NEGATIVE_INFINITY);
    const source = sourceTokens[sourceIndex - 1]!;
    const sourceGapPenalty = source.alignmentOptional ? -0.15 : -1;

    for (let recognizedIndex = currentStart; recognizedIndex <= currentEnd; recognizedIndex += 1) {
      const localIndex = recognizedIndex - currentStart;
      let bestScore = Number.NEGATIVE_INFINITY;
      let bestMove = 0;
      const previousLocalIndex = recognizedIndex - previousStart;

      if (previousLocalIndex >= 0 && recognizedIndex <= previousEnd) {
        const score = previousScores[previousLocalIndex]! + sourceGapPenalty;
        if (score > bestScore) {
          bestScore = score;
          bestMove = 2;
        }
      }

      if (recognizedIndex > currentStart) {
        const score = currentScores[localIndex - 1]! - 1;
        if (score > bestScore) {
          bestScore = score;
          bestMove = 3;
        }
      }

      if (recognizedIndex > 0) {
        const diagonalLocalIndex = recognizedIndex - 1 - previousStart;
        const recognized = recognizedWords[recognizedIndex - 1]!;
        const matchScore = globalTokenMatchScore(source, recognized);

        if (
          matchScore !== null &&
          diagonalLocalIndex >= 0 &&
          recognizedIndex - 1 <= previousEnd
        ) {
          const score = previousScores[diagonalLocalIndex]! + matchScore;
          if (score >= bestScore) {
            bestScore = score;
            bestMove = 1;
          }
        }

        const compoundSources = joinedSourcePartsEndingAt(sourceTokens, sourceIndex);
        const compoundScore = compoundSources
          ? globalCompoundMatchScore(compoundSources, recognized)
          : null;
        const compoundPreviousRow = compoundSources
          ? recentScoreRows.get(sourceIndex - compoundSources.length)
          : null;
        const compoundPreviousIndex = recognizedIndex - 1 - (compoundPreviousRow?.start ?? 0);

        if (
          compoundSources &&
          compoundScore !== null &&
          compoundPreviousRow &&
          compoundPreviousIndex >= 0 &&
          recognizedIndex - 1 <= compoundPreviousRow.end
        ) {
          const score = compoundPreviousRow.values[compoundPreviousIndex]! + compoundScore;
          if (score >= bestScore) {
            bestScore = score;
            bestMove = compoundSources.length + 3;
          }
        }
      }

      currentScores[localIndex] = bestScore;
      currentMoves[localIndex] = bestMove;
    }

    rows.push({ start: currentStart, values: currentMoves });
    recentScoreRows.set(sourceIndex, {
      end: currentEnd,
      start: currentStart,
      values: currentScores
    });
    recentScoreRows.delete(sourceIndex - maximumCompoundParts - 1);
    previousScores = currentScores;
    previousStart = currentStart;
    previousEnd = currentEnd;
  }

  return rows;
}

function maximumJoinedSourceParts(sourceTokens: GlobalSourceWordToken[]) {
  let maximum = 1;
  let current = 1;

  for (const source of sourceTokens) {
    current = source.token.joinedToPrevious ? Math.min(252, current + 1) : 1;
    maximum = Math.max(maximum, current);
  }

  return maximum;
}

function joinedSourcePartsEndingAt(
  sourceTokens: GlobalSourceWordToken[],
  sourceIndex: number
) {
  if (!sourceTokens[sourceIndex - 1]?.token.joinedToPrevious) return null;
  let startIndex = sourceIndex - 1;

  while (startIndex > 0 && sourceTokens[startIndex]!.token.joinedToPrevious) {
    startIndex -= 1;
    if (sourceIndex - startIndex > 252) return null;
  }

  const parts = sourceTokens.slice(startIndex, sourceIndex);
  return parts.length >= 2 ? parts : null;
}

function globalCompoundMatchScore(
  sources: GlobalSourceWordToken[],
  recognized: RecognizedWordTiming
) {
  if (!splitRecognizedCompoundWord(recognized, sources.map((source) => source.token))) {
    return null;
  }

  const left = sources.map((source) => source.token.normalized.replace(/'/g, "")).join("");
  const right = normalizedWord(recognized.text).replace(/'/g, "");
  if (!similarWordToken(left, right)) return null;

  return (left === right ? 4 : 2) + (sources.every((source) => source.bodyToken) ? 0.25 : 0);
}

function splitRecognizedCompoundWord(
  recognized: RecognizedWordTiming,
  parts: SourceWordToken[]
) {
  const startMs = Math.round(recognized.startSeconds * 1000);
  const endMs = Math.round(recognized.endSeconds * 1000);
  if (parts.length < 2 || endMs - startMs < parts.length) return null;

  const weights = parts.map((part) => Math.max(1, part.normalized.length));
  const totalWeight = weights.reduce((total, weight) => total + weight, 0);
  let consumedWeight = 0;
  let cursorMs = startMs;

  return parts.map((part, index): RecognizedWordTiming => {
    consumedWeight += weights[index]!;
    const remainingParts = parts.length - index - 1;
    const idealEndMs = Math.round(startMs + (endMs - startMs) * (consumedWeight / totalWeight));
    const partEndMs = index === parts.length - 1
      ? endMs
      : Math.min(endMs - remainingParts, Math.max(cursorMs + 1, idealEndMs));
    const result = {
      text: part.text,
      startSeconds: seconds(cursorMs),
      endSeconds: seconds(partEndMs)
    };
    cursorMs = partEndMs;
    return result;
  });
}

function globalTokenMatchScore(
  source: GlobalSourceWordToken,
  recognized: RecognizedWordTiming
) {
  const right = normalizedWord(recognized.text);
  if (!similarWordToken(source.token.normalized, right)) return null;

  const exact = source.token.normalized === right ||
    source.token.normalized.replace(/'/g, "") === right.replace(/'/g, "");
  return (exact ? 4 : 2) + (source.bodyToken ? 0.25 : 0);
}

function sourceUnitTokens(unit: EnglishReadAlongSourceUnit) {
  const citationRanges = Array.from(unit.text.matchAll(/[（(]\s*《[^》\n]{1,80}》\s*[）)]/gu))
    .map((match) => ({
      end: (match.index ?? 0) + match[0].length,
      start: match.index ?? 0
    }));

  return sourceWordTokens(unit.text).map((token) => ({
    ...token,
    omitWhenUnmatched: citationRanges.some((range) =>
      token.startChar >= range.start && token.endChar <= range.end
    )
  }));
}

function durationFallbackUnitCues(
  units: EnglishReadAlongSourceUnit[],
  durationMs: number
): EnglishReadAlongCue[] {
  if (units.length === 0 || !Number.isFinite(durationMs) || durationMs <= 0) {
    throw new Error("无法根据音频时长生成跟读字幕");
  }

  const weights = units.map((unit) => speechWeight(unit.text));
  const totalWeight = weights.reduce((total, weight) => total + weight, 0);
  let cursorMs = 0;

  return units.map((unit, index) => {
    const startMs = cursorMs;
    cursorMs = index === units.length - 1
      ? Math.round(durationMs)
      : Math.round(cursorMs + durationMs * (weights[index]! / totalWeight));
    const startSeconds = seconds(startMs);
    const endSeconds = seconds(Math.max(startMs + 1, cursorMs));

    return {
      id: `read-along-cue-${index + 1}`,
      unitId: unit.id,
      unitType: unit.type,
      sentenceId: unit.sentenceId,
      text: unit.text,
      startSeconds,
      endSeconds,
      timingSource: "DURATION_ESTIMATE",
      words: []
    };
  });
}

function matchUnitTokens(
  tokens: SourceWordToken[],
  recognizedWords: RecognizedWordTiming[],
  startIndex: number
): UnitAlignment {
  const matchedWords = new Map<number, RecognizedWordTiming>();
  const windowEnd = Math.min(
    recognizedWords.length,
    startIndex + Math.max(20, tokens.length * 4 + 12)
  );
  let cursor = startIndex;

  for (let tokenIndex = 0; tokenIndex < tokens.length && cursor < windowEnd; tokenIndex += 1) {
    const token = tokens[tokenIndex]!;
    const compoundParts = joinedTokenPartsStartingAt(tokens, tokenIndex);
    const lookaheadEnd = Math.min(windowEnd, cursor + 14);

    for (let recognizedIndex = cursor; recognizedIndex < lookaheadEnd; recognizedIndex += 1) {
      const recognized = recognizedWords[recognizedIndex]!;
      const recognizedText = normalizedWord(recognized.text);

      if (similarWordToken(token.normalized, recognizedText)) {
        matchedWords.set(tokenIndex, recognized);
        cursor = recognizedIndex + 1;
        break;
      }

      const splitWords = compoundParts
        ? splitRecognizedCompoundWord(recognized, compoundParts)
        : null;
      const compoundText = compoundParts
        ?.map((part) => part.normalized.replace(/'/g, ""))
        .join("") ?? "";

      if (
        !splitWords ||
        !similarWordToken(compoundText, recognizedText.replace(/'/g, ""))
      ) {
        continue;
      }

      for (let offset = 0; offset < compoundParts!.length; offset += 1) {
        matchedWords.set(tokenIndex + offset, splitWords[offset]!);
      }
      tokenIndex += compoundParts!.length - 1;
      cursor = recognizedIndex + 1;
      break;
    }
  }

  return { matchedWords, nextRecognizedIndex: cursor };
}

function joinedTokenPartsStartingAt(tokens: SourceWordToken[], startIndex: number) {
  if (!tokens[startIndex + 1]?.joinedToPrevious) return null;
  let endIndex = startIndex + 1;

  while (tokens[endIndex + 1]?.joinedToPrevious) {
    endIndex += 1;
    if (endIndex - startIndex + 1 > 252) return null;
  }

  return tokens.slice(startIndex, endIndex + 1);
}

function interpolateSourceWords(
  tokens: SourceWordToken[],
  matches: Map<number, RecognizedWordTiming>,
  cueStartSeconds: number,
  cueEndSeconds: number
) {
  if (tokens.length === 0) return [];
  if (matches.size === 0) {
    return distributeTokens(tokens, cueStartSeconds, cueEndSeconds);
  }

  const words: Array<EnglishReadAlongWordTiming | null> = tokens.map((token, index) => {
    const match = matches.get(index);
    return match
      ? {
          text: token.text,
          startChar: token.startChar,
          endChar: token.endChar,
          startSeconds: roundSeconds(match.startSeconds),
          endSeconds: roundSeconds(match.endSeconds)
        }
      : null;
  });
  let runStart = 0;

  while (runStart < words.length) {
    if (words[runStart]) {
      runStart += 1;
      continue;
    }

    let runEnd = runStart;
    while (runEnd + 1 < words.length && !words[runEnd + 1]) runEnd += 1;
    const leftBoundary = runStart > 0
      ? words[runStart - 1]!.endSeconds
      : cueStartSeconds;
    const rightBoundary = runEnd + 1 < words.length
      ? words[runEnd + 1]!.startSeconds
      : cueEndSeconds;
    const interpolatedTokenIndexes = Array.from(
      { length: runEnd - runStart + 1 },
      (_value, offset) => runStart + offset
    ).filter((index) => !tokens[index]!.omitWhenUnmatched);
    const distributed = distributeTokens(
      interpolatedTokenIndexes.map((index) => tokens[index]!),
      leftBoundary,
      Math.max(leftBoundary + 0.001, rightBoundary)
    );

    for (let index = 0; index < interpolatedTokenIndexes.length; index += 1) {
      words[interpolatedTokenIndexes[index]!] = distributed[index]!;
    }
    runStart = runEnd + 1;
  }

  return words.filter((word): word is EnglishReadAlongWordTiming => Boolean(word));
}

function distributeSourceWords(text: string, startSeconds: number, endSeconds: number) {
  return distributeTokens(sourceWordTokens(text), startSeconds, endSeconds);
}

function distributeTokens(tokens: SourceWordToken[], startSeconds: number, endSeconds: number) {
  const duration = Math.max(0.001, endSeconds - startSeconds);
  const weights = tokens.map((token) => Math.max(1, token.normalized.length));
  const totalWeight = weights.reduce((total, weight) => total + weight, 0);
  let consumed = 0;

  return tokens.map((token, index): EnglishReadAlongWordTiming => {
    const start = startSeconds + duration * (consumed / totalWeight);
    consumed += weights[index]!;
    const end = index === tokens.length - 1
      ? endSeconds
      : startSeconds + duration * (consumed / totalWeight);

    return {
      text: token.text,
      startChar: token.startChar,
      endChar: token.endChar,
      startSeconds: roundSeconds(start),
      endSeconds: roundSeconds(Math.max(start + 0.001, end))
    };
  });
}

function sourceWordTokens(text: string): SourceWordToken[] {
  const tokens: SourceWordToken[] = [];
  const pattern = /\p{Script=Han}|[A-Za-z0-9]+(?:[.'’][A-Za-z0-9]+)*/gu;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const tokenText = match[0];
    const previous = tokens.at(-1);
    const separator = previous ? text.slice(previous.endChar, match.index) : "";
    tokens.push({
      text: tokenText,
      normalized: normalizedWord(tokenText),
      startChar: match.index,
      endChar: match.index + tokenText.length,
      joinedToPrevious: Boolean(previous && /^[-\p{Pd}]+$/u.test(separator))
    });
  }

  return tokens.filter((token) => token.normalized);
}

function recognizedWordsFromCues(cues: RecognizedSubtitleCue[]) {
  return cues.flatMap((cue) => distributeSourceWords(cue.text, cue.startSeconds, cue.endSeconds)
    .map((word) => ({
      text: word.text,
      startSeconds: word.startSeconds,
      endSeconds: word.endSeconds
    })));
}

function normalizeRecognizedWords(words: RecognizedWordTiming[]) {
  return words
    .flatMap((word) => {
      const text = word.text.trim();
      const tokens = sourceWordTokens(text);

      if (tokens.length <= 1) {
        return [{ ...word, text }];
      }

      const duration = Math.max(0, word.endSeconds - word.startSeconds);
      return tokens.map((token, index) => ({
        text: token.text,
        startSeconds: word.startSeconds + duration * (index / tokens.length),
        endSeconds: word.startSeconds + duration * ((index + 1) / tokens.length)
      }));
    })
    .map((word) => ({
      text: word.text,
      startSeconds: roundSeconds(word.startSeconds),
      endSeconds: roundSeconds(word.endSeconds)
    }))
    .filter((word) =>
      Boolean(normalizedWord(word.text)) &&
      Number.isFinite(word.startSeconds) &&
      Number.isFinite(word.endSeconds) &&
      word.startSeconds >= 0 &&
      word.endSeconds > word.startSeconds
    )
    .sort((left, right) => left.startSeconds - right.startSeconds);
}

function validSourceWordTimings(value: unknown, text: unknown, durationSeconds: number) {
  if (!Array.isArray(value) || typeof text !== "string") return [];

  return value.map((item) => {
    const word = recordValue(item);
    if (
      !word ||
      typeof word.text !== "string" ||
      typeof word.startChar !== "number" ||
      typeof word.endChar !== "number" ||
      typeof word.startSeconds !== "number" ||
      typeof word.endSeconds !== "number" ||
      word.startChar < 0 ||
      word.endChar <= word.startChar ||
      word.endChar > text.length ||
      word.startSeconds < 0 ||
      word.endSeconds <= word.startSeconds ||
      word.endSeconds > durationSeconds + 0.2
    ) {
      return null;
    }

    return {
      text: text.slice(word.startChar, word.endChar),
      startChar: word.startChar,
      endChar: word.endChar,
      startSeconds: roundSeconds(word.startSeconds),
      endSeconds: roundSeconds(Math.min(durationSeconds, word.endSeconds))
    };
  }).filter((word): word is EnglishReadAlongWordTiming => Boolean(word));
}

export function parseSrtCues(srtText: string): RecognizedSubtitleCue[] {
  const normalized = srtText.replace(/\r\n?/g, "\n").trim();

  if (!normalized) {
    return [];
  }

  return normalized
    .split(/\n{2,}/)
    .map((block) => {
      const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
      const timingIndex = lines.findIndex((line) => line.includes("-->"));

      if (timingIndex < 0) {
        return null;
      }

      const [startValue, endValue] = lines[timingIndex]!.split("-->").map((value) => value.trim());
      const startSeconds = parseSrtTimestamp(startValue ?? "");
      const endSeconds = parseSrtTimestamp(endValue ?? "");
      const text = lines.slice(timingIndex + 1).join(" ").trim();

      return validRecognizedCue({ startSeconds, endSeconds, text })
        ? { startSeconds, endSeconds, text }
        : null;
    })
    .filter((cue): cue is RecognizedSubtitleCue => Boolean(cue));
}

export function readAlongCuesToSrt(
  cues: Array<Pick<EnglishReadAlongCue, "endSeconds" | "startSeconds" | "text">>
) {
  return cues.map((cue, index) => [
    String(index + 1),
    `${formatSrtTimestamp(cue.startSeconds)} --> ${formatSrtTimestamp(cue.endSeconds)}`,
    cue.text
  ].join("\n")).join("\n\n");
}

function validRecognizedCue(cue: RecognizedSubtitleCue) {
  return Number.isFinite(cue.startSeconds) &&
    Number.isFinite(cue.endSeconds) &&
    cue.startSeconds >= 0 &&
    cue.endSeconds > cue.startSeconds &&
    Boolean(cue.text.trim());
}

function speechWeight(value: string) {
  const words = value.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g)?.length ?? 0;
  return Math.max(1, words || Array.from(value.replace(/\s+/g, "")).length);
}

function normalizedComparableText(value: string) {
  return value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

function normalizedWord(value: string) {
  return value
    .toLocaleLowerCase()
    .replace(/’/g, "'")
    .replace(/[^\p{L}\p{N}']+/gu, "")
    .replace(/^'+|'+$/g, "");
}

function similarWordToken(left: string, right: string) {
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.replace(/'/g, "") === right.replace(/'/g, "")) return true;
  if (Math.min(left.length, right.length) < 5 || Math.abs(left.length - right.length) > 1) {
    return false;
  }

  return editDistanceAtMostOne(left, right);
}

function editDistanceAtMostOne(left: string, right: string) {
  let leftIndex = 0;
  let rightIndex = 0;
  let differences = 0;

  while (leftIndex < left.length && rightIndex < right.length) {
    if (left[leftIndex] === right[rightIndex]) {
      leftIndex += 1;
      rightIndex += 1;
      continue;
    }

    differences += 1;
    if (differences > 1) return false;

    if (left.length > right.length) leftIndex += 1;
    else if (right.length > left.length) rightIndex += 1;
    else {
      leftIndex += 1;
      rightIndex += 1;
    }
  }

  if (leftIndex < left.length || rightIndex < right.length) differences += 1;
  return differences <= 1;
}

function positiveDurationMs(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("跟读音频缺少有效时长");
  }

  return Math.max(1, Math.round(value));
}

function parseSrtTimestamp(value: string) {
  const match = value.match(/^(\d{1,3}):([0-5]\d):([0-5]\d)[,.](\d{3})$/);

  if (!match) {
    return Number.NaN;
  }

  return Number(match[1]) * 3600 +
    Number(match[2]) * 60 +
    Number(match[3]) +
    Number(match[4]) / 1000;
}

function formatSrtTimestamp(value: number) {
  const totalMs = Math.max(0, Math.round(value * 1000));
  const hours = Math.floor(totalMs / 3_600_000);
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
  const secondsValue = Math.floor((totalMs % 60_000) / 1000);
  const milliseconds = totalMs % 1000;

  return [
    String(hours).padStart(2, "0"),
    String(minutes).padStart(2, "0"),
    `${String(secondsValue).padStart(2, "0")},${String(milliseconds).padStart(3, "0")}`
  ].join(":");
}

function seconds(valueMs: number) {
  return roundSeconds(valueMs / 1000);
}

function roundSeconds(value: number) {
  return Math.round(value * 1000) / 1000;
}

function numericValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function millisecondsToSeconds(value: unknown) {
  const milliseconds = numericValue(value);
  return milliseconds === null ? Number.NaN : milliseconds / 1000;
}

function isEnglishReadAlongTimingSource(value: unknown): value is EnglishReadAlongTimingSource {
  return value === "ASR_WORDS" || value === "ASR_CUE" || value === "DURATION_ESTIMATE";
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}
