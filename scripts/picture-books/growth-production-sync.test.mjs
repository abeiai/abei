import assert from 'node:assert/strict';
import test from 'node:test';
import {growthSyncTables,planGrowthSyncRow,validateGrowthSyncInventory,assertGrowthStoredR2Url} from './growth-production-sync.mjs';

test('成长绘本同步只接受完整的四册、53图、52音频和五条正式审核',()=>{
  const inventory={tables:Object.fromEntries(growthSyncTables.map(name=>[name,[]])),images:Array.from({length:53},(_,i)=>({key:`image-${i}`})),audio:Array.from({length:52},(_,i)=>({key:`audio-${i}`}))};
  const counts={media_assets:53,audio_assets:52,picture_books:4,course_material_publications:4,courses:1,course_revisions:1,course_revision_items:4,course_review_requests:5,admin_operation_logs:5};
  for(const [name,count] of Object.entries(counts))inventory.tables[name]=Array.from({length:count},(_,i)=>({id:`${name}-${i}`}));
  assert.doesNotThrow(()=>validateGrowthSyncInventory(inventory));
  inventory.tables.audio_assets.pop();
  assert.throws(()=>validateGrowthSyncInventory(inventory),/不完整/);
});

test('同步重跑只复用逐字段相同的行，拒绝修改线上行',()=>{
  const row={id:'source',status:'APPROVED',createdAt:'2026-10-10T08:00:00.000Z'};
  assert.equal(planGrowthSyncRow(null,row),'INSERT');
  assert.equal(planGrowthSyncRow(structuredClone(row),row),'REUSE');
  assert.throws(()=>planGrowthSyncRow({...row,status:'PENDING'},row),/冲突/);
});

test('素材验真只能读取指定 R2 前缀，不能回退到外部图片或语音 URL',()=>{
 assert.doesNotThrow(()=>assertGrowthStoredR2Url('https://r.abeiai.com/picture-books/example.webp','image'));
 assert.doesNotThrow(()=>assertGrowthStoredR2Url('https://r.abeiai.com/picture-books/audio/example.mp3','audio'));
 for(const url of ['https://outside.example/picture-books/example.webp','https://r.abeiai.com.evil.example/picture-books/example.webp','https://r.abeiai.com/picture-books/example.webp?copy=1'])assert.throws(()=>assertGrowthStoredR2Url(url,'image'),/R2/);
 assert.throws(()=>assertGrowthStoredR2Url('https://outside.example/audio.mp3','audio'),/R2/);
});
