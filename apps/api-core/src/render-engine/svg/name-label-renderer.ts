import { fixedPoint } from "../core/coordinate-system.js";
import type {
  CopybookNameLabelSheet,
  CopybookPageLayout,
} from "../core/layout-parser.js";
import { encodeTextForFont } from "../fonts/cns-pua-encoding.js";
import { contentFontFamily } from "./text-renderer.js";
import { escapeXml } from "./xml.js";

const minimumFontSize = 6;

export function renderNameLabelSheet(layout: CopybookPageLayout) {
  const sheet = layout.nameLabelSheet;

  if (!sheet) {
    return '<g data-layer="name-labels"></g>';
  }

  const labels: string[] = [];

  for (let row = 0; row < sheet.rows; row += 1) {
    for (let column = 0; column < sheet.columns; column += 1) {
      const slotIndex = row * sheet.columns + column;
      const label = sheet.labels[slotIndex % sheet.labels.length];
      const x = sheet.x + column * (sheet.labelWidth + sheet.horizontalGap);
      const y = sheet.y + row * (sheet.labelHeight + sheet.verticalGap);

      labels.push(renderNameLabel(layout, sheet, label.lines, x, y, slotIndex));
    }
  }

  return `<g data-layer="name-labels">${labels.join("")}</g>`;
}

function renderNameLabel(
  layout: CopybookPageLayout,
  sheet: CopybookNameLabelSheet,
  lines: string[],
  x: number,
  y: number,
  slotIndex: number,
) {
  const clipId = `name-label-clip-${slotIndex}`;
  const borderClearance = sheet.border.visible
    ? sheet.border.style === "double"
      ? sheet.border.innerInset + sheet.border.innerWidth
      : sheet.border.width / 2
    : 0;
  const contentInsetX = Math.max(sheet.horizontalPadding, borderClearance + 3);
  const contentInsetY = Math.max(sheet.padding, borderClearance + 3);
  const contentX = x + contentInsetX;
  const contentY = y + contentInsetY;
  const contentWidth = Math.max(1, sheet.labelWidth - contentInsetX * 2);
  const contentHeight = Math.max(1, sheet.labelHeight - contentInsetY * 2);
  const preparedLines = lines.map((line) => prepareLine(line, sheet.textLayout));
  const lineHeightRatio = sheet.lineHeight;
  const fontSize = fittedFontSize(
    layout.style.fontSize,
    preparedLines,
    contentWidth,
    contentHeight,
    lineHeightRatio,
  );
  const lineHeight = fontSize * lineHeightRatio;
  const textBlockHeight = fontSize + Math.max(0, preparedLines.length - 1) * lineHeight;
  // The glyph box is modeled as 0.82em above and 0.18em below the baseline.
  const firstBaseline = contentY + Math.max(0, (contentHeight - textBlockHeight) / 2) + fontSize * 0.82;
  const nodes = [
    `<g data-role="name-label" data-label-index="${slotIndex}" data-line-height="${fixedPoint(lineHeightRatio)}">`,
    `<defs><clipPath id="${clipId}"><rect x="${fixedPoint(x)}" y="${fixedPoint(y)}" width="${fixedPoint(sheet.labelWidth)}" height="${fixedPoint(sheet.labelHeight)}" rx="${fixedPoint(sheet.border.radius)}"/></clipPath></defs>`,
  ];

  if (sheet.backgroundImage.src) {
    nodes.push(
      `<image data-role="name-label-background" href="${escapeXml(sheet.backgroundImage.src)}" xlink:href="${escapeXml(sheet.backgroundImage.src)}" x="${fixedPoint(x)}" y="${fixedPoint(y)}" width="${fixedPoint(sheet.labelWidth)}" height="${fixedPoint(sheet.labelHeight)}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${clipId})"/>`,
    );
  }

  nodes.push(`<g clip-path="url(#${clipId})">`);
  preparedLines.forEach((line, index) => {
    const baseline = firstBaseline + index * lineHeight;

    nodes.push(
      renderNameLabelLine(
        layout,
        sheet,
        line,
        contentX,
        contentWidth,
        baseline,
        fontSize,
      ),
    );
  });
  nodes.push("</g>", renderBorder(sheet, x, y), "</g>");

  return nodes.join("");
}

function renderNameLabelLine(
  layout: CopybookPageLayout,
  sheet: CopybookNameLabelSheet,
  line: PreparedLine,
  x: number,
  width: number,
  baseline: number,
  fontSize: number,
) {
  const underlineY = baseline + fontSize * 0.18;
  const family = escapeXml(contentFontFamily(layout, line.raw));
  const fill = layout.style.textColor;

  if (line.hasField) {
    const fieldWidth = Math.min(width * 0.4, Math.max(fontSize * 2.7, estimateTextWidth(line.field, fontSize) + fontSize * 0.35));
    const valueX = x + fieldWidth;
    const valueWidth = Math.max(1, width - fieldWidth);
    const encodedField = encodeTextForFont(line.field, layout.style.fontEncoding);
    const encodedValue = encodeTextForFont(line.value, layout.style.fontEncoding);

    return [
      `<text data-role="name-label-field" x="${fixedPoint(x)}" y="${fixedPoint(baseline)}" font-size="${fixedPoint(fontSize)}" font-family="${family}" fill="${fill}" text-anchor="start">${escapeXml(encodedField)}</text>`,
      sheet.showUnderline
        ? `<line data-role="name-label-underline" x1="${fixedPoint(valueX)}" y1="${fixedPoint(underlineY)}" x2="${fixedPoint(x + width)}" y2="${fixedPoint(underlineY)}" stroke="${fill}" stroke-width="0.65"/>`
        : "",
      `<text x="${fixedPoint(valueX + valueWidth / 2)}" y="${fixedPoint(baseline)}" font-size="${fixedPoint(fontSize)}" font-family="${family}" fill="${fill}" text-anchor="middle">${escapeXml(encodedValue)}</text>`,
    ].join("");
  }

  const encodedValue = encodeTextForFont(line.value, layout.style.fontEncoding);

  return [
    sheet.showUnderline
      ? `<line data-role="name-label-underline" x1="${fixedPoint(x)}" y1="${fixedPoint(underlineY)}" x2="${fixedPoint(x + width)}" y2="${fixedPoint(underlineY)}" stroke="${fill}" stroke-width="0.65"/>`
      : "",
    `<text x="${fixedPoint(x + width / 2)}" y="${fixedPoint(baseline)}" font-size="${fixedPoint(fontSize)}" font-family="${family}" fill="${fill}" text-anchor="middle">${escapeXml(encodedValue)}</text>`,
  ].join("");
}

function renderBorder(sheet: CopybookNameLabelSheet, x: number, y: number) {
  if (!sheet.border.visible) {
    return "";
  }

  const outerInset = sheet.border.width / 2;
  const nodes = [
    `<rect x="${fixedPoint(x + outerInset)}" y="${fixedPoint(y + outerInset)}" width="${fixedPoint(sheet.labelWidth - outerInset * 2)}" height="${fixedPoint(sheet.labelHeight - outerInset * 2)}" rx="${fixedPoint(Math.max(0, sheet.border.radius - outerInset))}" fill="none" stroke="${sheet.border.color}" stroke-width="${fixedPoint(sheet.border.width)}"/>`,
  ];

  if (sheet.border.style === "double") {
    const inset = sheet.border.innerInset;

    nodes.push(
      `<rect x="${fixedPoint(x + inset)}" y="${fixedPoint(y + inset)}" width="${fixedPoint(sheet.labelWidth - inset * 2)}" height="${fixedPoint(sheet.labelHeight - inset * 2)}" rx="${fixedPoint(Math.max(0, sheet.border.innerRadius - sheet.border.innerWidth / 2))}" fill="none" stroke="${sheet.border.innerColor}" stroke-width="${fixedPoint(sheet.border.innerWidth)}"/>`,
    );
  }

  return nodes.join("");
}

interface PreparedLine {
  raw: string;
  field: string;
  value: string;
  hasField: boolean;
}

function prepareLine(line: string, layout: CopybookNameLabelSheet["textLayout"]): PreparedLine {
  const raw = line.trim();

  if (layout === "center") {
    return { raw, field: "", value: raw, hasField: false };
  }

  const match = /^([^:：]{1,24})[:：]\s*(.*)$/u.exec(raw);

  if (!match) {
    return { raw, field: "", value: raw, hasField: false };
  }

  return {
    raw,
    field: `${match[1]?.trim() ?? ""}：`,
    value: match[2]?.trim() ?? "",
    hasField: true,
  };
}

function fittedFontSize(
  requestedSize: number,
  lines: PreparedLine[],
  width: number,
  height: number,
  lineHeightRatio: number,
) {
  const heightLimit = height / Math.max(1, 1 + Math.max(0, lines.length - 1) * lineHeightRatio);
  const widthScale = lines.reduce((current, line) => {
    const estimatedAtOnePoint = line.hasField
      ? Math.max(
          estimateTextWidth(line.field, 1) / 0.4,
          estimateTextWidth(line.value, 1) / 0.6,
        )
      : estimateTextWidth(line.value, 1);

    return Math.min(current, estimatedAtOnePoint > 0 ? width / estimatedAtOnePoint : requestedSize);
  }, requestedSize);

  return Math.max(minimumFontSize, Math.min(requestedSize, heightLimit, widthScale));
}

function estimateTextWidth(value: string, fontSize: number) {
  return Array.from(value).reduce((width, character) => {
    if (/\s/u.test(character)) {
      return width + fontSize * 0.34;
    }
    if ((character.codePointAt(0) ?? 0) <= 0xff) {
      return width + fontSize * 0.62;
    }

    return width + fontSize;
  }, 0);
}
