import { isDeepStrictEqual } from "node:util";
import { growthSeriesName, growthSeriesBooks, growthCoverPrompt, growthPagePrompt } from "./growth-series-data.mjs";

export function validateGrowthManifest(manifest) {
  if(manifest.series!==growthSeriesName || manifest.aspectRatio!=="5:4" || manifest.covers?.length!==4 || manifest.pages?.length!==48 || manifest.missing?.length || !manifest.seriesCover)throw new Error("必须完成四册、48页正文及全部封面");
  const hashes=new Set();
  for(const entry of [...manifest.covers,...manifest.pages,manifest.seriesCover]) {
    const height=entry===manifest.seriesCover?720:1024;
    if(entry.width!==1280 || entry.height!==height || !/^[a-f0-9]{64}$/.test(entry.sha256) || hashes.has(entry.sha256))throw new Error("素材尺寸、哈希或重复插画不符合要求");
    hashes.add(entry.sha256);
  }
  if(manifest.seriesCover.assetName!=="series-cover.webp")throw new Error("系列封面文件名不符合要求");
  for(const book of growthSeriesBooks) {
    const covers=manifest.covers.filter(e=>e.slug===book.slug);
    if(covers.length!==1 || covers[0].position!==0 || covers[0].assetName!=="cover.webp")throw new Error("绘本封面缺失或重复");
    const pages=manifest.pages.filter(e=>e.slug===book.slug).sort((a,b)=>a.position-b.position);
    if(pages.length!==12 || pages.some((e,i)=>e.position!==i+1 || e.heading!==book.story[i][0] || e.caption!==book.story[i][1] || e.assetName!==`${String(i+1).padStart(2,"0")}.webp`))throw new Error("页码、文稿或素材文件名不符合授权内容");
  }
}

export function buildGrowthBookRecord(book, userId, images) {
  const canonical=growthSeriesBooks.find(b=>b.id===book.id);
  if(userId!=="abei-lele-studio" || !canonical || !isDeepStrictEqual(book,canonical) || book.story.length!==12)throw new Error("只能为指定工作室制作本次四册科普绘本");
  const pages=Array.from({length:13},(_,position)=>{
    let image;try{image=new URL(images[position]);}catch{throw new Error("绘本图片尚未齐全");}
    if(image.protocol!=="https:" || image.username || image.password)throw new Error("绘本图片地址无效");
    const caption=position===0?book.title:`${book.story[position-1][0]}\n${book.story[position-1][1]}`;
    return {position,caption,narration:caption,textInImage:true,imagePrompt:position===0?growthCoverPrompt(book):growthPagePrompt(book,position),imageUrl:image.href,audioUrl:null,imageTaskId:null,audioTaskId:null};
  });
  return {id:book.id,userId,title:book.title,brief:`${book.title}：${book.animals}的成长故事`,theme:"动物成长与自然科普",audience:"幼儿园",style:"watercolor",aspectRatio:"5:4",pageCount:12,status:"COMPLETED",messages:[],plot:book.story.map(([title,caption])=>`${title}\n${caption}`).join("\n\n"),characters:book.animals.split(" · ").map(name=>({name,description:`自然写实形态，按幼体、成长阶段与成体保持物种特征；生境：${book.habitat}。`,imageUrl:null})),pages};
}
