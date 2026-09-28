import { HttpStatus } from "@nestjs/common";
import { AppException } from "../common/app-exception.js";

export type EnglishNarrationNodeType = "INTRO" | "SENTENCE" | "SUMMARY";
export type EnglishNarrationChunkType =
  | "INTRO"
  | "CONTEXT"
  | "WORD"
  | "PHRASE"
  | "GRAMMAR"
  | "TRANSLATION"
  | "SUMMARY";

export interface EnglishNarrationNodeDraft {
  id: string;
  type: EnglishNarrationNodeType;
  sentenceId: string | null;
  chunkType: EnglishNarrationChunkType;
  script: string;
  focus: {
    pointId: string | null;
    text: string;
  } | null;
}

export interface EnglishNarrationNode extends EnglishNarrationNodeDraft {
  audioTaskId: string;
  audioUrl: string;
  durationMs: number;
}

interface SourcePoint {
  id: string;
  term: string;
  meaning?: string;
}

interface SourceSentence {
  id: string;
  text: string;
  script?: string;
  points: SourcePoint[];
}

const maxSpeechChunkLength = 1_000;
const sentenceChunkTypes = new Set<EnglishNarrationChunkType>([
  "CONTEXT",
  "WORD",
  "PHRASE",
  "GRAMMAR",
  "TRANSLATION"
]);

export function buildEnglishNarrationNodeDrafts(
  introScript: string,
  sourceSentences: Array<SourceSentence & { script: string }>,
  summaryScript: string
): EnglishNarrationNodeDraft[] {
  const nodes: EnglishNarrationNodeDraft[] = [];

  splitScriptVerbatim(introScript).forEach((script, index) => {
    nodes.push({
      id: index === 0 ? "intro" : `intro-c${index + 1}`,
      type: "INTRO",
      sentenceId: null,
      chunkType: "INTRO",
      script,
      focus: null
    });
  });

  for (const sentence of sourceSentences) {
    splitSentenceScriptByTeachingPoints(sentence.script, sentence.points, sentence.text).forEach(
      ({ script, focus }, index) => {
        nodes.push({
          id: `${sentence.id}-c${index + 1}`,
          type: "SENTENCE",
          sentenceId: sentence.id,
          chunkType: focus
            ? /\s/.test(focus.text) ? "PHRASE" : "WORD"
            : "CONTEXT",
          script,
          focus
        });
      }
    );
  }

  splitScriptVerbatim(summaryScript).forEach((script, index) => {
    nodes.push({
      id: index === 0 ? "summary" : `summary-c${index + 1}`,
      type: "SUMMARY",
      sentenceId: null,
      chunkType: "SUMMARY",
      script,
      focus: null
    });
  });

  if (nodes.length === 0) {
    throw nodeParseException("带学材料缺少可合成的确认文稿");
  }

  return nodes;
}

export function buildReadingGuideNarrationNodeDrafts(script: string): EnglishNarrationNodeDraft[] {
  const paragraphs = splitReadingGuideParagraphs(script);

  if (paragraphs.length === 0) {
    throw nodeParseException("导读文稿不能为空");
  }

  return paragraphs.flatMap((paragraph, paragraphIndex) => {
    const paragraphId = `reading-guide-p${paragraphIndex + 1}`;

    return splitScriptVerbatim(paragraph).map((chunk, chunkIndex) => ({
      id: chunkIndex === 0 ? paragraphId : `${paragraphId}-c${chunkIndex + 1}`,
      type: "SENTENCE" as const,
      sentenceId: paragraphId,
      chunkType: "CONTEXT" as const,
      script: chunk,
      focus: null
    }));
  });
}

export function splitReadingGuideParagraphs(script: string) {
  return script
    .replace(/\r\n?/gu, "\n")
    .trim()
    .split(/\n\s*\n+/gu)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

export function englishNarrationPointsFollowScript(
  script: string,
  points: SourcePoint[],
  sourceText?: string
) {
  const occurrences = teachingPointOccurrences(script, points, sourceText);
  return points.length > 0 && occurrences.length === points.length && occurrences.every(
    (occurrence, index) => occurrence.point === points[index] &&
      (!sourceText || occurrence.isTeachingOccurrence)
  );
}

export function englishNarrationPointValidationIssues(
  script: string,
  points: SourcePoint[],
  sourceText?: string
) {
  const duplicatePointIds = Array.from(new Set(
    points
      .map((point) => point.id)
      .filter((id, index, ids) => ids.indexOf(id) !== index)
  ));
  const occurrences = duplicatePointIds.length > 0
    ? []
    : teachingPointOccurrences(script, points, sourceText);
  const resolvedPoints = new Set(
    occurrences
      .filter((occurrence) => !sourceText || occurrence.isTeachingOccurrence)
      .map((occurrence) => occurrence.point)
  );
  const unresolvedPointTerms = duplicatePointIds.length > 0
    ? []
    : points
        .filter((point) => !resolvedPoints.has(point))
        .map((point) => point.term);

  return {
    duplicatePointIds,
    unresolvedPointTerms,
    valid: points.length > 0 &&
      duplicatePointIds.length === 0 &&
      occurrences.length === points.length &&
      unresolvedPointTerms.length === 0
  };
}

export function orderEnglishNarrationPointsByScript<T extends SourcePoint>(
  script: string,
  points: T[],
  sourceText?: string
) {
  const alignedPoints = alignEnglishNarrationPointsToScript(script, points, sourceText);

  if (
    points.length === 0 ||
    alignedPoints.length !== points.length
  ) {
    return null;
  }

  return alignedPoints;
}

export function alignEnglishNarrationPointsToScript<T extends SourcePoint>(
  script: string,
  points: T[],
  sourceText?: string
) {
  const sourcePoints = sourceText
    ? points.filter((point) => {
        const normalizedTerm = normalizeForTermMatch(point.term);

        return normalizedTerm.length > 0 &&
          normalizeForTermMatch(sourceText).includes(normalizedTerm);
      })
    : points;

  return teachingPointOccurrences(script, sourcePoints, sourceText)
    .filter((occurrence) => !sourceText || occurrence.isTeachingOccurrence)
    .map((occurrence) => occurrence.point);
}

export function replaceEnglishNarrationTargetNodes(
  existing: EnglishNarrationNode[],
  replacement: EnglishNarrationNode[],
  target: {
    sentenceId?: string | null;
    targetType: EnglishNarrationNodeType;
  }
) {
  const matches = (node: EnglishNarrationNode) => target.targetType === "SENTENCE"
    ? node.type === "SENTENCE" && node.sentenceId === target.sentenceId
    : node.type === target.targetType;

  if (!existing.some(matches) || replacement.length === 0 || replacement.some((node) => !matches(node))) {
    throw new AppException(40001, "当前文稿对应的讲解语音节点无效", HttpStatus.BAD_REQUEST);
  }

  const merged: EnglishNarrationNode[] = [];
  let inserted = false;

  for (const node of existing) {
    if (!matches(node)) {
      merged.push(node);
      continue;
    }

    if (!inserted) {
      merged.push(...replacement);
      inserted = true;
    }
  }

  return merged;
}

export function parseEnglishNarrationNodeDrafts(
  aiText: string,
  sourceSentences: SourceSentence[]
): EnglishNarrationNodeDraft[] {
  const payload = parsePayload(aiText);
  const introScript = nestedScript(payload.intro);
  const summaryScript = nestedScript(payload.summary);

  if (!introScript || !summaryScript) {
    throw nodeParseException("AI 节点文稿缺少导入或总结");
  }

  const rawSentences = Array.isArray(payload.sentences) ? payload.sentences : [];
  const bySentenceId = new Map<string, Record<string, unknown>>();

  for (const value of rawSentences) {
    const item = recordValue(value);
    const sentenceId = stringValue(item?.sentenceId);

    if (!item || !sentenceId || bySentenceId.has(sentenceId)) {
      throw nodeParseException("AI 节点文稿包含无效或重复的句子编号");
    }

    bySentenceId.set(sentenceId, item);
  }

  if (bySentenceId.size !== sourceSentences.length || sourceSentences.some((sentence) => !bySentenceId.has(sentence.id))) {
    throw nodeParseException("AI 节点文稿未完整覆盖全文句子");
  }

  const nodes: EnglishNarrationNodeDraft[] = [
    {
      id: "intro",
      type: "INTRO",
      sentenceId: null,
      chunkType: "INTRO",
      script: introScript,
      focus: null
    }
  ];

  for (const sentence of sourceSentences) {
    const item = bySentenceId.get(sentence.id);
    const rawChunks = Array.isArray(item?.chunks) ? item.chunks : [];

    if (rawChunks.length < 1 || rawChunks.length > 4) {
      throw nodeParseException(`句子 ${sentence.id} 必须生成 1 到 4 个教学节点`);
    }

    const pointById = new Map(sentence.points.map((point) => [point.id, point]));

    rawChunks.forEach((value, index) => {
      const chunk = recordValue(value);
      const chunkType = stringValue(chunk?.type)?.toUpperCase() as EnglishNarrationChunkType | undefined;
      const script = stringValue(chunk?.script);
      const focusPointId = nullableStringValue(chunk?.focusPointId);

      if (!chunk || !chunkType || !sentenceChunkTypes.has(chunkType) || !script) {
        throw nodeParseException(`句子 ${sentence.id} 包含无效教学节点`);
      }

      const point = focusPointId ? pointById.get(focusPointId) : null;

      if (focusPointId && !point) {
        throw nodeParseException(`句子 ${sentence.id} 引用了不属于当前句子的词语点`);
      }

      nodes.push({
        id: `${sentence.id}-c${index + 1}`,
        type: "SENTENCE",
        sentenceId: sentence.id,
        chunkType,
        script: script.slice(0, 4000),
        focus: point
          ? {
              pointId: point.id,
              text: point.term
            }
          : null
      });
    });
  }

  nodes.push({
    id: "summary",
    type: "SUMMARY",
    sentenceId: null,
    chunkType: "SUMMARY",
    script: summaryScript,
    focus: null
  });

  return nodes;
}

function splitScriptVerbatim(script: string) {
  if (!script.trim()) {
    return [];
  }

  const chunks: string[] = [];
  let start = 0;

  while (start < script.length) {
    let end = Math.min(script.length, start + maxSpeechChunkLength);

    if (end < script.length) {
      const minimumBoundary = start + Math.floor(maxSpeechChunkLength * 0.55);
      let boundary = -1;

      for (let index = end - 1; index >= minimumBoundary; index -= 1) {
        if (/[。！？.!?\n]/.test(script[index] ?? "")) {
          boundary = index + 1;
          break;
        }
      }

      if (boundary < 0) {
        for (let index = end - 1; index >= minimumBoundary; index -= 1) {
          if (/\s/.test(script[index] ?? "")) {
            boundary = index + 1;
            break;
          }
        }
      }

      if (boundary > start) {
        end = boundary;
      }
    }

    chunks.push(script.slice(start, end));
    start = end;
  }

  return chunks;
}

function splitSentenceScriptByTeachingPoints(
  script: string,
  points: SourcePoint[],
  sourceText: string
) {
  const occurrences = teachingPointOccurrences(script, points, sourceText);
  const sourceReadingRanges = teachingSourceReadingRanges(
    normalizeForTermMatch(script),
    sourceText,
    points
  );

  if (occurrences.length === 0) {
    return focusedScriptChunks(script, null);
  }

  const chunks: ReturnType<typeof focusedScriptChunks> = [];
  let cursor = 0;

  occurrences.forEach((occurrence, index) => {
    const previousOccurrence = occurrences[index - 1];
    const minimum = previousOccurrence
      ? previousOccurrence.index + previousOccurrence.matchLength
      : 0;
    const sourceReadingBoundary = index === 0
      ? sourceReadingBoundaryBefore(script, sourceReadingRanges, occurrence.index)
      : null;
    const boundary = sourceReadingBoundary ??
      focusBoundaryBefore(script, occurrence.index, minimum, index === 0);
    const start = Math.max(minimum, boundary ?? (index === 0 ? 0 : occurrence.index));
    const previousFocus = previousOccurrence
      ? { pointId: previousOccurrence.point.id, text: previousOccurrence.point.term }
      : null;

    if (start > cursor) {
      chunks.push(...focusedScriptChunks(script.slice(cursor, start), previousFocus));
    }

    cursor = start;
  });

  const last = occurrences.at(-1)!;
  chunks.push(...focusedScriptChunks(script.slice(cursor), {
    pointId: last.point.id,
    text: last.point.term
  }));

  return chunks;
}

function focusedScriptChunks(script: string, focus: EnglishNarrationNodeDraft["focus"]) {
  return splitScriptVerbatim(script).map((chunk) => ({ script: chunk, focus }));
}

function teachingPointOccurrences<T extends SourcePoint>(script: string, points: T[], sourceText?: string) {
  if (new Set(points.map((point) => point.id)).size !== points.length) {
    return [];
  }

  const normalizedScript = normalizeForTermMatch(script);
  const sourceReadingRanges = teachingSourceReadingRanges(normalizedScript, sourceText, points);
  const allPointRanges = points.flatMap((point, pointIndex) => {
    const normalizedTerm = normalizeForTermMatch(point.term);

    if (!normalizedTerm) {
      return [];
    }

    return termIndexes(normalizedScript, normalizedTerm).map((index) => ({
      pointIndex,
      start: index,
      end: index + normalizedTerm.length
    }));
  });

  return points.flatMap((point, pointIndex) => {
    const normalizedTerm = normalizeForTermMatch(point.term);

    if (!normalizedTerm) {
      return [];
    }

    const indexes = termIndexes(normalizedScript, normalizedTerm);

    const explanationPattern =
      /意思|意为|表示|指的是|指向|就是|是说|不是|读作|念作|写出|写的是|写|描绘|形容|可以理解|在这里|在原句|means?|refers?|describes?|used here/iu;
    const signalDistance = (candidate: number) => {
      if (isTermTeachingAnchor(normalizedScript, candidate, normalizedTerm.length)) {
        return -1;
      }

      const distance = normalizedScript
        .slice(candidate + normalizedTerm.length, candidate + normalizedTerm.length + 50)
        .search(explanationPattern);
      return distance < 0 ? Number.POSITIVE_INFINITY : distance;
    };
    let candidates = indexes.map((index) => {
      const end = index + normalizedTerm.length;
      const insideSourceReading = sourceReadingRanges.some(
        (range) => index >= range.start && end <= range.end
      );
      const groupedWithAnotherPoint = allPointRanges.some((range) => {
        if (range.pointIndex === pointIndex) {
          return false;
        }

        const gap = range.start >= end
          ? range.start - end
          : index >= range.end
            ? index - range.end
            : 0;
        return gap <= 2;
      });

      return {
        index,
        matchLength: normalizedTerm.length,
        isTeachingOccurrence: !insideSourceReading &&
          (!groupedWithAnotherPoint || Number.isFinite(signalDistance(index)))
      };
    });

    const fragmentCandidate = teachingTermFragmentCandidate(
      normalizedScript,
      normalizedTerm,
      sourceReadingRanges
    );

    if (fragmentCandidate) {
      candidates = [...candidates, fragmentCandidate];
    }

    const clauseCandidate = teachingCompoundClauseCandidate(
      normalizedScript,
      normalizedTerm,
      sourceReadingRanges
    );
    const meaningCandidate = teachingMeaningCandidate(
      normalizedScript,
      normalizeForTermMatch(point.meaning ?? ""),
      sourceReadingRanges
    );
    const referenceCandidate = points.length === 1
      ? teachingReferenceCandidate(normalizedScript, indexes, sourceReadingRanges)
      : null;

    if (clauseCandidate) candidates = [...candidates, clauseCandidate];
    if (meaningCandidate) candidates = [...candidates, meaningCandidate];
    if (referenceCandidate) candidates = [...candidates, referenceCandidate];
    if (candidates.length === 0) return [];

    const preferredCandidates = candidates.some((candidate) => candidate.isTeachingOccurrence)
      ? candidates.filter((candidate) => candidate.isTeachingOccurrence)
      : candidates.some((candidate) => !sourceReadingRanges.some(
          (range) => candidate.index >= range.start &&
            candidate.index + candidate.matchLength <= range.end
        ))
        ? candidates.filter((candidate) => !sourceReadingRanges.some(
            (range) => candidate.index >= range.start &&
              candidate.index + candidate.matchLength <= range.end
          ))
        : candidates;
    const candidateScore = (candidate: typeof preferredCandidates[number]) => {
      if (
        candidate.matchLength === normalizedTerm.length &&
        isTermTeachingAnchor(normalizedScript, candidate.index, candidate.matchLength)
      ) {
        return -4;
      }

      if (
        candidate === fragmentCandidate ||
        candidate === clauseCandidate ||
        candidate === referenceCandidate
      ) {
        return -3;
      }

      if (candidate === meaningCandidate) {
        return -2;
      }

      return signalDistance(candidate.index);
    };
    const selected = preferredCandidates.reduce((best, candidate) =>
      candidateScore(candidate) < candidateScore(best) ||
      candidateScore(candidate) === candidateScore(best) && candidate.index < best.index
        ? candidate
        : best
    );

    return [{ point, ...selected }];
  })
    .sort((left, right) => left.index - right.index || right.point.term.length - left.point.term.length)
    .filter((occurrence, index, sorted) => {
      const previous = sorted[index - 1];
      return !previous || occurrence.index >= previous.index + previous.matchLength;
    });
}

function teachingTermFragmentCandidate(
  script: string,
  term: string,
  sourceReadingRanges: Array<{ start: number; end: number }>
) {
  const fragments = Array.from(new Set(
    Array.from(term).filter((value) => /[\p{Script=Han}]/u.test(value))
  ));

  if (fragments.length < 2) {
    return null;
  }

  const candidatesByFragment = fragments.map((fragment) =>
    termIndexes(script, fragment)
      .filter((index) => !sourceReadingRanges.some(
        (range) => index >= range.start && index + fragment.length <= range.end
      ))
      .filter((index) => isTermTeachingAnchor(script, index, fragment.length))
      .map((index) => ({ index, matchLength: fragment.length, isTeachingOccurrence: true }))
  );

  const firstAnchoredFragment = candidatesByFragment.findIndex((candidates) => candidates.length > 0);

  if (firstAnchoredFragment < 0) {
    if (!/[不无未莫弗]/u.test(fragments[0] ?? "")) return null;

    const start = termIndexes(script, fragments[0]!).find((index) =>
      !sourceReadingRanges.some((range) => index >= range.start && index + 1 <= range.end)
    );
    const end = start === undefined ? undefined : termIndexes(script, fragments.at(-1)!).find((index) => {
      const bridge = script.slice(start + 1, index).replace(/['\s]/gu, "");

      return index > start && index - start <= 10 &&
        !sourceReadingRanges.some((range) => index >= range.start && index + 1 <= range.end) &&
        /^(?:再)?(?:会|感到|觉得|感觉)?(?:迷|困)?$/u.test(bridge);
    });

    return start === undefined || end === undefined
      ? null
      : { index: start, matchLength: end - start + 1, isTeachingOccurrence: true };
  }

  const anchor = candidatesByFragment[firstAnchoredFragment]![0]!;
  const hasEveryFragment = candidatesByFragment.every((candidates, fragmentIndex) =>
    candidates.length > 0 || fragmentIndex < firstAnchoredFragment &&
      /[不无未莫弗]/u.test(fragments[fragmentIndex]!) && termIndexes(script, fragments[fragmentIndex]!)
      .some((index) => index < anchor.index && anchor.index - index <= 10 &&
        !/[，,；;。！？!?：:\n]/u.test(script.slice(index, anchor.index)))
  );

  if (!hasEveryFragment) {
    return null;
  }

  return candidatesByFragment.flat().sort((left, right) => left.index - right.index)[0]!;
}

function isTermTeachingAnchor(script: string, index: number, matchLength: number) {
  const before = script.slice(Math.max(0, index - 8), index);
  const after = script.slice(index + matchLength, index + matchLength + 24);
  const quoted = before.endsWith("'") && after.startsWith("'");
  const introduced = /(?:这里的|这个|所谓|[，,；;。！？!?：:\n\s])$/u.test(before);

  if (!quoted && !introduced) {
    return false;
  }

  const suffix = quoted ? after.slice(1) : after;
  return /^(?:字)?(?:的)?[，,:：\s]*(?:(?:它)?(?:的)?(?:意思|含义)[，,:：\s]*)?(?:是|为|指|表示|通|读作|念作|就是|也就是|不仅(?:仅)?是|不只是|还有|在这里(?:解释为|是|通|指))/u.test(suffix);
}

function teachingCompoundClauseCandidate(
  script: string,
  term: string,
  sourceReadingRanges: Array<{ start: number; end: number }>
) {
  const clauses = term.split(/[，,；;。！？!?：:]/u).map((value) => value.trim()).filter((value) => value.length >= 2);
  if (clauses.length < 2) return null;

  const matches = clauses.map((clause) => termIndexes(script, clause).find((index) =>
    !sourceReadingRanges.some((range) => index >= range.start && index + clause.length <= range.end)
  ));
  if (matches.some((index) => index === undefined)) return null;

  const indexes = matches as number[];
  if (Math.max(...indexes) - Math.min(...indexes) > 100) return null;
  return { index: Math.min(...indexes), matchLength: clauses[0]!.length, isTeachingOccurrence: true };
}

function teachingMeaningCandidate(
  script: string,
  meaning: string,
  sourceReadingRanges: Array<{ start: number; end: number }>
) {
  const bigrams = Array.from(new Set(meaning.split(/[，,；;。！？!?：:\s]/u).flatMap((clause) =>
    Array.from({ length: Math.max(0, clause.length - 1) }, (_, index) => clause.slice(index, index + 2))
      .filter((value) => /^[\p{Script=Han}]{2}$/u.test(value))
  )));
  if (bigrams.length < 4) return null;

  const matches = bigrams.flatMap((bigram) => {
    const index = termIndexes(script, bigram).find((candidate) => !sourceReadingRanges.some(
      (range) => candidate >= range.start && candidate + bigram.length <= range.end
    ));
    return index === undefined ? [] : [index];
  });
  const required = Math.max(3, Math.ceil(bigrams.length * 0.4));
  if (matches.length < required || Math.max(...matches) - Math.min(...matches) > 100) return null;
  return { index: Math.min(...matches), matchLength: 2, isTeachingOccurrence: true };
}

function teachingReferenceCandidate(
  script: string,
  termOccurrences: number[],
  sourceReadingRanges: Array<{ start: number; end: number }>
) {
  for (const range of sourceReadingRanges) {
    if (!termOccurrences.some((index) => index >= range.start && index < range.end)) {
      continue;
    }

    const tail = script.slice(range.end, range.end + 30);
    const match = tail.match(
      /^[\s，,；;。！？!?：:'）)】」』]*((?:这里(?:(?:的)?(?:意思|含义)(?:是|指|表示|就是|也就是)|(?:指|表示|就是|也就是))|这(?:个|句话|一词)?(?:的)?(?:意思|含义)(?:是|指|表示|就是|也就是)))/u
    );

    if (match?.[1]) {
      return {
        index: range.end + match[0].indexOf(match[1]),
        matchLength: match[1].length,
        isTeachingOccurrence: true
      };
    }
  }

  return null;
}

function termIndexes(script: string, term: string) {
  const indexes: number[] = [];
  let cursor = 0;

  while (cursor < script.length) {
    const index = script.indexOf(term, cursor);

    if (index < 0) {
      break;
    }

    indexes.push(index);
    cursor = index + Math.max(1, term.length);
  }

  return indexes;
}

function teachingSourceReadingRanges(script: string, sourceText: string | undefined, points: SourcePoint[]) {
  if (!sourceText?.trim()) {
    return [];
  }

  const normalizedSource = normalizeForTermMatch(sourceText);
  const pointTerms = new Set(points.map((point) => normalizeForTermMatch(point.term)));
  const variants = new Set<string>();
  const cueRequiredVariants = new Set<string>();
  const addVariant = (value: string, requiresReadingCue = false) => {
    if (value.length < (requiresReadingCue ? 1 : 4)) {
      return;
    }

    if (requiresReadingCue || pointTerms.has(value)) {
      cueRequiredVariants.add(value);
    } else {
      variants.add(value);
    }
  };
  const trimmedSource = normalizedSource.replace(/^[\s“”‘’"']+|[\s，,；;。！？!?：:“”‘’"']+$/gu, "");

  addVariant(trimmedSource);
  const attributionBoundary = normalizedSource.search(/[：:]/u);

  if (attributionBoundary >= 0) {
    addVariant(normalizedSource.slice(attributionBoundary + 1)
      .replace(/^[\s']+|[\s，,；;。！？!?：:']+$/gu, ""));
  }

  normalizedSource.split(/[，,；;。！？!?：:]/u).forEach((value) => {
    const clause = value.trim();
    const containedPoints = points.filter((point) =>
      clause.includes(normalizeForTermMatch(point.term))
    );

    if (containedPoints.length >= 1) {
      addVariant(clause, true);
    }
  });

  const sourceClauses = normalizedSource
    .split(/[，,；;。！？!?：:]/u)
    .map((value) => value.replace(/^[\s']+|[\s']+$/gu, ""))
    .filter((value) => value.length >= 1);
  const leadingClauseRanges: Array<{ start: number; end: number }> = [];
  let leadingCursor = script.search(/\S/u);

  for (const clause of sourceClauses) {
    if (leadingCursor < 0 || !script.startsWith(clause, leadingCursor)) {
      break;
    }

    leadingClauseRanges.push({ start: leadingCursor, end: leadingCursor + clause.length });
    leadingCursor += clause.length;

    while (/[\s，,；;。！？!?：:'（）()【】「」『』]/u.test(script[leadingCursor] ?? "")) {
      leadingCursor += 1;
    }
  }

  return [
    ...(leadingClauseRanges.length >= 2 ? leadingClauseRanges : []),
    ...Array.from(variants).flatMap((variant) =>
      termIndexes(script, variant).map((start) => ({ start, end: start + variant.length }))
    ),
    ...Array.from(cueRequiredVariants).flatMap((variant) =>
      termIndexes(script, variant)
        .filter((start) => hasReadingCueBefore(script, start))
        .map((start) => ({ start, end: start + variant.length }))
    )
  ];
}

function hasReadingCueBefore(script: string, occurrenceIndex: number) {
  const recentBoundary = Math.max(
    script.lastIndexOf("。", occurrenceIndex - 1),
    script.lastIndexOf("！", occurrenceIndex - 1),
    script.lastIndexOf("？", occurrenceIndex - 1),
    script.lastIndexOf("；", occurrenceIndex - 1),
    script.lastIndexOf(";", occurrenceIndex - 1),
    script.lastIndexOf("\n", occurrenceIndex - 1)
  );
  const prefix = script.slice(Math.max(recentBoundary + 1, occurrenceIndex - 24), occurrenceIndex);

  if (/读懂|听懂|原句中|原句里/u.test(prefix)) {
    return false;
  }

  const action = prefix.match(
    /(?:朗读|读|念|听)([^，,。！？!?；;\n]{0,16})[：:“”‘’"'\s]*$/u
  );
  const complement = action?.[1] ?? "";

  return Boolean(action) && !/懂|理解|意思|含义|作用|情感|原句中|原句里/u.test(complement);
}

function sourceReadingBoundaryBefore(
  script: string,
  ranges: Array<{ start: number; end: number }>,
  occurrenceIndex: number
) {
  const range = ranges
    .filter((candidate) => candidate.end <= occurrenceIndex)
    .sort((left, right) => right.end - left.end)[0];

  if (!range) {
    return null;
  }

  let boundary = range.end;

  while (
    boundary < occurrenceIndex &&
    /[\s，,；;。！？!?：:”’"'）)】」』]/u.test(script[boundary] ?? "")
  ) {
    boundary += 1;
  }

  return boundary;
}

function focusBoundaryBefore(script: string, occurrenceIndex: number, minimum: number, strongOnly: boolean) {
  const boundaryPattern = strongOnly ? /[。！？.!?\n]/u : /[。！？.!?；;，,:：\n]/u;

  for (let index = occurrenceIndex - 1; index >= minimum; index -= 1) {
    if (!boundaryPattern.test(script[index] ?? "")) {
      continue;
    }

    let boundary = index + 1;

    while (boundary < occurrenceIndex && /[”’"'）)】」』]/u.test(script[boundary] ?? "")) {
      boundary += 1;
    }

    while (boundary < occurrenceIndex && /\s/u.test(script[boundary] ?? "")) {
      boundary += 1;
    }

    return boundary;
  }

  return null;
}

function normalizeForTermMatch(value: string) {
  return value
    .toLocaleLowerCase("en-US")
    .replace(/[“”‘’"']/gu, "'");
}

function parsePayload(value: string) {
  const trimmed = value.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() ?? trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");

  if (start < 0 || end <= start) {
    throw nodeParseException("AI 未返回有效节点 JSON");
  }

  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1));
    const payload = recordValue(parsed);

    if (!payload) throw new Error("not object");
    return payload;
  } catch {
    throw nodeParseException("AI 未返回有效节点 JSON");
  }
}

function nestedScript(value: unknown) {
  return stringValue(recordValue(value)?.script);
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function nullableStringValue(value: unknown) {
  return value === null || value === undefined ? null : stringValue(value);
}

function nodeParseException(detail: string) {
  return new AppException(50201, detail, HttpStatus.BAD_GATEWAY);
}
