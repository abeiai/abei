import {createHash} from 'node:crypto';
const hash=b=>createHash('sha256').update(b).digest('hex');
export async function persistDeterministicAsset(adapter,{sourceId,key,owner,bytes,mime,sha256}){
 if(!Number.isSafeInteger(sourceId)||sourceId<1||!/^(page-\d+|library)$/.test(key)||!owner||!Buffer.isBuffer(bytes)||!bytes.length||bytes.length>10*1024*1024||hash(bytes)!==sha256||!['image/png','image/jpeg','image/webp'].includes(mime))throw Error('素材参数无效');
 const ext=mime==='image/jpeg'?'jpg':mime==='image/webp'?'webp':'png';
 const filename=`storyweaver-${sourceId}-${key}-${sha256.slice(0,32)}.${ext}`,objectKey=`picture-books/${filename}`,url=`https://r.abeiai.com/${objectKey}`;
 const id=`swasset-${createHash('sha256').update(`${sourceId}\0${key}\0${sha256}`).digest('hex').slice(0,40)}`;
 const expected={id,filename,originalName:filename,mimeType:mime,size:bytes.length,url,mediaType:'IMAGE',sourceType:'WEB_FETCHED',storageProvider:'S3',createdByUserId:owner,createdByAdminId:null};
 let found=await adapter.get(objectKey);
 if(found===null){await adapter.put(objectKey,bytes,mime);found=await adapter.get(objectKey)}
 if(!found||found.length!==bytes.length||hash(found)!==sha256)throw Error('对象存储素材内容冲突');
 let row=await adapter.find(id);
 if(!row){try{row=await adapter.create(expected)}catch(e){row=await adapter.find(id);if(!row)throw e}}
 for(const [k,v] of Object.entries(expected))if(row[k]!==v)throw Error('素材记录不一致: '+k);
 return {id,url,sha256,bytes:bytes.length};
}
