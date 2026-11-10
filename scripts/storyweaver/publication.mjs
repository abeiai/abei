import {createHash} from 'node:crypto';
const digest=/^[a-f0-9]{64}$/;
export function displayStoryText(text){return text.split(/\r\n|\r|\n/).filter(line=>line.replace(/[\u200b\u200c\u200d\u2060]/g,'').trim()).join('\n')}

function htmlText(value,parseFragment){
 const chunks=[];
 function walk(node){if(node.nodeName==='#text')chunks.push(node.value);else{if(node.tagName==='br')chunks.push('\n');for(const child of node.childNodes??[])walk(child);if(['p','div','li'].includes(node.tagName))chunks.push('\n')}}
 walk(parseFragment(value||''));return chunks.join('').split(/\r\n|\r|\n/).map(line=>line.trim()).join('\n').trim();
}
export function textFromSourcePage(page,parseFragment){
 const boxes=[...(page.boxes||[])].sort((a,b)=>(a.position||0)-(b.position||0));
 return boxes.map(b=>htmlText(b.content,parseFragment)).filter(Boolean).join('\n')||htmlText(page.content,parseFragment);
}
export function verifySourcePages(m,raw,parseFragment){
 if(typeof parseFragment!=='function')throw Error('缺少独立 HTML 解析器');
 const rows=(raw?.data?.pages??[]).filter(p=>Number.isInteger(p.position)&&p.position<=m.pages.length).sort((a,b)=>a.position-b.position);
 if(rows.length!==m.pages.length)throw Error('原始页面数量不一致');
 for(const [i,p] of rows.entries()){
  const page=m.pages[i];if(p.story_id!==m.source_id||p.position!==page.position||p.id!==page.page_id||p.illustration_crop_id!==page.crop_id||p.page_template_id!==page.template_id)throw Error('原始页面身份不一致');
  const boxes=[...(p.boxes||[])].sort((a,b)=>(a.position||0)-(b.position||0));
  const extracted=textFromSourcePage(p,parseFragment);
  if(extracted!==page.text)throw Error('页面正文与原始文本不一致');
  const parts=[String(p.id),String(p.position),p.content||''];for(const b of boxes)parts.push(String(b.position||0),b.content||'');parts.push(page.text);
  if(createHash('sha256').update(parts.join('\0'),'utf8').digest('hex')!==page.text_source_proof)throw Error('正文和来源不一致');
 }
}
export function bookId(id){if(!Number.isSafeInteger(id)||id<1)throw Error('invalid story id');return id===698069?'storyweaver-698069-i-love-to-read':`storyweaver-${id}`}
function validPageImage(p,index){
 if(!p.image||!new RegExp(`^images/page-${String(index+1).padStart(3,'0')}\\.(png|jpg|jpeg|webp)$`).test(p.image.file)||!digest.test(p.image.sha256))return false;
 if(p.image.origin==='generated_blank')return p.crop_id===null&&p.template_id===24&&Boolean(p.text.trim())&&p.image.file.endsWith('.png')&&p.image.sha256==='48adf731778c963b0454d72cff3a7e35973f5ca9372e1fd749e14c73379e2691';
 return Number.isSafeInteger(p.crop_id)&&new RegExp(`^https://storage\\.googleapis\\.com/static\\.storyweaver\\.org\\.in/illustration_crops/${p.crop_id}/(original|large|page_landscape)/[^/]+\\.(png|jpg|jpeg|webp)$`).test(p.image.url);
}
export function validateManifest(m,d){
 if(!m||!d||!Number.isSafeInteger(m.source_id)||!Number.isSafeInteger(m.catalog_index)||m.catalog_index<1||m.source_id!==d.id||d.language!=='English'||!Number.isInteger(m.english_level_code)||m.english_level_code<1||m.english_level_code>5||String(m.english_level_code)!==String(d.level))throw Error('来源绘本身份、顺序或等级不一致');
 if(Boolean(m.is_gif)!==Boolean(d.isGif)||d.isGif)throw Error('动画绘本需单独处理');
 if(m.source_url!==`https://storyweaver.org.in/en/stories/${encodeURIComponent(m.source_slug)}`||!m.source_slug.startsWith(`${m.source_id}-`))throw Error('来源链接无效');
 const named=xs=>Array.isArray(xs)&&xs.length>0&&xs.every(x=>typeof x?.name==='string'&&x.name.trim());
 if(!d.name?.trim()||!named(d.authors)||!named(d.illustrators)||!d.publisher?.name?.trim()||typeof d.copyrightNotice!=='string'||!d.copyrightNotice.trim())throw Error('作者、插画师、出版方或版权声明缺失');
 if((d.isTranslation||d.isRelevelled||d.isAdapted)&&d.originalStory?.id!==d.id&&(!named(d.originalStory?.authors)||!d.originalStory?.originalPublisher?.name?.trim()))throw Error('原作署名缺失');
 if(!Array.isArray(m.warnings)||m.warnings.length)throw Error('存在未解决来源问题');
 if(m.pages?.[0]?.text?.trim())throw Error('封面文字需先保留原始排版');
 if(!Array.isArray(m.pages)||m.pages.length<2||m.pages.length>500||m.pages.length!==d.lastPagePosition||m.pages.some((p,i)=>p.position!==i+1||typeof p.text!=='string'||!validPageImage(p,i)))throw Error('书页不完整或插图来源不匹配');
 return true;
}
export function attribution(m,d){
 const names=xs=>xs.map(x=>x?.name?.trim()).filter(Boolean).join(', ');const original=d.originalStory;
 const role=d.isTranslation?'Translation':d.isRelevelled?'Relevelled':d.isAdapted?'Adapted':'Written';
 const parts=[`“${d.name}” (English). ${role} by ${names(d.authors)}. Illustrated by ${names(d.illustrators)}. Published by ${d.publisher.name}.`,d.copyrightNotice];
 if(original?.id&&original.id!==d.id){if(original.authors?.length)parts.push(`Original story: ${original.name||d.name}, written by ${names(original.authors)}.`);if(original.originalPublisher?.name)parts.push(`Original publisher: ${original.originalPublisher.name}.`)}
 if(d.donor?.name)parts.push(`Supported by ${d.donor.name}.`);
 for(const [key,label] of [['animators','Animation'],['calligraphers','Calligraphy'],['photographers','Photography'],['painters','Painting']])if(d[key]?.length)parts.push(`${label}: ${names(d[key])}.`);
 parts.push('Available under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/) on StoryWeaver. Adapted for digital display; original story and images retained.');
 return {name:'StoryWeaver',iconUrl:'',url:m.source_url,statement:parts.join(' ')};
}
export function buildBookRecord(m,d,userId,urls){
 validateManifest(m,d);if(!userId||urls.length!==m.pages.length||urls.some(u=>typeof u!=='string'||!/^https:\/\/r\.abeiai\.com\/[a-zA-Z0-9_./-]+\.(png|jpe?g|webp)$/.test(u)))throw Error('素材地址或归属无效');
 const pages=m.pages.map((p,i)=>({position:i,caption:i===0?(p.text||d.name):p.text,narration:i===0?(p.text||d.name):p.text,imageUrl:urls[i],audioUrl:null,imagePrompt:'',imageTaskId:null,audioTaskId:null}));
 return {id:bookId(m.source_id),userId,title:d.name,brief:(d.description||d.name).slice(0,30000),theme:'英语绘本',audience:'儿童',englishLevel:m.english_level_code,style:'illustration',aspectRatio:d.orientation==='portrait'?'3:4':'4:3',isSpread:false,pageCount:pages.length-1,status:'COMPLETED',messages:[],plot:pages.slice(1).map(p=>p.caption).join('\n\n'),characters:[],pages};
}
