import {createHash} from 'node:crypto';
export const courseId='68b3163f3dc48403ce7a6408',ownerId='abei-lele-studio',adminId='cmupmv9tf000196lgbh9s8wf0';
export const bookIds=Array.from({length:20},(_,i)=>`abei-encyclopedia-${String(i+1).padStart(2,'0')}`);
export const sha256=b=>createHash('sha256').update(b).digest('hex');
export function canonical(value){
 if(value instanceof Date)return value.toISOString();
 if(typeof value==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z?$/.test(value))return new Date(value.endsWith('Z')?value:value+'Z').toISOString();
 if(Array.isArray(value))return value.map(canonical);
 if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));
 return value;
}
export const digest=v=>sha256(JSON.stringify(canonical(v)));
export function assertSame(a,b,message='已有内容变化，停止覆盖'){if(digest(a)!==digest(b))throw Error(message);}
export const contentRows=rows=>rows.map(({createdAt,updatedAt,...row})=>row).sort((a,b)=>a.id.localeCompare(b.id));
export const pinnedItems=rows=>rows.map(({id,revisionId,createdAt,updatedAt,...row})=>row).sort((a,b)=>a.sortOrder-b.sortOrder);
export const courseInput=r=>({name:r.name,summary:r.summary,tags:r.tags,coverMediaId:r.coverMediaId,items:r.items.map(i=>({materialType:i.materialType,materialId:i.pictureBookId,displayName:i.displayName}))});
export function assertCoverOnly(before,after){const {coverMediaId:a,...x}=before,{coverMediaId:b,...y}=after;if(!b||a===b)throw Error('没有新封面');assertSame(x,y,'修订超出封面范围');}
export function bindTransaction(service,transaction){const scoped=Object.create(service);scoped.prisma=new Proxy(transaction,{get(target,key){if(key==='$transaction')return callback=>callback(transaction);const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}});return scoped;}
