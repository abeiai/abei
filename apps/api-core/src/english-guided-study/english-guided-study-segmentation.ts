export interface EnglishStudySourceSegment {
  id: string;
  text: string;
}

export const englishStudyExplanationModes = ["SENTENCE", "PARAGRAPH", "FREEFORM"] as const;
export type EnglishStudyExplanationMode = (typeof englishStudyExplanationModes)[number];
export type GuidedStudyScene = "ENGLISH" | "GUSHIWEN";

const sentenceSegmentMaxLength = 520;
const paragraphSegmentMaxLength = 1_600;
const freeformSegmentMaxLength = 2_400;
const generationBatchMaxJsonLength = 12_000;
const generationBatchMaxSegments = 8;
const gushiwenShortDialogueMaxLength = 180;

export function normalizeEnglishStudySourceText(value: string) {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[\u200B-\u200D\u2060\uFEFF]/gu, "")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function englishGuidedStudyMaterialMaxTokens(segmentCount: number, sourceTextLength: number) {
  const estimatedBySegments = 2_000 + Math.max(0, segmentCount) * 550;
  const estimatedBySource = 2_500 + Math.max(0, sourceTextLength) * 1.2;

  return Math.min(8_000, Math.max(4_000, Math.ceil(estimatedBySegments), Math.ceil(estimatedBySource)));
}

export function buildEnglishStudySourceSegments(
  sourceText: string,
  explanationMode: EnglishStudyExplanationMode = "SENTENCE"
): EnglishStudySourceSegment[] {
  const paragraphs = sourceText
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const sourceParagraphs = paragraphs.length > 0 ? paragraphs : [sourceText.trim()].filter(Boolean);
  const segments =
    explanationMode === "SENTENCE"
      ? splitEnglishSentences(sourceText.trim()).flatMap((sentence) =>
          splitLongText(sentence, sentenceSegmentMaxLength)
        )
      : explanationMode === "PARAGRAPH"
        ? sourceParagraphs.flatMap((paragraph) => chunkSentences(paragraph, paragraphSegmentMaxLength))
        : chunkTextBlocks(sourceParagraphs, freeformSegmentMaxLength);

  return (segments.length > 0 ? segments : [sourceText.trim()])
    .filter(Boolean)
    .map((text, index) => ({
      id: `s${index + 1}`,
      text
    }));
}

export function buildGuidedStudySourceSegments(
  sourceText: string,
  explanationMode: EnglishStudyExplanationMode = "SENTENCE",
  scene: GuidedStudyScene = "ENGLISH"
) {
  if (scene !== "GUSHIWEN") {
    return buildEnglishStudySourceSegments(sourceText, explanationMode);
  }

  const normalized = normalizeEnglishStudySourceText(sourceText);
  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const units = explanationMode === "SENTENCE"
    ? mergeShortGushiwenDialogueUnits(
        mergeGushiwenStandalonePunctuation(
          normalized
            .split(/\n+/)
            .flatMap((line) =>
              line.match(/[^。！？；!?]+[。！？；!?]?[”’」』》〉）】〕〗"')\]}]*/gu) ?? [line]
            )
            .map((line) => line.trim())
            .filter(Boolean)
        )
      )
    : explanationMode === "PARAGRAPH"
      ? (paragraphs.length > 0 ? paragraphs : [normalized])
      : chunkTextBlocks(paragraphs.length > 0 ? paragraphs : [normalized], freeformSegmentMaxLength);
  const semanticUnits = explanationMode === "SENTENCE"
    ? mergeGushiwenSourceAnnotations(units)
    : units;

  return semanticUnits.flatMap((text) => splitLongText(text, explanationMode === "SENTENCE" ? sentenceSegmentMaxLength : paragraphSegmentMaxLength))
    .map((text, index) => ({ id: `s${index + 1}`, text }));
}

function mergeGushiwenStandalonePunctuation(units: string[]) {
  const merged: string[] = [];
  let leadingPunctuation = "";

  for (const originalUnit of units) {
    let unit = originalUnit;
    const leadingClosing = unit.match(/^([”’」』》〉）】〕〗"')\]}]+)(.+)$/u);

    if (leadingClosing && merged.length > 0) {
      merged[merged.length - 1] = `${merged[merged.length - 1]}${leadingClosing[1]}`;
      unit = leadingClosing[2]!.trim();
    }

    if (/^[，。！？；：、,.!?;:“”‘’「」『』《》〈〉（）()【】〔〕〖〗…—\-"'[\]{}]+$/u.test(unit)) {
      if (merged.length > 0) {
        merged[merged.length - 1] = `${merged[merged.length - 1]}${unit}`;
      } else {
        leadingPunctuation += unit;
      }
      continue;
    }

    if (unit) {
      merged.push(`${leadingPunctuation}${unit}`);
      leadingPunctuation = "";
    }
  }

  if (leadingPunctuation && merged.length > 0) {
    merged[merged.length - 1] = `${merged[merged.length - 1]}${leadingPunctuation}`;
  }

  return merged;
}

function mergeShortGushiwenDialogueUnits(units: string[]) {
  const merged: string[] = [];

  for (let index = 0; index < units.length; index += 1) {
    const first = units[index]!;
    let quoteDepth = gushiwenDialogueQuoteDelta(first);

    if (quoteDepth <= 0) {
      merged.push(first);
      continue;
    }

    const dialogueUnits = [first];
    let cursor = index + 1;

    while (quoteDepth > 0 && cursor < units.length) {
      const unit = units[cursor]!;
      dialogueUnits.push(unit);
      quoteDepth += gushiwenDialogueQuoteDelta(unit);
      cursor += 1;
    }

    if (quoteDepth === 0) {
      const dialogue = dialogueUnits.join("");

      if (dialogue.length <= gushiwenShortDialogueMaxLength) {
        merged.push(dialogue);
        index = cursor - 1;
        continue;
      }
    }

    merged.push(first);
  }

  return merged;
}

function gushiwenDialogueQuoteDelta(value: string) {
  let depth = 0;

  for (const character of value) {
    if (character === "“" || character === "「" || character === "『") {
      depth += 1;
    } else if (character === "”" || character === "」" || character === "』") {
      depth -= 1;
    }
  }

  return depth;
}

function mergeGushiwenSourceAnnotations(units: string[]) {
  const merged: string[] = [];

  for (const unit of units) {
    if (/^[（(]\s*《[^》\n]{1,80}》\s*[）)]$/u.test(unit) && merged.length > 0) {
      merged[merged.length - 1] = `${merged[merged.length - 1]}${unit}`;
      continue;
    }

    merged.push(unit);
  }

  return merged;
}

export function batchEnglishStudySourceSegments(
  segments: EnglishStudySourceSegment[],
  maxJsonLength = generationBatchMaxJsonLength,
  maxSegments = generationBatchMaxSegments
) {
  const batches: EnglishStudySourceSegment[][] = [];
  let current: EnglishStudySourceSegment[] = [];
  const normalizedMaxSegments = Math.max(1, Math.floor(maxSegments));

  for (const segment of segments) {
    const candidate = [...current, segment];

    if (
      current.length > 0 &&
      (candidate.length > normalizedMaxSegments || JSON.stringify(candidate).length > maxJsonLength)
    ) {
      batches.push(current);
      current = [segment];
      continue;
    }

    current = candidate;
  }

  if (current.length > 0) {
    batches.push(current);
  }

  return batches;
}

function splitEnglishSentences(paragraph: string) {
  const lineStructuredUnits = splitLineStructuredSemanticUnits(paragraph);

  if (lineStructuredUnits) {
    return lineStructuredUnits.flatMap(splitEnglishSentencesByPunctuation);
  }

  return splitEnglishSentencesByPunctuation(paragraph);
}

function splitEnglishSentencesByPunctuation(paragraph: string) {
  const lineBreakMarker = "\uE000";
  const protectedText = paragraph.replace(/\r\n?|\n/g, lineBreakMarker);
  const restoreLineBreaks = (value: string) => value.replaceAll(lineBreakMarker, "\n").trim();

  if (typeof Intl.Segmenter === "function") {
    const segmenter = new Intl.Segmenter("en", { granularity: "sentence" });
    const segments = mergeLeadingAbbreviationSegments(
      Array.from(segmenter.segment(protectedText), ({ segment }) => restoreLineBreaks(segment)).filter(
        Boolean
      )
    );

    if (segments.length > 0) {
      return segments;
    }
  }

  return (protectedText.match(/[^.!?。！？]+[.!?。！？]+["')\]]*|[^.!?。！？]+$/g) ?? [protectedText])
    .map(restoreLineBreaks)
    .filter(Boolean);
}

function splitLineStructuredSemanticUnits(text: string) {
  const lines = text
    .split(/\n+/)
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean);

  if (!isLineStructuredText(lines)) {
    return null;
  }

  const units: string[] = [];
  let current: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const nextLine = lines[index + 1];
    current.push(line);

    if (nextLine && lineNeedsSemanticContinuation(line, nextLine)) {
      continue;
    }

    units.push(current.join(" "));
    current = [];
  }

  if (current.length > 0) {
    units.push(current.join(" "));
  }

  return units;
}

function isLineStructuredText(lines: string[]) {
  if (lines.length < 3 || lines.some((line) => line.length > 120)) {
    return false;
  }

  const continuationLines = lines.slice(1);
  const structuredLineStarts = continuationLines.filter((line) =>
    /^(?:[A-Z]|[["'“‘(]|[-—–]\s)/.test(line)
  ).length;

  return structuredLineStarts / continuationLines.length >= 0.6;
}

function lineNeedsSemanticContinuation(line: string, nextLine: string) {
  if (/[.!?;:]["')\]]*$/.test(line)) {
    return false;
  }

  if (/\bboth\s*[,—-]*$/i.test(line) && /^and\b/i.test(nextLine)) {
    return true;
  }

  if (/\b(?:either|neither)\s*[,—-]*$/i.test(line) && /^(?:or|nor)\b/i.test(nextLine)) {
    return true;
  }

  if (/\bnot only\s*[,—-]*$/i.test(line) && /^but(?: also)?\b/i.test(nextLine)) {
    return true;
  }

  if (/\b(?:and|or|but|nor|to|of|in|on|at|by|for|with|from|than|as)\s*[,—-]*$/i.test(line)) {
    return true;
  }

  return /^(?:because|since|although|though|while|when|where|wherever|which|who|whom|whose|that|if|unless|until|before|after|so that|in order to|to|in|on|at|by|with|without|from|of|for|am|is|are|was|were|be|been|being|has|have|had|do|does|did|can|could|will|would|shall|should|may|might|must)\b/i.test(
    nextLine
  );
}

function mergeLeadingAbbreviationSegments(segments: string[]) {
  const merged: string[] = [];

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    const next = segments[index + 1];

    if (segment && next && /^(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St)\.$/i.test(segment)) {
      merged.push(`${segment} ${next}`);
      index += 1;
      continue;
    }

    if (segment) {
      merged.push(segment);
    }
  }

  return merged;
}

function chunkSentences(text: string, maxLength: number) {
  const sentences = splitEnglishSentences(text).flatMap((sentence) => splitLongText(sentence, maxLength));
  const chunks: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    const candidate = current ? `${current} ${sentence}` : sentence;

    if (candidate.length <= maxLength) {
      current = candidate;
      continue;
    }

    if (current) {
      chunks.push(current);
    }
    current = sentence;
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}

function chunkTextBlocks(paragraphs: string[], maxLength: number) {
  const paragraphChunks = paragraphs.flatMap((paragraph) => chunkSentences(paragraph, maxLength));
  const blocks: string[] = [];
  let current = "";

  for (const paragraph of paragraphChunks) {
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;

    if (candidate.length <= maxLength) {
      current = candidate;
      continue;
    }

    if (current) {
      blocks.push(current);
    }
    current = paragraph;
  }

  if (current) {
    blocks.push(current);
  }

  return blocks;
}

function splitLongText(text: string, maxLength: number) {
  if (text.length <= maxLength) {
    return [text];
  }

  const words = text.split(/\s+/).filter(Boolean);
  const chunks: string[] = [];
  let current = "";

  for (const word of words) {
    if (!current) {
      current = word;
      continue;
    }

    if (`${current} ${word}`.length <= maxLength) {
      current = `${current} ${word}`;
      continue;
    }

    chunks.push(current);
    current = word;
  }

  if (current) {
    chunks.push(current);
  }

  return chunks.flatMap((chunk) => {
    if (chunk.length <= maxLength) {
      return [chunk];
    }

    const pieces: string[] = [];
    for (let cursor = 0; cursor < chunk.length; cursor += maxLength) {
      pieces.push(chunk.slice(cursor, cursor + maxLength));
    }
    return pieces;
  });
}
