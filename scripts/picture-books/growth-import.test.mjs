import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { growthSeriesBooks, growthSeriesName } from "./growth-series-data.mjs";

const helpers = await import("./growth-import.mjs").catch(()=>null);
const digest=value=>createHash("sha256").update(value).digest("hex");
const manifest = () => ({series:growthSeriesName,aspectRatio:"5:4",covers:growthSeriesBooks.map(book=>({slug:book.slug,position:0,assetName:"cover.webp",width:1280,height:1024,sha256:digest(book.slug)})),pages:growthSeriesBooks.flatMap(book=>book.story.map(([heading,caption],i)=>({slug:book.slug,position:i+1,heading,caption,assetName:`${String(i+1).padStart(2,"0")}.webp`,width:1280,height:1024,sha256:digest(`${book.slug}:${i+1}`)}))),seriesCover:{assetName:"series-cover.webp",width:1280,height:720,sha256:digest("resource")},missing:[]});

test("科普系列只能导入齐全、逐页对应且插画不重复的四册素材", () => {
  assert.ok(helpers, "科普导入构建器尚未实现");
  assert.doesNotThrow(()=>helpers.validateGrowthManifest(manifest()));
  for(const mutation of [m=>m.pages.pop(),m=>m.pages[0].caption="其他文稿",m=>m.pages[1].position=1,m=>m.pages[1].sha256=m.pages[0].sha256,m=>m.covers[0].width=1024,m=>m.pages[0].assetName="../outside.webp"]){
    const changed=manifest();mutation(changed);assert.throws(()=>helpers.validateGrowthManifest(changed));
  }
});

test("科普绘本保留封面、12页正文及图片内文字信息，并拒绝其他作者", () => {
  assert.ok(helpers, "科普导入构建器尚未实现");
  const images=Object.fromEntries(Array.from({length:13},(_,i)=>[i,`https://r.abeiai.com/growth/${i}.webp`]));
  const record=helpers.buildGrowthBookRecord(growthSeriesBooks[0],"abei-lele-studio",images);
  assert.equal(record.id,"abei-growth-forest-armor");assert.equal(record.pageCount,12);assert.equal(record.aspectRatio,"5:4");assert.equal(record.pages.length,13);
  assert.equal(record.pages[0].caption,"树林里的铠甲勇士");assert.equal(record.pages[1].caption,"泥土里的白胖子\n我住在松软的腐叶土里。\n身体白白胖胖，弯成一个Ｃ。\n头上没有角，也没有翅膀。\n猜猜我长大后是谁？");
  assert.equal(record.pages.every(p=>p.textInImage===true&&p.audioUrl===null),true);
  assert.throws(()=>helpers.buildGrowthBookRecord(growthSeriesBooks[0],"another-user",images));
  assert.throws(()=>helpers.buildGrowthBookRecord(growthSeriesBooks[0],"abei-lele-studio",{...images,2:undefined}));
});

test("系列资源封面遵循资源中心16:9契约，书内仍为5:4", () => {
  const valid=manifest();assert.doesNotThrow(()=>helpers.validateGrowthManifest(valid));
  const invalid=manifest();invalid.seriesCover.height=1024;
  assert.throws(()=>helpers.validateGrowthManifest(invalid));
});

const safe = await import("./growth-publication-guard.mjs").catch(()=>null);
test("科普审批在同一个锁定事务内重新核对授权，再进入原生业务操作", async () => {
  assert.ok(safe, "锁定事务授权复核尚未实现");
  const input={name:"科普",summary:"自然",coverMediaId:"cover",tags:[],items:[]};
  const course={userId:"abei-lele-studio",workingRevision:{...input,status:"PENDING",items:[]}};
  const events=[],tx={$queryRaw:async()=>events.push("lock"),course:{findUnique:async()=>course}};
  const original={$transaction:async callback=>callback(tx)},service={prisma:original};
  await safe.growthCourseOperationSafely(service,{owner:"abei-lele-studio",courseId:"c",input,state:"PENDING"},async()=>service.prisma.$transaction(async actual=>{assert.equal(actual,tx);events.push("publish");}),async actual=>{assert.equal(actual,tx);events.push("verify");});
  assert.deepEqual(events,["lock","verify","publish"]);assert.equal(service.prisma,original);
  events.length=0;
  await assert.rejects(safe.growthCourseOperationSafely(service,{owner:"abei-lele-studio",courseId:"c",input,state:"PENDING"},async()=>service.prisma.$transaction(async()=>events.push("publish")),async()=>{throw new Error("公开快照已被另一审核改变");}),/公开快照/);
  assert.deepEqual(events,["lock"]);assert.equal(service.prisma,original);
  course.userId="another-user";
  await assert.rejects(safe.growthCourseOperationSafely(service,{owner:"abei-lele-studio",courseId:"c",input,state:"PENDING"},async()=>service.prisma.$transaction(async()=>events.push("publish"))),/归属/);
});
