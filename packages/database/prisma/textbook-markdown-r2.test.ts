import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildTextbookMarkdownR2Plan,
  contentTypeForMarkdownAsset,
  normalizeS3Config
} from "./textbook-markdown-r2.js";

describe("textbook markdown r2 helpers", () => {
  it("builds stable object keys and public urls for markdown files and assets", () => {
    const config = normalizeS3Config({
      accessKeyId: "key",
      bucket: "xueleai",
      endpoint: "https://example.r2.cloudflarestorage.com",
      pathStyle: true,
      prefix: "learning-materials/textbooks/",
      publicBaseUrl: "https://cdn.xueleai.com/r2/",
      region: "auto",
      secretAccessKey: "secret"
    });

    const plan = buildTextbookMarkdownR2Plan({
      assetBaseUrl: "/api/textbooks/book-01/markdown-assets",
      config,
      markdownContent: "![第1页](/api/textbooks/book-01/markdown-assets/pages/page-001.png)",
      slug: "smartedu-book-01",
      textbookId: "book-01"
    });

    assert.equal(plan.markdownObjectKey, "learning-materials/textbooks/markdown/book-01/textbook.md");
    assert.equal(plan.markdownUrl, "https://cdn.xueleai.com/r2/learning-materials/textbooks/markdown/book-01/textbook.md");
    assert.equal(plan.assetPrefix, "learning-materials/textbooks/markdown-assets/book-01/");
    assert.equal(plan.assetBaseUrl, "https://cdn.xueleai.com/r2/learning-materials/textbooks/markdown-assets/book-01");
    assert.equal(
      plan.markdownContent,
      "![第1页](https://cdn.xueleai.com/r2/learning-materials/textbooks/markdown-assets/book-01/pages/page-001.png)"
    );
  });

  it("keeps existing markdown content when asset base url is absent", () => {
    const config = normalizeS3Config({
      accessKeyId: "key",
      bucket: "xueleai",
      endpoint: "https://example.r2.cloudflarestorage.com",
      pathStyle: false,
      prefix: "xueleai",
      region: "auto",
      secretAccessKey: "secret"
    });

    const plan = buildTextbookMarkdownR2Plan({
      assetBaseUrl: null,
      config,
      markdownContent: "# 教材\n",
      slug: "smartedu-book-01",
      textbookId: "book-01"
    });

    assert.equal(plan.markdownObjectKey, "xueleai/markdown/book-01/textbook.md");
    assert.equal(plan.markdownContent, "# 教材\n");
    assert.equal(
      plan.markdownUrl,
      "https://xueleai.example.r2.cloudflarestorage.com/xueleai/markdown/book-01/textbook.md"
    );
  });

  it("detects useful content types for markdown assets", () => {
    assert.equal(contentTypeForMarkdownAsset("page-001.png"), "image/png");
    assert.equal(contentTypeForMarkdownAsset("diagram.webp"), "image/webp");
    assert.equal(contentTypeForMarkdownAsset("formula.svg"), "image/svg+xml");
    assert.equal(contentTypeForMarkdownAsset("notes.txt"), "application/octet-stream");
  });
});
