import { createRequire } from "node:module";
import type { CopybookFontRegistration } from "../fonts/font-loader.js";
import { resolvePdfFontFamily } from "../fonts/font-loader.js";
import type { CopybookPageLayout } from "../core/layout-parser.js";
import { escapeXml } from "../svg/xml.js";

const require = createRequire(import.meta.url);
const SVGtoPDF = require("svg-to-pdfkit") as (
  doc: unknown,
  svg: string,
  x: number,
  y: number,
  options: Record<string, unknown>
) => void;

export interface PdfTextRun {
  family: string;
  text: string;
}

export type PdfGlyphSupport = (family: string, character: string) => boolean;

export function splitPdfTextRuns(
  text: string,
  family: string,
  registration: CopybookFontRegistration,
  supportsGlyph: PdfGlyphSupport
) {
  const candidates = pdfFontCandidates(family, registration);
  const defaultFamily = candidates[0] ?? resolvePdfFontFamily(family, registration);
  const runs: PdfTextRun[] = [];

  for (const character of Array.from(text)) {
    const selectedFamily = candidates.find((candidate) => supportsGlyph(candidate, character)) ?? defaultFamily;
    const previous = runs.at(-1);

    if (previous?.family === selectedFamily) {
      previous.text += character;
      continue;
    }

    runs.push({ family: selectedFamily, text: character });
  }

  return runs;
}

export function prepareSvgTextForPdf(
  svg: string,
  registration: CopybookFontRegistration,
  supportsGlyph: PdfGlyphSupport
) {
  return svg.replace(/<text\b([^>]*)>([^<]*)<\/text>/gu, (textNode, attributes: string, encodedText: string) => {
    const familyMatch = /\bfont-family="([^"]*)"/u.exec(attributes);

    if (!familyMatch) {
      return textNode;
    }

    const text = decodeXml(encodedText);
    const family = decodeXml(familyMatch[1] ?? "");
    const runs = splitPdfTextRuns(text, family, registration, supportsGlyph);
    const resolvedFamily = resolvePdfFontFamily(family, registration);

    if (runs.length === 0 || (runs.length === 1 && runs[0]?.family === resolvedFamily)) {
      return textNode;
    }

    const tspans = runs
      .map((run) => `<tspan font-family="${escapeXml(run.family)}">${escapeXml(run.text)}</tspan>`)
      .join("");

    return `<text${attributes}>${tspans}</text>`;
  });
}

function decodeXml(value: string) {
  return value
    .replaceAll("&apos;", "'")
    .replaceAll("&quot;", '"')
    .replaceAll("&gt;", ">")
    .replaceAll("&lt;", "<")
    .replaceAll("&amp;", "&");
}

function pdfFontCandidates(family: string, registration: CopybookFontRegistration) {
  const candidates = registration.customFonts
    .map((font) => ({ family: font.family, index: family.indexOf(font.family) }))
    .filter((font) => font.index >= 0)
    .sort((left, right) => left.index - right.index)
    .map((font) => font.family);

  const resolvedFamily = resolvePdfFontFamily(family, registration);
  candidates.push(resolvedFamily);

  if (registration.embedded) {
    candidates.push(registration.primaryFamily);

    if (registration.serifFamily) {
      candidates.push(registration.serifFamily);
    }

    if (registration.sansFamily) {
      candidates.push(registration.sansFamily);
    }
  }

  return Array.from(new Set(candidates));
}

export function drawSvgToPdf(
  doc: unknown,
  svg: string,
  layout: CopybookPageLayout,
  registration: CopybookFontRegistration
) {
  const preparedSvg = prepareSvgTextForPdf(
    svg,
    registration,
    (family, character) => pdfDocumentSupportsGlyph(doc, family, character)
  );

  SVGtoPDF(doc, preparedSvg, 0, 0, {
    width: layout.page.width,
    height: layout.page.height,
    preserveAspectRatio: "none",
    assumePt: true,
    fontCallback: (family: string) => resolvePdfFontFamily(family, registration),
    warningCallback: () => undefined
  });
}

interface PdfFontProbeDocument {
  font(family: string): unknown;
  _font?: {
    font?: {
      glyphForCodePoint(codePoint: number): { id?: number } | null | undefined;
    };
  };
}

function pdfDocumentSupportsGlyph(doc: unknown, family: string, character: string) {
  const codePoint = character.codePointAt(0);

  if (codePoint === undefined) {
    return false;
  }

  try {
    const pdfDocument = doc as PdfFontProbeDocument;
    pdfDocument.font(family);
    const glyph = pdfDocument._font?.font?.glyphForCodePoint(codePoint);

    return Boolean(glyph && glyph.id !== 0);
  } catch {
    return false;
  }
}
