import { createRequire } from "node:module";
import { AppException } from "../common/app-exception.js";
import { registerCopybookFonts, type PdfFontDocument } from "../render-engine/fonts/font-loader.js";
import { guidePdfMaxBytes } from "./picture-book-guide-content.js";

const require = createRequire(import.meta.url);
interface BookPdf extends PdfFontDocument {
  on(event: "data", listener: (chunk: Buffer) => void): void;
  on(event: "end", listener: () => void): void;
  on(event: "error", listener: (error: Error) => void): void;
  addPage(options: Record<string, unknown>): void;
  font(name: string): BookPdf;
  fontSize(size: number): BookPdf;
  text(text: string, x: number, y: number, options: Record<string, unknown>): void;
  heightOfString(text: string, options: Record<string, unknown>): number;
  image(image: Buffer, x: number, y: number, options: Record<string, unknown>): void;
  end(): void;
  destroy(error?: Error): void;
}
const PDFDocument = require("pdfkit") as new (options: Record<string, unknown>) => BookPdf;
// Use the same native image runtime already bundled with the PDF renderer.
const canvas = createRequire(require.resolve("pdfjs-dist/package.json"))("@napi-rs/canvas") as {
  loadImage(buffer: Buffer): Promise<{ width: number; height: number }>;
  createCanvas(width: number, height: number): {
    width: number; height: number;
    getContext(type: "2d"): { fillStyle: string; fillRect(x: number, y: number, width: number, height: number): void; drawImage(image: unknown, x: number, y: number, width: number, height: number): void };
    toBuffer(type: "image/jpeg", quality: number): Buffer;
  };
};

export async function guideBookPdf(book: { title: string; aspectRatio: string; pages: Array<{ caption: string; narration: string; imageUrl: string | null }> }, readImage: (url: string) => Promise<Buffer>) {
  const document = new PDFDocument({ autoFirstPage: false, margin: 0, info: { Title: book.title, Creator: "阿贝智能绘本导读" } });
  const chunks: Buffer[] = [];
  let size = 0;
  const result = new Promise<Buffer>((resolve, reject) => {
    document.on("data", chunk => {
      size += chunk.length;
      if (size > guidePdfMaxBytes) document.destroy(new AppException(40001, "绘本文件超过 200MB，请减少页面后重试", 400));
      else chunks.push(chunk);
    });
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.on("error", reject);
  });
  // Attach a rejection handler while images are being fetched.
  void result.catch(() => undefined);
  try {
    document.font(registerCopybookFonts(document).sansFamily ?? "Times-Roman").fontSize(16);
    const ratios: Record<string, number> = { "1:1": 1, "3:2": 1.5, "2:3": 2 / 3, "4:3": 4 / 3, "3:4": 0.75 };
    const width = 720, imageHeight = width / (ratios[book.aspectRatio] ?? 1);
    for (const page of book.pages) {
      const caption = (page.caption || page.narration).trim();
      if (caption.length > 3000) throw new AppException(40001, "绘本单页配文过长，请缩短后重试", 400);
      const captionHeight = caption ? Math.max(90, Math.ceil(document.heightOfString(caption, { width: width - 48, lineGap: 5 })) + 40) : 0;
      document.addPage({ size: [width, imageHeight + captionHeight], margin: 0 });
      if (page.imageUrl) {
        const image = await canvas.loadImage(await readImage(page.imageUrl));
        const scale = Math.min(1, 1200 / Math.max(image.width, image.height));
        const drawing = canvas.createCanvas(Math.max(1, Math.round(image.width * scale)), Math.max(1, Math.round(image.height * scale)));
        const context = drawing.getContext("2d");
        context.fillStyle = "white"; context.fillRect(0, 0, drawing.width, drawing.height);
        context.drawImage(image, 0, 0, drawing.width, drawing.height);
        document.image(drawing.toBuffer("image/jpeg", 90), 0, 0, { fit: [width, imageHeight], align: "center", valign: "center" });
        drawing.width = 1; drawing.height = 1;
      }
      if (caption) document.text(caption, 24, imageHeight + 16, { width: width - 48, height: captionHeight - 24, lineGap: 5, align: "center" });
    }
    document.end();
    return await result;
  } catch (error) {
    document.destroy();
    if (error instanceof AppException) throw error;
    throw new AppException(50201, "绘本页面读取失败，请稍后重试", 502);
  }
}
