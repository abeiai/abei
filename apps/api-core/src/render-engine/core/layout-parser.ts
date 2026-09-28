import { HttpStatus } from "@nestjs/common";
import { AppException } from "../../common/app-exception.js";
import type { CopybookFontEncoding } from "../fonts/cns-pua-encoding.js";
import { A4_PAGE } from "./coordinate-system.js";

export type CopybookGridType = "tianzi" | "hui" | "rizhi" | "fang" | "line";
export type CopybookGridVariant = "ruled" | "calligraphy" | "pinyin-tian" | "eight-line";
export type CopybookContentStyle = "repeat" | "trace" | "copy" | "hybrid";
export type CopybookFont = "kaiti" | "source-han-serif" | "serif" | "custom";
export type CopybookWatermarkPosition = "center" | "spread-top-right" | "spread-bottom-right";
export type CopybookNameLabelTextLayout = "auto" | "center" | "field-line";
export type CopybookNameLabelBorderStyle = "single" | "double";

export interface CopybookPage {
  width: number;
  height: number;
  margin: number;
}

export interface CopybookGrid {
  type: CopybookGridType;
  variant?: CopybookGridVariant;
  visible: boolean;
  cell: number;
  cellWidth: number;
  cellHeight: number;
  rowGap: number;
  rows: number;
  cols: number;
  x: number;
  y: number;
}

export interface CopybookContentItem {
  text: string;
  pinyin: string | null;
  pinyinOptions?: string[];
  pinyinSelected?: boolean;
  pinyinKey?: string;
  pinyinChar?: string;
  pinyinX?: number;
  pinyinY?: number;
  x: number;
  y: number;
  repeat: number;
  style: CopybookContentStyle;
  align: "left" | "center";
  darkExampleCount?: number;
  traceExampleCount?: number;
  preserveSpace?: boolean;
  baselineOffsetRatio?: number;
  fitWidth?: number;
  letterSpacing?: number;
  clipId?: string;
  clipX?: number;
  clipY?: number;
  clipWidth?: number;
  clipHeight?: number;
  textOffsetX?: number;
  textOffsetY?: number;
  verticalAlign?: "middle";
  contentCellHeight?: number;
  maxFontSize?: number;
}

export interface CopybookStyle {
  strokeColor: string;
  guideColor: string;
  textColor: string;
  traceColor: string;
  font: CopybookFont;
  customFontFamily: string | null;
  customFontUrl: string | null;
  customFontPreviewUrl: string | null;
  customFontFallbackFamily: string | null;
  customFontFallbackUrl: string | null;
  customFontFallbackPreviewUrl: string | null;
  fontEncoding: CopybookFontEncoding;
  fontSize: number;
  pinyinFontFamily: string | null;
  pinyinFontUrl: string | null;
  pinyinFontPreviewUrl: string | null;
  pinyinFontSize: number;
}

export interface CopybookWorksheetField {
  visible: boolean;
  value: string;
}

export interface CopybookPageNumber {
  visible: boolean;
  position: "bottom-center" | "bottom-right";
  text: string;
}

export type CopybookWorksheetTitleFont = "copybook" | "kaiti" | "songti" | "heiti";

export interface CopybookWorksheetTitleStyle {
  color: string;
  font: CopybookWorksheetTitleFont;
  fontSize: number;
}

export interface CopybookWorksheet {
  title: string;
  footer: string;
  showStudentFields: boolean;
  showTitle: boolean;
  titleStyle: CopybookWorksheetTitleStyle;
  showFooter: boolean;
  footerStyle: CopybookWorksheetTitleStyle;
  studentFields: {
    school: CopybookWorksheetField;
    name: CopybookWorksheetField;
    className: CopybookWorksheetField;
    studentNumber: CopybookWorksheetField;
  };
  pageNumber: CopybookPageNumber;
}

export interface CopybookWatermark {
  text: {
    font: CopybookWorksheetTitleFont;
    fontSize: number;
    visible: boolean;
    value: string;
  };
  image: {
    height: number;
    visible: boolean;
    src: string;
    name: string;
  };
  position: CopybookWatermarkPosition;
  gray: number;
}

export interface CopybookNameLabel {
  lines: string[];
}

export interface CopybookNameLabelSheet {
  x: number;
  y: number;
  labelWidth: number;
  labelHeight: number;
  horizontalGap: number;
  verticalGap: number;
  rows: number;
  columns: number;
  padding: number;
  horizontalPadding: number;
  lineHeight: number;
  textLayout: CopybookNameLabelTextLayout;
  showUnderline: boolean;
  labels: CopybookNameLabel[];
  backgroundImage: {
    src: string;
    name: string;
  };
  border: {
    visible: boolean;
    style: CopybookNameLabelBorderStyle;
    color: string;
    width: number;
    radius: number;
    innerColor: string;
    innerWidth: number;
    innerRadius: number;
    innerInset: number;
  };
}

export interface StrokeGlyph {
  character: string;
  strokes: string[];
  medians?: unknown[];
}

export interface StrokePracticeRowHeader {
  height: number;
  metaWidth: number;
  wrapStrokeStrip: boolean;
  background: string;
  borderColor: string;
}

export interface StrokePracticeRowPractice {
  cellSize: number;
  cellCount: number;
  darkExampleCount: number;
  traceExampleCount: number;
  textOffsetY: number;
}

export interface StrokePracticeRowStyle {
  borderColor: string;
  guideLineColor: string;
  darkFill: string;
  traceFill: string;
}

export interface StrokePracticeRowLayout {
  type: "stroke-practice-row";
  blank: boolean;
  char: string;
  pinyin: string;
  pinyinOptions: string[];
  pinyinSelected: boolean;
  pinyinKey: string;
  radical: string;
  strokeCount: number | null;
  x: number;
  y: number;
  width: number;
  header: StrokePracticeRowHeader;
  practice: StrokePracticeRowPractice;
  style: StrokePracticeRowStyle;
  strokeRef: string;
}

export interface CopybookPageLayout {
  page: CopybookPage;
  grid: CopybookGrid;
  content: CopybookContentItem[];
  style: CopybookStyle;
  worksheet: CopybookWorksheet | null;
  watermark: CopybookWatermark | null;
  nameLabelSheet: CopybookNameLabelSheet | null;
  strokeGlyphs: Record<string, StrokeGlyph>;
  strokePracticeRows: StrokePracticeRowLayout[];
}

export interface CopybookLayoutDocument {
  pages: CopybookPageLayout[];
}

export interface CreateCopybookLayoutInput {
  text?: unknown;
  pinyin?: unknown;
  gridType?: unknown;
  repeat?: unknown;
  style?: unknown;
}

const gridTypes = new Set<CopybookGridType>(["tianzi", "hui", "rizhi", "fang", "line"]);
const gridVariants = new Set<CopybookGridVariant>([
  "ruled",
  "calligraphy",
  "pinyin-tian",
  "eight-line",
]);
const contentStyles = new Set<CopybookContentStyle>(["repeat", "trace", "copy", "hybrid"]);
const fonts = new Set<CopybookFont>(["kaiti", "source-han-serif", "serif", "custom"]);
const hexColorPattern = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

export function parseLayoutDocument(input: unknown): CopybookLayoutDocument {
  const source = record(input, "布局数据不能为空");
  const pageSources = Array.isArray(source.pages) ? source.pages : [source];

  if (pageSources.length === 0 || pageSources.length > 100) {
    throw invalidLayout("分页数量必须在 1 到 100 页之间");
  }

  return {
    pages: pageSources.map((pageSource) => parsePageLayout(pageSource))
  };
}

export function createCopybookLayout(input: CreateCopybookLayoutInput): CopybookPageLayout {
  const text = stringValue(input.text, "天地玄黄").replace(/\s+/g, "");
  const chars = Array.from(text || "天地玄黄").slice(0, 12);
  const pinyinItems = stringValue(input.pinyin, "tiān dì xuán huáng").split(/\s+/).filter(Boolean);
  const gridType = parseGridType(input.gridType, "tianzi");
  const repeat = integerValue(input.repeat, 4, 1, 10);
  const styleSource = maybeRecord(input.style);
  const gridY = 92;
  const cell = 48;

  return parsePageLayout({
    page: A4_PAGE,
    grid: {
      type: gridType,
      cell,
      rows: 12,
      cols: 10,
      x: A4_PAGE.margin,
      y: gridY
    },
    content: chars.map((char, index) => ({
      text: char,
      pinyin: pinyinItems[index] ?? "",
      x: A4_PAGE.margin,
      y: gridY + index * cell,
      repeat,
      style: pinyinItems[index] ? "hybrid" : "trace",
      align: "center"
    })),
    style: {
      strokeColor: stringValue(styleSource?.strokeColor, "#E74C3C"),
      guideColor: stringValue(styleSource?.guideColor, "#F5B7B1"),
      textColor: stringValue(styleSource?.textColor, "#E74C3C"),
      font: stringValue(styleSource?.font, "kaiti"),
      fontSize: numberValue(styleSource?.fontSize, 22, 8, 96)
    }
  });
}

function parsePageLayout(input: unknown): CopybookPageLayout {
  const source = record(input, "布局数据必须是对象");
  const pageSource = maybeRecord(source.page);
  const rawContentSource = Array.isArray(source.content) ? source.content : [];
  const contentSource = rawContentSource.filter((item) => !isStrokePracticeRowSource(item));
  const embeddedStrokeRows = rawContentSource.filter(isStrokePracticeRowSource);
  const directStrokeRows = Array.isArray(source.strokePracticeRows) ? source.strokePracticeRows : [];
  const itemStrokeRows = Array.isArray(source.items) ? source.items.filter(isStrokePracticeRowSource) : [];
  const strokePracticeRowSources = [...directStrokeRows, ...itemStrokeRows, ...embeddedStrokeRows];
  const gridSource = maybeRecord(source.grid);
  const styleSource = maybeRecord(source.style);
  const worksheetSource = maybeRecord(source.worksheet);
  const watermarkSource = maybeRecord(source.watermark);
  const nameLabelSheetSource = maybeRecord(source.nameLabelSheet);
  const page = parsePage(pageSource);
  const firstContent = maybeRecord(contentSource[0]);
  const hasStrokePracticeRows = strokePracticeRowSources.length > 0;
  const resolvedGridSource = gridSource ?? {};
  const gridVariant = parseGridVariant(resolvedGridSource.variant);
  const cell = numberValue(resolvedGridSource.cell, 48, 8, 160);
  const cellWidth = numberValue(resolvedGridSource.cellWidth, cell, 8, 1000);
  const cellHeight = numberValue(
    resolvedGridSource.cellHeight,
    cell,
    8,
    gridVariant.variant === "eight-line" ? page.height : 160,
  );
  const rowGap = numberValue(resolvedGridSource.rowGap, 0, 0, 120);
  const grid: CopybookGrid = {
    type: parseGridType(resolvedGridSource.type, "tianzi"),
    ...gridVariant,
    visible: gridSource ? gridSource.visible !== false : !hasStrokePracticeRows,
    cell,
    cellWidth,
    cellHeight,
    rowGap,
    rows: integerValue(resolvedGridSource.rows, hasStrokePracticeRows && !gridSource ? 1 : 12, 1, 60),
    cols: integerValue(resolvedGridSource.cols, hasStrokePracticeRows && !gridSource ? 1 : 10, 1, 60),
    x: numberValue(resolvedGridSource.x, page.margin, 0, page.width),
    y: numberValue(
      resolvedGridSource.y,
      numberValue(firstContent?.y, page.margin + 40, 0, page.height),
      0,
      page.height
    )
  };
  const style = parseStyle(styleSource);

  if (grid.visible) {
    ensureGridFitsPage(page, grid);
  }

  if (contentSource.length > 500) {
    throw invalidLayout("内容数量不能超过 500 条");
  }

  const content = contentSource.map((item) => parseContentItem(item, grid));
  const strokeGlyphs = parseStrokeGlyphs(source.strokeGlyphs);
  const strokePracticeRows = parseStrokePracticeRows(strokePracticeRowSources, page);

  return {
    page,
    grid,
    content,
    style,
    worksheet: parseWorksheet(worksheetSource),
    watermark: parseWatermark(watermarkSource),
    nameLabelSheet: parseNameLabelSheet(nameLabelSheetSource, page),
    strokeGlyphs,
    strokePracticeRows
  };
}

function parseNameLabelSheet(
  source: Record<string, unknown> | null,
  page: CopybookPage,
): CopybookNameLabelSheet | null {
  if (!source) {
    return null;
  }

  const rawLabels = Array.isArray(source.labels) ? source.labels : [];

  if (rawLabels.length === 0 || rawLabels.length > 200) {
    throw invalidLayout("姓名贴内容数量必须在 1 到 200 个之间");
  }

  const labels = rawLabels.map((input) => {
    const labelSource = record(input, "姓名贴内容必须是对象");
    const rawLines = Array.isArray(labelSource.lines) ? labelSource.lines : [];
    const lines = rawLines
      .map((line) => stringValue(line, "").trim().slice(0, 120))
      .slice(0, 20);

    if (lines.length === 0 || !lines.some(Boolean)) {
      throw invalidLayout("每个姓名贴至少需要一行内容");
    }

    return { lines };
  });
  const labelWidth = numberValue(source.labelWidth, 241, 20, page.width);
  const labelHeight = numberValue(source.labelHeight, 127, 20, page.height);
  const horizontalGap = numberValue(source.horizontalGap, 8, 0, page.width);
  const verticalGap = numberValue(source.verticalGap, 8, 0, page.height);
  const rows = integerValue(source.rows, 1, 1, 60);
  const columns = integerValue(source.columns, 1, 1, 60);
  const x = numberValue(source.x, page.margin, 0, page.width);
  const y = numberValue(source.y, page.margin, 0, page.height);
  const sheetWidth = columns * labelWidth + Math.max(0, columns - 1) * horizontalGap;
  const sheetHeight = rows * labelHeight + Math.max(0, rows - 1) * verticalGap;

  if (x + sheetWidth > page.width + 0.01 || y + sheetHeight > page.height + 0.01) {
    throw invalidLayout("姓名贴排布超出纸张范围");
  }

  const textLayout = stringValue(source.textLayout, "auto");
  const borderSource = maybeRecord(source.border);
  const backgroundSource = maybeRecord(source.backgroundImage);
  const borderStyle = stringValue(borderSource?.style, "double");
  const padding = numberValue(source.padding, 12, 0, Math.min(labelWidth, labelHeight) / 3);

  return {
    x,
    y,
    labelWidth,
    labelHeight,
    horizontalGap,
    verticalGap,
    rows,
    columns,
    padding,
    horizontalPadding: numberValue(source.horizontalPadding, 0.5 * 72 / 2.54, 0, labelWidth / 3),
    lineHeight: numberValue(source.lineHeight, 1.5, 0.5, 2.5),
    textLayout:
      textLayout === "center" || textLayout === "field-line" ? textLayout : "auto",
    showUnderline: source.showUnderline === true,
    labels,
    backgroundImage: {
      src: safeWatermarkImageSrc(backgroundSource?.src),
      name: stringValue(backgroundSource?.name, "").trim().slice(0, 80),
    },
    border: {
      visible: borderSource?.visible !== false,
      style: borderStyle === "double" ? "double" : "single",
      color: colorValue(borderSource?.color, "#666666"),
      width: numberValue(borderSource?.width, 3, 0.25, 12),
      radius: numberValue(borderSource?.radius, 12, 0, Math.min(labelWidth, labelHeight) / 2),
      innerColor: colorValue(borderSource?.innerColor, "#666666"),
      innerWidth: numberValue(borderSource?.innerWidth, 0.75, 0.25, 6),
      innerRadius: numberValue(
        borderSource?.innerRadius,
        Math.max(0, numberValue(borderSource?.radius, 12, 0, Math.min(labelWidth, labelHeight) / 2) - 7),
        0,
        Math.min(labelWidth, labelHeight) / 2,
      ),
      innerInset: numberValue(borderSource?.innerInset, 7, 1, Math.min(labelWidth, labelHeight) / 3),
    },
  };
}

function parseWatermark(source: Record<string, unknown> | null): CopybookWatermark | null {
  if (!source) {
    return null;
  }

  const textSource = maybeRecord(source.text);
  const imageSource = maybeRecord(source.image);
  const textValue = stringValue(textSource?.value, "").trim().slice(0, 40);
  const imageSrc = safeWatermarkImageSrc(imageSource?.src);
  const textVisible = textSource?.visible === true && Boolean(textValue);
  const imageVisible = imageSource?.visible === true && Boolean(imageSrc);

  if (!textVisible && !imageVisible) {
    return null;
  }

  return {
    text: {
      font: watermarkTextFontValue(textSource?.font),
      fontSize: numberValue(textSource?.fontSize, 34, 14, 60),
      visible: textVisible,
      value: textValue
    },
    image: {
      height: numberValue(imageSource?.height, 80, 40, 180),
      visible: imageVisible,
      src: imageSrc,
      name: stringValue(imageSource?.name, "").trim().slice(0, 80)
    },
    position: watermarkPositionValue(source.position),
    gray: numberValue(source.gray, 30, 10, 90)
  };
}

function watermarkTextFontValue(value: unknown): CopybookWorksheetTitleFont {
  const font = stringValue(value, "heiti");

  return font === "copybook" || font === "kaiti" || font === "songti" || font === "heiti" ? font : "heiti";
}

function watermarkPositionValue(value: unknown): CopybookWatermarkPosition {
  const position = stringValue(value, "center");

  return position === "spread-top-right" || position === "spread-bottom-right" ? position : "center";
}

function parsePage(source: Record<string, unknown> | null): CopybookPage {
  return {
    width: numberValue(source?.width, A4_PAGE.width, 100, 5000),
    height: numberValue(source?.height, A4_PAGE.height, 100, 5000),
    margin: numberValue(source?.margin, A4_PAGE.margin, 0, 500)
  };
}

function parseStyle(source: Record<string, unknown> | null): CopybookStyle {
  const font = stringValue(source?.font, "kaiti");
  const strokeColor = colorValue(source?.strokeColor, "#E74C3C");
  const parsedFont = fonts.has(font as CopybookFont) ? (font as CopybookFont) : "kaiti";
  const customFontFamily = safeFontFamily(source?.customFontFamily);
  const customFontUrl = safeFontUrl(source?.customFontUrl);
  const customFontPreviewUrl = safeFontUrl(source?.customFontPreviewUrl);
  const customFontFallbackFamily = safeFontFamily(source?.customFontFallbackFamily);
  const customFontFallbackUrl = safeFontUrl(source?.customFontFallbackUrl);
  const customFontFallbackPreviewUrl = safeFontUrl(source?.customFontFallbackPreviewUrl);
  const pinyinFontFamily = safeFontFamily(source?.pinyinFontFamily);
  const pinyinFontUrl = safeFontUrl(source?.pinyinFontUrl);
  const pinyinFontPreviewUrl = safeFontUrl(source?.pinyinFontPreviewUrl);
  const hasCustomFont = Boolean(customFontFamily && customFontUrl);
  const hasCustomFontFallback = Boolean(customFontFallbackFamily && customFontFallbackUrl);
  const hasPinyinFont = Boolean(pinyinFontFamily && pinyinFontUrl);

  return {
    strokeColor,
    guideColor: colorValue(source?.guideColor, "#F5B7B1"),
    textColor: colorValue(source?.textColor, strokeColor),
    traceColor: colorValue(source?.traceColor, colorValue(source?.textColor, strokeColor)),
    font: parsedFont === "custom" && hasCustomFont ? "custom" : parsedFont === "custom" ? "kaiti" : parsedFont,
    customFontFamily: hasCustomFont ? customFontFamily : null,
    customFontUrl: hasCustomFont ? customFontUrl : null,
    customFontPreviewUrl: hasCustomFont ? (customFontPreviewUrl ?? customFontUrl) : null,
    customFontFallbackFamily: hasCustomFontFallback ? customFontFallbackFamily : null,
    customFontFallbackUrl: hasCustomFontFallback ? customFontFallbackUrl : null,
    customFontFallbackPreviewUrl: hasCustomFontFallback ? (customFontFallbackPreviewUrl ?? customFontFallbackUrl) : null,
    fontEncoding: fontEncodingValue(source?.fontEncoding),
    fontSize: numberValue(source?.fontSize, 22, 8, 96),
    pinyinFontFamily: hasPinyinFont ? pinyinFontFamily : null,
    pinyinFontUrl: hasPinyinFont ? pinyinFontUrl : null,
    pinyinFontPreviewUrl: hasPinyinFont ? (pinyinFontPreviewUrl ?? pinyinFontUrl) : null,
    pinyinFontSize: numberValue(source?.pinyinFontSize, 10, 6, 32)
  };
}

function parseWorksheet(source: Record<string, unknown> | null): CopybookWorksheet | null {
  if (!source) {
    return null;
  }

  const showStudentFields = source.showStudentFields !== false;
  const studentFieldsSource = maybeRecord(source.studentFields);

  return {
    title: stringValue(source.title, "一年级生字练习").trim().slice(0, 32) || "一年级生字练习",
    footer: stringValue(source.footer, "好好写字  天天向上").trim().slice(0, 32) || "好好写字  天天向上",
    showStudentFields,
    showTitle: source.showTitle === true,
    titleStyle: parseTitleStyle(maybeRecord(source.titleStyle)),
    showFooter: source.showFooter !== false,
    footerStyle: parseFooterStyle(maybeRecord(source.footerStyle)),
    studentFields: {
      school: parseWorksheetField(maybeRecord(studentFieldsSource?.school), showStudentFields),
      className: parseWorksheetField(maybeRecord(studentFieldsSource?.className), showStudentFields),
      name: parseWorksheetField(maybeRecord(studentFieldsSource?.name), showStudentFields),
      studentNumber: parseWorksheetField(maybeRecord(studentFieldsSource?.studentNumber), showStudentFields)
    },
    pageNumber: parsePageNumber(maybeRecord(source.pageNumber))
  };
}

function parseTitleStyle(source: Record<string, unknown> | null): CopybookWorksheetTitleStyle {
  return parseWorksheetTextStyle(source, 16);
}

function parseFooterStyle(source: Record<string, unknown> | null): CopybookWorksheetTitleStyle {
  return parseWorksheetTextStyle(source, 11);
}

function parseWorksheetTextStyle(source: Record<string, unknown> | null, fallbackFontSize: number): CopybookWorksheetTitleStyle {
  const font = stringValue(source?.font, "kaiti");

  return {
    color: colorValue(source?.color, "#E74C3C"),
    font: font === "copybook" || font === "songti" || font === "heiti" ? font : "kaiti",
    fontSize: numberValue(source?.fontSize, fallbackFontSize, 8, 32)
  };
}

function parseWorksheetField(source: Record<string, unknown> | null, fallbackVisible: boolean): CopybookWorksheetField {
  return {
    visible: source ? source.visible !== false : fallbackVisible,
    value: stringValue(source?.value, "").trim().slice(0, 24)
  };
}

function parsePageNumber(source: Record<string, unknown> | null): CopybookPageNumber {
  const position = stringValue(source?.position, "bottom-center");

  return {
    visible: source?.visible === true,
    position: position === "bottom-right" ? "bottom-right" : "bottom-center",
    text: stringValue(source?.text, "").trim().slice(0, 32)
  };
}

function parseContentItem(input: unknown, grid: CopybookGrid): CopybookContentItem {
  const source = record(input, "content 中每一项都必须是对象");
  const preserveSpace = source.preserveSpace === true;
  const rawText = stringValue(source.text, "");
  const text = preserveSpace ? rawText : rawText.trim();
  const style = stringValue(source.style, "trace");
  const pinyin = stringValue(source.pinyin, "").trim();
  const align = stringValue(source.align, "center");
  const repeat = integerValue(source.repeat, 1, 1, 60);
  const hasSegmentedExamples = source.darkExampleCount !== undefined || source.traceExampleCount !== undefined;
  const darkExampleCount = hasSegmentedExamples
    ? Math.min(repeat, integerValue(source.darkExampleCount, 0, 0, repeat))
    : undefined;
  const traceExampleCount = hasSegmentedExamples
    ? Math.min(Math.max(0, repeat - (darkExampleCount ?? 0)), integerValue(source.traceExampleCount, 0, 0, repeat))
    : undefined;
  const maxFontSize = source.maxFontSize === undefined ? undefined : numberValue(source.maxFontSize, 0, 1, 300);
  const baselineOffsetRatio =
    source.baselineOffsetRatio === undefined ? undefined : numberValue(source.baselineOffsetRatio, 0.46, -2, 2);
  const fitWidth = source.fitWidth === undefined ? undefined : numberValue(source.fitWidth, 0, 1, 5000);
  const letterSpacing = source.letterSpacing === undefined ? undefined : numberValue(source.letterSpacing, 0, -300, 300);
  const clipX = source.clipX === undefined ? undefined : numberValue(source.clipX, grid.x, -5000, 5000);
  const clipY = source.clipY === undefined ? undefined : numberValue(source.clipY, grid.y, -5000, 5000);
  const clipWidth = source.clipWidth === undefined ? undefined : numberValue(source.clipWidth, 0, 1, 5000);
  const clipHeight = source.clipHeight === undefined ? undefined : numberValue(source.clipHeight, 0, 1, 5000);
  const verticalAlign = stringValue(source.verticalAlign, "");
  const pinyinOptions = parseStringList(source.pinyinOptions, 12, 24);
  const contentCellHeight =
    source.contentCellHeight === undefined ? undefined : numberValue(source.contentCellHeight, grid.cellHeight, 1, 300);
  const pinyinX = source.pinyinX === undefined ? undefined : numberValue(source.pinyinX, grid.x, -5000, 5000);
  const pinyinY = source.pinyinY === undefined ? undefined : numberValue(source.pinyinY, grid.y, -5000, 5000);

  if (!text.trim()) {
    throw invalidLayout("字帖文字不能为空");
  }

  if (Array.from(text).length > 120) {
    throw invalidLayout("单个字帖内容不能超过 120 个字符");
  }

  return {
    text,
    pinyin: pinyin || null,
    ...(pinyinOptions.length > 0 ? { pinyinOptions } : {}),
    ...(source.pinyinSelected === true ? { pinyinSelected: true } : {}),
    pinyinKey: stringValue(source.pinyinKey, "").trim().slice(0, 64),
    pinyinChar: Array.from(stringValue(source.pinyinChar, "").trim()).slice(0, 1).join(""),
    ...(pinyinX === undefined ? {} : { pinyinX }),
    ...(pinyinY === undefined ? {} : { pinyinY }),
    x: numberValue(source.x, grid.x, 0, 5000),
    y: numberValue(source.y, grid.y, 0, 5000),
    repeat,
    style: contentStyles.has(style as CopybookContentStyle) ? (style as CopybookContentStyle) : "trace",
    align: align === "left" ? "left" : "center",
    ...(darkExampleCount === undefined ? {} : { darkExampleCount }),
    ...(traceExampleCount === undefined ? {} : { traceExampleCount }),
    ...(preserveSpace ? { preserveSpace } : {}),
    ...(baselineOffsetRatio === undefined ? {} : { baselineOffsetRatio }),
    ...(fitWidth === undefined ? {} : { fitWidth }),
    ...(letterSpacing === undefined ? {} : { letterSpacing }),
    clipId: stringValue(source.clipId, "").trim().slice(0, 96),
    ...(clipX === undefined ? {} : { clipX }),
    ...(clipY === undefined ? {} : { clipY }),
    ...(clipWidth === undefined ? {} : { clipWidth }),
    ...(clipHeight === undefined ? {} : { clipHeight }),
    textOffsetX: numberValue(source.textOffsetX, 0, -5000, 5000),
    textOffsetY: numberValue(source.textOffsetY, 0, -5000, 5000),
    ...(verticalAlign === "middle" ? { verticalAlign } : {}),
    ...(contentCellHeight === undefined ? {} : { contentCellHeight }),
    ...(maxFontSize === undefined ? {} : { maxFontSize })
  };
}

function parseStrokeGlyphs(value: unknown): Record<string, StrokeGlyph> {
  const source = maybeRecord(value);

  if (!source) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(source)
      .slice(0, 500)
      .map(([key, glyphSource]) => [safeGlyphKey(key), parseStrokeGlyph(glyphSource, key)] as const)
      .filter((entry): entry is readonly [string, StrokeGlyph] => Boolean(entry[0] && entry[1].strokes.length))
  );
}

function parseStrokeGlyph(input: unknown, fallbackCharacter: string): StrokeGlyph {
  const source = maybeRecord(input);
  const rawStrokes = Array.isArray(source?.strokes) ? source.strokes : [];
  const strokes = rawStrokes
    .map((stroke) => stringValue(stroke, "").trim())
    .filter((stroke) => stroke.length > 0 && stroke.length <= 50_000)
    .slice(0, 80);

  return {
    character: Array.from(stringValue(source?.character, fallbackCharacter).trim()).slice(0, 1).join("") || fallbackCharacter,
    strokes,
    medians: Array.isArray(source?.medians) ? source.medians.slice(0, 80) : undefined
  };
}

function parseStrokePracticeRows(sources: unknown[], page: CopybookPage): StrokePracticeRowLayout[] {
  if (sources.length > 80) {
    throw invalidLayout("笔顺练习行不能超过 80 行");
  }

  return sources.map((source) => parseStrokePracticeRow(source, page));
}

function parseStrokePracticeRow(input: unknown, page: CopybookPage): StrokePracticeRowLayout {
  const source = record(input, "笔顺练习行必须是对象");
  const headerSource = maybeRecord(source.header);
  const practiceSource = maybeRecord(source.practice);
  const styleSource = maybeRecord(source.style);
  const blank = source.blank === true;
  const char = blank ? "" : Array.from(stringValue(source.char, "").trim()).slice(0, 1).join("");

  if (!blank && !char) {
    throw invalidLayout("笔顺练习字不能为空");
  }

  const x = numberValue(source.x, page.margin, 0, 5000);
  const y = numberValue(source.y, page.margin, 0, 5000);
  const width = numberValue(source.width, page.width - page.margin * 2, 40, 5000);
  const headerHeight = numberValue(headerSource?.height, 40, 18, 120);
  const defaultCellSize = Math.max(24, Math.min(72, Math.floor(width / 8)));
  const cellSize = numberValue(practiceSource?.cellSize, defaultCellSize, 16, 180);
  const cellCount = integerValue(practiceSource?.cellCount, Math.max(1, Math.floor(width / cellSize)), 1, 40);
  const darkExampleCount = Math.min(
    cellCount,
    integerValue(practiceSource?.darkExampleCount, 1, 0, cellCount)
  );
  const traceExampleCount = Math.min(
    Math.max(0, cellCount - darkExampleCount),
    integerValue(practiceSource?.traceExampleCount, 3, 0, cellCount)
  );

  return {
    type: "stroke-practice-row",
    blank,
    char,
    pinyin: stringValue(source.pinyin, "").trim().slice(0, 24),
    pinyinOptions: parseStringList(source.pinyinOptions, 12, 24),
    pinyinSelected: source.pinyinSelected === true,
    pinyinKey: stringValue(source.pinyinKey, `${char}-${y}`).trim().slice(0, 64),
    radical: stringValue(source.radical, "").trim().slice(0, 8),
    strokeCount: source.strokeCount === undefined ? null : integerValue(source.strokeCount, 0, 0, 80),
    x,
    y,
    width,
    header: {
      height: headerHeight,
      metaWidth: numberValue(headerSource?.metaWidth, Math.min(width, cellSize * 4), 40, width),
      wrapStrokeStrip: headerSource?.wrapStrokeStrip === true,
      background: colorValue(headerSource?.background, "#DDF5E9"),
      borderColor: colorValue(headerSource?.borderColor, "#00A95C")
    },
    practice: {
      cellSize,
      cellCount,
      darkExampleCount,
      traceExampleCount,
      textOffsetY: numberValue(practiceSource?.textOffsetY, 0, -5000, 5000)
    },
    style: {
      borderColor: colorValue(styleSource?.borderColor, "#00A95C"),
      guideLineColor: colorValue(styleSource?.guideLineColor, "#65D79B"),
      darkFill: colorValue(styleSource?.darkFill, "#9B0828"),
      traceFill: colorValue(styleSource?.traceFill, "#FFADB8")
    },
    strokeRef: safeGlyphKey(stringValue(source.strokeRef, char)) || char
  };
}

function isStrokePracticeRowSource(value: unknown) {
  const source = maybeRecord(value);

  return source?.type === "stroke-practice-row";
}

function safeGlyphKey(value: string) {
  return value.trim().slice(0, 16);
}

function parseStringList(value: unknown, maxItems: number, maxLength: number) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map((item) => stringValue(item, "").trim().slice(0, maxLength))
        .filter(Boolean)
    )
  ).slice(0, maxItems);
}

function ensureGridFitsPage(page: CopybookPage, grid: CopybookGrid) {
  const gridHeight = grid.rows * grid.cellHeight + Math.max(0, grid.rows - 1) * grid.rowGap;

  if (grid.x + grid.cols * grid.cellWidth > page.width + 0.001 || grid.y + gridHeight > page.height + 0.001) {
    throw invalidLayout("格子超出页面范围");
  }
}

function parseGridType(value: unknown, fallback: CopybookGridType): CopybookGridType {
  const type = stringValue(value, fallback);

  return gridTypes.has(type as CopybookGridType) ? (type as CopybookGridType) : fallback;
}

function parseGridVariant(value: unknown) {
  const variant = stringValue(value, "");

  return gridVariants.has(variant as CopybookGridVariant) ? { variant: variant as CopybookGridVariant } : {};
}

function colorValue(value: unknown, fallback: string) {
  const color = stringValue(value, fallback);

  return hexColorPattern.test(color) ? color : fallback;
}

function safeFontFamily(value: unknown) {
  const family = stringValue(value, "").trim();

  if (!family || family.length > 80) {
    return null;
  }

  return /^[\p{L}\p{N}\s._-]+$/u.test(family) ? family : null;
}

function safeFontUrl(value: unknown) {
  const url = stringValue(value, "").trim();

  if (!url || url.length > 1000 || /["'()<>\\]/.test(url)) {
    return null;
  }

  if (url.startsWith("/api/fonts/files/") || url.startsWith("/fonts/files/")) {
    return url;
  }

  try {
    const parsed = new URL(url);

    if ((parsed.protocol === "http:" || parsed.protocol === "https:") && parsed.pathname.includes("/fonts/files/")) {
      return url;
    }
  } catch {
    return null;
  }

  return null;
}

function safeWatermarkImageSrc(value: unknown) {
  const src = stringValue(value, "").trim();

  if (!src || src.length > 6_000_000) {
    return "";
  }

  return /^data:image\/(?:png|jpeg);base64,[a-z0-9+/=]+$/i.test(src) ? src : "";
}

function fontEncodingValue(value: unknown): CopybookFontEncoding {
  return value === "cns-pua" || value === "cns-ext-b" ? value : "unicode";
}

function stringValue(value: unknown, fallback: string) {
  return typeof value === "string" ? value : fallback;
}

function numberValue(value: unknown, fallback: number, min: number, max: number) {
  const parsed = typeof value === "number" ? value : Number(value ?? fallback);

  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw invalidLayout("布局数字参数超出允许范围");
  }

  return parsed;
}

function integerValue(value: unknown, fallback: number, min: number, max: number) {
  return Math.floor(numberValue(value, fallback, min, max));
}

function record(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw invalidLayout(message);
  }

  return value as Record<string, unknown>;
}

function maybeRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function invalidLayout(message: string) {
  return new AppException(40001, message, HttpStatus.BAD_REQUEST);
}
