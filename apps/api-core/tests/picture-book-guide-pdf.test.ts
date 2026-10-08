import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { renderGuidePdf } from "../src/picture-book-guide/picture-book-guide-pdf.js";

import { guidePdfFixture } from "./fixtures/picture-book-guide-fixture.js";

test("保留文字页、无文字插画页和空白页，并渲染独立预览", async () => {
  const directory = await mkdtemp(join(tmpdir(), "abei-guide-pdf-"));
  try {
    const pages = await renderGuidePdf(await guidePdfFixture(), directory);
    assert.deepEqual(pages.map(page => page.pageNumber), [1, 2, 3]);
    assert.match(pages[0]!.sourceText, /Bear packs a bag/);
    assert.equal(pages[1]!.sourceText, "");
    assert.equal(pages[2]!.sourceText, "");
    for (const page of pages) {
      const image = await readFile(join(directory, `page-${page.pageNumber}.png`));
      assert.equal(image.subarray(1, 4).toString(), "PNG");
      assert.equal(page.script, "");
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test("拒绝损坏 PDF 和超过 80 页的文档", async () => {
  const directory = await mkdtemp(join(tmpdir(), "abei-guide-limit-"));
  try {
    await assert.rejects(renderGuidePdf(Buffer.from("%PDF-broken"), directory), /PDF/);
    await assert.rejects(renderGuidePdf(await guidePdfFixture(81), directory), /80/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
