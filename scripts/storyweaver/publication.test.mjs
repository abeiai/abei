import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const {parseFragment}=createRequire(new URL('../../apps/api-core/package.json',import.meta.url))('parse5');
import {buildBookRecord, attribution, bookId, validateManifest, verifySourcePages, textFromSourcePage} from './publication.mjs';
const d={id:7,name:'A story',language:'English',level:'5',lastPagePosition:2,authors:[{name:'Author'}],illustrators:[{name:'Illustrator'}],publisher:{name:'Publisher'},isTranslation:true,copyrightNotice:'Copyright notice from source',originalStory:{id:6,authors:[{name:'Original'}],originalPublisher:{name:'Origin'}}};
const m={source_id:7,catalog_index:1,source_slug:'7-a-story',source_url:'https://storyweaver.org.in/en/stories/7-a-story',english_level_code:5,warnings:[],pages:[{position:1,crop_id:1,text:'',image:{file:'images/page-001.png',url:'https://storage.googleapis.com/static.storyweaver.org.in/illustration_crops/1/original/a.png',source_md5:'abc',sha256:'a'.repeat(64)}},{position:2,crop_id:2,text:'Hello',image:{file:'images/page-002.png',url:'https://storage.googleapis.com/static.storyweaver.org.in/illustration_crops/2/large/a.png',source_md5:'abc',sha256:'b'.repeat(64)}}]};
test('转换保持页序和文字，不生成音频，等级来自来源',()=>{
 const book=buildBookRecord(m,d,'account-1',['https://r.abeiai.com/a.png','https://r.abeiai.com/b.png']);
 assert.equal(book.id,'storyweaver-7');assert.equal(book.englishLevel,5);assert.equal(book.pageCount,1);assert.deepEqual(book.pages.map(x=>x.caption),['A story','Hello']);assert.ok(book.pages.every(x=>x.audioUrl===null));
});
test('缺页、动画、源信息变化、非指定存储和非英文不得发布',()=>{
 for(const bad of [{...m,warnings:['animated_story']},{...m,pages:[m.pages[1]]},{...m,english_level_code:4}])assert.throws(()=>validateManifest(bad,d));
 assert.throws(()=>buildBookRecord(m,d,'account-1',['https://evil.example/a.png','https://r.abeiai.com/b.png']));
 assert.throws(()=>validateManifest(m,{...d,language:'Spanish'}));
 assert.throws(()=>validateManifest(m,{...d,authors:[{name:''}]}));
});
test('来源标注包含作者、插画师、出版方、原作与许可',()=>{
 const a=attribution(m,d);assert.equal(a.name,'StoryWeaver');for(const s of ['Author','Illustrator','Publisher','Original','Origin','CC BY 4.0','https://creativecommons.org/licenses/by/4.0/','Copyright notice from source','Translation'])assert.ok(a.statement.includes(s),s);assert.equal(a.url,m.source_url);
});
test('已发布示例保留原 ID',()=>assert.equal(bookId(698069),'storyweaver-698069-i-love-to-read'));

test('逐页正文必须绑定原始页面，篡改文字会被拦截',()=>{
 const raw={data:{pages:[{id:1,position:1,story_id:7,content:'<p>Original</p>',illustration_crop_id:1,boxes:[]}]}};
 const sample={source_id:7,pages:[{position:1,page_id:1,crop_id:1,text:'Original',text_source_proof:createHash('sha256').update(['1','1','<p>Original</p>','Original'].join('\0')).digest('hex')}]};
 assert.doesNotThrow(()=>verifySourcePages(sample,raw,parseFragment));
 sample.pages[0].text='Altered';assert.throws(()=>verifySourcePages(sample,raw,parseFragment));
});

test('重分级作品保留原作者，不能误写成改编者是原作者',()=>{
 const relevelled={...d,isTranslation:false,isRelevelled:true,authors:[{name:'Level editor'}]};
 const a=attribution(m,relevelled);assert.match(a.statement,/Relevelled by Level editor/);assert.match(a.statement,/Original story/);
});

test('重新计算正文必须来自源 HTML，即使哈希也被更改',()=>{
 const raw={data:{pages:[{id:1,position:1,story_id:7,content:null,illustration_crop_id:1,boxes:[]}]}};
 const text='Invented';const proof=createHash('sha256').update(['1','1','',text].join('\0')).digest('hex');
 assert.throws(()=>verifySourcePages({source_id:7,pages:[{position:1,page_id:1,crop_id:1,text,text_source_proof:proof}]},raw,parseFragment));
});

test('不能把另一页的插图作为本页图片',()=>{
 const wrong={...m,pages:[m.pages[0],{...m.pages[1],image:{...m.pages[1].image,url:m.pages[0].image.url}}]};
 assert.throws(()=>validateManifest(wrong,d));
});

test('源文本按统一 HTML 规则处理 FEFF、实体与格式嵌套',()=>{
 const p={content:null,boxes:[{position:1,content:'<p><b>﻿A</b> &amp; B</p>'},{position:2,content:'<p>One<p>Two</p></p>'}]};
 assert.equal(textFromSourcePage(p,parseFragment),'A & B\nOne\nTwo');
});

test('仅来源文本页可使用明确标识的空白画布',()=>{
 const blank={...m,pages:[m.pages[0],{...m.pages[1],crop_id:null,template_id:24,image:{file:'images/page-002.png',origin:'generated_blank',sha256:'48adf731778c963b0454d72cff3a7e35973f5ca9372e1fd749e14c73379e2691'}}]};
 assert.doesNotThrow(()=>validateManifest(blank,d));
 blank.pages[1].template_id=5;assert.throws(()=>validateManifest(blank,d));
});
