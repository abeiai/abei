import { fixedPoint } from "../core/coordinate-system.js";
import type { CopybookContentItem, CopybookFont, CopybookPageLayout } from "../core/layout-parser.js";
import { containsCnsPua, containsCnsSupplement, encodeTextForFont } from "../fonts/cns-pua-encoding.js";
import { escapeXml } from "./xml.js";

const pinyinMiddleTopRatio = 0.34;
const pinyinMiddleBottomRatio = 0.66;
const pinyinXHeightRatio = 0.545;
const pinyinCols = 6;
const pinyinCellWidth = 76;
const verticalMiddleBaselineOffsetRatio = 0.46;

export function renderPinyinLayer(layout: CopybookPageLayout) {
  const nodes = layout.content.flatMap((item) => renderPinyinForItem(layout, item));

  return `<g data-layer="pinyin">${nodes.join("")}</g>`;
}

export function renderStrokeGuideLayer(layout: CopybookPageLayout) {
  const nodes = layout.content.flatMap((item) =>
    guideSlots(item).map((slot) => renderTextNode(layout, item, slot, layout.style.traceColor, guideTextOpacity(item)))
  );

  return `<g data-layer="stroke-guide">${nodes.join("")}</g>`;
}

export function renderContentTextLayer(layout: CopybookPageLayout) {
  const nodes = layout.content.flatMap((item) =>
    contentSlots(item).map((slot) => renderTextNode(layout, item, slot, layout.style.textColor, "0.95"))
  );

  return `<g data-layer="content-text">${nodes.join("")}</g>`;
}

export function fontFamily(font: CopybookFont) {
  if (font === "source-han-serif") {
    return "Source Han Serif, Songti SC, serif";
  }

  if (font === "serif") {
    return "serif";
  }

  return "Kaiti SC, STKaiti, KaiTi, Kaiti, BiauKaiTC, BiauKai, Source Han Serif, Songti SC, serif";
}

export function contentFontFamily(layout: CopybookPageLayout, text = "") {
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

      return familyStack.filter(Boolean).join(", ");
    }

    return `${customFamily}, ${kaiFallback}`;
  }

  return fontFamily(layout.style.font);
}

function renderPinyinForItem(layout: CopybookPageLayout, item: CopybookContentItem) {
  if (!item.pinyin || layout.grid.variant === "calligraphy") {
    return [];
  }

  const rawX = item.pinyinX ?? item.x + layout.grid.cellWidth / 2;
  const rawY = item.pinyinY ?? Math.max(8, item.y - Math.max(7, layout.style.pinyinFontSize * 0.6));
  const x = fixedPoint(rawX);
  const y = fixedPoint(rawY);
  const isPolyphonic = (item.pinyinOptions?.length ?? 0) > 1;
  const highlightPinyin = isPolyphonic && !item.pinyinSelected;
  const pinyinText = item.pinyin ?? "";
  const pinyinBoxWidth = fixedPoint(Math.max(layout.style.pinyinFontSize * 2, pinyinText.length * layout.style.pinyinFontSize * 0.54 + 9));
  const pinyinBoxHeight = fixedPoint(layout.style.pinyinFontSize + 4);
  const pinyinAttrs = isPolyphonic
    ? ` data-role="stroke-pinyin-picker" data-key="${escapeXml(item.pinyinKey ?? "")}" data-char="${escapeXml(item.pinyinChar || item.text)}" data-options="${escapeXml(item.pinyinOptions?.join("|") ?? "")}" data-selected="${item.pinyinSelected ? "true" : "false"}" cursor="pointer"`
    : "";

  return [
    `<g${pinyinAttrs}>`,
    highlightPinyin
      ? `<rect x="${fixedPoint(rawX - Number(pinyinBoxWidth) / 2)}" y="${fixedPoint(rawY - layout.style.pinyinFontSize - 2)}" width="${pinyinBoxWidth}" height="${pinyinBoxHeight}" rx="3" fill="#FFF3B0" stroke="#FDE047" stroke-width="0.55"/>`
      : "",
    `<text x="${x}" y="${y}" font-size="${fixedPoint(layout.style.pinyinFontSize)}" font-family="${escapeXml(pinyinFontFamily(layout))}" fill="${layout.style.textColor}" text-anchor="middle">${escapeXml(pinyinText)}</text>`,
    "</g>"
  ];
}

function renderTextNode(
  layout: CopybookPageLayout,
  item: CopybookContentItem,
  slot: number,
  fill: string,
  opacity: string
) {
  const anchor = item.align === "left" ? "start" : "middle";
  const x = fixedPoint(
    (item.align === "left"
      ? item.x + slot * layout.grid.cellWidth
      : item.x + slot * layout.grid.cellWidth + layout.grid.cellWidth / 2) + (item.textOffsetX ?? 0)
  );
  const isPinyinPractice = isPinyinPracticeLayout(layout);
  const baseFontSize = isPinyinPractice ? pinyinPracticeFontSize(layout.grid.cellHeight) : layout.style.fontSize;
  const fontSize = fixedPoint(item.maxFontSize === undefined ? baseFontSize : Math.min(baseFontSize, item.maxFontSize));
  const contentCellHeight = item.contentCellHeight ?? layout.grid.cellHeight;
  const y = fixedPoint(
    (item.verticalAlign === "middle"
      ? item.y + contentCellHeight / 2
      : isPinyinPractice
        ? item.y + layout.grid.cellHeight * pinyinMiddleBottomRatio
        : item.y + contentCellHeight * 2 / 3) +
      (item.textOffsetY ?? 0)
  );
  const baselineOffsetRatio = item.baselineOffsetRatio ?? verticalMiddleBaselineOffsetRatio;
  const dyAttr = item.verticalAlign === "middle" ? ` dy="${fixedPoint(Number(fontSize) * baselineOffsetRatio)}"` : "";
  const preserveSpaceAttr = item.preserveSpace ? ' xml:space="preserve"' : "";
  const letterSpacingAttr = item.letterSpacing ? ` letter-spacing="${fixedPoint(item.letterSpacing)}"` : "";
  const text = encodeTextForFont(item.text, layout.style.fontEncoding);
  const family = isPinyinPractice && layout.style.font !== "custom" ? "Inter, Arial, sans-serif" : contentFontFamily(layout, text);
  const textNode = `<text x="${x}" y="${y}"${dyAttr}${preserveSpaceAttr}${letterSpacingAttr} font-size="${fontSize}" font-family="${escapeXml(family)}" fill="${fill}" fill-opacity="${opacity}" text-anchor="${anchor}">${escapeXml(text)}</text>`;

  if (
    item.clipX !== undefined &&
    item.clipY !== undefined &&
    item.clipWidth !== undefined &&
    item.clipHeight !== undefined
  ) {
    const clipId = svgSafeId(`${item.clipId ?? "text-clip"}-${slot}-${fill}-${opacity}`);
    const clipX = item.clipX + slot * layout.grid.cellWidth;

    return [
      `<clipPath id="${clipId}"><rect x="${fixedPoint(clipX)}" y="${fixedPoint(item.clipY)}" width="${fixedPoint(item.clipWidth)}" height="${fixedPoint(item.clipHeight)}"/></clipPath>`,
      `<g clip-path="url(#${clipId})">${textNode}</g>`
    ].join("");
  }

  return textNode;
}

function pinyinFontFamily(layout: CopybookPageLayout) {
  return `${layout.style.pinyinFontFamily ?? "Quicksand"}, Quicksand, Inter, Arial, sans-serif`;
}

function guideSlots(item: CopybookContentItem) {
  if (item.darkExampleCount !== undefined || item.traceExampleCount !== undefined) {
    const darkCount = Math.max(0, item.darkExampleCount ?? 0);
    const traceCount = Math.max(0, item.traceExampleCount ?? 0);

    return Array.from({ length: traceCount }, (_, index) => darkCount + index);
  }

  if (item.style === "copy") {
    return [0];
  }

  return Array.from({ length: item.repeat }, (_, index) => index);
}

function contentSlots(item: CopybookContentItem) {
  if (item.darkExampleCount !== undefined || item.traceExampleCount !== undefined) {
    const darkCount = Math.max(0, item.darkExampleCount ?? 0);

    return Array.from({ length: darkCount }, (_, index) => index);
  }

  if (item.style === "hybrid") {
    return [0];
  }

  if (item.style === "copy") {
    return [];
  }

  return Array.from({ length: item.repeat }, (_, index) => index);
}

function guideTextOpacity(item: CopybookContentItem) {
  return item.darkExampleCount !== undefined || item.traceExampleCount !== undefined ? "1" : "0.32";
}

function isPinyinPracticeLayout(layout: CopybookPageLayout) {
  return layout.grid.type === "line" && layout.grid.cols === pinyinCols && Math.abs(layout.grid.cellWidth - pinyinCellWidth) < 0.1;
}

function pinyinPracticeFontSize(cellHeight: number) {
  return ((pinyinMiddleBottomRatio - pinyinMiddleTopRatio) * cellHeight) / pinyinXHeightRatio;
}

function svgSafeId(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return `zitie-${hash.toString(36)}`;
}
