const ruledPaperSlotWidthRatio = 1;
const ruledPaperMinSlotWidth = 18;
const ruledPaperMaxLetterSpacingCompressionRatio = 0.08;
const ruledPaperCjkWidthRatio = 0.8;
const ruledPaperFullSpaceWidthRatio = 1;
const ruledPaperHalfSpaceWidthRatio = 0.5;
const ruledPaperPunctuationWidthRatio = 0.55;
const ruledPaperAsciiWidthRatio = 0.62;
const ruledPaperClosingPunctuation = /^[，。！？、；：,.!?;:）】》」』]$/u;

export interface RuledPaperLineLayout {
  text: string;
  slotCount: number;
  slotWidth: number;
  fitWidth: number;
  letterSpacing: number;
}

export function wrapRuledPaperText(value: string, maxWidth: number, fontSizeValue: number) {
  return wrapRuledPaperLines(value, maxWidth, fontSizeValue).map((line) => line.text);
}

export function wrapRuledPaperLines(value: string, maxWidth: number, fontSizeValue: number): RuledPaperLineLayout[] {
  const sourceLines = value.replace(/\r\n?/g, "\n").split("\n");
  const lines = sourceLines.flatMap((line) => wrapRuledPaperLine(normalizeFullWidthSpaceSlots(line).trimEnd(), maxWidth, fontSizeValue));

  return lines.filter((line) => line.text.trim().length > 0);
}

export function ruledPaperSlotWidth(fontSizeValue: number) {
  return Math.max(ruledPaperMinSlotWidth, fontSizeValue * ruledPaperSlotWidthRatio);
}

export function estimateRuledPaperTextWidth(value: string, fontSizeValue: number) {
  return Array.from(value).reduce((width, char) => {
    if (char === "　") {
      return width + fontSizeValue * ruledPaperFullSpaceWidthRatio;
    }

    if (char === " ") {
      return width + fontSizeValue * ruledPaperHalfSpaceWidthRatio;
    }

    const codePoint = char.codePointAt(0);
    if (codePoint !== undefined && codePoint <= 0x7f) {
      return width + estimateRuledPaperAsciiTextWidth(char, fontSizeValue);
    }

    if (/[，。！？、；：,.!?;:]/u.test(char)) {
      return width + fontSizeValue * ruledPaperPunctuationWidthRatio;
    }

    return width + fontSizeValue * ruledPaperCjkWidthRatio;
  }, 0);
}

function normalizeFullWidthSpaceSlots(value: string) {
  return value.replace(/ {3}/g, "　");
}

function wrapRuledPaperLine(line: string, maxWidth: number, fontSizeValue: number): RuledPaperLineLayout[] {
  const wrapped: RuledPaperLineLayout[] = [];
  const slotWidth = ruledPaperSlotWidth(fontSizeValue);
  let currentLine = "";
  let currentSlotCount = 0;

  for (const unit of tokenizeRuledPaperLine(line)) {
    const unitSlotCount = Math.max(1, Array.from(unit).length);

    if (currentLine && !canFitRuledPaperSlots(currentSlotCount + unitSlotCount, slotWidth, maxWidth)) {
      wrapped.push(createRuledPaperLineLayout(currentLine, currentSlotCount, slotWidth, maxWidth));
      currentLine = unit.trim() ? unit : "";
      currentSlotCount = unit.trim() ? unitSlotCount : 0;
    } else {
      currentLine = `${currentLine}${unit}`;
      currentSlotCount += unitSlotCount;
    }
  }

  if (currentLine.trim()) {
    wrapped.push(createRuledPaperLineLayout(currentLine, currentSlotCount, slotWidth, maxWidth));
  }

  return wrapped;
}

function createRuledPaperLineLayout(text: string, slotCount: number, slotWidth: number, maxWidth: number): RuledPaperLineLayout {
  const naturalWidth = slotCount * slotWidth;
  const gapCount = Math.max(0, slotCount - 1);
  const requiredLetterSpacing = gapCount > 0 && naturalWidth > maxWidth ? (maxWidth - naturalWidth) / gapCount : 0;
  const letterSpacing = Math.max(-slotWidth * ruledPaperMaxLetterSpacingCompressionRatio, requiredLetterSpacing);

  return {
    text,
    slotCount,
    slotWidth,
    fitWidth: Math.min(maxWidth, naturalWidth + gapCount * letterSpacing),
    letterSpacing
  };
}

function canFitRuledPaperSlots(slotCount: number, slotWidth: number, maxWidth: number) {
  const naturalWidth = slotCount * slotWidth;
  const gapCount = Math.max(0, slotCount - 1);
  const minimumWidth = naturalWidth - gapCount * slotWidth * ruledPaperMaxLetterSpacingCompressionRatio;

  return minimumWidth <= maxWidth;
}

function tokenizeRuledPaperLine(line: string) {
  const units: string[] = [];

  for (const char of Array.from(line)) {
    if (ruledPaperClosingPunctuation.test(char) && units.length > 0 && units[units.length - 1]?.trim()) {
      units[units.length - 1] = `${units[units.length - 1]}${char}`;
      continue;
    }

    units.push(char);
  }

  return units;
}

function estimateRuledPaperAsciiTextWidth(value: string, fontSizeValue: number) {
  return Array.from(value).reduce((width, char) => {
    if (char === " ") {
      return width + fontSizeValue * ruledPaperHalfSpaceWidthRatio;
    }

    if (/[mwMW]/.test(char)) {
      return width + fontSizeValue * 0.9;
    }

    if (/[ilI1.,'`]/.test(char)) {
      return width + fontSizeValue * 0.32;
    }

    return width + fontSizeValue * ruledPaperAsciiWidthRatio;
  }, 0);
}
