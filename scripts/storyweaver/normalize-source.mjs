import {createRequire} from 'node:module';
import {textFromSourcePage} from './publication.mjs';
const {parseFragment}=createRequire(new URL('../../apps/api-core/package.json',import.meta.url))('parse5');
let text='';for await(const chunk of process.stdin)text+=chunk;
const raw=JSON.parse(text);
process.stdout.write(JSON.stringify(Object.fromEntries(raw.map(page=>[page.position,textFromSourcePage(page,parseFragment)]))));
