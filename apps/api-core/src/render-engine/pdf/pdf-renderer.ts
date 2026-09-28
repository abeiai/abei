import { createRequire } from "node:module";
import { registerCopybookFonts } from "../fonts/font-loader.js";
import type { CopybookLayoutDocument } from "../core/layout-parser.js";
import { buildCopybookSvg } from "../svg/svg-builder.js";
import { drawSvgToPdf } from "./svg-to-pdf.js";

const require = createRequire(import.meta.url);
const PDFDocument = require("pdfkit") as new (options: Record<string, unknown>) => PdfKitDocument;

interface PdfKitDocument {
  addPage(options: Record<string, unknown>): PdfKitDocument;
  end(): void;
  on(event: "data", listener: (chunk: Buffer) => void): PdfKitDocument;
  on(event: "end", listener: () => void): PdfKitDocument;
  on(event: "error", listener: (error: Error) => void): PdfKitDocument;
  registerFont(name: string, src: string, family?: string): void;
}

export async function renderCopybookPdf(document: CopybookLayoutDocument) {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      autoFirstPage: false,
      compress: true,
      margin: 0,
      info: {
        Title: "字帖",
        Creator: "AI SaaS 字帖生成器"
      }
    });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    try {
      const fontRegistration = registerCopybookFonts(doc, document);

      for (const pageLayout of document.pages) {
        doc.addPage({
          size: [pageLayout.page.width, pageLayout.page.height],
          margin: 0
        });
        drawSvgToPdf(doc, buildCopybookSvg(pageLayout), pageLayout, fontRegistration);
      }

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}
