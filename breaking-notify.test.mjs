import test from "node:test";
import assert from "node:assert/strict";
import {messageFor} from "./breaking-notify.mjs";
const article={id:"bbc-123",source:"bbc",title:"[BREAKING] Important"};
const when="2026-10-13T04:00:00.000Z";
test("existing unspecified-provider and explicit web payloads remain identical",()=>{
 const legacy=messageFor({token:"web-token"},article,"BBC",when);
 const explicit=messageFor({token:"web-token",provider:"web"},article,"BBC",when);
 assert.deepEqual(legacy,explicit);
 assert.deepEqual(legacy,{message:{token:"web-token",data:{
   articleId:"bbc-123",sourceName:"BBC",title:"[BREAKING] Important",sentAt:when},
   webpush:{headers:{TTL:"1800",Urgency:"normal"}}}});
 assert.equal(legacy.message.android,undefined);
});
test("Google Android FCM data-only push uses 30 minute TTL and not webpush",()=>{
 const msg=messageFor({token:"google-token",provider:"fcm"},article,"BBC",when);
 assert.deepEqual(msg.message.android,{ttl:"1800s",priority:"NORMAL"});
 assert.equal(msg.message.webpush,undefined);
 assert.equal(msg.message.data.articleId,"bbc-123");
});
test("ADM and unknown providers are not sent to FCM",()=>{
 assert.throws(()=>messageFor({token:"amzn",provider:"adm"},article,"BBC",when));
 assert.throws(()=>messageFor({token:"bogus",provider:"invalid"},article,"BBC",when));
});
