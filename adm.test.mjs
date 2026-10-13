import test from "node:test";
import assert from "node:assert/strict";
import {accessToken,sendADM,TOKEN_URL,SEND_BASE} from "./adm.mjs";
const payload={articleId:"bbc-123",sourceName:"BBC",title:"Breaking news",
  sentAt:"2026-10-13T16:00:00.000Z"};
test("Amazon OAuth uses client credentials only, returns bearer",async()=>{
 let url,opts;
 const token=await accessToken(async(u,o)=>{
   url=u;opts=o;return {ok:true,json:async()=>({access_token:"mock",token_type:"bearer"})}
 },"id","secret");
 assert.equal(url,TOKEN_URL);assert.equal(token,"mock");
 const params=new URLSearchParams(opts.body);
 assert.equal(params.get("grant_type"),"client_credentials");
 assert.equal(params.get("scope"),"messaging:push");
 assert.equal(params.get("client_id"),"id");assert.equal(params.get("client_secret"),"secret");
 assert.equal(opts.method,"POST");
});
test("ADM data-only message expires at 30min with exact article and high priority",async()=>{
 let url,opts;
 const r=await sendADM(async(u,o)=>{url=u;opts=o;return {ok:true}},
   "device-1","bearer",payload);
 assert.deepEqual(r,{ok:true,unregistered:false});
 assert.equal(url,SEND_BASE+"device-1/messages");
 assert.equal(opts.headers.Authorization,"Bearer bearer");
 assert.equal(opts.headers["X-Amzn-Type-Version"],"com.amazon.device.messaging.ADMMessage@1.0");
 const body=JSON.parse(opts.body);
 assert.deepEqual(body,{data:payload,expiresAfter:1800,priority:"high"});
 assert.equal(body.notification,undefined);
});
test("rejects malformed or missing identity and never leaks credentials",async()=>{
 await assert.rejects(accessToken(async()=>({ok:false,status:403}),"id","secret"),/403/);
 await assert.rejects(accessToken(async()=>({ok:true,json:async()=>({})}),"id","secret"),/valid token/);
 await assert.rejects(sendADM(async()=>({ok:true}),"device","bearer",
   {...payload,articleId:"../../path"}),/Invalid article/);
 await assert.rejects(accessToken(async()=>({ok:true}),"","secret"),/unavailable/);
});
test("only Amazon unregistered destination is eligible for removal",async()=>{
 const f=async()=>({ok:false,status:400,json:async()=>({reason:"Unregistered"})});
 const r=await sendADM(f,"device","bearer",payload);
 assert.equal(r.ok,false);assert.equal(r.unregistered,true);
 const other=await sendADM(async()=>({ok:false,status:429,json:async()=>({})}),
   "device","bearer",payload);
 assert.equal(other.unregistered,false);
});
