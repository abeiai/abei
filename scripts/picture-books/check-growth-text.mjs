import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { growthSeriesBooks, growthSeriesName } from "./growth-series-data.mjs";

const manifest=JSON.parse(await readFile("scripts/picture-books/growth-assets-manifest.json","utf8"));
const manualReviews=JSON.parse(await readFile("scripts/picture-books/growth-qa/manual-text-verifications.json","utf8"));
const entries=[...manifest.covers,...manifest.pages,...(manifest.seriesCover?[manifest.seriesCover]:[])];
const recognized=JSON.parse(execFileSync("/tmp/abei-growth-ocr",entries.map(e=>e.source),{maxBuffer:10*1024*1024}).toString());
const normalize=s=>s.normalize("NFKC").replace(/[^\p{L}\p{N}]/gu,"");
const result=entries.map(entry=>{
  const book=growthSeriesBooks.find(b=>b.slug===entry.slug),lines=recognized.find(r=>r.path===entry.source)?.lines??[];
  const expected=entry.key==="resource"?[growthSeriesName]:entry.position===0?[growthSeriesName,book.title,book.animals,book.volume]:[entry.heading,...entry.caption.split("\n")];
  const text=normalize(lines.join("")),missing=expected.filter(line=>!text.includes(normalize(line)));
  const manual=manualReviews.find(review=>review.key===entry.key && review.sha256===entry.sha256 && JSON.stringify(review.missing)===JSON.stringify(missing));
  return {key:entry.key,source:entry.source,lines,missing,passed:missing.length===0 || Boolean(manual),...(manual?{manualVerification:manual.note}:{})};
});
await writeFile("scripts/picture-books/growth-qa/text-check.json",JSON.stringify(result,null,2)+"\n");
console.log(JSON.stringify({checked:result.length,passed:result.filter(e=>e.passed).length,flagged:result.filter(e=>!e.passed).map(({key,lines,missing})=>({key,lines,missing}))},null,2));
if(result.some(e=>!e.passed)) process.exitCode=1;
