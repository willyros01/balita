import test from 'node:test';
import assert from 'node:assert/strict';
import {providerOf,nativePayload,androidFCMMessage,admAccessToken,sendADM,routeSend} from './native-sender.mjs';
test('legacy unspecified provider remains Web Push',()=>{
  assert.equal(providerOf({}), 'web');
  assert.equal(providerOf({provider:'adm'}),'adm');
  assert.equal(providerOf({provider:'fcm'}),'fcm');
  assert.throws(()=>providerOf({provider:'other'}));
});
test('Android FCM is distinct from webpush and enforces 30min TTL',()=>{
  const data=nativePayload({id:'bbc-123',title:'Breaking',source:'bbc'},'BBC');
  const msg=androidFCMMessage('token',data);
  assert.deepEqual(msg.message.android,{ttl:'1800s',priority:'NORMAL'});
  assert.equal(msg.message.webpush,undefined);
  assert.equal(data.articleId,'bbc-123');
  assert.throws(()=>nativePayload({id:'../../break',title:'x'}));
});
test('ADM request uses correct destination headers and 1800s expiry',async()=>{
  let url,options;
  const fetcher=async(u,o)=>{url=u;options=o;return {ok:true}};
  const result=await sendADM(fetcher,'amzn123','oauth',{articleId:'bbc-123',title:'Breaking',sentAt:'2026-10-12T20:00:00Z'});
  assert.equal(result.ok,true);
  assert.equal(url,'https://api.amazon.com/messaging/registrations/amzn123/messages');
  assert.equal(options.headers['X-Amzn-Type-Version'],'com.amazon.device.messaging.ADMMessage@1.0');
  assert.equal(JSON.parse(options.body).expiresAfter,1800);
  assert.equal(options.headers.Authorization,'Bearer oauth');
});
test('ADM OAuth client credentials never enter message payloads',async()=>{
 let form;
 const token=await admAccessToken(async(_,opt)=>{form=new URLSearchParams(opt.body);return {ok:true,json:async()=>({access_token:'secret-token',token_type:'bearer'})}},'client','private');
 assert.equal(token,'secret-token');
 assert.equal(form.get('scope'),'messaging:push');
});
test('provider routing maintains web notifications and sends native separately',async()=>{
 const urls=[],bodies=[];
 const fetcher=async(u,o)=>{urls.push(u);bodies.push(JSON.parse(o.body));return {ok:true}};
 const common={token:'reg',data:{articleId:'bbc-123'},fetcher,googleAccessToken:'google',projectId:'wire-news-6da5a',admToken:'amazon'};
 await routeSend({...common,provider:'web'});
 await routeSend({...common,provider:'fcm'});
 await routeSend({...common,provider:'adm'});
 assert.equal(bodies[0].message.webpush.headers.TTL,'1800');
 assert.equal(bodies[1].message.android.ttl,'1800s');
 assert.equal(bodies[2].expiresAfter,1800);
 assert.match(urls[2],/api.amazon.com/);
});
