import { readFile, writeFile, readdir, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import sharp from "sharp";
import { growthSeriesName, growthSeriesBooks } from "./growth-series-data.mjs";

const base = resolve("scripts/picture-books");
const root = resolve("apps/web/public/picture-book-demos/growth");
const initial = JSON.parse(await readFile(resolve(base, "growth-generation-manifest.json"), "utf8"));
const results = await Promise.all((await readdir(resolve(base, "growth-generation-results"))).filter(f=>f.endsWith(".json")).map(async f=>JSON.parse(await readFile(resolve(base,"growth-generation-results",f),"utf8"))));
const selected = new Map([...initial.generated, ...results].map(entry=>[entry.key,entry]));
await mkdir(root, { recursive: true });
const manifest = { series: growthSeriesName, aspectRatio: "5:4", generator: "built-in image_gen", covers: [], pages: [], missing: [] };
for (const book of growthSeriesBooks) {
  await mkdir(resolve(root,book.slug), { recursive: true });
  for (let position=0;position<=12;position++) {
    const entry=selected.get(`${book.slug}:${position}`);
    if(!entry) { manifest.missing.push(`${book.slug}:${position}`); continue; }
    const source=await readFile(entry.source), dimensions=await sharp(source).metadata();
    if(Math.abs(dimensions.width/dimensions.height-1.25)>0.01) throw new Error(`生成图片不是5:4：${entry.key}`);
    const assetName=position===0?"cover.webp":`${String(position).padStart(2,"0")}.webp`;
    const target=resolve(root,book.slug,assetName);
    // 仅统一分辨率和编码；图中文字、插画和排版全部来自图像生成工具。
    await sharp(source).resize(1280,1024,{fit:"fill"}).webp({quality:94,effort:5}).toFile(target);
    const output=await readFile(target);
    const item={...entry,assetName,width:1280,height:1024,sha256:createHash("sha256").update(output).digest("hex"),sizeBytes:output.length};
    (position===0?manifest.covers:manifest.pages).push(item);
  }
}
const series=selected.get("resource");
if(series) {
  const source=await readFile(series.source), dimensions=await sharp(source).metadata();
  if(Math.abs(dimensions.width/dimensions.height-16/9)>0.01)throw new Error("系列资源封面必须为16:9");
  const assetName="series-cover.webp";await sharp(source).resize(1280,720,{fit:"fill"}).webp({quality:94,effort:5}).toFile(resolve(root,assetName));
  const output=await readFile(resolve(root,assetName));manifest.seriesCover={...series,assetName,width:1280,height:720,sha256:createHash("sha256").update(output).digest("hex"),sizeBytes:output.length};
}
await writeFile(resolve(base,"growth-assets-manifest.json"),JSON.stringify(manifest,null,2)+"\n");
// 供逐页视觉核对；联系表不是交付插画。
for(const book of growthSeriesBooks) {
  const entries=[...manifest.covers,...manifest.pages].filter(e=>e.slug===book.slug).sort((a,b)=>a.position-b.position);
  if(!entries.length)continue;
  const tiles=await Promise.all(entries.map(async(e,i)=>({input:await sharp(resolve(root,book.slug,e.assetName)).resize(640,512).png().toBuffer(),left:(i%3)*640,top:Math.floor(i/3)*512})));
  await mkdir(resolve(base,"growth-qa"),{recursive:true});
  await sharp({create:{width:1920,height:Math.ceil(entries.length/3)*512,channels:3,background:"#f6f2e7"}}).composite(tiles).png().toFile(resolve(base,"growth-qa",`${book.slug}-contact.png`));
}
console.log(JSON.stringify({covers:manifest.covers.length,pages:manifest.pages.length,seriesCover:Boolean(manifest.seriesCover),missing:manifest.missing}));
