import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { assertNarrationReviewState } from "./lele-narration.mjs";
export const growthNarrationVoice="Chinese_huolishaonv",growthNarrationModel="speech-2.8-hd",growthNarrationSpeed=1;
export function growthNarrationKey(bookId,page){return createHash("sha256").update(JSON.stringify([bookId,page.position,page.narration,growthNarrationVoice,growthNarrationModel,growthNarrationSpeed])).digest("hex");}
export function planGrowthNarrationEntry(entry,bookId,page){
  if(!entry)return "GENERATE";
  if(entry.key!==growthNarrationKey(bookId,page)||entry.voice!==growthNarrationVoice||entry.model!==growthNarrationModel||entry.speed!==growthNarrationSpeed)throw new Error("音色、模型或文稿与记录不一致");
  if(entry.status==="REQUESTING")throw new Error("请求结果未知，不能重复发起付费调用");
  if(entry.status==="FAILED_RESPONSE"){
    // 明确被RPM限额拒绝的请求没有输出音频，可在冷却后重试；未知结果仍停止。
    if(entry.failure?.errorCode==="MINIMAX_STATUS_1002"&&entry.failure.message==="rate limit exceeded(RPM)"&&(entry.attempts??1)<3)return "GENERATE";
    throw new Error("服务商响应失败，请核对原始结果后恢复");
  }
  if(entry.status==="GENERATED"&&entry.payloadFile)return "STORE";
  if(entry.status==="READY"&&entry.assetId&&entry.url)return "REUSE";
  throw new Error("音频生成记录未就绪");
}
export function applyGrowthNarrationPages(book,entries){
  if(book.pageCount!==12||book.pages.length!==13)throw new Error("须有封面及12页正文");
  return book.pages.map(page=>{
    const entry=entries[page.position];
    if(!entry||planGrowthNarrationEntry(entry,book.id,page)!=="REUSE")throw new Error("整本配音尚未就绪");
    if(page.audioUrl&&(page.audioUrl!==entry.url||page.audioTaskId))throw new Error("配音已被人工修改，不能覆盖");
    return {...page,audioUrl:entry.url,audioTaskId:null};
  });
}
export function assertGrowthNarrationPublication(publication,latest,base,target,hash){
  assertNarrationReviewState(publication,latest,target);
  if(![base,target].some(snapshot=>isDeepStrictEqual(publication.approvedSnapshot,snapshot)&&publication.approvedHash===hash(snapshot)))throw new Error("公开版本已修改，不属于本次配音授权");
}
export async function finalizeGrowthNarrationPublication(verifyLockedTarget,recordApproval){
  await verifyLockedTarget();
  return recordApproval();
}
