import type { CopybookPageLayout } from "../core/layout-parser.js";
import { containsCnsPua, containsCnsSupplement, encodeTextForFont } from "../fonts/cns-pua-encoding.js";
import { renderGridLayer } from "./grid-renderer.js";
import { renderNameLabelSheet } from "./name-label-renderer.js";
import { renderStrokePracticeRows } from "./stroke-practice-row-renderer.js";
import { renderContentTextLayer, renderPinyinLayer, renderStrokeGuideLayer } from "./text-renderer.js";
import { escapeXml } from "./xml.js";

interface BuildCopybookSvgOptions {
  fontUrlMode?: "export" | "preview";
}

const sourceHanSerifFontFamily = "Songti SC, Source Han Serif, serif";

export function buildCopybookSvg(layout: CopybookPageLayout, options: BuildCopybookSvgOptions = {}) {
  const { page } = layout;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${page.width}" height="${page.height}" viewBox="0 0 ${page.width} ${page.height}">`,
    "<title>字帖预览</title>",
    renderFontFace(layout, options),
    `<rect x="0" y="0" width="${page.width}" height="${page.height}" fill="#FFFFFF"/>`,
    renderWatermark(layout),
    renderWorksheet(layout),
    renderNameLabelSheet(layout),
    renderGridLayer(layout),
    renderStrokePracticeRows(layout),
    renderPinyinLayer(layout),
    renderStrokeGuideLayer(layout),
    renderContentTextLayer(layout),
    "</svg>"
  ].join("");
}

function renderFontFace(layout: CopybookPageLayout, options: BuildCopybookSvgOptions) {
  const rules: string[] = [];
  const usePreviewUrls = options.fontUrlMode === "preview";
  const customFontUrl = usePreviewUrls ? (layout.style.customFontPreviewUrl ?? layout.style.customFontUrl) : layout.style.customFontUrl;
  const customFontFallbackUrl = usePreviewUrls
    ? (layout.style.customFontFallbackPreviewUrl ?? layout.style.customFontFallbackUrl)
    : layout.style.customFontFallbackUrl;
  const pinyinFontUrl = usePreviewUrls ? (layout.style.pinyinFontPreviewUrl ?? layout.style.pinyinFontUrl) : layout.style.pinyinFontUrl;
  const fallbackFont =
    layout.style.customFontFallbackFamily && customFontFallbackUrl
      ? `@font-face{font-family:'${escapeCssString(layout.style.customFontFallbackFamily)}';src:url('${escapeCssUrl(customFontFallbackUrl)}');font-display:swap;}`
      : "";

  if (layout.style.font === "custom" && layout.style.customFontFamily && customFontUrl) {
    rules.push(
      `@font-face{font-family:'${escapeCssString(layout.style.customFontFamily)}';src:url('${escapeCssUrl(customFontUrl)}');font-display:swap;}`
    );
  }

  if (fallbackFont) {
    rules.push(fallbackFont);
  }

  if (layout.style.pinyinFontFamily && pinyinFontUrl) {
    rules.push(
      `@font-face{font-family:'${escapeCssString(layout.style.pinyinFontFamily)}';src:url('${escapeCssUrl(pinyinFontUrl)}');font-display:swap;}`
    );
  }

  if (rules.length === 0) {
    return "";
  }

  return ["<defs>", "<style>", ...rules, "</style>", "</defs>"].join("");
}

function renderWatermark(layout: CopybookPageLayout) {
  const watermark = layout.watermark;

  if (!watermark || (!watermark.text.visible && !watermark.image.visible)) {
    return "";
  }

  const opacity = fixed(clampNumber(watermark.gray, 10, 90) / 100);
  const positions = watermarkPositionsForPage(layout.page, watermark.position);
  const hasText = watermark.text.visible && Boolean(watermark.text.value);
  const hasImage = watermark.image.visible && Boolean(watermark.image.src);
  const imageHeight = clampNumber(watermark.image.height, 40, 180);
  const imageWidth = imageHeight * 1.75;
  const textFontSize = clampNumber(watermark.text.fontSize, 14, 60);
  const imageYOffset = hasText && hasImage ? -(textFontSize * 0.5) : 0;
  const textYOffset = hasText && hasImage ? imageHeight / 2 + textFontSize * 0.72 : 0;
  const encodedText = encodeTextForFont(
    watermark.text.value,
    watermark.text.font === "copybook" ? layout.style.fontEncoding : "unicode"
  );

  return [
    '<g data-role="watermark" pointer-events="none">',
    positions
      .map((position) => {
        const parts = [`<g transform="translate(${fixed(position.x)} ${fixed(position.y)}) rotate(${fixed(position.rotate)})">`];

        if (hasImage) {
          parts.push(
            `<image href="${escapeXml(watermark.image.src)}" xlink:href="${escapeXml(watermark.image.src)}" x="${fixed(-imageWidth / 2)}" y="${fixed(-imageHeight / 2 + imageYOffset)}" width="${fixed(imageWidth)}" height="${fixed(imageHeight)}" opacity="${opacity}" preserveAspectRatio="xMidYMid meet"/>`
          );
        }

        if (hasText) {
          parts.push(
            `<text x="0" y="${fixed(textFontSize * 0.32 + textYOffset)}" font-size="${fixed(textFontSize)}" font-family="${escapeXml(worksheetFontFamily(layout, watermark.text.font, encodedText))}" fill="#000000" fill-opacity="${opacity}" text-anchor="middle">${escapeXml(encodedText)}</text>`
          );
        }

        parts.push("</g>");

        return parts.join("");
      })
      .join(""),
    "</g>"
  ].join("");
}

function watermarkPositionsForPage(
  page: CopybookPageLayout["page"],
  position: NonNullable<CopybookPageLayout["watermark"]>["position"]
) {
  if (position === "center") {
    return [
      {
        rotate: 0,
        x: page.width / 2,
        y: page.height / 2
      }
    ];
  }

  const rotate = position === "spread-top-right" ? -28 : 28;
  const positions: Array<{ x: number; y: number; rotate: number }> = [];
  const stepX = 220;
  const stepY = 165;

  for (let row = 0, y = -60; y <= page.height + 80; row += 1, y += stepY) {
    const rowOffset = row % 2 === 0 ? 0 : stepX / 2;

    for (let x = -80 - rowOffset; x <= page.width + 120; x += stepX) {
      positions.push({
        rotate,
        x,
        y
      });
    }
  }

  return positions;
}

function renderWorksheet(layout: CopybookPageLayout) {
  const { page, worksheet } = layout;

  if (!worksheet) {
    return "";
  }

  const fieldsY = Math.max(page.margin + 30, layout.grid.y - 34);
  const gridHeight = layout.grid.rows * layout.grid.cellHeight + Math.max(0, layout.grid.rows - 1) * layout.grid.rowGap;
  const footerY = Math.min(page.height - 34, layout.grid.y + gridHeight + 42);
  const fieldColor = "#1F2937";
  const fieldFont = sourceHanSerifFontFamily;
  const visibleFields = worksheetFields(worksheet);

  return [
    '<g data-role="worksheet">',
    worksheet.showTitle
      ? renderWorksheetTitle(layout)
      : "",
    visibleFields.length > 0 ? renderWorksheetFields(layout, visibleFields, fieldsY, fieldFont, fieldColor) : "",
    worksheet.showFooter
      ? renderWorksheetFooter(layout, footerY)
      : "",
    worksheet.pageNumber.visible ? renderWorksheetPageNumber(layout) : "",
    "</g>"
  ].join("");
}

function renderWorksheetFooter(layout: CopybookPageLayout, y: number) {
  const worksheet = layout.worksheet;

  if (!worksheet) {
    return "";
  }

  const footerStyle = worksheet.footerStyle;
  const encodedFooter = encodeTextForFont(worksheet.footer, "unicode");

  return `<text x="${layout.page.width / 2}" y="${y}" font-size="${footerStyle.fontSize}" font-family="${sourceHanSerifFontFamily}" fill="${footerStyle.color}" text-anchor="middle" letter-spacing="2">- ${escapeXml(encodedFooter)} -</text>`;
}

function renderWorksheetTitle(layout: CopybookPageLayout) {
  const worksheet = layout.worksheet;

  if (!worksheet) {
    return "";
  }

  const titleStyle = worksheet.titleStyle;
  const y = layout.page.margin + Math.max(titleStyle.fontSize, 16);
  const encodedTitle = encodeTextForFont(worksheet.title, titleStyle.font === "copybook" ? layout.style.fontEncoding : "unicode");

  return `<text x="${layout.page.width / 2}" y="${y}" font-size="${titleStyle.fontSize}" font-family="${escapeXml(worksheetFontFamily(layout, titleStyle.font, encodedTitle))}" fill="${titleStyle.color}" text-anchor="middle" letter-spacing="3">${escapeXml(encodedTitle)}</text>`;
}

function worksheetFontFamily(layout: CopybookPageLayout, titleFont: NonNullable<CopybookPageLayout["worksheet"]>["titleStyle"]["font"], text: string) {
  if (titleFont === "copybook") {
    return worksheetContentFontFamily(layout, text);
  }

  if (titleFont === "songti") {
    return "Songti SC, Source Han Serif, serif";
  }

  if (titleFont === "heiti") {
    return "PingFang SC, Heiti SC, Microsoft YaHei, SimHei, Noto Sans CJK SC, sans-serif";
  }

  return "Kaiti SC, STKaiti, KaiTi, Kaiti, BiauKaiTC, BiauKai, Source Han Serif, Songti SC, serif";
}

function worksheetContentFontFamily(layout: CopybookPageLayout, text = "") {
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

  if (layout.style.font === "source-han-serif") {
    return "Source Han Serif, Songti SC, serif";
  }

  if (layout.style.font === "serif") {
    return "serif";
  }

  return kaiFallback;
}

function worksheetFields(worksheet: NonNullable<CopybookPageLayout["worksheet"]>) {
  return [
    {
      label: "学校",
      lineKind: "school" as const,
      value: worksheet.studentFields.school.value,
      visible: worksheet.studentFields.school.visible
    },
    {
      label: "班级",
      lineKind: "className" as const,
      value: worksheet.studentFields.className.value,
      visible: worksheet.studentFields.className.visible
    },
    {
      label: "姓名",
      lineKind: "name" as const,
      value: worksheet.studentFields.name.value,
      visible: worksheet.studentFields.name.visible
    },
    {
      label: "学号",
      lineKind: "studentNumber" as const,
      value: worksheet.studentFields.studentNumber.value,
      visible: worksheet.studentFields.studentNumber.visible
    }
  ].filter((field) => field.visible);
}

function renderWorksheetFields(
  layout: CopybookPageLayout,
  fields: Array<{ label: string; lineKind: WorksheetFieldLineKind; value: string }>,
  y: number,
  fieldFont: string,
  fieldColor: string
) {
  const bodyX = layout.grid.x;
  const bodyWidth = layout.grid.cols * layout.grid.cellWidth;
  const minGap = 10;
  const fieldLayouts = fields.map((field) => ({
    ...field,
    labelWidth: worksheetLabelWidth(field.label),
    lineWidth: worksheetLineWidth(field)
  }));
  const fixedWidth = fieldLayouts.reduce((sum, field) => sum + field.labelWidth + field.lineWidth, 0);
  const gapCount = Math.max(0, fieldLayouts.length - 1);
  const minGapTotal = gapCount * minGap;
  const lineWidthSum = fieldLayouts.reduce((sum, field) => sum + field.lineWidth, 0);
  const fittedLayouts =
    gapCount > 0 && fixedWidth + minGapTotal > bodyWidth && lineWidthSum > 0
      ? fieldLayouts.map((field) => ({
          ...field,
          lineWidth: Math.max(8, field.lineWidth * Math.max(0.4, (bodyWidth - minGapTotal - (fixedWidth - lineWidthSum)) / lineWidthSum))
        }))
      : fieldLayouts;
  const fittedFixedWidth = fittedLayouts.reduce((sum, field) => sum + field.labelWidth + field.lineWidth, 0);
  const gap = gapCount > 0 ? Math.max(minGap, (bodyWidth - fittedFixedWidth) / gapCount) : 0;
  let cursorX = bodyX;

  return fittedLayouts
    .map((field) => {
      const labelX = cursorX;
      const lineX = labelX + field.labelWidth;
      const lineWidth = field.lineWidth;

      cursorX = lineX + lineWidth + gap;

      return [
        `<text x="${labelX}" y="${y}" font-size="10" font-family="${fieldFont}" fill="${fieldColor}" xml:space="preserve">${escapeXml(worksheetFieldLabelText(field.label))}</text>`,
        `<line x1="${lineX}" y1="${y + 5}" x2="${lineX + lineWidth}" y2="${y + 5}" stroke="#9CA3AF" stroke-width="0.55"/>`,
        field.value ? `<text x="${lineX + 2}" y="${y}" font-size="10" font-family="${fieldFont}" fill="${fieldColor}">${escapeXml(field.value)}</text>` : ""
      ].join("");
    })
    .join("");
}

function worksheetLabelWidth(label: string) {
  return estimateWorksheetTextWidth(worksheetFieldLabelText(label));
}

function worksheetFieldLabelText(label: string) {
  return `${label}: `;
}

type WorksheetFieldLineKind = "school" | "className" | "name" | "studentNumber";

function worksheetLineWidth(field: { lineKind: WorksheetFieldLineKind; value: string }) {
  if (field.value) {
    return Math.max(8, estimateWorksheetTextWidth(field.value) + 6);
  }

  return worksheetDefaultLineWidth(field.lineKind);
}

function worksheetDefaultLineWidth(lineKind: WorksheetFieldLineKind) {
  if (lineKind === "school") {
    return estimateWorksheetTextWidth("学校学校学校学校学校");
  }

  if (lineKind === "className") {
    return estimateWorksheetTextWidth("班级班级");
  }

  if (lineKind === "name") {
    return estimateWorksheetTextWidth("姓名姓名姓名");
  }

  return estimateWorksheetTextWidth("00");
}

function estimateWorksheetTextWidth(value: string) {
  return Array.from(value).reduce((sum, char) => {
    if (/[\u3400-\u9fff\uf900-\ufaff]/u.test(char)) {
      return sum + 10;
    }

    if (/\d/u.test(char)) {
      return sum + 6;
    }

    if (/[A-Za-z]/u.test(char)) {
      return sum + 6.5;
    }

    return sum + 5;
  }, 0);
}

function renderWorksheetPageNumber(layout: CopybookPageLayout) {
  const pageNumber = layout.worksheet?.pageNumber;

  if (!pageNumber?.visible) {
    return "";
  }

  const y = layout.page.height - 18;
  const x = pageNumber.position === "bottom-right" ? layout.page.width - layout.page.margin : layout.page.width / 2;
  const anchor = pageNumber.position === "bottom-right" ? "end" : "middle";

  return `<text x="${x}" y="${y}" font-size="9" font-family="${sourceHanSerifFontFamily}" fill="#64748B" text-anchor="${anchor}">${escapeXml(pageNumber.text)}</text>`;
}

function escapeCssString(value: string) {
  return escapeXml(value).replaceAll("\\", "\\\\").replaceAll("'", "\\'");
}

function escapeCssUrl(value: string) {
  return escapeXml(value).replaceAll("\\", "\\\\").replaceAll("'", "%27");
}

function fixed(value: number) {
  return Number(value.toFixed(3));
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
