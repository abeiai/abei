import { existsSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import type { CopybookLayoutDocument } from "../core/layout-parser.js";

export interface PdfFontDocument {
  registerFont(name: string, src: string, family?: string): void;
}

type CopybookBaseFontFamily = "Kaiti" | "Source Han Serif" | "Source Han Sans" | "Times-Roman";

export interface CopybookFontRegistration {
  primaryFamily: CopybookBaseFontFamily;
  embedded: boolean;
  path: string | null;
  serifFamily?: CopybookBaseFontFamily;
  serifPath?: string | null;
  sansFamily?: CopybookBaseFontFamily;
  sansPath?: string | null;
  customFonts: Array<{
    family: string;
    path: string;
  }>;
}

const preferredUploadFontNames = [
  "font-20260617-lxgw-wenkai-light.ttf",
  "font-20260623-lxgw-wenkai-tc-light.ttf",
  "font-20260617-hanchan-zhengkaiti.ttf",
  "font-20260617-zhangqingping-yingbi-kaishu.ttf",
  "font-20260617-mashanzheng-maobi-kaishu.ttf",
  "font-20260617-longzang-kaishu.otf",
  "font-20260617-mengyuan-songti-w9.ttc"
];

const systemKaitiFontCandidates = [
  "/System/Library/Fonts/Supplemental/Kaiti.ttc",
  "/System/Library/Fonts/Supplemental/NotoSansKaithi-Regular.ttf",
  "/usr/share/fonts/truetype/arphic/ukai.ttc"
];

const systemSerifFontCandidates = [
  "/usr/share/fonts/opentype/noto/NotoSerifCJK-Regular.ttc",
  "/usr/share/fonts/truetype/noto/NotoSerifCJK-Regular.ttc",
  "/usr/share/fonts/opentype/source-han-serif/SourceHanSerifSC-Regular.otf",
  "/Library/Fonts/SourceHanSerifSC-Regular.otf",
  "/System/Library/Fonts/Supplemental/Songti.ttc"
];

const systemSansFontCandidates = [
  "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
  "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
  "/usr/share/fonts/opentype/source-han-sans/SourceHanSansSC-Regular.otf",
  "/Library/Fonts/SourceHanSansSC-Regular.otf",
  "/System/Library/Fonts/Hiragino Sans GB.ttc",
  "/System/Library/Fonts/STHeiti Medium.ttc"
];

export function registerCopybookFonts(doc: PdfFontDocument, document?: CopybookLayoutDocument): CopybookFontRegistration {
  const fontPath = fontCandidates().find((candidate) => existsSync(candidate));
  const serifPath = serifFontCandidates().find((candidate) => existsSync(candidate));
  const sansPath = sansFontCandidates().find((candidate) => existsSync(candidate));
  const customFonts = registerCustomFonts(doc, document);
  const fallbackPath = fontPath ?? serifPath ?? sansPath;

  if (!fallbackPath) {
    return {
      primaryFamily: "Times-Roman",
      embedded: false,
      path: null,
      serifFamily: "Times-Roman",
      serifPath: null,
      sansFamily: "Times-Roman",
      sansPath: null,
      customFonts
    };
  }

  const primaryFamily = fontPath ? "Kaiti" : serifPath ? "Source Han Serif" : "Source Han Sans";
  const serifFamily = serifPath ? "Source Han Serif" : primaryFamily;
  const sansFamily = sansPath ? "Source Han Sans" : primaryFamily;

  if (fontPath) {
    doc.registerFont("Kaiti", fontPath, fontCollectionFace(fontPath, "primary"));
  }

  if (serifPath) {
    const serifFace = fontCollectionFace(serifPath, "serif");

    doc.registerFont("Source Han Serif", serifPath, serifFace);
    doc.registerFont("Songti SC", serifPath, serifFace);
  }

  if (sansPath) {
    doc.registerFont("Source Han Sans", sansPath, fontCollectionFace(sansPath, "sans"));
  }

  return {
    primaryFamily,
    embedded: true,
    path: fallbackPath,
    serifFamily,
    serifPath: serifPath ?? fallbackPath,
    sansFamily,
    sansPath: sansPath ?? fallbackPath,
    customFonts
  };
}

function fontCandidates() {
  return [
    process.env.COPYBOOK_FONT_PATH,
    resolve(process.cwd(), "fonts/Kaiti.ttf"),
    resolve(process.cwd(), "fonts/SourceHanSerifSC-Regular.otf"),
    resolve(process.cwd(), "../../fonts/Kaiti.ttf"),
    resolve(process.cwd(), "../../fonts/SourceHanSerifSC-Regular.otf"),
    ...preferredUploadFontNames.flatMap((name) => [
      resolve(fontUploadDir(), name),
      resolve(process.cwd(), "uploads/fonts", name),
      resolve(process.cwd(), "../../uploads/fonts", name)
    ]),
    ...systemKaitiFontCandidates
  ].filter(Boolean) as string[];
}

function serifFontCandidates() {
  return [
    process.env.COPYBOOK_SERIF_FONT_PATH,
    resolve(process.cwd(), "fonts/SourceHanSerifSC-Regular.otf"),
    resolve(process.cwd(), "../../fonts/SourceHanSerifSC-Regular.otf"),
    ...systemSerifFontCandidates,
    resolve(fontUploadDir(), "font-20260617-mengyuan-songti-w9.ttc"),
    resolve(process.cwd(), "uploads/fonts/font-20260617-mengyuan-songti-w9.ttc"),
    resolve(process.cwd(), "../../uploads/fonts/font-20260617-mengyuan-songti-w9.ttc")
  ].filter(Boolean) as string[];
}

function sansFontCandidates() {
  return [
    process.env.COPYBOOK_SANS_FONT_PATH,
    resolve(process.cwd(), "fonts/SourceHanSansSC-Regular.otf"),
    resolve(process.cwd(), "../../fonts/SourceHanSansSC-Regular.otf"),
    ...systemSansFontCandidates
  ].filter(Boolean) as string[];
}

function fontCollectionFace(path: string, role: "primary" | "serif" | "sans") {
  if (!path.toLowerCase().endsWith(".ttc")) {
    return undefined;
  }

  const configuredFace =
    role === "serif"
      ? process.env.COPYBOOK_SERIF_FONT_FACE
      : role === "sans"
        ? process.env.COPYBOOK_SANS_FONT_FACE
        : process.env.COPYBOOK_FONT_FACE;

  if (configuredFace) {
    return configuredFace;
  }

  const name = basename(path).toLowerCase();

  if (name === "notoserifcjk-regular.ttc") {
    return "NotoSerifCJKsc-Regular";
  }

  if (name === "notosanscjk-regular.ttc") {
    return "NotoSansCJKsc-Regular";
  }

  if (name === "songti.ttc") {
    return "STSongti-SC-Regular";
  }

  if (name === "hiragino sans gb.ttc") {
    return "HiraginoSansGB-W3";
  }

  if (name === "stheiti medium.ttc") {
    return "STHeitiSC-Medium";
  }

  if (name === "font-20260617-mengyuan-songti-w9.ttc") {
    return "DreamHanSerifSC-W9";
  }

  return undefined;
}

export function resolvePdfFontFamily(family: string, registration: CopybookFontRegistration) {
  const customFont = registration.customFonts
    .map((font) => ({
      ...font,
      index: family.indexOf(font.family)
    }))
    .filter((font) => font.index >= 0)
    .sort((left, right) => left.index - right.index)[0];

  if (customFont) {
    return customFont.family;
  }

  if (!registration.embedded) {
    return "Times-Roman";
  }

  if (family.includes("Source Han Sans") || family.includes("Noto Sans CJK") || family.includes("Noto Sans SC")) {
    return registration.sansFamily ?? registration.primaryFamily;
  }

  if (family.includes("Source Han Serif") || family.includes("Songti")) {
    return registration.serifFamily ?? "Source Han Serif";
  }

  return registration.primaryFamily;
}

function registerCustomFonts(doc: PdfFontDocument, document?: CopybookLayoutDocument) {
  if (!document) {
    return [];
  }

  const customFonts: Array<{ family: string; path: string }> = [];
  const registered = new Set<string>();

  for (const page of document.pages) {
    if (page.style.customFontFallbackFamily && page.style.customFontFallbackUrl) {
      registerCustomFont(doc, customFonts, registered, page.style.customFontFallbackFamily, page.style.customFontFallbackUrl);
    }

    if (page.style.pinyinFontFamily && page.style.pinyinFontUrl) {
      registerCustomFont(doc, customFonts, registered, page.style.pinyinFontFamily, page.style.pinyinFontUrl);
    }

    if (page.style.font !== "custom" || !page.style.customFontFamily || !page.style.customFontUrl) {
      continue;
    }

    registerCustomFont(doc, customFonts, registered, page.style.customFontFamily, page.style.customFontUrl);
  }

  return customFonts;
}

function registerCustomFont(
  doc: PdfFontDocument,
  customFonts: Array<{ family: string; path: string }>,
  registered: Set<string>,
  family: string,
  fontUrl: string
) {
  const fontPath = localFontPathFromUrl(fontUrl);
  const key = `${family}:${fontPath}`;

  if (!fontPath || registered.has(key) || !existsSync(fontPath)) {
    return;
  }

  doc.registerFont(family, fontPath);
  customFonts.push({
    family,
    path: fontPath
  });
  registered.add(key);
}

function localFontPathFromUrl(fontUrl: string) {
  let pathname: string;

  try {
    pathname = new URL(fontUrl).pathname;
  } catch {
    pathname = fontUrl;
  }

  if (!pathname.includes("/fonts/files/")) {
    return null;
  }

  return resolve(fontUploadDir(), basename(pathname));
}

function fontUploadDir() {
  return resolve(process.env.UPLOAD_DIR ?? join(process.cwd(), "uploads"), "fonts");
}
