import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import { narrationVoice, buildNarrationJobs, pronunciationFor, planAudioResume, canRetryRateLimit, acquireNarrationLock } from './tutu-narration.mjs';
test('concurrent paid synthesis cannot start twice',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'tutu-lock-'));const file=join(dir,'lock');
 try{const release=await acquireNarrationLock(file);await assert.rejects(()=>acquireNarrationLock(file));await release();const second=await acquireNarrationLock(file);await second();}finally{await rm(dir,{recursive:true,force:true});}
});
test('uses the explicitly requested voice and preserves visible wording',()=>{
 assert.equal(narrationVoice,'Chinese (Mandarin)_Straightforward_Boy');
 const book={seriesNumber:1,title:'没有大树的302号房',pages:[{position:1,narration:'他们量一量，拧一拧。'}]};
 const jobs=buildNarrationJobs({title:'图图来到新城市',books:[book]});
 assert.equal(jobs[1].text,book.pages[0].narration);
 assert.deepEqual(jobs.map(j=>j.key),['01:cover','01:01']);
 assert.ok(jobs[1].pronunciation.includes('量一量/(liang2)(yi4)(liang2)'));
});
test('context specific Mandarin reading controls do not change the story',()=>{
 assert.deepEqual(pronunciationFor('长椅，班长，壳壳。'),['班长/(ban1)(zhang3)','长椅/(chang2)(yi3)','壳壳/(ke2)(ke2)']);
});
test('uncertain paid requests never automatically retry',()=>{
 for(const status of ['REQUESTING','UNKNOWN','FAILED_RESPONSE']) assert.throws(()=>planAudioResume({status,inputHash:'a'},'a','a'));
 assert.throws(()=>planAudioResume({status:'READY',inputHash:'a',sha256:'b'},'a','wrong'));
 assert.throws(()=>planAudioResume({status:'READY',inputHash:'a',sha256:'b'},'changed','b'));
 assert.equal(planAudioResume({status:'READY',inputHash:'a',sha256:'b'},'a','b'),'REUSE');
 assert.equal(planAudioResume(null,'a',null),'GENERATE');
});
test('only an explicit RPM rejection without audio can be retried',()=>{
 assert.equal(canRetryRateLimit({base_resp:{status_code:1002,status_msg:'rate limit exceeded(RPM)'}}),true);
 for(const response of [{},{base_resp:{status_code:0}},{base_resp:{status_code:1002},data:{audio:'abcd'}},{base_resp:{status_code:1001}}])assert.equal(canRetryRateLimit(response),false);
});
