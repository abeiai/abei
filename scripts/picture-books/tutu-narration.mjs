import {open,unlink} from 'node:fs/promises';
export async function acquireNarrationLock(file){
 const handle=await open(file,'wx',0o600);
 await handle.writeFile(JSON.stringify({pid:process.pid,startedAt:new Date().toISOString()}));
 await handle.close();
 return ()=>unlink(file);
}
export const narrationVoice='Chinese (Mandarin)_Straightforward_Boy';
export const narrationModel='speech-2.8-hd';
export const narrationSpeed=0.94;
export const canRetryRateLimit=response=>response?.base_resp?.status_code===1002&&/RPM/.test(response.base_resp.status_msg??'')&&!response?.data?.audio;
export const pronunciationRules=[
 ['302','san1 ling2 er4'],['拧开','ning3 kai1'],['拧一拧','ning3 yi4 ning3'],['量一量','liang2 yi4 liang2'],
 ['水阀','shui3 fa2'],['蹿了','cuan1 le5'],['小爪','xiao3 zhua3'],['攥着','zuan4 zhe5'],['扎进','zha1 jin4'],
 ['槐树','huai2 shu4'],['横枝','heng2 zhi1'],['班长','ban1 zhang3'],['打转','da3 zhuan4'],
 ['呱呱','gua1 gua1'],['贝壳','bei4 ke2'],['脊背','ji3 bei4'],['雨靴','yu3 xue1'],
 ['扑嗒','pu1 da1'],['窸窣','xi1 su1'],['米娅','mi3 ya4'],['扎疼','zha1 teng2'],['膝上','xi1 shang4'],
 ['浆果','jiang1 guo3'],['转向','zhuan3 xiang4'],['铁桦','tie3 hua4'],['挣开','zheng4 kai1'],
 ['树干','shu4 gan4'],['冠军','guan4 jun1'],['一个结','yi2 ge5 jie2'],['转动','zhuan4 dong4'],
 ['奥利','ao4 li4'],['银笛','yin2 di2'],['石缝','shi2 feng4'],['藏得','cang2 de5'],['晃着','huang4 zhe5'],
 ['倒挂','dao4 gua4'],['果蝠','guo3 fu2'],['哈欠','ha1 qian5'],['长椅','chang2 yi3'],['夹紧','jia1 jin3'],
 ['绿绒','lv4 rong2'],['青苔','qing1 tai2'],['工坊','gong1 fang2'],['长长','chang2 chang2'],
 ['锯好','ju4 hao3'],['磨圆','mo2 yuan2'],['通风处','tong1 feng1 chu4'],['干透','gan1 tou4'],
 ['壳壳','ke2 ke2'],['树荫','shu4 yin1']
];
export const pronunciationFor=text=>pronunciationRules.filter(([word])=>text.includes(word)).map(([word,pinyin])=>word+'/'+pinyin.split(' ').map(p=>'('+p+')').join(''));
export function buildNarrationJobs(series){
 return series.books.flatMap(b=>[{key:String(b.seriesNumber).padStart(2,'0')+':cover',book:b.seriesNumber,position:0,text:series.title+'。'+b.title+'。'},...b.pages.map(p=>({key:String(b.seriesNumber).padStart(2,'0')+':'+String(p.position).padStart(2,'0'),book:b.seriesNumber,position:p.position,text:p.narration}))]).map(j=>({...j,pronunciation:pronunciationFor(j.text)}));
}
export function planAudioResume(previous,inputHash,fileHash){
 if(!previous)return 'GENERATE';
 if(previous.status!=='READY')throw Error('付费请求结果尚未确认，禁止自动重试');
 if(previous.inputHash!==inputHash || previous.sha256!==fileHash)throw Error('文稿、配音参数或已完成文件发生变化');
 return 'REUSE';
}
