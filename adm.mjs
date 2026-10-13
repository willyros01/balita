/* Wire Amazon ADM sender. Server side ONLY; never bundled in Android APK.
 * Only enabled for Fire subscriptions with provider='adm'.
 */
export const TOKEN_URL="https://api.amazon.com/auth/O2/token";
export const SEND_BASE="https://api.amazon.com/messaging/registrations/";
export async function accessToken(fetcher,clientId,clientSecret){
  if(!clientId||!clientSecret)throw Error("ADM sender credentials unavailable");
  const params=new URLSearchParams({
    grant_type:"client_credentials",scope:"messaging:push",
    client_id:clientId,client_secret:clientSecret
  });
  const res=await fetcher(TOKEN_URL,{
    method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},
    body:params.toString(),signal:AbortSignal.timeout(12000)
  });
  if(!res.ok)throw Error("Amazon ADM OAuth failed HTTP "+res.status);
  const body=await res.json();
  if(!body.access_token||String(body.token_type||"").toLowerCase()!=="bearer")
    throw Error("Amazon ADM OAuth did not return a valid token");
  return body.access_token;
}
export async function sendADM(fetcher,registrationId,token,data){
  if(!registrationId||!token)throw Error("Missing Amazon registration or OAuth token");
  if(!/^[a-z0-9-]{1,100}$/i.test(data?.articleId||""))
    throw Error("Invalid article id for ADM");
  const res=await fetcher(SEND_BASE+encodeURIComponent(registrationId)+"/messages",{
    method:"POST",signal:AbortSignal.timeout(12000),
    headers:{
      Authorization:"Bearer "+token,
      "Content-Type":"application/json",
      Accept:"application/json",
      "X-Amzn-Type-Version":"com.amazon.device.messaging.ADMMessage@1.0",
      "X-Amzn-Accept-Type":"com.amazon.device.messaging.ADMSendResult@1.0"
    },
    body:JSON.stringify({data,expiresAfter:1800,priority:"high"})
  });
  if(res.ok)return {ok:true,unregistered:false};
  const body=await res.json().catch(()=>({}));
  return {ok:false,status:res.status,
    unregistered:res.status===400&&body.reason==="Unregistered"};
}
