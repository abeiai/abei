import assert from "node:assert/strict";
import test from "node:test";
import {
  isPrivateR2Url,
  publicTextbookObjectUrl,
  publicTextbookObjectUrlFromStoredUrl
} from "../src/learning-materials/textbook-object-url.js";

test("builds public Cloudflare CDN urls for textbook object keys", () => {
  assert.equal(
    publicTextbookObjectUrl("learning-materials/textbooks/smartedu-pdfs/book.pdf", "https://cdn.xueleai.com/"),
    "https://cdn.xueleai.com/learning-materials/textbooks/smartedu-pdfs/book.pdf"
  );
});

test("converts stored private R2 urls to public Cloudflare CDN urls", () => {
  assert.equal(
    publicTextbookObjectUrlFromStoredUrl(
      "https://example-account.r2.cloudflarestorage.com/xueleai/learning-materials/textbooks/smartedu-pdfs/book.pdf",
      "https://cdn.xueleai.com"
    ),
    "https://cdn.xueleai.com/learning-materials/textbooks/smartedu-pdfs/book.pdf"
  );
  assert.equal(isPrivateR2Url("https://example-account.r2.cloudflarestorage.com/xueleai/object.pdf"), true);
});
