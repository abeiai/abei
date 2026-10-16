import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(new URL('../../apps/api-core/package.json',import.meta.url));
const sharp=require('sharp');
export const selectedCovers=JSON.parse(readFileSync(new URL('./encyclopedia-cover-data.json',import.meta.url)));
export async function libraryCover(source){
 const info=await sharp(source).metadata();
 if(info.width!==1600||info.height!==1600||info.format!=='png')throw Error('目录封面必须来自1600方形定稿');
 return sharp(source).resize(1536,1152,{fit:'contain',background:'#ffffff'}).flatten({background:'#ffffff'}).png().toBuffer();
}
