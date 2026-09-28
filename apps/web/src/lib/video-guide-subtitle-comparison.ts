export interface SubtitleComparisonRow {
  key: string;
  text: string;
}

export interface SubtitleComparisonDifference {
  confidence: number;
  key: string;
  recognizedText: string;
  referenceText: string;
}

export function compareSubtitleRows(
  rows: SubtitleComparisonRow[],
  referenceSource: string
): SubtitleComparisonDifference[] {
  const referenceText = extractReferenceText(referenceSource);

  if (rows.length === 0 || !referenceText) {
    return [];
  }

  const alignedReferenceTexts = alignReferenceText(
    referenceText,
    rows.map((row) => row.text)
  );

  return rows.flatMap((row, index) => {
    const alignedReferenceText = alignedReferenceTexts[index] ?? "";

    if (!alignedReferenceText || normalizeComparableText(row.text) === normalizeComparableText(alignedReferenceText)) {
      return [];
    }

    return [{
      confidence: textSimilarity(row.text, alignedReferenceText),
      key: row.key,
      recognizedText: row.text,
      referenceText: alignedReferenceText
    }];
  });
}

export function extractReferenceSubtitleSegments(value: string): string[] {
  return splitPlainTextSentences(extractReferenceText(value));
}

function extractReferenceText(value: string) {
  const normalizedValue = value.replace(/\r/g, "").trim();

  if (!normalizedValue) {
    return "";
  }

  const assSegments = normalizedValue
    .split("\n")
    .filter((line) => /^\s*Dialogue:/i.test(line))
    .map((line) => {
      const parts = line.replace(/^\s*Dialogue:\s*/i, "").split(",");

      return parts.length >= 10 ? cleanReferenceText(parts.slice(9).join(",")) : "";
    })
    .filter(Boolean);

  if (assSegments.length > 0) {
    return cleanReferenceText(assSegments.join(" "));
  }

  if (normalizedValue.includes("-->")) {
    const srtSegments = normalizedValue
      .split(/\n{2,}/)
      .map((block) => {
        const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
        const timeIndex = lines.findIndex((line) => line.includes("-->"));

        return timeIndex >= 0 ? cleanReferenceText(lines.slice(timeIndex + 1).join(" ")) : "";
      })
      .filter(Boolean);

    if (srtSegments.length > 0) {
      return cleanReferenceText(srtSegments.join(" "));
    }
  }

  return cleanReferenceText(normalizedValue);
}

function alignReferenceText(referenceText: string, rowTexts: string[]) {
  if (rowTexts.length <= 1) {
    return [referenceText.trim()];
  }

  const sentenceSegments = splitPlainTextSentences(referenceText);

  if (
    sentenceSegments.length === rowTexts.length &&
    rowTexts.every((rowText, index) =>
      normalizeComparableText(rowText) ===
      normalizeComparableText(sentenceSegments[index] ?? "")
    )
  ) {
    return sentenceSegments;
  }

  const tokens = Array.from(referenceText.matchAll(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu));

  if (tokens.length < rowTexts.length) {
    return [referenceText.trim(), ...Array.from({ length: rowTexts.length - 1 }, () => "")];
  }

  const openingQuoteOffsets = collectOpeningQuoteOffsets(referenceText);
  const boundaryOffsets = Array.from({ length: tokens.length + 1 }, (_, index) =>
    resolveReferenceBoundaryOffset(referenceText, tokens, index, openingQuoteOffsets)
  );
  const referenceTokens = tokens.map((token) => token[0].toLocaleLowerCase("en-US"));
  const rowTokens = rowTexts.map((text) => tokenize(text));
  const sentenceBoundaries = collectSentenceTokenBoundaries(referenceText, tokens);
  const recognizedTokens = rowTokens.flat();
  const tokenMatches = alignTokenStreams(recognizedTokens, referenceTokens);
  const referenceBoundaries = estimateReferenceBoundaries(
    rowTokens,
    tokenMatches,
    tokens.length
  );
  const lockedBoundaryIndexes = lockExactRowBoundaries({
    boundaryOffsets,
    boundaries: referenceBoundaries,
    referenceText,
    rowTokens,
    rowTexts,
    referenceTokens,
    sentenceBoundaries
  });

  refineReferenceBoundaries({
    boundaryOffsets,
    lockedBoundaryIndexes,
    referenceBoundaries,
    referenceText,
    rowTexts,
    sentenceBoundaries
  });

  return rowTexts.map((_, index) =>
    referenceText
      .slice(
        boundaryOffsets[referenceBoundaries[index]],
        boundaryOffsets[referenceBoundaries[index + 1]]
      )
      .trim()
  );
}

function collectSentenceTokenBoundaries(
  referenceText: string,
  tokens: RegExpMatchArray[]
) {
  const boundaries: number[] = [];
  let tokenIndex = 0;

  for (const { end } of segmentPlainTextSentences(referenceText)) {
    while (tokenIndex < tokens.length) {
      const token = tokens[tokenIndex];
      const tokenEnd = (token.index ?? 0) + token[0].length;

      if (tokenEnd > end) {
        break;
      }

      tokenIndex += 1;
    }

    if (tokenIndex > 0) {
      boundaries.push(tokenIndex);
    }
  }

  return Array.from(new Set(boundaries));
}

interface TokenMatch {
  recognizedIndex: number;
  referenceIndex: number;
}

interface MatchNode extends TokenMatch {
  previous?: MatchNode;
}

function alignTokenStreams(recognizedTokens: string[], referenceTokens: string[]) {
  const positionsByToken = new Map<string, number[]>();

  referenceTokens.forEach((token, referenceIndex) => {
    const positions = positionsByToken.get(token) ?? [];
    positions.push(referenceIndex);
    positionsByToken.set(token, positions);
  });

  const tailReferenceIndexes: number[] = [];
  const tailNodes: MatchNode[] = [];

  recognizedTokens.forEach((token, recognizedIndex) => {
    const referencePositions = positionsByToken.get(token) ?? [];

    for (let index = referencePositions.length - 1; index >= 0; index -= 1) {
      const referenceIndex = referencePositions[index];
      const tailIndex = lowerBound(tailReferenceIndexes, referenceIndex);
      const node: MatchNode = {
        previous: tailIndex > 0 ? tailNodes[tailIndex - 1] : undefined,
        recognizedIndex,
        referenceIndex
      };

      if (
        tailIndex === tailReferenceIndexes.length ||
        referenceIndex < tailReferenceIndexes[tailIndex]
      ) {
        tailReferenceIndexes[tailIndex] = referenceIndex;
        tailNodes[tailIndex] = node;
      }
    }
  });

  const matches: TokenMatch[] = [];
  let node = tailNodes.at(-1);

  while (node) {
    matches.push({
      recognizedIndex: node.recognizedIndex,
      referenceIndex: node.referenceIndex
    });
    node = node.previous;
  }

  return matches.reverse();
}

function lowerBound(values: number[], target: number) {
  let low = 0;
  let high = values.length;

  while (low < high) {
    const middle = Math.floor((low + high) / 2);

    if (values[middle] < target) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }

  return low;
}

function estimateReferenceBoundaries(
  rowTokens: string[][],
  matches: TokenMatch[],
  referenceTokenCount: number
) {
  const rowStarts = [0];

  rowTokens.forEach((tokens) => {
    rowStarts.push(rowStarts.at(-1)! + tokens.length);
  });

  const boundaries: Array<number | undefined> =
    Array.from({ length: rowTokens.length + 1 }, () => undefined);
  boundaries[0] = 0;
  boundaries[rowTokens.length] = referenceTokenCount;
  let matchIndex = 0;

  for (let rowIndex = 1; rowIndex < rowTokens.length; rowIndex += 1) {
    while (
      matchIndex < matches.length &&
      matches[matchIndex].recognizedIndex < rowStarts[rowIndex]
    ) {
      matchIndex += 1;
    }

    const offsets: number[] = [];
    let rowMatchIndex = matchIndex;

    while (
      rowMatchIndex < matches.length &&
      matches[rowMatchIndex].recognizedIndex < rowStarts[rowIndex + 1]
    ) {
      const match = matches[rowMatchIndex];
      offsets.push(
        match.referenceIndex -
        (match.recognizedIndex - rowStarts[rowIndex])
      );
      rowMatchIndex += 1;
    }

    if (offsets.length > 0) {
      boundaries[rowIndex] = mostFrequentOffset(
        offsets,
        Math.round(referenceTokenCount * rowStarts[rowIndex] / rowStarts.at(-1)!)
      );
    }
  }

  interpolateReferenceBoundaries(boundaries, rowTokens);

  for (let index = 1; index < boundaries.length; index += 1) {
    boundaries[index] = Math.max(boundaries[index]!, boundaries[index - 1]! + 1);
  }
  for (let index = boundaries.length - 2; index > 0; index -= 1) {
    boundaries[index] = Math.min(boundaries[index]!, boundaries[index + 1]! - 1);
  }

  return boundaries as number[];
}

function lockExactRowBoundaries({
  boundaryOffsets,
  boundaries,
  referenceText,
  referenceTokens,
  rowTexts,
  rowTokens,
  sentenceBoundaries
}: {
  boundaryOffsets: number[];
  boundaries: number[];
  referenceText: string;
  referenceTokens: string[];
  rowTexts: string[];
  rowTokens: string[][];
  sentenceBoundaries: number[];
}) {
  const locked = new Set<number>([0, rowTokens.length]);
  const sentenceBoundarySet = new Set(sentenceBoundaries);

  for (let rowIndex = 0; rowIndex < rowTokens.length; rowIndex += 1) {
    if (!locked.has(rowIndex)) {
      break;
    }

    const start = boundaries[rowIndex];
    const tokens = rowTokens[rowIndex];
    const end = start + tokens.length;
    const candidateText = end <= referenceTokens.length
      ? referenceText
        .slice(boundaryOffsets[start], boundaryOffsets[end])
        .trim()
      : "";
    const nextTokens = rowTokens[rowIndex + 1] ?? [];
    const nextAnchorLength = Math.min(2, nextTokens.length);
    const nextAnchor = nextTokens.slice(0, nextAnchorLength);
    const nextRowStartsAtEnd = nextAnchorLength > 0 &&
      nextAnchor
        .every((token, index) => token === referenceTokens[end + index]);
    const nextAnchorRepeatsAfterEnd = nextRowStartsAtEnd &&
      referenceTokens
        .slice(end + 1)
        .some((_, offset) =>
          nextAnchor.every(
            (token, index) => token === referenceTokens[end + 1 + offset + index]
          )
        );
    const hasUnambiguousNextAnchor =
      nextRowStartsAtEnd && !nextAnchorRepeatsAfterEnd;
    const hasReliableEndBoundary =
      end === referenceTokens.length ||
      sentenceBoundarySet.has(end) ||
      hasUnambiguousNextAnchor;
    const textMatches =
      normalizeComparableText(rowTexts[rowIndex]).toLocaleLowerCase("en-US") ===
        normalizeComparableText(candidateText).toLocaleLowerCase("en-US") ||
      (
        hasUnambiguousNextAnchor &&
        normalizeSimilarityText(rowTexts[rowIndex]) ===
          normalizeSimilarityText(candidateText)
      );

    if (
      end > referenceTokens.length ||
      !textMatches ||
      !hasReliableEndBoundary
    ) {
      break;
    }

    boundaries[rowIndex + 1] = end;
    locked.add(rowIndex + 1);
  }

  return locked;
}

function mostFrequentOffset(offsets: number[], expected: number) {
  const counts = new Map<number, number>();

  offsets.forEach((offset) => counts.set(offset, (counts.get(offset) ?? 0) + 1));

  return Array.from(counts.entries()).sort((left, right) =>
    right[1] - left[1] ||
    Math.abs(left[0] - expected) - Math.abs(right[0] - expected)
  )[0][0];
}

function interpolateReferenceBoundaries(
  boundaries: Array<number | undefined>,
  rowTokens: string[][]
) {
  let leftIndex = 0;

  while (leftIndex < boundaries.length - 1) {
    let rightIndex = leftIndex + 1;

    while (boundaries[rightIndex] === undefined) {
      rightIndex += 1;
    }

    const spanWeights = rowTokens
      .slice(leftIndex, rightIndex)
      .map((tokens) => Math.max(1, tokens.length));
    const totalWeight = spanWeights.reduce((sum, weight) => sum + weight, 0);
    let usedWeight = 0;

    for (let index = leftIndex + 1; index < rightIndex; index += 1) {
      usedWeight += spanWeights[index - leftIndex - 1];
      boundaries[index] = Math.round(
        boundaries[leftIndex]! +
        (boundaries[rightIndex]! - boundaries[leftIndex]!) *
        usedWeight /
        totalWeight
      );
    }

    leftIndex = rightIndex;
  }
}

function refineReferenceBoundaries({
  boundaryOffsets,
  lockedBoundaryIndexes,
  referenceBoundaries,
  referenceText,
  rowTexts,
  sentenceBoundaries
}: {
  boundaryOffsets: number[];
  lockedBoundaryIndexes: Set<number>;
  referenceBoundaries: number[];
  referenceText: string;
  rowTexts: string[];
  sentenceBoundaries: number[];
}) {
  const sentenceBoundarySet = new Set(sentenceBoundaries);

  for (let index = 1; index < referenceBoundaries.length - 1; index += 1) {
    if (lockedBoundaryIndexes.has(index)) {
      continue;
    }

    const minimum = referenceBoundaries[index - 1] + 1;
    const maximum = referenceBoundaries[index + 1] - 1;
    const estimated = referenceBoundaries[index];
    const candidates = new Set<number>();

    for (
      let candidate = Math.max(minimum, estimated - 4);
      candidate <= Math.min(maximum, estimated + 4);
      candidate += 1
    ) {
      candidates.add(candidate);
    }
    sentenceBoundaries
      .filter(
        (boundary) =>
          boundary >= minimum &&
          boundary <= maximum &&
          Math.abs(boundary - estimated) <= 12
      )
      .forEach((boundary) => candidates.add(boundary));

    let bestBoundary = estimated;
    let bestScore = Number.NEGATIVE_INFINITY;

    candidates.forEach((candidate) => {
      const left = referenceText
        .slice(
          boundaryOffsets[referenceBoundaries[index - 1]],
          boundaryOffsets[candidate]
        )
        .trim();
      const right = referenceText
        .slice(
          boundaryOffsets[candidate],
          boundaryOffsets[referenceBoundaries[index + 1]]
        )
        .trim();
      const score =
        textSimilarity(rowTexts[index - 1], left) +
        textSimilarity(rowTexts[index], right) +
        (
          sentenceBoundarySet.has(candidate)
            ? endsSentence(rowTexts[index - 1]) ? 0.75 : 0.15
            : 0
        ) +
        (candidate === estimated ? 0.1 : 0);

      if (score > bestScore) {
        bestScore = score;
        bestBoundary = candidate;
      }
    });

    referenceBoundaries[index] = bestBoundary;
  }
}

function resolveReferenceBoundaryOffset(
  referenceText: string,
  tokens: RegExpMatchArray[],
  index: number,
  openingQuoteOffsets: Set<number>
) {
  if (index <= 0) {
    return 0;
  }

  if (index >= tokens.length) {
    return referenceText.length;
  }

  const leftToken = tokens[index - 1];
  const rightToken = tokens[index];
  const leftEnd = (leftToken.index ?? 0) + leftToken[0].length;
  const rightStart = rightToken.index ?? referenceText.length;
  const gap = referenceText.slice(leftEnd, rightStart);

  for (let gapIndex = 0; gapIndex < gap.length; gapIndex += 1) {
    const character = gap[gapIndex];
    const absoluteOffset = leftEnd + gapIndex;

    if (
      /[([{\u2014-]/.test(character) ||
      openingQuoteOffsets.has(absoluteOffset)
    ) {
      return absoluteOffset;
    }
  }

  return rightStart;
}

function collectOpeningQuoteOffsets(value: string) {
  const offsets = new Set<number>();
  let doubleQuoteIsOpen = false;
  let singleQuoteIsOpen = false;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];

    if (character === "“" || character === "‘") {
      offsets.add(index);
      continue;
    }

    if (character === "\"") {
      if (!doubleQuoteIsOpen) {
        offsets.add(index);
      }
      doubleQuoteIsOpen = !doubleQuoteIsOpen;
      continue;
    }

    if (character === "'") {
      const isApostrophe = /[\p{L}\p{N}]/u.test(value[index - 1] ?? "") &&
        /[\p{L}\p{N}]/u.test(value[index + 1] ?? "");

      if (!isApostrophe) {
        if (!singleQuoteIsOpen) {
          offsets.add(index);
        }
        singleQuoteIsOpen = !singleQuoteIsOpen;
      }
    }
  }

  return offsets;
}

function splitPlainTextSentences(value: string) {
  return segmentPlainTextSentences(value).map(({ text }) => text);
}

function segmentPlainTextSentences(value: string) {
  const text = value.trim();

  if (!text) {
    return [];
  }

  const preparedText = text
    .replace(/\b([A-Za-z]\.)\s+(?=[A-Za-z]\.)/g, "$1\u2060")
    .replace(/\b(U\.\u2060?S\.)\s+(?=Constitution\b)/gi, "$1\u2060");

  return Array.from(
    new Intl.Segmenter("en", { granularity: "sentence" }).segment(preparedText),
    ({ index, segment }) => ({
      end: index + segment.length,
      text: segment.replaceAll("\u2060", " ").trim()
    })
  ).filter(({ text }) => Boolean(text));
}

function endsSentence(value: string) {
  return /[.!?](?:["'”’])?$/.test(value.trim());
}

function cleanReferenceText(value: string) {
  return value
    .replace(/\{[^}]*\}/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\\[Nn]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeComparableText(value: string) {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim();
}

function normalizeSimilarityText(value: string) {
  return normalizeComparableText(value)
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function textSimilarity(left: string, right: string) {
  const leftText = normalizeSimilarityText(left);
  const rightText = normalizeSimilarityText(right);

  if (leftText === rightText) {
    return 1;
  }

  if (!leftText || !rightText) {
    return 0;
  }

  const leftBigrams = bigramCounts(leftText);
  const rightBigrams = bigramCounts(rightText);
  let overlap = 0;

  leftBigrams.forEach((count, bigram) => {
    overlap += Math.min(count, rightBigrams.get(bigram) ?? 0);
  });

  const bigramTotal =
    Array.from(leftBigrams.values()).reduce((sum, count) => sum + count, 0) +
    Array.from(rightBigrams.values()).reduce((sum, count) => sum + count, 0);
  const bigramScore = bigramTotal > 0 ? 2 * overlap / bigramTotal : 0;
  const leftTokens = new Set(tokenize(left));
  const rightTokens = new Set(tokenize(right));
  const sharedTokens = Array.from(leftTokens).filter((token) => rightTokens.has(token)).length;
  const tokenScore = leftTokens.size + rightTokens.size > 0
    ? 2 * sharedTokens / (leftTokens.size + rightTokens.size)
    : 0;

  return Math.max(0, Math.min(1, bigramScore * 0.75 + tokenScore * 0.25));
}

function tokenize(value: string) {
  return normalizeComparableText(value)
    .toLocaleLowerCase("en-US")
    .match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) ?? [];
}

function bigramCounts(value: string) {
  const counts = new Map<string, number>();
  const source = value.length === 1 ? `${value} ` : value;

  for (let index = 0; index < source.length - 1; index += 1) {
    const bigram = source.slice(index, index + 2);
    counts.set(bigram, (counts.get(bigram) ?? 0) + 1);
  }

  return counts;
}
