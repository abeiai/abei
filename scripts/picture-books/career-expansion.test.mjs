import assert from 'node:assert/strict';
import test from 'node:test';
import * as helpers from './career-import.mjs';
import {careerSeriesBooks} from './career-series-data.mjs';

const slugs=['doctor','firefighter','teacher','nurse','police','chef','bus-driver','subway-driver','courier','sanitation-worker','architect','engineer','scientist','pilot','gardener','veterinarian'];
const books=()=>slugs.map((slug,i)=>({slug,title:'我想成为职业'+i,theme:'细心与合作',child:{name:'孩子'+i,description:'固定发型服装'},family:[{name:'家长'+i,relation:i%2?'爸爸':'妈妈',description:'固定外形'}],adultName:'师傅'+i,adultDescription:'中国城市职业工作人员，固定外形',supportingCharacters:[],story:Array.from({length:16},()=>['认识身边的职业，也学着关心别人。','Urban China scene']),pageCast:Array.from({length:17},()=>['孩子'+i,'家长'+i,'师傅'+i])}));

test('完整扩展须为原三本及指定十三职业，缺书、重复或目录改序均拒绝',()=>{
 assert.equal(typeof helpers.validateCareerExpansionBooks,'function');
 assert.doesNotThrow(()=>helpers.validateCareerExpansionBooks(books()));
 assert.throws(()=>helpers.validateCareerExpansionBooks(books().slice(0,15)),/16|完整/);
 const duplicate=books();duplicate[15].slug='nurse';assert.throws(()=>helpers.validateCareerExpansionBooks(duplicate),/目录|职业/);
 const reordered=books();[reordered[3],reordered[4]]=[reordered[4],reordered[3]];assert.throws(()=>helpers.validateCareerExpansionBooks(reordered),/目录|职业/);
});

test('新增理想属于不同孩子，家长和逐页配角必须绑定到本书固定人物',()=>{
 const duplicate=books();duplicate[4].child.name=duplicate[3].child.name;assert.throws(()=>helpers.validateCareerExpansionBooks(duplicate),/孩子|主角/);
 const unknown=books();unknown[4].pageCast[15].push('别的妈妈');assert.throws(()=>helpers.validateCareerExpansionBooks(unknown),/人物|配角/);
 const short=books();short[3].story.pop();assert.throws(()=>helpers.validateCareerExpansionBooks(short),/16|正文/);
 const parents=books();parents[3].family[0].relation='老师';assert.throws(()=>helpers.validateCareerExpansionBooks(parents),/家长/);
});

test('新职业原稿沿用正式16页加封面记录，携带孩子家长及主职业人物',()=>{
 const book=books()[3],images=Object.fromEntries(Array.from({length:17},(_,p)=>[p,'https://cdn.abei.example/nurse/'+p+'.webp']));
 const record=helpers.buildCareerBookRecord(book,'abei-lele-studio',images);
 assert.equal(record.id,'abei-career-nurse');assert.equal(record.pages.length,17);assert.equal(record.pageCount,16);assert.equal(record.aspectRatio,'3:4');assert.equal(record.characters[2].name,book.adultName);assert.equal(record.characters[2].description,book.adultDescription);
 assert.deepEqual(careerSeriesBooks.map(b=>b.slug),slugs.slice(0,3),'原三本文稿保持独立，旧发布与修订脚本不能自动扩大范围');
});

test('扩展各阶段拒绝源稿、旧公开快照、独立待审或拒绝状态漂移',()=>{
 assert.equal(typeof helpers.assertCareerExpansionMaterialState,'function');
 const record={id:'book',userId:'studio',pages:[{caption:'原稿'}]},target={hash:'expected',snapshot:{pages:record.pages}},pub={status:'APPROVED',approvedHash:'expected',approvedSnapshot:target.snapshot,currentHash:'expected',currentSnapshot:target.snapshot};
 assert.doesNotThrow(()=>helpers.assertCareerExpansionMaterialState(record,pub,null,record,target,true));
 assert.doesNotThrow(()=>helpers.assertCareerExpansionMaterialState(record,null,null,record,target,false));
 const check=(current=record,p=pub,latest=null)=>helpers.assertCareerExpansionMaterialState(current,p,latest,record,target,true);
 assert.throws(()=>check({...record,pages:[{caption:'人工新稿'}]}),/修改/);
 assert.throws(()=>check(record,{...pub,approvedSnapshot:{pages:[{caption:'另一个已批准稿'}]}}),/快照|改变/);
 assert.throws(()=>check(record,{...pub,status:'REJECTED'}),/拒绝|状态/);
 assert.throws(()=>check(record,pub,{status:'PENDING'}),/待审/);
 assert.throws(()=>check(record,pub,{status:'REJECTED'}),/拒绝/);
 assert.throws(()=>check(record,null),/原三本|公开/);
});
