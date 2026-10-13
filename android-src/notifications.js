/* Native Wire push opt-in. Runs only when WirePush A3L bridge is compiled.
 * Both Fire/ADM and Google/FCM publish same Firestore document schema.
 * No administrator OAuth/ADM server secrets are ever shipped in this APK.
 */
import { PUSH_FIREBASE } from './config.js';
import { VERSION } from './version.js';
const KEY='wire.push.android.enabled.v1';
const AUTH_FILE='wire-native-auth.json';
const PROJECT='wire-news-6da5a';
const fs=()=>window.Capacitor?.Plugins?.Filesystem;
const native=()=>window.Capacitor?.Plugins?.WirePush;
const base='https://firestore.googleapis.com/v1/projects/'+PROJECT+'/databases/(default)/documents/pushSubscriptions/';
let busy=false;
let tokenType='';
const getEnabled=()=>localStorage.getItem(KEY)==='true';
const setEnabled=v=>localStorage.setItem(KEY,String(Boolean(v)));
async function readAuth(){
 try{return JSON.parse((await fs().readFile({path:AUTH_FILE,directory:'DATA',encoding:'utf8'})).data);}
 catch(e){return null;}
}
async function writeAuth(a){
 await fs().writeFile({path:AUTH_FILE,directory:'DATA',encoding:'utf8',
   data:JSON.stringify({uid:a.uid,refreshToken:a.refreshToken}),recursive:true});
}
async function responseJSON(url,opts){
 const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),12000);
 try{
   const res=await fetch(url,{...opts,signal:ctrl.signal});
   const data=await res.json().catch(()=>({}));
   if(!res.ok||data.error)throw Error('Notification account request failed (HTTP '+res.status+')');
   return data;
 }finally{clearTimeout(timer);}
}
async function authSession(){
 const apiKey=PUSH_FIREBASE?.apiKey;
 if(!apiKey)throw Error('Wire Firebase registration is unavailable');
 const prev=await readAuth();
 if(prev?.refreshToken&&prev.uid){
   const form=new URLSearchParams({grant_type:'refresh_token',refresh_token:prev.refreshToken});
   try{
     const next=await responseJSON('https://securetoken.googleapis.com/v1/token?key='+encodeURIComponent(apiKey),
       {method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:form});
     if(next.user_id!==prev.uid)throw Error('Native device identity changed');
     const session={uid:prev.uid,idToken:next.id_token,refreshToken:next.refresh_token};
     await writeAuth(session);
     return session;
   }catch(e){throw Error('Could not renew this device notification identity. Try again later.');}
 }
 const created=await responseJSON('https://identitytoolkit.googleapis.com/v1/accounts:signUp?key='+encodeURIComponent(apiKey),
   {method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({returnSecureToken:true})});
 if(!created.localId||!created.idToken||!created.refreshToken)throw Error('Incomplete new notification identity');
 const session={uid:created.localId,idToken:created.idToken,refreshToken:created.refreshToken};
 // Persist identity BEFORE inserting subscription to prevent unremovable duplicates.
 await writeAuth(session);
 return session;
}
async function setSubscription(enabled,address){
 const session=await authSession();
 const url=base+encodeURIComponent(session.uid);
 if(!enabled){
   const resp=await fetch(url,{method:'DELETE',
     headers:{Authorization:'Bearer '+session.idToken}});
   if(!resp.ok&&resp.status!==404)throw Error('Could not remove native notification subscription (HTTP '+resp.status+')');
   return;
 }
 if(!address||!['adm','fcm'].includes(address.provider)||!address.token)
   throw Error('No supported native push provider registration');
 const date=new Date().toISOString();
 const fields={
   token:{stringValue:address.token},provider:{stringValue:address.provider},
   enabled:{booleanValue:true},appVersion:{stringValue:VERSION},
   updatedISO:{stringValue:date},platform:{stringValue:'android'}
 };
 const result=await responseJSON(url,{
   method:'PATCH',headers:{Authorization:'Bearer '+session.idToken,'Content-Type':'application/json'},
   body:JSON.stringify({fields})
 });
 if(result.name!==('projects/'+PROJECT+'/databases/(default)/documents/pushSubscriptions/'+session.uid))
   throw Error('Wrong native subscription was saved');
 tokenType=address.provider;
}
export function setup({announce,onTap}){
 const button=document.getElementById('breaking-toggle');
 const status=document.getElementById('breaking-status');
 if(!button||!status)return;
 const plugin=native();
 if(!plugin||!PUSH_FIREBASE?.apiKey){
   button.disabled=true;
   button.textContent='Not available yet';
   status.textContent='Native notifications need Fire/Google credentials. News reading works.';
   return;
 }
 const paint=()=>{
   button.disabled=busy;button.setAttribute('aria-pressed',String(getEnabled()));
   button.textContent=busy?'Please wait…':getEnabled()?'Turn off':'Turn on';
   status.textContent=busy?'Updating…':getEnabled()?
     'Notifications on'+(tokenType?' ('+tokenType.toUpperCase()+')':'')+'.':
     'Notifications off.';
 };
 paint();
 onTap(button,async()=>{
   if(busy)return;
   busy=true;paint();
   try{
     if(getEnabled()){
       await setSubscription(false);
       setEnabled(false);tokenType='';
       announce('Notifications turned off.','done');
     }else{
       const address=await plugin.register(); // Android 13 permission prompt
       await setSubscription(true,address);
       setEnabled(true);
       announce('Native notifications turned on.','done');
     }
   }catch(e){announce(String(e.message||'Could not update notifications'),'warn');}
   finally{busy=false;paint();}
 });
 // Only refresh a previously opt-in registration. Never pop up a
 // system notification permission prompt on passive resume/startup.
 // If revoked at OS level, show failure instead of pretending ON.
 let lastRefresh=0;
 const refresh=async()=>{
   if(!getEnabled()||busy||Date.now()-lastRefresh<5*60000)return;
   lastRefresh=Date.now();
   try{
     const address=await plugin.register();
     await setSubscription(true,address);
     paint();
   }catch(e){status.textContent='Native notification registration needs attention: '+String(e.message||e);}
 };
 // Do not automatically request permission on first launch. This
 // is only a previously enabled user's token-renewal path.
 if(getEnabled())void refresh();
 document.addEventListener('visibilitychange',()=>{
   if(document.visibilityState==='visible'&&getEnabled())void refresh();
 });
}
