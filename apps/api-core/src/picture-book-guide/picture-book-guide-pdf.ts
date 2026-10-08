import { writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, sep } from "node:path";
import { AppException } from "../common/app-exception.js";
import { guidePdfMaxPages, type GuidePage } from "./picture-book-guide-content.js";

const pdfAssets = dirname(createRequire(import.meta.url).resolve("pdfjs-dist/package.json"));

export async function renderGuidePdf(buffer: Buffer, directory: string): Promise<GuidePage[]> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loading = getDocument({ data: new Uint8Array(buffer), useSystemFonts: true,
    cMapPacked: true, cMapUrl: `${join(pdfAssets, "cmaps")}${sep}`, standardFontDataUrl: `${join(pdfAssets, "standard_fonts")}${sep}` });
  try {
    const document = await loading.promise;
    const factory = document.canvasFactory as import("pdfjs-dist/types/src/display/node_utils.js").NodeCanvasFactory;
    if (!document.numPages || document.numPages > guidePdfMaxPages) throw new AppException(40001, "PDF 须为 1—80 页，请拆分后上传", 400);
    const pages: GuidePage[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
      const page = await document.getPage(pageNumber);
      const base = page.getViewport({ scale: 1 });
      if (!Number.isFinite(base.width + base.height) || base.width <= 0 || base.height <= 0 || Math.max(base.width, base.height) > 20000) throw new AppException(40001, "PDF 页面尺寸异常，请重新导出后上传", 400);
      const viewport = page.getViewport({ scale: Math.min(2, 1200 / Math.max(base.width, base.height)) });
      const canvas = factory.create(Math.ceil(viewport.width), Math.ceil(viewport.height));
      try {
        await page.render({ canvas: canvas.canvas, canvasContext: canvas.context, viewport }).promise;
        const image = (canvas.canvas as unknown as { toBuffer(type: "image/png"): Buffer }).toBuffer("image/png");
        await writeFile(join(directory, `page-${pageNumber}.png`), image);
      } finally { factory.destroy(canvas); }
      const content = await page.getTextContent();
      const sourceText = content.items.map(item => "str" in item ? `${item.str}${item.hasEOL ? "\n" : " "}` : "").join("").trim();
      if (sourceText.length > 12000) throw new AppException(40001, "PDF 单页文字过多，请拆分页后上传", 400);
      pages.push({ pageNumber, sourceText, script: "", audioTaskId: null, audioMimeType: null, audioVoice: null, audioSpeed: null });
      page.cleanup();
    }
    return pages;
  } catch (error) {
    if (error instanceof AppException) throw error;
    throw new AppException(40001, "PDF 无法解析，请确认未加密且文件完整，重新导出后上传", 400);
  } finally { await loading.destroy(); }
}
