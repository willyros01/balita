import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { qualifies } from '../breaking-notify.mjs';
const source = await readFile(new URL('../sw.js', import.meta.url),'utf8');
async function push(payload, fail=false){
 const handlers={}, displays=[], records=[];
 const self={registration:{scope:'https://example.com/balita/',showNotification:async(...args)=>{displays.push(args);if(fail)throw Error('permission revoked');}},
 addEventListener:(name,fn)=>handlers[name]=fn};
 vm.runInNewContext(source,{self,URL,Response,Date,Promise,setTimeout,caches:{open:async()=>({put:async(u,r)=>records.push(await r.json())})}});
 let done;
 handlers.push({data:{json:()=>payload},waitUntil:p=>done=p});
 await done; return {displays,records};
}
test('visible plus data payload displays once and preserves exact article route',async()=>{
 const r=await push({notification:{title:'Wire test',body:'Headline'},data:{articleId:'inqn-123',title:'Headline'}});
 assert.equal(r.displays.length,1);assert.equal(r.displays[0][1].data.path,'?article=inqn-123');
 assert.ok(r.records[0].displayedAt);
});
test('legacy data-only messages still display',async()=>{
 const r=await push({data:{articleId:'inq-abc',title:'Old format'}});
 assert.equal(r.displays[0][1].body,'Old format');
});
test('display rejection is recorded distinctly from receipt',async()=>{
 const r=await push({data:{articleId:'inq-abc'}},true);
 assert.ok(r.records[0].receivedAt);assert.equal(r.records[0].error,'permission revoked');
 assert.equal(r.records[0].displayedAt,undefined);
});
test('source and publisher gates remain strict',()=>{
 assert.equal(qualifies({source:'inqn',title:'BREAKING: test'}),true);
 assert.equal(qualifies({source:'guardian',title:'BREAKING: test'}),false);
 assert.equal(qualifies({source:'inqn',title:'An ordinary headline'}),false);
});
