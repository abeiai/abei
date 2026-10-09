import assert from "node:assert/strict";
import test from "node:test";
import { careerSeriesBooks } from "./career-series-data.mjs";
import { buildCareerBookRecord, assertCareerRecordMatches, planCareerPublication, assertCareerReviewTarget } from "./career-import.mjs";

const owner = "abei-lele-studio";
const images = () => Object.fromEntries(Array.from({length:17},(_,i)=>[i,`https://cdn.abei.example/careers/doctor/${i}.webp`]));

test("三本职业故事各16页，正式记录含独立封面且保持3:4和中文双引号", () => {
  assert.deepEqual(careerSeriesBooks.map(b=>b.slug),["doctor","firefighter","teacher"]);
  for(const b of careerSeriesBooks){
    const r=buildCareerBookRecord(b,owner,images());
    assert.equal(r.pageCount,16);assert.equal(r.aspectRatio,"3:4");assert.equal(r.audience,"幼儿园");assert.equal(r.pages.length,17);
    assert.deepEqual(r.pages.map(p=>p.position),Array.from({length:17},(_,i)=>i));
    assert.equal(r.pages[0].caption,b.title);assert(r.pages.every(p=>p.narration===p.caption));
    assert(r.pages.every(p=>!/[‘’「」『』]/.test(p.caption)));
  }
});

test("批准前绑定系列及首发课件快照，阻止并发人工编辑被一并公开", () => {
  const input={name:"我想成为",summary:"三本职业启蒙",tags:["绘本"],coverMediaId:"cover",items:careerSeriesBooks.map(b=>({materialType:"PICTURE_BOOK",materialId:`abei-career-${b.slug}`,displayName:b.title}))};
  const materials=input.items.map((i,n)=>({publicationId:`pub-${n}`,pictureBookId:i.materialId,hash:`hash-${n}`,snapshot:{title:i.displayName,pages:[{caption:"原稿"}]},approvedHash:null,approvedSnapshot:null}));
  const context={courseId:"course",revisionId:"revision",userId:owner,coverUrl:"https://cdn.abei.example/cover.webp"};
  const review={scope:"COURSE_REVISION",status:"PENDING",courseId:"course",courseRevisionId:"revision",submittedByUserId:owner,afterSnapshot:{...input,coverUrl:context.coverUrl,items:input.items.map((i,n)=>({...i,pictureBookId:i.materialId,sortOrder:n,publicationId:materials[n].publicationId,firstPublication:true,materialHash:materials[n].hash,materialSnapshot:materials[n].snapshot}))}};
  assert.doesNotThrow(()=>assertCareerReviewTarget(review,input,materials,context));
  const changed=structuredClone(review);changed.afterSnapshot.items[0].materialSnapshot.pages[0].caption="并发人工修改";
  assert.throws(()=>assertCareerReviewTarget(changed,input,materials,context),/授权|快照/);
  for(const field of ["courseId","courseRevisionId","submittedByUserId","status"]){assert.throws(()=>assertCareerReviewTarget({...review,[field]:"changed"},input,materials,context),/审核|授权/);}
  const renamed=structuredClone(review);renamed.afterSnapshot.summary="人工新摘要";
  assert.throws(()=>assertCareerReviewTarget(renamed,input,materials,context),/修改|授权/);
  const skipped=structuredClone(review);delete skipped.afterSnapshot.items[0].firstPublication;
  assert.throws(()=>assertCareerReviewTarget(skipped,input,materials,context),/快照|授权/);
});

test("缺页、缺图或非HTTPS素材不能发布为完成绘本", () => {
  const b=careerSeriesBooks[0];assert.throws(()=>buildCareerBookRecord({...b,story:b.story.slice(1)},owner,images()),/16/);
  const map=images();delete map[10];assert.throws(()=>buildCareerBookRecord(b,owner,map),/图片/);
  map[10]="javascript:alert(1)";assert.throws(()=>buildCareerBookRecord(b,owner,map),/图片/);
});

test("重跑不会接管别人作品，或覆盖原稿、音频、状态的人工修改", () => {
  const r=buildCareerBookRecord(careerSeriesBooks[0],owner,images());
  assert.doesNotThrow(()=>assertCareerRecordMatches({...r,version:3},r));
  for(const key of ["userId","title","status"]){assert.throws(()=>assertCareerRecordMatches({...r,[key]:"edited"},r),/作品|修改/);}
  const changed=structuredClone(r);changed.pages[1].audioUrl="https://cdn.abei.example/manual.mp3";
  assert.throws(()=>assertCareerRecordMatches(changed,r),/作品|修改/);
});

test("同一个完整目录可恢复草稿或待审，已发布时不重复创建，拒绝不能绕过", () => {
  const input={name:"我想成为",summary:"认识三种职业",tags:["绘本"],coverMediaId:"cover",items:careerSeriesBooks.map(b=>({materialType:"PICTURE_BOOK",materialId:`abei-career-${b.slug}`,displayName:b.title}))};
  const revision=status=>({...input,status,items:input.items.map((item,i)=>({...item,pictureBookId:item.materialId,sortOrder:i}))});
  assert.equal(planCareerPublication(null,input),"CREATE");
  assert.equal(planCareerPublication({reviewState:"DRAFT",workingRevision:revision("DRAFT")},input),"DRAFT");
  assert.equal(planCareerPublication({reviewState:"PENDING_REVIEW",workingRevision:revision("PENDING")},input),"PENDING");
  assert.equal(planCareerPublication({reviewState:"PUBLISHED",approvedRevision:revision("APPROVED")},input),"PUBLISHED");
  assert.throws(()=>planCareerPublication({reviewState:"REJECTED",workingRevision:revision("REJECTED")},input),/拒绝/);
  const bad=revision("DRAFT");bad.items[0].displayName="人工修改标题";
  assert.throws(()=>planCareerPublication({reviewState:"DRAFT",workingRevision:bad},input),/修改|目录/);
});
