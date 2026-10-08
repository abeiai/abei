import { createRequire } from "node:module";

export async function guidePdfFixture(pageCount = 3): Promise<Buffer> {
  const PDFDocument = createRequire(import.meta.url)("pdfkit");
  const doc = new PDFDocument({ size: [300, 300], margin: 20 });
  const chunks: Buffer[] = [];
  const result = new Promise<Buffer>((resolve, reject) => { doc.on("data", (chunk: Buffer) => chunks.push(chunk)); doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject); });
  for (let index = 0; index < pageCount; index++) {
    if (index) doc.addPage();
    if (index === 0) doc.text("Bear packs a bag.");
    // An illustration-only page and a blank page must remain in the PDF page sequence.
    if (index === 1) doc.rect(50, 50, 150, 100).fill("#e58d3b");
  }
  doc.end();
  return result;
}
