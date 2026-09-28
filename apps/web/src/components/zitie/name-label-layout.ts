export const POINTS_PER_CM = 72 / 2.54;

export type NameLabelSeparatorMode = "blank-line" | "custom";
export type NameLabelColumnsMode = "auto" | "manual";
export type NameLabelTextLayout = "auto" | "center" | "field-line";
export type NameLabelBorderStyle = "single" | "double";
export type NameLabelPageMarginPreset = "normal" | "medium" | "narrow" | "none";

export const nameLabelPageMarginPresets: Record<
  NameLabelPageMarginPreset,
  { label: string; top: number; bottom: number; left: number; right: number }
> = {
  normal: { label: "常规", top: 2.54, bottom: 2.54, left: 3.18, right: 3.18 },
  medium: { label: "中等", top: 1.91, bottom: 1.91, left: 1.91, right: 1.91 },
  narrow: { label: "窄", top: 1.27, bottom: 1.27, left: 1.27, right: 1.27 },
  none: { label: "无", top: 0, bottom: 0, left: 0, right: 0 },
};

export interface NameLabelSheetGeometryInput {
  pageWidth: number;
  pageHeight: number;
  pageMarginPreset: NameLabelPageMarginPreset;
  labelWidthCm: number;
  labelHeightCm: number;
  verticalGapCm: number;
  columnsMode: NameLabelColumnsMode;
  manualColumns: number;
}

export interface NameLabelSheetGeometry {
  columns: number;
  rows: number;
  capacity: number;
  labelWidth: number;
  labelHeight: number;
  horizontalGap: number;
  verticalGap: number;
  x: number;
  y: number;
  maxColumns: number;
}

export interface NameLabelFieldLine {
  field: string;
  value: string;
  hasField: boolean;
}

export function centimetersToPoints(value: number) {
  return value * POINTS_PER_CM;
}

export function clampSteppedNumber(
  value: number | string,
  min: number,
  max: number,
  step: number,
) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return min;
  }

  const clamped = Math.min(max, Math.max(min, parsed));

  if (!Number.isFinite(step) || step <= 0) {
    return clamped;
  }

  const normalized = min + Math.round((clamped - min) / step) * step;
  const precision = Math.max(decimalPlaces(min), decimalPlaces(max), decimalPlaces(step));

  return Number(Math.min(max, Math.max(min, normalized)).toFixed(precision));
}

export function parseNameLabelGroups(
  input: string,
  mode: NameLabelSeparatorMode,
  customSeparator: string,
) {
  const lines = input.replace(/\r\n?/g, "\n").split("\n");
  const separator = customSeparator.trim();
  const groups: string[][] = [];
  let current: string[] = [];

  const flush = () => {
    const normalized = trimEmptyEdges(current.map((line) => line.trim()));

    if (normalized.some(Boolean)) {
      groups.push(normalized);
    }
    current = [];
  };

  for (const line of lines) {
    const isSeparator = mode === "custom"
      ? Boolean(separator) && line.trim() === separator
      : line.trim() === "";

    if (isSeparator) {
      flush();
      continue;
    }

    current.push(line);
  }

  flush();

  return groups;
}

export function paginateNameLabelGroups(groups: string[][], capacity: number) {
  const pageCapacity = Math.floor(capacity);

  if (pageCapacity <= 0 || groups.length === 0) {
    return [];
  }

  const pages: string[][][] = [];

  for (let start = 0; start < groups.length; start += pageCapacity) {
    pages.push(groups.slice(start, start + pageCapacity));
  }

  return pages;
}

export function splitNameLabelFieldLine(line: string): NameLabelFieldLine {
  const match = /^([^:：]{1,24})[:：]\s*(.*)$/u.exec(line.trim());

  if (!match) {
    return {
      field: "",
      value: line.trim(),
      hasField: false,
    };
  }

  return {
    field: `${match[1]?.trim() ?? ""}：`,
    value: match[2]?.trim() ?? "",
    hasField: true,
  };
}

export function buildNameLabelSheetGeometry(input: NameLabelSheetGeometryInput): NameLabelSheetGeometry {
  const labelWidth = centimetersToPoints(input.labelWidthCm);
  const labelHeight = centimetersToPoints(input.labelHeightCm);
  const verticalGap = centimetersToPoints(input.verticalGapCm);
  const pageMargins = nameLabelPageMarginsToPoints(input.pageMarginPreset);
  const availableWidth = Math.max(0, input.pageWidth - pageMargins.left - pageMargins.right);
  const availableHeight = Math.max(0, input.pageHeight - pageMargins.top - pageMargins.bottom);
  const maxColumns = Math.max(0, Math.floor((availableWidth + 0.001) / labelWidth));
  const maxRows = Math.max(0, Math.floor((availableHeight + verticalGap) / (labelHeight + verticalGap)));
  const requestedColumns = Math.max(1, Math.floor(input.manualColumns));
  const columns = input.columnsMode === "manual" ? Math.min(requestedColumns, maxColumns) : maxColumns;
  const rows = maxRows;
  const horizontalGap = columns > 1
    ? Math.max(0, (availableWidth - columns * labelWidth) / (columns - 1))
    : 0;
  const sheetWidth = columns > 0 ? columns * labelWidth + Math.max(0, columns - 1) * horizontalGap : 0;
  const sheetHeight = rows > 0 ? rows * labelHeight + Math.max(0, rows - 1) * verticalGap : 0;

  return {
    columns,
    rows,
    capacity: columns * rows,
    labelWidth,
    labelHeight,
    horizontalGap,
    verticalGap,
    x: columns === 1
      ? pageMargins.left + (availableWidth - sheetWidth) / 2
      : pageMargins.left,
    y: pageMargins.top + (availableHeight - sheetHeight) / 2,
    maxColumns,
  };
}

export function nameLabelPageMarginsToPoints(preset: NameLabelPageMarginPreset) {
  const margins = nameLabelPageMarginPresets[preset];

  return {
    top: centimetersToPoints(margins.top),
    bottom: centimetersToPoints(margins.bottom),
    left: centimetersToPoints(margins.left),
    right: centimetersToPoints(margins.right),
  };
}

function trimEmptyEdges(lines: string[]) {
  let start = 0;
  let end = lines.length;

  while (start < end && !lines[start]) {
    start += 1;
  }
  while (end > start && !lines[end - 1]) {
    end -= 1;
  }

  return lines.slice(start, end);
}

function decimalPlaces(value: number) {
  const [, fraction = ""] = String(value).split(".");

  return fraction.length;
}
