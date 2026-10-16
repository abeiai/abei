import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {books,bookId,buildBookRecord,sha256,seriesTitle,seriesSummary} from './encyclopedia-publication.mjs';
const args=Object.fromEntries(process.argv.slice(2).map(a=>{const p=a.indexOf('=');return [a.slice(0,p),a.slice(p+1)]}));
const base=args['--base'];
assert.ok(['http://localhost:3600','https://new.abeiai.com'].includes(base));
const c=JSON.parse(await readFile(args['--checkpoint']));assert.equal(c.series,seriesTitle);assert.ok(c.courseId);
const json=async path=>{const r=await fetch(base+path,{signal:AbortSignal.timeout(30000)});assert.equal(r.status,200,path);const b=await r.json();assert.equal(b.code,0,path);return b.data;};
const health={};for(const path of ['/api/health','/api/health/db','/api/health/redis','/api/system-config/public']){await json(path);health[path]='PASS';}
const course=await json('/api/public/courses/'+c.courseId);assert.equal(course.name,seriesTitle);assert.equal(course.summary,seriesSummary);assert.equal(course.coverUrl,c.assets.resource.url);assert.equal(course.items.length,20);assert.ok(course.items.every(x=>x.launchHref));
const counts=[];
for(const b of books){const data=await json('/api/public/picture-books/'+bookId(b.slug)+'/play');const expected=buildBookRecord(b,Array.from({length:21},(_,i)=>c.assets[`image:${b.slug}:${i}`].url));assert.equal(data.title,expected.title);assert.equal(data.aspectRatio,'1:1');assert.equal(data.isSpread,false);assert.equal(data.pages.length,21);for(const [i,p] of data.pages.entries()){assert.equal(p.position,i);assert.equal(p.caption,expected.pages[i].caption);assert.equal(p.imageUrl,expected.pages[i].imageUrl);assert.equal(p.textInImage,true);assert.equal(p.audioUrl,null);}counts.push({id:data.id,pages:21});}
const albumData=await json('/api/public/picture-books/albums');const albums=Array.isArray(albumData)?albumData:albumData.items;assert.ok(albums.some(x=>x.id===c.courseId&&x.bookCount===20&&x.coverUrl===c.assets.resource.url));
const sampleKeys=['resource','image:01:1','image:20:20'];for(const key of sampleKeys){const r=await fetch(c.assets[key].url,{signal:AbortSignal.timeout(60000)});assert.equal(r.status,200);const bytes=Buffer.from(await r.arrayBuffer());assert.equal(sha256(bytes),c.assets[key].sha256);assert.equal(bytes.length,c.assets[key].sizeBytes);}
const report={base,href:base+'/c/'+c.courseId,books:20,readerFrames:420,audio:0,health,publicCdnSamples:sampleKeys,verifiedAt:new Date().toISOString()};if(args['--report'])await writeFile(args['--report'],JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
