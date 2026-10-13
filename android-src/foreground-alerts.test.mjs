import assert from "node:assert/strict";
import test from "node:test";
import {POLL_MS,FRESH_MS,qualifies,idsOf,discover,trimIds} from "./foreground-alerts.mjs";
const T=Date.parse("2026-10-13T12:00:00Z");
const a=(id,title="BREAKING: Important news",age=60000,source="bbc")=>({id,title,source,published:new Date(T-age).toISOString()});
test("polls every two minutes while visible",()=>assert.equal(POLL_MS,120000));
test("uses the same publisher-approved breaking marker rules as live web push",()=>{
 assert.equal(qualifies(a("bbc-1")),true);
 assert.equal(qualifies(a("bbc-2","[JUST IN] News")),true);
 assert.equal(qualifies(a("bbc-3","LIVE: News")),true);
 assert.equal(qualifies(a("bbc-4","Some breaking news")),false);
 assert.equal(qualifies(a("star-1","BREAKING: News",1,"star")),false);
 assert.equal(qualifies(a("../bad")),false);
});
test("first start baselines without alerting old known news",()=>{
 const existing=[a("bbc-old"),a("bbc-older","URGENT: Older",5000)];
 assert.deepEqual(discover(existing,idsOf(existing),T).alerts,[]);
});
test("alerts on exactly one new story and never repeats the article",()=>{
 const existing=[a("bbc-1")];
 const first=discover([...existing,a("bbc-2","[BREAKING] Second")],idsOf(existing),T);
 assert.deepEqual(first.alerts.map(x=>x.id),["bbc-2"]);
 assert.deepEqual(discover([...existing,a("bbc-2","[BREAKING] Second")],first.seen,T).alerts,[]);
});
test("rejects stale, future, invalid times and unapproved sources",()=>{
 const input=[a("cbc-stale","BREAKING: Expired",FRESH_MS+1,"cbc"),a("bbc-future","BREAKING: Future",-100,"bbc"),
 {id:"gma-empty",title:"JUST IN: Today",source:"gma"},a("mb","BREAKING: Wrong source",1,"mb")];
 const result=discover(input,[],T);
 assert.equal(result.alerts.length,0);
 assert.equal(result.seen.length,2);
});
test("bounded and deterministic history; duplicates only alert once",()=>{
 const ids=Array.from({length:2000},(_,i)=>"bbc-"+i);
 assert.equal(trimIds(ids).length,1500);
 assert.equal(trimIds(["bbc-1","bbc-1"]).length,1);
 assert.deepEqual(discover([a("bbc-1"),a("bbc-1")],[],T).alerts.map(x=>x.id),["bbc-1"]);
 assert.deepEqual(discover([a("bbc-2","BREAKING: New",1000),a("bbc-1","BREAKING: Old",2000)],[],T).alerts.map(x=>x.id),["bbc-1","bbc-2"]);
});
