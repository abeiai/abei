import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

export const leleNarrationVoice = "yezhiqing_v3.1";
export function assertNarrationReviewState(publication, latest, target) {
  if (!publication || publication.status === "REJECTED" || latest?.status === "REJECTED") throw new Error("课件变更已被拒绝，不能自动重审");
  if (publication.status === "PENDING" || latest?.status === "PENDING") {
    if (latest?.status !== "PENDING" || !isDeepStrictEqual(latest.afterSnapshot, target)) throw new Error("既存待审内容与本次配音不一致");
  }
}
export function assertNarrationApproval(target, current, submitted) {
  if (!isDeepStrictEqual(target, current) || !isDeepStrictEqual(target, submitted)) throw new Error("审核内容超出配音授权，请人工核对");
}
export function assertNarrationSource(current, expected) {
  if (!current || Object.keys(expected).some(key => key !== "pages" && !isDeepStrictEqual(current[key], expected[key]))) throw new Error("作品信息已修改，不能覆盖");
  const withoutAudio = pages => pages?.map(({ audioUrl, audioTaskId, ...page }) => page);
  if (!isDeepStrictEqual(withoutAudio(current.pages), withoutAudio(expected.pages))) throw new Error("作品文稿或插画已修改，不能覆盖");
}

export function narrationKey(bookId, page) {
  return createHash("sha256").update(JSON.stringify([bookId, page.position, page.narration, leleNarrationVoice])).digest("hex");
}

export function planNarrationEntry(entry, bookId, page) {
  if (!entry) return "GENERATE";
  if (entry.key !== narrationKey(bookId, page) || entry.voice !== leleNarrationVoice) throw new Error("音色或文稿与生成记录不一致");
  if (entry.status === "REQUESTING") throw new Error("服务商请求结果未知，请核对记录后恢复，不能自动重复生成");
  if (entry.status === "FAILED_RESPONSE" && entry.failure?.httpStatus >= 400) {
    if (!entry.failure.operatorReviewed) throw new Error("服务商失败响应的计费结果未知，请人工核对后恢复");
    if (entry.attempts >= 3) throw new Error("语音失败次数达到上限，请人工核对");
    return "GENERATE";
  }
  if (entry.status === "GENERATED" && entry.payloadFile) return "STORE";
  if (entry.status === "READY" && entry.assetId && entry.url) return "REUSE";
  throw new Error("音频生成记录尚未就绪或已损坏");
}

export function applyNarrationPages(book, entries) {
  if (book.pages.length !== 13 || book.pageCount !== 12) throw new Error("作品必须有封面和12页正文");
  return book.pages.map(page => {
    const entry = entries[page.position];
    if (!entry || planNarrationEntry(entry, book.id, page) !== "REUSE") throw new Error("整本音频尚未就绪");
    if (page.audioUrl && (page.audioUrl !== entry.url || page.audioTaskId)) throw new Error("音频已被人工修改，不能覆盖");
    return { ...page, audioUrl: entry.url, audioTaskId: null };
  });
}
