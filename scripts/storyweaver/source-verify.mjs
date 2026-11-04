import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';import {verifySourcePages} from './publication.mjs';
async function request(fetcher,url,options={}){
 let last;
 for(let attempt=0;attempt<3;attempt++){
  try{const response=await fetcher(url,{...options,redirect:'error',signal:AbortSignal.timeout(20000)});if(response.ok||response.status<500&&response.status!==429)return response;last=Error('来源暂时不可用');}
  catch(error){last=error;}
  if(attempt<2)await new Promise(resolve=>setTimeout(resolve,250*(attempt+1)));
 }
 throw last;
}
export async function verifyLiveSources(manifest,detail,parseFragment,fetcher=fetch,input){
 const session=await request(fetcher,'https://storyweaver.org.in/node/api/v1/init-session');
 if(!session.ok)throw Error('无法建立来源会话');
 const cookie=(session.headers.getSetCookie?.()??[]).map(x=>x.split(';',1)[0]).find(x=>/^_session_id=[A-Za-z0-9%._~-]+$/.test(x));
 if(!cookie)throw Error('来源会话无效');
 const sourceOptions={headers:{Cookie:cookie,locale:'en'}};
 const pagesResponse=await request(fetcher,`https://storyweaver.org.in/node/api/v1/story_pages/${manifest.source_id}`,sourceOptions);
 if(!pagesResponse.ok)throw Error('无法核实来源页面');verifySourcePages(manifest,await pagesResponse.json(),parseFragment);
 const detailResponse=await request(fetcher,`https://storyweaver.org.in/node/api/v1/stories/${manifest.source_id}`,sourceOptions);
 if(!detailResponse.ok)throw Error('无法核实来源署名');const latest=(await detailResponse.json()).data;
 for(const key of ['id','name','language','level','lastPagePosition','isGif','isTranslation','isRelevelled','isAdapted','authors','illustrators','publisher','originalStory','copyrightNotice','donor','animators','calligraphers','photographers','painters'])if(JSON.stringify(latest?.[key]??null)!==JSON.stringify(detail[key]??null))throw Error('来源书籍或署名已变化：'+key);
 if(!input)return;
 for(const p of manifest.pages){
  const bytes=await readFile(input+'/'+p.image.file);if(bytes.length!==p.image.bytes||createHash('sha256').update(bytes).digest('hex')!==p.image.sha256)throw Error('输入图片哈希不一致: '+p.position);
  if(p.image.origin==='generated_blank')continue;
  if(createHash('md5').update(bytes).digest('base64')!==p.image.source_md5)throw Error('来源对象哈希不一致: '+p.position);
  const name=decodeURIComponent(new URL(p.image.url).pathname.slice('/static.storyweaver.org.in/'.length));
  const response=await request(fetcher,`https://storage.googleapis.com/storage/v1/b/static.storyweaver.org.in/o/${encodeURIComponent(name)}`);
  if(!response.ok)throw Error('无法核实来源插图 '+p.position);
  const object=await response.json();if(object.name!==name||object.md5Hash!==p.image.source_md5||Number(object.size)!==p.image.bytes)throw Error('来源对象与本地插图不一致 '+p.position);
 }
}
