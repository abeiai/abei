import assert from "node:assert/strict";
import test from "node:test";
import { assertNarrationSource, assertNarrationApproval, assertNarrationReviewState, narrationKey, planNarrationEntry, applyNarrationPages } from "./lele-narration.mjs";

const book = () => ({ id: "abei-lele-rabbit", userId: "abei-lele-studio", title: "等等我，小兔", status: "COMPLETED", pageCount: 12, pages: Array.from({ length: 13 }, (_, position) => ({ position, caption: "乐乐说：“等等我！”", narration: "乐乐说：“等等我！”", imageUrl: `/p/${position}.webp`, audioUrl: null })) });
const ready = page => ({ key: narrationKey("abei-lele-rabbit", page), status: "READY", voice: "yezhiqing_v3.1", url: "https://cdn.abei.example/a.mp3", assetId: "asset-1" });

test("配音只修改目标作者作品的音频，不覆盖文字、插画和目录", () => {
  const expected = book();
  assert.doesNotThrow(() => assertNarrationSource(book(), expected));
  for (const field of ["userId", "title", "status", "pageCount"]) {
    assert.throws(() => assertNarrationSource({ ...book(), [field]: "changed" }, expected), /作品|修改/);
  }
  for (const field of ["caption", "narration", "imageUrl", "position"]) {
    const changed = book(); changed.pages[1][field] = "changed";
    assert.throws(() => assertNarrationSource(changed, expected), /作品|修改/);
  }
});

test("断点恢复复用同一音色和文稿的文件，未知请求结果禁止重复付费调用", () => {
  const page = book().pages[1];
  assert.equal(planNarrationEntry(undefined, "abei-lele-rabbit", page), "GENERATE");
  assert.equal(planNarrationEntry(ready(page), "abei-lele-rabbit", page), "REUSE");
  assert.equal(planNarrationEntry({ ...ready(page), status: "GENERATED", payloadFile: "page.json" }, "abei-lele-rabbit", page), "STORE");
  assert.throws(() => planNarrationEntry({ ...ready(page), status: "REQUESTING" }, "abei-lele-rabbit", page), /结果未知/);
  assert.throws(() => planNarrationEntry({ ...ready(page), status: "FAILED_RESPONSE", failure: { httpStatus: 502, code: "PROVIDER_TIMEOUT" }, attempts: 1 }, "abei-lele-rabbit", page), /结果未知/);
  assert.equal(planNarrationEntry({ ...ready(page), status: "FAILED_RESPONSE", failure: { httpStatus: 502, operatorReviewed: true }, attempts: 1 }, "abei-lele-rabbit", page), "GENERATE");
  assert.throws(() => planNarrationEntry({ ...ready(page), status: "FAILED_RESPONSE", failure: { httpStatus: 502, operatorReviewed: true }, attempts: 3 }, "abei-lele-rabbit", page), /失败次数/);
  assert.throws(() => planNarrationEntry({ ...ready(page), voice: "other" }, "abei-lele-rabbit", page), /音色|文稿/);
  assert.throws(() => planNarrationEntry({ ...ready(page), key: "changed" }, "abei-lele-rabbit", page), /音色|文稿/);
});

test("配音发布重跑不能绕过管理员拒绝或覆盖其他待审内容", () => {
  const target = { title: "绘本", pages: [{ audioUrl: "https://cdn.abei.example/a.mp3" }] };
  assert.doesNotThrow(() => assertNarrationReviewState({ status: "APPROVED" }, null, target));
  assert.doesNotThrow(() => assertNarrationReviewState({ status: "PENDING" }, { status: "PENDING", afterSnapshot: target }, target));
  assert.throws(() => assertNarrationReviewState({ status: "REJECTED" }, null, target), /拒绝/);
  assert.throws(() => assertNarrationReviewState({ status: "APPROVED" }, { status: "REJECTED" }, target), /拒绝/);
  assert.throws(() => assertNarrationReviewState({ status: "PENDING" }, { status: "PENDING", afterSnapshot: {} }, target), /待审/);
});

test("只有整本13段都就绪才替换音频，保留中文双引号并拒绝覆盖人工音频", () => {
  const source = book();
  const entries = Object.fromEntries(source.pages.map(page => [page.position, ready(page)]));
  const pages = applyNarrationPages(source, entries);
  assert.equal(pages.length, 13);
  assert.equal(pages[1].narration, source.pages[1].narration);
  assert.equal(pages[1].audioUrl, entries[1].url);
  assert.equal(source.pages[1].audioUrl, null);
  assert.throws(() => applyNarrationPages(source, { ...entries, 12: undefined }), /就绪/);
  const edited = book(); edited.pages[1].audioUrl = "https://other.example/manual.mp3";
  assert.throws(() => applyNarrationPages(edited, entries), /音频.*修改/);
  assert.deepEqual(applyNarrationPages({ ...source, pages }, entries), pages);
});

test("自动审核仅允许预定配音快照，拒绝混入并发人工修改", () => {
  const target = { title: "等等我，小兔", pages: [{ caption: "原文", audioUrl: "https://cdn.abei.example/a.mp3" }] };
  assert.doesNotThrow(() => assertNarrationApproval(target, structuredClone(target), structuredClone(target)));
  const edited = structuredClone(target); edited.pages[0].caption = "人工修改";
  assert.throws(() => assertNarrationApproval(target, edited, target), /审核.*授权/);
  assert.throws(() => assertNarrationApproval(target, target, edited), /审核.*授权/);
});
