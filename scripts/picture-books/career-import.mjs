import { isDeepStrictEqual } from "node:util";
import { assertLeleDraftMatches } from "./lele-import.mjs";

const adultDescriptions = {
  doctor: "中国女性医生，黑色齐颈短发，白色医生外套、浅蓝色工作服、青绿色听诊器，耐心亲切。",
  firefighter: "中国男性消防员，黑色短发，米黄色消防防护服、黄银色反光条、黄色头盔、黑色防护靴，细心负责。",
  teacher: "中国男性幼儿园老师，黑色短发、圆框眼镜、薄荷绿色上衣、米色长裤、灰色平底鞋，善于倾听与鼓励。",
};
export const careerCollectionSlugs=['doctor','firefighter','teacher','nurse','police','chef','bus-driver','subway-driver','courier','sanitation-worker','architect','engineer','scientist','pilot','gardener','veterinarian'];

export function validateCareerExpansionBooks(books){
  if(!Array.isArray(books)||books.length!==16)throw new Error('必须完成16本职业系列');
  if(books.some((b,i)=>b.slug!==careerCollectionSlugs[i]))throw new Error('职业目录缺失、重复或顺序不一致');
  if(new Set(books.map(b=>b.child?.name)).size!==16||books.some(b=>!b.child?.name?.trim()))throw new Error('不同理想必须属于16个不同孩子');
  for(const [i,b] of books.entries()){
    if(b.story?.length!==16||b.story.some(p=>!p[0]?.trim()||!p[1]?.trim()))throw new Error('每本须有16页完整正文和场景');
    if(!b.family?.length||b.family.length>2||b.family.some(p=>!['爸爸','妈妈'].includes(p.relation))||new Set(b.family.map(p=>p.relation)).size!==b.family.length)throw new Error('每本家长须为爸爸、妈妈或双方');
    const names=[b.child.name,...b.family.map(p=>p.name),b.adultName,...b.supportingCharacters.map(p=>p.name)];
    if(names.length>9||new Set(names).size!==names.length||names.some(n=>!n?.trim()))throw new Error('本书人物数量、名称或配角设定不一致');
    if(i>=3&&(!Array.isArray(b.pageCast)||b.pageCast.length!==17||b.pageCast.some(cast=>!Array.isArray(cast)||!cast.length||new Set(cast).size!==cast.length||cast.some(n=>!names.includes(n)))))throw new Error('逐页人物或配角不属于本书固定设定');
  }
}

export function assertCareerExpansionMaterialState(current,publication,latest,record,target,original=false){
  assertCareerRecordMatches(current,record);
  if(!publication){if(original)throw new Error('原三本缺少公开课件');return;}
  if(publication.status==='REJECTED'||latest?.status==='REJECTED')throw new Error('课件审核被拒绝，不能绕过');
  if(original&&(publication.status!=='APPROVED'||!publication.approvedHash))throw new Error('原三本公开状态已改变');
  if(!['APPROVED','PENDING'].includes(publication.status)||(publication.status==='APPROVED'&&!publication.approvedHash))throw new Error('课件公开状态不一致');
  if(publication.approvedHash&&(publication.status!=='APPROVED'||publication.approvedHash!==target.hash||!isDeepStrictEqual(publication.approvedSnapshot,target.snapshot)))throw new Error('已批准课件快照已改变');
  if(latest?.status==='PENDING'||publication.currentHash!==target.hash||!isDeepStrictEqual(publication.currentSnapshot,target.snapshot))throw new Error('课件有其他待审改动');
}
export function assertCareerReviewTarget(review, input, materials, context) {
  if (review.scope !== "COURSE_REVISION" || review.status !== "PENDING" || review.courseId !== context.courseId || review.courseRevisionId !== context.revisionId || review.submittedByUserId !== context.userId) throw new Error("审核目标超出本次发布授权");
  assertLeleDraftMatches(review.afterSnapshot, input);
  if (review.afterSnapshot.coverUrl !== context.coverUrl) throw new Error("审核封面超出发布授权");
  review.afterSnapshot.items.forEach((item, index) => {
    const target = materials[index];
    if (!target || item.publicationId !== target.publicationId || item.pictureBookId !== target.pictureBookId) throw new Error("审核课件引用超出授权");
    const matches = item.firstPublication === true
      ? item.materialHash === target.hash && isDeepStrictEqual(item.materialSnapshot, target.snapshot)
      : target.approvedHash === target.hash && isDeepStrictEqual(target.approvedSnapshot, target.snapshot);
    if (!matches) throw new Error("课件审核快照超出本次文稿授权");
  });
}

export function buildCareerBookRecord(book, userId, images) {
  const adultDescription=book.adultDescription??adultDescriptions[book.slug];
  if (!adultDescription || book.story.length !== 16) throw new Error("职业绘本必须有16页完整正文");
  const pages = [[book.title], ...book.story].map(([caption], position) => {
    let url; try { url = new URL(images[position]); } catch { throw new Error("绘本图片尚未就绪"); }
    if (url.protocol !== "https:" || url.username || url.password || !caption?.trim() || caption.length > 500) throw new Error("绘本图片或配文无效");
    return { position, caption, narration: caption, imagePrompt: `《${book.title}》${position === 0 ? "带书名的封面" : `第${position}页`}：${caption}。中国城市日常生活，明亮配色、圆润卡通造型，3:4竖版。`, imageUrl: url.href, audioUrl: null, imageTaskId: null, audioTaskId: null };
  });
  return { id: `abei-career-${book.slug}`, userId, title: book.title, brief: `${book.title}：${book.theme}`, theme: book.theme, audience: "幼儿园", style: "3d-animation", aspectRatio: "3:4", pageCount: 16, status: "COMPLETED", messages: [], plot: book.story.map(([caption]) => caption).join("\n"),
    characters: [book.child,...book.family,{name:book.adultName,description:adultDescription},...book.supportingCharacters].map(person=>({name:person.name,description:person.description,imageUrl:null})), pages };
}

export function assertCareerRecordMatches(current, expected) {
  if (!current || Object.keys(expected).some(key => !isDeepStrictEqual(current[key], expected[key]))) throw new Error("作品归属或内容已修改，导入不会覆盖");
}

export function planCareerPublication(course, input) {
  if (!course) return "CREATE";
  if (course.reviewState === "REJECTED" || course.workingRevision?.status === "REJECTED") throw new Error("投稿已被拒绝，不能重跑绕过审核");
  const working = course.workingRevision;
  if (working && ["DRAFT", "PENDING"].includes(working.status)) { assertLeleDraftMatches(working, input); return working.status; }
  if (course.reviewState === "PUBLISHED" && course.approvedRevision?.status === "APPROVED") { assertLeleDraftMatches(course.approvedRevision, input); return "PUBLISHED"; }
  throw new Error("现有资源状态不支持导入，请人工核对");
}
