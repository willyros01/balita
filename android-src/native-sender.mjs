/* Wire's opt-in native notification sender. No effects on web subscriptions.
 * This module is staged on the android branch until the native credentials
 * and real-device acceptance checks are ready for production main.
 */
const ADM_TOKEN_URL='https://api.amazon.com/auth/O2/token';
const ADM_BASE='https://api.amazon.com/messaging/registrations/';

export function providerOf(doc){
  const provider=String(doc?.provider||'web').toLowerCase();
  if(provider==='adm'||provider==='fcm'||provider==='web')return provider;
  throw Error('Unknown push provider; refusing to misroute a notification');
}
export function nativePayload(article,sourceName,now=new Date().toISOString()){
  const id=String(article.id||'');
  if(!/^[a-z0-9-]{1,100}$/i.test(id))throw Error('Invalid Wire article id');
  return {articleId:id,sourceName:String(sourceName||article.source||'Wire').slice(0,40),
    title:String(article.title||'News').slice(0,220),sentAt:now};
}
export function androidFCMMessage(token,data){
  return {message:{token,data,android:{ttl:'1800s',priority:'NORMAL'}}};
}
export async function admAccessToken(fetcher,clientId,clientSecret){
  if(!clientId||!clientSecret)throw Error('ADM OAuth credentials not configured');
  const body=new URLSearchParams({grant_type:'client_credentials',
    scope:'messaging:push',client_id:clientId,client_secret:clientSecret});
  const response=await fetcher(ADM_TOKEN_URL,{
    method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},
    body:body.toString()
  });
  if(!response.ok)throw Error('ADM authorization failed HTTP '+response.status);
  const json=await response.json();
  if(!json.access_token||json.token_type?.toLowerCase()!=='bearer')
    throw Error('ADM authorization yielded no bearer token');
  return json.access_token;
}
export async function sendADM(fetcher,token,accessToken,data){
  if(!token||!accessToken)throw Error('ADM registration/token unavailable');
  const response=await fetcher(ADM_BASE+encodeURIComponent(token)+'/messages',{
    method:'POST',
    headers:{
      Authorization:'Bearer '+accessToken,
      'Content-Type':'application/json',
      Accept:'application/json',
      'X-Amzn-Type-Version':'com.amazon.device.messaging.ADMMessage@1.0',
      'X-Amzn-Accept-Type':'com.amazon.device.messaging.ADMSendResult@1.0'
    },
    body:JSON.stringify({data,expiresAfter:1800,priority:'normal'})
  });
  if(response.ok)return {ok:true,unregistered:false};
  const payload=await response.json().catch(()=>({}));
  return {ok:false,unregistered:response.status===400&&
    payload.reason==='Unregistered',status:response.status};
}
export async function routeSend({provider,token,data,fetcher,googleAccessToken,projectId,admToken}){
  if(provider==='adm')return sendADM(fetcher,token,admToken,data);
  const msg=provider==='fcm'
    ? androidFCMMessage(token,data)
    : {message:{token,data,webpush:{headers:{TTL:'1800',Urgency:'normal'}}}};
  const response=await fetcher('https://fcm.googleapis.com/v1/projects/'+encodeURIComponent(projectId)+'/messages:send',{
    method:'POST',
    headers:{Authorization:'Bearer '+googleAccessToken,'Content-Type':'application/json'},
    body:JSON.stringify(msg)
  });
  if(response.ok)return {ok:true,unregistered:false};
  const payload=await response.json().catch(()=>({}));
  return {ok:false,status:response.status,unregistered:
    response.status===404||
    (payload.error?.details||[]).some(d=>d.errorCode==='UNREGISTERED')};
}
