import assert from "node:assert/strict";
import test from "node:test";
import { courseCatalogLanguages, courseCatalogTitle } from "../src/lib/course-catalog-languages.js";
const items = [{ displayName: "创造", titleTranslations: [{ language: "en", title: "The Creation" }] }, { displayName: "洪水" }];
test("目录列出可用译名语种，缺失译名的课件保留原名称", () => {
  assert.deepEqual(courseCatalogLanguages(items), ["en"]);
  assert.equal(courseCatalogTitle(items[0]!, "en"), "The Creation");
  assert.equal(courseCatalogTitle(items[1]!, "en"), "洪水");
  assert.equal(courseCatalogTitle(items[0]!, "original"), "创造");
  assert.deepEqual(courseCatalogLanguages([{ displayName: "只有中文" }]), []);
  assert.deepEqual(courseCatalogLanguages([{ displayName: "尚无标题译文", languages: ["en"] }]), ["en"]);
});
