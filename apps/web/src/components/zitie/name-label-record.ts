import {
  type NameLabelBorderStyle,
  type NameLabelColumnsMode,
  type NameLabelPageMarginPreset,
  type NameLabelSeparatorMode,
  type NameLabelTextLayout
} from "./name-label-layout";

export type NameLabelRecordPaperSize = "A4" | "B5";
export type NameLabelRecordTheme = "green-red" | "green-black" | "red-black";

export interface NameLabelOptions {
  pageMarginPreset: NameLabelPageMarginPreset;
  labelWidthCm: number;
  labelHeightCm: number;
  verticalGapCm: number;
  columnsMode: NameLabelColumnsMode;
  manualColumns: number;
  separatorMode: NameLabelSeparatorMode;
  customSeparator: string;
  textLayout: NameLabelTextLayout;
  showUnderline: boolean;
  backgroundImageSrc: string;
  backgroundImageName: string;
  showBorder: boolean;
  borderStyle: NameLabelBorderStyle;
  borderColor: string;
  borderWidth: number;
  borderRadiusCm: number;
  innerBorderColor: string;
  innerBorderWidth: number;
  innerBorderRadiusCm: number;
  lineHeight: number;
  horizontalPaddingCm: number;
}

export interface NameLabelRecordSourceConfig {
  version: 1;
  templateId: "name-label";
  content: string;
  paperSize: NameLabelRecordPaperSize;
  fontSize: number;
  selectedFontId: string;
  theme: NameLabelRecordTheme;
  colors: {
    stroke: string;
    guide: string;
    text: string;
    trace: string;
  };
  rosterMode: boolean;
  options: NameLabelOptions;
}

export const defaultNameLabelOptions: NameLabelOptions = {
  pageMarginPreset: "narrow",
  labelWidthCm: 6,
  labelHeightCm: 4,
  verticalGapCm: 0.3,
  columnsMode: "auto",
  manualColumns: 2,
  separatorMode: "blank-line",
  customSeparator: "---",
  textLayout: "auto",
  showUnderline: true,
  backgroundImageSrc: "",
  backgroundImageName: "",
  showBorder: true,
  borderStyle: "double",
  borderColor: "#1446DC",
  borderWidth: 2,
  borderRadiusCm: 0.4,
  innerBorderColor: "#666666",
  innerBorderWidth: 0.75,
  innerBorderRadiusCm: 0.3,
  lineHeight: 2,
  horizontalPaddingCm: 0.5
};

export function createNameLabelRecordSourceConfig(
  input: Omit<NameLabelRecordSourceConfig, "version" | "templateId">
): NameLabelRecordSourceConfig {
  return {
    ...input,
    options: { ...input.options },
    version: 1,
    templateId: "name-label"
  };
}

export function parseNameLabelRecordSourceConfig(value: unknown): NameLabelRecordSourceConfig | null {
  if (!isObject(value) || value.version !== 1 || value.templateId !== "name-label") {
    return null;
  }

  if (
    typeof value.content !== "string" ||
    value.content.length > 50_000 ||
    !isPaperSize(value.paperSize) ||
    !isFiniteNumber(value.fontSize, 8, 60) ||
    typeof value.selectedFontId !== "string" ||
    value.selectedFontId.length > 200 ||
    !isTheme(value.theme) ||
    typeof value.rosterMode !== "boolean" ||
    !isColors(value.colors) ||
    !isNameLabelOptions(value.options)
  ) {
    return null;
  }

  return value as unknown as NameLabelRecordSourceConfig;
}

function isNameLabelOptions(value: unknown): value is NameLabelOptions {
  if (!isObject(value)) {
    return false;
  }

  return (
    ["normal", "medium", "narrow", "none"].includes(String(value.pageMarginPreset)) &&
    isFiniteNumber(value.labelWidthCm, 1, 30) &&
    isFiniteNumber(value.labelHeightCm, 1, 30) &&
    isFiniteNumber(value.verticalGapCm, 0, 10) &&
    ["auto", "manual"].includes(String(value.columnsMode)) &&
    isFiniteNumber(value.manualColumns, 1, 20) &&
    ["blank-line", "custom"].includes(String(value.separatorMode)) &&
    typeof value.customSeparator === "string" &&
    value.customSeparator.length <= 100 &&
    ["auto", "center", "field-line"].includes(String(value.textLayout)) &&
    typeof value.showUnderline === "boolean" &&
    typeof value.backgroundImageSrc === "string" &&
    value.backgroundImageSrc.length <= 6 * 1024 * 1024 &&
    typeof value.backgroundImageName === "string" &&
    value.backgroundImageName.length <= 500 &&
    typeof value.showBorder === "boolean" &&
    ["single", "double"].includes(String(value.borderStyle)) &&
    isColor(value.borderColor) &&
    isFiniteNumber(value.borderWidth, 0, 20) &&
    isFiniteNumber(value.borderRadiusCm, 0, 10) &&
    isColor(value.innerBorderColor) &&
    isFiniteNumber(value.innerBorderWidth, 0, 20) &&
    isFiniteNumber(value.innerBorderRadiusCm, 0, 10) &&
    isFiniteNumber(value.lineHeight, 0.8, 2.5) &&
    isFiniteNumber(value.horizontalPaddingCm, 0, 10)
  );
}

function isColors(value: unknown): value is NameLabelRecordSourceConfig["colors"] {
  return (
    isObject(value) &&
    isColor(value.stroke) &&
    isColor(value.guide) &&
    isColor(value.text) &&
    isColor(value.trace)
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isPaperSize(value: unknown): value is NameLabelRecordPaperSize {
  return value === "A4" || value === "B5";
}

function isTheme(value: unknown): value is NameLabelRecordTheme {
  return value === "green-red" || value === "green-black" || value === "red-black";
}

function isColor(value: unknown) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}

function isFiniteNumber(value: unknown, min: number, max: number) {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}
