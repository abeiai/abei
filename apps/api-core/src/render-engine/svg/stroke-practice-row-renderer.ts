import { fixedPoint } from "../core/coordinate-system.js";
import type {
  CopybookPageLayout,
  StrokeGlyph,
  StrokePracticeRowLayout,
  StrokePracticeRowStyle
} from "../core/layout-parser.js";
import { containsCnsPua, containsCnsSupplement, encodeTextForFont } from "../fonts/cns-pua-encoding.js";
import { escapeXml } from "./xml.js";

const strokeMetaLabelFontSize = 10;
const strokeMetaValueFontSize = 15;
const sourceHanSerifFontFamily = "Songti SC, Source Han Serif, serif";
const sourceHanSansFontFamily = "Source Han Sans SC, Noto Sans CJK SC, Noto Sans SC, PingFang SC, Microsoft YaHei, sans-serif";
const strokeStepSize = 13;
const strokeStepGap = 3;
const strokeStepLabelWidth = 24;
const strokeStepLabelGap = 8;
const strokeStepPaddingX = 8;
const strokeStepWrapLineHeight = 24;
const strokeStepWrapThreshold = 12;

export function renderStrokePracticeRows(layout: CopybookPageLayout) {
  const rows = layout.strokePracticeRows
    .map((row) => renderStrokePracticeRow(layout, row, resolveGlyph(layout, row)))
    .join("");

  return `<g data-layer="stroke-practice">${rows}</g>`;
}

function renderStrokePracticeRow(layout: CopybookPageLayout, row: StrokePracticeRowLayout, glyph: StrokeGlyph | null) {
  const { x, y, width, header, practice, style } = row;
  const practiceY = y + header.height;
  const strokeCount = row.strokeCount ?? glyph?.strokes.length ?? 0;

  if (row.blank) {
    return [
      '<g data-role="stroke-practice-row" data-blank="true">',
      renderPracticeCells({
        char: "",
        layout,
        x,
        y,
        cellSize: practice.cellSize,
        cellCount: practice.cellCount,
        darkExampleCount: 0,
        traceExampleCount: 0,
        textOffsetY: 0,
        style
      }),
      "</g>"
    ].join("");
  }

  return [
    `<g data-role="stroke-practice-row" data-char="${escapeXml(row.char)}">`,
    renderHeaderBackground({
      x,
      y,
      width,
      height: header.height,
      background: header.background,
      borderColor: header.borderColor
    }),
    renderMetaInfo({
      char: row.char,
      layout,
      x,
      y,
      width: header.metaWidth,
      height: header.height,
      pinyin: row.pinyin,
      pinyinKey: row.pinyinKey,
      pinyinOptions: row.pinyinOptions,
      pinyinSelected: row.pinyinSelected,
      radical: row.radical,
      strokeCount,
      cellSize: practice.cellSize,
      wrapStrokeStrip: header.wrapStrokeStrip
    }),
    glyph
      ? renderStrokeStepStrip({
          glyph,
          row,
          style: {
            completedFill: style.traceFill,
            activeFill: style.darkFill
          }
        })
      : "",
    renderPracticeCells({
      char: row.char,
      layout,
      x,
      y: practiceY,
      cellSize: practice.cellSize,
      cellCount: practice.cellCount,
      darkExampleCount: practice.darkExampleCount,
      traceExampleCount: practice.traceExampleCount,
      textOffsetY: practice.textOffsetY,
      style
    }),
    "</g>"
  ].join("");
}

function renderHeaderBackground(params: {
  x: number;
  y: number;
  width: number;
  height: number;
  background: string;
  borderColor: string;
}) {
  const { x, y, width, height, background, borderColor } = params;

  return [
    '<g data-role="stroke-practice-header">',
    `<rect x="${n(x)}" y="${n(y)}" width="${n(width)}" height="${n(height)}" fill="${background}" stroke="${borderColor}" stroke-width="1.2"/>`,
    "</g>"
  ].join("");
}

function renderMetaInfo(params: {
  char: string;
  layout: CopybookPageLayout;
  x: number;
  y: number;
  width: number;
  height: number;
  pinyin: string;
  pinyinKey: string;
  pinyinOptions: string[];
  pinyinSelected: boolean;
  radical: string;
  strokeCount: number;
  cellSize: number;
  wrapStrokeStrip: boolean;
}) {
  const { char, layout, x, y, height, pinyin, pinyinKey, pinyinOptions, pinyinSelected, radical, strokeCount, cellSize, wrapStrokeStrip } = params;
  const metaLineHeight = wrapStrokeStrip ? height - strokeStepWrapLineHeight : height;
  const cy = y + Math.max(0, metaLineHeight) / 2 + 4;
  const labelSize = strokeMetaLabelFontSize;
  const valueSize = strokeMetaValueFontSize;
  const pinyinLabelX = x + 8;
  const pinyinValueX = x + 38;
  const radicalLabelX = x + cellSize * 2 + 8;
  const radicalValueX = x + cellSize * 2 + 34;
  const strokeLabelX = x + cellSize * 3 + 8;
  const strokeValueX = x + cellSize * 3 + 34;
  const pinyinText = pinyin || "-";
  const isPolyphonic = pinyinOptions.length > 1;
  const highlightPinyin = isPolyphonic && !pinyinSelected;
  const maxPinyinBoxWidth = Math.max(valueSize * 1.6, cellSize * 2 - 42);
  const pinyinBoxWidth = Math.min(maxPinyinBoxWidth, Math.max(valueSize * 2.1, pinyinText.length * valueSize * 0.54 + 12));
  const pinyinBoxHeight = valueSize + 6;
  const pinyinAttrs = isPolyphonic
    ? ` data-role="stroke-pinyin-picker" data-key="${escapeXml(pinyinKey)}" data-char="${escapeXml(char)}" data-options="${escapeXml(pinyinOptions.join("|"))}" data-selected="${pinyinSelected ? "true" : "false"}" cursor="pointer"`
    : "";

  const nodes = [
    `<text x="${n(pinyinLabelX)}" y="${n(cy)}" font-size="${n(labelSize)}" font-family="${sourceHanSansFontFamily}" fill="#111827">拼音</text>`,
    `<g${pinyinAttrs}>`,
    highlightPinyin
      ? `<rect x="${n(pinyinValueX - 6)}" y="${n(cy - valueSize - 3)}" width="${n(pinyinBoxWidth)}" height="${n(pinyinBoxHeight)}" rx="3" fill="#FFF3B0" stroke="#FDE047" stroke-width="0.6"/>`
      : "",
    `<text x="${n(pinyinValueX)}" y="${n(cy)}" font-size="${n(valueSize)}" font-family="${escapeXml(pinyinFontFamily(layout))}" fill="#111827">${escapeXml(pinyinText)}</text>`,
    "</g>",
    `<text x="${n(radicalLabelX)}" y="${n(cy)}" font-size="${n(labelSize)}" font-family="${sourceHanSansFontFamily}" fill="#111827">部首</text>`,
    `<text x="${n(radicalValueX)}" y="${n(cy)}" font-size="${n(valueSize)}" font-family="${sourceHanSerifFontFamily}" fill="#111827">${escapeXml(radical || "-")}</text>`,
    `<text x="${n(strokeLabelX)}" y="${n(cy)}" font-size="${n(labelSize)}" font-family="${sourceHanSansFontFamily}" fill="#111827">笔画</text>`,
    `<text x="${n(strokeValueX)}" y="${n(cy)}" font-size="${n(valueSize)}" font-family="${sourceHanSerifFontFamily}" fill="#111827">${escapeXml(String(strokeCount))}</text>`
  ].join("");

  return `<g data-role="stroke-practice-meta">${nodes}</g>`;
}

function pinyinFontFamily(layout: CopybookPageLayout) {
  return `${layout.style.pinyinFontFamily ?? "Quicksand"}, Quicksand, Inter, Arial, sans-serif`;
}

function renderStrokeStepStrip(params: {
  glyph: StrokeGlyph;
  row: StrokePracticeRowLayout;
  style: {
    completedFill: string;
    activeFill: string;
  };
}) {
  const { glyph, row, style } = params;
  const { x, y, width, header } = row;
  const strokeCount = glyph.strokes.length;

  if (strokeCount === 0 || width <= 0 || header.height <= 0) {
    return "";
  }

  const wrapStrokeStrip =
    header.wrapStrokeStrip === true ||
    shouldWrapStrokeStepStrip({
      rowWidth: width,
      metaWidth: header.metaWidth,
      strokeCount
    });
  const lineTop = wrapStrokeStrip ? y + Math.max(0, header.height - strokeStepWrapLineHeight) : y;
  const lineHeight = wrapStrokeStrip ? Math.min(strokeStepWrapLineHeight, header.height) : header.height;
  const labelX = wrapStrokeStrip ? x + strokeStepPaddingX : x + header.metaWidth + strokeStepPaddingX;
  const labelY = lineTop + lineHeight / 2 + 3.5;
  const startX = labelX + strokeStepLabelWidth + strokeStepLabelGap;
  const startY = lineTop + (lineHeight - strokeStepSize) / 2;

  const parts = [
    `<text x="${n(labelX)}" y="${n(labelY)}" font-size="${n(strokeMetaLabelFontSize)}" font-family="${sourceHanSansFontFamily}" fill="#111827">笔顺</text>`,
    Array.from({ length: strokeCount }, (_, index) =>
      renderMmhGlyph({
        glyph,
        x: startX + index * (strokeStepSize + strokeStepGap),
        y: startY,
        size: strokeStepSize,
        uptoStroke: index + 1,
        activeStrokeIndex: index,
        completedFill: style.completedFill,
        activeFill: style.activeFill
      })
    ).join("")
  ].join("");

  return `<g data-role="stroke-step-strip">${parts}</g>`;
}

function renderPracticeCells(params: {
  char: string;
  layout: CopybookPageLayout;
  x: number;
  y: number;
  cellSize: number;
  cellCount: number;
  darkExampleCount: number;
  traceExampleCount: number;
  textOffsetY: number;
  style: StrokePracticeRowStyle;
}) {
  const { char, layout, x, y, cellSize, cellCount, darkExampleCount, traceExampleCount, textOffsetY, style } = params;
  const parts: string[] = [];

  for (let index = 0; index < cellCount; index += 1) {
    const cellX = x + index * cellSize;

    parts.push(
      renderTianziCell({
        x: cellX,
        y,
        size: cellSize,
        borderColor: style.borderColor,
        guideLineColor: style.guideLineColor
      })
    );

    if (!char) {
      continue;
    }

    if (index < darkExampleCount) {
      parts.push(
        renderPracticeTextGlyph({
          char,
          fill: style.darkFill,
          layout,
          opacity: 1,
          size: cellSize,
          textOffsetY,
          x: cellX,
          y
        })
      );
      continue;
    }

    if (index < darkExampleCount + traceExampleCount) {
      parts.push(
        renderPracticeTextGlyph({
          char,
          fill: style.traceFill,
          layout,
          opacity: 0.75,
          size: cellSize,
          textOffsetY,
          x: cellX,
          y
        })
      );
    }
  }

  return `<g data-role="stroke-practice-cells">${parts.join("")}</g>`;
}

function renderPracticeTextGlyph(params: {
  char: string;
  fill: string;
  layout: CopybookPageLayout;
  opacity: number;
  size: number;
  textOffsetY: number;
  x: number;
  y: number;
}) {
  const { char, fill, layout, opacity, size, textOffsetY, x, y } = params;
  const fontSize = Math.min(size * 0.84, layout.style.fontSize);
  const textX = x + size / 2;
  const textY = y + size / 2 + fontSize * 0.36 + textOffsetY;
  const opacityAttr = opacity >= 1 ? "" : ` fill-opacity="${n(opacity)}"`;
  const encodedChar = encodeTextForFont(char, layout.style.fontEncoding);

  return `<text x="${n(textX)}" y="${n(textY)}" font-size="${n(fontSize)}" font-family="${practiceFontFamily(layout, encodedChar)}" fill="${fill}"${opacityAttr} text-anchor="middle">${escapeXml(encodedChar)}</text>`;
}

function practiceFontFamily(layout: CopybookPageLayout, text = "") {
  const kaiFallback = "Kaiti SC, STKaiti, KaiTi, Kaiti, BiauKaiTC, BiauKai, Source Han Serif, Songti SC, serif";

  if (layout.style.font === "custom" && layout.style.customFontFamily) {
    const customFamily = `'${layout.style.customFontFamily}'`;
    const fallbackFamily = layout.style.customFontFallbackFamily ? `'${layout.style.customFontFallbackFamily}'` : "";

    if (layout.style.fontEncoding === "cns-pua" || layout.style.fontEncoding === "cns-ext-b") {
      const useCustomFont = layout.style.fontEncoding === "cns-pua" ? containsCnsPua(text) : containsCnsSupplement(text);
      const familyStack = useCustomFont
        ? [customFamily, fallbackFamily, kaiFallback]
        : fallbackFamily
          ? [fallbackFamily, customFamily, kaiFallback]
          : [kaiFallback];

      return escapeXml(familyStack.filter(Boolean).join(", "));
    }

    return escapeXml(`${customFamily}, ${kaiFallback}`);
  }

  if (layout.style.font === "source-han-serif") {
    return "Source Han Serif, Songti SC, serif";
  }

  if (layout.style.font === "serif") {
    return "serif";
  }

  return kaiFallback;
}

function renderTianziCell(params: {
  x: number;
  y: number;
  size: number;
  borderColor: string;
  guideLineColor: string;
}) {
  const { x, y, size, borderColor, guideLineColor } = params;
  const midX = x + size / 2;
  const midY = y + size / 2;

  return [
    '<g data-role="tianzi-cell">',
    `<rect x="${n(x)}" y="${n(y)}" width="${n(size)}" height="${n(size)}" fill="none" stroke="${borderColor}" stroke-width="0.95"/>`,
    `<line x1="${n(midX)}" y1="${n(y)}" x2="${n(midX)}" y2="${n(y + size)}" stroke="${guideLineColor}" stroke-width="0.55" stroke-dasharray="2 2.8"/>`,
    `<line x1="${n(x)}" y1="${n(midY)}" x2="${n(x + size)}" y2="${n(midY)}" stroke="${guideLineColor}" stroke-width="0.55" stroke-dasharray="2 2.8"/>`,
    "</g>"
  ].join("");
}

function renderMmhGlyph(params: {
  glyph: StrokeGlyph;
  x: number;
  y: number;
  size: number;
  uptoStroke?: number;
  activeStrokeIndex?: number;
  completedFill: string;
  activeFill: string;
  opacity?: number;
}) {
  const {
    glyph,
    x,
    y,
    size,
    uptoStroke = glyph.strokes.length,
    activeStrokeIndex = -1,
    completedFill,
    activeFill,
    opacity = 1
  } = params;
  const scale = size / 1024;
  const safeUptoStroke = Math.max(0, Math.min(glyph.strokes.length, uptoStroke));
  const opacityAttr = opacity >= 1 ? "" : ` fill-opacity="${n(opacity)}"`;
  const paths = glyph.strokes
    .slice(0, safeUptoStroke)
    .map((path, index) => {
      const fill = index === activeStrokeIndex ? activeFill : completedFill;

      return `<path d="${escapeXml(path)}" fill="${fill}"${opacityAttr}/>`;
    })
    .join("");

  return `<g transform="translate(${n(x)} ${n(y)}) scale(${n(scale)})"><g transform="scale(1, -1) translate(0, -900)">${paths}</g></g>`;
}

function resolveGlyph(layout: CopybookPageLayout, row: StrokePracticeRowLayout) {
  return (
    layout.strokeGlyphs[row.strokeRef] ??
    layout.strokeGlyphs[row.char] ??
    Object.values(layout.strokeGlyphs).find((glyph) => glyph.character === row.char) ??
    null
  );
}

function shouldWrapStrokeStepStrip({
  rowWidth,
  metaWidth,
  strokeCount
}: {
  rowWidth: number;
  metaWidth: number;
  strokeCount: number;
}) {
  if (strokeCount <= 0) {
    return false;
  }

  const sameLineAvailableWidth = Math.max(0, rowWidth - metaWidth - strokeStepPaddingX * 2);
  const stepStripWidth = strokeCount * strokeStepSize + Math.max(0, strokeCount - 1) * strokeStepGap;
  const requiredWidth = strokeStepLabelWidth + strokeStepLabelGap + stepStripWidth;

  return strokeCount > strokeStepWrapThreshold || requiredWidth > sameLineAvailableWidth;
}

function n(value: number) {
  return String(fixedPoint(value));
}
